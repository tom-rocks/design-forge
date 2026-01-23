import { Router, Request, Response } from 'express';
import pool from '../db.js';

const router = Router();

// Dashboard stats - overall usage
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    // Total generations
    const totalGens = await pool.query('SELECT COUNT(*) FROM generations');
    
    // Total users
    const totalUsers = await pool.query('SELECT COUNT(*) FROM users');
    
    // Generations today
    const todayGens = await pool.query(`
      SELECT COUNT(*) FROM generations 
      WHERE created_at >= CURRENT_DATE
    `);
    
    // Generations this week
    const weekGens = await pool.query(`
      SELECT COUNT(*) FROM generations 
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);
    
    // Generations by model
    const byModel = await pool.query(`
      SELECT model, COUNT(*) as count 
      FROM generations 
      GROUP BY model 
      ORDER BY count DESC
    `);
    
    // Generations by mode (create vs edit)
    const byMode = await pool.query(`
      SELECT mode, COUNT(*) as count 
      FROM generations 
      GROUP BY mode 
      ORDER BY count DESC
    `);
    
    // Generations by resolution
    const byResolution = await pool.query(`
      SELECT resolution, COUNT(*) as count 
      FROM generations 
      GROUP BY resolution 
      ORDER BY count DESC
    `);
    
    // Generations by aspect ratio
    const byAspectRatio = await pool.query(`
      SELECT aspect_ratio, COUNT(*) as count 
      FROM generations 
      WHERE aspect_ratio IS NOT NULL
      GROUP BY aspect_ratio 
      ORDER BY count DESC
    `);
    
    // Daily generations for last 30 days
    const daily = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM generations
      WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);
    
    // Hourly distribution (to see peak usage times)
    const hourly = await pool.query(`
      SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
      FROM generations
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour ASC
    `);
    
    res.json({
      totals: {
        generations: parseInt(totalGens.rows[0].count, 10),
        users: parseInt(totalUsers.rows[0].count, 10),
        today: parseInt(todayGens.rows[0].count, 10),
        thisWeek: parseInt(weekGens.rows[0].count, 10),
      },
      byModel: byModel.rows.map(r => ({ model: r.model || 'unknown', count: parseInt(r.count, 10) })),
      byMode: byMode.rows.map(r => ({ mode: r.mode || 'create', count: parseInt(r.count, 10) })),
      byResolution: byResolution.rows.map(r => ({ resolution: r.resolution || 'unknown', count: parseInt(r.count, 10) })),
      byAspectRatio: byAspectRatio.rows.map(r => ({ ratio: r.aspect_ratio, count: parseInt(r.count, 10) })),
      daily: daily.rows.map(r => ({ date: r.date, count: parseInt(r.count, 10) })),
      hourly: hourly.rows.map(r => ({ hour: parseInt(r.hour, 10), count: parseInt(r.count, 10) })),
    });
  } catch (err) {
    console.error('[Dashboard] Stats error:', err);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// User stats - generations per user
router.get('/users', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    // Get users with generation counts
    const users = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.avatar_url,
        u.created_at,
        u.last_login,
        COUNT(g.id) as generation_count,
        MAX(g.created_at) as last_generation
      FROM users u
      LEFT JOIN generations g ON u.id = g.user_id
      GROUP BY u.id
      ORDER BY generation_count DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    const total = await pool.query('SELECT COUNT(*) FROM users');
    
    res.json({
      users: users.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatar_url,
        createdAt: u.created_at,
        lastLogin: u.last_login,
        generationCount: parseInt(u.generation_count, 10),
        lastGeneration: u.last_generation,
      })),
      total: parseInt(total.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('[Dashboard] Users error:', err);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get specific user's generations
router.get('/users/:userId/generations', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const generations = await pool.query(`
      SELECT 
        id, prompt, model, resolution, aspect_ratio, mode, created_at,
        image_paths, thumbnail_paths
      FROM generations 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    const total = await pool.query(
      'SELECT COUNT(*) FROM generations WHERE user_id = $1',
      [userId]
    );
    
    res.json({
      generations: generations.rows.map(g => {
        const thumbs = g.thumbnail_paths || [];
        return {
          ...g,
          thumbnailUrl: thumbs[0] ? `/api/generations/${g.id}/thumbnail/0` : null,
          thumbnailUrls: g.image_paths.map((_: any, i: number) => thumbs[i] ? `/api/generations/${g.id}/thumbnail/${i}` : null),
          imageUrls: g.image_paths.map((_: any, i: number) => `/api/generations/${g.id}/image/${i}`),
        };
      }),
      total: parseInt(total.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('[Dashboard] User generations error:', err);
    res.status(500).json({ error: 'Failed to get user generations' });
  }
});

// Recent generations (all users)
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const generations = await pool.query(`
      SELECT 
        g.id, g.prompt, g.model, g.resolution, g.aspect_ratio, g.mode, g.created_at,
        g.image_paths, g.thumbnail_paths,
        u.email as user_email, u.name as user_name, u.avatar_url as user_avatar
      FROM generations g
      LEFT JOIN users u ON g.user_id = u.id
      ORDER BY g.created_at DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      generations: generations.rows.map(g => {
        const thumbs = g.thumbnail_paths || [];
        return {
          id: g.id,
          prompt: g.prompt,
          model: g.model,
          resolution: g.resolution,
          aspectRatio: g.aspect_ratio,
          mode: g.mode,
          createdAt: g.created_at,
          thumbnailUrl: thumbs[0] ? `/api/generations/${g.id}/thumbnail/0` : null,
          thumbnailUrls: g.image_paths.map((_: any, i: number) => thumbs[i] ? `/api/generations/${g.id}/thumbnail/${i}` : null),
          imageUrls: g.image_paths.map((_: any, i: number) => `/api/generations/${g.id}/image/${i}`),
          user: g.user_email ? {
            email: g.user_email,
            name: g.user_name,
            avatarUrl: g.user_avatar,
          } : null,
        };
      }),
    });
  } catch (err) {
    console.error('[Dashboard] Recent error:', err);
    res.status(500).json({ error: 'Failed to get recent generations' });
  }
});

export default router;
