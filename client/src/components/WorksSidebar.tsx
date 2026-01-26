import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, ChevronRight, ImageOff } from 'lucide-react'
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
}

interface DisplayImage {
  id: string
  imageUrl: string
  thumbnailUrl: string | null
  generation: Generation
  imageIndex: number
}

interface WorksSidebarProps {
  authenticated: boolean
  onSelectImage?: (imageUrl: string, generation: Generation) => void
  onOpenWorksModal?: () => void
  newGenerationTrigger?: number // Increment to trigger refresh
}

export function WorksSidebar({ 
  authenticated, 
  onSelectImage,
  onOpenWorksModal,
  newGenerationTrigger 
}: WorksSidebarProps) {
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
        `${API_URL}/api/generations?limit=${LIMIT}&offset=${currentOffset}`,
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

  // Refresh when new generation is created
  useEffect(() => {
    if (newGenerationTrigger && authenticated) {
      setOffset(0)
      fetchGenerations(false)
    }
  }, [newGenerationTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="works-sidebar">
      <div className="works-sidebar-inner">
        {/* Header */}
        <div className="works-sidebar-header">
          <span className="btn-icon icon-works" />
          <span className="works-sidebar-title">Works</span>
        </div>

        {/* Scrollable content */}
        <div 
          className="works-sidebar-scroll" 
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {loading ? (
            <div className="works-sidebar-loading">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : displayImages.length === 0 ? (
            <div className="works-sidebar-empty">
              No works yet
            </div>
          ) : (
            <div className="works-sidebar-grid">
              <AnimatePresence mode="popLayout">
                {displayImages.map((img) => (
                  <motion.button
                    key={img.id}
                    className={`works-sidebar-item ${failedImages.has(img.id) ? 'failed' : ''}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => onSelectImage?.(
                      `${API_URL}${img.imageUrl}`,
                      img.generation
                    )}
                    title={img.generation.prompt || 'Click to refine'}
                  >
                    {failedImages.has(img.id) ? (
                      <div className="works-sidebar-item-error">
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
                  </motion.button>
                ))}
              </AnimatePresence>
              
              {loadingMore && (
                <div className="works-sidebar-loading-more">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer button */}
        <button 
          className="works-sidebar-more"
          onClick={onOpenWorksModal}
        >
          <span>All Works</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
