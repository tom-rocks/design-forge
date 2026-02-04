import { Router, Request, Response } from 'express';
import sharp from 'sharp';
import crypto from 'crypto';
import { saveGeneration, getGeneration } from '../db.js';
import { saveImage, createThumbnails, getImagePath } from '../storage.js';
import fs from 'fs/promises';

const router = Router();

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta';

// ============================================================================
// SIMPLE REQUEST QUEUE
// Limits concurrent API calls to prevent rate limiting (429 errors)
// ============================================================================
const MAX_CONCURRENT = 8;
let activeTasks = 0;
const taskQueue: Array<{ task: () => Promise<any>, resolve: (value: any) => void, reject: (err: any) => void }> = [];

async function runQueued<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    taskQueue.push({ task, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  while (activeTasks < MAX_CONCURRENT && taskQueue.length > 0) {
    const item = taskQueue.shift()!;
    activeTasks++;
    item.task()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeTasks--;
        processQueue();
      });
  }
}

// Track queue stats for monitoring
let queueStats = {
  totalProcessed: 0,
  totalQueued: 0,
  peakConcurrent: 0,
  rateLimitHits: 0,
};

// Log queue status periodically
setInterval(() => {
  if (taskQueue.length > 0 || activeTasks > 0) {
    console.log(`[Queue] Active: ${activeTasks}, Waiting: ${taskQueue.length}, Total processed: ${queueStats.totalProcessed}`);
  }
}, 10000);

// ============================================================================
// API KEY POOL
// Rotates between multiple Gemini accounts to multiply rate limits
// - Round-robin distribution across available keys
// - Tracks rate-limited keys and skips them temporarily
// ============================================================================
interface KeyStatus {
  rateLimitedUntil: number;
  requestCount: number;
  lastUsed: number;
}

const API_KEYS: string[] = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
].filter((key): key is string => !!key && key.length > 0);

const keyStatus = new Map<string, KeyStatus>();
let keyIndex = 0;

// Initialize key status
API_KEYS.forEach(key => {
  keyStatus.set(key, { rateLimitedUntil: 0, requestCount: 0, lastUsed: 0 });
});

console.log(`[KeyPool] Initialized with ${API_KEYS.length} API key(s)`);

// Get the next available API key (round-robin, skipping rate-limited)
function getApiKey(): string {
  const now = Date.now();
  
  // Try each key in round-robin order
  for (let i = 0; i < API_KEYS.length; i++) {
    const idx = (keyIndex + i) % API_KEYS.length;
    const key = API_KEYS[idx];
    const status = keyStatus.get(key)!;
    
    // Skip if currently rate-limited
    if (status.rateLimitedUntil > now) {
      continue;
    }
    
    // Use this key
    keyIndex = (idx + 1) % API_KEYS.length;
    status.requestCount++;
    status.lastUsed = now;
    return key;
  }
  
  // All keys rate-limited - return the one that will be available soonest
  let soonestKey = API_KEYS[0];
  let soonestTime = Infinity;
  for (const key of API_KEYS) {
    const status = keyStatus.get(key)!;
    if (status.rateLimitedUntil < soonestTime) {
      soonestTime = status.rateLimitedUntil;
      soonestKey = key;
    }
  }
  console.log(`[KeyPool] All keys rate-limited, using key ending ...${soonestKey.slice(-4)} (available in ${Math.ceil((soonestTime - now) / 1000)}s)`);
  return soonestKey;
}

// Mark a key as rate-limited (called when we get a 429)
function markKeyRateLimited(key: string, retryAfterMs = 60000) {
  const status = keyStatus.get(key);
  if (status) {
    status.rateLimitedUntil = Date.now() + retryAfterMs;
    console.log(`[KeyPool] Key ...${key.slice(-4)} rate-limited for ${retryAfterMs / 1000}s`);
  }
}

// Get pool stats for monitoring
function getKeyPoolStats() {
  const now = Date.now();
  return {
    totalKeys: API_KEYS.length,
    availableKeys: API_KEYS.filter(k => (keyStatus.get(k)?.rateLimitedUntil || 0) <= now).length,
    keys: API_KEYS.map(k => {
      const status = keyStatus.get(k)!;
      return {
        suffix: `...${k.slice(-4)}`,
        requestCount: status.requestCount,
        rateLimited: status.rateLimitedUntil > now,
        rateLimitedFor: status.rateLimitedUntil > now ? Math.ceil((status.rateLimitedUntil - now) / 1000) : 0,
      };
    }),
  };
}

