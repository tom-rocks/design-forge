import { Router, Request, Response } from 'express';
import pool, {
  getFavorites,
  addFavorite,
  updateFavorite,
  deleteFavorite,
  reorderFavorites,
  createFavoriteFolder,
  renameFavoriteFolder,
  deleteFavoriteFolder,
  reorderFavoriteFolders,
  getFavoritedUrls,
  repairFavoriteItemIds,
} from '../db.js';

// Extend Express types for Passport user
declare global {
  namespace Express {
    interface User {
      id: string;
      google_id: string;
      email: string;
      name: string | null;
      avatar_url: string | null;
    }
  }
}

const router = Router();

// Middleware to check authentication (uses Passport's req.user)
const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Helper to get userId (after requireAuth middleware)
const getUserId = (req: Request): string => req.user!.id;

// GET /api/favorites - List all favorites and folders for current user
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { favorites, folders } = await getFavorites(userId);
    res.json({ favorites, folders });
  } catch (error) {
    console.error('[Favorites] Error fetching:', error);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// GET /api/favorites/urls - Get favorited URLs and item IDs for quick lookup
router.get('/urls', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { urls, itemIds } = await getFavoritedUrls(userId);
    res.json({ urls: Array.from(urls), itemIds: Array.from(itemIds) });
  } catch (error) {
    console.error('[Favorites] Error fetching URLs:', error);
    res.status(500).json({ error: 'Failed to fetch favorited URLs' });
  }
});

// POST /api/favorites - Add a favorite
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { type, itemData, folderId } = req.body;
    
    if (!type || !itemData || !itemData.imageUrl) {
      return res.status(400).json({ error: 'type and itemData.imageUrl are required' });
    }
    
    if (!['item', 'work', 'image'].includes(type)) {
      return res.status(400).json({ error: 'type must be item, work, or image' });
    }
    
    const favorite = await addFavorite({
      userId,
      type,
      itemData,
      folderId,
    });
    
    res.status(201).json({ favorite });
  } catch (error) {
    console.error('[Favorites] Error adding:', error);
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

// PUT /api/favorites/:id - Update a favorite (move to folder, etc.)
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { folderId, sortOrder } = req.body;
    
    const favorite = await updateFavorite(id, userId, {
      folderId,
      sortOrder,
    });
    
    if (!favorite) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    
    res.json({ favorite });
  } catch (error) {
    console.error('[Favorites] Error updating:', error);
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});

// DELETE /api/favorites/:id - Remove a favorite
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    
    const deleted = await deleteFavorite(id, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Favorites] Error deleting:', error);
    res.status(500).json({ error: 'Failed to delete favorite' });
  }
});

// POST /api/favorites/reorder - Batch reorder favorites
router.post('/reorder', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }
    
    await reorderFavorites(userId, items);
    res.json({ success: true });
  } catch (error) {
    console.error('[Favorites] Error reordering:', error);
    res.status(500).json({ error: 'Failed to reorder favorites' });
  }
});

// POST /api/favorites/folders - Create a folder
router.post('/folders', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const folder = await createFavoriteFolder(userId, name.trim());
    res.status(201).json({ folder });
  } catch (error) {
    console.error('[Favorites] Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PUT /api/favorites/folders/:id - Rename a folder
router.put('/folders/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    
    const folder = await renameFavoriteFolder(id, userId, name.trim());
    
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json({ folder });
  } catch (error) {
    console.error('[Favorites] Error renaming folder:', error);
    res.status(500).json({ error: 'Failed to rename folder' });
  }
});

// DELETE /api/favorites/folders/:id - Delete a folder
router.delete('/folders/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    
    const deleted = await deleteFavoriteFolder(id, userId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Favorites] Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// POST /api/favorites/folders/reorder - Batch reorder folders
router.post('/folders/reorder', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { folders } = req.body;
    
    if (!Array.isArray(folders)) {
      return res.status(400).json({ error: 'folders array is required' });
    }
    
    await reorderFavoriteFolders(userId, folders);
    res.json({ success: true });
  } catch (error) {
    console.error('[Favorites] Error reordering folders:', error);
    res.status(500).json({ error: 'Failed to reorder folders' });
  }
});

// POST /api/favorites/repair - Fix favorites with bad itemIds (MongoDB ObjectId -> dispId)
router.post('/repair', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    console.log(`[Favorites] Repairing favorites for user ${userId}`);
    
    const result = await repairFavoriteItemIds(userId);
    
    console.log(`[Favorites] Repair complete: ${result.fixed} fixed, ${result.failed} failed, ${result.total} total items`);
    res.json({ 
      success: true,
      fixed: result.fixed,
      failed: result.failed,
      total: result.total,
      message: `Fixed ${result.fixed} favorites. ${result.failed} could not be repaired automatically.`
    });
  } catch (error) {
    console.error('[Favorites] Error repairing:', error);
    res.status(500).json({ error: 'Failed to repair favorites' });
  }
});

// PUT /api/favorites/:id/repair - Update a favorite's itemData (for client-side repair)
router.put('/:id/repair', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { itemData } = req.body;
    
    if (!itemData) {
      return res.status(400).json({ error: 'itemData is required' });
    }
    
    // Update the item_data for this favorite
    const result = await pool.query(
      `UPDATE favorites SET item_data = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [itemData, id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Favorite not found' });
    }
    
    console.log(`[Favorites] Updated item_data for favorite ${id}`);
    res.json({ favorite: result.rows[0] });
  } catch (error) {
    console.error('[Favorites] Error updating item_data:', error);
    res.status(500).json({ error: 'Failed to update favorite' });
  }
});

// DELETE /api/favorites/broken - Delete all favorites with MongoDB IDs (broken ones)
router.delete('/broken', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    
    // Delete item favorites where itemId looks like a MongoDB ObjectId (24 hex chars)
    // These are the broken ones that can't be fixed
    const result = await pool.query(
      `DELETE FROM favorites 
       WHERE user_id = $1 
       AND type = 'item' 
       AND item_data->>'itemId' ~ '^[a-f0-9]{24}$'
       RETURNING id`,
      [userId]
    );
    
    const deleted = result.rows.length;
    console.log(`[Favorites] Deleted ${deleted} broken favorites for user ${userId}`);
    
    res.json({ 
      success: true, 
      deleted,
      message: `Deleted ${deleted} broken favorites`
    });
  } catch (error) {
    console.error('[Favorites] Error deleting broken favorites:', error);
    res.status(500).json({ error: 'Failed to delete broken favorites' });
  }
});

export default router;
