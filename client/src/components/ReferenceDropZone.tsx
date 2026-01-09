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
  isForging?: boolean
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
  
  // Boost heat when forging
  const effectiveHeat = isForging ? Math.max(heatLevel, 0.8) : heatLevel
  
  // Color transitions from cool to hot
  const getHeatColor = (level: number) => {
    if (level < 0.2) return { border: '#3a3a3a', glow: 'transparent', bg: '#1a1a1a', inner: '#222' }
    if (level < 0.4) return { border: '#8b4513', glow: 'rgba(139, 69, 19, 0.3)', bg: '#2a1a10', inner: '#3d2817' }
    if (level < 0.6) return { border: '#d2691e', glow: 'rgba(210, 105, 30, 0.4)', bg: '#3a2010', inner: '#4d3020' }
    if (level < 0.8) return { border: '#ff6b35', glow: 'rgba(255, 107, 53, 0.5)', bg: '#4a2515', inner: '#5d3525' }
    return { border: '#ff4500', glow: 'rgba(255, 69, 0, 0.6)', bg: '#5a2a1a', inner: '#6d3a2a' }
  }
  
  const heatColors = getHeatColor(effectiveHeat)

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
    <motion.div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      animate={{ scale: isDragging ? 1.01 : 1 }}
      className="relative overflow-hidden rounded-xl"
      style={{
        background: `linear-gradient(180deg, ${heatColors.bg} 0%, #0a0a0a 100%)`,
        border: `4px solid ${heatColors.border}`,
        boxShadow: `
          0 0 ${isForging ? 40 : 20}px ${heatColors.glow},
          inset 0 0 40px rgba(0,0,0,0.9),
          inset 0 4px 8px rgba(0,0,0,0.5)
        `,
        transition: 'all 0.5s ease',
      }}
    >
      {/* Heat glow pulsing on edges */}
      {effectiveHeat > 0.2 && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-xl"
          animate={{
            opacity: isForging ? [0.4, 0.8, 0.4] : [0.2, 0.5, 0.2],
          }}
          transition={{ duration: isForging ? 0.5 : 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: `radial-gradient(ellipse at center, transparent 30%, ${heatColors.glow} 100%)`,
          }}
        />
      )}

      {/* Ember particles when hot or forging */}
      {(effectiveHeat > 0.5 || isForging) && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(isForging ? 12 : Math.floor(effectiveHeat * 8))].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              initial={{ 
                x: `${Math.random() * 100}%`,
                y: '100%',
                opacity: 0,
              }}
              animate={{
                y: '-30%',
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: isForging ? 1 + Math.random() : 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
                ease: 'easeOut',
              }}
              style={{
                left: `${5 + Math.random() * 90}%`,
                background: `hsl(${20 + Math.random() * 20}, 100%, ${50 + Math.random() * 20}%)`,
                filter: 'blur(0.5px)',
                boxShadow: '0 0 6px #ff6b35',
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          {/* Crucible icon */}
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke={effectiveHeat > 0.3 ? '#ff6b35' : '#666'} strokeWidth="2">
            <path d="M4 6 C4 6, 2 8, 2 12 C2 16, 6 20, 12 20 C18 20, 22 16, 22 12 C22 8, 20 6, 20 6" />
            <path d="M4 6 L20 6" />
            <path d="M6 6 L6 4 M18 6 L18 4" />
          </svg>
          <span 
            className="font-mono text-sm uppercase tracking-wider font-bold"
            style={{ 
              color: effectiveHeat > 0.3 ? '#ff6b35' : '#888',
              textShadow: effectiveHeat > 0.5 ? '0 0 10px rgba(255, 107, 53, 0.5)' : 'none',
            }}
          >
            CRUCIBLE
          </span>
          <div className="flex-1" />
          <span 
            className="font-mono text-xs"
            style={{ color: effectiveHeat > 0.5 ? '#ff6b35' : '#666' }}
          >
            {references.length}/{maxRefs}
          </span>
          {/* Heat indicator bars */}
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="w-2 h-4 rounded-sm"
                animate={isForging && i < Math.ceil(effectiveHeat * 5) ? {
                  opacity: [0.7, 1, 0.7],
                } : {}}
                transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.1 }}
                style={{
                  backgroundColor: i < Math.ceil(effectiveHeat * 5) 
                    ? `hsl(${30 - i * 6}, 100%, ${50 + i * 5}%)`
                    : '#333'
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Drop zone content - LARGER THUMBNAILS */}
      <div 
        className="relative z-10 min-h-[120px] p-4"
        style={{ backgroundColor: heatColors.inner }}
      >
        {/* Empty state */}
        {references.length === 0 && !isDragging && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Plus className="w-10 h-10 mb-3 opacity-30 text-gray-500" />
            <p className="font-mono text-sm text-gray-500 uppercase tracking-wider">
              Drop ingredients here
            </p>
            <p className="font-mono text-[11px] text-gray-600 mt-1">
              Drag from Highrise items or past generations
            </p>
          </div>
        )}

        {/* Drag active state */}
        {isDragging && (
          <motion.div 
            className="absolute inset-0 flex flex-col items-center justify-center z-20 rounded-b-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ backgroundColor: 'rgba(255, 107, 53, 0.25)' }}
          >
            <motion.div
              animate={{ y: [0, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ repeat: Infinity, duration: 0.6 }}
            >
              <Plus className="w-12 h-12 text-orange-400" />
            </motion.div>
            <p className="font-mono text-base text-orange-400 uppercase mt-3 font-bold">
              Add to crucible
            </p>
          </motion.div>
        )}

        {/* Reference grid - LARGER 80-100px thumbnails */}
        {references.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
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
                    border: `3px solid ${effectiveHeat > 0.5 ? 'rgba(255, 107, 53, 0.6)' : '#444'}`,
                    boxShadow: effectiveHeat > 0.3 
                      ? `0 0 ${10 + i * 2}px rgba(255, 107, 53, ${0.3 + effectiveHeat * 0.3}), inset 0 0 20px rgba(0,0,0,0.5)` 
                      : 'inset 0 0 20px rgba(0,0,0,0.5)',
                  }}
                >
                  <img
                    src={getDisplayUrl(ref)}
                    alt={ref.name || 'Reference'}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  
                  {/* Remove button - always visible */}
                  {!disabled && (
                    <button
                      onClick={() => removeReference(ref.id)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/80 hover:bg-red-500 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                  
                  {/* Type badge */}
                  <div 
                    className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
                    style={{
                      backgroundColor: ref.type === 'highrise' ? 'rgba(168, 85, 247, 0.8)' : 
                                       ref.type === 'generation' ? 'rgba(6, 182, 212, 0.8)' : 
                                       'rgba(75, 85, 99, 0.8)',
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
              <div 
                className="aspect-square rounded-lg border-3 border-dashed flex items-center justify-center transition-colors"
                style={{ borderColor: effectiveHeat > 0.3 ? 'rgba(255, 107, 53, 0.4)' : '#444' }}
              >
                <Plus className="w-6 h-6" style={{ color: effectiveHeat > 0.3 ? 'rgba(255, 107, 53, 0.6)' : '#555' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pour spout at bottom center - connects to gutter */}
      <div className="relative flex justify-center">
        <div 
          className="w-4 h-3 relative -mb-1"
          style={{
            background: effectiveHeat > 0.2 
              ? `linear-gradient(180deg, ${heatColors.border} 0%, ${isForging ? '#ff6b35' : heatColors.border} 100%)`
              : '#333',
            clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
            boxShadow: effectiveHeat > 0.3 ? `0 4px 8px ${heatColors.glow}` : 'none',
          }}
        >
          {/* Drip animation when forging */}
          {isForging && (
            <motion.div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 rounded-full"
              animate={{
                height: ['0px', '8px', '0px'],
                opacity: [0.8, 1, 0],
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              style={{
                background: 'linear-gradient(180deg, #ffcc00, #ff6b35)',
                boxShadow: '0 0 6px #ff6b35',
              }}
            />
          )}
        </div>
      </div>

    </motion.div>
  )
}
