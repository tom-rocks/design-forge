import { Router, Request, Response } from 'express';

const router = Router();

const HIGHRISE_API = 'https://webapi.highrise.game';
const HIGHRISE_CDN = 'https://cdn.highrisegame.com/avatar';

// Available categories from Highrise API
const CATEGORIES = [
  'aura', 'bag', 'blush', 'body', 'dress', 'earrings', 'emote', 'eye', 'eyebrow',
  'face_hair', 'fishing_rod', 'freckle', 'fullsuit', 'glasses', 'gloves',
  'hair_back', 'hair_front', 'handbag', 'hat', 'jacket', 'lashes', 'mole',
  'mouth', 'necklace', 'nose', 'pants', 'rod', 'shirt', 'shoes', 'shorts',
  'skirt', 'sock', 'tattoo', 'watch'
] as const;

interface HighriseItem {
  item_id: string;
  item_name: string;
  rarity: string;
  category: string;
}

interface SearchResult {
  id: string;
  name: string;
  category: string;
  rarity: string;
  imageUrl: string;
}

// Search items
router.get('/items', async (req: Request, res: Response) => {
  try {
    const { 
      q,           // search query (searches both name and ID)
      category,    // filter by category
      rarity,      // filter by rarity (rare,epic,legendary,none)
      limit = '50',
      starts_after 
    } = req.query;

    const searchQuery = q ? String(q).toLowerCase() : '';
    
    // Build API params - fetch more to filter client-side for ID matches
    const params = new URLSearchParams();
    if (category) params.set('category', String(category));
    if (rarity) params.set('rarity', String(rarity));
    if (starts_after) params.set('starts_after', String(starts_after));
    // Fetch more items when searching to allow ID filtering
    const fetchLimit = searchQuery ? 200 : Math.min(parseInt(String(limit)), 100);
    params.set('limit', String(fetchLimit));
    params.set('sort_order', 'desc');
    
    // If searching, also try API search by name
    if (searchQuery) {
      params.set('item_name', searchQuery);
    }

    const url = `${HIGHRISE_API}/items?${params.toString()}`;
    console.log('[Highrise] Fetching:', url);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Highrise API error: ${response.status}`);
    }

    const data = await response.json();
    let items: HighriseItem[] = data.items || [];

    // If searching, also fetch without name filter to catch ID matches
    if (searchQuery) {
      const idParams = new URLSearchParams();
      if (category) idParams.set('category', String(category));
      if (rarity) idParams.set('rarity', String(rarity));
      idParams.set('limit', '200');
      idParams.set('sort_order', 'desc');
      
      const idUrl = `${HIGHRISE_API}/items?${idParams.toString()}`;
      const idResponse = await fetch(idUrl);
      if (idResponse.ok) {
        const idData = await idResponse.json();
        const idItems: HighriseItem[] = idData.items || [];
        
        // Merge and dedupe
        const seenIds = new Set(items.map(i => i.item_id));
        for (const item of idItems) {
          if (!seenIds.has(item.item_id)) {
            items.push(item);
            seenIds.add(item.item_id);
          }
        }
      }
      
      // Filter by query matching both name and ID
      items = items.filter(item => 
        item.item_id.toLowerCase().includes(searchQuery) ||
        item.item_name.toLowerCase().includes(searchQuery)
      );
    }

    // Transform to our format with image URLs
    const results: SearchResult[] = items.slice(0, parseInt(String(limit))).map(item => ({
      id: item.item_id,
      name: item.item_name,
      category: item.category,
      rarity: item.rarity,
      imageUrl: `${HIGHRISE_CDN}/${item.item_id}.png`,
    }));

    res.json({
      items: results,
      hasMore: items.length > parseInt(String(limit)),
      nextCursor: results.length > 0 ? results[results.length - 1].id : null,
    });

  } catch (error) {
    console.error('[Highrise] Error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch items' 
    });
  }
});

// Get single item
router.get('/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    
    const response = await fetch(`${HIGHRISE_API}/items/${itemId}`);
    if (!response.ok) {
      throw new Error(`Item not found: ${response.status}`);
    }

    const data = await response.json();
    const item = data.item;

    res.json({
      id: item.item_id,
      name: item.item_name,
      category: item.category,
      rarity: item.rarity,
      imageUrl: `${HIGHRISE_CDN}/${item.item_id}.png`,
    });

  } catch (error) {
    console.error('[Highrise] Error:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch item' 
    });
  }
});

// Get categories
router.get('/categories', (_req: Request, res: Response) => {
  res.json({ categories: CATEGORIES });
});

export default router;
