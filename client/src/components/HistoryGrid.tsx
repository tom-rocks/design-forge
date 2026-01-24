import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Loader2, LogIn, Expand, Pin, Search, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { API_URL } from '../config'
import { Lightbox } from './Lightbox'

const PINNED_IMAGES_KEY = 'pinned-history-images'

// Full generation data from API - includes all settings for replay
interface Generation {
  id: string
  prompt: string
  thumbnailUrl: string | null  // First thumbnail (backwards compat)
  thumbnailUrls?: (string | null)[]  // Per-image thumbnails
  imageUrls: string[]
  created_at: string
  mode: 'create' | 'edit'
  model?: string
  resolution?: string
  aspect_ratio?: string
  parent_id?: string | null  // For edit mode - reference to parent generation
  settings?: {
    styleImages?: { url: string; name?: string }[]
    negativePrompt?: string
    [key: string]: any // Future-proof: accept any additional settings
  }
}

// Replay config - passed back to App.tsx
export interface ReplayConfig {
  prompt: string
  mode: 'create' | 'edit'
  model?: string
  resolution?: string
  aspectRatio?: string
  numImages?: number  // Number of outputs
  references?: { url: string; name?: string }[]
  editImageUrl?: string  // For edit mode - the image being refined
  // Spread any additional settings for future compatibility
  [key: string]: any
}

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

// Flattened image for display - each image is its own entry
interface DisplayImage {
  id: string // unique: gen.id + imageIndex
  imageUrl: string
  thumbnailUrl: string | null // For faster grid loading (only first image has server thumbnail)
  generation: Generation
  imageIndex: number
}

interface HistoryGridProps {
  authenticated?: boolean
  onLogin?: () => void
  references?: Reference[]
  onAddReference?: (ref: Reference) => void
  onRemoveReference?: (id: string) => void
  maxRefs?: number
  disabled?: boolean
  isActive?: boolean // Triggers refresh when tab becomes active
  // Single select mode - pick one generation
  singleSelect?: boolean
  onSingleSelect?: (gen: Generation) => void
  // Replay a generation's settings
  onReplay?: (config: ReplayConfig) => void
  // Refine an image
  onRefine?: (imageUrl: string) => void
  // Use alloy - bulk add references from a generation
  onUseAlloy?: (refs: Reference[]) => void
}

