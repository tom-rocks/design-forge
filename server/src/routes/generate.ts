import { Router, Request, Response } from 'express';

const router = Router();

const KREA_API_BASE = 'https://api.krea.ai';

interface StyleImage {
  url: string;
  strength: number; // -2 to 2
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
  
  if (styleImages?.length) {
    payload.styleImages = styleImages.map(img => ({
      url: img.url,
      strength: Math.max(-2, Math.min(2, img.strength || 1)),
    }));
  }
  
  if (references?.length) {
    payload.references = references;
  }
  
  send('progress', { status: 'submitting', message: 'Initializing...', progress: 5, id });
  
  try {
    const submitRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    const submitData = await submitRes.json().catch(() => null);
    if (!submitRes.ok || !submitData?.job_id) {
      send('error', { error: submitData?.error || 'Failed to submit job', id });
      res.end();
      return;
    }
    
    const jobId = submitData.job_id;
    send('progress', { status: 'queued', message: 'In queue...', progress: 10, id, jobId });
    
    // Poll for completion
    const maxAttempts = 90;
    const pollInterval = 2000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, pollInterval));
      
      const pollRes = await fetch(`${KREA_API_BASE}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      
      const pollData = await pollRes.json().catch(() => null);
      if (!pollData) continue;
      
      const statusInfo: Record<string, { message: string; progress: number }> = {
        'queued': { message: 'Waiting in queue...', progress: 15 },
        'processing': { message: 'Generating...', progress: 30 + Math.min(attempt * 2, 50) },
        'sampling': { message: 'Refining details...', progress: 85 },
        'completed': { message: 'Finalizing...', progress: 95 },
      };
      const info = statusInfo[pollData.status] || { message: 'Processing...', progress: 30 };
      
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
        send('error', { error: `Generation ${pollData.status}`, id, jobId });
        res.end();
        return;
      }
    }
    
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
