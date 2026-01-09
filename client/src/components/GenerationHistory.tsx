import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, Trash2, Pencil, Image as ImageIcon, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
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
  refreshKey?: number // Used to trigger refresh from parent
}

export default function GenerationHistory({ 
  onUseAsReference, 
  onEditImage,
  disabled,
  refreshKey
}: GenerationHistoryProps) {
  const [generations, setGenerations] = useState<Generation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [isExpanded, setIsExpanded] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
  }, [fetchGenerations, refreshKey])

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      fetchGenerations(generations.length, true)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this generation?')) return
    
    setDeletingId(id)
    try {
      const res = await fetch(`${API_URL}/api/generations/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setGenerations(prev => prev.filter(g => g.id !== id))
        setTotal(prev => prev - 1)
      }
    } catch (err) {
      console.error('Failed to delete:', err)
    } finally {
      setDeletingId(null)
    }
  }

  // Edit using server storage path - no base64 round-trip needed
  const handleEdit = (gen: Generation, imageIndex: number) => {
    onEditImage({
      type: 'storage',
      value: `/api/generations/${gen.id}/image/${imageIndex}`,
      generationId: gen.id
    })
  }

  const handleUseAsRef = (gen: Generation, imageIndex: number) => {
    const imageUrl = `${API_URL}${gen.imageUrls[imageIndex]}`
    onUseAsReference(imageUrl)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  if (loading && generations.length === 0) {
    return (
      <div className="te-panel p-4">
        <div className="te-module-header border-b-0 px-0 pb-2">
          <History className="w-3.5 h-3.5 text-te-fuchsia" />
          <span>GENERATION_HISTORY</span>
          <div className="flex-1" />
          <div className="w-2 h-2 led led-amber led-pulse" />
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-te-fuchsia animate-spin" />
        </div>
      </div>
    )
  }

  if (generations.length === 0) {
    return (
      <div className="te-panel p-4">
        <div className="te-module-header border-b-0 px-0 pb-2">
          <History className="w-3.5 h-3.5 text-te-fuchsia" />
          <span>GENERATION_HISTORY</span>
          <div className="flex-1" />
          <div className="w-2 h-2 led led-off" />
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-te-cream-dim">
          <ImageIcon className="w-10 h-10 mb-2 opacity-30" />
          <p className="font-mono text-xs">NO GENERATIONS YET</p>
        </div>
      </div>
    )
  }

  return (
    <div className="te-panel">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center gap-2 hover:bg-te-panel-dark transition-colors"
      >
        <div className="te-module-header border-b-0 px-0 flex-1">
          <History className="w-3.5 h-3.5 text-te-fuchsia" />
          <span>GENERATION_HISTORY</span>
          <span className="text-te-cream-dim font-mono text-[10px] ml-2">
            ({total})
          </span>
          <div className="flex-1" />
          <div className="w-2 h-2 led led-green" />
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-te-cream-dim" />
        ) : (
          <ChevronDown className="w-4 h-4 text-te-cream-dim" />
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
            <div className="p-4 pt-0">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-[400px] overflow-y-auto">
                {generations.map((gen) => (
                  gen.imageUrls.map((_, imgIndex) => (
                    <motion.div
                      key={`${gen.id}-${imgIndex}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group relative aspect-square rounded-lg overflow-hidden border-2 border-te-border hover:border-te-fuchsia transition-all bg-te-panel-dark"
                    >
                      {/* Thumbnail */}
                      <img
                        src={imgIndex === 0 && gen.thumbnailUrl 
                          ? `${API_URL}${gen.thumbnailUrl}` 
                          : `${API_URL}${gen.imageUrls[imgIndex]}`
                        }
                        alt={gen.prompt}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-te-bg/90 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                        {/* Action buttons */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleUseAsRef(gen, imgIndex)}
                            disabled={disabled}
                            className="p-1.5 rounded bg-te-fuchsia/20 hover:bg-te-fuchsia/40 text-te-fuchsia transition-colors disabled:opacity-50"
                            title="Use as reference"
                          >
                            <ImageIcon className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleEdit(gen, imgIndex)}
                            disabled={disabled}
                            className="p-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 transition-colors disabled:opacity-50"
                            title="Edit this image"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(gen.id)}
                            disabled={deletingId === gen.id}
                            className="p-1.5 rounded bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingId === gen.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        
                        {/* Timestamp */}
                        <span className="font-mono text-[8px] text-te-cream-dim">
                          {formatDate(gen.created_at)}
                        </span>
                      </div>
                      
                      {/* Edit chain indicator */}
                      {gen.mode === 'edit' && (
                        <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-cyan-500/80 font-mono text-[8px] text-white">
                          EDIT
                        </div>
                      )}
                      
                      {/* Multi-image indicator */}
                      {gen.imageUrls.length > 1 && imgIndex === 0 && (
                        <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-te-bg/80 font-mono text-[8px] text-te-cream">
                          +{gen.imageUrls.length - 1}
                        </div>
                      )}
                    </motion.div>
                  ))
                ))}
              </div>
              
              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="te-button px-4 py-2 flex items-center gap-2"
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
  )
}
