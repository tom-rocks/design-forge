# Highrise Image URLs Reference

This document covers all known URL patterns, proxying behavior, and image handling for Highrise assets in Design Forge.

## Context

Design Forge runs as a microapp **inside the Highrise Admin Panel (AP)**. This means:
- We're in an authenticated context with access to AP's internal APIs
- We can use `postMessage` to communicate with the parent AP iframe
- We can proxy image fetches through AP for authenticated endpoints

## Item Types and URL Patterns

### 1. Avatar Items (Clothing, Accessories, etc.)

**Display URL (for showing in UI):**
```
https://production-ap.highrise.game/avataritem/front/{dispId}.png
```

**Crisp URL (higher quality, for generation):**
```
https://production-ap.highrise.game/avataritem/front/{dispId}.png?crisp=1
```

**Categories that support crisp:**
- shirt, pants, shorts, skirt, dress, jacket, fullsuit
- hat, shoes, glasses, bag, handbag, necklace, earrings
- gloves, watch, sock

**Server proxy URL (fallback when AP proxy unavailable):**
```
{API_URL}/api/highrise/proxy/{dispId}
```

### 2. Backgrounds

**CDN URL (public, no auth required):**
```
https://cdn.highrisegame.com/background/{dispId}/full
```

**dispId format:** `bg-{name}` (e.g., `bg-sunset-beach`)

### 3. Containers (Grab items, Room items)

**CDN URL (public, no auth required):**
```
https://cdn.highrisegame.com/container/{dispId}/full
```

**dispId format:** `cn-{name}` (e.g., `cn-golden-chest`)

### 4. Emotes

Emotes have their image directly in the API response:
```
item.icon_url || item.image_url
```

No separate URL construction needed.

## Proxying Strategy

### When to Proxy

1. **New pipeline items** - Items that return 1x1 transparent pixels from the standard URL need AP proxy
2. **Avatar items in non-AP context** - If running outside AP iframe, need server proxy
3. **For generation** - Images sent to Gemini must be cached on server first

### AP Iframe Proxy (via postMessage)

Used when `checkAPContext()` returns true (we're in AP iframe):

```typescript
// Request image via AP parent
const dataUrl = await fetchImageViaAP(apImageUrl)
```

The AP parent fetches the image with its auth cookies and returns a base64 data URL.

### Server Proxy

For caching images for generation:

```typescript
// Cache on server for Gemini
await fetch(`${API_URL}/api/highrise/proxy/cache/${item.id}`, {
  method: 'POST',
  body: JSON.stringify({ base64: dataUrl })
})
```

## Image Quality Tiers

| Tier | Use Case | URL Parameter |
|------|----------|---------------|
| Thumbnail | Grid display, fast loading | Default (no param) |
| Standard | Lightbox, preview | Default (no param) |
| Crisp | Generation input, high quality | `?crisp=1` |

## Favorites URL Storage

When favoriting items, we store:

```typescript
{
  type: 'item',
  itemData: {
    imageUrl: displayUrl,     // The URL that was working when starred
    itemId: item.id,          // The dispId for URL reconstruction
    name: item.name,
    category: item.category,
    rarity: item.rarity,
  }
}
```

**URL Resolution Priority:**
1. If `itemId` exists → construct URL from ID (most reliable)
2. Fallback → use stored `imageUrl` (for backwards compatibility)

## Works (Generations) URL Patterns

**Thumbnail (for grids):**
```
{API_URL}/api/generations/{generationId}/thumbnail
```

**Full image:**
```
{API_URL}/api/generations/{generationId}/image/{index}
```

## Common Issues

### 1x1 Transparent Pixels

Some items return 1x1 transparent images instead of the actual asset. This happens when:
- The item is from a newer pipeline not yet in the CDN
- Auth is required but not present

**Detection:**
```typescript
const is1x1 = img.naturalWidth <= 1 && img.naturalHeight <= 1
```

**Solution:** Use AP proxy to fetch via authenticated endpoint.

### CORS Issues

CDN URLs are generally CORS-friendly. Production-ap URLs may need proxy in some contexts.

### Auth Token Expiry

Data URLs cached from AP proxy don't expire, but stored URLs to production-ap may fail if:
- User is no longer in AP context
- Session expired

**Solution:** Store `itemId` and reconstruct URLs rather than storing ephemeral URLs.

## Code References

- `client/src/components/HighriseSearch.tsx` - Item search and display
- `client/src/components/Favorites.tsx` - Favorites with URL resolution
- `client/src/lib/ap-bridge.ts` - AP iframe communication
- `server/src/routes/highrise.ts` - Server-side proxy endpoints

## URL Selection for Different Operations

| Operation | URL to Use |
|-----------|------------|
| Display in grid | `imageUrl` or construct from `itemId` |
| Add as reference | `apImageUrlCrisp` if clothing, else `imageUrl` |
| Send to Gemini | Cached server URL or base64 |
| Download | Full quality URL via proxy if needed |
