import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

const router = Router();

// Disk-based asset storage - persists across restarts
const ASSETS_DIR = process.env.STORAGE_PATH 
  ? path.join(process.env.STORAGE_PATH, 'assets')
  : path.join(process.cwd(), 'storage', 'assets');

// In-memory cache for faster access (populated from disk on startup)
const assetCache = new Map<string, { mimeType: string; hash: string }>();
const hashToAssetId = new Map<string, string>(); // For deduplication

// Ensure assets directory exists
async function ensureAssetsDir() {
  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });
  } catch (e) {
    // Ignore if exists
  }
}

// Load existing assets into cache on startup
async function loadAssetIndex() {
  try {
    await ensureAssetsDir();
    const indexPath = path.join(ASSETS_DIR, 'index.json');
    const data = await fs.readFile(indexPath, 'utf-8');
    const index = JSON.parse(data) as Record<string, { mimeType: string; hash: string }>;
    
    for (const [assetId, meta] of Object.entries(index)) {
      assetCache.set(assetId, meta);
      hashToAssetId.set(meta.hash, assetId);
    }
    
    console.log(`[Assets] Loaded ${assetCache.size} assets from disk index`);
  } catch (e) {
    // Index doesn't exist yet, that's fine
    console.log('[Assets] No existing asset index, starting fresh');
  }
}

// Save asset index to disk
async function saveAssetIndex() {
  const index: Record<string, { mimeType: string; hash: string }> = {};
  for (const [assetId, meta] of assetCache.entries()) {
    index[assetId] = meta;
  }
  
  const indexPath = path.join(ASSETS_DIR, 'index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

// Initialize on module load
loadAssetIndex();

/**
 * Upload a base64 image and get an asset ID back
 * POST /api/assets/upload
 * Body: { data: "data:image/png;base64,..." }
 * Returns: { assetId: "xxx", hash: "yyy" }
 */
router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;
    
    if (!data || typeof data !== 'string') {
      res.status(400).json({ error: 'Missing data field' });
      return;
    }
    
    // Parse base64 data URL
    const matches = data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      res.status(400).json({ error: 'Invalid data URL format' });
      return;
    }
    
    const [, mimeType, base64Data] = matches;
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Hash the content for deduplication
    const hash = createHash('sha256').update(buffer).digest('hex').substring(0, 16);
    
    // Check if we already have this exact image
    const existingId = hashToAssetId.get(hash);
    if (existingId) {
      // Verify file still exists on disk
      const ext = mimeType.split('/')[1] || 'bin';
      const filePath = path.join(ASSETS_DIR, `${existingId}.${ext}`);
      try {
        await fs.access(filePath);
        console.log(`[Assets] Dedup hit for hash ${hash} -> ${existingId}`);
        res.json({ assetId: existingId, hash, deduplicated: true });
        return;
      } catch {
        // File missing, remove from cache and continue to store new
        assetCache.delete(existingId);
        hashToAssetId.delete(hash);
      }
    }
    
    // Store new asset
    await ensureAssetsDir();
    const assetId = randomUUID();
    const ext = mimeType.split('/')[1] || 'bin';
    const filePath = path.join(ASSETS_DIR, `${assetId}.${ext}`);
    
    await fs.writeFile(filePath, buffer);
    
    // Update cache and index
    assetCache.set(assetId, { mimeType, hash });
    hashToAssetId.set(hash, assetId);
    await saveAssetIndex();
    
    console.log(`[Assets] Stored ${buffer.byteLength} bytes as ${assetId} (hash: ${hash}). Total: ${assetCache.size}`);
    
    res.json({ assetId, hash });
  } catch (err) {
    console.error('[Assets] Upload error:', err);
    res.status(500).json({ error: 'Failed to store asset' });
  }
});

/**
 * Get an asset by ID (returns the image)
 * GET /api/assets/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  const assetId = req.params.id;
  const meta = assetCache.get(assetId);
  
  if (!meta) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  
  const ext = meta.mimeType.split('/')[1] || 'bin';
  const filePath = path.join(ASSETS_DIR, `${assetId}.${ext}`);
  
  try {
    const data = await fs.readFile(filePath);
    res.set({
      'Content-Type': meta.mimeType,
      'Cache-Control': 'public, max-age=31536000', // 1 year (immutable content)
    });
    res.send(data);
  } catch (err) {
    // File missing from disk, clean up cache
    assetCache.delete(assetId);
    hashToAssetId.delete(meta.hash);
    res.status(404).json({ error: 'Asset file not found' });
  }
});

/**
 * Get asset as base64 data URL (for generate route to use)
 * GET /api/assets/:id/data
 */
router.get('/:id/data', async (req: Request, res: Response) => {
  const assetId = req.params.id;
  const meta = assetCache.get(assetId);
  
  if (!meta) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  
  const ext = meta.mimeType.split('/')[1] || 'bin';
  const filePath = path.join(ASSETS_DIR, `${assetId}.${ext}`);
  
  try {
    const data = await fs.readFile(filePath);
    const dataUrl = `data:${meta.mimeType};base64,${data.toString('base64')}`;
    res.json({ data: dataUrl, mimeType: meta.mimeType });
  } catch (err) {
    assetCache.delete(assetId);
    hashToAssetId.delete(meta.hash);
    res.status(404).json({ error: 'Asset file not found' });
  }
});

/**
 * Get asset buffer directly (internal use by generate route)
 */
export async function getAssetBuffer(assetId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const meta = assetCache.get(assetId);
  if (!meta) return null;
  
  const ext = meta.mimeType.split('/')[1] || 'bin';
  const filePath = path.join(ASSETS_DIR, `${assetId}.${ext}`);
  
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, mimeType: meta.mimeType };
  } catch {
    return null;
  }
}

/**
 * Stats endpoint
 * GET /api/assets/stats
 */
router.get('/stats', async (_req: Request, res: Response) => {
  let totalBytes = 0;
  
  for (const [assetId, meta] of assetCache.entries()) {
    const ext = meta.mimeType.split('/')[1] || 'bin';
    const filePath = path.join(ASSETS_DIR, `${assetId}.${ext}`);
    try {
      const stat = await fs.stat(filePath);
      totalBytes += stat.size;
    } catch {
      // File missing
    }
  }
  
  res.json({
    count: assetCache.size,
    totalBytes,
    totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
  });
});

export default router;
