import { Router, Request, Response } from 'express';

const router = Router();

const KREA_API_URL = 'https://api.krea.ai/v1';

interface GenerateRequest {
  prompt: string;
  resolution: '1024' | '2048' | '4096';
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  negativePrompt?: string;
  seed?: number;
}

interface KreaJobResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: {
    images: Array<{ url: string }>;
  };
  error?: string;
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

// Poll for job completion
async function pollJobStatus(jobId: string, apiKey: string, maxAttempts = 60): Promise<KreaJobResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${KREA_API_URL}/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to poll job status: ${response.statusText}`);
    }
    
    const job: KreaJobResponse = await response.json();
    
    if (job.status === 'completed') {
      return job;
    }
    
    if (job.status === 'failed') {
      throw new Error(job.error || 'Job failed');
    }
    
    // Wait 2 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  throw new Error('Job timed out');
}

// Generate image endpoint
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, resolution, aspectRatio, negativePrompt, seed } = req.body as GenerateRequest;
    
    const apiKey = process.env.KREA_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'KREA_API_KEY not configured' });
      return;
    }
    
    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }
    
    const { width, height } = getDimensions(resolution || '1024', aspectRatio || '1:1');
    
    // Create generation job with Gemini Pro 3
    const jobResponse = await fetch(`${KREA_API_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemini-3-pro-image-preview',
        prompt,
        negative_prompt: negativePrompt || undefined,
        width,
        height,
        seed: seed || undefined,
        n: 1,
      }),
    });
    
    if (!jobResponse.ok) {
      const error = await jobResponse.text();
      console.error('Krea API error:', error);
      res.status(jobResponse.status).json({ error: `Krea API error: ${error}` });
      return;
    }
    
    const jobData = await jobResponse.json();
    
    // If the API returns the image directly
    if (jobData.data && jobData.data[0]?.url) {
      res.json({ 
        success: true, 
        imageUrl: jobData.data[0].url,
        width,
        height,
      });
      return;
    }
    
    // If it's a job-based API, poll for completion
    if (jobData.id) {
      const completedJob = await pollJobStatus(jobData.id, apiKey);
      if (completedJob.result?.images?.[0]?.url) {
        res.json({ 
          success: true, 
          imageUrl: completedJob.result.images[0].url,
          width,
          height,
        });
        return;
      }
    }
    
    res.status(500).json({ error: 'Failed to generate image' });
  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    });
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
