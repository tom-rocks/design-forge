import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Grid, Square, Monitor } from 'lucide-react'

// Chisel icon for edit/refine actions
const ChiselIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 3l2 2-1 1-2-2 1-1z" />
    <path d="M17 5l-3 3" />
    <line x1="14" y1="8" x2="8" y2="14" />
    <path d="M8 14l-4 4-1 3 3-1 4-4" />
    <path d="M3 21l2-2" />
  </svg>
)

interface ImageDisplayProps {
  result: {
    imageUrl: string
    imageUrls?: string[]
    prompt: string
  } | null
  isLoading: boolean
  heatLevel?: number
  onEditImage?: (imageUrl: string) => void
}

// ASCII characters for wave visualization
const CHARS = ' ·:;░▒▓█'

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
  
  // ASCII wave animation
  useEffect(() => {
    if (isLoading) {
      setLoadedImages(new Set())
      
      const interval = setInterval(() => {
        const time = Date.now() / 1000
        setAsciiLines(generateAsciiWave(80, 40, time))
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

  // Get grid columns based on image count
  const getGridClass = () => {
    if (images.length === 1) return 'grid-cols-1'
    if (images.length === 2) return 'grid-cols-2'
    if (images.length <= 4) return 'grid-cols-2'
    return 'grid-cols-3'
  }

  // Empty state - no result and not loading
  if (!result && !isLoading) {
    return (
      <div className="te-panel">
        <div className="te-module-header">
          <Monitor className="w-3.5 h-3.5 text-te-fuchsia" />
          <span>OUTPUT</span>
          <div className="flex-1" />
          <div className="w-2 h-2 rounded-full bg-te-border" />
        </div>
        <div className="aspect-square flex flex-col items-center justify-center bg-te-lcd">
          <Monitor className="w-12 h-12 mb-3 text-te-cream-dim/20" />
          <p className="font-mono text-xs text-te-cream-dim uppercase tracking-wider">Awaiting generation</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="te-panel overflow-hidden">
        {/* Module Header */}
        <div className="te-module-header">
          <Monitor className="w-3.5 h-3.5 text-te-fuchsia" />
          <span>OUTPUT</span>
          <div className="flex-1" />
          
          {/* View toggle for multiple images */}
          {images.length > 1 && !isLoading && (
            <div className="flex gap-1 mr-3">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-te-fuchsia text-te-bg' : 'text-te-cream-dim hover:text-te-cream'}`}
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('single')}
                className={`p-1 rounded transition-colors ${viewMode === 'single' ? 'bg-te-fuchsia text-te-bg' : 'text-te-cream-dim hover:text-te-cream'}`}
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          
          {images.length > 1 && !isLoading && (
            <span className="font-mono text-[10px] text-te-cream-dim mr-2">
              {images.length} VARIATIONS
            </span>
          )}
          
          <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-te-orange animate-pulse' : result ? 'bg-green-500' : 'bg-te-border'}`} />
        </div>

        {/* Display Area */}
        <div className="relative bg-te-lcd">
          {/* Loading State - ASCII Wave */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="aspect-square w-full flex items-center justify-center overflow-hidden"
              >
                <pre 
                  className="font-mono text-te-fuchsia/70 select-none whitespace-pre text-center"
                  style={{ 
                    fontSize: 'min(1.5vw, 10px)',
                    lineHeight: '1.15',
                    textShadow: '0 0 8px rgba(217, 70, 239, 0.4)',
                  }}
                >
                  {asciiLines.join('\n')}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grid View */}
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
                    <div className="absolute inset-0 bg-te-lcd animate-pulse" />
                  )}
                  <img
                    src={url}
                    alt={`Variation ${i + 1}`}
                    onLoad={() => handleImageLoad(i)}
                    onClick={() => { setSelectedIndex(i); setIsZoomed(true); }}
                    className={`w-full h-full object-contain cursor-pointer ${loadedImages.has(i) ? 'block' : 'invisible'}`}
                  />
                  
                  {/* Variation badge */}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-te-bg/90 border border-te-border rounded font-mono text-[10px] text-te-cream">
                    #{i + 1}
                  </div>
                  
                  {/* Edit button on hover */}
                  {onEditImage && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditImage(url); }}
                      className="absolute bottom-2 right-2 p-2 rounded-lg bg-te-panel border border-te-border hover:border-cyan-500/50 text-cyan-400 hover:text-cyan-300 transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit this image"
                    >
                      <ChiselIcon className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {/* Single View */}
          {result && !isLoading && (viewMode === 'single' || images.length === 1) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative"
            >
              {!loadedImages.has(selectedIndex ?? 0) && (
                <div className="aspect-square bg-te-lcd animate-pulse" />
              )}
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
                  className="absolute bottom-4 right-4 px-4 py-2 rounded-lg bg-te-panel border-2 border-te-border hover:border-cyan-500/50 text-cyan-400 hover:text-cyan-300 transition-all flex items-center gap-2"
                  title="Edit this image"
                >
                  <ChiselIcon className="w-5 h-5" />
                  <span className="font-mono text-sm font-bold uppercase">Edit</span>
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
                className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
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

        {/* Download button */}
        {images.length > 0 && !isLoading && (
          <div className="flex justify-center p-3 border-t border-te-border bg-te-panel-dark">
            <button
              onClick={images.length > 1 ? handleDownloadAll : () => handleDownload(images[0], 0)}
              className="flex items-center gap-2 px-4 py-2 bg-te-panel border-2 border-te-border hover:border-te-fuchsia rounded-lg text-te-cream font-mono text-xs uppercase transition-all"
            >
              <Download className="w-4 h-4" />
              {images.length > 1 ? `Download All (${images.length})` : 'Download'}
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
              className="max-w-full max-h-[85vh] object-contain rounded-lg border-2 border-te-border"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