// Helper: retry with exponential backoff on 429
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<globalThis.Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      queueStats.rateLimitHits++;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`[Queue] Rate limited (429), retry ${attempt + 1}/${maxRetries} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
    
    return response;
  }
  throw new Error('Max retries exceeded');
}

// ============================================================================
// GEMINI FILE UPLOAD CACHE
// Caches file_uri by content hash AND API key (files are per-account!)
// Gemini files expire after 48h, so we use 24h TTL for safety
// ============================================================================
interface CachedFileUri {
  fileUri: string;
  mimeType: string;
  uploadedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const geminiFileCache = new Map<string, CachedFileUri>();

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [hash, entry] of geminiFileCache.entries()) {
    if (now - entry.uploadedAt > CACHE_TTL_MS) {
      geminiFileCache.delete(hash);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[Gemini Cache] Cleaned ${cleaned} expired entries, ${geminiFileCache.size} remaining`);
  }
}, 60 * 60 * 1000); // Check every hour

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Build cache key that includes API key (files are per-account)
function buildCacheKey(contentHash: string, apiKey: string): string {
  const keySuffix = apiKey.slice(-8); // Use last 8 chars for uniqueness
  return `${keySuffix}:${contentHash}`;
}

function getCachedFileUri(contentHash: string, apiKey: string): CachedFileUri | null {
  const cacheKey = buildCacheKey(contentHash, apiKey);
  const cached = geminiFileCache.get(cacheKey);
  if (!cached) return null;
  
  // Check if expired
  if (Date.now() - cached.uploadedAt > CACHE_TTL_MS) {
    geminiFileCache.delete(cacheKey);
    return null;
  }
  
  return cached;
}

function cacheFileUri(contentHash: string, apiKey: string, fileUri: string, mimeType: string): void {
  const cacheKey = buildCacheKey(contentHash, apiKey);
  geminiFileCache.set(cacheKey, {
    fileUri,
    mimeType,
    uploadedAt: Date.now(),
  });
  console.log(`[Gemini Cache] Cached file URI for key ...${apiKey.slice(-4)} hash ${contentHash.substring(0, 12)}... (${geminiFileCache.size} total cached)`);
}

// Available Gemini image generation models
const MODELS = {
  pro: 'gemini-3-pro-image-preview',    // Professional, up to 14 refs, 1K/2K/4K, Thinking
} as const;

type ModelType = keyof typeof MODELS;

interface StyleImage {
  url: string;
  strength: number;
  name?: string;
}

