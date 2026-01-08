import { Router, Request, Response } from 'express';

const router = Router();

// Possible Krea API endpoints to try
const KREA_API_ENDPOINTS = {
  v1: 'https://api.krea.ai/v1',
  v2: 'https://api.krea.ai/v2', 
  direct: 'https://krea.ai/api',
  external: 'https://external.api.krea.ai',
};

interface GenerateRequest {
  prompt: string;
  resolution: '1024' | '2048' | '4096';
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  negativePrompt?: string;
  seed?: number;
}

interface DebugLog {
  timestamp: string;
  type: 'request' | 'response' | 'error';
  data: unknown;
}

// In-memory debug logs (last 50 entries)
const debugLogs: DebugLog[] = [];
const MAX_DEBUG_LOGS = 50;

function addDebugLog(type: DebugLog['type'], data: unknown) {
  debugLogs.unshift({
    timestamp: new Date().toISOString(),
    type,
    data,
  });
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.pop();
  }
  console.log(`[DEBUG ${type}]`, JSON.stringify(data, null, 2));
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

// Debug endpoint - get logs
router.get('/debug/logs', (_req: Request, res: Response) => {
  res.json({
    logs: debugLogs,
    envCheck: {
      hasApiKey: !!process.env.KREA_API_KEY,
      apiKeyPreview: process.env.KREA_API_KEY 
        ? `${process.env.KREA_API_KEY.slice(0, 8)}...${process.env.KREA_API_KEY.slice(-4)}`
        : 'NOT SET',
      nodeEnv: process.env.NODE_ENV || 'not set',
    },
  });
});

// Debug endpoint - clear logs
router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ message: 'Logs cleared' });
});

// Debug endpoint - test API connection
router.post('/debug/test-api', async (req: Request, res: Response) => {
  const apiKey = process.env.KREA_API_KEY;
  
  if (!apiKey) {
    res.status(500).json({ error: 'KREA_API_KEY not configured' });
    return;
  }

  const results: Record<string, unknown> = {};
  
  // Test each possible endpoint
  for (const [name, baseUrl] of Object.entries(KREA_API_ENDPOINTS)) {
    try {
      const testUrls = [
        `${baseUrl}/images/generations`,
        `${baseUrl}/generate`,
        `${baseUrl}/generation`,
        `${baseUrl}/models`,
      ];
      
      for (const url of testUrls) {
        try {
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          });
          
          const contentType = response.headers.get('content-type') || '';
          const isJson = contentType.includes('application/json');
          const body = isJson ? await response.json() : await response.text();
          
          results[`${name}:${url}`] = {
            status: response.status,
            statusText: response.statusText,
            contentType,
            isJson,
            bodyPreview: typeof body === 'string' ? body.slice(0, 200) : body,
          };
        } catch (e) {
          results[`${name}:${url}`] = { error: String(e) };
        }
      }
    } catch (e) {
      results[name] = { error: String(e) };
    }
  }
  
  addDebugLog('response', { action: 'test-api', results });
  res.json({ results });
});

// Generate image endpoint with extensive debugging
router.post('/generate', async (req: Request, res: Response) => {
  const requestId = Date.now().toString(36);
  
  try {
    const { prompt, resolution, aspectRatio, negativePrompt, seed } = req.body as GenerateRequest;
    
    addDebugLog('request', {
      requestId,
      body: req.body,
      headers: {
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent'],
      },
    });
    
    const apiKey = process.env.KREA_API_KEY;
    if (!apiKey) {
      const error = { requestId, error: 'KREA_API_KEY not configured in environment variables' };
      addDebugLog('error', error);
      res.status(500).json(error);
      return;
    }
    
    if (!prompt) {
      const error = { requestId, error: 'Prompt is required' };
      addDebugLog('error', error);
      res.status(400).json(error);
      return;
    }
    
    const { width, height } = getDimensions(resolution || '1024', aspectRatio || '1:1');
    
    // Try multiple API formats
    const apiFormats = [
      // Format 1: OpenAI-style
      {
        url: `${KREA_API_ENDPOINTS.v1}/images/generations`,
        body: {
          model: 'gemini-3-pro-image-preview',
          prompt,
          negative_prompt: negativePrompt || undefined,
          width,
          height,
          seed: seed || undefined,
          n: 1,
        },
      },
      // Format 2: Simple generate
      {
        url: `${KREA_API_ENDPOINTS.v1}/generate`,
        body: {
          model: 'gemini-3-pro-image-preview',
          prompt,
          negativePrompt: negativePrompt || undefined,
          width,
          height,
          seed: seed || undefined,
        },
      },
      // Format 3: Krea specific
      {
        url: `${KREA_API_ENDPOINTS.direct}/generate`,
        body: {
          prompt,
          model: 'gemini-3-pro-image-preview',
          settings: {
            width,
            height,
            negativePrompt: negativePrompt || undefined,
            seed: seed || undefined,
          },
        },
      },
    ];

    let lastError: string = '';
    
    for (const format of apiFormats) {
      addDebugLog('request', {
        requestId,
        attempt: format.url,
        payload: format.body,
      });
      
      try {
        const response = await fetch(format.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(format.body),
        });
        
        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        
        addDebugLog('response', {
          requestId,
          url: format.url,
          status: response.status,
          statusText: response.statusText,
          contentType,
          isJson,
        });
        
        if (!isJson) {
          const htmlPreview = (await response.text()).slice(0, 500);
          lastError = `API returned HTML instead of JSON (status ${response.status}). Preview: ${htmlPreview}`;
          addDebugLog('error', { requestId, url: format.url, error: lastError });
          continue;
        }
        
        const data = await response.json();
        addDebugLog('response', { requestId, url: format.url, data });
        
        if (!response.ok) {
          lastError = data.error || data.message || `API error: ${response.status}`;
          continue;
        }
        
        // Try to extract image URL from various response formats
        const imageUrl = 
          data.data?.[0]?.url ||
          data.images?.[0]?.url ||
          data.result?.url ||
          data.output?.url ||
          data.url ||
          data.image;
        
        if (imageUrl) {
          res.json({
            success: true,
            imageUrl,
            width,
            height,
            debug: { requestId, format: format.url },
          });
          return;
        }
        
        // If job-based, return job info for polling
        if (data.id || data.jobId) {
          res.json({
            success: true,
            jobId: data.id || data.jobId,
            status: data.status || 'pending',
            width,
            height,
            debug: { requestId, format: format.url, response: data },
          });
          return;
        }
        
        lastError = `Unexpected response format: ${JSON.stringify(data)}`;
      } catch (e) {
        lastError = `Request failed: ${e instanceof Error ? e.message : String(e)}`;
        addDebugLog('error', { requestId, url: format.url, error: lastError });
      }
    }
    
    // All attempts failed
    const errorResponse = {
      error: lastError || 'All API attempts failed',
      requestId,
      hint: 'Check /api/debug/logs for detailed information',
    };
    addDebugLog('error', errorResponse);
    res.status(500).json(errorResponse);
    
  } catch (error) {
    const errorResponse = {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      requestId,
    };
    addDebugLog('error', errorResponse);
    res.status(500).json(errorResponse);
  }
});

// Get available models (for future use)
router.get('/models', async (_req: Request, res: Response) => {
  res.json({
    models: [
      { id: 'gemini-3-pro-image-preview', name: 'Gemini Pro 3', description: 'High-quality image generation up to 4K' },
    ],
    resolutions: [
      { id: '1024', name: '1K', description: '1024x1024' },
      { id: '2048', name: '2K', description: '2048x2048' },
      { id: '4096', name: '4K', description: '4096x4096' },
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
