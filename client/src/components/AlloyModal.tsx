import { useState, useCallback } from 'react'
import { X, Trash2, ArchiveRestore, Swords, Box, Star, Layers } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Thumb } from './Thumb'
import { API_URL } from '../config'
import HighriseSearch from './HighriseSearch'
import HistoryGrid, { type ReplayConfig } from './HistoryGrid'
import { Favorites } from './Favorites'
import { SavedAlloys } from './SavedAlloys'

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

type RefSource = 'drop' | 'items' | 'history' | 'favorites' | 'alloys'

interface AlloyModalProps {
  isOpen: boolean
  onClose: () => void
  references: Reference[]
  onAddReference: (ref: Reference) => void
  onRemoveReference: (id: string) => void
  onClearAll: () => void
  maxRefs?: number
  disabled?: boolean
  bridgeConnected: boolean
  inAPContext: boolean
  authenticated: boolean
  onLogin: () => void
  onReplay?: (config: ReplayConfig) => void
  onRefine?: (url: string) => void
  onUseAlloy?: (refs: Reference[]) => void
  favoritesResetKey?: number
}

export function AlloyModal({
  isOpen,
  onClose,
  references,
  onAddReference,
  onRemoveReference,
  onClearAll,
  maxRefs = 14,
  disabled = false,
  bridgeConnected,
  inAPContext,
  authenticated,
  onLogin,
  onReplay,
  onRefine,
  onUseAlloy,
  favoritesResetKey = 0,
}: AlloyModalProps) {
  const [refSource, setRefSource] = useState<RefSource>('items')
  const [isDragging, setIsDragging] = useState(false)
  const [activeDropTarget, setActiveDropTarget] = useState<'refs' | null>(null)
  const [localFavoritesResetKey, setLocalFavoritesResetKey] = useState(0)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const data = e.dataTransfer.getData('application/x-reference')
    if (data) {
      try {
        onAddReference(JSON.parse(data))
        return
      } catch {}
    }
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const url = ev.target?.result as string
        onAddReference({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          name: file.name,
          type: 'file'
        })
      }
      reader.readAsDataURL(file)
    })
  }, [onAddReference])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="alloy-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div 
            className="alloy-modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="alloy-modal-header">
              <span className="panel-icon icon-alloy" />
              <span className="alloy-modal-title">Alloy</span>
              <span className="alloy-modal-subtitle">image references</span>
              <button className="alloy-modal-close" onClick={onClose}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="alloy-modal-tabs">
              <div className="btn-group">
                <button 
                  className={`btn ${refSource === 'drop' ? 'btn-accent' : 'btn-dark'}`}
                  onClick={() => setRefSource('drop')}
                >
                  <ArchiveRestore className="w-4 h-4" />
                  Drop
                </button>
                <button 
                  className={`btn ${refSource === 'items' ? 'btn-accent' : 'btn-dark'}`}
                  onClick={() => setRefSource('items')}
                >
                  <Swords className="w-4 h-4" />
                  Items
                </button>
                <button 
                  className={`btn ${refSource === 'history' ? 'btn-accent' : 'btn-dark'}`}
                  onClick={() => setRefSource('history')}
                >
                  <Box className="w-4 h-4" />
                  Works
                </button>
                <button 
                  className={`btn ${refSource === 'favorites' ? 'btn-accent' : 'btn-dark'}`}
                  onClick={() => {
                    if (refSource === 'favorites') {
                      // Already on Favorites - trigger reset (back to root)
                      setLocalFavoritesResetKey(k => k + 1)
                    } else {
                      setRefSource('favorites')
                    }
                  }}
                >
                  <Star className="w-4 h-4" />
                  Favorites
                </button>
                <button 
                  className={`btn ${refSource === 'alloys' ? 'btn-accent' : 'btn-dark'}`}
                  onClick={() => setRefSource('alloys')}
                >
                  <Layers className="w-4 h-4" />
                  Alloys
                </button>
              </div>
            </div>

            {/* Content - tabs stay mounted to preserve state */}
            <div className="alloy-modal-content">
              {/* Drop tab */}
              <div className={`alloy-tab-panel ${refSource === 'drop' ? 'active' : ''}`}>
                <div 
                  className={`dropzone dropzone-refs ${isDragging ? 'dragging' : ''} ${activeDropTarget === 'refs' ? 'active' : ''}`}
                  onClick={() => setActiveDropTarget('refs')}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <span className="dropzone-text">
                    DROP OR PASTE IMAGES
                  </span>
                </div>
              </div>

              {/* Items tab */}
              <div className={`alloy-tab-panel ${refSource === 'items' ? 'active' : ''}`}>
                <HighriseSearch
                  references={references}
                  onAddReference={onAddReference}
                  onRemoveReference={onRemoveReference}
                  maxRefs={maxRefs}
                  disabled={disabled}
                  bridgeConnected={bridgeConnected}
                  useAPBridge={inAPContext}
                />
              </div>

              {/* History/Works tab */}
              <div className={`alloy-tab-panel ${refSource === 'history' ? 'active' : ''}`}>
                <HistoryGrid
                  authenticated={authenticated}
                  onLogin={onLogin}
                  references={references}
                  onAddReference={onAddReference}
                  onRemoveReference={onRemoveReference}
                  maxRefs={maxRefs}
                  disabled={disabled}
                  isActive={refSource === 'history'}
                  onReplay={onReplay}
                  onRefine={onRefine}
                  onUseAlloy={onUseAlloy}
                />
              </div>

              {/* Favorites tab */}
              <div className={`alloy-tab-panel ${refSource === 'favorites' ? 'active' : ''}`}>
                <Favorites
                  authenticated={authenticated}
                  onLogin={onLogin}
                  references={references}
                  onAddReference={onAddReference}
                  onRemoveReference={onRemoveReference}
                  maxRefs={maxRefs}
                  disabled={disabled}
                  isActive={refSource === 'favorites'}
                  resetKey={favoritesResetKey + localFavoritesResetKey}
                />
              </div>

              {/* Alloys tab */}
              <div className={`alloy-tab-panel ${refSource === 'alloys' ? 'active' : ''}`}>
                <SavedAlloys
                  authenticated={authenticated}
                  onLogin={onLogin}
                  onUseAlloy={(refs) => {
                    // Clear current references and add all from the saved alloy
                    onClearAll()
                    refs.forEach(ref => onAddReference(ref))
                  }}
                  isActive={refSource === 'alloys'}
                />
              </div>
            </div>

            {/* Active References Footer */}
            <div className="alloy-modal-footer">
              <div className="alloy-modal-footer-header">
                <span className={`led ${references.length > 0 ? 'on' : ''}`} />
                <span>Active ({references.length}/{maxRefs})</span>
                {references.length > 0 && (
                  <button 
                    className="active-refs-clear"
                    onClick={onClearAll}
                    title="Clear all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              {references.length > 0 && (
                <div className="thumb-grid">
                  <AnimatePresence mode="popLayout">
                    {references.map((ref) => (
                      <Thumb
                        key={ref.id}
                        src={ref.url.startsWith('http') || ref.url.startsWith('data:') ? ref.url : `${API_URL}${ref.url}`}
                        alt={ref.name}
                        onRemove={() => onRemoveReference(ref.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AlloyModal
