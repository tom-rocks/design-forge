import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Monitor, X, Grid, Square } from 'lucide-react'

interface ImageDisplayProps {
  result: {
    imageUrl: string
    imageUrls?: string[]
    prompt: string
  } | null
  isLoading: boolean
}

// Pixel characters for the visualization
const PIXELS = ' ░▒▓█'

export default function ImageDisplay({ result, isLoading }: ImageDisplayProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')
  const [pixelGrid, setPixelGrid] = useState<string[][]>([])

  const images = result?.imageUrls?.length ? result.imageUrls : result?.imageUrl ? [result.imageUrl] : []
  const currentImage = selectedIndex !== null ? images[selectedIndex] : images[0]
  
  // Nostradamus visualization - pure visual, no text
  useEffect(() => {
    if (isLoading) {
      setLoadedImages(new Set())
      
      // Generate evolving pixel visualization - wide format
      const pixelInterval = setInterval(() => {
        const width = 56  // Wide to fill the display
        const height = 20
        const time = Date.now() / 1000
        const grid: string[][] = []
        
        for (let y = 0; y < height; y++) {
          const row: string[] = []
          for (let x = 0; x < width; x++) {
            // Normalize to -1 to 1
            const nx = (x / width - 0.5) * 2
            const ny = (y / height - 0.5) * 2
            
            // Distance from center (adjusted for aspect ratio)
            const dist = Math.sqrt(nx * nx * 0.5 + ny * ny)
            
            // Multiple wave patterns creating interference
            const wave1 = Math.sin(dist * 8 - time * 2.5)
            const wave2 = Math.sin(nx * 6 + time * 1.8)
            const wave3 = Math.cos(ny * 5 - time * 1.4)
            const spiral = Math.sin(Math.atan2(ny, nx * 0.7) * 4 + dist * 5 - time * 2)
            
            // Combine waves
            const combined = (wave1 + wave2 + wave3 + spiral) / 4
            
            // Map to pixel character
            const idx = Math.floor((combined + 1) * 2.4)
            row.push(PIXELS[Math.max(0, Math.min(idx, PIXELS.length - 1))])
          }
          grid.push(row)
        }
        
        setPixelGrid(grid)
      }, 50)
      
      return () => clearInterval(pixelInterval)
    }
  }, [isLoading])


  // Reset selection when new results come in
  useEffect(() => {
    if (result) {
      setSelectedIndex(null)
    }
  }, [result])

  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => new Set(prev).add(index))
  }

  const handleDownload = async (url: string, index: number) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `design-forge-${index + 1}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    }
  }

  const handleDownloadAll = async () => {
    for (let i = 0; i < images.length; i++) {
      await handleDownload(images[i], i)
      await new Promise(r => setTimeout(r, 500))
    }
  }

  // Empty state
  if (!result && !isLoading) {
    return (
      <div className="te-panel overflow-hidden">
        <div className="te-module-header">
          <Monitor className="w-3.5 h-3.5 text-te-fuchsia" />
          <span>OUTPUT_DISPLAY</span>
          <div className="flex-1" />
          <div className="w-2 h-2 led led-off" />
        </div>
        <div className="aspect-square flex flex-col items-center justify-center bg-te-lcd p-12 relative">
          <Monitor className="w-16 h-16 mb-4 text-te-lcd-text-dim opacity-30" />
          <p className="font-mono text-sm text-te-lcd-text-dim uppercase tracking-wider">AWAITING INPUT</p>
          <p className="font-mono text-[10px] mt-2 text-te-lcd-text-dim/50">ENTER PROMPT TO BEGIN GENERATION</p>
        </div>
      </div>
    )
  }

  // Get grid columns based on image count
  const getGridClass = () => {
    if (images.length === 1) return 'grid-cols-1'
    if (images.length === 2) return 'grid-cols-2'
    if (images.length <= 4) return 'grid-cols-2'
    return 'grid-cols-3'
  }

  return (
    <>
      <div className="te-panel overflow-hidden">
        {/* Module Header */}
        <div className="te-module-header">
          <Monitor className="w-3.5 h-3.5 text-te-fuchsia" />
          <span>OUTPUT_DISPLAY</span>
          <div className="flex-1" />
          
          {/* View toggle for multiple images */}
          {images.length > 1 && !isLoading && (
            <div className="flex gap-1 mr-3">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-te-fuchsia text-te-bg' : 'text-te-cream-dim hover:text-te-cream'}`}
                title="Grid view"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('single')}
                className={`p-1 rounded transition-colors ${viewMode === 'single' ? 'bg-te-fuchsia text-te-bg' : 'text-te-cream-dim hover:text-te-cream'}`}
                title="Single view"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          
          {images.length > 1 && !isLoading && (
            <span className="font-mono text-[9px] text-te-cream-dim mr-2">
              {images.length} VARIATIONS
            </span>
          )}
          
          <div className={`w-2 h-2 led ${isLoading ? 'led-amber led-pulse' : result ? 'led-green' : 'led-off'}`} />
        </div>

        {/* Display Area */}
        <div className="relative bg-te-lcd">
          {/* Loading State - Pure Visual Nostradamus Animation */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-h-[320px] flex flex-col relative overflow-hidden"
                style={{ background: 'linear-gradient(180deg, #0d0712 0%, #0a0510 100%)' }}
              >
                {/* The main pixel visualization */}
                <div className="flex-1 flex items-center justify-center">
                  <div 
                    className="font-mono text-xs leading-[1.1] tracking-tight select-none"
                    style={{ 
                      textShadow: '0 0 4px rgba(217, 70, 239, 0.8)',
                      filter: 'blur(0.3px)',
                    }}
                  >
                    {pixelGrid.map((row, y) => (
                      <div key={y} className="flex justify-center">
                        {row.map((char, x) => (
                          <span 
                            key={x} 
                            className="inline-block w-[10px] text-center"
                            style={{
                              color: char === '█' ? '#e879f9' : 
                                     char === '▓' ? '#d946ef' :
                                     char === '▒' ? '#a21caf' :
                                     char === '░' ? '#701a75' : '#2e0a33',
                              opacity: char === ' ' ? 0.1 : 1,
                            }}
                          >
                            {char}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grid View - All images at once */}
          {result && !isLoading && viewMode === 'grid' && images.length > 1 && (
            <div className={`grid ${getGridClass()} gap-2 p-2`}>
              {images.map((url, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="relative group aspect-square bg-te-bg rounded-lg overflow-hidden border-2 border-te-border hover:border-te-fuchsia transition-colors cursor-pointer"
                  onClick={() => { setSelectedIndex(i); setIsZoomed(true); }}
                >
                  {!loadedImages.has(i) && (
                    <div className="absolute inset-0 te-shimmer" />
                  )}
                  <img
                    src={url}
                    alt={`Variation ${i + 1}`}
                    onLoad={() => handleImageLoad(i)}
                    className={`w-full h-full object-contain ${loadedImages.has(i) ? 'block' : 'invisible'}`}
                  />
                  
                  {/* Variation number badge */}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-te-bg/90 border border-te-border rounded font-mono text-[10px] text-te-cream">
                    #{i + 1}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Single View - One image with thumbnails */}
          {result && !isLoading && (viewMode === 'single' || images.length === 1) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative"
            >
              {!loadedImages.has(selectedIndex ?? 0) && <div className="aspect-square te-shimmer" />}
              <img
                src={currentImage}
                alt={result.prompt}
                onLoad={() => handleImageLoad(selectedIndex ?? 0)}
                onClick={() => setIsZoomed(true)}
                className={`w-full h-auto cursor-zoom-in ${loadedImages.has(selectedIndex ?? 0) ? 'block' : 'hidden'}`}
              />
            </motion.div>
          )}
        </div>

        {/* Thumbnail strip for single view */}
        {images.length > 1 && viewMode === 'single' && !isLoading && (
          <div className="flex gap-2 justify-center p-3 border-t border-te-border bg-te-panel-dark">
            {images.map((url, i) => (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  (selectedIndex ?? 0) === i 
                    ? 'border-te-fuchsia ring-2 ring-te-fuchsia/30' 
                    : 'border-te-border hover:border-te-fuchsia/50'
                }`}
              >
                <img src={url} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Download all button for grid view */}
        {images.length > 1 && viewMode === 'grid' && !isLoading && (
          <div className="flex justify-center p-3 border-t border-te-border bg-te-panel-dark">
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 px-4 py-2 bg-te-panel border-2 border-te-border hover:border-te-fuchsia hover:bg-te-fuchsia rounded-lg text-te-cream font-mono text-xs uppercase transition-all"
            >
              <Download className="w-4 h-4" />
              Download All ({images.length})
            </button>
          </div>
        )}
      </div>

      {/* Zoom Modal */}
      <AnimatePresence>
        {isZoomed && currentImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsZoomed(false)}
            className="fixed inset-0 z-50 bg-te-bg/98 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
          >
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute top-6 right-6 p-3 bg-te-panel border-2 border-te-border hover:border-te-fuchsia rounded-lg text-te-cream transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            
            {/* Navigation in zoom mode */}
            {images.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setSelectedIndex(i); }}
                    className={`w-3 h-3 rounded-full transition-all ${
                      (selectedIndex ?? 0) === i 
                        ? 'bg-te-fuchsia scale-125' 
                        : 'bg-te-border hover:bg-te-cream'
                    }`}
                  />
                ))}
              </div>
            )}
            
            <motion.img
              key={selectedIndex}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={currentImage}
              alt={result?.prompt}
              className="max-w-full max-h-[85vh] object-contain rounded-te border-2 border-te-border"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
