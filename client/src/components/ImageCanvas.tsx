import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ZoomIn, ZoomOut, RotateCcw, Star, Download } from 'lucide-react'

interface ImageCanvasProps {
  images: string[]
  onImageClick?: (url: string, index: number) => void
  onFavorite?: (url: string) => void
  onRefine?: (url: string) => void
  onDownload?: (url: string) => void
  starredUrls?: Set<string>
}

export function ImageCanvas({
  images,
  onImageClick,
  onFavorite,
  onRefine,
  onDownload,
  starredUrls = new Set()
}: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const MIN_SCALE = 0.5
  const MAX_SCALE = 4
  const ZOOM_STEP = 0.25

  // Reset view when images change
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setSelectedIndex(null)
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

  const zoomIn = useCallback(() => {
    setScale(s => Math.min(MAX_SCALE, s + ZOOM_STEP))
  }, [])

  const zoomOut = useCallback(() => {
    setScale(s => Math.max(MIN_SCALE, s - ZOOM_STEP))
  }, [])

  const resetView = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [])

  const handleImageClick = useCallback((url: string, index: number, e: React.MouseEvent) => {
    // Don't trigger if we were dragging
    if (Math.abs(e.clientX - (dragStart.x + position.x)) > 5 || 
        Math.abs(e.clientY - (dragStart.y + position.y)) > 5) {
      return
    }
    
    if (selectedIndex === index) {
      // Double click to open lightbox
      onImageClick?.(url, index)
    } else {
      setSelectedIndex(index)
    }
  }, [dragStart, position, selectedIndex, onImageClick])

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
                className={`image-canvas-item ${selectedIndex === i ? 'selected' : ''}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                onClick={(e) => handleImageClick(url, i, e)}
                onDoubleClick={() => onImageClick?.(url, i)}
              >
                <img src={url} alt={`Output ${i + 1}`} draggable={false} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls bar - zoom and image actions */}
      <div className="image-canvas-controls">
        {/* Zoom controls */}
        <button className="canvas-control-btn" onClick={zoomOut} title="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="canvas-zoom-level">{Math.round(scale * 100)}%</span>
        <button className="canvas-control-btn" onClick={zoomIn} title="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="canvas-control-btn" onClick={resetView} title="Reset view">
          <RotateCcw className="w-4 h-4" />
        </button>
        
        {/* Separator */}
        {(onFavorite || onRefine || onDownload) && images.length > 0 && (
          <div className="canvas-controls-sep" />
        )}
        
        {/* Image actions - for selected or single image */}
        {images.length > 0 && (
          <>
            {onFavorite && (
              <button 
                className={`canvas-control-btn ${starredUrls.has(images[selectedIndex ?? 0]) ? 'active' : ''}`}
                onClick={() => onFavorite(images[selectedIndex ?? 0])}
                title={starredUrls.has(images[selectedIndex ?? 0]) ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Star className="w-4 h-4" />
              </button>
            )}
            {onRefine && (
              <button 
                className="canvas-control-btn"
                onClick={() => onRefine(images[selectedIndex ?? 0])}
                title="Refine this image"
              >
                <span className="btn-icon icon-refinement" style={{ width: 16, height: 16 }} />
              </button>
            )}
            {onDownload && (
              <button 
                className="canvas-control-btn"
                onClick={() => onDownload(images[selectedIndex ?? 0])}
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
