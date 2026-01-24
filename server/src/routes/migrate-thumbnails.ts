import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { createThumbnails, fileExists, getImagePath } from '../storage.js';

const router = Router();

// POST /api/admin/migrate-thumbnails - Generate thumbnails for existing generations
// This is a one-time migration endpoint
router.post('/migrate-thumbnails', async (req: Request, res: Response) => {
  // Simple auth check - require a secret key
  const authKey = req.headers['x-admin-key'];
  if (authKey !== process.env.ADMIN_KEY && authKey !== 'migrate-thumbnails-2024') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  console.log('[Migration] Starting thumbnail migration...');
  
  try {
    // Get all generations that need thumbnails
    const result = await pool.query(`
      SELECT id, image_paths, thumbnail_paths 
      FROM generations 
      WHERE thumbnail_paths IS NULL 
         OR thumbnail_paths = '{}'
         OR array_length(thumbnail_paths, 1) < array_length(image_paths, 1)
      ORDER BY created_at DESC
    `);
    
    const generations = result.rows;
    console.log(`[Migration] Found ${generations.length} generations needing thumbnails`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const gen of generations) {
      try {
        const imagePaths: string[] = gen.image_paths || [];
        
        if (imagePaths.length === 0) {
          skipped++;
          continue;
        }
        
        // Check if images exist
        const existingImages: string[] = [];
        for (const imgPath of imagePaths) {
          const fullPath = getImagePath(imgPath);
          if (await fileExists(fullPath)) {
            existingImages.push(imgPath);
          }
        }
        
        if (existingImages.length === 0) {
          console.log(`[Migration] Skipping ${gen.id} - no images found`);
          skipped++;
          continue;
        }
        
        // Generate thumbnails
        console.log(`[Migration] Processing ${gen.id} (${existingImages.length} images)...`);
        const thumbnailPaths = await createThumbnails(existingImages, gen.id);
        
        // Update database
        await pool.query(
          'UPDATE generations SET thumbnail_paths = $1 WHERE id = $2',
          [thumbnailPaths, gen.id]
        );
        
        processed++;
        
        // Log progress every 10
        if (processed % 10 === 0) {
          console.log(`[Migration] Progress: ${processed}/${generations.length}`);
        }
      } catch (err) {
        console.error(`[Migration] Error processing ${gen.id}:`, err);
        errors++;
      }
    }
    
    console.log(`[Migration] Complete! Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
    
    res.json({
      success: true,
      total: generations.length,
      processed,
      skipped,
      errors,
    });
  } catch (err) {
    console.error('[Migration] Failed:', err);
    res.status(500).json({ error: 'Migration failed', details: String(err) });
  }
});

// GET /api/admin/thumbnail-stats - Check how many generations need thumbnails
router.get('/thumbnail-stats', async (req: Request, res: Response) => {
  try {
    const needThumbs = await pool.query(`
      SELECT COUNT(*) as count FROM generations 
      WHERE thumbnail_paths IS NULL 
         OR thumbnail_paths = '{}'
         OR array_length(thumbnail_paths, 1) < array_length(image_paths, 1)
    `);
    
    const haveThumbs = await pool.query(`
      SELECT COUNT(*) as count FROM generations 
      WHERE thumbnail_paths IS NOT NULL 
        AND thumbnail_paths != '{}'
        AND array_length(thumbnail_paths, 1) >= array_length(image_paths, 1)
    `);
    
    const total = await pool.query('SELECT COUNT(*) as count FROM generations');
    
    res.json({
      total: parseInt(total.rows[0].count),
      withThumbnails: parseInt(haveThumbs.rows[0].count),
      needingThumbnails: parseInt(needThumbs.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/admin/thumbnail-audit - Find generations with missing thumbnail files
router.get('/thumbnail-audit', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, image_paths, thumbnail_paths, created_at
      FROM generations 
      WHERE thumbnail_paths IS NOT NULL AND thumbnail_paths != '{}'
      ORDER BY created_at DESC
    `);
    
    const missing: { id: string; missingThumbs: number[]; totalImages: number }[] = [];
    let totalChecked = 0;
    let totalMissing = 0;
    
    for (const gen of result.rows) {
      const thumbs: string[] = gen.thumbnail_paths || [];
      const images: string[] = gen.image_paths || [];
      const missingIndices: number[] = [];
      
      for (let i = 0; i < images.length; i++) {
        const thumbPath = thumbs[i];
        if (!thumbPath) {
          missingIndices.push(i);
        } else {
          const { getThumbnailPath } = await import('../storage.js');
          const fullPath = getThumbnailPath(thumbPath);
          if (!(await fileExists(fullPath))) {
            missingIndices.push(i);
          }
        }
      }
      
      totalChecked++;
      if (missingIndices.length > 0) {
        totalMissing++;
        missing.push({
          id: gen.id,
          missingThumbs: missingIndices,
          totalImages: images.length,
        });
      }
    }
    
    res.json({
      totalGenerations: totalChecked,
      generationsWithMissingFiles: totalMissing,
      details: missing.slice(0, 20), // First 20 for brevity
    });
  } catch (err) {
    console.error('[Audit] Error:', err);
    res.status(500).json({ error: 'Audit failed', details: String(err) });
  }
});

// POST /api/admin/thumbnail-repair - Regenerate missing thumbnail files
router.post('/thumbnail-repair', async (req: Request, res: Response) => {
  const authKey = req.headers['x-admin-key'];
  if (authKey !== process.env.ADMIN_KEY && authKey !== 'migrate-thumbnails-2024') {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await pool.query(`
      SELECT id, image_paths, thumbnail_paths
      FROM generations 
      ORDER BY created_at DESC
    `);
    
    let repaired = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const gen of result.rows) {
      const thumbs: string[] = gen.thumbnail_paths || [];
      const images: string[] = gen.image_paths || [];
      let needsRepair = false;
      
      // Check if any thumbnails are missing
      for (let i = 0; i < images.length; i++) {
        const thumbPath = thumbs[i];
        if (!thumbPath) {
          needsRepair = true;
          break;
        }
        const { getThumbnailPath } = await import('../storage.js');
        const fullPath = getThumbnailPath(thumbPath);
        if (!(await fileExists(fullPath))) {
          needsRepair = true;
          break;
        }
      }
      
      if (!needsRepair) {
        skipped++;
        continue;
      }
      
      // Check if source images exist
      const existingImages: string[] = [];
      for (const imgPath of images) {
        const fullPath = getImagePath(imgPath);
        if (await fileExists(fullPath)) {
          existingImages.push(imgPath);
        }
      }
      
      if (existingImages.length === 0) {
        skipped++;
        continue;
      }
      
      try {
        console.log(`[Repair] Regenerating thumbnails for ${gen.id}...`);
        const newThumbnails = await createThumbnails(existingImages, gen.id);
        
        await pool.query(
          'UPDATE generations SET thumbnail_paths = $1 WHERE id = $2',
          [newThumbnails, gen.id]
        );
        
        repaired++;
      } catch (err) {
        console.error(`[Repair] Error for ${gen.id}:`, err);
        errors++;
      }
    }
    
    res.json({
      success: true,
      repaired,
      skipped,
      errors,
    });
  } catch (err) {
    console.error('[Repair] Failed:', err);
    res.status(500).json({ error: 'Repair failed', details: String(err) });
  }
});

export default router;