interface GenerateRequest {
  prompt: string;
  model?: ModelType;
  resolution?: '1K' | '2K' | '4K';
  aspectRatio?: string;
  numImages?: number;
  styleImages?: StyleImage[];
  negativePrompt?: string;
  seed?: string;
  mode?: 'create' | 'edit';
  editImage?: string; // base64 data URL of image to edit
  parentId?: string; // ID of parent generation (for edit chains)
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

// Highrise CDN base URL
const HIGHRISE_CDN = 'https://cdn.highrisegame.com';

// Get the correct CDN URL for an item based on its disp_id
function getItemCdnUrl(itemId: string): string {
  if (itemId.startsWith('bg-')) {
    return `${HIGHRISE_CDN}/background/${itemId}/full`;
  } else if (itemId.startsWith('cn-')) {
    return `${HIGHRISE_CDN}/container/${itemId}/full`;
  } else {
    return `${HIGHRISE_CDN}/avatar/${itemId}.png`;
  }
}

/**
 * Upload an image to Gemini Files API and get back a file_uri
 * This is the proper way to handle reference images
 */
async function uploadToGeminiFiles(url: string, apiKey: string): Promise<{ fileUri: string; mimeType: string } | null> {
  try {
    let buffer: Buffer;
    
    // Handle data URLs (base64 encoded images from AP proxy)
    if (url.startsWith('data:')) {
      console.log(`[Gemini Files] Decoding data URL (${url.length} chars)`);
      const matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        console.log(`[Gemini Files] Invalid data URL format`);
        return null;
      }
      buffer = Buffer.from(matches[2], 'base64');
    } 
    // Handle our own proxy URLs (relative URLs from client)
    else if (url.includes('/api/highrise/proxy/')) {
      // Extract item ID from URL like /api/highrise/proxy/item-id.png?v=3
      const match = url.match(/\/api\/highrise\/proxy\/([^.?]+)/);
      if (!match) {
        console.log(`[Gemini Files] Could not parse proxy URL: ${url}`);
        return null;
      }
      const itemId = match[1];
      const cdnUrl = getItemCdnUrl(itemId);
      console.log(`[Gemini Files] Proxy URL -> CDN: ${cdnUrl}`);
      
      const response = await fetch(cdnUrl);
      if (!response.ok) {
        console.log(`[Gemini Files] Failed to fetch from CDN: ${response.status}`);
        return null;
      }
      buffer = Buffer.from(await response.arrayBuffer());
    }
    // Handle our own generation URLs (relative or full paths like /api/generations/{id}/image/{idx})
    else if (url.includes('/api/generations/')) {
      const match = url.match(/\/api\/generations\/([^/]+)\/image\/(\d+)/);
      if (!match) {
        console.log(`[Gemini Files] Could not parse generation URL: ${url}`);
        return null;
      }
      const [, generationId, imageIndex] = match;
      
      // Look up actual filename from database instead of assuming format
      const gen = await getGeneration(generationId);
      if (!gen) {
        console.log(`[Gemini Files] Generation not found: ${generationId}`);
        return null;
      }
      
      const idx = parseInt(imageIndex);
      if (idx < 0 || idx >= gen.image_paths.length) {
        console.log(`[Gemini Files] Image index out of range: ${idx}`);
        return null;
      }
      
      const filename = gen.image_paths[idx];
      const filepath = getImagePath(filename);
      console.log(`[Gemini Files] Reading local file: ${filepath} (from DB: ${filename})`);
      try {
        buffer = await fs.readFile(filepath);
      } catch (err) {
        console.log(`[Gemini Files] Failed to read local file: ${err}`);
        return null;
      }
    }
    else {
      // Fetch from external URL
      console.log(`[Gemini Files] Fetching image: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        console.log(`[Gemini Files] Failed to fetch: ${response.status}`);
        return null;
      }
      buffer = Buffer.from(await response.arrayBuffer());
    }
    
    // Flatten transparency to gray background, keep as PNG for crispy refs
    const processedBuffer = await sharp(buffer)
      .flatten({ background: { r: 88, g: 89, b: 91 } })
      .png()
      .toBuffer();
    
    const mimeType = 'image/png';
    const numBytes = processedBuffer.byteLength;
    
    // Check cache by content hash AND API key (files are per-account!)
    const contentHash = hashBuffer(processedBuffer);
    const cached = getCachedFileUri(contentHash, apiKey);
    if (cached) {
      console.log(`[Gemini Files] Cache HIT for key ...${apiKey.slice(-4)} hash ${contentHash.substring(0, 12)}... -> ${cached.fileUri}`);
      return { fileUri: cached.fileUri, mimeType: cached.mimeType };
    }
    
    console.log(`[Gemini Files] Cache MISS for key ...${apiKey.slice(-4)} hash ${contentHash.substring(0, 12)}..., uploading ${numBytes} bytes...`);
    const displayName = `ref-${Date.now()}`;
    
    // Step 1: Start resumable upload
    const startResponse = await fetch(`${GEMINI_UPLOAD_BASE}/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    });
    
    if (!startResponse.ok) {
      const errText = await startResponse.text();
      console.log(`[Gemini Files] Start upload failed: ${startResponse.status}`, errText);
      return null;
    }
    
    // Get upload URL from response header (case-insensitive)
    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      // Debug: log all headers
      const allHeaders: string[] = [];
      startResponse.headers.forEach((v, k) => allHeaders.push(`${k}: ${v}`));
      console.log(`[Gemini Files] No upload URL. Headers:`, allHeaders.join(', '));
      return null;
    }
    
    console.log(`[Gemini Files] Got upload URL: ${uploadUrl.substring(0, 50)}...`);
    
