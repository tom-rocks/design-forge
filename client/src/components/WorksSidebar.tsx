import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, ImageOff, X, Plus, Trash2, Flame, Hammer, Box, Boxes } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'

interface Generation {
  id: string
  prompt: string
  thumbnailUrl: string | null
  thumbnailUrls?: (string | null)[]
  imageUrls: string[]
  created_at: string
  mode: 'create' | 'edit'
  model?: string
  resolution?: string
  aspect_ratio?: string
  parent_id?: string | null // For edit mode - reference to parent generation
  settings?: {
    styleImages?: { url: string; name?: string }[]
    [key: string]: any
  }
}

interface DisplayImage {
  id: string
  imageUrl: string
  thumbnailUrl: string | null
  generation: Generation
  imageIndex: number
}

interface PendingGeneration {
  id: string
  prompt: string
  outputCount: number
  mode: 'create' | 'edit'
  references?: Array<{ id: string; url: string; thumbnailUrl?: string; name?: string; type: string }>
  editImageUrl?: string
}

interface WorksSidebarProps {
  authenticated: boolean
  onSelectImage?: (imageUrl: string, generation: Generation) => void
  onOpenWorksModal?: () => void
  newGenerationId?: string | null // ID of newly completed generation to prepend
  pendingGenerations?: PendingGeneration[] // Shows at top while forging
  onCancelPending?: (pendingId: string) => void // Cancel a specific pending generation
  onSelectPending?: (pendingId: string) => void // Select pending to show when complete
  selectedPendingId?: string | null // Currently selected pending generation
  onNewForge?: () => void // Start a new forge (clear canvas)
  onDeleteImage?: (generationId: string) => void // Delete a generation
  isNewForgeActive?: boolean // True when canvas is fresh/empty (we're "in" new forge)
  selectedImageUrl?: string | null // Currently selected/viewed image URL
}

