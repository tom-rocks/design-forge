import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import { API_URL } from '../config'

export interface ReferenceItem {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
  thumbnailUrl?: string
}

interface ReferenceDropZoneProps {
  references: ReferenceItem[]
  onReferencesChange: (refs: ReferenceItem[]) => void
  maxRefs: number
  disabled?: boolean
}

export default function ReferenceDropZone({ 
  references, 
  onReferencesChange, 
  maxRefs, 
  disabled
}: ReferenceDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled && references.length < maxRefs) {
      setIsDragging(true)
    }
  }, [disabled, references.length, maxRefs])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled || references.length >= maxRefs) return

    const refData = e.dataTransfer.getData('application/x-reference')
    if (refData) {
      try {
        const ref: ReferenceItem = JSON.parse(refData)
        if (!references.find(r => r.id === ref.id)) {
          onReferencesChange([...references, ref].slice(0, maxRefs))
        }
        return
      } catch (err) {
        console.error('Failed to parse reference data:', err)
      }
    }

    const files = Array.from(e.dataTransfer.files)
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    
    if (imageFiles.length > 0) {
      const newRefs: ReferenceItem[] = []
      let processed = 0
      
      imageFiles.forEach(file => {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string
          newRefs.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            url: dataUrl,
            name: file.name,
            type: 'file',
          })
          processed++
          
          if (processed === imageFiles.length) {
            onReferencesChange([...references, ...newRefs].slice(0, maxRefs))
          }
        }
        reader.readAsDataURL(file)
      })
    }
  }, [disabled, references, maxRefs, onReferencesChange])

  const removeReference = useCallback((id: string) => {
    onReferencesChange(references.filter(r => r.id !== id))
  }, [references, onReferencesChange])

  const getDisplayUrl = (ref: ReferenceItem) => {
    if (ref.type === 'file') return ref.url
    if (ref.thumbnailUrl) return ref.thumbnailUrl
    if (ref.url.startsWith('http') || ref.url.startsWith('data:')) return ref.url
    return `${API_URL}${ref.url}`
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        te-panel overflow-hidden transition-all duration-200
        ${isDragging ? 'ring-2 ring-te-fuchsia ring-offset-2 ring-offset-te-bg' : ''}
      `}
    >
      {/* Header */}
      <div className="te-module-header">
        <svg className="w-4 h-4 text-te-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6 C4 6, 2 8, 2 12 C2 16, 6 20, 12 20 C18 20, 22 16, 22 12 C22 8, 20 6, 20 6" />
          <path d="M4 6 L20 6" />
          <path d="M6 6 L6 4 M18 6 L18 4" />
        </svg>
        <span>CRUCIBLE</span>
        <div className="flex-1" />
        <span className="text-te-cream-dim font-mono text-[10px]">
          {references.length}/{maxRefs}
        </span>
      </div>

      {/* Drop zone content */}
      <div className="relative min-h-[100px] p-4 bg-te-lcd">
        {/* Empty state */}
        {references.length === 0 && !isDragging && (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Plus className="w-8 h-8 mb-2 opacity-30 text-te-cream-dim" />
            <p className="font-mono text-xs text-te-cream-dim uppercase tracking-wider">
              Drop ingredients here
            </p>
            <p className="font-mono text-[10px] text-te-cream-dim/50 mt-1">
              Drag from Highrise items or past generations
            </p>
          </div>
        )}

        {/* Drag active state */}
        {isDragging && (
          <motion.div 
            className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-te-fuchsia/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              animate={{ y: [0, -8, 0], scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 0.6 }}
            >
              <Plus className="w-10 h-10 text-te-fuchsia" />
            </motion.div>
            <p className="font-mono text-sm text-te-fuchsia uppercase mt-2 font-bold">
              Drop to add
            </p>
          </motion.div>
        )}

        {/* Reference grid */}
        {references.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            <AnimatePresence mode="popLayout">
              {references.map((ref) => (
                <motion.div
                  key={ref.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-te-border hover:border-te-fuchsia transition-colors group"
                >
                  <img
                    src={getDisplayUrl(ref)}
                    alt={ref.name || 'Reference'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  
                  {/* Remove button */}
                  {!disabled && (
                    <button
                      onClick={() => removeReference(ref.id)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}
                  
                  {/* Type badge */}
                  <div 
                    className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[8px] font-mono uppercase"
                    style={{
                      backgroundColor: ref.type === 'highrise' ? 'rgba(168, 85, 247, 0.9)' : 
                                       ref.type === 'generation' ? 'rgba(6, 182, 212, 0.9)' : 
                                       'rgba(75, 85, 99, 0.9)',
                      color: 'white',
                    }}
                  >
                    {ref.type === 'highrise' ? 'HR' : ref.type === 'generation' ? 'GEN' : 'FILE'}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Add more placeholder */}
            {references.length < maxRefs && !isDragging && (
              <div className="aspect-square rounded-lg border-2 border-dashed border-te-border flex items-center justify-center">
                <Plus className="w-5 h-5 text-te-cream-dim/30" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
