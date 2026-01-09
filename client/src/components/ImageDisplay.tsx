import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Monitor, X, Grid, Square, Pencil } from 'lucide-react'

interface ImageDisplayProps {
  result: {
    imageUrl: string
    imageUrls?: string[]
    prompt: string
  } | null
  isLoading: boolean
  onEditImage?: (imageUrl: string) => void
}

// ASCII characters for wave visualization - same as progress bar
const CHARS = ' ·:;░▒▓█'

// Generate ASCII wave pattern - shared function for consistency
function generateAsciiWave(width: number, height: number, time: number): string[] {
  const lines: string[] = []
  
  for (let y = 0; y < height; y++) {
    let line = ''
    for (let x = 0; x < width; x++) {
      const nx = (x / width - 0.5) * 2
      const ny = (y / height - 0.5) * 2
      const dist = Math.sqrt(nx * nx + ny * ny)
      
      const wave1 = Math.sin(dist * 6 - time * 2)
      const wave2 = Math.sin(nx * 4 + time * 1.5)
      const wave3 = Math.cos(ny * 4 - time * 1.2)
      const spiral = Math.sin(Math.atan2(ny, nx) * 3 + dist * 4 - time * 1.8)
      
      const combined = (wave1 + wave2 + wave3 + spiral + 4) / 8
      const idx = Math.floor(combined * (CHARS.length - 1))
      line += CHARS[Math.max(0, Math.min(idx, CHARS.length - 1))]
    }
    lines.push(line)
  }
  
  return lines
}

export default function ImageDisplay({ result, isLoading, onEditImage }: ImageDisplayProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')
  const [asciiLines, setAsciiLines] = useState<string[]>([])

  const images = result?.imageUrls?.length ? result.imageUrls : result?.imageUrl ? [result.imageUrl] : []
  const currentImage = selectedIndex !== null ? images[selectedIndex] : images[0]
  
  // ASCII wave animation - large grid to fill the display area
  useEffect(() => {
    if (isLoading) {
      setLoadedImages(new Set())
      
      const interval = setInterval(() => {
        const time = Date.now() / 1000
        // Much larger grid - 80 chars wide, 50 tall to properly fill a square
        setAsciiLines(generateAsciiWave(80, 50, time))
      }, 50)
      
      return () => clearInterval(interval)
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
          {/* Loading State - ASCII Wave Animation - FILLS THE ENTIRE CONTAINER */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="aspect-square w-full relative overflow-hidden"
                style={{ background: 'linear-gradient(180deg, #0d0712 0%, #0a0510 100%)' }}
              >
                <pre 
                  className="absolute inset-0 font-mono select-none whitespace-pre overflow-hidden flex items-center justify-center"
                  style={{ 
                    color: '#e879f9',
                    textShadow: '0 0 8px rgba(232, 121, 249, 0.6)',
                    fontSize: 'min(2vw, 14px)',
                    lineHeight: '1.1',
                  }}
                >
                  {asciiLines.join('\n')}
                </pre>
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
                  className="relative group aspect-square bg-te-bg rounded-lg overflow-hidden border-2 border-te-border hover:border-te-fuchsia transition-colors"
                >
                  {!loadedImages.has(i) && (
                    <div className="absolute inset-0 te-shimmer" />
                  )}
                  <img
                    src={url}
                    alt={`Variation ${i + 1}`}
                    onLoad={() => handleImageLoad(i)}
                    onClick={() => { setSelectedIndex(i); setIsZoomed(true); }}
                    className={`w-full h-full object-contain cursor-pointer ${loadedImages.has(i) ? 'block' : 'invisible'}`}
                  />
                  
                  {/* Variation number badge */}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-te-bg/90 border border-te-border rounded font-mono text-[10px] text-te-cream">
                    #{i + 1}
                  </div>
                  
                  {/* Edit button - always visible */}
                  {onEditImage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditImage(url)
                      }}
                      className="absolute bottom-2 right-2 p-2 rounded-lg bg-cyan-500/90 hover:bg-cyan-400 text-white transition-colors shadow-lg"
                      title="Edit this image"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
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
              
              {/* Edit button */}
              {onEditImage && currentImage && (
                <button
                  onClick={() => onEditImage(currentImage)}
                  className="absolute bottom-4 right-4 p-3 rounded-xl bg-cyan-500/90 hover:bg-cyan-400 text-white transition-colors shadow-lg flex items-center gap-2"
                  title="Edit this image"
                >
                  <Pencil className="w-5 h-5" />
                  <span className="font-mono text-sm">EDIT</span>
                </button>
              )}
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
