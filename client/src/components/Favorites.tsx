import { useState, useEffect, useCallback, useMemo } from 'react'
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { Loader2, Plus, FolderPlus, LogIn, X, Download } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'
import { FavoriteItem } from './FavoriteItem'
import { FavoriteFolder } from './FavoriteFolder'

export interface Favorite {
  id: string
  type: 'item' | 'work' | 'image'
  item_data: {
    imageUrl: string
    name?: string
    category?: string
    rarity?: string
    prompt?: string
    generationId?: string
    itemId?: string  // For items - the dispId
  }
  folder_id: string | null
  sort_order: number
}

export interface Folder {
  id: string
  name: string
  sort_order: number
}

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

interface FavoritesProps {
  authenticated: boolean
  onLogin?: () => void
  // Multi-select mode
  references?: Reference[]
  onAddReference?: (ref: Reference) => void
  onRemoveReference?: (id: string) => void
  maxRefs?: number
  disabled?: boolean
  // Single-select mode for refine
  singleSelect?: boolean
  onSingleSelect?: (favorite: Favorite) => void
  // Whether this tab is currently active (triggers refresh)
  isActive?: boolean
}

export function Favorites({
  authenticated,
  onLogin,
  references = [],
  onAddReference,
  onRemoveReference,
  maxRefs = 14,
  disabled,
  singleSelect,
  onSingleSelect,
  isActive = true,
}: FavoritesProps) {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [lastFetchTime, setLastFetchTime] = useState(0)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<Favorite | null>(null)
  const [lightboxImageLoaded, setLightboxImageLoaded] = useState(false)
  
  // Reset image loaded state when lightbox changes
  useEffect(() => {
    if (lightbox) {
      setLightboxImageLoaded(false)
    }
  }, [lightbox?.id])
  
  // Track failed images - filter them out of display
  const handleImageFailed = useCallback((id: string) => {
    setFailedImages(prev => new Set(prev).add(id))
  }, [])
  
  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  
  // Fetch favorites
  const fetchFavorites = useCallback(async (showLoading = true) => {
    if (!authenticated) {
      setLoading(false)
      return
    }
    
    if (showLoading) setLoading(true)
    
    try {
      const res = await fetch(`${API_URL}/api/favorites`, {
        credentials: 'include',
      })
      
      if (!res.ok) {
        throw new Error('Failed to fetch favorites')
      }
      
      const data = await res.json()
      setFavorites(data.favorites || [])
      setFolders(data.folders || [])
      setError(null)
      setLastFetchTime(Date.now())
    } catch (e) {
      console.error('[Favorites] Error fetching:', e)
      setError('Failed to load favorites')
    } finally {
      setLoading(false)
    }
  }, [authenticated])
  
  // Initial fetch
  useEffect(() => {
    fetchFavorites()
  }, [fetchFavorites])
  
  // Refetch when tab becomes active (if stale > 5 seconds)
  useEffect(() => {
    if (isActive && authenticated && Date.now() - lastFetchTime > 5000) {
      fetchFavorites(false) // Don't show loading spinner on refresh
    }
  }, [isActive, authenticated, lastFetchTime, fetchFavorites])
  
  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    
    try {
      const res = await fetch(`${API_URL}/api/favorites/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newFolderName.trim() }),
      })
      
      if (!res.ok) throw new Error('Failed to create folder')
      
      const data = await res.json()
      setFolders(prev => [...prev, data.folder])
      setNewFolderName('')
      setCreatingFolder(false)
    } catch (e) {
      console.error('[Favorites] Error creating folder:', e)
    }
  }
  
  // Delete folder
  const handleDeleteFolder = async (folderId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/favorites/folders/${folderId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      
      if (!res.ok) throw new Error('Failed to delete folder')
      
      setFolders(prev => prev.filter(f => f.id !== folderId))
      // Items in the folder will have folder_id set to null on server
      setFavorites(prev => prev.map(f => 
        f.folder_id === folderId ? { ...f, folder_id: null } : f
      ))
      if (expandedFolder === folderId) {
        setExpandedFolder(null)
      }
    } catch (e) {
      console.error('[Favorites] Error deleting folder:', e)
    }
  }
  
  // Rename folder
  const handleRenameFolder = async (folderId: string, newName: string) => {
    try {
      const res = await fetch(`${API_URL}/api/favorites/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName }),
      })
      
      if (!res.ok) throw new Error('Failed to rename folder')
      
      setFolders(prev => prev.map(f => 
        f.id === folderId ? { ...f, name: newName } : f
      ))
    } catch (e) {
      console.error('[Favorites] Error renaming folder:', e)
    }
  }
  
  // Delete favorite
  const handleDeleteFavorite = async (favoriteId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/favorites/${favoriteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      
      if (!res.ok) throw new Error('Failed to delete favorite')
      
      setFavorites(prev => prev.filter(f => f.id !== favoriteId))
    } catch (e) {
      console.error('[Favorites] Error deleting favorite:', e)
    }
  }
  
  // Handle item click (select for generation)
  // URL handling matches HighriseSearch and HistoryGrid exactly
  const handleItemClick = (favorite: Favorite) => {
    if (singleSelect && onSingleSelect) {
      onSingleSelect(favorite)
      return
    }
    
    if (!onAddReference || !onRemoveReference) return
    
    const refId = `fav-${favorite.id}`
    const existingRef = references.find(r => r.id === refId)
    
    if (existingRef) {
      onRemoveReference(refId)
    } else if (references.length < maxRefs) {
      // Use the stored imageUrl directly - it's already a full URL or relative URL
      // that will be handled correctly by App.tsx's Thumb component
      // (same logic as HighriseSearch and HistoryGrid)
      const imageUrl = favorite.item_data.imageUrl
      
      onAddReference({
        id: refId,
        url: imageUrl,
        name: favorite.item_data.name,
        type: favorite.type === 'item' ? 'highrise' : 'generation',
      })
    }
  }
  
  const isSelected = (favorite: Favorite) => {
    return references.some(r => r.id === `fav-${favorite.id}`)
  }
  
  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }
  
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) return
    
    // Check if dragging over a folder
    const overId = over.id as string
    if (overId.startsWith('folder-')) {
      // Highlight folder - handled by isOver in the folder component
    }
  }
  
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    
    if (!over) return
    
    const activeId = active.id as string
    const overId = over.id as string
    
    // Check if dropping onto a folder
    if (overId.startsWith('folder-') && !activeId.startsWith('folder-')) {
      const folderId = overId.replace('folder-', '')
      const favorite = favorites.find(f => f.id === activeId)
      
      if (favorite && favorite.folder_id !== folderId) {
        // Move to folder
        try {
          await fetch(`${API_URL}/api/favorites/${activeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ folderId }),
          })
          
          setFavorites(prev => prev.map(f => 
            f.id === activeId ? { ...f, folder_id: folderId } : f
          ))
        } catch (e) {
          console.error('[Favorites] Error moving to folder:', e)
        }
      }
      return
    }
    
    // Reorder items or folders
    if (activeId !== overId) {
      const isDraggingFolder = activeId.startsWith('folder-')
      const isOverFolder = overId.startsWith('folder-')
      
      if (isDraggingFolder && isOverFolder) {
        // Reorder folders among themselves
        const oldIndex = folders.findIndex(f => `folder-${f.id}` === activeId)
        const newIndex = folders.findIndex(f => `folder-${f.id}` === overId)
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const newFolders = arrayMove(folders, oldIndex, newIndex)
          setFolders(newFolders)
          
          // Update sort order on server
          const updates = newFolders.map((f, i) => ({ id: f.id, sortOrder: i }))
          fetch(`${API_URL}/api/favorites/folders/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ folders: updates }),
          }).catch(console.error)
        }
      } else if (!isDraggingFolder && !isOverFolder) {
        // Reorder items among themselves
        // IMPORTANT: Use same filtering as display to get correct indices
        const itemsToReorder = expandedFolder
          ? favorites.filter(f => f.folder_id === expandedFolder && !failedImages.has(f.id))
          : favorites.filter(f => !f.folder_id && !failedImages.has(f.id))
        
        const oldIndex = itemsToReorder.findIndex(f => f.id === activeId)
        const newIndex = itemsToReorder.findIndex(f => f.id === overId)
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(itemsToReorder, oldIndex, newIndex)
          
          // Update local state - merge reordered items with others
          const otherItems = favorites.filter(f => {
            // Keep items that are NOT in the group we're reordering
            if (expandedFolder) {
              return f.folder_id !== expandedFolder || failedImages.has(f.id)
            } else {
              return f.folder_id !== null || failedImages.has(f.id)
            }
          })
          setFavorites([...otherItems, ...newItems])
          
          // Update sort order on server
          const updates = newItems.map((f, i) => ({ 
            id: f.id, 
            sortOrder: i, 
            folderId: f.folder_id 
          }))
          fetch(`${API_URL}/api/favorites/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ items: updates }),
          }).catch(console.error)
        }
      }
      // If dragging item over folder (or vice versa), do nothing here
      // The "drop into folder" is handled above
    }
  }
  
  // Handle external drop (images dragged from outside)
  const handleExternalDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string
        
        try {
          const res = await fetch(`${API_URL}/api/favorites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              type: 'image',
              itemData: {
                imageUrl: dataUrl,
                name: file.name,
              },
            }),
          })
          
          if (!res.ok) throw new Error('Failed to add favorite')
          
          const data = await res.json()
          setFavorites(prev => [...prev, data.favorite])
        } catch (err) {
          console.error('[Favorites] Error adding dropped image:', err)
        }
      }
      reader.readAsDataURL(file)
    }
  }
  
  // Get items to display - filter out failed images
  const rootItems = useMemo(() => 
    favorites.filter(f => !f.folder_id && !failedImages.has(f.id)),
    [favorites, failedImages]
  )
  const folderItems = useMemo(() => 
    expandedFolder 
      ? favorites.filter(f => f.folder_id === expandedFolder && !failedImages.has(f.id))
      : [],
    [favorites, expandedFolder, failedImages]
  )
  
  // Not authenticated - same as history-empty
  if (!authenticated) {
    return (
      <div className="history-empty">
        <LogIn className="w-5 h-5" />
        <span>Sign in to save favorites</span>
        {onLogin && (
          <button onClick={onLogin} className="btn btn-dark">
            Sign in with Google
          </button>
        )}
      </div>
    )
  }
  
  // Loading - same as highrise-loading
  if (loading) {
    return (
      <div className="highrise-loading">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Loading favorites...</span>
      </div>
    )
  }
  
  // Error - same pattern as history
  if (error) {
    return (
      <div className="history-empty">
        <span>{error}</span>
        <button onClick={() => fetchFavorites()} className="btn btn-dark">
          Retry
        </button>
      </div>
    )
  }
  
  const activeFavorite = activeId ? favorites.find(f => f.id === activeId) : null
  const activeFolder = activeId?.startsWith('folder-') 
    ? folders.find(f => `folder-${f.id}` === activeId) 
    : null

  return (
    <div 
      className="highrise-search"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleExternalDrop}
    >
      {/* Folder view header */}
      {expandedFolder && (
        <div className="favorites-folder-header">
          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => setExpandedFolder(null)}
          >
            ← Back
          </button>
          <span className="favorites-folder-name">
            {folders.find(f => f.id === expandedFolder)?.name}
          </span>
        </div>
      )}
      
      {/* Results wrapper - same as highrise-results */}
      <div className="highrise-results">
      
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={expandedFolder 
            ? folderItems.map(f => f.id)
            : [...folders.map(f => `folder-${f.id}`), ...rootItems.map(f => f.id)]
          }
          strategy={rectSortingStrategy}
        >
          {/* Use highrise-grid class - same as Items tab! */}
          <div className="highrise-grid">
            {/* Show folders only in root view */}
            {!expandedFolder && folders.map(folder => (
              <FavoriteFolder
                key={folder.id}
                folder={folder}
                items={favorites.filter(f => f.folder_id === folder.id && !failedImages.has(f.id))}
                onOpen={() => setExpandedFolder(folder.id)}
                onDelete={() => handleDeleteFolder(folder.id)}
                onRename={(name) => handleRenameFolder(folder.id, name)}
              />
            ))}
            
            {/* Show items - FavoriteItem now uses highrise-item/history-item classes */}
            {(expandedFolder ? folderItems : rootItems).map(favorite => (
              <FavoriteItem
                key={favorite.id}
                favorite={favorite}
                selected={isSelected(favorite)}
                disabled={disabled || (!isSelected(favorite) && references.length >= maxRefs)}
                onClick={() => handleItemClick(favorite)}
                onDelete={() => handleDeleteFavorite(favorite.id)}
                onExpand={() => setLightbox(favorite)}
                onImageFailed={handleImageFailed}
              />
            ))}
            
            {/* Create folder button (root view only) */}
            {!expandedFolder && (
              <div className="favorites-add-folder">
                {creatingFolder ? (
                  <div className="folder-create-form">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Folder name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateFolder()
                        if (e.key === 'Escape') setCreatingFolder(false)
                      }}
                    />
                    <button onClick={handleCreateFolder} className="btn btn-dark btn-sm">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button 
                    className="btn btn-ghost favorites-create-folder"
                    onClick={() => setCreatingFolder(true)}
                  >
                    <FolderPlus className="w-4 h-4" />
                    New Folder
                  </button>
                )}
              </div>
            )}
          </div>
        </SortableContext>
        
        {/* Drag overlay - shows preview of dragged item or folder */}
        <DragOverlay>
          {activeFavorite && (
            <div className="highrise-item dragging">
              <img src={activeFavorite.item_data.imageUrl} alt="" />
            </div>
          )}
          {activeFolder && (
            <div className="favorite-folder dragging">
              <div className="folder-preview">
                {favorites
                  .filter(f => f.folder_id === activeFolder.id)
                  .slice(0, 4)
                  .map((item) => (
                    <div key={item.id} className="folder-preview-item">
                      <img src={item.item_data.imageUrl} alt="" />
                    </div>
                  ))}
                {[...Array(Math.max(0, 4 - favorites.filter(f => f.folder_id === activeFolder.id).length))].map((_, i) => (
                  <div key={`empty-${i}`} className="folder-preview-item empty" />
                ))}
              </div>
              <div className="folder-name-row">
                <span className="folder-name">{activeFolder.name}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      </div>{/* Close highrise-results */}
      
      {/* Empty state - same pattern as highrise-empty */}
      {favorites.length === 0 && folders.length === 0 && (
        <div className="highrise-empty">
          <span>No favorites yet</span>
          <span style={{ fontSize: '12px', opacity: 0.7 }}>Star items or works to add them here</span>
        </div>
      )}
      
      {/* Lightbox - same pattern as HistoryGrid */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
          >
            <motion.div
              className="lightbox-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                className="lightbox-close"
                onClick={() => setLightbox(null)}
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="lightbox-image-container">
                {!lightboxImageLoaded && (
                  <div className="lightbox-image-loading">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}
                <motion.img
                  src={lightbox.item_data.imageUrl}
                  alt={lightbox.item_data.name || ''}
                  onLoad={() => setLightboxImageLoaded(true)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: lightboxImageLoaded ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="lightbox-footer">
                {lightbox.item_data.name && (
                  <p className="lightbox-prompt">{lightbox.item_data.name}</p>
                )}
                <div className="lightbox-actions">
                  <button
                    className="lightbox-btn"
                    onClick={async () => {
                      try {
                        const res = await fetch(lightbox.item_data.imageUrl)
                        const blob = await res.blob()
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        const safeName = lightbox.item_data.name?.slice(0, 30).replace(/[^a-z0-9]/gi, '-') || 'favorite'
                        a.download = `${safeName}.png`
                        document.body.appendChild(a)
                        a.click()
                        document.body.removeChild(a)
                        URL.revokeObjectURL(url)
                      } catch (e) {
                        console.error('Download failed:', e)
                      }
                    }}
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
