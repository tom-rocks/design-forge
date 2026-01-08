import { Router, Request, Response } from 'express';

const router = Router();

// Krea API base URL
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

// In-memory debug logs (last 100 entries)
const debugLogs: DebugLog[] = [];
const MAX_DEBUG_LOGS = 100;

function addDebugLog(type: DebugLog['type'], data: unknown) {
  debugLogs.unshift({
    timestamp: new Date().toISOString(),
    type,
    data,
  });
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.pop();
  }
  console.log(`[${type.toUpperCase()}]`, JSON.stringify(data, null, 2));
}

// Helper to calculate dimensions based on resolution and aspect ratio
function getDimensions(resolution: string, aspectRatio: string): { width: number; height: number } {
  const baseSize = parseInt(resolution);
  
  const ratioMap: Record<string, [number, number]> = {
    '1:1': [1, 1],
    '16:9': [16, 9],
    '9:16': [9, 16],
    '4:3': [4, 3],
    '3:4': [3, 4],
  };
  
  const [w, h] = ratioMap[aspectRatio] || [1, 1];
  const maxDim = baseSize;
  
  if (w >= h) {
    return { width: maxDim, height: Math.round(maxDim * (h / w)) };
  } else {
    return { width: Math.round(maxDim * (w / h)), height: maxDim };
  }
}

// Gemini-focused endpoints to try (based on Krea's likely API structure)
const GEMINI_ENDPOINTS = [
  // Most likely Gemini paths
  '/generate/image/google/gemini-3-pro-image-preview',
  '/generate/image/google/gemini-pro-image',
  '/generate/image/google/gemini-3',
  '/generate/image/google/imagen-3',
  '/generate/image/google/imagen',
  '/generate/image/gemini/gemini-3-pro-image-preview',
  '/generate/image/gemini/gemini-pro',
  // Generic generation endpoint with model param
  '/v1/images/generations',
  '/generate',
];

// Debug endpoint - get logs
router.get('/debug/logs', (_req: Request, res: Response) => {
  res.json({
    logs: debugLogs,
    envCheck: {
      hasApiKey: !!process.env.KREA_API_KEY,
      apiKeyLength: process.env.KREA_API_KEY?.length || 0,
      apiKeyPreview: process.env.KREA_API_KEY 
        ? `${process.env.KREA_API_KEY.slice(0, 8)}...${process.env.KREA_API_KEY.slice(-4)}`
        : 'NOT SET',
    },
    geminiEndpoints: GEMINI_ENDPOINTS,
  });
});

// Debug endpoint - clear logs
router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ message: 'Logs cleared' });
});