    // Step 2: Upload the actual bytes
    const uint8Array = new Uint8Array(processedBuffer);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: uint8Array,
    });
    
    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.log(`[Gemini Files] Upload failed: ${uploadResponse.status}`, errText);
      return null;
    }
    
    const fileInfo = await uploadResponse.json();
    console.log(`[Gemini Files] Upload response:`, JSON.stringify(fileInfo).substring(0, 200));
    
    const fileUri = fileInfo.file?.uri;
    if (!fileUri) {
      console.log(`[Gemini Files] No file URI in response`);
      return null;
    }
    
    // Cache the successful upload (per API key!)
    cacheFileUri(contentHash, apiKey, fileUri, mimeType);
    
    console.log(`[Gemini Files] Success: ${fileUri}`);
    return { fileUri, mimeType };
  } catch (e) {
    console.error(`[Gemini Files] Error:`, e);
    return null;
  }
}

/**
 * Upload a base64 data URL image to Gemini Files API
 */
async function uploadBase64ToGeminiFiles(dataUrl: string, apiKey: string): Promise<{ fileUri: string; mimeType: string } | null> {
  try {
    // Parse base64 data URL
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.log(`[Gemini Files] Invalid base64 data URL`);
      return null;
    }
    
    const [, originalMimeType, base64Data] = matches;
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log(`[Gemini Files] Processing base64 image: ${buffer.byteLength} bytes, ${originalMimeType}`);
    
    // Process image: flatten transparency to gray background, output as PNG
    const processedBuffer = await sharp(buffer)
      .flatten({ background: { r: 88, g: 89, b: 91 } })
      .png()
      .toBuffer();
    
    const mimeType = 'image/png';
    const numBytes = processedBuffer.byteLength;
    
    // Check cache by content hash AND API key (files are per-account!)
    const contentHash = hashBuffer(processedBuffer);
    const cached = getCachedFileUri(contentHash, apiKey);
    if (cached) {
      console.log(`[Gemini Files] Cache HIT for key ...${apiKey.slice(-4)} edit target hash ${contentHash.substring(0, 12)}... -> ${cached.fileUri}`);
      return { fileUri: cached.fileUri, mimeType: cached.mimeType };
    }
    
    console.log(`[Gemini Files] Cache MISS for key ...${apiKey.slice(-4)} edit target, uploading ${numBytes} bytes...`);
    const displayName = `edit-target-${Date.now()}`;
    
    // Step 1: Start resumable upload
    const startResponse = await fetch(`${GEMINI_UPLOAD_BASE}/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    });
    
    if (!startResponse.ok) {
      const errText = await startResponse.text();
      console.log(`[Gemini Files] Start upload failed: ${startResponse.status}`, errText);
      return null;
    }
    
    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      console.log(`[Gemini Files] No upload URL in response`);
      return null;
    }
    
    // Step 2: Upload the actual bytes
    const uint8Array = new Uint8Array(processedBuffer);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: uint8Array,
    });
    
    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      console.log(`[Gemini Files] Upload failed: ${uploadResponse.status}`, errText);
      return null;
    }
    
    const fileInfo = await uploadResponse.json();
    const fileUri = fileInfo.file?.uri;
    
    if (!fileUri) {
      console.log(`[Gemini Files] No file URI in response`);
      return null;
    }
    
    // Cache the successful upload (per API key!)
    cacheFileUri(contentHash, apiKey, fileUri, mimeType);
    
    console.log(`[Gemini Files] Edit target uploaded: ${fileUri}`);
    return { fileUri, mimeType };
  } catch (e) {
    console.error(`[Gemini Files] Error uploading base64:`, e);
    return null;
  }
}

/**
 * Parse Gemini response and extract generated images
 * Note: Gemini API uses camelCase (inlineData, mimeType) not snake_case
 */
function extractImagesFromResponse(responseData: any): string[] {
  const images: string[] = [];
  
  if (!responseData?.candidates?.[0]?.content?.parts) {
    return images;
  }
  
  for (const part of responseData.candidates[0].content.parts) {
    // Gemini uses camelCase: inlineData, mimeType
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data && inlineData?.mimeType?.startsWith('image/')) {
      const dataUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`;
      images.push(dataUrl);
    }
  }
  
  return images;
}

// Debug endpoints
router.get('/debug/logs', (_req: Request, res: Response) => {
  res.json({
    logs: debugLogs,
    keyPool: getKeyPoolStats(),
    models: MODELS,
  });
});

