import { Router, Request, Response } from 'express';
import { isBridgeConnected, searchItemsViaBridge, getItemViaBridge } from '../bridge.js';

const router = Router();

const HIGHRISE_API = 'https://webapi.highrise.game';
const HIGHRISE_CDN = 'https://cdn.highrisegame.com/avatar';

// Item types for bridge search
const ITEM_TYPES = [
  'all', 'clothing', 'furniture', 'collectibles'
] as const;

interface HighriseItem {
  item_id: string;
  item_name: string;
  rarity: string;
  category: string;
}

interface BridgeItem {
  disp_id?: string;
  id?: string;
  item_id?: string;
  name?: string;
  display_name?: string;
  item_name?: string;
  rarity?: string;
  category?: string;
  type?: string;
}

interface SearchResult {
  id: string;
  name: string;
  category: string;
  rarity: string;
  imageUrl: string;
}

// Transform bridge item to our format
const transformBridgeItem = (item: BridgeItem): SearchResult => {
  const id = item.disp_id || item.id || item.item_id || '';
  return {
    id,
    name: item.name || item.display_name || item.item_name || id,
    category: item.category || item.type || 'unknown',
    rarity: item.rarity || 'common',
    imageUrl: `${HIGHRISE_CDN}/${id}.png`,
  };
};

// Search items - uses bridge if connected, falls back to public API
router.get('/items', async (req: Request, res: Response) => {
  try {
    const { 
      q,
      category,
      type,
      rarity,
      limit = '40',
      page = '0',
    } = req.query;

    const searchQuery = q ? String(q).trim() : '';
    const requestedLimit = Math.min(parseInt(String(limit)), 100);
    const pageNum = parseInt(String(page)) || 0;

    // Try bridge first if connected
    if (isBridgeConnected()) {
      console.log('[Highrise] Using bridge for search:', searchQuery);
      
      try {
        const bridgeResult = await searchItemsViaBridge({
          query: searchQuery,
          type: String(type || 'all'),
          page: pageNum,
          limit: requestedLimit,
          rarity: rarity ? String(rarity).split(',') : [],
          sort: 'relevance_descending',
        }) as { items?: BridgeItem[] };

        const items = (bridgeResult.items || []).map(transformBridgeItem);
        
        res.json({
          items,
          hasMore: items.length === requestedLimit,
          source: 'bridge',
          page: pageNum,
        });
        return;
      } catch (bridgeError) {
        console.error('[Highrise] Bridge error, falling back to public API:', bridgeError);
      }
    }

    // Fallback to public API (limited functionality)
    console.log('[Highrise] Using public API (limited)');
    
    let allItems: HighriseItem[] = [];
    const pagesToFetch = (searchQuery && category) ? 10 : (category ? 3 : 1);
    let cursor: string | undefined;
    
    for (let p = 0; p < pagesToFetch; p++) {
      const params = new URLSearchParams();
      if (category) params.set('category', String(category));
      if (rarity) params.set('rarity', String(rarity));
      if (cursor) params.set('starts_after', cursor);
      params.set('limit', '100');
      params.set('sort_order', 'desc');

      const url = `${HIGHRISE_API}/items?${params.toString()}`;
      const response = await fetch(url);
      
      if (!response.ok) break;

      const data = await response.json();
      const pageItems: HighriseItem[] = data.items || [];
      
      if (pageItems.length === 0) break;
      
      allItems = [...allItems, ...pageItems];
      cursor = pageItems[pageItems.length - 1].item_id;
      
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches = allItems.filter(item => 
          item.item_id.toLowerCase().includes(q) ||
          item.item_name.toLowerCase().includes(q)
        );
        if (matches.length >= requestedLimit * 2) break;
      }
    }

    // Filter by search query
    let items = allItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = allItems.filter(item => 
        item.item_id.toLowerCase().includes(q) ||
        item.item_name.toLowerCase().includes(q)
      );
    }

    const results: SearchResult[] = items.slice(0, requestedLimit).map(item => ({
      id: item.item_id,
      name: item.item_name,
      category: item.category,
      rarity: item.rarity,
      imageUrl: `${HIGHRISE_CDN}/${item.item_id}.png`,
    }));

    res.json({
      items: results,
      hasMore: items.length > requestedLimit,
      source: 'public-api',
      note: !isBridgeConnected() ? 'Connect AP bridge for full search' : undefined,
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

    // Try bridge first
    if (isBridgeConnected()) {
      try {
        const result = await getItemViaBridge(itemId) as { item?: BridgeItem };
        if (result.item) {
          res.json(transformBridgeItem(result.item));
          return;
        }
      } catch (e) {
        console.error('[Highrise] Bridge getItem failed:', e);
      }
    }
    
    // Fallback to public API
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

// Get item types (for bridge search)
router.get('/types', (_req: Request, res: Response) => {
  res.json({ 
    types: ITEM_TYPES,
    bridgeConnected: isBridgeConnected(),
  });
});

export default router;