// Debug endpoint - test all Gemini API endpoints
router.post('/debug/test-api', async (req: Request, res: Response) => {
  const apiKey = process.env.KREA_API_KEY;
  
  if (!apiKey) {
    res.status(500).json({ error: 'KREA_API_KEY not configured' });
    return;
  }

  addDebugLog('info', { action: 'test-gemini-endpoints', apiKeyLength: apiKey.length });

  const results: Record<string, unknown> = {};
  
  for (const endpoint of GEMINI_ENDPOINTS) {
    const url = `${KREA_API_BASE}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'test image of a cat',
          model: 'gemini-3-pro-image-preview', // Include model in body too
          width: 512,
          height: 512,
        }),
      });
      
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      let body: unknown;
      try {
        body = isJson ? await response.json() : (await response.text()).slice(0, 300);
      } catch {
        body = 'Failed to parse';
      }
      
      results[endpoint] = {
        url,
        status: response.status,
        isJson,
        body: isJson ? body : `HTML: ${String(body).slice(0, 100)}...`,
        working: isJson && response.status !== 404,
      };
      
      if (isJson) {
        addDebugLog('info', { endpoint, status: response.status, body });
      }
    } catch (e) {
      results[endpoint] = { url, error: String(e) };
    }
  }
  
  addDebugLog('response', { action: 'test-complete', results });
  res.json({ 
    results, 
    hint: 'Look for endpoints where "working" is true or status is 200/201',
    testedAt: new Date().toISOString(),
  });
});

// Main generate endpoint - focused on Gemini
router.post('/generate', async (req: Request, res: Response) => {
  const requestId = `gen-${Date.now().toString(36)}`;
  
  try {
    const { prompt, resolution, aspectRatio, negativePrompt, seed } = req.body as GenerateRequest;
    
    addDebugLog('request', { requestId, prompt: prompt?.slice(0, 100), resolution, aspectRatio });
    
    const apiKey = process.env.KREA_API_KEY;
    if (!apiKey) {
      res.status(500).json({ 
        requestId, 
        error: 'KREA_API_KEY not configured. Set it in Railway environment variables.',
      });
      return;
    }
    
    if (!prompt) {
      res.status(400).json({ requestId, error: 'Prompt is required' });
      return;
    }
    
    const { width, height } = getDimensions(resolution || '1024', aspectRatio || '1:1');
    
    // Try each Gemini endpoint until one works
    let lastError = '';
    
    for (const endpoint of GEMINI_ENDPOINTS) {
      const url = `${KREA_API_BASE}${endpoint}`;
      
      const payload = {
        prompt,
        model: 'gemini-3-pro-image-preview',
        negative_prompt: negativePrompt || undefined,
        width,
        height,
        seed: seed || undefined,
        num_images: 1,
      };
      
      addDebugLog('request', { requestId, url, payload: { ...payload, prompt: prompt.slice(0, 50) } });
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        
        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        
        if (!isJson) {
          lastError = `${endpoint}: HTML response (status ${response.status})`;
          continue;
        }
        
        const data = await response.json();
        addDebugLog('response', { requestId, endpoint, status: response.status, data });
        
        if (!response.ok) {
          lastError = `${endpoint}: ${data.error || data.message || response.statusText}`;
          // Don't continue if it's an auth error - same error on all endpoints
          if (response.status === 401 || response.status === 403) {
            res.status(response.status).json({
              requestId,
              error: 'API authentication failed. Check your KREA_API_KEY.',
              details: data,
            });
            return;
          }
          continue;
        }
        
        // Extract image URL from response
        const imageUrl = 
          data.data?.[0]?.url ||
          data.images?.[0]?.url ||
          data.images?.[0] ||
          data.result?.url ||
          data.output?.url ||
          data.url ||
          data.image ||
          data.image_url ||
          data.generation?.image_url;
        
        if (imageUrl) {
          res.json({
            success: true,
            imageUrl,
            width,
            height,
            model: 'gemini-3-pro-image-preview',
            endpoint,
            requestId,
          });
          return;
        }
        
        // Check for async job response
        if (data.id || data.job_id || data.task_id) {
          res.json({
            success: true,
            jobId: data.id || data.job_id || data.task_id,
            status: data.status || 'pending',
            message: 'Generation started (async). Polling not yet implemented.',
            requestId,
          });
          return;
        }
        
        lastError = `${endpoint}: Unexpected response format`;
        
      } catch (e) {
        lastError = `${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    
    // All endpoints failed
    res.status(500).json({
      requestId,
      error: `All Gemini endpoints failed. Last error: ${lastError}`,
      hint: 'Use the debug panel → "Test API Endpoints" to see which endpoints respond.',
      triedEndpoints: GEMINI_ENDPOINTS.length,
    });
    
  } catch (error) {
    res.status(500).json({
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get available settings
router.get('/models', (_req: Request, res: Response) => {
  res.json({
    model: {
      id: 'gemini-3-pro-image-preview',
      name: 'Gemini Pro 3',
      description: 'Google Gemini image generation via Krea',
    },
    resolutions: [
      { id: '1024', name: '1K', description: '1024px' },
      { id: '2048', name: '2K', description: '2048px' },
      { id: '4096', name: '4K', description: '4096px' },
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
