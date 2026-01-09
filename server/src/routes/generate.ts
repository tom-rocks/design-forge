import { Router, Request, Response } from 'express';

const router = Router();

const KREA_API_BASE = 'https://api.krea.ai';

/**
 * Upload an image to Krea's asset storage
 * Returns the Krea CDN URL that can be used in generation requests
 */
async function uploadToKrea(imageUrl: string, apiKey: string): Promise<string | null> {
  try {
    // Fetch the image
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      console.log(`[Krea] Failed to fetch image: ${imageUrl}`);
      return null;
    }
    
    const imageBlob = await imageRes.blob();
    
    // Upload to Krea using FormData
    const form = new FormData();
    form.append('file', imageBlob, 'reference.png');
    
    const uploadRes = await fetch(`${KREA_API_BASE}/assets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form,
    });
    
    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      console.log(`[Krea] Asset upload failed: ${uploadRes.status} - ${errorText}`);
      return null;
    }
    
    const uploadData = await uploadRes.json() as { url?: string; asset_url?: string; id?: string };
    const kreaUrl = uploadData.url || uploadData.asset_url;
    
    if (kreaUrl) {
      console.log(`[Krea] Uploaded asset: ${kreaUrl}`);
      return kreaUrl;
    }
    
    // If we get an ID, construct the URL
    if (uploadData.id) {
      const constructedUrl = `https://assets.krea.ai/${uploadData.id}`;
      console.log(`[Krea] Constructed asset URL: ${constructedUrl}`);
      return constructedUrl;
    }
    
    console.log(`[Krea] Upload response:`, uploadData);
    return null;
  } catch (e) {
    console.error(`[Krea] Upload error:`, e);
    return null;
  }
}

/**
 * Upload multiple images to Krea in parallel
 */
async function uploadImagesToKrea(
  styleImages: StyleImage[], 
  apiKey: string,
  onProgress: (uploaded: number, total: number) => void
): Promise<{ url: string; strength: number }[]> {
  const results: { url: string; strength: number }[] = [];
  let uploaded = 0;
  
  // Upload in parallel batches of 3 to avoid overwhelming the API
  const batchSize = 3;
  for (let i = 0; i < styleImages.length; i += batchSize) {
    const batch = styleImages.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (img) => {
        const kreaUrl = await uploadToKrea(img.url, apiKey);
        uploaded++;
        onProgress(uploaded, styleImages.length);
        if (kreaUrl) {
          return { url: kreaUrl, strength: img.strength };
        }
        return null;
      })
    );
    
    results.push(...batchResults.filter((r): r is { url: string; strength: number } => r !== null));
  }
  
  return results;
}

interface StyleImage {
  url: string;
  strength: number; // -2 to 2
  name?: string; // Item display name from Highrise
}

interface Reference {
  name: string;
  images: { url: string }[];
}

interface GenerateRequest {
  prompt: string;
  resolution?: '1K' | '2K' | '4K';
  aspectRatio?: string;
  numImages?: number;
  styleImages?: StyleImage[];
  references?: Reference[];
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

// Debug endpoints
router.get('/debug/logs', (_req: Request, res: Response) => {
  res.json({
    logs: debugLogs,
    apiKey: process.env.KREA_API_KEY ? `${process.env.KREA_API_KEY.slice(0, 8)}...` : 'NOT SET',
  });
});

router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ ok: true });
});