router.delete('/debug/logs', (_req: Request, res: Response) => {
  debugLogs.length = 0;
  res.json({ ok: true });
});

// Queue stats endpoint - monitor rate limiting and queue health
router.get('/debug/queue', (_req: Request, res: Response) => {
  res.json({
    current: {
      active: activeTasks,
      waiting: taskQueue.length,
    },
    config: {
      maxConcurrent: MAX_CONCURRENT,
    },
    stats: {
      ...queueStats,
      uptime: process.uptime(),
    },
    keyPool: getKeyPoolStats(),
  });
});

// Streaming generation endpoint
router.post('/generate', async (req: Request, res: Response) => {
  const id = `gen-${Date.now().toString(36)}`;
  const { 
    prompt, 
    model = 'pro',  // Default to Pro for max references
    resolution = '1K', 
    aspectRatio = '1:1', 
    numImages = 1, 
    styleImages,
    negativePrompt,
    seed,
    mode = 'create',
    editImage,
    parentId,
  } = req.body as GenerateRequest;
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  
  addLog('request', { 
    id, 
    prompt: prompt?.slice(0, 50), 
    model,
    resolution, 
    aspectRatio, 
    numImages, 
    styleImagesCount: styleImages?.length || 0,
    mode,
    hasEditImage: !!editImage,
  });
  
  // Get API key from pool (round-robin across accounts)
  const apiKey = getApiKey();
  if (!apiKey) {
    send('error', { error: 'No GEMINI_API_KEY configured', id });
    res.end();
    return;
  }
  
  if (!prompt || prompt.length < 3) {
    send('error', { error: 'Prompt must be at least 3 characters', id });
    res.end();
    return;
  }
  
  // Validate model and get limits
  const modelType = 'pro' as ModelType;
  const modelId = MODELS.pro;
  const maxRefs = 14;
  
  // Map client resolution values to API values
  const resolutionMap: Record<string, string> = {
    '1024': '1K', '1K': '1K',
    '2048': '2K', '2K': '2K', 
    '4096': '4K', '4K': '4K',
  };
  const finalResolution = resolutionMap[resolution] || '2K';
  
  send('progress', { status: 'starting', message: 'INITIALIZING GEMINI...', progress: 5, id });
  
  try {
    // Build the parts array for multimodal input
    const parts: any[] = [];
    const imageParts: any[] = [];
    let editImagePart: any = null;
    
    // EDIT MODE: Upload the image to edit first
    if (mode === 'edit' && editImage) {
      send('progress', { 
        status: 'uploading', 
        message: 'UPLOADING IMAGE TO EDIT...', 
        progress: 5, 
        id 
      });
      
      // Handle both URLs and base64 data URLs
      let editData: { fileUri: string; mimeType: string } | null = null;
      if (editImage.startsWith('data:')) {
        // Base64 data URL
        editData = await uploadBase64ToGeminiFiles(editImage, apiKey);
      } else {
        // HTTP URL - use the same upload function as style images
        editData = await uploadToGeminiFiles(editImage, apiKey);
      }
      
      if (editData) {
        editImagePart = {
          file_data: {
            mime_type: editData.mimeType,
            file_uri: editData.fileUri,
          }
        };
        console.log(`[Gen ${id}] Edit image uploaded: ${editData.fileUri}`);
      } else {
        send('error', { error: 'Failed to upload edit image', id });
        res.end();
        return;
      }
    }
    
    // Upload style images to Gemini Files API (proper way for references)
    const effectiveStyleImages = styleImages?.slice(0, maxRefs) || [];
    if (effectiveStyleImages.length > 0) {
      send('progress', { 
        status: 'uploading', 
        message: `UPLOADING ${effectiveStyleImages.length} STYLE REFERENCE${effectiveStyleImages.length > 1 ? 'S' : ''}...`, 
        progress: 10, 
        id 
      });
      
      let uploaded = 0;
      for (const styleImg of effectiveStyleImages) {
        const fileData = await uploadToGeminiFiles(styleImg.url, apiKey);
        if (fileData) {
          // Use file_data with file_uri (not inline_data with base64)
          imageParts.push({
            file_data: {
              mime_type: fileData.mimeType,
              file_uri: fileData.fileUri,
            }
          });
          uploaded++;
          const pct = 10 + Math.floor((uploaded / effectiveStyleImages.length) * 20);
          send('progress', { 
            status: 'uploading', 
            message: `UPLOADED REFERENCE ${uploaded}/${effectiveStyleImages.length}...`, 
            progress: pct, 
            id 
          });
        }
      }
      
      addLog('info', { id, uploadedImages: uploaded, maxRefs, model: modelType, mode });
    }
    
    // Build the prompt text based on mode
    let fullPrompt = prompt;
    
    if (mode === 'edit') {
      // EDIT MODE: Modify the uploaded image
      if (imageParts.length > 0) {
        // Check what types of references we have
        const hasAvatarItems = effectiveStyleImages.some(img => 
          img.url.includes('avataritem') || 
          img.url.includes('/api/highrise/proxy/') && !img.url.includes('bg-') && !img.url.includes('cn-')
        );
        
        // Build style description based on reference types
        const styleDesc = hasAvatarItems 
          ? 'NO outlines, soft gradient shading, 3/4 perspective angle, stylized proportions'
          : 'NO outlines, soft gradient shading, flat 2D composition';
        
        // Edit with style references
        fullPrompt = `Edit the first image according to this instruction: ${prompt}

Use the style from the ${imageParts.length} reference image${imageParts.length > 1 ? 's' : ''} (digital art assets with ${styleDesc}).

Output a modified version of the first image that follows the instruction while matching the reference style.`;
      } else {
        // Simple edit without style references
        fullPrompt = `Edit this image: ${prompt}`;
      }
    } else {
      // CREATE MODE: Generate new image
      if (imageParts.length > 0) {
        // Check what types of references we have
        const hasAvatarItems = effectiveStyleImages.some(img => 
          img.url.includes('avataritem') || 
          img.url.includes('/api/highrise/proxy/') && !img.url.includes('bg-') && !img.url.includes('cn-')
        );
        const hasBackgrounds = effectiveStyleImages.some(img => 
          img.url.includes('/background/') || img.url.includes('bg-')
        );
        
        // Build style description based on reference types
        let styleDesc = `- NO outlines or black lines
- Soft gradient shading`;
        
        if (hasAvatarItems && !hasBackgrounds) {
          // Only items: include 3/4 perspective
          styleDesc += `
- A specific 3/4 perspective angle
- Stylized proportions`;
        } else if (hasBackgrounds && !hasAvatarItems) {
          // Only backgrounds: flat perspective
          styleDesc += `
- Flat 2D composition
- Environmental/scene design`;
        } else if (hasAvatarItems && hasBackgrounds) {
          // Mixed: mention both
          styleDesc += `
- Items use 3/4 perspective angle
- Backgrounds are flat 2D compositions`;
        }
        
        fullPrompt = `Look at these ${imageParts.length} reference images carefully. They are digital art assets with:
${styleDesc}

Create: ${prompt}

CRITICAL: Match the EXACT same style. No outlines. Same shading technique.`;
      }
    }
    
    // Add negative prompt if provided
    if (negativePrompt?.trim()) {
      fullPrompt += ` Avoid: ${negativePrompt.trim()}`;
    }
    
    // Build parts array: Text FIRST, then images
    parts.push({ text: fullPrompt });
    
    // In edit mode, add the edit target image first, then style references
    if (editImagePart) {
      parts.push(editImagePart);
    }
    parts.push(...imageParts);
    
    // Build the request payload
    const payload: any = {
      contents: [{
        parts: parts,
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    };
    
    // Add image config for aspect ratio and resolution
    if (aspectRatio || finalResolution !== '1K') {
      payload.generationConfig.imageConfig = {};
      if (aspectRatio) {
        payload.generationConfig.imageConfig.aspectRatio = aspectRatio;
      }
      if (finalResolution !== '1K') {
        payload.generationConfig.imageConfig.imageSize = finalResolution;
      }
    }
    
    const url = `${GEMINI_API_BASE}/models/${modelId}:generateContent`;
    
    // Determine how many variations to generate (Gemini doesn't have native numImages, so we make parallel calls)
    const variationCount = Math.min(Math.max(1, numImages || 1), 4);
    
    send('progress', { 
      status: 'generating', 
      message: variationCount > 1 ? `GENERATING ${variationCount} VARIATIONS...` : 'GENERATING IMAGE...', 
      progress: 30, 
      id 
    });
    
    addLog('info', { 
      id, 
      url,
      variations: variationCount,
      payload: {
        ...payload,
        contents: `[${parts.length} parts: ${parts.length - 1} images + 1 text]`,
      }
    });
    
    const startTime = Date.now();
    
    // Make API call with retry for 503 errors
    const generateOne = async (variationIndex: number): Promise<string[]> => {
      const maxRetries = 3;
      let lastError = '';
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(payload),
        });
        
        const responseText = await response.text();
        let responseData: any = null;
        
        try {
          responseData = JSON.parse(responseText);
        } catch {
          // Not JSON
        }
        
        // Retry on 503 (model overloaded) or 429 (rate limited)
        if ((response.status === 503 || response.status === 429) && attempt < maxRetries) {
          const baseDelay = response.status === 429 ? 3000 : 5000; // Shorter for rate limit
          const delay = attempt * baseDelay;
          const reason = response.status === 429 ? 'RATE LIMITED' : 'MODEL BUSY';
          console.log(`[Gen ${id}] ${response.status} ${reason}, retry ${attempt}/${maxRetries} in ${delay/1000}s`);
          if (response.status === 429) {
            queueStats.rateLimitHits++;
            // Mark this key as rate-limited so we use a different one
            markKeyRateLimited(apiKey, 60000); // 60 second cooldown
          }
          send('progress', { status: 'retrying', message: `${reason}, RETRYING (${attempt}/${maxRetries})...`, progress: 40, id });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        if (!response.ok) {
          console.error(`[Gen ${id}] Variation ${variationIndex + 1} failed: ${response.status}`);
          addLog('error', { id, variation: variationIndex + 1, status: response.status, response: responseText.slice(0, 500) });
          return [];
        }
        
        // Check for finish reasons that indicate generation failure
        const finishReason = responseData?.candidates?.[0]?.finishReason;
        
        // Handle content policy violations (PROHIBITED_CONTENT, SAFETY, etc.)
        if (finishReason === 'PROHIBITED_CONTENT' || finishReason === 'SAFETY' || finishReason === 'BLOCKLIST') {
          addLog('info', { 
            id, 
            variation: variationIndex + 1, 
            note: 'Content blocked by safety filters',
            finishReason
          });
          return ['CONTENT_BLOCKED'];
        }
        
        if (finishReason === 'NO_IMAGE') {
          addLog('info', { 
            id, 
            variation: variationIndex + 1, 
            note: 'Model returned NO_IMAGE - prompt may be too vague',
            finishReason
          });
          // Return special marker so we can give better error
          return ['NO_IMAGE_REFUSED'];
        }
        
        // Log successful response structure for debugging
        const images = extractImagesFromResponse(responseData);
        if (images.length === 0) {
          addLog('info', { 
            id, 
            variation: variationIndex + 1, 
            note: 'No images in response',
            hasCandidate: !!responseData?.candidates?.[0],
            partsCount: responseData?.candidates?.[0]?.content?.parts?.length || 0,
            finishReason,
            responsePreview: JSON.stringify(responseData).slice(0, 500)
          });
        }
        return images;
      }
      
      return [];
    };
    
    // Run variations through the queue (sequential to avoid rate limits)
    // Each variation gets queued and executed when a slot is available
    queueStats.totalQueued += variationCount;
    const queuePosition = taskQueue.length;
    if (queuePosition > 0) {
      send('progress', { status: 'queued', message: `QUEUED (${queuePosition} ahead)...`, progress: 25, id });
      console.log(`[Gen ${id}] Queued with ${queuePosition} requests ahead`);
    }
    
    const variationResults: string[][] = [];
    for (let i = 0; i < variationCount; i++) {
      try {
        // Queue each variation through the global limiter
        const result = await runQueued(async () => {
          queueStats.totalProcessed++;
          if (activeTasks > queueStats.peakConcurrent) queueStats.peakConcurrent = activeTasks;
          return generateOne(i);
        });
        variationResults.push(result || []);
        
        // Update progress for multi-variation generations
        if (variationCount > 1 && i < variationCount - 1) {
          send('progress', { 
            status: 'generating', 
            message: `GENERATED ${i + 1}/${variationCount}...`, 
            progress: 30 + Math.floor((i + 1) / variationCount * 50), 
            id 
          });
        }
      } catch (err) {
        console.error(`[Gen ${id}] Variation ${i + 1} queue error:`, err);
        variationResults.push([]);
      }
    }
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    
    // Flatten results and filter out empty arrays
    const allResults = variationResults.flat();
    
    // Check for special markers indicating why generation failed
    const refused = allResults.some(r => r === 'NO_IMAGE_REFUSED');
    const contentBlocked = allResults.some(r => r === 'CONTENT_BLOCKED');
    const images = allResults.filter(r => r !== 'NO_IMAGE_REFUSED' && r !== 'CONTENT_BLOCKED');
    
    addLog('response', { 
      id, 
      elapsed: `${elapsed}s`,
      requestedVariations: variationCount,
      successfulImages: images.length,
      refused,
      contentBlocked,
    });
    
    if (images.length === 0) {
      if (contentBlocked) {
        send('error', { error: 'CONTENT_BLOCKED: The image or prompt may contain sensitive content. Try adjusting or covering parts of the source image.', id });
      } else if (refused) {
        send('error', { error: 'Prompt too vague for image generation. Try a more descriptive prompt.', id });
      } else {
        send('error', { error: 'No images generated from any variation', id });
      }
      res.end();
      return;
    }
    
    console.log(`[Gen ${id}] Generated ${images.length} image(s) from ${variationCount} variation(s) in ${elapsed}s`);
    
    send('progress', { status: 'complete', message: 'GENERATION COMPLETE', progress: 95, id, elapsed });
    
    // Save to database if configured
    let savedGeneration: { id: string } | null = null;
    if (process.env.DATABASE_URL) {
      try {
        send('progress', { status: 'saving', message: 'SAVING TO HISTORY...', progress: 97, id, elapsed });
        
        // Generate a unique ID for this generation
        const genId = `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        
        // Save images to storage
        const imagePaths: string[] = [];
        for (let i = 0; i < images.length; i++) {
          const imagePath = await saveImage(images[i], genId, i);
          imagePaths.push(imagePath);
        }
        
        // Create thumbnails for all images (faster grid loading)
        const thumbnailPaths = await createThumbnails(imagePaths, genId);
        
        // Save to database (include user ID if authenticated)
        const userId = req.user?.id;
        savedGeneration = await saveGeneration({
          userId,
          prompt,
          model: modelType,
          resolution: finalResolution,
          aspectRatio: aspectRatio || '1:1',
          mode,
          parentId,
          imagePaths,
          thumbnailPaths,
          settings: {
            styleImages: styleImages?.map(s => ({ url: s.url, name: s.name })),
            negativePrompt,
            numImages: numImages || 1,
          },
        });
        
        console.log(`[Gen ${id}] Saved to database as ${savedGeneration.id}`);
      } catch (saveErr) {
        console.error(`[Gen ${id}] Failed to save to database:`, saveErr);
        // Don't fail the request, just log
      }
    }
    
    // If saved to database, return API paths instead of data URLs for better replay support
    const finalImageUrls = savedGeneration 
      ? images.map((_, i: number) => `/api/generations/${savedGeneration.id}/image/${i}`)
      : images;
    
    send('complete', {
      success: true,
      imageUrl: finalImageUrls[0],
      imageUrls: finalImageUrls,
      id,
      generationId: savedGeneration?.id,
      model: modelType,
      elapsed,
      variations: images.length,
    });
    
    res.end();
    
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    addLog('error', { id, error: errorMsg });
    send('error', { error: errorMsg, id });
    res.end();
  }
});

// API capabilities endpoint
router.get('/capabilities', (_req: Request, res: Response) => {
  res.json({
    models: {
      pro: {
        id: MODELS.pro,
        name: 'Gemini Pro 3',
        description: 'Professional quality with Thinking mode, up to 4K',
        maxRefs: 14,
        resolutions: ['1K', '2K', '4K'],
        features: ['thinking', 'google_search', 'high_fidelity'],
      },
    },
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9', '5:4', '4:5'],
    defaultModel: 'pro',
  });
});

export default router;
