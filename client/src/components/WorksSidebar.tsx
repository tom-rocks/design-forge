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
  model?: string
  resolution?: string
  aspect_ratio?: string
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
}

interface WorksSidebarProps {
  authenticated: boolean
  onSelectImage?: (imageUrl: string, generation: Generation) => void
  onOpenWorksModal?: () => void
  newGenerationTrigger?: number // Increment to trigger refresh
  pendingGenerations?: PendingGeneration[] // Shows at top while forging
}

export function WorksSidebar({ 
  authenticated, 
  onSelectImage,
  onOpenWorksModal,
  newGenerationTrigger,
  pendingGenerations = []
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
    <div className="gen-panel">
      <div className="gen-panel-box">
        {/* Header */}
        <div className="gen-panel-head">
          <span className="btn-icon icon-works" />
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
                {/* Pending generation placeholders - show all while forging */}
                {pendingGenerations.flatMap(pending => 
                  [...Array(pending.outputCount)].map((_, i) => (
                    <motion.div
                      key={`pending-${pending.id}-${i}`}
                      className="gen-panel-thumb forging"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.15 }}
                      title={`Forging: ${pending.prompt?.slice(0, 50) || ''}...`}
                    >
                      <div className="gen-panel-thumb-forging">
                        <Loader2 className="w-8 h-8 animate-spin" />
                      </div>
                    </motion.div>
                  ))
                )}
                
                {/* Existing generations */}
                {displayImages.map((img) => (
                  <motion.button
                    key={img.id}
                    className={`gen-panel-thumb ${failedImages.has(img.id) ? 'failed' : ''}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => onSelectImage?.(
                      `${API_URL}${img.imageUrl}`,
                      img.generation
                    )}
                    title={img.generation.prompt || 'Click to view'}
                  >
                    {failedImages.has(img.id) ? (
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
                  </motion.button>
                ))}
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
          <span>All Works</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
