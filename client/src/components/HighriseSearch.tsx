import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Search, Loader2, WifiOff, Expand, Download, Pin, Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'
import { searchItemsViaAP, fetchImageViaAP, checkAPContext } from '../lib/ap-bridge'

const PINNED_ITEMS_KEY = 'pinned-highrise-items'

interface HighriseItem {
  id: string
  dispId: string  // The display ID used for URL construction (e.g., "shirt-cool-jacket")
  name: string
  category: string
  rarity: string
  imageUrl: string
  apImageUrl?: string // Fallback for new pipeline items
  apImageUrlCrisp?: string // Higher quality version for clothing (used when adding as reference)
}

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

interface HighriseSearchProps {
  references?: Reference[]
  onAddReference?: (ref: Reference) => void
  onRemoveReference?: (id: string) => void
  maxRefs?: number
  disabled?: boolean
  bridgeConnected?: boolean
  // Use AP iframe bridge instead of server bridge
  useAPBridge?: boolean
  // Single select mode - pick one item
  singleSelect?: boolean
  onSingleSelect?: (item: HighriseItem) => void
}

export default function HighriseSearch({ 
  references = [],
  onAddReference,
  onRemoveReference,
  maxRefs = 14,
  disabled,
  bridgeConnected = false,
  useAPBridge = false,
  singleSelect = false,
  onSingleSelect
}: HighriseSearchProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [lightbox, setLightbox] = useState<HighriseItem | null>(null)
  const [lightboxImageLoaded, setLightboxImageLoaded] = useState(false)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set()) // Successfully loaded images
  const [proxiedImages, setProxiedImages] = useState<Map<string, string>>(new Map()) // item.id → data URL
  const [proxyingImages, setProxyingImages] = useState<Set<string>>(new Set()) // Currently being proxied
  
  // Get display URL - use proxied data URL if available, otherwise original URL
  const getDisplayUrl = useCallback((item: HighriseItem) => {
    // Use proxied data URL if we fetched it via AP
    if (proxiedImages.has(item.id)) {
      return proxiedImages.get(item.id)!
    }
    return item.imageUrl
  }, [proxiedImages])
  
  // Proxy image through AP parent
  const proxyImageViaAP = useCallback(async (item: HighriseItem) => {
    console.log(`[Highrise] proxyImageViaAP called for ${item.id}, apUrl: ${item.apImageUrl}`)
    if (!item.apImageUrl || proxyingImages.has(item.id) || proxiedImages.has(item.id)) {
      console.log(`[Highrise] Skipping proxy: apUrl=${!!item.apImageUrl}, alreadyProxying=${proxyingImages.has(item.id)}, alreadyProxied=${proxiedImages.has(item.id)}`)
      return
    }
    if (!useAPBridge || !checkAPContext()) {
      // Not in AP context, can't proxy - mark as failed
      console.log(`[Highrise] Not in AP context, marking as failed`)
      setFailedImages(prev => new Set(prev).add(item.id))
      return
    }
    
    console.log(`[Highrise] Starting AP proxy for ${item.id}: ${item.apImageUrl}`)
    setProxyingImages(prev => new Set(prev).add(item.id))
    
    try {
      const dataUrl = await fetchImageViaAP(item.apImageUrl)
      setProxiedImages(prev => new Map(prev).set(item.id, dataUrl))
      console.log(`[Highrise] Successfully proxied ${item.id} via AP, got ${dataUrl.length} bytes`)
    } catch (e) {
      console.error(`[Highrise] AP proxy failed for ${item.id}:`, e)
      setFailedImages(prev => new Set(prev).add(item.id))
    } finally {
      setProxyingImages(prev => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }, [useAPBridge, proxyingImages, proxiedImages])
  
  // Cache image on server (only called when selecting for generation)
  const cacheForGeneration = useCallback(async (item: HighriseItem): Promise<string> => {
    // If we have a proxied data URL, cache it on the server for generation
    if (proxiedImages.has(item.id)) {
      try {
        const base64 = proxiedImages.get(item.id)!
        
        // Cache on server
        await fetch(`${API_URL}/api/highrise/proxy/cache/${item.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64 })
        })
        
        console.log(`[Highrise] Cached ${item.id} for generation`)
      } catch (e) {
        console.error(`[Highrise] Failed to cache ${item.id}:`, e)
      }
    }
    // Return the display URL (data URL if proxied, otherwise original)
    return getDisplayUrl(item)
  }, [proxiedImages, getDisplayUrl])
  const gridRef = useRef<HTMLDivElement>(null)
  
  // Reset image loaded state when lightbox changes
  useEffect(() => {
    if (lightbox) {
      setLightboxImageLoaded(false)
    }
  }, [lightbox?.id])
  
  // Pinned items - persisted to localStorage
  // Normalize URLs on load to use proxy
  const [pinnedItems, setPinnedItems] = useState<HighriseItem[]>(() => {
    try {
      const stored = localStorage.getItem(PINNED_ITEMS_KEY)
      if (!stored) return []
      const items = JSON.parse(stored) as HighriseItem[]
      // Normalize old URLs to use proxy
      return items.map(item => ({
        ...item,
        imageUrl: item.imageUrl.includes('/api/highrise/proxy/') 
          ? item.imageUrl 
          : `${API_URL}/api/highrise/proxy/${item.id}.png`
      }))
    } catch {
      return []
    }
  })
  
  // Save pinned items to localStorage
  useEffect(() => {
    localStorage.setItem(PINNED_ITEMS_KEY, JSON.stringify(pinnedItems))
  }, [pinnedItems])
  
  // Toggle pin status
  const togglePin = (item: HighriseItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedItems(prev => {
      const isPinned = prev.some(p => p.id === item.id)
      if (isPinned) {
        return prev.filter(p => p.id !== item.id)
      } else {
        return [...prev, item]
      }
    })
  }
  
  const isPinned = useCallback((item: HighriseItem) => 
    pinnedItems.some(p => p.id === item.id), [pinnedItems])
  
  // Starred (favorited) items - stored on server (by item ID)
  const [starredUrls, setStarredUrls] = useState<Set<string>>(new Set())
  
  // Fetch starred item IDs on mount
  useEffect(() => {
    const fetchStarred = async () => {
      try {
        const res = await fetch(`${API_URL}/api/favorites/urls`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          // Use itemIds for items (more reliable), urls as fallback for works
          setStarredUrls(new Set([...(data.itemIds || []), ...(data.urls || [])]))
        }
      } catch (e) {
        // Ignore errors - user might not be logged in
      }
    }
    fetchStarred()
  }, [])
  
  // Toggle star status - optimistic update
  const toggleStar = async (item: HighriseItem, e: React.MouseEvent) => {
    e.stopPropagation()
    
    // Use the SAME URL that's displaying in the grid - this is the one that works!
    // This could be a proxied data URL, an AP URL, or a server proxy URL
    const displayUrl = getDisplayUrl(item)
    
    const isCurrentlyStarred = starredUrls.has(item.id)
    
    // Optimistic update - update UI immediately
    if (isCurrentlyStarred) {
      setStarredUrls(prev => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    } else {
      setStarredUrls(prev => new Set(prev).add(item.id))
    }
    
    try {
      if (isCurrentlyStarred) {
        // Note: Full implementation would DELETE the favorite by ID
        // For now, the optimistic update handles the UI
      } else {
        // Add to favorites - use the display URL (the one that's working)
        const res = await fetch(`${API_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'item',
            itemData: {
              imageUrl: displayUrl,
              itemId: item.id,
              name: item.name,
              category: item.category,
              rarity: item.rarity,
            },
          }),
        })
        
        if (!res.ok) {
          // Revert optimistic update on error
          setStarredUrls(prev => {
            const next = new Set(prev)
            next.delete(item.id)
            return next
          })
        }
      }
    } catch (err) {
      console.error('[Highrise] Error toggling star:', err)
      // Revert optimistic update on error
      if (!isCurrentlyStarred) {
        setStarredUrls(prev => {
          const next = new Set(prev)
          next.delete(item.id)
          return next
        })
      }
    }
  }
  
  const isStarred = useCallback((item: HighriseItem) => 
    starredUrls.has(item.id), [starredUrls])

  // Search items
  const searchItems = useCallback(async (append = false) => {
    if (!query.trim() && !bridgeConnected) return
    
    const currentPage = append ? page + 1 : 0
    
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setPage(0)
      setFailedImages(new Set()) // Reset failed images on new search
    }
    
    try {
      let data: { items?: HighriseItem[]; hasMore?: boolean; pages?: number }
      
      if (useAPBridge) {
        // Use direct AP bridge via postMessage
        const result = await searchItemsViaAP({
          query: query.trim(),
          limit: 40,
          offset: currentPage * 40,
        })
        
        // Clothing categories that support crisp=1 for higher quality images
        const CLOTHING_CATEGORIES = [
          'shirt', 'pants', 'shorts', 'skirt', 'dress', 'jacket', 'fullsuit',
          'hat', 'shoes', 'glasses', 'bag', 'handbag', 'necklace', 'earrings',
          'gloves', 'watch', 'sock'
        ]
        
        // Transform AP response to our format
        // Route ALL items through our proxy first - server knows correct CDN URLs
        // Falls back to AP proxy if server can't fetch (auth required, new pipeline, etc.)
        const items = (result.items || [])
          // Filter out hair_back items (same image as hair_front)
          .filter((item: any) => {
            const dispId = item.disp_id || item.id || ''
            return !dispId.startsWith('hair_back-')
          })
          .map((item: any) => {
            const dispId = item.disp_id || item.id
            const category = item.category || 'unknown'
            const isClothing = CLOTHING_CATEGORIES.includes(category)
            
            // Emotes have their image at icon_url/image_url - use directly if available
            if (category === 'emote') {
              const emoteImageUrl = item.icon_url || item.image_url
              if (emoteImageUrl) {
                return {
                  id: item._id || dispId,
                  name: item.disp_name || item.name,
                  category,
                  rarity: item.rarity || 'common',
                  imageUrl: emoteImageUrl,
                }
              }
              // No icon_url - will be filtered by failed image handler
            }
            
            // AP fallback URL depends on item type
            let apImageUrl: string
            let apImageUrlCrisp: string | undefined
            
            if (dispId.startsWith('cn-')) {
              // Container - AP can fetch CDN URL with auth
              apImageUrl = `https://cdn.highrisegame.com/container/${dispId}/full`
            } else if (dispId.startsWith('bg-')) {
              // Background - AP can fetch CDN URL with auth
              apImageUrl = `https://cdn.highrisegame.com/background/${dispId}/full`
            } else {
              // Avatar item - AP has internal endpoint
              apImageUrl = `https://production-ap.highrise.game/avataritem/front/${dispId}.png`
              // Clothing items have a crisp version for higher quality (used when adding as reference)
              if (isClothing) {
                apImageUrlCrisp = `https://production-ap.highrise.game/avataritem/front/${dispId}.png?crisp=1`
              }
            }
            
            // For avatar items in AP context, use AP URL directly (faster, no proxy hop)
            // For other items, try our proxy first (server handles different URL patterns)
            const primaryImageUrl = (useAPBridge && !dispId.startsWith('cn-') && !dispId.startsWith('bg-'))
              ? apImageUrl  // Use AP URL directly when in AP context
              : `${API_URL}/api/highrise/proxy/${dispId}.png?v=3`
            
            return {
              id: item._id || dispId,
              name: item.disp_name || item.name,
              category,
              rarity: item.rarity || 'common',
              imageUrl: primaryImageUrl,
              apImageUrl,
              apImageUrlCrisp,  // Higher quality version for clothing when used as reference
            }
          })
        
        data = {
          items,
          hasMore: (result.pages || 0) > currentPage + 1,
        }
      } else {
        // Use server bridge
        const params = new URLSearchParams()
        if (query.trim()) params.set('q', query.trim())
        params.set('type', 'all')
        params.set('limit', '40')
        params.set('page', String(currentPage))

        const res = await fetch(`${API_URL}/api/highrise/items?${params}`)
        data = await res.json()
      }
      
      if (append) {
        setItems(prev => [...prev, ...(data.items || [])])
        setPage(currentPage)
      } else {
        setItems(data.items || [])
      }
      
      setHasMore(data.hasMore || false)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query, page, bridgeConnected, useAPBridge])

  // Debounced search
  useEffect(() => {
    if (!query.trim() && !bridgeConnected) return
    
    const timeout = setTimeout(() => {
      searchItems(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  // Initial load when bridge connects
  useEffect(() => {
    if (bridgeConnected && items.length === 0) {
      searchItems(false)
    }
  }, [bridgeConnected])

  // Load more
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      searchItems(true)
    }
  }, [loadingMore, hasMore, searchItems])

  // Infinite scroll with scroll event
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = grid
      // Load more when within 100px of bottom
      if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loadingMore) {
        loadMore()
      }
    }

    grid.addEventListener('scroll', handleScroll)
    return () => grid.removeEventListener('scroll', handleScroll)
  }, [hasMore, loadingMore, loadMore])

  // Toggle item selection
  const toggleItem = (item: HighriseItem) => {
    // Single select mode - just call the callback
    if (singleSelect && onSingleSelect) {
      onSingleSelect(item)
      return
    }
    
    // Multi-select mode
    if (!onAddReference || !onRemoveReference) return
    
    const refId = `hr-${item.id}`
    const existingRef = references.find(r => r.id === refId)
    if (existingRef) {
      onRemoveReference(refId)
    } else if (references.length < maxRefs) {
      // Add reference immediately with thumbnail URL for instant feedback
      const referenceUrl = getDisplayUrl(item)
      onAddReference({
        id: refId,
        url: referenceUrl,
        name: item.name,
        type: 'highrise'
      })
      
      // Cache for generation in background (non-blocking)
      cacheForGeneration(item).catch(e => 
        console.warn(`[Highrise] Background cache failed for ${item.id}:`, e)
      )
    }
  }

  // Memoize selected IDs for O(1) lookups (using reference IDs, not URLs, since crisp URLs differ)
  const selectedIds = useMemo(() => new Set(references.map(r => r.id)), [references])
  const isSelected = useCallback((item: HighriseItem) => 
    selectedIds.has(`hr-${item.id}`), 
    [selectedIds]
  )
  
  // Display items: show pinned first when no query, otherwise just search results
  // Filter out items with failed images
  const displayItems = useMemo(() => {
    let result: HighriseItem[]
    if (query.trim()) {
      // Searching - just show results, no pinned priority
      result = items
    } else {
      // Not searching - show pinned items first, then other items (excluding pinned)
      const pinnedIds = new Set(pinnedItems.map(p => p.id))
      const nonPinnedItems = items.filter(i => !pinnedIds.has(i.id))
      result = [...pinnedItems, ...nonPinnedItems]
    }
    // Filter out items with failed images
    return result.filter(item => !failedImages.has(item.id))
  }, [query, items, pinnedItems, failedImages])

  const getRarityColor = (r: string) => {
    switch (r?.toLowerCase()) {
      case 'legendary': return 'rarity-legendary'
      case 'epic': return 'rarity-epic'
      case 'rare': return 'rarity-rare'
      default: return ''
    }
  }

  // Download image
  const downloadImage = async (item: HighriseItem) => {
    try {
      const imageUrl = getDisplayUrl(item)
      // If it's a data URL, we can use it directly
      if (imageUrl.startsWith('data:')) {
        const a = document.createElement('a')
        a.href = imageUrl
        a.download = `${item.name.replace(/[^a-z0-9]/gi, '-')}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        const res = await fetch(imageUrl)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${item.name.replace(/[^a-z0-9]/gi, '-')}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      console.error('Failed to download:', e)
    }
  }

  return (
    <div className="highrise-search">
      {/* Search Bar */}
      <div className="highrise-search-bar">
        <Search className="search-icon" />
        <input
          type="text"
          placeholder={bridgeConnected ? "Search any item..." : "Search (limited)..."}
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={disabled}
          className="input"
        />
        {loading && <Loader2 className="search-loader" />}
      </div>

      {/* Results Grid */}
      <AnimatePresence mode="wait">
        {displayItems.length > 0 ? (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-results"
          >
            <div className="highrise-grid" ref={gridRef}>
              {displayItems.map(item => {
                const selected = isSelected(item)
                const pinned = isPinned(item)
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`highrise-item ${getRarityColor(item.rarity)} ${selected ? 'selected' : ''} ${pinned ? 'pinned' : ''} ${proxyingImages.has(item.id) ? 'loading' : ''} ${!selected && references.length >= maxRefs ? 'disabled' : ''}`}
                    onClick={() => !disabled && toggleItem(item)}
                    title={item.name}
                  >
                    <img
                      src={getDisplayUrl(item)}
                      alt=""
                      loading="lazy"
                      className={loadedImages.has(item.id) ? 'loaded' : ''}
                      onLoad={(e) => {
                        const img = e.currentTarget
                        const is1x1 = img.naturalWidth <= 1 && img.naturalHeight <= 1
                        
                        if (is1x1) {
                          if (proxyingImages.has(item.id)) return
                          
                          if (item.apImageUrl && !proxiedImages.has(item.id)) {
                            proxyImageViaAP(item)
                          } else if (proxiedImages.has(item.id)) {
                            setFailedImages(prev => new Set(prev).add(item.id))
                          }
                        } else {
                          // Successfully loaded a real image - mark as loaded
                          setLoadedImages(prev => new Set(prev).add(item.id))
                        }
                      }}
                      onError={() => {
                        if (proxyingImages.has(item.id)) return
                        
                        if (item.apImageUrl && !proxiedImages.has(item.id)) {
                          proxyImageViaAP(item)
                        } else {
                          setFailedImages(prev => new Set(prev).add(item.id))
                        }
                      }}
                    />
                    {proxyingImages.has(item.id) && (
                      <div className="highrise-item-loading">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    )}
                    {selected && (
                      <div className="highrise-item-check">
                        <span>✓</span>
                      </div>
                    )}
                    {/* Pin button - moves down if starred but not pinned */}
                    <button
                      className={`item-pin ${pinned ? 'active' : ''}`}
                      style={isStarred(item) && !pinned ? { top: '32px' } : undefined}
                      onClick={(e) => togglePin(item, e)}
                      title={pinned ? 'Unpin' : 'Pin to top'}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                    {/* Star button - moves to top if starred and not pinned */}
                    <button
                      className={`item-star ${isStarred(item) ? 'active' : ''}`}
                      style={isStarred(item) && !pinned ? { top: '6px' } : undefined}
                      onClick={(e) => toggleStar(item, e)}
                      title={isStarred(item) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className="w-3 h-3" />
                    </button>
                    {/* Expand button on hover */}
                    <button
                      className="highrise-item-expand"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLightbox(item)
                      }}
                      title="View full size"
                    >
                      <Expand className="w-4 h-4" />
                    </button>
                  </motion.div>
                )
              })}
              
              {/* Loading indicator */}
              {loadingMore && (
                <div className="highrise-loader-sentinel">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
            </div>
          </motion.div>
        ) : loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-loading"
          >
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Searching...</span>
          </motion.div>
        ) : query.trim() && !bridgeConnected ? (
          <motion.div
            key="limited"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-notice"
          >
            <WifiOff className="w-4 h-4" />
            <span>Limited mode - connect bridge for full search</span>
          </motion.div>
        ) : pinnedItems.length > 0 ? (
          <motion.div
            key="pinned-only"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-results"
          >
            <div className="highrise-grid" ref={gridRef}>
              {pinnedItems.map(item => {
                const selected = isSelected(item)
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className={`highrise-item ${getRarityColor(item.rarity)} ${selected ? 'selected' : ''} pinned ${proxyingImages.has(item.id) ? 'loading' : ''} ${!selected && references.length >= maxRefs ? 'disabled' : ''}`}
                    onClick={() => !disabled && toggleItem(item)}
                    title={item.name}
                  >
                    <img
                      src={getDisplayUrl(item)}
                      alt=""
                      loading="lazy"
                      className={loadedImages.has(item.id) ? 'loaded' : ''}
                      onLoad={(e) => {
                        const img = e.currentTarget
                        const is1x1 = img.naturalWidth <= 1 && img.naturalHeight <= 1
                        
                        if (is1x1) {
                          if (proxyingImages.has(item.id)) return
                          
                          if (item.apImageUrl && !proxiedImages.has(item.id)) {
                            proxyImageViaAP(item)
                          } else if (proxiedImages.has(item.id)) {
                            setFailedImages(prev => new Set(prev).add(item.id))
                          }
                        } else {
                          setLoadedImages(prev => new Set(prev).add(item.id))
                        }
                      }}
                      onError={() => {
                        if (proxyingImages.has(item.id)) return
                        
                        if (item.apImageUrl && !proxiedImages.has(item.id)) {
                          proxyImageViaAP(item)
                        } else {
                          setFailedImages(prev => new Set(prev).add(item.id))
                        }
                      }}
                    />
                    {proxyingImages.has(item.id) && (
                      <div className="highrise-item-loading">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    )}
                    {selected && (
                      <div className="highrise-item-check">
                        <span>✓</span>
                      </div>
                    )}
                    <button
                      className="item-pin active"
                      onClick={(e) => togglePin(item, e)}
                      title="Unpin"
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                    <button
                      className={`item-star ${isStarred(item) ? 'active' : ''}`}
                      onClick={(e) => toggleStar(item, e)}
                      title={isStarred(item) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star className="w-3 h-3" />
                    </button>
                    <button
                      className="highrise-item-expand"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLightbox(item)
                      }}
                      title="View full size"
                    >
                      <Expand className="w-4 h-4" />
                    </button>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-empty"
          >
            <span>Search Highrise items above</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
          >
            <motion.div
              className="lightbox-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="lightbox-image-container">
                {!lightboxImageLoaded && (
                  <div className="lightbox-image-loading">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}
                <motion.img
                  src={getDisplayUrl(lightbox)}
                  alt={lightbox.name}
                  onLoad={() => setLightboxImageLoaded(true)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: lightboxImageLoaded ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="lightbox-footer">
                <p className="lightbox-prompt">
                  <strong>{lightbox.name}</strong>
                  <span className="lightbox-meta"> · {lightbox.category} · {lightbox.rarity}</span>
                </p>
                <button
                  className="lightbox-download"
                  onClick={() => downloadImage(lightbox)}
                  title="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
