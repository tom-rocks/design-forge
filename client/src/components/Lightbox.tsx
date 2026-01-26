import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Flame, Hammer, Gem, Plus, RotateCcw, Loader2, Star, ZoomIn, RotateCw, Trash2 } from 'lucide-react'

// Track which URLs have been loaded this session (survives component unmount)
const loadedUrls = new Set<string>()

// Zoom/pan constants
const MIN_ZOOM = 1
const MAX_ZOOM = 5
const ZOOM_STEP = 0.15 // For mouse wheel
const PINCH_SENSITIVITY = 0.01 // For trackpad pinch

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
  onDelete?: () => void
}

export function Lightbox({ data, onClose, onDownload, onRefine, onReplay, onUseAlloy, onFavorite, isFavorited, onDelete }: LightboxProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Check if this URL was already loaded this session
  const [imageLoaded, setImageLoaded] = useState(() => 
    data ? loadedUrls.has(data.imageUrl) : false
  )
  
  // Zoom and pan state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOffset = useRef({ x: 0, y: 0 })
  
  // Reset zoom/pan when image changes
  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [data?.imageUrl])
  
  // Handle scroll/pinch to zoom - use native event listener for reliable preventDefault
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      
      // Trackpad pinch-to-zoom (ctrlKey is set during pinch gesture)
      if (e.ctrlKey) {
        const delta = -e.deltaY * PINCH_SENSITIVITY
        setZoom(prev => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)))
        return
      }
      
      // Check if zoomed in - use two-finger scroll for panning
      setZoom(currentZoom => {
        if (currentZoom > 1) {
          // Pan with two-finger scroll when zoomed
          setPan(prev => ({
            x: prev.x - e.deltaX * 0.5,
            y: prev.y - e.deltaY * 0.5
          }))
          return currentZoom
        } else {
          // Mouse wheel zoom when not zoomed (or at 1x)
          const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
          return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + delta))
        }
      })
    }
    
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [data?.imageUrl])
  
  // Handle mouse pan - left click when zoomed, or middle click anytime
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse button (button === 1) always pans
    // Left click (button === 0) pans when zoomed
    if (e.button === 1 || (e.button === 0 && zoom > 1)) {
      e.preventDefault()
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY }
      panOffset.current = { ...pan }
    }
  }, [pan, zoom])
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setPan({
      x: panOffset.current.x + dx,
      y: panOffset.current.y + dy
    })
  }, [isPanning])
  
  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])
  
  // Reset zoom and pan
  const handleResetZoom = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])
  
  const isZoomed = zoom !== 1 || pan.x !== 0 || pan.y !== 0
  
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
            <div 
              ref={containerRef}
              className={`lightbox-image-container ${isZoomed ? 'zoomed' : ''} ${isPanning ? 'panning' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
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
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default'
                }}
                draggable={false}
              />
              {isZoomed && (
                <button 
                  className="lightbox-reset-zoom"
                  onClick={handleResetZoom}
                  title="Reset zoom"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              )}
              {zoom === 1 && (
                <div className="lightbox-zoom-hint">
                  <ZoomIn className="w-3 h-3" />
                  <span>Scroll to zoom</span>
                </div>
              )}
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
                {onDelete && (
                  <button 
                    className="lightbox-btn lightbox-btn-delete"
                    onClick={onDelete}
                    title="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
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
