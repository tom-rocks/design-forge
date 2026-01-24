import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Flame, Hammer, Gem, Plus, RotateCcw, Loader2, Star } from 'lucide-react'

// Track which URLs have been loaded this session (survives component unmount)
const loadedUrls = new Set<string>()

// Helper to get aspect ratio icon dimensions
const getAspectDimensions = (ratio: string | undefined) => {
  switch (ratio) {
    case '1:1': return { w: 10, h: 10 }
    case '3:4': return { w: 9, h: 12 }
    case '4:3': return { w: 12, h: 9 }
    case '9:16': return { w: 7, h: 12 }
    case '16:9': return { w: 12, h: 7 }
    default: return { w: 10, h: 10 }
  }
}

export interface LightboxData {
  imageUrl: string
  prompt?: string
  name?: string  // For favorites/items
  mode?: 'create' | 'edit'
  model?: string
  resolution?: string
  aspectRatio?: string
  // Alloy/references used
  references?: { url: string; name?: string }[]
}

interface LightboxProps {
  data: LightboxData | null
  onClose: () => void
  // Actions
  onDownload?: (url: string) => void
  onRefine?: (url: string) => void
  onReplay?: () => void
  onUseAlloy?: () => void
  onFavorite?: (url: string) => void
  isFavorited?: boolean
}

export function Lightbox({ data, onClose, onDownload, onRefine, onReplay, onUseAlloy, onFavorite, isFavorited }: LightboxProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  
  // Check if this URL was already loaded this session
  const [imageLoaded, setImageLoaded] = useState(() => 
    data ? loadedUrls.has(data.imageUrl) : false
  )
  
  // When data changes, check if we've seen this URL before
  useEffect(() => {
    if (data) {
      if (loadedUrls.has(data.imageUrl)) {
        setImageLoaded(true)
      } else {
        setImageLoaded(false)
      }
    }
  }, [data?.imageUrl])
  
  // Also check if browser has it cached (complete = true before onLoad)
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setImageLoaded(true)
      if (data) loadedUrls.add(data.imageUrl)
    }
  }, [data?.imageUrl])

  const handleImageLoad = () => {
    setImageLoaded(true)
    if (data) loadedUrls.add(data.imageUrl)
  }

  if (!data) return null

  const hasSpecs = data.mode || data.resolution || data.aspectRatio
  const hasAlloy = data.references && data.references.length > 0
  const displayText = data.prompt || data.name

  return (
    <AnimatePresence>
      <motion.div 
        className="lightbox-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div 
          className="lightbox-content"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lightbox-scroll-area">
            <div className="lightbox-image-container">
              {!imageLoaded && (
                <div className="lightbox-image-loading">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              )}
              <motion.img
                ref={imgRef}
                src={data.imageUrl}
                alt={displayText || 'Image'}
                onLoad={handleImageLoad}
                initial={{ opacity: 0 }}
                animate={{ opacity: imageLoaded ? 1 : 0 }}
                transition={{ duration: 0.2 }}
              />
            </div>

            {/* Specs bar */}
            {hasSpecs && (
              <div className="lightbox-specs">
                {/* Mode */}
                {data.mode && (
                  <>
                    <span className="lightbox-spec" title={data.mode === 'edit' ? 'Refined' : 'Created'}>
                      {data.mode === 'edit' ? <Hammer className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                    </span>
                    <span className="lightbox-spec-sep">·</span>
                  </>
                )}
                {/* Model */}
                <span className="lightbox-spec" title="Pro">
                  <Gem className="w-4 h-4" />
                  Pro
                </span>
                <span className="lightbox-spec-sep">·</span>
                {/* Aspect Ratio */}
                {data.aspectRatio && (
                  <>
                    <span className="lightbox-spec" title={`Ratio ${data.aspectRatio}`}>
                      <svg className="lightbox-ratio-icon" viewBox="0 0 14 14" width="14" height="14">
                        <rect 
                          x={(14 - getAspectDimensions(data.aspectRatio).w) / 2} 
                          y={(14 - getAspectDimensions(data.aspectRatio).h) / 2} 
                          width={getAspectDimensions(data.aspectRatio).w} 
                          height={getAspectDimensions(data.aspectRatio).h} 
                          fill="currentColor" 
                          rx="1" 
                        />
                      </svg>
                      {data.aspectRatio}
                    </span>
                    <span className="lightbox-spec-sep">·</span>
                  </>
                )}
                {/* Resolution */}
                {data.resolution && (
                  <span className="lightbox-spec" title={`Resolution ${data.resolution}`}>
                    {data.resolution}
                  </span>
                )}
              </div>
            )}

            {/* Alloy section */}
            {hasAlloy && (
              <div className="lightbox-alloy">
                <div className="lightbox-alloy-header">
                  <span className="panel-icon icon-alloy" />
                  <span className="lightbox-alloy-title">Alloy</span>
                  <span className="lightbox-alloy-count">{data.references!.length}</span>
                  {onUseAlloy && (
                    <button
                      className="lightbox-alloy-use"
                      onClick={onUseAlloy}
                      title="Add these references to your alloy"
                    >
                      <Plus className="w-3 h-3" />
                      Use
                    </button>
                  )}
                </div>
                <div className="lightbox-alloy-grid">
                  {data.references!.map((ref, i) => (
                    <div key={i} className="lightbox-alloy-thumb" title={ref.name || `Reference ${i + 1}`}>
                      <img src={ref.url} alt={ref.name || `Reference ${i + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="lightbox-footer">
              {displayText && (
                <p className="lightbox-prompt">{displayText}</p>
              )}
              <div className="lightbox-actions">
                {onReplay && (
                  <button
                    className="lightbox-btn"
                    onClick={onReplay}
                    title="Replay settings"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                )}
                {onRefine && (
                  <button 
                    className="lightbox-btn"
                    onClick={() => onRefine(data.imageUrl)}
                    title="Refine this image"
                  >
                    <span className="btn-icon icon-refinement" style={{ width: 20, height: 20 }} />
                  </button>
                )}
                {onFavorite && (
                  <button 
                    className={`lightbox-btn ${isFavorited ? 'active' : ''}`}
                    onClick={() => onFavorite(data.imageUrl)}
                    title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className="w-5 h-5" />
                  </button>
                )}
                {onDownload && (
                  <button 
                    className="lightbox-btn"
                    onClick={() => onDownload(data.imageUrl)}
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default Lightbox
