import { Router, Request, Response } from 'express';
import { getGenerations, getGeneration, deleteGeneration, getEditChain } from '../db.js';
import { getImagePath, getThumbnailPath, fileExists, deleteImages, readImageAsBase64 } from '../storage.js';
import fs from 'fs/promises';

const router = Router();

// List all generations (paginated)
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { generations, total } = await getGenerations(limit, offset);
    
    // Add URLs for images
    const generationsWithUrls = generations.map(gen => ({
      ...gen,
      thumbnailUrl: gen.thumbnail_path ? `/api/generations/${gen.id}/thumbnail` : null,
      imageUrls: gen.image_paths.map((_, i) => `/api/generations/${gen.id}/image/${i}`),
    }));
    
    res.json({
      generations: generationsWithUrls,
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

// Get a single generation
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const gen = await getGeneration(req.params.id);
    if (!gen) {
      res.status(404).json({ error: 'Generation not found' });
      return;
    }
    
    res.json({
      ...gen,
      thumbnailUrl: gen.thumbnail_path ? `/api/generations/${gen.id}/thumbnail` : null,
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
    
    const chainWithUrls = chain.map(gen => ({
      ...gen,
      thumbnailUrl: gen.thumbnail_path ? `/api/generations/${gen.id}/thumbnail` : null,
      imageUrls: gen.image_paths.map((_, i) => `/api/generations/${gen.id}/image/${i}`),
    }));
    
    res.json({ chain: chainWithUrls });
  } catch (err) {
    console.error('[Generations] Chain error:', err);
    res.status(500).json({ error: 'Failed to get edit chain' });
  }
});

// Serve a generation image
router.get('/:id/image/:index', async (req: Request, res: Response) => {
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
    
    const imagePath = getImagePath(gen.image_paths[index]);
    if (!(await fileExists(imagePath))) {
      res.status(404).json({ error: 'Image file not found' });
      return;
    }
    
    res.sendFile(imagePath);
  } catch (err) {
    console.error('[Generations] Image error:', err);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Serve a generation thumbnail
router.get('/:id/thumbnail', async (req: Request, res: Response) => {
  try {
    const gen = await getGeneration(req.params.id);
    if (!gen || !gen.thumbnail_path) {
      res.status(404).json({ error: 'Thumbnail not found' });
      return;
    }
    
    const thumbPath = getThumbnailPath(gen.thumbnail_path);
    if (!(await fileExists(thumbPath))) {
      res.status(404).json({ error: 'Thumbnail file not found' });
      return;
    }
    
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
    await deleteImages(gen.image_paths, gen.thumbnail_path);
    
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
          console.log(`[Cleanup] Removing orphan generation: ${gen.id}`);
          await deleteGeneration(gen.id);
          cleaned++;
        }
      }
    }
    
    res.json({ ok: true, cleaned, total: generations.length });
  } catch (err) {
    console.error('[Generations] Cleanup error:', err);
    res.status(500).json({ error: 'Failed to cleanup generations' });
  }
});

export default router;
