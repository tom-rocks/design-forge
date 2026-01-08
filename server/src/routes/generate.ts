import { Router, Request, Response } from 'express';

const router = Router();

const KREA_API_BASE = 'https://api.krea.ai';

interface GenerateRequest {
  prompt: string;
  resolution: '1024' | '2048' | '4096';
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

function getDimensions(resolution: string, aspectRatio: string) {
  const base = parseInt(resolution);
  const ratios: Record<string, [number, number]> = {
    '1:1': [1, 1], '16:9': [16, 9], '9:16': [9, 16], '4:3': [4, 3], '3:4': [3, 4],
  };
  const [w, h] = ratios[aspectRatio] || [1, 1];
  return w >= h 
    ? { width: base, height: Math.round(base * (h / w)) }
    : { width: Math.round(base * (w / h)), height: base };
}

// Google models available in Krea (from their docs)
const GOOGLE_ENDPOINTS = [
  '/generate/image/google/imagen-3',
  '/generate/image/google/imagen-4',
  '/generate/image/google/imagen-4-fast',
  '/generate/image/google/imagen-4-ultra',
  '/generate/image/google/nano-banana',
  '/generate/image/google/nano-banana-pro',
];

router.get('/debug/logs', (_req: Request, res: Response) => {
  res.json({
    logs: debugLogs,
    apiKey: process.env.KREA_API_KEY ? `${process.env.KREA_API_KEY.slice(0, 8)}...` : 'NOT SET',
    endpoints: GOOGLE_ENDPOINTS,
  });
});

router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ ok: true });
});

router.post('/debug/test-api', async (_req: Request, res: Response) => {
  const apiKey = process.env.KREA_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'No API key' }); return; }

  const results: Record<string, unknown> = {};
  
  for (const endpoint of GOOGLE_ENDPOINTS) {
    const url = `${KREA_API_BASE}${endpoint}`;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test cat', width: 512, height: 512 }),
      });
      const isJson = r.headers.get('content-type')?.includes('json');
      const body = isJson ? await r.json() : (await r.text()).slice(0, 200);
      results[endpoint] = { status: r.status, isJson, body, working: isJson && r.status < 500 };
    } catch (e) {
      results[endpoint] = { error: String(e) };
    }
  }
  
  res.json({ results });
});

router.post('/generate', async (req: Request, res: Response) => {
  const id = `gen-${Date.now().toString(36)}`;
  const { prompt, resolution, aspectRatio, negativePrompt, seed } = req.body as GenerateRequest;
  
  addLog('request', { id, prompt: prompt?.slice(0, 50), resolution, aspectRatio });
  
  const apiKey = process.env.KREA_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'KREA_API_KEY not set', id }); return; }
  if (!prompt) { res.status(400).json({ error: 'Prompt required', id }); return; }
  
  const { width, height } = getDimensions(resolution || '1024', aspectRatio || '1:1');
  
  // Try each Google endpoint
  for (const endpoint of GOOGLE_ENDPOINTS) {
    const url = `${KREA_API_BASE}${endpoint}`;
    const payload = { prompt, width, height, negative_prompt: negativePrompt, seed };
    
    addLog('info', { id, trying: endpoint });
    
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!r.headers.get('content-type')?.includes('json')) continue;
      
      const data = await r.json();
      addLog('response', { id, endpoint, status: r.status, data });
      
      if (r.status === 401 || r.status === 403) {
        res.status(r.status).json({ error: 'API auth failed', id });
        return;
      }
      
      if (!r.ok) continue;
      
      // Check for job-based response (async)
      const jobId = data.id || data.job_id;
      if (jobId) {
        const result = await pollJob(apiKey, jobId, id);
        if (result.imageUrl) {
          res.json({ success: true, imageUrl: result.imageUrl, width, height, model: endpoint, id });
          return;
        }
        continue;
      }
      
      // Direct image URL
      const imageUrl = data.images?.[0]?.url || data.images?.[0] || data.url || data.image_url || data.result?.url;
      if (imageUrl) {
        res.json({ success: true, imageUrl, width, height, model: endpoint, id });
        return;
      }
    } catch (e) {
      addLog('error', { id, endpoint, error: String(e) });
    }
  }
  
  res.status(500).json({ error: 'All Google endpoints failed', id, tried: GOOGLE_ENDPOINTS.length });
});

async function pollJob(apiKey: string, jobId: string, reqId: string): Promise<{ imageUrl?: string }> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const r = await fetch(`${KREA_API_BASE}/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!r.ok) continue;
      const job = await r.json();
      addLog('info', { reqId, jobId, attempt: i, status: job.status });
      
      if (job.status === 'completed' || job.status === 'succeeded') {
        return { imageUrl: job.result?.images?.[0]?.url || job.images?.[0]?.url || job.images?.[0] };
      }
      if (job.status === 'failed') return {};
    } catch {}
  }
  return {};
}

router.get('/models', (_req: Request, res: Response) => {
  res.json({
    model: { id: 'google-imagen', name: 'Google Imagen', description: 'Google image generation via Krea' },
    resolutions: [{ id: '1024', name: '1K' }, { id: '2048', name: '2K' }, { id: '4096', name: '4K' }],
    aspectRatios: [
      { id: '1:1', name: 'Square' }, { id: '16:9', name: 'Landscape' }, { id: '9:16', name: 'Portrait' },
      { id: '4:3', name: 'Standard' }, { id: '3:4', name: 'Portrait Standard' },
    ],
  });
});

export default router;
