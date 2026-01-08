import { Router, Request, Response } from 'express';

const router = Router();

const KREA_API_BASE = 'https://api.krea.ai';

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

// Streaming generation endpoint with real-time progress
router.post('/generate', async (req: Request, res: Response) => {
  const id = `gen-${Date.now().toString(36)}`;
  const { prompt, resolution, aspectRatio } = req.body;
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  
  addLog('request', { id, prompt: prompt?.slice(0, 50), resolution, aspectRatio });
  
  const apiKey = process.env.KREA_API_KEY;
  if (!apiKey) {
    send('error', { error: 'KREA_API_KEY not set', id });
    res.end();
    return;
  }
  if (!prompt || prompt.length < 3) {
    send('error', { error: 'Prompt must be at least 3 characters', id });
    res.end();
    return;
  }
  
  // Map resolution
  const resolutionMap: Record<string, string> = { '1024': '1K', '2048': '2K', '4096': '4K' };
  const kreaResolution = resolutionMap[resolution] || resolution || '1K';
  
  const url = `${KREA_API_BASE}/generate/image/google/nano-banana-pro`;
  const payload = { prompt, resolution: kreaResolution, aspectRatio: aspectRatio || '1:1' };
  
  send('progress', { status: 'submitting', message: 'Submitting to Krea...', id });
  
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
    send('progress', { status: 'queued', message: 'Job queued...', id, jobId, position: submitData.position });
    
    // Poll for completion
    const maxAttempts = 90; // 3 minutes max
    const pollInterval = 2000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, pollInterval));
      
      const pollRes = await fetch(`${KREA_API_BASE}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      
      const pollData = await pollRes.json().catch(() => null);
      if (!pollData) continue;
      
      const statusMap: Record<string, string> = {
        'queued': 'Waiting in queue...',
        'processing': 'Generating image...',
        'sampling': 'Sampling...',
        'completed': 'Complete!',
      };
      
      send('progress', { 
        status: pollData.status, 
        message: statusMap[pollData.status] || pollData.status,
        id, 
        jobId,
        attempt,
        elapsed: (attempt + 1) * 2,
      });
      
      if (pollData.status === 'completed') {
        const imageUrl = pollData.result?.urls?.[0];
        if (imageUrl) {
          send('complete', { success: true, imageUrl, id, jobId });
          res.end();
          return;
        }
      }
      
      if (pollData.status === 'failed' || pollData.status === 'cancelled') {
        send('error', { error: `Job ${pollData.status}`, id, jobId });
        res.end();
        return;
      }
    }
    
    send('error', { error: 'Job timed out', id, jobId });
    res.end();
    
  } catch (e) {
    send('error', { error: String(e), id });
    res.end();
  }
});

router.get('/models', (_req: Request, res: Response) => {
  res.json({
    model: { id: 'nano-banana-pro', name: 'Gemini Pro 3', description: 'Native 4K generation' },
    resolutions: [
      { id: '1024', name: '1K' }, 
      { id: '2048', name: '2K' }, 
      { id: '4096', name: '4K' }
    ],
    aspectRatios: [
      { id: '1:1', name: 'Square' }, 
      { id: '16:9', name: 'Landscape' }, 
      { id: '9:16', name: 'Portrait' },
      { id: '4:3', name: 'Standard' }, 
      { id: '3:4', name: 'Portrait Standard' },
    ],
  });
});

export default router;
