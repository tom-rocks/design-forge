import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, ChevronDown, ChevronUp, Loader2, Image as ImageIcon, X } from 'lucide-react'
import { API_URL } from '../config'
import { EditImageRef } from './EditImageUpload'

interface Generation {
  id: string
  prompt: string
  model: string
  resolution: string
  aspect_ratio: string
  mode: 'create' | 'edit'
  parent_id: string | null
  image_paths: string[]
  thumbnail_path: string | null
  thumbnailUrl: string | null
  imageUrls: string[]
  settings: {
    styleImages?: { url: string; name?: string }[]
    negativePrompt?: string
  }
  created_at: string
}

interface GenerationHistoryProps {
  onUseAsReference: (imageUrl: string) => void
  onEditImage: (ref: EditImageRef) => void
  disabled?: boolean
}

export default function GenerationHistory({ 
  onUseAsReference, 
  onEditImage,
  disabled
}: GenerationHistoryProps) {
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [isExpanded, setIsExpanded] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  
  // Preview modal state
  const [previewImage, setPreviewImage] = useState<{ url: string; gen: Generation; index: number } | null>(null)

  const fetchGenerations = useCallback(async (offset = 0, append = false) => {
    try {
      if (offset === 0) setLoading(true)
      else setLoadingMore(true)
      
      const res = await fetch(`${API_URL}/api/generations?limit=24&offset=${offset}`)
      if (!res.ok) throw new Error('Failed to fetch')
      
      const data = await res.json()
      
      if (append) {
        setGenerations(prev => [...prev, ...data.generations])
      } else {
        setGenerations(data.generations)
      }
      
      setTotal(data.total)
      setHasMore(data.hasMore)
    } catch (err) {
      console.error('Failed to fetch generations:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchGenerations()
  }, [fetchGenerations])

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchGenerations(generations.length, true)
    }
  }

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    
    setDeletingId(id)
    try {
      const res = await fetch(`${API_URL}/api/generations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setGenerations(prev => prev.filter(g => g.id !== id))
        setTotal(prev => prev - 1)
        if (previewImage?.gen.id === id) {
          setPreviewImage(null)
        }
      }
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const handleEdit = (gen: Generation, imageIndex: number) => {
    onEditImage({
      type: 'storage',
      value: `/api/generations/${gen.id}/image/${imageIndex}`,
      generationId: gen.id
    })
    setPreviewImage(null)
  }

  const handleUseAsRef = (gen: Generation, imageIndex: number) => {
    const imageUrl = `${API_URL}${gen.imageUrls[imageIndex]}`
    onUseAsReference(imageUrl)
    setPreviewImage(null)
  }

  const handleTapImage = (gen: Generation, imgIndex: number) => {
    const fullUrl = `${API_URL}${gen.imageUrls[imgIndex]}`
    setPreviewImage({ url: fullUrl, gen, index: imgIndex })
  }

  if (loading && generations.length === 0) {
    return (
      <div className="te-panel p-4">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-xs uppercase tracking-wider text-gray-400">Generation History</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
        </div>
      </div>
    )
  }

  if (generations.length === 0) {
    return (
      <div className="te-panel p-4">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-xs uppercase tracking-wider text-gray-400">Generation History</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <ImageIcon className="w-10 h-10 mb-2 opacity-30" />
          <p className="font-mono text-xs">NO GENERATIONS YET</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="te-panel overflow-hidden">
        {/* Header - collapsible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center gap-2 hover:bg-white/5 transition-colors border-b border-white/10"
        >
          <History className="w-4 h-4 text-cyan-400" />
          <span className="font-mono text-xs uppercase tracking-wider text-gray-300">Generation History</span>
          <span className="font-mono text-[10px] text-gray-500 ml-1">({total})</span>
          <div className="flex-1" />
          <span className="font-mono text-[9px] text-gray-500 mr-2">DRAG TO CRUCIBLE</span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </button>

        {/* Grid */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-3">
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 max-h-[300px] overflow-y-auto">
                  {generations.map((gen) => (
                    gen.imageUrls.map((imgUrl, imgIndex) => (
                      <div
                        key={`${gen.id}-${imgIndex}`}
                        draggable={!disabled}
                        onDragStart={(e: React.DragEvent) => {
                          e.dataTransfer.setData('application/x-reference', JSON.stringify({
                            id: `gen-${gen.id}-${imgIndex}`,
                            url: imgUrl,
                            name: gen.prompt.slice(0, 30),
                            type: 'generation',
                            thumbnailUrl: imgIndex === 0 && gen.thumbnailUrl ? gen.thumbnailUrl : imgUrl,
                          }))
                          e.dataTransfer.effectAllowed = 'copy'
                        }}
                        onClick={() => handleTapImage(gen, imgIndex)}
                        className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-700 hover:border-cyan-500/50 transition-all bg-gray-900 cursor-grab active:cursor-grabbing"
                      >
                        {/* Thumbnail */}
                        <img
                          src={imgIndex === 0 && gen.thumbnailUrl 
                            ? `${API_URL}${gen.thumbnailUrl}` 
                            : `${API_URL}${gen.imageUrls[imgIndex]}`
                          }
                          alt={gen.prompt}
                          className="w-full h-full object-cover pointer-events-none"
                          loading="lazy"
                        />
                        
                        {/* Always visible X delete button */}
                        <button
                          onClick={(e) => handleDelete(gen.id, e)}
                          disabled={deletingId === gen.id}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-500 flex items-center justify-center transition-colors"
                        >
                          {deletingId === gen.id ? (
                            <Loader2 className="w-3 h-3 text-white animate-spin" />
                          ) : (
                            <X className="w-3 h-3 text-white" />
                          )}
                        </button>
                        
                        {/* Multi-image indicator */}
                        {gen.imageUrls.length > 1 && imgIndex === 0 && (
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 font-mono text-[9px] text-white">
                            +{gen.imageUrls.length - 1}
                          </div>
                        )}
                      </div>
                    ))
                  ))}
                </div>
                
                {/* Load more */}
                {hasMore && (
                  <div className="flex justify-center mt-3">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-gray-300 font-mono text-xs uppercase flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          LOADING...
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4" />
                          LOAD MORE
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Preview Modal - Tap to enlarge */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            {/* Close button */}
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Image */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-3xl max-h-[80vh]"
            >
              <img
                src={previewImage.url}
                alt={previewImage.gen.prompt}
                className="max-w-full max-h-[70vh] object-contain rounded-lg border-2 border-gray-800"
              />
              
              {/* Action buttons below image */}
              <div className="flex gap-3 justify-center mt-4">
                <button
                  onClick={() => handleUseAsRef(previewImage.gen, previewImage.index)}
                  disabled={disabled}
                  className="px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white font-mono text-sm uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50"
                >
                  + Add to Crucible
                </button>
                <button
                  onClick={() => handleEdit(previewImage.gen, previewImage.index)}
                  disabled={disabled}
                  className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-white font-mono text-sm uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50"
                >
                  Edit This
                </button>
              </div>

              {/* Prompt */}
              <p className="text-center mt-3 text-gray-400 font-mono text-xs max-w-md mx-auto truncate">
                {previewImage.gen.prompt}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
