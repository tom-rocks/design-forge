import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, RotateCcw, Star, Download, Flame, Hammer, Gem } from 'lucide-react'

// Helper to get aspect ratio icon dimensions (same as Lightbox)
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

interface ImageCanvasProps {
  images: string[]
  onFavorite?: (url: string) => void
  onRefine?: (url: string) => void
  onDownload?: (url: string) => void
  starredUrls?: Set<string>
  // Generation info for the info bar
  prompt?: string
  mode?: 'create' | 'edit'
  resolution?: string
  aspectRatio?: string
}

export function ImageCanvas({
  images,
  onFavorite,
  onRefine,
  onDownload,
  starredUrls = new Set(),
  prompt: _prompt, // Reserved for future use
  mode,
  resolution,
  aspectRatio
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const MIN_SCALE = 0.5
  const MAX_SCALE = 4
  const ZOOM_STEP = 0.25

  // Reset view when images change
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [images.length])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale + delta))
    
    if (newScale !== scale && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      // Zoom towards mouse position
      const scaleRatio = newScale / scale
      const newX = mouseX - (mouseX - position.x) * scaleRatio
      const newY = mouseY - (mouseY - position.y) * scaleRatio
      
      setScale(newScale)
      setPosition({ x: newX, y: newY })
    }
  }, [scale, position])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return // Only left click
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }, [position])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const resetView = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  // Grid layout based on image count
  const gridClass = images.length === 1 ? 'single' : 
                    images.length === 2 ? 'double' : 
                    images.length <= 4 ? 'quad' : 'multi'

  return (
    <div className="image-canvas-container">
      {/* Canvas viewport */}
      <div 
        className={`image-canvas-viewport ${isDragging ? 'dragging' : ''}`}
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div 
          className="image-canvas-content"
          ref={contentRef}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: '0 0'
          }}
        >
          <div className={`image-canvas-grid ${gridClass}`}>
            {images.map((url, i) => (
              <motion.div
                key={url}
                className="image-canvas-item"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
              >
                <img src={url} alt={`Output ${i + 1}`} draggable={false} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls bar - specs and actions (same style as lightbox) */}
      <div className="image-canvas-controls">
        {/* Specs - same as lightbox */}
        <div className="lightbox-specs" style={{ margin: 0, padding: '6px 10px' }}>
          {/* Mode */}
          {mode && (
            <>
              <span className="lightbox-spec" title={mode === 'edit' ? 'Refined' : 'Created'}>
                {mode === 'edit' ? <Hammer className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
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
          {aspectRatio && (
            <>
              <span className="lightbox-spec" title={`Ratio ${aspectRatio}`}>
                <svg className="lightbox-ratio-icon" viewBox="0 0 14 14" width="14" height="14">
                  <rect 
                    x={(14 - getAspectDimensions(aspectRatio).w) / 2} 
                    y={(14 - getAspectDimensions(aspectRatio).h) / 2} 
                    width={getAspectDimensions(aspectRatio).w} 
                    height={getAspectDimensions(aspectRatio).h} 
                    fill="currentColor" 
                    rx="1" 
                  />
                </svg>
                {aspectRatio}
              </span>
              <span className="lightbox-spec-sep">·</span>
            </>
          )}
          {/* Resolution */}
          {resolution && (
            <span className="lightbox-spec" title={`Resolution ${resolution}`}>
              {resolution}
            </span>
          )}
        </div>
        
        {/* Separator */}
        <div className="canvas-controls-sep" />
        
        {/* Zoom indicator */}
        <div className="canvas-zoom-indicator">
          <Search className="w-4 h-4" />
          <span className="canvas-zoom-level">{Math.round(scale * 100)}%</span>
        </div>
        <button className="canvas-control-btn" onClick={resetView} title="Reset zoom">
          <RotateCcw className="w-4 h-4" />
        </button>
        
        {/* Separator */}
        {(onFavorite || onRefine || onDownload) && images.length > 0 && (
          <div className="canvas-controls-sep" />
        )}
        
        {/* Image actions */}
        {images.length > 0 && (
          <>
            {onFavorite && (
              <button 
                className={`canvas-control-btn ${starredUrls.has(images[0]) ? 'active' : ''}`}
                onClick={() => onFavorite(images[0])}
                title={starredUrls.has(images[0]) ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star className="w-4 h-4" />
              </button>
            )}
            {onRefine && (
              <button 
                className="canvas-control-btn"
                onClick={() => onRefine(images[0])}
                title="Refine this image"
              >
                <span className="btn-icon icon-refinement" style={{ width: 16, height: 16 }} />
              </button>
            )}
            {onDownload && (
              <button 
                className="canvas-control-btn"
                onClick={() => onDownload(images[0])}
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Zoom hint */}
      {scale === 1 && position.x === 0 && position.y === 0 && (
        <div className="image-canvas-hint">
          Scroll to zoom • Drag to pan
        </div>
      )}
    </div>
  )
}
