# Highrise Image URLs Reference

This document covers all known URL patterns, proxying behavior, and image handling for Highrise assets in Design Forge.

---

## Why We Proxy Everything

Design Forge runs as a microapp **inside the Highrise Admin Panel (AP)**. This creates a unique constraint:

### The Gemini Problem

When sending images to Gemini for AI generation, we **cannot** just pass AP-authenticated URLs because:
1. Gemini's servers can't access AP's authenticated endpoints
2. Data URLs from AP proxy are ephemeral and large
3. External URLs may require auth cookies we can't share

**Solution**: We cache images on our server before sending to Gemini:
```
User selects item → AP proxy fetches with auth → Base64 data URL 
→ POST to our server cache → Server sends to Gemini Files API
```

### AP Context Benefits

Running inside AP means:
- We're in an authenticated context with access to AP's internal APIs
- We can use `postMessage` to communicate with the parent AP iframe
- We can proxy image fetches through AP for authenticated endpoints
- Items from the "new export pipeline" that aren't on CDN yet still work

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
| Crisp | **Sent to Gemini only** | `?crisp=1` |

### Crisp Usage Rules

**IMPORTANT**: Crisp images are ONLY loaded when attaching to Gemini, NOT for browsing.

| Action | Image Quality |
|--------|---------------|
| Browsing items in grid | Regular (fast) |
| Viewing in lightbox | Regular |
| Adding as reference (Alloy) | **Crisp** for clothing |
| Selecting for Refine | **Crisp** for clothing |
| Favoriting | Stores dispId, resolves on use |

This keeps the UI fast while ensuring Gemini gets the best quality input.

## Favorites URL Storage

When favoriting items, we store the `dispId` (NOT the MongoDB `_id`):

```typescript
{
  type: 'item',
  itemData: {
    imageUrl: displayUrl,     // Fallback URL
    itemId: item.dispId,      // MUST be dispId like "shirt-cool-jacket"
    name: item.name,
    category: item.category,  // Used to determine crisp eligibility
    rarity: item.rarity,
  }
}
```

### Validation

Both client and server validate that `itemId` is NOT a MongoDB ObjectId:

```typescript
// Reject if itemId looks like MongoDB _id (24 hex chars)
if (/^[a-f0-9]{24}$/i.test(itemId)) {
  throw new Error('Invalid itemId - must be dispId, not MongoDB _id')
}
```

### URL Resolution Priority

1. If `itemId` exists → construct URL from dispId (most reliable)
2. If clothing category → use crisp URL when attaching to Gemini
3. Fallback → use stored `imageUrl` (for backwards compatibility)

## Works (Generations) URL Patterns

**Thumbnail (for grids):**
```
{API_URL}/api/generations/{generationId}/thumbnail
```

**Full image:**
```
{API_URL}/api/generations/{generationId}/image/{index}
```

## Old vs New Export Pipeline

Highrise has two item export pipelines, and we handle both:

### Old Pipeline (CDN)
- Items available on public CDN
- No authentication required
- URL: `https://cdn.highrisegame.com/avatar/{dispId}.png`

### New Pipeline (AP-only)
- Newer items not yet exported to CDN
- Requires AP authentication
- URL: `https://production-ap.highrise.game/avataritem/front/{dispId}.png`

### Fallback Strategy

When loading an item image:

```
1. Try server proxy: /api/highrise/proxy/{dispId}.png
   ├─ Server tries CDN URL first
   ├─ If 404/1x1 → Server tries AP URL (if we have auth)
   └─ Returns image or error

2. If server returns 1x1 placeholder:
   └─ Client requests via AP postMessage proxy
      └─ AP parent fetches with its auth cookies
      └─ Returns base64 data URL

3. If still 1x1 or error:
   └─ Mark item as failed, hide from grid
```

This ensures both old CDN items and new AP-only items display correctly.

---

## Common Issues

### 1x1 Transparent Pixels

Some items return 1x1 transparent images instead of the actual asset. This happens when:
- The item is from a newer pipeline not yet in the CDN
- Auth is required but not present
- The item type doesn't have a visual representation

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
- `server/src/routes/favorites.ts` - Favorites API with validation

## URL Selection for Different Operations

| Operation | URL to Use |
|-----------|------------|
| Display in grid | `imageUrl` or construct from `dispId` |
| Add as reference | `apImageUrlCrisp` if clothing, else `imageUrl` |
| Send to Gemini | Cached server URL or base64 |
| Download | Full quality URL via proxy if needed |
| Store in favorites | `dispId` (NOT MongoDB `_id`) |

---

*Last updated: January 2026*
