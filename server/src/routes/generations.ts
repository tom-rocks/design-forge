import { Router, Request, Response } from 'express';
import { getGenerations, getGenerationsByUser, getGeneration, deleteGeneration, getEditChain } from '../db.js';
import { getImagePath, getThumbnailPath, fileExists, deleteImages, readImageAsBase64 } from '../storage.js';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

// In-memory log buffer for iframe debugging
const recentLogs: { timestamp: string; level: string; message: string; data?: any }[] = [];
const MAX_LOGS = 100;

function log(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  const entry = { timestamp: new Date().toISOString(), level, message, data };
  recentLogs.unshift(entry);
  if (recentLogs.length > MAX_LOGS) recentLogs.pop();
  
  const prefix = `[Generations]`;
  if (level === 'error') console.error(prefix, message, data || '');
  else if (level === 'warn') console.warn(prefix, message, data || '');
  else console.log(prefix, message, data || '');
}

// Helper to add URLs to generations
function addUrls(generations: any[]) {
  return generations.map(gen => {
    const thumbs = gen.thumbnail_paths || [];
    return {
      ...gen,
      // For backwards compat, thumbnailUrl points to first thumb
      thumbnailUrl: thumbs[0] ? `/api/generations/${gen.id}/thumbnail/0` : null,
      // Per-image thumbnail URLs
      thumbnailUrls: gen.image_paths.map((_: any, i: number) => 
        thumbs[i] ? `/api/generations/${gen.id}/thumbnail/${i}` : null
      ),
      imageUrls: gen.image_paths.map((_: any, i: number) => `/api/generations/${gen.id}/image/${i}`),
    };
  });
}

// List all generations (paginated) - admin/global view
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { generations, total } = await getGenerations(limit, offset);
    
    res.json({
      generations: addUrls(generations),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    console.error('[Generations] List error:', err);
    res.status(500).json({ error: 'Failed to list generations' });
  }
});

// List current user's generations (paginated)
router.get('/my', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.isAuthenticated() || !req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    console.log(`[Generations] /my START - user: ${req.user.email}, limit: ${limit}, offset: ${offset}`);
    const { generations, total } = await getGenerationsByUser(req.user.id, limit, offset);
    console.log(`[Generations] /my DB ${Date.now() - start}ms - found ${generations.length}/${total}`);
    
    const response = {
      generations: addUrls(generations),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
    const jsonStr = JSON.stringify(response);
    console.log(`[Generations] /my END ${Date.now() - start}ms - response size: ${(jsonStr.length / 1024).toFixed(1)} KB`);
    res.json(response);
  } catch (err) {
    console.error(`[Generations] /my ERROR ${Date.now() - start}ms:`, err);
    res.status(500).json({ error: 'Failed to list your generations' });
  }
});

// Get a single generation
router.get('/:id', async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const gen = await getGeneration(req.params.id);
    console.log(`[Generations] /:id ${req.params.id.slice(0, 8)} - ${Date.now() - start}ms - ${gen ? 'found' : '404'}`);
    if (!gen) {
      res.status(404).json({ error: 'Generation not found' });
      return;
    }
    
    const thumbs = gen.thumbnail_paths || [];
    res.json({
      ...gen,
      thumbnailUrl: thumbs[0] ? `/api/generations/${gen.id}/thumbnail/0` : null,
      thumbnailUrls: gen.image_paths.map((_, i) => thumbs[i] ? `/api/generations/${gen.id}/thumbnail/${i}` : null),
      imageUrls: gen.image_paths.map((_, i) => `/api/generations/${gen.id}/image/${i}`),
    });
  } catch (err) {
    console.error('[Generations] Get error:', err);
    res.status(500).json({ error: 'Failed to get generation' });
  }
});

// Get edit chain for a generation
router.get('/:id/chain', async (req: Request, res: Response) => {
  try {
    const chain = await getEditChain(req.params.id);
    
    const chainWithUrls = chain.map(gen => {
      const thumbs = gen.thumbnail_paths || [];
      return {
        ...gen,
        thumbnailUrl: thumbs[0] ? `/api/generations/${gen.id}/thumbnail/0` : null,
        thumbnailUrls: gen.image_paths.map((_, i) => thumbs[i] ? `/api/generations/${gen.id}/thumbnail/${i}` : null),
        imageUrls: gen.image_paths.map((_, i) => `/api/generations/${gen.id}/image/${i}`),
      };
    });
    
    res.json({ chain: chainWithUrls });
  } catch (err) {
    console.error('[Generations] Chain error:', err);
    res.status(500).json({ error: 'Failed to get edit chain' });
  }
});

