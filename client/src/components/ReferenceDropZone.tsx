import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Image as ImageIcon } from 'lucide-react'
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

    // Check for custom reference data (from Highrise or History)
    const refData = e.dataTransfer.getData('application/x-reference')
    if (refData) {
      try {
        const ref: ReferenceItem = JSON.parse(refData)
        // Avoid duplicates
        if (!references.find(r => r.id === ref.id)) {
          onReferencesChange([...references, ref].slice(0, maxRefs))
        }
        return
      } catch (err) {
        console.error('Failed to parse reference data:', err)
      }
    }

    // Check for dropped files
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
    // For Highrise/generation URLs, may need API prefix
    if (ref.url.startsWith('http') || ref.url.startsWith('data:')) return ref.url
    return `${API_URL}${ref.url}`
  }

  const spotsLeft = maxRefs - references.length

  return (
    <div className="te-panel p-4">
      <div className="te-module-header mb-3">
        <ImageIcon className="w-3.5 h-3.5 text-te-fuchsia" />
        <span>STYLE_REFERENCES</span>
        <div className="flex-1" />
        <span className="font-mono text-[10px] text-te-cream-dim">
          {references.length}/{maxRefs}
        </span>
        <div className={`w-2 h-2 ml-2 led ${references.length > 0 ? 'led-green' : 'led-off'}`} />
      </div>

      {/* Drop zone */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        animate={isDragging ? { scale: 1.02 } : { scale: 1 }}
        className={`
          relative min-h-[120px] rounded-lg border-2 border-dashed transition-all duration-200
          ${isDragging 
            ? 'border-te-fuchsia bg-te-fuchsia/10' 
            : references.length === 0 
              ? 'border-te-border bg-te-panel-dark'
              : 'border-te-border/50 bg-transparent'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {/* Empty state */}
        {references.length === 0 && !isDragging && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-te-cream-dim p-4">
            <Plus className="w-8 h-8 mb-2 opacity-40" />
            <p className="font-mono text-xs text-center uppercase tracking-wider">
              Drop images here
            </p>
            <p className="font-mono text-[10px] text-center text-te-cream-muted mt-1">
              Files, Highrise items, or past generations
            </p>
          </div>
        )}

        {/* Drag active state */}
        {isDragging && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-te-fuchsia p-4 z-10">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <Plus className="w-10 h-10 mb-2" />
            </motion.div>
            <p className="font-mono text-sm uppercase tracking-wider">
              Drop to add
            </p>
          </div>
        )}

        {/* Reference grid */}
        {references.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 p-2">
            <AnimatePresence mode="popLayout">
              {references.map(ref => (
                <motion.div
                  key={ref.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative aspect-square rounded-lg overflow-hidden border border-te-border bg-te-panel-dark group"
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
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}

                  {/* Type indicator */}
                  <div className={`
                    absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[8px] font-mono text-center
                    ${ref.type === 'highrise' ? 'bg-te-fuchsia/80 text-white' : 
                      ref.type === 'generation' ? 'bg-cyan-500/80 text-white' : 
                      'bg-te-bg/80 text-te-cream'}
                  `}>
                    {ref.type === 'highrise' ? 'HR' : ref.type === 'generation' ? 'GEN' : 'FILE'}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Add more placeholder */}
            {spotsLeft > 0 && !isDragging && (
              <div className="aspect-square rounded-lg border border-dashed border-te-border/50 flex items-center justify-center text-te-cream-muted">
                <Plus className="w-4 h-4" />
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}
