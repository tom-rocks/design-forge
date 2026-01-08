import { Router, Request, Response } from 'express';

const router = Router();

// Krea API base URL (confirmed from docs)
const KREA_API_BASE = 'https://api.krea.ai';

interface GenerateRequest {
  prompt: string;
  resolution: '1024' | '2048' | '4096';
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  negativePrompt?: string;
  seed?: number;
  model?: string;
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

// Known Krea API endpoints based on documentation
// Format: /generate/image/{provider}/{model}
const KREA_MODELS = [
  // Flux models (confirmed working)
  { id: 'flux-1-dev', path: '/generate/image/bfl/flux-1-dev', name: 'Flux 1 Dev' },
  { id: 'flux-1-schnell', path: '/generate/image/bfl/flux-1-schnell', name: 'Flux 1 Schnell' },
  { id: 'flux-1-pro', path: '/generate/image/bfl/flux-1-pro', name: 'Flux 1 Pro' },
  // Try Gemini paths
  { id: 'gemini-image', path: '/generate/image/google/gemini-3-pro-image-preview', name: 'Gemini Pro 3' },
  { id: 'gemini-image-2', path: '/generate/image/google/gemini-pro-image', name: 'Gemini Pro' },
  // Ideogram
  { id: 'ideogram', path: '/generate/image/ideogram/ideogram-v2', name: 'Ideogram v2' },
  // Krea native
  { id: 'krea-1', path: '/generate/image/krea/krea-1', name: 'Krea 1' },
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
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    availableModels: KREA_MODELS,
  });
});

// Debug endpoint - clear logs
router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ message: 'Logs cleared' });
});

// Debug endpoint - test all API endpoints
router.post('/debug/test-api', async (req: Request, res: Response) => {
  const apiKey = process.env.KREA_API_KEY;
  
  if (!apiKey) {
    res.status(500).json({ error: 'KREA_API_KEY not configured' });
    return;
  }

  addDebugLog('info', { action: 'test-api-start', apiKeyLength: apiKey.length });

  const results: Record<string, unknown> = {};
  
  // Test each model endpoint
  for (const model of KREA_MODELS) {
    const url = `${KREA_API_BASE}${model.path}`;
    
    try {
      // Test with GET first to see if endpoint exists
      const getResponse = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      
      const getContentType = getResponse.headers.get('content-type') || '';
      
      results[model.id] = {
        url,
        getStatus: getResponse.status,
        getStatusText: getResponse.statusText,
        getContentType,
        isJsonGet: getContentType.includes('application/json'),
      };
      
      // If not 404, try POST with minimal payload
      if (getResponse.status !== 404) {
        const postResponse = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: 'test' }),
        });
        
        const postContentType = postResponse.headers.get('content-type') || '';
        const isJsonPost = postContentType.includes('application/json');
        let postBody: unknown;
        
        try {
          postBody = isJsonPost 
            ? await postResponse.json() 
            : (await postResponse.text()).slice(0, 300);
        } catch {
          postBody = 'Failed to parse body';
        }
        
        (results[model.id] as Record<string, unknown>).postStatus = postResponse.status;
        (results[model.id] as Record<string, unknown>).postContentType = postContentType;
        (results[model.id] as Record<string, unknown>).isJsonPost = isJsonPost;
        (results[model.id] as Record<string, unknown>).postBodyPreview = postBody;
      }
    } catch (e) {
      results[model.id] = { url, error: String(e) };
    }
  }
  
  // Also test the base URL
  try {
    const baseResponse = await fetch(`${KREA_API_BASE}/`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    results['base'] = {
      url: KREA_API_BASE,
      status: baseResponse.status,
      contentType: baseResponse.headers.get('content-type'),
    };
  } catch (e) {
    results['base'] = { error: String(e) };
  }
  
  addDebugLog('response', { action: 'test-api-complete', results });
  res.json({ results, testedAt: new Date().toISOString() });
});

// Generate image endpoint
router.post('/generate', async (req: Request, res: Response) => {
  const requestId = `gen-${Date.now().toString(36)}`;
  
  try {
    const { prompt, resolution, aspectRatio, negativePrompt, seed, model } = req.body as GenerateRequest;
    
    addDebugLog('request', {
      requestId,
      body: { prompt: prompt?.slice(0, 100), resolution, aspectRatio, model },
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
    
    // Select model - default to flux-1-dev which is confirmed working
    const selectedModel = KREA_MODELS.find(m => m.id === model) || KREA_MODELS[0];
    const apiUrl = `${KREA_API_BASE}${selectedModel.path}`;
    
    // Build request payload based on Krea API format
    const payload = {
      prompt,
      negative_prompt: negativePrompt || undefined,
      width,
      height,
      seed: seed || undefined,
      num_images: 1,
    };
    
    addDebugLog('request', {
      requestId,
      url: apiUrl,
      model: selectedModel.id,
      payload: { ...payload, prompt: payload.prompt.slice(0, 50) + '...' },
    });
    
    const response = await fetch(apiUrl, {
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
    
    addDebugLog('response', {
      requestId,
      status: response.status,
      statusText: response.statusText,
      contentType,
      isJson,
    });
    
    if (!isJson) {
      const htmlBody = await response.text();
      const error = {
        requestId,
        error: `API returned HTML instead of JSON (status ${response.status})`,
        htmlPreview: htmlBody.slice(0, 500),
        hint: 'The API endpoint may be incorrect. Try using the "Test API Endpoints" button in the debug panel to find working endpoints.',
        triedUrl: apiUrl,
        triedModel: selectedModel.id,
      };
      addDebugLog('error', error);
      res.status(response.status).json(error);
      return;
    }
    
    const data = await response.json();
    addDebugLog('response', { requestId, data });
    
    if (!response.ok) {
      const error = {
        requestId,
        error: data.error || data.message || `API error: ${response.status}`,
        details: data,
      };
      addDebugLog('error', error);
      res.status(response.status).json(error);
      return;
    }
    
    // Extract image URL from response (Krea returns various formats)
    const imageUrl = 
      data.data?.[0]?.url ||
      data.images?.[0]?.url ||
      data.images?.[0] ||
      data.result?.url ||
      data.result?.images?.[0] ||
      data.output?.url ||
      data.url ||
      data.image ||
      data.image_url;
    
    if (imageUrl) {
      res.json({
        success: true,
        imageUrl,
        width,
        height,
        model: selectedModel.id,
        requestId,
      });
      return;
    }
    
    // If job-based response
    if (data.id || data.job_id || data.task_id) {
      const jobId = data.id || data.job_id || data.task_id;
      addDebugLog('info', { requestId, jobId, status: 'Job created, polling not implemented yet' });
      
      res.json({
        success: true,
        jobId,
        status: data.status || 'pending',
        message: 'Generation started. Job-based polling not yet implemented.',
        width,
        height,
        requestId,
      });
      return;
    }
    
    // Unknown response format
    const error = {
      requestId,
      error: 'Unexpected response format from API',
      responseData: data,
    };
    addDebugLog('error', error);
    res.status(500).json(error);
    
  } catch (error) {
    const errorResponse = {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      stack: error instanceof Error ? error.stack : undefined,
    };
    addDebugLog('error', errorResponse);
    res.status(500).json(errorResponse);
  }
});

// Get available models
router.get('/models', (_req: Request, res: Response) => {
  res.json({
    models: KREA_MODELS.map(m => ({
      id: m.id,
      name: m.name,
      endpoint: m.path,
    })),
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
