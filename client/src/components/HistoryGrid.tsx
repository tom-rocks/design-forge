import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Loader2, ImageOff, LogIn, Expand, Download, Pin, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'

const PINNED_GENS_KEY = 'pinned-generations'

// Full generation data from API - includes all settings for replay
interface Generation {
  id: string
  prompt: string
  thumbnailUrl: string | null
  imageUrls: string[]
  created_at: string
  mode: 'create' | 'edit'
  model?: string
  resolution?: string
  aspect_ratio?: string
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
  references?: { url: string; name?: string }[]
  // Spread any additional settings for future compatibility
  [key: string]: any
}

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
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
}: HistoryGridProps) {
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [lightbox, setLightbox] = useState<Generation | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const lastFetchRef = useRef<number>(0)
  
  // Pinned generations - persisted to localStorage
  const [pinnedGens, setPinnedGens] = useState<Generation[]>(() => {
    try {
      const stored = localStorage.getItem(PINNED_GENS_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  
  // Save pinned generations to localStorage
  useEffect(() => {
    localStorage.setItem(PINNED_GENS_KEY, JSON.stringify(pinnedGens))
  }, [pinnedGens])
  
  // Toggle pin status
  const togglePin = (gen: Generation, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinnedGens(prev => {
      const isPinned = prev.some(p => p.id === gen.id)
      if (isPinned) {
        return prev.filter(p => p.id !== gen.id)
      } else {
        return [...prev, gen]
      }
    })
  }
  
  const isPinned = useCallback((gen: Generation) => 
    pinnedGens.some(p => p.id === gen.id), [pinnedGens])
  
  // Display generations: pinned first, then rest
  const displayGenerations = useMemo(() => {
    const pinnedIds = new Set(pinnedGens.map(p => p.id))
    const nonPinnedGens = generations.filter(g => !pinnedIds.has(g.id))
    return [...pinnedGens, ...nonPinnedGens]
  }, [generations, pinnedGens])

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

  // Toggle selection
  const toggleGeneration = (gen: Generation) => {
    const imageUrl = gen.imageUrls[0]
    if (!imageUrl) return
    
    // Single select mode - just call the callback
    if (singleSelect && onSingleSelect) {
      onSingleSelect(gen)
      return
    }
    
    // Multi-select mode
    if (!onAddReference || !onRemoveReference) return
    
    const fullUrl = `${API_URL}${imageUrl}`
    const existingRef = references.find(r => r.url === fullUrl)
    
    if (existingRef) {
      onRemoveReference(existingRef.id)
    } else if (references.length < maxRefs) {
      onAddReference({
        id: `gen-${gen.id}`,
        url: fullUrl,
        name: gen.prompt.slice(0, 30),
        type: 'generation',
      })
    }
  }

  const isSelected = (gen: Generation) => {
    const imageUrl = gen.imageUrls[0]
    if (!imageUrl) return false
    const fullUrl = `${API_URL}${imageUrl}`
    return references.some(r => r.url === fullUrl)
  }

  // Download image
  const downloadImage = async (gen: Generation) => {
    const imageUrl = gen.imageUrls[0]
    if (!imageUrl) return
    
    try {
      const res = await fetch(`${API_URL}${imageUrl}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `generation-${gen.id}.png`
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
      references: gen.settings?.styleImages,
      ...gen.settings, // Include any additional settings for future compatibility
    }
    
    onReplay(config)
    setLightbox(null) // Close lightbox after replay
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
      <div className="history-grid" ref={gridRef}>
        {displayGenerations.map(gen => {
          const selected = isSelected(gen)
          const pinned = isPinned(gen)
          return (
            <motion.div
              key={gen.id}
              layout
              layoutId={`history-${gen.id}`}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={`history-item ${selected ? 'selected' : ''} ${pinned ? 'pinned' : ''} ${!selected && references.length >= maxRefs ? 'disabled' : ''}`}
              onClick={() => !disabled && toggleGeneration(gen)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              title={gen.prompt}
            >
              {gen.thumbnailUrl ? (
                <img
                  src={`${API_URL}${gen.thumbnailUrl}`}
                  alt={gen.prompt}
                  loading="lazy"
                />
              ) : (
                <div className="history-item-placeholder">
                  <ImageOff className="w-5 h-5" />
                </div>
              )}
              {selected && (
                <div className="history-item-check">
                  <span>✓</span>
                </div>
              )}
              {/* Pin button */}
              <button
                className={`item-pin ${pinned ? 'active' : ''}`}
                onClick={(e) => togglePin(gen, e)}
                title={pinned ? 'Unpin' : 'Pin to top'}
              >
                <Pin className="w-3 h-3" />
              </button>
              {/* Expand button on hover */}
              <button
                className="history-item-expand"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox(gen)
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
              <img
                src={`${API_URL}${lightbox.imageUrls[0]}`}
                alt={lightbox.prompt}
              />
              <div className="lightbox-footer">
                <p className="lightbox-prompt">{lightbox.prompt}</p>
                <div className="lightbox-actions">
                  {onReplay && (
                    <button
                      className="lightbox-download"
                      onClick={() => replayGeneration(lightbox)}
                      title="Replay settings"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    className="lightbox-download"
                    onClick={() => downloadImage(lightbox)}
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
