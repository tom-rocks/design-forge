import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, X, Grid, Square } from 'lucide-react'

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

// Anvil/mold icon
const MoldIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="8" width="18" height="12" rx="2" />
    <path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
    <line x1="12" y1="12" x2="12" y2="16" />
    <line x1="9" y1="14" x2="15" y2="14" />
  </svg>
)

interface ImageDisplayProps {
  result: {
    imageUrl: string
    imageUrls?: string[]
    prompt: string
  } | null
  isLoading: boolean
  heatLevel?: number // 0-1, based on generation progress
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

export default function ImageDisplay({ result, isLoading, heatLevel = 0, onEditImage }: ImageDisplayProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'grid' | 'single'>('grid')
  const [asciiLines, setAsciiLines] = useState<string[]>([])

  const images = result?.imageUrls?.length ? result.imageUrls : result?.imageUrl ? [result.imageUrl] : []
  const currentImage = selectedIndex !== null ? images[selectedIndex] : images[0]
  
  // Heat colors based on progress
  const getHeatStyle = (level: number) => {
    if (level < 0.1) return { border: '#2a2a2a', glow: 'transparent', bg: '#0a0a0a' }
    if (level < 0.3) return { border: '#5c3a1a', glow: 'rgba(92, 58, 26, 0.3)', bg: '#1a1008' }
    if (level < 0.5) return { border: '#8b4513', glow: 'rgba(139, 69, 19, 0.4)', bg: '#2a1a10' }
    if (level < 0.7) return { border: '#d2691e', glow: 'rgba(210, 105, 30, 0.5)', bg: '#3a2010' }
    if (level < 0.9) return { border: '#ff6b35', glow: 'rgba(255, 107, 53, 0.6)', bg: '#4a2515' }
    return { border: '#ff4500', glow: 'rgba(255, 69, 0, 0.7)', bg: '#5a2a1a' }
  }
  
  const heatStyle = getHeatStyle(heatLevel)
  
  // ASCII wave animation
  useEffect(() => {
    if (isLoading) {
      setLoadedImages(new Set())
      
      const interval = setInterval(() => {
        const time = Date.now() / 1000
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

  // Get grid columns based on image count
  const getGridClass = () => {
    if (images.length === 1) return 'grid-cols-1'
    if (images.length === 2) return 'grid-cols-2'
    if (images.length <= 4) return 'grid-cols-2'
    return 'grid-cols-3'
  }

  return (
    <>
      {/* OUTPUT MOLD - The receiving block */}
      <motion.div 
        className="relative overflow-hidden rounded-xl"
        animate={{
          boxShadow: isLoading 
            ? `0 0 ${30 + heatLevel * 40}px ${heatStyle.glow}, inset 0 0 30px rgba(0,0,0,0.8)`
            : 'inset 0 0 30px rgba(0,0,0,0.5)',
        }}
        style={{
          background: isLoading 
            ? `linear-gradient(180deg, ${heatStyle.bg} 0%, #0a0a0a 100%)`
            : 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
          border: `4px solid ${isLoading ? heatStyle.border : '#2a2a2a'}`,
          transition: 'all 0.3s ease',
        }}
      >
        {/* Hot edges glow when loading */}
        {isLoading && heatLevel > 0.1 && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-lg z-20"
            animate={{
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: `radial-gradient(ellipse at center, transparent 40%, ${heatStyle.glow} 100%)`,
            }}
          />
        )}
        
        {/* Sparks when receiving molten metal */}
        {isLoading && heatLevel > 0.3 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
            {[...Array(Math.floor(heatLevel * 10))].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                initial={{ 
                  x: '50%',
                  y: 0,
                  opacity: 0,
                }}
                animate={{
                  x: [`50%`, `${20 + Math.random() * 60}%`],
                  y: [0, `${10 + Math.random() * 30}%`],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 0.5 + Math.random() * 0.3,
                  repeat: Infinity,
                  delay: Math.random() * 0.5,
                  ease: 'easeOut',
                }}
                style={{
                  background: `hsl(${25 + Math.random() * 20}, 100%, ${55 + Math.random() * 30}%)`,
                  boxShadow: '0 0 4px #ff6b35',
                }}
              />
            ))}
          </div>
        )}

        {/* Module Header */}
        <div 
          className="relative z-10 px-4 py-3 border-b transition-colors"
          style={{ borderColor: isLoading ? `${heatStyle.border}66` : 'rgba(255,255,255,0.1)' }}
        >
          <div className="flex items-center gap-3">
            <MoldIcon 
              className={`w-5 h-5 transition-colors ${isLoading && heatLevel > 0.3 ? 'text-orange-500' : 'text-gray-500'}`}
            />
            <span 
              className="font-mono text-sm uppercase tracking-wider font-bold transition-colors"
              style={{ 
                color: isLoading && heatLevel > 0.3 ? '#ff6b35' : '#888',
                textShadow: isLoading && heatLevel > 0.5 ? '0 0 10px rgba(255, 107, 53, 0.5)' : 'none',
              }}
            >
              OUTPUT MOLD
            </span>
            <div className="flex-1" />
            
            {/* View toggle for multiple images */}
            {images.length > 1 && !isLoading && (
              <div className="flex gap-1 mr-3">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('single')}
                  className={`p-1 rounded transition-colors ${viewMode === 'single' ? 'bg-orange-500 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            
            {images.length > 1 && !isLoading && (
              <span className="font-mono text-[10px] text-gray-500 mr-2">
                {images.length} VARIATIONS
              </span>
            )}
            
            {/* Status indicator */}
            <div 
              className="w-2.5 h-2.5 rounded-full transition-all"
              style={{
                backgroundColor: isLoading 
                  ? `hsl(${30 - heatLevel * 20}, 100%, ${50 + heatLevel * 20}%)`
                  : result ? '#22c55e' : '#333',
                boxShadow: isLoading && heatLevel > 0.3 
                  ? `0 0 8px hsl(${30 - heatLevel * 20}, 100%, 50%)`
                  : 'none',
              }}
            />
          </div>
        </div>

        {/* Display Area */}
        <div className="relative z-10">
          {/* Loading State - Molten receiving animation */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="aspect-square w-full relative overflow-hidden"
                style={{ backgroundColor: heatStyle.bg }}
              >
                {/* ASCII wave background */}
                <pre 
                  className="absolute inset-0 font-mono select-none whitespace-pre overflow-hidden flex items-center justify-center"
                  style={{ 
                    color: `hsl(${30 - heatLevel * 10}, 100%, ${40 + heatLevel * 30}%)`,
                    textShadow: `0 0 ${8 + heatLevel * 10}px rgba(255, ${100 + heatLevel * 55}, 53, ${0.4 + heatLevel * 0.4})`,
                    fontSize: 'min(2vw, 14px)',
                    lineHeight: '1.1',
                    opacity: 0.8,
                  }}
                >
                  {asciiLines.join('\n')}
                </pre>
                
                {/* Center message */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.div
                    animate={{ 
                      scale: [1, 1.05, 1],
                      opacity: [0.7, 1, 0.7],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-center"
                  >
                    <p 
                      className="font-mono text-lg uppercase tracking-widest font-bold"
                      style={{ 
                        color: `hsl(${30 - heatLevel * 10}, 100%, ${50 + heatLevel * 30}%)`,
                        textShadow: `0 0 20px rgba(255, ${100 + heatLevel * 55}, 53, 0.8)`,
                      }}
                    >
                      {heatLevel < 0.3 ? 'HEATING...' : heatLevel < 0.7 ? 'POURING...' : 'FORMING...'}
                    </p>
                    <p 
                      className="font-mono text-sm mt-2"
                      style={{ color: `hsl(${30 - heatLevel * 10}, 80%, ${40 + heatLevel * 20}%)` }}
                    >
                      {Math.floor(heatLevel * 100)}%
                    </p>
                  </motion.div>
                </div>

                {/* Molten pool at bottom building up */}
                <motion.div
                  className="absolute bottom-0 left-0 right-0"
                  animate={{
                    height: `${heatLevel * 30}%`,
                  }}
                  style={{
                    background: `linear-gradient(180deg, 
                      transparent 0%,
                      rgba(255, 107, 53, ${0.1 + heatLevel * 0.3}) 30%,
                      rgba(255, 69, 0, ${0.2 + heatLevel * 0.4}) 70%,
                      rgba(255, 140, 0, ${0.3 + heatLevel * 0.5}) 100%
                    )`,
                    boxShadow: `0 0 ${20 + heatLevel * 30}px rgba(255, 107, 53, ${0.3 + heatLevel * 0.4})`,
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Empty state */}
          {!result && !isLoading && (
            <div className="aspect-square flex flex-col items-center justify-center p-12">
              <MoldIcon className="w-16 h-16 mb-4 text-gray-700 opacity-30" />
              <p className="font-mono text-sm text-gray-600 uppercase tracking-wider">EMPTY MOLD</p>
              <p className="font-mono text-[10px] mt-2 text-gray-700">AWAITING MOLTEN INPUT</p>
            </div>
          )}

          {/* Grid View */}
          {result && !isLoading && viewMode === 'grid' && images.length > 1 && (
            <div className={`grid ${getGridClass()} gap-2 p-2`}>
              {images.map((url, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="relative group aspect-square bg-black rounded-lg overflow-hidden border-2 border-gray-800 hover:border-orange-500/50 transition-colors"
                >
                  {!loadedImages.has(i) && (
                    <div className="absolute inset-0 bg-gray-900 animate-pulse" />
                  )}
                  <img
                    src={url}
                    alt={`Variation ${i + 1}`}
                    onLoad={() => handleImageLoad(i)}
                    onClick={() => { setSelectedIndex(i); setIsZoomed(true); }}
                    className={`w-full h-full object-contain cursor-pointer ${loadedImages.has(i) ? 'block' : 'invisible'}`}
                  />
                  
                  <div className="absolute top-2 left-2 px-2 py-1 bg-black/80 rounded font-mono text-[10px] text-gray-300">
                    #{i + 1}
                  </div>
                  
                  {onEditImage && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditImage(url)
                      }}
                      className="absolute bottom-2 right-2 p-2 rounded-lg bg-gray-900/90 border border-gray-700 hover:border-cyan-500/50 text-cyan-400 hover:text-cyan-300 transition-colors"
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
              {!loadedImages.has(selectedIndex ?? 0) && <div className="aspect-square bg-gray-900 animate-pulse" />}
              <img
                src={currentImage}
                alt={result.prompt}
                onLoad={() => handleImageLoad(selectedIndex ?? 0)}
                onClick={() => setIsZoomed(true)}
                className={`w-full h-auto cursor-zoom-in ${loadedImages.has(selectedIndex ?? 0) ? 'block' : 'hidden'}`}
              />
              
              {onEditImage && currentImage && (
                <button
                  onClick={() => onEditImage(currentImage)}
                  className="absolute bottom-4 right-4 px-4 py-3 rounded-lg bg-gray-900/90 border-2 border-gray-700 hover:border-cyan-500/50 text-cyan-400 hover:text-cyan-300 transition-all flex items-center gap-2"
                >
                  <ChiselIcon className="w-5 h-5" />
                  <span className="font-mono text-sm font-bold tracking-wider">REFINE</span>
                </button>
              )}
            </motion.div>
          )}
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && viewMode === 'single' && !isLoading && (
          <div className="flex gap-2 justify-center p-3 border-t border-gray-800 bg-black/50">
            {images.map((url, i) => (
              <button
                key={i}
                onClick={() => setSelectedIndex(i)}
                className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  (selectedIndex ?? 0) === i 
                    ? 'border-orange-500 ring-2 ring-orange-500/30' 
                    : 'border-gray-700 hover:border-orange-500/50'
                }`}
              >
                <img src={url} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Download all */}
        {images.length > 1 && viewMode === 'grid' && !isLoading && (
          <div className="flex justify-center p-3 border-t border-gray-800 bg-black/50">
            <button
              onClick={handleDownloadAll}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-2 border-gray-700 hover:border-orange-500 hover:bg-orange-500/10 rounded-lg text-gray-300 hover:text-orange-400 font-mono text-xs uppercase transition-all"
            >
              <Download className="w-4 h-4" />
              Download All ({images.length})
            </button>
          </div>
        )}
      </motion.div>

      {/* Zoom Modal */}
      <AnimatePresence>
        {isZoomed && currentImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsZoomed(false)}
            className="fixed inset-0 z-50 bg-black/98 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
          >
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute top-6 right-6 p-3 bg-gray-900 border-2 border-gray-700 hover:border-orange-500 rounded-lg text-gray-300 transition-colors"
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
                        ? 'bg-orange-500 scale-125' 
                        : 'bg-gray-600 hover:bg-gray-400'
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
              className="max-w-full max-h-[85vh] object-contain rounded-lg border-2 border-gray-800"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
