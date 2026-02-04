import { Router, Request, Response } from 'express';
import {
  getSavedAlloys,
  saveAlloy,
  updateAlloy,
  useAlloy,
  deleteAlloy,
} from '../db.js';

const router = Router();

// Middleware to check authentication
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Helper to get userId
const getUserId = (req: Request): string => req.user!.id;

// GET /api/alloys - List all saved alloys for current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const alloys = await getSavedAlloys(userId);
    res.json({ alloys });
  } catch (error) {
    console.error('[Alloys] Error fetching:', error);
    res.status(500).json({ error: 'Failed to fetch alloys' });
  }
});

// POST /api/alloys - Save a new alloy
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name, items, generationId } = req.body;
    
    if (!name || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'name and items array are required' });
    }
    
    const alloy = await saveAlloy({
      userId,
      name,
      items,
      generationId,
    });
    
    res.status(201).json({ alloy });
  } catch (error) {
    console.error('[Alloys] Error saving:', error);
    res.status(500).json({ error: 'Failed to save alloy' });
  }
});

// PUT /api/alloys/:id - Update an alloy (rename, pin/unpin)
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, pinned } = req.body;
    
    const alloy = await updateAlloy(id, userId, { name, pinned });
    
    if (!alloy) {
      return res.status(404).json({ error: 'Alloy not found' });
    }
    
    res.json({ alloy });
  } catch (error) {
    console.error('[Alloys] Error updating:', error);
    res.status(500).json({ error: 'Failed to update alloy' });
  }
});

// POST /api/alloys/:id/use - Mark alloy as used (updates last_used_at)
router.post('/:id/use', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    
    const alloy = await useAlloy(id, userId);
    
    if (!alloy) {
      return res.status(404).json({ error: 'Alloy not found' });
    }
    
    res.json({ alloy });
  } catch (error) {
    console.error('[Alloys] Error marking as used:', error);
    res.status(500).json({ error: 'Failed to update alloy' });
  }
});

// DELETE /api/alloys/:id - Delete an alloy
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    
    const deleted = await deleteAlloy(id, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Alloy not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Alloys] Error deleting:', error);
    res.status(500).json({ error: 'Failed to delete alloy' });
  }
});

export default router;