export default function HistoryGrid({
  authenticated = true,
  onLogin,
  references = [],
  onAddReference,
  onRemoveReference,
  maxRefs = 14,
  disabled,
  isActive = false,
  singleSelect = false,
  onSingleSelect,
  onReplay,
  onRefine,
  onUseAlloy,
}: HistoryGridProps) {
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [lightbox, setLightbox] = useState<DisplayImage | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const gridRef = useRef<HTMLDivElement>(null)
  const lastFetchRef = useRef<number>(0)
  
  
  // Pinned individual images (by image ID)
  const [pinnedImageIds, setPinnedImageIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(PINNED_IMAGES_KEY)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })
  
  // Save pinned image IDs to localStorage
  useEffect(() => {
    localStorage.setItem(PINNED_IMAGES_KEY, JSON.stringify([...pinnedImageIds]))
  }, [pinnedImageIds])
  
  // Toggle pin for individual image
  const toggleImagePin = (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedImageIds(prev => {
      const next = new Set(prev)
      if (next.has(imageId)) {
        next.delete(imageId)
      } else {
        next.add(imageId)
      }
      return next
    })
  }
  
  // Starred (favorited) images - stored on server
  const [starredUrls, setStarredUrls] = useState<Set<string>>(new Set())
  
  // Fetch starred URLs on mount
  useEffect(() => {
    const fetchStarred = async () => {
      try {
        const res = await fetch(`${API_URL}/api/favorites/urls`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setStarredUrls(new Set(data.urls || []))
        }
      } catch (e) {
        // Ignore errors - user might not be logged in
      }
    }
    fetchStarred()
  }, [])
  
  // Toggle star for individual image
  const toggleImageStar = async (img: DisplayImage, e: React.MouseEvent) => {
    e.stopPropagation()
    const imageUrl = `${API_URL}${img.imageUrl}`
    const isCurrentlyStarred = starredUrls.has(imageUrl)
    
    try {
      if (isCurrentlyStarred) {
        // Remove from local state
        setStarredUrls(prev => {
          const next = new Set(prev)
          next.delete(imageUrl)
          return next
        })
      } else {
        // Add to favorites - include thumbnail URL for faster grid loading
        const thumbnailUrl = img.generation.thumbnailUrl 
          ? `${API_URL}${img.generation.thumbnailUrl}` 
          : undefined
        const res = await fetch(`${API_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'work',
            itemData: {
              imageUrl,
              thumbnailUrl,
              name: img.generation.prompt?.slice(0, 50) || 'Generation',
              prompt: img.generation.prompt,
              generationId: img.generation.id,
            },
          }),
        })
        
        if (res.ok) {
          setStarredUrls(prev => new Set(prev).add(imageUrl))
        }
      }
    } catch (err) {
      console.error('[History] Error toggling star:', err)
    }
  }
  
  // Flatten generations into individual images, pinned first
  const displayImages = useMemo((): DisplayImage[] => {
    // Flatten all generations into individual images
    const allImages: DisplayImage[] = []
    
    for (const gen of generations) {
      for (let i = 0; i < gen.imageUrls.length; i++) {
        allImages.push({
          id: `${gen.id}-${i}`,
          imageUrl: gen.imageUrls[i],
          // Use per-image thumbnail if available, fallback to first thumbnail for old data
          thumbnailUrl: gen.thumbnailUrls?.[i] ?? (i === 0 ? gen.thumbnailUrl : null),
          generation: gen,
          imageIndex: i,
        })
      }
    }
    
    // Filter by search query
    let filtered = allImages
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = allImages.filter(img => img.generation.prompt?.toLowerCase().includes(query))
    }
    
    // Sort: pinned first, then by date (newest first - already sorted from API)
    const pinned = filtered.filter(img => pinnedImageIds.has(img.id))
    const unpinned = filtered.filter(img => !pinnedImageIds.has(img.id))
    
    return [...pinned, ...unpinned]
  }, [generations, searchQuery, pinnedImageIds])

  // Fetch user's generations
  const fetchGenerations = useCallback(async (append = false) => {
    if (!authenticated) return
    
    const currentOffset = append ? offset + 20 : 0
    
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setOffset(0)
    }
    
    try {
      const res = await fetch(`${API_URL}/api/generations/my?limit=20&offset=${currentOffset}`, {
        credentials: 'include',
      })
      const data = await res.json()
      
      if (append) {
        setGenerations(prev => [...prev, ...data.generations])
        setOffset(currentOffset)
      } else {
        setGenerations(data.generations || [])
      }
      
      setHasMore(data.hasMore || false)
      lastFetchRef.current = Date.now()
    } catch (e) {
      console.error('Failed to fetch history:', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [authenticated, offset])

  // Load on mount and when authenticated changes
  useEffect(() => {
    if (authenticated) {
      fetchGenerations(false)
    }
  }, [authenticated])

  // Refresh when tab becomes active (if stale > 5s)
  useEffect(() => {
    if (isActive && authenticated && Date.now() - lastFetchRef.current > 5000) {
      fetchGenerations(false)
    }
  }, [isActive, authenticated, fetchGenerations])

  // Infinite scroll
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = grid
      if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loadingMore) {
        fetchGenerations(true)
      }
    }

    grid.addEventListener('scroll', handleScroll)
    return () => grid.removeEventListener('scroll', handleScroll)
  }, [hasMore, loadingMore, fetchGenerations])

  // Toggle selection for individual image
  const toggleImage = (img: DisplayImage) => {
    const gen = img.generation
    
    // Single select mode - just call the callback
    if (singleSelect && onSingleSelect) {
      onSingleSelect(gen)
      return
    }
    
    // Multi-select mode
    if (!onAddReference || !onRemoveReference) return
    
    const fullUrl = `${API_URL}${img.imageUrl}`
    const existingRef = references.find(r => r.url === fullUrl)
    
    if (existingRef) {
      onRemoveReference(existingRef.id)
    } else if (references.length < maxRefs) {
      onAddReference({
        id: `img-${img.id}`,
        url: fullUrl,
        name: gen.prompt.slice(0, 30),
        type: 'generation',
      })
    }
  }

  const isImageSelected = (img: DisplayImage) => {
    const fullUrl = `${API_URL}${img.imageUrl}`
    return references.some(r => r.url === fullUrl)
  }

  // Download image from URL
  const downloadImageFromUrl = async (imageUrl: string, prompt?: string) => {
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // Create filename from prompt or use generic name
      const safeName = prompt?.slice(0, 30).replace(/[^a-z0-9]/gi, '-') || 'image'
      a.download = `${safeName}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to download:', e)
    }
  }
  
  // Replay generation - restore all settings
  const replayGeneration = (gen: Generation) => {
    if (!onReplay) return
    
    // Build replay config from stored generation data
    // Future-proof: spread settings so new params auto-included
    const config: ReplayConfig = {
      prompt: gen.prompt,
      mode: gen.mode || 'create',
      model: gen.model,
      resolution: gen.resolution,
      aspectRatio: gen.aspect_ratio,
      numImages: gen.settings?.numImages,
      references: gen.settings?.styleImages,
      // For edit mode, include the parent image URL
      editImageUrl: gen.mode === 'edit' && gen.parent_id 
        ? `/api/generations/${gen.parent_id}/image/0`
        : undefined,
      ...gen.settings, // Include any additional settings for future compatibility
    }
    
    onReplay(config)
    setLightbox(null) // Close lightbox after replay
  }
  
  // Use alloy - add all style references from a generation
  const useAlloy = (gen: Generation) => {
    if (!onUseAlloy || !gen.settings?.styleImages?.length) return
    
    // Convert styleImages to Reference format
    const refs: Reference[] = gen.settings.styleImages.map((img, i) => ({
      id: `alloy-${gen.id}-${i}-${Date.now()}`,
      url: img.url.startsWith('http') || img.url.startsWith('data:') || img.url.startsWith('/') 
        ? img.url 
        : `${API_URL}${img.url}`,
      name: img.name || `Ref ${i + 1}`,
      type: 'generation' as const,
    }))
    
    onUseAlloy(refs)
    setLightbox(null) // Close lightbox after using alloy
  }

  // Not authenticated
  if (!authenticated) {
    return (
      <div className="history-empty">
        <LogIn className="w-5 h-5" />
        <span>Sign in to view your history</span>
        <button onClick={onLogin} className="btn btn-dark">
          Sign in with Google
        </button>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="history-loading">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Loading history...</span>
      </div>
    )
  }

  // Empty
  if (generations.length === 0) {
    return (
      <div className="history-empty">
        <span>No generations yet</span>
      </div>
    )
  }

  return (
    <>
      {/* Search bar */}
      <div className="history-search">
        <Search className="search-icon" />
        <input
          type="text"
          placeholder="Search by prompt..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="input"
        />
      </div>
      <div className="highrise-grid" ref={gridRef}>
        {displayImages.map(img => {
          const gen = img.generation
          const selected = isImageSelected(img)
          const pinned = pinnedImageIds.has(img.id)
          return (
            <motion.div
              key={img.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`history-item ${selected ? 'selected' : ''} ${pinned ? 'pinned' : ''} ${!selected && references.length >= maxRefs ? 'disabled' : ''}`}
              onClick={() => !disabled && toggleImage(img)}
              title={gen.prompt}
            >
              <img
                src={`${API_URL}${img.thumbnailUrl || img.imageUrl}`}
                alt={gen.prompt}
                loading="lazy"
                decoding="async"
                className={loadedImages.has(img.id) ? 'loaded' : ''}
                onLoad={() => setLoadedImages(prev => new Set(prev).add(img.id))}
                onError={(e) => {
                  // If thumbnail fails (502), fall back to full image
                  const target = e.target as HTMLImageElement
                  if (img.thumbnailUrl && !target.src.includes(img.imageUrl)) {
                    target.src = `${API_URL}${img.imageUrl}`
                  }
                }}
              />
              {selected && (
                <div className="history-item-check">
                  <span>✓</span>
                </div>
              )}
              {/* Pin button - moves down if starred but not pinned */}
              <button
                className={`item-pin ${pinned ? 'active' : ''}`}
                style={starredUrls.has(`${API_URL}${img.imageUrl}`) && !pinned ? { top: '32px' } : undefined}
                onClick={(e) => toggleImagePin(img.id, e)}
                title={pinned ? 'Unpin' : 'Pin to top'}
              >
                <Pin className="w-3 h-3" />
              </button>
              {/* Star button - moves to top if starred and not pinned */}
              <button
                className={`item-star ${starredUrls.has(`${API_URL}${img.imageUrl}`) ? 'active' : ''}`}
                style={starredUrls.has(`${API_URL}${img.imageUrl}`) && !pinned ? { top: '6px' } : undefined}
                onClick={(e) => toggleImageStar(img, e)}
                title={starredUrls.has(`${API_URL}${img.imageUrl}`) ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star className="w-3 h-3" />
              </button>
              {/* Expand button on hover */}
              <button
                className="history-item-expand"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox(img)
                }}
                title="View full size"
              >
                <Expand className="w-4 h-4" />
              </button>
            </motion.div>
          )
        })}
        
        {loadingMore && (
          <div className="history-loader-sentinel">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        )}
      </div>

      {/* Lightbox */}
      <Lightbox
        data={lightbox ? {
          imageUrl: `${API_URL}${lightbox.imageUrl}`,
          prompt: lightbox.generation.prompt,
          mode: lightbox.generation.mode,
          model: lightbox.generation.model,
          resolution: lightbox.generation.resolution,
          aspectRatio: lightbox.generation.aspect_ratio,
          references: lightbox.generation.settings?.styleImages?.map(img => ({
            url: img.url.startsWith('http') || img.url.startsWith('data:') ? img.url : `${API_URL}${img.url}`,
            name: img.name,
          })),
        } : null}
        onClose={() => setLightbox(null)}
        onDownload={(url) => downloadImageFromUrl(url, lightbox?.generation.prompt || '')}
        onRefine={onRefine ? (url) => {
          onRefine(url)
          setLightbox(null)
        } : undefined}
        onReplay={onReplay && lightbox ? () => {
          replayGeneration(lightbox.generation)
        } : undefined}
        onUseAlloy={onUseAlloy && lightbox?.generation.settings?.styleImages ? () => {
          useAlloy(lightbox.generation)
        } : undefined}
        onFavorite={lightbox ? () => {
          toggleImageStar(lightbox, { stopPropagation: () => {} } as React.MouseEvent)
        } : undefined}
        isFavorited={lightbox ? starredUrls.has(`${API_URL}${lightbox.imageUrl}`) : false}
      />
    </>
  )
}
