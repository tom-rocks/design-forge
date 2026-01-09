import { Router, Request, Response } from 'express';
import sharp from 'sharp';

const router = Router();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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
 * Fetch an image and convert to base64
 */
async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    console.log(`[Gemini] Fetching image: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[Gemini] Failed to fetch image: ${response.status}`);
      return null;
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Process with sharp to add solid background (Gemini doesn't like transparent PNGs)
    // Use a neutral gray background color
    const processedBuffer = await sharp(buffer)
      .flatten({ background: { r: 88, g: 89, b: 91 } }) // #58595b gray
      .jpeg({ quality: 90 }) // Convert to JPEG for better compatibility
      .toBuffer();
    
    const base64 = processedBuffer.toString('base64');
    
    console.log(`[Gemini] Processed image: ${buffer.byteLength} -> ${processedBuffer.byteLength} bytes (JPEG with background)`);
    return { data: base64, mimeType: 'image/jpeg' };
  } catch (e) {
    console.error(`[Gemini] Error fetching/processing image:`, e);
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
  
  // Validate resolution for model
  const finalResolution = supportsHighRes ? resolution : '1K';
  if (resolution !== '1K' && !supportsHighRes) {
    console.log(`[Gen ${id}] Downgrading resolution from ${resolution} to 1K (Flash model)`);
  }
  
  send('progress', { status: 'starting', message: 'INITIALIZING GEMINI...', progress: 5, id });
  
  try {
    // Build the parts array for multimodal input
    const parts: any[] = [];
    
    // Fetch and add style images as base64
    const effectiveStyleImages = styleImages?.slice(0, maxRefs) || [];
    if (effectiveStyleImages.length > 0) {
      send('progress', { 
        status: 'loading', 
        message: `LOADING ${effectiveStyleImages.length} REFERENCE IMAGE${effectiveStyleImages.length > 1 ? 'S' : ''}...`, 
        progress: 10, 
        id 
      });
      
      let loaded = 0;
      for (const styleImg of effectiveStyleImages) {
        const imageData = await fetchImageAsBase64(styleImg.url);
        if (imageData) {
          parts.push({
            inline_data: {
              mime_type: imageData.mimeType,
              data: imageData.data,
            }
          });
          loaded++;
          const pct = 10 + Math.floor((loaded / effectiveStyleImages.length) * 15);
          send('progress', { 
            status: 'loading', 
            message: `LOADED REFERENCE ${loaded}/${effectiveStyleImages.length}...`, 
            progress: pct, 
            id 
          });
        }
      }
      
      addLog('info', { id, loadedImages: loaded, maxRefs, model: modelType });
    }
    
    // Build the prompt text
    let fullPrompt = prompt;
    
    // Add style context if we have references
    if (parts.length > 0) {
      fullPrompt = `Using these ${parts.length} reference image(s) as style inspiration, generate: ${prompt}`;
    }
    
    // Add negative prompt if provided
    if (negativePrompt?.trim()) {
      fullPrompt += `. Avoid: ${negativePrompt.trim()}`;
    }
    
    // Add the text prompt
    parts.push({ text: fullPrompt });
    
    // Build the request payload
    const payload: any = {
      contents: [{
        parts: parts,
      }],
      generationConfig: {
        responseModalities: ['IMAGE'],
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
    
    // Make parallel API calls for variations
    const generateOne = async (variationIndex: number): Promise<string[]> => {
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
      
      if (!response.ok) {
        console.error(`[Gen ${id}] Variation ${variationIndex + 1} failed: ${response.status}`);
        return [];
      }
      
      return extractImagesFromResponse(responseData);
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
