import { Router, Request, Response } from 'express';

const router = Router();

const KREA_API_BASE = 'https://api.krea.ai';

interface GenerateRequest {
  prompt: string;
  resolution: '1K' | '2K' | '4K';
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  negativePrompt?: string;
  seed?: number;
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

// Debug endpoint - get logs
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

router.post('/debug/test-api', async (_req: Request, res: Response) => {
  const apiKey = process.env.KREA_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'No API key' }); return; }

  const url = `${KREA_API_BASE}/generate/image/google/nano-banana-pro`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test cat', resolution: '1K', aspectRatio: '1:1' }),
    });
    const text = await r.text();
    let body: unknown = text;
    try { body = JSON.parse(text); } catch {}
    res.json({ status: r.status, body });
  } catch (e) {
    res.json({ error: String(e) });
  }
});

// Main generation endpoint
router.post('/generate', async (req: Request, res: Response) => {
  const id = `gen-${Date.now().toString(36)}`;
  const { prompt, resolution, aspectRatio } = req.body as GenerateRequest;
  
  addLog('request', { id, prompt: prompt?.slice(0, 50), resolution, aspectRatio });
  
  const apiKey = process.env.KREA_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'KREA_API_KEY not set', id }); return; }
  if (!prompt || prompt.length < 3) { res.status(400).json({ error: 'Prompt must be at least 3 characters', id }); return; }
  
  // Map resolution from frontend format to Krea format
  const resolutionMap: Record<string, string> = {
    '1024': '1K',
    '2048': '2K', 
    '4096': '4K',
  };
  const kreaResolution = resolutionMap[resolution] || resolution || '1K';
  
  const url = `${KREA_API_BASE}/generate/image/google/nano-banana-pro`;
  const payload = {
    prompt,
    resolution: kreaResolution,
    aspectRatio: aspectRatio || '1:1',
  };
  
  addLog('info', { id, url, payload });
  
  try {
    // Submit job
    const submitRes = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${apiKey}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload),
    });
    
    const submitText = await submitRes.text();
    let submitData: any;
    try { submitData = JSON.parse(submitText); } catch {
      addLog('error', { id, error: 'Invalid JSON response', body: submitText.slice(0, 500) });
      res.status(500).json({ error: 'Invalid response from Krea API', id });
      return;
    }
    
    addLog('response', { id, status: submitRes.status, data: submitData });
    
    if (!submitRes.ok) {
      res.status(submitRes.status).json({ 
        error: submitData.error || `Krea API error: ${submitRes.status}`, 
        id 
      });
      return;
    }
    
    const jobId = submitData.job_id;
    if (!jobId) {
      res.status(500).json({ error: 'No job_id in response', id, data: submitData });
      return;
    }
    
    addLog('info', { id, jobId, status: submitData.status });
    
    // Poll for completion
    const maxAttempts = 60; // 2 minutes max
    const pollInterval = 2000; // 2 seconds
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, pollInterval));
      
      const pollRes = await fetch(`${KREA_API_BASE}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      
      const pollText = await pollRes.text();
      let pollData: any;
      try { pollData = JSON.parse(pollText); } catch { continue; }
      
      addLog('info', { id, jobId, attempt, status: pollData.status });
      
      if (pollData.status === 'completed') {
        // Krea returns URLs at result.urls array
        const imageUrl = pollData.result?.urls?.[0] || pollData.result?.images?.[0]?.url || pollData.result?.url;
        if (imageUrl) {
          addLog('info', { id, completed: true, imageUrl });
          res.json({ 
            success: true, 
            imageUrl, 
            id,
            jobId,
          });
          return;
        }
        // Log if completed but no URL found
        addLog('error', { id, jobId, error: 'Completed but no image URL', result: pollData.result });
      }
      
      if (pollData.status === 'failed' || pollData.status === 'cancelled') {
        addLog('error', { id, jobId, status: pollData.status, error: pollData.error });
        res.status(500).json({ 
          error: `Job ${pollData.status}: ${pollData.error || 'Unknown error'}`, 
          id 
        });
        return;
      }
    }
    
    res.status(504).json({ error: 'Job timed out', id, jobId });
    
  } catch (e) {
    addLog('error', { id, error: String(e) });
    res.status(500).json({ error: String(e), id });
  }
});

router.get('/models', (_req: Request, res: Response) => {
  res.json({
    model: { 
      id: 'nano-banana-pro', 
      name: 'Gemini Pro 3', 
      description: 'Native 4K image generation via Krea (Nano Banana Pro)' 
    },
    resolutions: [
      { id: '1024', name: '1K', krea: '1K' }, 
      { id: '2048', name: '2K', krea: '2K' }, 
      { id: '4096', name: '4K', krea: '4K' }
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