// Serve a generation image
router.get('/:id/image/:index', async (req: Request, res: Response) => {
  const reqId = `img-${Date.now().toString(36)}`;
  log('info', `[${reqId}] Image request: ${req.params.id}/${req.params.index}`);
  
  try {
    const gen = await getGeneration(req.params.id);
    if (!gen) {
      log('warn', `[${reqId}] Generation not found: ${req.params.id}`);
      res.status(404).json({ error: 'Generation not found' });
      return;
    }
    
    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0 || index >= gen.image_paths.length) {
      log('warn', `[${reqId}] Index out of range: ${index}, paths: ${gen.image_paths.length}`);
      res.status(404).json({ error: 'Image index out of range' });
      return;
    }
    
    const filename = gen.image_paths[index];
    const imagePath = getImagePath(filename);
    log('info', `[${reqId}] Resolving: ${filename} -> ${imagePath}`);
    
    const exists = await fileExists(imagePath);
    if (!exists) {
      log('error', `[${reqId}] File not found on disk: ${imagePath}`);
      res.status(404).json({ error: 'Image file not found', path: imagePath });
      return;
    }
    
    // Get file stats for logging
    const stats = await fs.stat(imagePath);
    log('info', `[${reqId}] Serving file: ${stats.size} bytes`);
    
    // Set caching headers - images are immutable
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
    });
    res.sendFile(imagePath);
  } catch (err) {
    log('error', `[${reqId}] Exception serving image`, { error: String(err), stack: (err as Error).stack });
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Serve a generation thumbnail by index
router.get('/:id/thumbnail/:index', async (req: Request, res: Response) => {
  try {
    const gen = await getGeneration(req.params.id);
    const index = parseInt(req.params.index);
    const thumbs = gen?.thumbnail_paths || [];
    
    if (!gen || !thumbs[index]) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }
    
    const thumbPath = getThumbnailPath(thumbs[index]);
    if (!(await fileExists(thumbPath))) {
      res.status(404).json({ error: 'Thumbnail file not found' });
      return;
    }
    
    const filename = thumbs[index];
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': filename.endsWith('.webp') ? 'image/webp' : filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
    });
    res.sendFile(thumbPath);
  } catch (err) {
    console.error('[Generations] Thumbnail error:', err);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// Backwards compat: Serve first thumbnail (old route without index)
router.get('/:id/thumbnail', async (req: Request, res: Response) => {
  try {
    const gen = await getGeneration(req.params.id);
    const thumbs = gen?.thumbnail_paths || [];
    
    if (!gen || !thumbs[0]) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }
    
    const thumbPath = getThumbnailPath(thumbs[0]);
    if (!(await fileExists(thumbPath))) {
      res.status(404).json({ error: 'Thumbnail file not found' });
      return;
    }
    
    const filename = thumbs[0];
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': filename.endsWith('.webp') ? 'image/webp' : filename.endsWith('.png') ? 'image/png' : 'image/jpeg',
    });
    res.sendFile(thumbPath);
  } catch (err) {
    console.error('[Generations] Thumbnail error:', err);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// Get image as base64 (for using as edit target)
router.get('/:id/image/:index/base64', async (req: Request, res: Response) => {
  try {
    const gen = await getGeneration(req.params.id);
    if (!gen) {
      res.status(404).json({ error: 'Generation not found' });
      return;
    }
    
    const index = parseInt(req.params.index);
    if (isNaN(index) || index < 0 || index >= gen.image_paths.length) {
      res.status(404).json({ error: 'Image index out of range' });
      return;
    }
    
    const base64 = await readImageAsBase64(gen.image_paths[index]);
    res.json({ base64 });
  } catch (err) {
    console.error('[Generations] Base64 error:', err);
    res.status(500).json({ error: 'Failed to get image as base64' });
  }
});

// Delete a generation
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const gen = await getGeneration(req.params.id);
    if (!gen) {
      res.status(404).json({ error: 'Generation not found' });
      return;
    }
    
    // Delete files
    await deleteImages(gen.image_paths, gen.thumbnail_paths);
    
    // Delete from database
    await deleteGeneration(req.params.id);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[Generations] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete generation' });
  }
});

