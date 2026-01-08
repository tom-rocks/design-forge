import { Router, Request, Response } from 'express';

const router = Router();

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
  const entry = {
    timestamp: new Date().toISOString(),
    type,
    data,
  };
  debugLogs.unshift(entry);
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
      nodeEnv: process.env.NODE_ENV || 'not set',
    },
  });
});

// Debug endpoint - clear logs
router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ message: 'Logs cleared' });
});

// All possible Krea API endpoint combinations to try
const API_ENDPOINTS = [
  // Most likely based on Krea documentation patterns
  'https://external.api.krea.ai/v1/images/generations',
  'https://external.api.krea.ai/v2/images/generations',
  'https://external.api.krea.ai/generations',
  'https://external.api.krea.ai/v1/generate',
  'https://external.api.krea.ai/generate',
  // Alternative base URLs
  'https://api.krea.ai/v1/images/generations',
  'https://api.krea.ai/v2/images/generations',
  'https://api.krea.ai/v1/generate',
  // Direct API
  'https://krea.ai/api/v1/images/generations',
  'https://krea.ai/api/generate',
];

// Debug endpoint - test all API endpoints
router.post('/debug/test-api', async (req: Request, res: Response) => {
  const apiKey = process.env.KREA_API_KEY;
  
  if (!apiKey) {
    res.status(500).json({ error: 'KREA_API_KEY not configured' });
    return;
  }

  addDebugLog('info', { action: 'test-api-start', keyLength: apiKey.length });
  
  const results: Record<string, unknown> = {};
  
  for (const endpoint of API_ENDPOINTS) {
    try {
      // Test with a minimal POST request
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'test',
          model: 'flux',
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
        body = 'Could not parse body';
      }
      
      results[endpoint] = {
        status: response.status,
        statusText: response.statusText,
        contentType,
        isJson,
        body,
      };
      
      // If we got JSON back (even if error), this might be the right endpoint
      if (isJson) {
        addDebugLog('info', { endpoint, status: response.status, message: 'Got JSON response!', body });
      }
    } catch (e) {
      results[endpoint] = { error: String(e) };
    }
  }
  
  addDebugLog('response', { action: 'test-api-complete', results });
  res.json({ results, hint: 'Look for endpoints that return JSON (even errors) - those are likely correct' });
});

// Main generate endpoint
router.post('/generate', async (req: Request, res: Response) => {
  const requestId = `req_${Date.now().toString(36)}`;
  
  try {
    const { prompt, resolution, aspectRatio, negativePrompt, seed } = req.body as GenerateRequest;
    
    addDebugLog('request', {
      requestId,
      prompt: prompt?.slice(0, 100),
      resolution,
      aspectRatio,
      hasNegativePrompt: !!negativePrompt,
      hasSeed: !!seed,
    });
    
    const apiKey = process.env.KREA_API_KEY;
    if (!apiKey) {
      const error = { requestId, error: 'KREA_API_KEY not configured. Set it in Railway environment variables.' };
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
    
    // Try each endpoint until one works
    let lastError = '';
    let successResult = null;
    
    for (const endpoint of API_ENDPOINTS) {
      // Build request body - try different formats
      const bodies = [
        // Format 1: Standard with model
        {
          prompt,
          model: 'flux', // Try flux model first as it's commonly available
          width,
          height,
          negative_prompt: negativePrompt || undefined,
          seed: seed || undefined,
        },
        // Format 2: Gemini specific
        {
          prompt,
          model: 'gemini-3-pro-image-preview',
          width,
          height,
          negative_prompt: negativePrompt || undefined,
          seed: seed || undefined,
        },
        // Format 3: Simple
        {
          prompt,
          width,
          height,
        },
      ];
      
      for (const body of bodies) {
        try {
          addDebugLog('request', { requestId, endpoint, body });
          
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(body),
          });
          
          const contentType = response.headers.get('content-type') || '';
          const isJson = contentType.includes('application/json');
          
          addDebugLog('response', {
            requestId,
            endpoint,
            status: response.status,
            contentType,
            isJson,
          });
          
          if (!isJson) {
            const htmlPreview = (await response.text()).slice(0, 200);
            lastError = `${endpoint}: HTML response (status ${response.status})`;
            addDebugLog('error', { requestId, endpoint, error: 'HTML response', preview: htmlPreview });
            continue;
          }
          
          const data = await response.json();
          addDebugLog('response', { requestId, endpoint, data });
          
          if (!response.ok) {
            lastError = `${endpoint}: ${data.error || data.message || response.statusText}`;
            continue;
          }
          
          // Try to extract image URL from various response formats
          const imageUrl = 
            data.data?.[0]?.url ||
            data.images?.[0]?.url ||
            data.images?.[0] ||
            data.result?.url ||
            data.result?.images?.[0]?.url ||
            data.output?.url ||
            data.output?.images?.[0] ||
            data.url ||
            data.image ||
            data.generation?.images?.[0]?.url;
          
          if (imageUrl) {
            successResult = {
              success: true,
              imageUrl,
              width,
              height,
              debug: { requestId, endpoint, model: body.model },
            };
            break;
          }
          
          // Check for job-based response (async generation)
          if (data.id || data.jobId || data.generation_id) {
            successResult = {
              success: true,
              jobId: data.id || data.jobId || data.generation_id,
              status: data.status || 'pending',
              message: 'Generation started. Job-based API - polling not yet implemented.',
              width,
              height,
              debug: { requestId, endpoint, response: data },
            };
            break;
          }
          
          lastError = `${endpoint}: Unexpected response format`;
          addDebugLog('error', { requestId, endpoint, error: 'Unexpected format', data });
          
        } catch (e) {
          lastError = `${endpoint}: ${e instanceof Error ? e.message : String(e)}`;
          addDebugLog('error', { requestId, endpoint, error: lastError });
        }
      }
      
      if (successResult) break;
    }
    
    if (successResult) {
      res.json(successResult);
      return;
    }
    
    // All attempts failed
    const errorResponse = {
      error: `All API endpoints failed. Last error: ${lastError}`,
      requestId,
      hint: 'Use the debug panel (bug icon) → "Test API Endpoints" to find working endpoints. Check if your API key is correct.',
      testedEndpoints: API_ENDPOINTS.length,
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

// Get available models
router.get('/models', (_req: Request, res: Response) => {
  res.json({
    models: [
      { id: 'flux', name: 'Flux', description: 'Fast, high-quality generation' },
      { id: 'gemini-3-pro-image-preview', name: 'Gemini Pro 3', description: 'Google Gemini image generation' },
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
