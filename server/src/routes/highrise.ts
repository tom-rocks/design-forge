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
  _id?: string;
  _type?: string; // DAvatarItemArchetype, DContainerArchetype, etc.
  disp_id?: string;
  disp_name?: string;
  id?: string;
  item_id?: string;
  name?: string;
  display_name?: string;
  item_name?: string;
  rarity?: string;
  category?: string;
  type?: string;
}

// Only avatar items have valid PNG thumbnails
const VALID_ITEM_TYPES = ['DAvatarItemArchetype'];

// Categories that have valid avatar thumbnails
const AVATAR_CATEGORIES = [
  'shirt', 'pants', 'shorts', 'skirt', 'dress', 'jacket', 'fullsuit',
  'hat', 'shoes', 'glasses', 'bag', 'handbag', 'necklace', 'earrings',
  'gloves', 'watch', 'sock', 'hair_front', 'hair_back', 'eye', 'eyebrow',
  'mouth', 'nose', 'body', 'blush', 'freckle', 'mole', 'lashes', 'face_hair',
  'tattoo', 'aura', 'emote'
];

// Filter out items without valid thumbnails
const hasValidThumbnail = (item: BridgeItem): boolean => {
  const id = item.disp_id || item.id || item.item_id || '';
  
  // Skip containers (cn-...) and other non-avatar items by ID prefix
  if (id.startsWith('cn-') || id.startsWith('room-') || id.startsWith('grab-')) {
    return false;
  }
  
  // If _type is present (bridge response), check if it's an avatar item
  if (item._type && !VALID_ITEM_TYPES.includes(item._type)) {
    return false;
  }
  
  // If category is container or not a known avatar category, skip it
  const category = item.category?.toLowerCase();
  if (category === 'container' || category === 'room' || category === 'grab') {
    return false;
  }
  
  // For bridge responses with category, check if it's a valid avatar category
  // For public API (no _type), allow all categories that pass the above checks
  if (item._type && category && !AVATAR_CATEGORIES.includes(category)) {
    return false;
  }
  
  return true;
};

interface SearchResult {
  id: string;
  name: string;
  category: string;
  rarity: string;
  imageUrl: string;
}

// Transform bridge item to our format (handles GetItemsRequest response)
const transformBridgeItem = (item: BridgeItem): SearchResult => {
  const id = item.disp_id || item.id || item.item_id || '';
  // Debug: log available name fields
  const nameFields = {
    disp_name: item.disp_name,
    name: item.name,
    display_name: item.display_name,
    item_name: item.item_name,
  };
  const resolvedName = item.disp_name || item.name || item.display_name || item.item_name || id;
  console.log(`[Highrise] Item ${id} name resolution:`, nameFields, '→', resolvedName);
  
  return {
    id,
    name: resolvedName,
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
      
      // Use 'type' param (from client) or fall back to 'category' for backwards compat
      const itemCategory = String(type || category || 'all');
      console.log('[Highrise] Category filter:', itemCategory);
      
      try {
        const bridgeResult = await searchItemsViaBridge({
          query: searchQuery,
          category: itemCategory,
          limit: requestedLimit,
          offset: pageNum * requestedLimit,
        }) as { items?: BridgeItem[]; pages?: number };

        // Debug: log first item to see what fields we're getting
        if (bridgeResult.items?.[0]) {
          console.log('[Highrise] Bridge item sample:', JSON.stringify(bridgeResult.items[0], null, 2));
        }

        // Filter out items without valid thumbnails (containers, etc.)
        const validItems = (bridgeResult.items || []).filter(hasValidThumbnail);
        const items = validItems.map(transformBridgeItem);
        
        res.json({
          items,
          hasMore: (bridgeResult.pages || 0) > (pageNum + 1),
          totalPages: bridgeResult.pages || 0,
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

// Image proxy - allows Krea API to fetch Highrise images through our server
// Using wildcard to capture the full item ID including any dots
router.get('/proxy/*', async (req: Request, res: Response) => {
  try {
    // Get the full path after /proxy/
    const fullPath = req.params[0] || '';
    // Remove .png extension if present
    const itemId = fullPath.replace(/\.png$/, '');
    
    if (!itemId) {
      res.status(400).send('Missing item ID');
      return;
    }
    
    const imageUrl = `${HIGHRISE_CDN}/${itemId}.png`;
    console.log('[Highrise] Proxying image:', itemId, '->', imageUrl);
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.log('[Highrise] Image not found:', response.status);
      res.status(response.status).send('Image not found');
      return;
    }
    
    const buffer = await response.arrayBuffer();
    
    // Cache for 1 hour, always return as PNG
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(buffer));
    
  } catch (error) {
    console.error('[Highrise] Proxy error:', error);
    res.status(500).send('Failed to proxy image');
  }
});

export default router;