// Streaming generation endpoint
router.post('/generate', async (req: Request, res: Response) => {
  const id = `gen-${Date.now().toString(36)}`;
  const { prompt, resolution, aspectRatio, numImages, styleImages, references } = req.body as GenerateRequest;
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  
  addLog('request', { id, prompt: prompt?.slice(0, 50), resolution, aspectRatio, numImages, hasStyleImages: !!styleImages?.length, hasReferences: !!references?.length });
  
  const apiKey = process.env.KREA_API_KEY;
  if (!apiKey) {
    send('error', { error: 'API key not configured', id });
    res.end();
    return;
  }
  if (!prompt || prompt.length < 3) {
    send('error', { error: 'Prompt must be at least 3 characters', id });
    res.end();
    return;
  }
  
  // Map resolution from frontend format
  const resolutionMap: Record<string, string> = { '1024': '1K', '2048': '2K', '4096': '4K' };
  const kreaResolution = resolutionMap[resolution || ''] || resolution || '1K';
  
  const url = `${KREA_API_BASE}/generate/image/google/nano-banana-pro`;
  
  // Build payload with all supported features
  const payload: Record<string, unknown> = {
    prompt,
    resolution: kreaResolution,
    aspectRatio: aspectRatio || '1:1',
  };
  
  // Add optional features
  if (numImages && numImages > 1 && numImages <= 4) {
    payload.numImages = numImages;
  }
  
  // Upload style images to Krea first, then use Krea CDN URLs
  if (styleImages?.length) {
    send('progress', { status: 'uploading', message: `Uploading ${styleImages.length} reference images...`, progress: 5, id });
    
    const uploadedImages = await uploadImagesToKrea(
      styleImages, 
      apiKey,
      (uploaded, total) => {
        const pct = 5 + Math.floor((uploaded / total) * 15);
        send('progress', { status: 'uploading', message: `Uploading references (${uploaded}/${total})...`, progress: pct, id });
      }
    );
    
    if (uploadedImages.length > 0) {
      payload.styleImages = uploadedImages;
      addLog('info', { id, uploadedImages: uploadedImages.length, note: 'Style images uploaded to Krea' });
    } else {
      addLog('info', { id, note: 'No images uploaded successfully, proceeding without style references' });
    }
  }
  
  if (references?.length) {
    payload.references = references;
  }
  
  send('progress', { status: 'submitting', message: 'Initializing generation...', progress: 20, id });
  
  try {
    addLog('info', { id, payload: { ...payload, styleImages: payload.styleImages ? `[${(payload.styleImages as unknown[]).length} images]` : undefined } });
    
    const submitRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const submitText = await submitRes.text();
    let submitData: Record<string, unknown> | null = null;
    try { submitData = JSON.parse(submitText); } catch { /* not json */ }
    
    addLog('response', { id, status: submitRes.status, data: submitData || submitText.slice(0, 500) });
    
    if (!submitRes.ok || !submitData?.job_id) {
      const errorMsg = submitData?.error || submitData?.message || submitData?.detail || submitText.slice(0, 200) || 'Failed to submit job';
      addLog('error', { id, error: errorMsg, payload });
      send('error', { error: errorMsg, id });
      res.end();
      return;
    }
    
    const jobId = submitData.job_id;
    send('progress', { status: 'queued', message: 'In queue...', progress: 25, id, jobId });
    
    // Poll for completion
    const maxAttempts = 90;
    const pollInterval = 2000;
    
    console.log(`[Gen ${id}] Starting poll loop for job ${jobId}`);
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check if client disconnected
      if (res.writableEnded) {
        console.log(`[Gen ${id}] Client disconnected at attempt ${attempt}`);
        return;
      }
      
      await new Promise(r => setTimeout(r, pollInterval));
      
      const pollRes = await fetch(`${KREA_API_BASE}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      
      const pollData = await pollRes.json().catch(() => null);
      if (!pollData) {
        console.log(`[Gen ${id}] Poll ${attempt}: No data`);
        continue;
      }
      
      console.log(`[Gen ${id}] Poll ${attempt}: status=${pollData.status}`);
      
      // Progress: 25-30 queued, 30-85 processing, 85-95 sampling, 95+ completing
      const statusInfo: Record<string, { message: string; progress: number }> = {
        'queued': { message: 'Waiting in queue...', progress: 25 + Math.min(attempt, 5) },
        'processing': { message: 'Generating with references...', progress: 35 + Math.min(attempt * 2, 45) },
        'sampling': { message: 'Refining details...', progress: 85 },
        'completed': { message: 'Finalizing...', progress: 95 },
      };
      const info = statusInfo[pollData.status] || { message: 'Processing...', progress: 35 };
      
      send('progress', { 
        status: pollData.status, 
        message: info.message,
        progress: info.progress,
        id, 
        jobId,
        elapsed: (attempt + 1) * 2,
      });
      
      if (pollData.status === 'completed') {
        // Handle single or multiple images
        const urls = pollData.result?.urls || [];
        if (urls.length > 0) {
          console.log(`[Gen ${id}] Completed with ${urls.length} images`);
          send('complete', { 
            success: true, 
            imageUrl: urls[0], // Primary image
            imageUrls: urls,   // All images if numImages > 1
            id, 
            jobId 
          });
          res.end();
          return;
        }
      }
      
      if (pollData.status === 'failed' || pollData.status === 'cancelled') {
        console.log(`[Gen ${id}] Job ${pollData.status}`);
        send('error', { error: `Generation ${pollData.status}`, id, jobId });
        res.end();
        return;
      }
    }
    
    console.log(`[Gen ${id}] Timed out after ${maxAttempts} attempts`);
    send('error', { error: 'Generation timed out', id, jobId });
    res.end();
    
  } catch (e) {
    send('error', { error: String(e), id });
    res.end();
  }
});

// API capabilities endpoint
router.get('/capabilities', (_req: Request, res: Response) => {
  res.json({
    model: {
      id: 'nano-banana-pro',
      name: 'Gemini Pro 3',
      description: 'Native 4K image generation with style transfer and reference support',
    },
    features: {
      resolutions: [
        { id: '1K', name: '1K (1024px)', pixels: 1024 },
        { id: '2K', name: '2K (2048px)', pixels: 2048 },
        { id: '4K', name: '4K (4096px)', pixels: 4096 },
      ],
      aspectRatios: [
        { id: '1:1', name: 'Square' },
        { id: '16:9', name: 'Landscape Wide' },
        { id: '9:16', name: 'Portrait Tall' },
        { id: '4:3', name: 'Landscape' },
        { id: '3:4', name: 'Portrait' },
        { id: '3:2', name: 'Photo Landscape' },
        { id: '2:3', name: 'Photo Portrait' },
        { id: '21:9', name: 'Ultrawide' },
        { id: '5:4', name: 'Classic' },
        { id: '4:5', name: 'Instagram' },
      ],
      numImages: { min: 1, max: 4, description: 'Generate multiple variations at once' },
      styleImages: {
        description: 'Use reference images to influence the style',
        strengthRange: { min: -2, max: 2 },
        maxImages: 4,
      },
      references: {
        description: 'Provide named reference images for context',
        example: { name: 'subject', images: [{ url: 'https://...' }] },
      },
    },
  });
});

export default router;
