import { Router, Request, Response } from 'express';
import sharp from 'sharp';

const router = Router();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta';

// Available Gemini image generation models
const MODELS = {
  flash: 'gemini-2.5-flash-image',      // Fast, up to 3 refs, 1K only
  pro: 'gemini-3-pro-image-preview',    // Professional, up to 14 refs, 1K/2K/4K, Thinking
} as const;

type ModelType = keyof typeof MODELS;

interface StyleImage {
  url: string;
  strength: number;
  name?: string;
}

interface GenerateRequest {
  prompt: string;
  model?: ModelType;
  resolution?: '1K' | '2K' | '4K';
  aspectRatio?: string;
  numImages?: number;
  styleImages?: StyleImage[];
  negativePrompt?: string;
  seed?: string;
}

interface DebugLog {
  timestamp: string;
  type: 'request' | 'response' | 'error' | 'info';
  data: unknown;
}

const debugLogs: DebugLog[] = [];

function addLog(type: DebugLog['type'], data: unknown) {
  debugLogs.unshift({ timestamp: new Date().toISOString(), type, data });
  if (debugLogs.length > 100) debugLogs.pop();
  console.log(`[${type}]`, JSON.stringify(data, null, 2));
}

/**
 * Upload an image to Gemini Files API and get back a file_uri
 * This is the proper way to handle reference images
 */
async function uploadToGeminiFiles(url: string, apiKey: string): Promise<{ fileUri: string; mimeType: string } | null> {
  try {
    console.log(`[Gemini Files] Fetching image: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[Gemini Files] Failed to fetch: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Process image: flatten transparency to gray background
    const processedBuffer = await sharp(buffer)
      .flatten({ background: { r: 88, g: 89, b: 91 } })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    const mimeType = 'image/jpeg';
    const numBytes = processedBuffer.byteLength;
    const displayName = `ref-${Date.now()}`;
    
    console.log(`[Gemini Files] Uploading ${numBytes} bytes...`);
    
    // Step 1: Start resumable upload
    const startResponse = await fetch(`${GEMINI_UPLOAD_BASE}/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    });
    
    if (!startResponse.ok) {
      const errText = await startResponse.text();
      console.log(`[Gemini Files] Start upload failed: ${startResponse.status}`, errText);
      return null;
    }
    
    // Get upload URL from response header (case-insensitive)
    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      // Debug: log all headers
      const allHeaders: string[] = [];
      startResponse.headers.forEach((v, k) => allHeaders.push(`${k}: ${v}`));
      console.log(`[Gemini Files] No upload URL. Headers:`, allHeaders.join(', '));
      return null;
    }
    
    console.log(`[Gemini Files] Got upload URL: ${uploadUrl.substring(0, 50)}...`);
    
    // Step 2: Upload the actual bytes
    const uint8Array = new Uint8Array(processedBuffer);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: uint8Array,
    });
    
    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.log(`[Gemini Files] Upload failed: ${uploadResponse.status}`, errText);
      return null;
    }
    
    const fileInfo = await uploadResponse.json();
    console.log(`[Gemini Files] Upload response:`, JSON.stringify(fileInfo).substring(0, 200));
    
    const fileUri = fileInfo.file?.uri;
    if (!fileUri) {
      console.log(`[Gemini Files] No file URI in response`);
      return null;
    }
    
    console.log(`[Gemini Files] Success: ${fileUri}`);
    return { fileUri, mimeType };
  } catch (e) {
    console.error(`[Gemini Files] Error:`, e);
    return null;
  }
}

/**
 * Parse Gemini response and extract generated images
 * Note: Gemini API uses camelCase (inlineData, mimeType) not snake_case
 */
function extractImagesFromResponse(responseData: any): string[] {
  const images: string[] = [];
  
  if (!responseData?.candidates?.[0]?.content?.parts) {
    return images;
  }
  
  for (const part of responseData.candidates[0].content.parts) {
    // Gemini uses camelCase: inlineData, mimeType
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data && inlineData?.mimeType?.startsWith('image/')) {
      const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`;
      images.push(dataUrl);
    }
  }
  
  return images;
}

// Debug endpoints
router.get('/debug/logs', (_req: Request, res: Response) => {
  res.json({
    logs: debugLogs,
    geminiKey: process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.slice(0, 10)}...` : 'NOT SET',
    models: MODELS,
  });
});

router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ ok: true });
});