// Clean up orphan records (where image files are missing)
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { generations } = await getGenerations(1000, 0);
    let cleaned = 0;
    
    for (const gen of generations) {
      // Check if first image exists
      if (gen.image_paths.length > 0) {
        const firstImagePath = getImagePath(gen.image_paths[0]);
        const exists = await fileExists(firstImagePath);
        
        if (!exists) {
          log('info', `Cleanup: removing orphan generation: ${gen.id}`);
          await deleteGeneration(gen.id);
          cleaned++;
        }
      }
    }
    
    res.json({ ok: true, cleaned, total: generations.length });
  } catch (err) {
    log('error', 'Cleanup error', err);
    res.status(500).json({ error: 'Failed to cleanup generations' });
  }
});

// ========================================
// DIAGNOSTIC ENDPOINT - for iframe debugging
// ========================================
router.get('/debug/diagnostics', async (_req: Request, res: Response) => {
  const STORAGE_PATH = process.env.STORAGE_PATH || './storage';
  const IMAGES_DIR = path.join(STORAGE_PATH, 'images');
  const THUMBS_DIR = path.join(STORAGE_PATH, 'thumbnails');
  
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    env: {
      STORAGE_PATH,
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
    },
    paths: {
      images: IMAGES_DIR,
      thumbnails: THUMBS_DIR,
      resolved_images: path.resolve(IMAGES_DIR),
      resolved_thumbnails: path.resolve(THUMBS_DIR),
    },
    storage: {
      images_dir_exists: false,
      thumbs_dir_exists: false,
      images_readable: false,
      images_writable: false,
      image_count: 0,
      thumb_count: 0,
      sample_files: [] as string[],
      errors: [] as string[],
    },
    recent_logs: recentLogs.slice(0, 20),
  };
  
  // Check directories exist
  try {
    await fs.access(IMAGES_DIR);
    diagnostics.storage.images_dir_exists = true;
  } catch (e) {
    diagnostics.storage.errors.push(`Images dir not accessible: ${e}`);
  }
  
  try {
    await fs.access(THUMBS_DIR);
    diagnostics.storage.thumbs_dir_exists = true;
  } catch (e) {
    diagnostics.storage.errors.push(`Thumbs dir not accessible: ${e}`);
  }
  
  // Check read permissions and count files
  if (diagnostics.storage.images_dir_exists) {
    try {
      const files = await fs.readdir(IMAGES_DIR);
      diagnostics.storage.images_readable = true;
      diagnostics.storage.image_count = files.length;
      diagnostics.storage.sample_files = files.slice(0, 5);
      
      // Check first file is readable
      if (files.length > 0) {
        const samplePath = path.join(IMAGES_DIR, files[0]);
        const stat = await fs.stat(samplePath);
        diagnostics.storage.sample_file_stat = {
          file: files[0],
          size: stat.size,
          mode: stat.mode.toString(8),
          uid: stat.uid,
          gid: stat.gid,
        };
      }
    } catch (e) {
      diagnostics.storage.errors.push(`Cannot read images dir: ${e}`);
    }
  }
  
  // Check write permissions
  try {
    const testFile = path.join(IMAGES_DIR, `.write-test-${Date.now()}`);
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
    diagnostics.storage.images_writable = true;
  } catch (e) {
    diagnostics.storage.errors.push(`Cannot write to images dir: ${e}`);
  }
  
  // Count thumbnails
  if (diagnostics.storage.thumbs_dir_exists) {
    try {
      const files = await fs.readdir(THUMBS_DIR);
      diagnostics.storage.thumb_count = files.length;
    } catch (e) {
      diagnostics.storage.errors.push(`Cannot read thumbs dir: ${e}`);
    }
  }
  
  // Check a specific generation if provided
  const testId = _req.query.testId as string;
  if (testId) {
    try {
      const gen = await getGeneration(testId);
      if (gen) {
        diagnostics.test_generation = {
          id: gen.id,
          image_paths: gen.image_paths,
          thumbnail_paths: gen.thumbnail_paths,
          files_exist: [] as { path: string; exists: boolean; resolved: string }[],
        };
        
        for (const imgPath of gen.image_paths) {
          const fullPath = getImagePath(imgPath);
          const exists = await fileExists(fullPath);
          diagnostics.test_generation.files_exist.push({
            path: imgPath,
            resolved: fullPath,
            exists,
          });
        }
      } else {
        diagnostics.test_generation = { error: 'Not found' };
      }
    } catch (e) {
      diagnostics.test_generation = { error: String(e) };
    }
  }
  
  res.json(diagnostics);
});

// Get recent logs
router.get('/debug/logs', (_req: Request, res: Response) => {
  res.json({ logs: recentLogs });
});

// Clear logs
router.delete('/debug/logs', (_req: Request, res: Response) => {
  recentLogs.length = 0;
  res.json({ ok: true });
});

export default router;
