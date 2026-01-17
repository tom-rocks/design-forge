import { Router, Request, Response } from 'express';
import { isBridgeConnected, searchItemsViaBridge, getItemViaBridge } from '../bridge.js';

const router = Router();

const HIGHRISE_API = 'https://webapi.highrise.game';
const HIGHRISE_CDN = 'https://cdn.highrisegame.com';

// Get the correct CDN URL for an item based on its disp_id
function getItemCdnUrl(itemId: string): string {
  if (itemId.startsWith('bg-')) {
    // Backgrounds: /background/{disp_id}/full
    return `${HIGHRISE_CDN}/background/${itemId}/full`;
  } else if (itemId.startsWith('cn-')) {
    // Containers: /container/{disp_id}/full
    return `${HIGHRISE_CDN}/container/${itemId}/full`;
  } else {
    // Avatar items: /avatar/{disp_id}.png
    return `${HIGHRISE_CDN}/avatar/${itemId}.png`;
  }
}

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

// Item types that have valid images (avatar items, backgrounds, containers)
const VALID_ITEM_TYPES = ['DAvatarItemArchetype', 'DBackgroundArchetype', 'DContainerArchetype'];

// Categories that have valid avatar thumbnails
const AVATAR_CATEGORIES = [
  'shirt', 'pants', 'shorts', 'skirt', 'dress', 'jacket', 'fullsuit',
  'hat', 'shoes', 'glasses', 'bag', 'handbag', 'necklace', 'earrings',
  'gloves', 'watch', 'sock', 'hair_front', 'hair_back', 'eye', 'eyebrow',
  'mouth', 'nose', 'body', 'blush', 'freckle', 'mole', 'lashes', 'face_hair',
  'tattoo', 'aura', 'emote'
];

// Filter out items without valid images
const hasValidThumbnail = (item: BridgeItem): boolean => {
  const id = item.disp_id || item.id || item.item_id || '';
  
  // Skip items that don't have displayable thumbnails
  // - room items, grab bags
  // - btd (background decals) - game-only assets, no thumbnails
  if (id.startsWith('room-') || id.startsWith('grab-') || id.startsWith('btd-') || id.startsWith('btd_')) {
    return false;
  }
  
  // Allow profile backgrounds and containers - they have images at different CDN paths
  if (id.startsWith('bg-') || id.startsWith('cn-')) {
    return true;
  }
  
  // If _type is present (bridge response), check if it's in our valid types
  if (item._type && !VALID_ITEM_TYPES.includes(item._type)) {
    return false;
  }
  
  // Skip room/grab categories
  const category = item.category?.toLowerCase();
  if (category === 'room' || category === 'grab') {
    return false;
  }
  
  // For bridge responses with category, check if it's a valid avatar category
  // But allow profile_background and container categories
  if (item._type && category) {
    if (category === 'profile_background' || category === 'container') {
      return true;
    }
    if (!AVATAR_CATEGORIES.includes(category)) {
      return false;
    }
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
  const resolvedName = item.disp_name || item.name || item.display_name || item.item_name || id;
  
  return {
    id,
    name: resolvedName,
    category: item.category || item.type || 'unknown',
    rarity: item.rarity || 'common',
    // Use proxy URL so we can debug/log image fetches
    imageUrl: `/api/highrise/proxy/${id}.png`,
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
      imageUrl: `/api/highrise/proxy/${item.item_id}.png`,
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
      imageUrl: `/api/highrise/proxy/${item.item_id}.png`,
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

// In-memory proxy log buffer
const proxyLogs: { timestamp: string; itemId: string; status: string; details?: string }[] = [];
const MAX_PROXY_LOGS = 50;

function logProxy(itemId: string, status: string, details?: string) {
  const entry = { timestamp: new Date().toISOString(), itemId, status, details };
  proxyLogs.unshift(entry);
  if (proxyLogs.length > MAX_PROXY_LOGS) proxyLogs.pop();
  console.log(`[Highrise Proxy] ${itemId}: ${status}${details ? ` - ${details}` : ''}`);
}

// Debug endpoint for proxy logs
router.get('/proxy-logs', (_req: Request, res: Response) => {
  res.json({ logs: proxyLogs });
});

// In-memory image cache for new pipeline items (stolen from AP by client)
const imageCache = new Map<string, Buffer>();

// Client uploads image it stole from AP (for new pipeline items server can't access)
router.post('/proxy/cache/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;
  
  // Expect base64 JSON body
  const { base64 } = req.body as { base64?: string };
  if (!base64) {
    res.status(400).json({ error: 'Missing base64 data' });
    return;
  }
  
  // Decode base64 (strip data URL prefix if present)
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  if (buffer.length < 500) {
    res.status(400).json({ error: 'Invalid image data' });
    return;
  }
  
  // Cache it
  imageCache.set(itemId, buffer);
  logProxy(itemId, 'CACHED', `${buffer.length} bytes stolen from AP`);
  
  res.json({ ok: true, size: buffer.length });
});

// Image proxy - allows Krea API to fetch Highrise images through our server
// Using wildcard to capture the full item ID including any dots
router.get('/proxy/*', async (req: Request, res: Response) => {
  const fullPath = req.params[0] || '';
  const itemId = fullPath.replace(/\.png$/, '');
  
  if (!itemId) {
    logProxy('(empty)', 'ERROR', 'Missing item ID');
    res.status(400).send('Missing item ID');
    return;
  }
  
  // Check cache first (for new pipeline items stolen from AP)
  const cached = imageCache.get(itemId);
  if (cached) {
    logProxy(itemId, 'CACHE_HIT', `${cached.length} bytes`);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(cached);
    return;
  }
  
  // Get correct CDN URL based on item type (avatar, background, container)
  const imageUrl = getItemCdnUrl(itemId);
  logProxy(itemId, 'FETCHING', imageUrl);
  
  try {
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      logProxy(itemId, 'CDN_ERROR', `Status ${response.status} ${response.statusText}`);
      res.set('Cache-Control', 'no-store');
      res.status(response.status).send('Image not found');
      return;
    }
    
    const buffer = await response.arrayBuffer();
    
    // CDN returns tiny placeholder (69 bytes) for items on new asset pipeline
    // Return 404 so client can steal from AP - don't cache this response!
    if (buffer.byteLength < 500) {
      logProxy(itemId, 'NEW_PIPELINE', `${buffer.byteLength} bytes placeholder - needs AP URL`);
      res.set('Cache-Control', 'no-store');
      res.status(404).json({ error: 'new_pipeline', itemId });
      return;
    }
    
    logProxy(itemId, 'OK', `${buffer.byteLength} bytes`);
    
    // Cache for 1 hour, always return as PNG
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(buffer));
    
  } catch (error) {
    logProxy(itemId, 'EXCEPTION', String(error));
    res.status(500).send('Failed to proxy image');
  }
});

export default router;
