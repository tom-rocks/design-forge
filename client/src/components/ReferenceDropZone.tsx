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
  isForging?: boolean // When generation is in progress
}

export default function ReferenceDropZone({ 
  references, 
  onReferencesChange, 
  maxRefs, 
  disabled,
  isForging = false
}: ReferenceDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  // Heat level based on refs (0 = cold, 1 = max heat)
  const heatLevel = Math.min(references.length / maxRefs, 1)
  
  // Color transitions from cool to hot
  const getHeatColor = (level: number) => {
    if (level < 0.2) return { border: '#3a3a3a', glow: 'transparent', bg: '#1a1a1a' }
    if (level < 0.4) return { border: '#8b4513', glow: 'rgba(139, 69, 19, 0.3)', bg: '#2a1a10' }
    if (level < 0.6) return { border: '#d2691e', glow: 'rgba(210, 105, 30, 0.4)', bg: '#3a2010' }
    if (level < 0.8) return { border: '#ff6b35', glow: 'rgba(255, 107, 53, 0.5)', bg: '#4a2515' }
    return { border: '#ff4500', glow: 'rgba(255, 69, 0, 0.6)', bg: '#5a2a1a' }
  }
  
  const heatColors = getHeatColor(heatLevel)

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
    if (ref.url.startsWith('http') || ref.url.startsWith('data:')) return ref.url
    return `${API_URL}${ref.url}`
  }

  return (
    <div className="relative">
      {/* CRUCIBLE - The main container */}
      <motion.div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        animate={{ 
          scale: isDragging ? 1.02 : 1,
        }}
        className="relative overflow-hidden rounded-xl"
        style={{
          background: `linear-gradient(180deg, ${heatColors.bg} 0%, #0a0a0a 100%)`,
          border: `3px solid ${heatColors.border}`,
          boxShadow: `
            0 0 20px ${heatColors.glow},
            inset 0 0 30px rgba(0,0,0,0.8)
          `,
          transition: 'all 0.5s ease',
        }}
      >
        {/* Heat glow effect on edges */}
        {heatLevel > 0.2 && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: `radial-gradient(ellipse at center, transparent 40%, ${heatColors.glow} 100%)`,
            }}
          />
        )}

        {/* Ember particles when hot */}
        {heatLevel > 0.5 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(Math.floor(heatLevel * 8))].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-orange-400"
                initial={{ 
                  x: Math.random() * 100 + '%',
                  y: '100%',
                  opacity: 0,
                }}
                animate={{
                  y: '-20%',
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                  ease: 'easeOut',
                }}
                style={{
                  left: `${10 + Math.random() * 80}%`,
                  filter: 'blur(0.5px)',
                  boxShadow: '0 0 4px #ff6b35',
                }}
              />
            ))}
          </div>
        )}

        {/* Header */}
        <div className="relative z-10 px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            {/* Crucible icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke={heatLevel > 0.3 ? '#ff6b35' : '#666'} strokeWidth="2">
              <path d="M4 6 C4 6, 2 8, 2 12 C2 16, 6 20, 12 20 C18 20, 22 16, 22 12 C22 8, 20 6, 20 6" />
              <path d="M4 6 L20 6" />
              <path d="M6 6 L6 4 M18 6 L18 4" />
            </svg>
            <span className="font-mono text-xs uppercase tracking-wider" style={{ color: heatLevel > 0.3 ? '#ff6b35' : '#888' }}>
              CRUCIBLE
            </span>
            <div className="flex-1" />
            <span className="font-mono text-[10px]" style={{ color: heatLevel > 0.5 ? '#ff6b35' : '#666' }}>
              {references.length}/{maxRefs}
            </span>
            {/* Heat indicator */}
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-3 rounded-sm transition-colors duration-300"
                  style={{
                    backgroundColor: i < Math.ceil(heatLevel * 5) 
                      ? `hsl(${30 - i * 6}, 100%, ${50 + i * 5}%)`
                      : '#333'
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Drop zone content */}
        <div className="relative z-10 min-h-[100px] p-3">
          {/* Empty state */}
          {references.length === 0 && !isDragging && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Plus className="w-8 h-8 mb-2 opacity-30 text-gray-500" />
              <p className="font-mono text-xs text-gray-500 uppercase tracking-wider">
                Drop ingredients
              </p>
              <p className="font-mono text-[10px] text-gray-600 mt-1">
                Images, items, or generations
              </p>
            </div>
          )}

          {/* Drag active state */}
          {isDragging && (
            <motion.div 
              className="absolute inset-0 flex flex-col items-center justify-center z-20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ backgroundColor: 'rgba(255, 107, 53, 0.2)' }}
            >
              <motion.div
                animate={{ y: [0, -8, 0], scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              >
                <Plus className="w-10 h-10 text-orange-400" />
              </motion.div>
              <p className="font-mono text-sm text-orange-400 uppercase mt-2">
                Add to crucible
              </p>
            </motion.div>
          )}

          {/* Reference grid */}
          {references.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              <AnimatePresence mode="popLayout">
                {references.map((ref, i) => (
                  <motion.div
                    key={ref.id}
                    layout
                    initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, y: 20 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className="relative aspect-square rounded-lg overflow-hidden group"
                    style={{
                      border: `2px solid ${heatLevel > 0.5 ? 'rgba(255, 107, 53, 0.5)' : '#333'}`,
                      boxShadow: heatLevel > 0.3 ? `0 0 ${8 + i * 2}px rgba(255, 107, 53, ${0.2 + heatLevel * 0.3})` : 'none',
                    }}
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
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Add more placeholder */}
              {references.length < maxRefs && !isDragging && (
                <div 
                  className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center transition-colors"
                  style={{ borderColor: heatLevel > 0.3 ? 'rgba(255, 107, 53, 0.3)' : '#333' }}
                >
                  <Plus className="w-4 h-4" style={{ color: heatLevel > 0.3 ? 'rgba(255, 107, 53, 0.5)' : '#444' }} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Crucible bottom - molten pool effect */}
        {references.length > 0 && (
          <div 
            className="h-2 relative overflow-hidden"
            style={{
              background: `linear-gradient(90deg, 
                transparent 0%, 
                ${heatColors.border}44 20%, 
                ${heatColors.border}88 50%, 
                ${heatColors.border}44 80%, 
                transparent 100%
              )`,
            }}
          >
            <motion.div
              className="absolute inset-0"
              animate={{
                backgroundPosition: ['0% 0%', '100% 0%'],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              style={{
                background: `linear-gradient(90deg, 
                  transparent, 
                  rgba(255, 165, 0, 0.4), 
                  transparent, 
                  rgba(255, 69, 0, 0.4), 
                  transparent
                )`,
                backgroundSize: '200% 100%',
              }}
            />
          </div>
        )}
      </motion.div>

      {/* MOLTEN FLOW - Appears when forging */}
      <AnimatePresence>
        {isForging && references.length > 0 && (
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 w-8 z-50"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 200, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ top: '100%' }}
          >
            {/* Molten stream */}
            <motion.div
              className="absolute inset-x-0 top-0 rounded-full"
              animate={{
                height: ['0%', '100%'],
              }}
              transition={{ duration: 1.5, ease: 'easeIn' }}
              style={{
                background: 'linear-gradient(180deg, #ff6b35 0%, #ff4500 30%, #ff8c00 60%, #ffa500 100%)',
                boxShadow: '0 0 20px #ff6b35, 0 0 40px #ff450088, 0 10px 30px #ff8c0066',
                filter: 'blur(1px)',
              }}
            />
            
            {/* Glow effect */}
            <motion.div
              className="absolute inset-x-[-100%] top-0 bottom-0"
              animate={{
                opacity: [0.5, 1, 0.5],
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              style={{
                background: 'radial-gradient(ellipse at center, rgba(255, 107, 53, 0.4) 0%, transparent 70%)',
              }}
            />

            {/* Dripping drops */}
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-orange-500"
                initial={{ y: 0, opacity: 0 }}
                animate={{
                  y: [0, 200],
                  opacity: [0, 1, 1, 0],
                  scale: [0.5, 1, 0.8],
                }}
                transition={{
                  duration: 1,
                  delay: 0.3 + i * 0.2,
                  repeat: Infinity,
                  repeatDelay: 0.5,
                }}
                style={{
                  left: `${30 + i * 20}%`,
                  boxShadow: '0 0 8px #ff6b35',
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