// Streaming generation endpoint
router.post('/generate', async (req: Request, res: Response) => {
  const id = `gen-${Date.now().toString(36)}`;
  const { 
    prompt, 
    model = 'pro',  // Default to Pro for max references
    resolution = '1K', 
    aspectRatio = '1:1', 
    numImages = 1, 
    styleImages,
    negativePrompt,
    seed,
  } = req.body as GenerateRequest;
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  
  addLog('request', { 
    id, 
    prompt: prompt?.slice(0, 50), 
    model,
    resolution, 
    aspectRatio, 
    numImages, 
    styleImagesCount: styleImages?.length || 0 
  });
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    send('error', { error: 'GEMINI_API_KEY not configured', id });
    res.end();
    return;
  }
  
  if (!prompt || prompt.length < 3) {
    send('error', { error: 'Prompt must be at least 3 characters', id });
    res.end();
    return;
  }
  
  // Validate model and get limits
  const modelType = model in MODELS ? model : 'pro';
  const modelId = MODELS[modelType as ModelType];
  const maxRefs = modelType === 'pro' ? 14 : 3;
  const supportsHighRes = modelType === 'pro';
  
  // Map client resolution values to API values
  const resolutionMap: Record<string, string> = {
    '1024': '1K', '1K': '1K',
    '2048': '2K', '2K': '2K', 
    '4096': '4K', '4K': '4K',
  };
  const mappedResolution = resolutionMap[resolution] || '1K';
  
  // Validate resolution for model
  const finalResolution = supportsHighRes ? mappedResolution : '1K';
  if (mappedResolution !== '1K' && !supportsHighRes) {
    console.log(`[Gen ${id}] Downgrading resolution from ${mappedResolution} to 1K (Flash model)`);
  }
  
  send('progress', { status: 'starting', message: 'INITIALIZING GEMINI...', progress: 5, id });
  
  try {
    // Build the parts array for multimodal input
    const parts: any[] = [];
    const imageParts: any[] = [];
    
    // Upload style images to Gemini Files API (proper way for references)
    const effectiveStyleImages = styleImages?.slice(0, maxRefs) || [];
    if (effectiveStyleImages.length > 0) {
      send('progress', { 
        status: 'uploading', 
        message: `UPLOADING ${effectiveStyleImages.length} REFERENCE IMAGE${effectiveStyleImages.length > 1 ? 'S' : ''}...`, 
        progress: 10, 
        id 
      });
      
      let uploaded = 0;
      for (const styleImg of effectiveStyleImages) {
        const fileData = await uploadToGeminiFiles(styleImg.url, apiKey);
        if (fileData) {
          // Use file_data with file_uri (not inline_data with base64)
          imageParts.push({
            file_data: {
              mime_type: fileData.mimeType,
              file_uri: fileData.fileUri,
            }
          });
          uploaded++;
          const pct = 10 + Math.floor((uploaded / effectiveStyleImages.length) * 20);
          send('progress', { 
            status: 'uploading', 
            message: `UPLOADED REFERENCE ${uploaded}/${effectiveStyleImages.length}...`, 
            progress: pct, 
            id 
          });
        }
      }
      
      addLog('info', { id, uploadedImages: uploaded, maxRefs, model: modelType });
    }
    
    // Build the prompt text
    // Per Google's Gemini 3 prompting guide:
    // - Be concise (Gemini 3 may over-analyze verbose prompts)
    // - Place instructions AFTER context/data
    // - Use "Based on the above..." pattern
    let fullPrompt = prompt;
    
    // Add style context if we have references
    // Per docs: reference images are for "objects to include" - but we want STYLE TRANSFER
    // Be VERY explicit about the style characteristics
    if (imageParts.length > 0) {
      fullPrompt = `Look at these ${imageParts.length} reference images carefully. They are digital art assets with:
- NO outlines or black lines
- Soft gradient shading
- A specific 3/4 perspective angle
- Stylized proportions

Create: ${prompt}

CRITICAL: Match the EXACT same style. No outlines. Same angle. Same soft shading. Same proportions.`;
    }
    
    // Add negative prompt if provided
    if (negativePrompt?.trim()) {
      fullPrompt += ` Avoid: ${negativePrompt.trim()}`;
    }
    
    // Text FIRST, then images (per Google's example)
    parts.push({ text: fullPrompt });
    parts.push(...imageParts);
    
    // Build the request payload
    // Note: Including both TEXT and IMAGE in responseModalities per Google's examples
    const payload: any = {
      contents: [{
        parts: parts,
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    };
    
    // Add image config for aspect ratio and resolution
    if (aspectRatio || finalResolution !== '1K') {
      payload.generationConfig.imageConfig = {};
      if (aspectRatio) {
        payload.generationConfig.imageConfig.aspectRatio = aspectRatio;
      }
      if (supportsHighRes && finalResolution !== '1K') {
        payload.generationConfig.imageConfig.imageSize = finalResolution;
      }
    }
    
    const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent`;
    
    // Determine how many variations to generate (Gemini doesn't have native numImages, so we make parallel calls)
    const variationCount = Math.min(Math.max(1, numImages || 1), 4);
    
    send('progress', { 
      status: 'generating', 
      message: variationCount > 1 ? `GENERATING ${variationCount} VARIATIONS...` : 'GENERATING IMAGE...', 
      progress: 30, 
      id 
    });
    
    addLog('info', { 
      id, 
      url,
      variations: variationCount,
      payload: {
        ...payload,
        contents: `[${parts.length} parts: ${parts.length - 1} images + 1 text]`,
      }
    });
    
    const startTime = Date.now();
    
    // Make API call with retry for 503 errors
    const generateOne = async (variationIndex: number): Promise<string[]> => {
      const maxRetries = 3;
      let lastError = '';
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(payload),
        });
        
        const responseText = await response.text();
        let responseData: any = null;
        
        try {
          responseData = JSON.parse(responseText);
        } catch {
          // Not JSON
        }
        
        // Retry on 503 (model overloaded)
        if (response.status === 503 && attempt < maxRetries) {
          const delay = attempt * 5000; // 5s, 10s, 15s
          console.log(`[Gen ${id}] 503 overloaded, retry ${attempt}/${maxRetries} in ${delay/1000}s`);
          send('progress', { status: 'retrying', message: `MODEL BUSY, RETRYING (${attempt}/${maxRetries})...`, progress: 40, id });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        if (!response.ok) {
          console.error(`[Gen ${id}] Variation ${variationIndex + 1} failed: ${response.status}`);
          addLog('error', { id, variation: variationIndex + 1, status: response.status, response: responseText.slice(0, 500) });
          return [];
        }
        
        // Log successful response structure for debugging
        const images = extractImagesFromResponse(responseData);
        if (images.length === 0) {
          addLog('info', { 
            id, 
            variation: variationIndex + 1, 
            note: 'No images in response',
            hasCandidate: !!responseData?.candidates?.[0],
            partsCount: responseData?.candidates?.[0]?.content?.parts?.length || 0,
            responsePreview: JSON.stringify(responseData).slice(0, 500)
          });
        }
        return images;
      }
      
      return [];
    };
    
    // Run all variations in parallel
    const variationPromises = Array.from({ length: variationCount }, (_, i) => generateOne(i));
    const variationResults = await Promise.all(variationPromises);
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    // Flatten results and filter out empty arrays
    const images = variationResults.flat();
    
    addLog('response', { 
      id, 
      elapsed: `${elapsed}s`,
      requestedVariations: variationCount,
      successfulImages: images.length,
    });
    
    if (images.length === 0) {
      send('error', { error: 'No images generated from any variation', id });
      res.end();
      return;
    }
    
    console.log(`[Gen ${id}] Generated ${images.length} image(s) from ${variationCount} variation(s) in ${elapsed}s`);
    
    send('progress', { status: 'complete', message: 'GENERATION COMPLETE', progress: 95, id, elapsed });
    
    send('complete', {
      success: true,
      imageUrl: images[0],
      imageUrls: images,
      id,
      model: modelType,
      elapsed,
      variations: images.length,
    });
    
    res.end();
    
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    addLog('error', { id, error: errorMsg });
    send('error', { error: errorMsg, id });
    res.end();
  }
});

// API capabilities endpoint
router.get('/capabilities', (_req: Request, res: Response) => {
  res.json({
    models: {
      flash: {
        id: MODELS.flash,
        name: 'Gemini Flash',
        description: 'Fast image generation, optimized for speed',
        maxRefs: 3,
        resolutions: ['1K'],
        speed: 'fast',
      },
      pro: {
        id: MODELS.pro,
        name: 'Gemini Pro 3',
        description: 'Professional quality with Thinking mode, up to 4K',
        maxRefs: 14,
        resolutions: ['1K', '2K', '4K'],
        speed: 'slower',
        features: ['thinking', 'google_search', 'high_fidelity'],
      },
    },
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '5:4', '4:5'],
    defaultModel: 'pro',
  });
});

export default router;