export function WorksSidebar({ 
  authenticated, 
  onSelectImage,
  onOpenWorksModal,
  newGenerationId,
  pendingGenerations = [],
  onCancelPending,
  onSelectPending,
  selectedPendingId,
  onNewForge,
  onDeleteImage,
  isNewForgeActive = false,
  selectedImageUrl
}: WorksSidebarProps) {
  const [hoveredPendingId, setHoveredPendingId] = useState<string | null>(null)
  const [hoveredImageId, setHoveredImageId] = useState<string | null>(null)
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)
  const LIMIT = 20

  const handleImageError = useCallback((imageId: string) => {
    setFailedImages(prev => new Set(prev).add(imageId))
  }, [])

  // Flatten generations into individual images
  const displayImages: DisplayImage[] = generations.flatMap(gen => 
    gen.imageUrls.map((url, idx) => ({
      id: `${gen.id}-${idx}`,
      imageUrl: url,
      thumbnailUrl: gen.thumbnailUrls?.[idx] ?? (idx === 0 ? gen.thumbnailUrl : null),
      generation: gen,
      imageIndex: idx
    }))
  )

  const fetchGenerations = useCallback(async (loadMore = false) => {
    if (!authenticated) return
    
    if (loadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    
    try {
      const currentOffset = loadMore ? offset : 0
      const res = await fetch(
        `${API_URL}/api/generations/my?limit=${LIMIT}&offset=${currentOffset}`,
        { credentials: 'include' }
      )
      
      if (!res.ok) throw new Error('Failed to fetch')
      
      const data = await res.json()
      
      if (loadMore) {
        setGenerations(prev => [...prev, ...data.generations])
      } else {
        setGenerations(data.generations)
      }
      
      setHasMore(data.hasMore)
      setOffset(currentOffset + data.generations.length)
    } catch (err) {
      console.error('Failed to fetch generations:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [authenticated, offset])

  // Initial load
  useEffect(() => {
    if (authenticated) {
      fetchGenerations(false)
    }
  }, [authenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track which generation IDs we've already processed
  const processedIdsRef = useRef<Set<string>>(new Set())
  
  // Prepend new generation when completed (avoids full refresh)
  useEffect(() => {
    if (!newGenerationId || !authenticated) return
    
    // Skip if we've already processed this ID
    if (processedIdsRef.current.has(newGenerationId)) return
    processedIdsRef.current.add(newGenerationId)
    
    // Fetch only this specific generation and prepend
    const fetchNewGeneration = async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/generations/${newGenerationId}`,
          { credentials: 'include' }
        )
        if (!res.ok) return
        
        const newGen = await res.json()
        if (newGen) {
          setGenerations(prev => {
            // Double-check we don't already have it
            if (prev.some(g => g.id === newGen.id)) return prev
            return [newGen, ...prev]
          })
          // Scroll to top to show the new generation
          if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
          }
        }
      } catch (err) {
        console.error('Failed to fetch new generation:', err)
      }
    }
    
    fetchNewGeneration()
  }, [newGenerationId, authenticated]) // Removed 'generations' dependency

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || loadingMore || !hasMore) return
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchGenerations(true)
    }
  }, [loadingMore, hasMore, fetchGenerations])

  if (!authenticated) {
    return null
  }

  return (
    <div className="gen-panel">
      <div className="gen-panel-box">
        {/* Header */}
        <div className="gen-panel-head">
          <Box className="gen-panel-icon" />
          <span className="gen-panel-label">Works</span>
        </div>

        {/* Scrollable content */}
        <div 
          className="gen-panel-list" 
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {loading && pendingGenerations.length === 0 ? (
            <div className="gen-panel-wait">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : displayImages.length === 0 && pendingGenerations.length === 0 ? (
            <div className="gen-panel-none">
              No works yet
            </div>
          ) : (
            <div className="gen-panel-items">
              <AnimatePresence mode="popLayout">
                {/* New Forge button - always at top */}
                <motion.button
                  key="new-forge"
                  layout="position"
                  className={`gen-panel-thumb gen-panel-new-forge ${isNewForgeActive ? 'active' : ''}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ 
                    layout: { 
                      type: "spring",
                      stiffness: 300,
                      damping: 30
                    }
                  }}
                  onClick={onNewForge}
                  title={isNewForgeActive ? "Ready to forge" : "Start new forge"}
                >
                  <Flame style={{ width: 18, height: 18 }} />
                  <Plus style={{ width: 18, height: 18 }} />
                </motion.button>
                
                {/* Pending generation placeholders - show all while forging */}
                {pendingGenerations.flatMap(pending => 
                  [...Array(pending.outputCount)].map((_, i) => {
                    const isFirst = i === 0 // Only show cancel on first image of each generation
                    const isHovered = hoveredPendingId === pending.id
                    const isSelected = selectedPendingId === pending.id
                    
                    return (
                      <motion.button
                        key={`pending-${pending.id}-${i}`}
                        layout="position"
                        className={`gen-panel-thumb forging ${pending.mode === 'edit' ? 'forging-refine' : ''} ${isSelected ? 'selected' : ''}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ 
                          duration: 0.2,
                          ease: [0.4, 0, 0.2, 1],
                          layout: { 
                            type: "spring",
                            stiffness: 300,
                            damping: 30
                          }
                        }}
                        title={`${pending.mode === 'edit' ? 'Refining' : 'Forging'}: ${pending.prompt?.slice(0, 50) || ''}...\nClick to select, X to cancel`}
                        onClick={() => onSelectPending?.(pending.id)}
                        onMouseEnter={() => setHoveredPendingId(pending.id)}
                        onMouseLeave={() => setHoveredPendingId(null)}
                      >
                        <div className="gen-panel-thumb-forging">
                          {pending.mode === 'edit' 
                            ? <Hammer className="forging-icon forging-icon-refine" />
                            : <Flame className="forging-icon forging-icon-forge" />
                          }
                        </div>
                        {/* Cancel button - only on first image of each generation, on hover */}
                        {isFirst && (isHovered || isSelected) && (
                          <button
                            className="gen-panel-cancel"
                            onClick={(e) => {
                              e.stopPropagation()
                              onCancelPending?.(pending.id)
                            }}
                            title="Cancel generation"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </motion.button>
                    )
                  })
                )}
                
                {/* Existing generations */}
                {displayImages.map((img, index) => {
                  const isFailed = failedImages.has(img.id)
                  const isSelected = selectedImageUrl === `${API_URL}${img.imageUrl}`
                  return (
                    <motion.button
                      key={img.id}
                      layout="position"
                      className={`gen-panel-thumb ${isFailed ? 'failed' : ''} ${isSelected ? 'selected' : ''}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ 
                        duration: 0.2,
                        delay: index === 0 ? 0.1 : 0, // Slight delay for newest item
                        ease: [0.4, 0, 0.2, 1],
                        layout: { 
                          type: "spring",
                          stiffness: 300,
                          damping: 30
                        }
                      }}
                      onClick={() => {
                        // Don't select broken images
                        if (!isFailed) {
                          onSelectImage?.(
                            `${API_URL}${img.imageUrl}`,
                            img.generation
                          )
                        }
                      }}
                      onMouseEnter={() => setHoveredImageId(img.id)}
                      onMouseLeave={() => setHoveredImageId(null)}
                      title={isFailed ? 'Image unavailable - click trash to remove' : (img.generation.prompt || 'Click to view')}
                    >
                      {isFailed ? (
                        <div className="gen-panel-thumb-err">
                          <ImageOff className="w-5 h-5" />
                        </div>
                      ) : (
                        <img 
                          src={img.thumbnailUrl 
                            ? `${API_URL}${img.thumbnailUrl}` 
                            : `${API_URL}${img.imageUrl}`
                          }
                          alt=""
                          loading="lazy"
                          onError={() => handleImageError(img.id)}
                        />
                      )}
                      {/* Delete button - always show for failed images, hover for normal */}
                      {(isFailed || hoveredImageId === img.id) && onDeleteImage && (
                        <button
                          className="gen-panel-delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!confirm('Delete this generation?')) return
                            // Optimistically remove from local state for smooth animation
                            setGenerations(prev => prev.filter(g => g.id !== img.generation.id))
                            // Then trigger actual delete
                            onDeleteImage(img.generation.id)
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </motion.button>
                  )
                })}
              </AnimatePresence>
              
              {loadingMore && (
                <div className="gen-panel-more-wait">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer button */}
        <button 
          className="gen-panel-all"
          onClick={onOpenWorksModal}
        >
          <Boxes className="w-4 h-4" />
          <span>All</span>
        </button>
      </div>
    </div>
  )
}
