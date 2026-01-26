import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'

interface ImageCanvasProps {
  images: string[]
}

export function ImageCanvas({ images }: ImageCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const MIN_SCALE = 0.5
  const MAX_SCALE = 4

  // Reset view when images change
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [images.length])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    
    // Mac trackpad pinch-to-zoom sends ctrlKey + wheel events
    // Use proportional zoom based on actual delta for smooth trackpad experience
    const isPinch = e.ctrlKey
    
    // For pinch gestures, use smaller multiplier for finer control
    // For regular scroll wheel, use larger steps
    const sensitivity = isPinch ? 0.01 : 0.002
    const delta = -e.deltaY * sensitivity
    
    // Calculate new scale with smooth proportional change
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (1 + delta)))
    
    if (Math.abs(newScale - scale) > 0.001 && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      // Zoom towards mouse/pinch position
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

  // Double-click/tap to reset to real size and centered
  const handleDoubleClick = useCallback(() => {
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
        onDoubleClick={handleDoubleClick}
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
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.08, duration: 0.3, ease: 'easeOut' }}
              >
                <img src={url} alt={`Output ${i + 1}`} draggable={false} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
