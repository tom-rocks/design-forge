import { useState, useEffect, useCallback } from 'react'
import { Loader2, Pin, Pencil, Trash2, Check, X, LogIn } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'

interface AlloyItem {
  url: string
  name?: string
}

interface SavedAlloy {
  id: string
  name: string
  items: AlloyItem[]
  pinned: boolean
  last_used_at: string
  created_at: string
}

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

interface SavedAlloysProps {
  authenticated: boolean
  onLogin: () => void
  onUseAlloy: (refs: Reference[]) => void
  isActive: boolean
}

export function SavedAlloys({
  authenticated,
  onLogin,
  onUseAlloy,
  isActive,
}: SavedAlloysProps) {
  const [alloys, setAlloys] = useState<SavedAlloy[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Fetch alloys
  const fetchAlloys = useCallback(async () => {
    if (!authenticated) return
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(`${API_URL}/api/alloys`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch alloys')
      const data = await res.json()
      setAlloys(data.alloys || [])
    } catch (err) {
      console.error('[SavedAlloys] Error fetching:', err)
      setError('Failed to load saved alloys')
    } finally {
      setLoading(false)
    }
  }, [authenticated])

  // Load on mount and when tab becomes active
  useEffect(() => {
    if (isActive && authenticated) {
      fetchAlloys()
    }
  }, [isActive, authenticated, fetchAlloys])

  // Use an alloy
  const handleUse = async (alloy: SavedAlloy) => {
    // Convert alloy items to references
    const refs: Reference[] = alloy.items.map((item, i) => ({
      id: `alloy-${alloy.id}-${i}-${Date.now()}`,
      url: item.url,
      name: item.name,
      type: 'highrise' as const,
    }))
    
    onUseAlloy(refs)
    
    // Update last_used_at on server
    try {
      await fetch(`${API_URL}/api/alloys/${alloy.id}/use`, {
        method: 'POST',
        credentials: 'include',
      })
      // Move to top of non-pinned items
      setAlloys(prev => {
        const updated = prev.map(a => 
          a.id === alloy.id ? { ...a, last_used_at: new Date().toISOString() } : a
        )
        // Re-sort: pinned first, then by last_used
        return updated.sort((a, b) => {
          if (a.pinned !== b.pinned) return b.pinned ? 1 : -1
          return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()
        })
      })
    } catch (err) {
      console.error('[SavedAlloys] Error updating last_used:', err)
    }
  }

  // Toggle pin
  const handleTogglePin = async (alloy: SavedAlloy, e: React.MouseEvent) => {
    e.stopPropagation()
    
    const newPinned = !alloy.pinned
    
    // Optimistic update
    setAlloys(prev => {
      const updated = prev.map(a => 
        a.id === alloy.id ? { ...a, pinned: newPinned } : a
      )
      return updated.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1
        return new Date(b.last_used_at).getTime() - new Date(a.last_used_at).getTime()
      })
    })
    
    try {
      await fetch(`${API_URL}/api/alloys/${alloy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pinned: newPinned }),
      })
    } catch (err) {
      console.error('[SavedAlloys] Error toggling pin:', err)
      // Revert on error
      setAlloys(prev => prev.map(a => 
        a.id === alloy.id ? { ...a, pinned: !newPinned } : a
      ))
    }
  }

  // Start editing name
  const handleStartEdit = (alloy: SavedAlloy, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(alloy.id)
    setEditName(alloy.name)
  }

  // Save edited name
  const handleSaveName = async (alloy: SavedAlloy) => {
    if (!editName.trim()) {
      setEditingId(null)
      return
    }
    
    const newName = editName.trim()
    
    // Optimistic update
    setAlloys(prev => prev.map(a => 
      a.id === alloy.id ? { ...a, name: newName } : a
    ))
    setEditingId(null)
    
    try {
      await fetch(`${API_URL}/api/alloys/${alloy.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName }),
      })
    } catch (err) {
      console.error('[SavedAlloys] Error renaming:', err)
    }
  }

  // Delete alloy
  const handleDelete = async (alloy: SavedAlloy, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm(`Delete "${alloy.name}"?`)) return
    
    // Optimistic update
    setAlloys(prev => prev.filter(a => a.id !== alloy.id))
    
    try {
      await fetch(`${API_URL}/api/alloys/${alloy.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
    } catch (err) {
      console.error('[SavedAlloys] Error deleting:', err)
      fetchAlloys() // Refetch on error
    }
  }

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    })
  }

  if (!authenticated) {
    return (
      <div className="saved-alloys-login">
        <LogIn className="w-6 h-6" />
        <p>Sign in to view saved alloys</p>
        <button className="btn btn-accent" onClick={onLogin}>
          Sign In
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="saved-alloys-loading">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Loading alloys...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="saved-alloys-error">
        <p>{error}</p>
        <button className="btn btn-dark" onClick={fetchAlloys}>
          Try Again
        </button>
      </div>
    )
  }

  if (alloys.length === 0) {
    return (
      <div className="saved-alloys-empty">
        <span className="btn-icon icon-alloy" style={{ width: 32, height: 32, opacity: 0.5 }} />
        <p>No saved alloys yet</p>
        <p className="saved-alloys-hint">
          Alloys are automatically saved when you generate with references
        </p>
      </div>
    )
  }

  return (
    <div className="saved-alloys">
      <AnimatePresence mode="popLayout">
        {alloys.map(alloy => (
          <motion.div
            key={alloy.id}
            layout
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`saved-alloy-item ${alloy.pinned ? 'pinned' : ''}`}
            onClick={() => handleUse(alloy)}
          >
            {/* Thumbnail previews */}
            <div className="saved-alloy-thumbs">
              {alloy.items.slice(0, 4).map((item, i) => (
                <div key={i} className="saved-alloy-thumb">
                  <img 
                    src={item.url.startsWith('http') || item.url.startsWith('data:') 
                      ? item.url 
                      : `${API_URL}${item.url}`
                    } 
                    alt="" 
                  />
                </div>
              ))}
              {alloy.items.length > 4 && (
                <div className="saved-alloy-thumb saved-alloy-more">
                  +{alloy.items.length - 4}
                </div>
              )}
            </div>
            
            {/* Info */}
            <div className="saved-alloy-info">
              {editingId === alloy.id ? (
                <div className="saved-alloy-edit" onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveName(alloy)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                    className="input"
                  />
                  <button 
                    className="saved-alloy-edit-btn"
                    onClick={() => handleSaveName(alloy)}
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button 
                    className="saved-alloy-edit-btn"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="saved-alloy-name">{alloy.name}</span>
                  <span className="saved-alloy-date">{formatDate(alloy.last_used_at)}</span>
                </>
              )}
            </div>
            
            {/* Actions */}
            <div className="saved-alloy-actions">
              <button
                className={`saved-alloy-action ${alloy.pinned ? 'active' : ''}`}
                onClick={e => handleTogglePin(alloy, e)}
                title={alloy.pinned ? 'Unpin' : 'Pin to top'}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                className="saved-alloy-action"
                onClick={e => handleStartEdit(alloy, e)}
                title="Rename"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                className="saved-alloy-action delete"
                onClick={e => handleDelete(alloy, e)}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default SavedAlloys
