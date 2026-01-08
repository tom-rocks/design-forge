import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, ExternalLink, ImageIcon, ZoomIn, X } from 'lucide-react'

interface ImageDisplayProps {
  result: {
    imageUrl: string
    width: number
    height: number
    prompt: string
  } | null
  isLoading: boolean
}

export default function ImageDisplay({ result, isLoading }: ImageDisplayProps) {
  const [isZoomed, setIsZoomed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  const handleDownload = async () => {
    if (!result) return
    
    try {
      const response = await fetch(result.imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `design-forge-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch {
      window.open(result.imageUrl, '_blank')
    }
  }

  if (!result && !isLoading) {
    return (
      <div className="border border-dashed border-forge-border rounded-2xl p-12 flex flex-col items-center justify-center text-forge-text-muted min-h-[300px]">
        <ImageIcon className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-sm">Your generated image will appear here</p>
      </div>
    )
  }

  return (
    <>
      <div className="relative group">
        {/* Container with aspect ratio preservation */}
        <div className="bg-forge-surface border border-forge-border rounded-2xl overflow-hidden">
          {/* Loading State */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="aspect-square flex items-center justify-center"
              >
                <div className="text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    {/* Animated rings */}
                    <motion.div
                      className="absolute inset-0 border-2 border-violet-500/30 rounded-full"
                      animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <motion.div
                      className="absolute inset-0 border-2 border-violet-500/30 rounded-full"
                      animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  </div>
                  <p className="text-sm text-forge-text-muted">Creating your image...</p>
                  <p className="text-xs text-forge-text-muted/50 mt-1">This may take a moment</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Image */}
          {result && !isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="relative"
            >
              {!imageLoaded && (
                <div className="aspect-square shimmer" />
              )}
              <img
                src={result.imageUrl}
                alt={result.prompt}
                onLoad={() => setImageLoaded(true)}
                className={`w-full h-auto ${imageLoaded ? 'block' : 'hidden'}`}
              />
              
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-4">
                <div className="text-white text-sm max-w-[70%]">
                  <p className="font-medium truncate">{result.prompt}</p>
                  <p className="text-xs text-white/60 mt-1">
                    {result.width} × {result.height}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsZoomed(true)}
                    className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white transition-colors"
                    title="View full size"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleDownload}
                    className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <a
                    href={result.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg text-white transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isZoomed && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsZoomed(false)}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          >
            <button
              onClick={() => setIsZoomed(false)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={result.imageUrl}
              alt={result.prompt}
              className="max-w-full max-h-full object-contain rounded-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
