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
import { Loader2, Plus, FolderPlus, LogIn, Check } from 'lucide-react'
import { Lightbox } from './Lightbox'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'
import { FavoriteItem } from './FavoriteItem'
import { FavoriteFolder } from './FavoriteFolder'
// Clothing categories that support crisp=1 for higher quality (same as HighriseSearch)
const CLOTHING_CATEGORIES = [
  'shirt', 'pants', 'shorts', 'skirt', 'dress', 'jacket', 'fullsuit',
  'hat', 'shoes', 'glasses', 'bag', 'handbag', 'necklace', 'earrings',
  'gloves', 'watch', 'sock'
]

// Check if string looks like MongoDB ObjectId (24 hex characters)
const isMongoId = (str: string) => /^[a-f0-9]{24}$/i.test(str)

// Get display URL for Highrise items based on dispId
// Uses the EXACT same logic as HighriseSearch Items gallery
function getItemDisplayUrl(dispId: string): string {
  if (dispId.startsWith('bg-')) {
    return `https://cdn.highrisegame.com/background/${dispId}/full`
  } else if (dispId.startsWith('cn-')) {
    return `https://cdn.highrisegame.com/container/${dispId}/full`
  } else {
    // Avatar items - use server proxy (same as Items gallery)
    return `${API_URL}/api/highrise/proxy/${dispId}.png?v=3`
  }
}

// Get crisp (high quality) URL for attaching as reference
// Only clothing items support crisp - others return regular URL
function getItemCrispUrl(dispId: string, category?: string): string {
  if (dispId.startsWith('bg-')) {
    return `https://cdn.highrisegame.com/background/${dispId}/full`
  } else if (dispId.startsWith('cn-')) {
    return `https://cdn.highrisegame.com/container/${dispId}/full`
  } else if (category && CLOTHING_CATEGORIES.includes(category)) {
    // Clothing items - use crisp version for higher quality
    return `${API_URL}/api/highrise/proxy/${dispId}.png?crisp=1`
  } else {
    // Non-clothing avatar items - regular proxy
    return `${API_URL}/api/highrise/proxy/${dispId}.png?v=3`
  }
}

// Resolve display URL (thumbnail for grid) from favorite data
// Uses IDs when available for reliable URLs, falls back to stored URLs
// IMPORTANT: Skip itemId if it looks like MongoDB ObjectId (legacy broken data)
export function getFavoriteThumbnailUrl(favorite: Favorite): string {
  if (favorite.type === 'work' && favorite.item_data.generationId) {
    // Works: use thumbnail endpoint for faster loading
    return `${API_URL}/api/generations/${favorite.item_data.generationId}/thumbnail`
  }
  const itemId = favorite.item_data.itemId
  if (favorite.type === 'item' && itemId && !isMongoId(itemId)) {
    // Items: construct URL from dispId (more reliable than stored URLs)
    return getItemDisplayUrl(itemId)
  }
  // Fallback: use stored thumbnailUrl or imageUrl (for legacy/broken favorites)
  return favorite.item_data.thumbnailUrl || favorite.item_data.imageUrl
}

// Resolve full image URL from favorite data (for lightbox, download)
// IMPORTANT: Skip itemId if it looks like MongoDB ObjectId (legacy broken data)
export function getFavoriteFullUrl(favorite: Favorite): string {
  if (favorite.type === 'work' && favorite.item_data.generationId) {
    // Works: use full image endpoint
    return `${API_URL}/api/generations/${favorite.item_data.generationId}/image/0`
  }
  const itemId = favorite.item_data.itemId
  if (favorite.type === 'item' && itemId && !isMongoId(itemId)) {
    // Items: construct URL from dispId
    return getItemDisplayUrl(itemId)
  }
  // Fallback: use stored imageUrl (for legacy/broken favorites)
  return favorite.item_data.imageUrl
}

// Resolve crisp (high quality) URL for attaching as reference
// Uses crisp version for clothing items, regular for others
// IMPORTANT: Skip itemId if it looks like MongoDB ObjectId (legacy broken data)
export function getFavoriteReferenceUrl(favorite: Favorite): string {
  if (favorite.type === 'work' && favorite.item_data.generationId) {
    // Works: use full image endpoint
    return `${API_URL}/api/generations/${favorite.item_data.generationId}/image/0`
  }
  const itemId = favorite.item_data.itemId
  if (favorite.type === 'item' && itemId && !isMongoId(itemId)) {
    // Items: use crisp URL for clothing, regular for others
    return getItemCrispUrl(itemId, favorite.item_data.category)
  }
  // Fallback: use stored imageUrl (for legacy/broken favorites)
  return favorite.item_data.imageUrl
}

export interface Favorite {
  id: string
  type: 'item' | 'work' | 'image'
  item_data: {
    imageUrl: string
    thumbnailUrl?: string  // For works - smaller image for grid display
    name?: string
    category?: string
    rarity?: string
    prompt?: string
    generationId?: string
    itemId?: string  // For items - the dispId
  }
  folder_ids: string[]  // Array of folder IDs (can be in multiple folders)
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
  // Reset key - when changed, resets to root view
  resetKey?: number
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
  resetKey,
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
  const [addingToFolder, setAddingToFolder] = useState(false)
  const [selectedForFolder, setSelectedForFolder] = useState<Set<string>>(new Set())
  
  
  // Reset to root view when resetKey changes (tab clicked while already active)
  useEffect(() => {
    if (resetKey !== undefined) {
      setExpandedFolder(null)
      setAddingToFolder(false)
      setSelectedForFolder(new Set())
    }
  }, [resetKey])
  
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
      // Items in the folder will have the folder removed from their folder_ids
      setFavorites(prev => prev.map(f => 
        f.folder_ids.includes(folderId) 
          ? { ...f, folder_ids: f.folder_ids.filter(id => id !== folderId) } 
          : f
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
  
  // Remove favorite from current folder
  const handleRemoveFromFolder = async (favoriteId: string) => {
    if (!expandedFolder) return
    
    try {
      await fetch(`${API_URL}/api/favorites/${favoriteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ removeFromFolder: expandedFolder }),
      })
      
      setFavorites(prev => prev.map(f => 
        f.id === favoriteId 
          ? { ...f, folder_ids: f.folder_ids.filter(id => id !== expandedFolder) } 
          : f
      ))
    } catch (e) {
      console.error('[Favorites] Error removing from folder:', e)
    }
  }
  
  // Add favorites to current folder (same favorite can be in multiple folders)
  const handleAddToFolder = async () => {
    if (!expandedFolder || selectedForFolder.size === 0) return
    
    try {
      // Add folder to each selected favorite
      await Promise.all(
        Array.from(selectedForFolder).map(favoriteId =>
          fetch(`${API_URL}/api/favorites/${favoriteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ addToFolder: expandedFolder }),
          })
        )
      )
      
      // Update local state - add folder to each selected favorite's folder_ids
      setFavorites(prev => prev.map(f => 
        selectedForFolder.has(f.id) 
          ? { ...f, folder_ids: [...f.folder_ids, expandedFolder] }
          : f
      ))
      
      // Reset selection mode
      setAddingToFolder(false)
      setSelectedForFolder(new Set())
    } catch (e) {
      console.error('[Favorites] Error adding to folder:', e)
    }
  }
  
  // Toggle item selection for adding to folder
  const toggleFolderSelection = (favoriteId: string) => {
    setSelectedForFolder(prev => {
      const next = new Set(prev)
      if (next.has(favoriteId)) {
        next.delete(favoriteId)
      } else {
        next.add(favoriteId)
      }
      return next
    })
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
      // Use crisp URL for clothing items when attaching as reference
      const imageUrl = getFavoriteReferenceUrl(favorite)
      
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
      
      if (favorite && !favorite.folder_ids.includes(folderId)) {
        // Add to folder
        try {
          await fetch(`${API_URL}/api/favorites/${activeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ addToFolder: folderId }),
          })
          
          setFavorites(prev => prev.map(f => 
            f.id === activeId ? { ...f, folder_ids: [...f.folder_ids, folderId] } : f
          ))
        } catch (e) {
          console.error('[Favorites] Error adding to folder:', e)
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
          ? favorites.filter(f => f.folder_ids.includes(expandedFolder) && !failedImages.has(f.id))
          : favorites.filter(f => f.folder_ids.length === 0 && !failedImages.has(f.id))
        
        const oldIndex = itemsToReorder.findIndex(f => f.id === activeId)
        const newIndex = itemsToReorder.findIndex(f => f.id === overId)
        
        if (oldIndex !== -1 && newIndex !== -1) {
          const newItems = arrayMove(itemsToReorder, oldIndex, newIndex)
          
          // Update local state - merge reordered items with others
          const otherItems = favorites.filter(f => {
            // Keep items that are NOT in the group we're reordering
            if (expandedFolder) {
              return !f.folder_ids.includes(expandedFolder) || failedImages.has(f.id)
            } else {
              return f.folder_ids.length > 0 || failedImages.has(f.id)
            }
          })
          setFavorites([...otherItems, ...newItems])
          
          // Update sort order on server
          const updates = newItems.map((f, i) => ({ 
            id: f.id, 
            sortOrder: i
          }))
          // Reorder (sort_order only, folder membership is separate)
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
  // Root items are those NOT in any folder
  const rootItems = useMemo(() => 
    favorites.filter(f => f.folder_ids.length === 0 && !failedImages.has(f.id)),
    [favorites, failedImages]
  )
  // Folder items are those that include the expanded folder ID
  const folderItems = useMemo(() => 
    expandedFolder 
      ? favorites.filter(f => f.folder_ids.includes(expandedFolder) && !failedImages.has(f.id))
      : [],
    [favorites, expandedFolder, failedImages]
  )
  // Items available to add to current folder (items not already in this folder)
  const availableForFolder = useMemo(() => {
    if (!expandedFolder) return []
    
    // Return items not already in this folder
    return favorites.filter(f => {
      if (failedImages.has(f.id)) return false
      return !f.folder_ids.includes(expandedFolder)
    })
  }, [favorites, expandedFolder, failedImages])
  
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
            className="specs-btn"
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
                items={favorites.filter(f => f.folder_ids.includes(folder.id) && !failedImages.has(f.id))}
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
                onMoveToRoot={expandedFolder ? () => handleRemoveFromFolder(favorite.id) : undefined}
                onImageFailed={handleImageFailed}
              />
            ))}
            
            {/* Add to folder button (folder view only) - grey square with + */}
            {expandedFolder && (
              <button 
                className="folder-add-item"
                onClick={() => setAddingToFolder(true)}
                title="Add items to this folder"
              >
                <Plus className="w-6 h-6" />
              </button>
            )}
            
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
              <img src={getFavoriteThumbnailUrl(activeFavorite)} alt="" />
            </div>
          )}
          {activeFolder && (
            <div className="favorite-folder dragging">
              <div className="folder-preview">
                {favorites
                  .filter(f => f.folder_ids.includes(activeFolder.id))
                  .slice(0, 4)
                  .map((item) => (
                    <div key={item.id} className="folder-preview-item">
                      <img src={getFavoriteThumbnailUrl(item)} alt="" />
                    </div>
                  ))}
                {[...Array(Math.max(0, 4 - favorites.filter(f => f.folder_ids.includes(activeFolder.id)).length))].map((_, i) => (
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
      
      {/* Add to folder picker overlay */}
      <AnimatePresence>
        {addingToFolder && (
          <motion.div
            className="folder-picker-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setAddingToFolder(false)
              setSelectedForFolder(new Set())
            }}
          >
            <motion.div
              className="folder-picker"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="folder-picker-header">
                <span>Add to folder ({availableForFolder.length} available)</span>
                <div className="folder-picker-actions">
                  {selectedForFolder.size > 0 && (
                    <button 
                      className="specs-btn folder-picker-add-btn"
                      onClick={handleAddToFolder}
                    >
                      <Check className="w-3 h-3" /><span>Add {selectedForFolder.size}</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="folder-picker-grid">
                {availableForFolder.length === 0 ? (
                  <div className="folder-picker-empty">
                    All items already added to this folder
                  </div>
                ) : (
                  availableForFolder.map(favorite => (
                    <div
                      key={favorite.id}
                      className={`folder-picker-item ${selectedForFolder.has(favorite.id) ? 'selected' : ''}`}
                      onClick={() => toggleFolderSelection(favorite.id)}
                    >
                      <img src={getFavoriteThumbnailUrl(favorite)} alt="" />
                      {selectedForFolder.has(favorite.id) && (
                        <div className="folder-picker-check">
                          <Check className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Lightbox */}
      <Lightbox
        data={lightbox ? {
          imageUrl: getFavoriteFullUrl(lightbox),
          name: lightbox.item_data.name,
          prompt: lightbox.item_data.prompt,
        } : null}
        onClose={() => setLightbox(null)}
        onDownload={async (url) => {
          try {
            const res = await fetch(url)
            const blob = await res.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            const safeName = lightbox?.item_data.name?.slice(0, 30).replace(/[^a-z0-9]/gi, '-') || 'favorite'
            a.download = `${safeName}.png`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobUrl)
          } catch (e) {
            console.error('Download failed:', e)
          }
        }}
      />
    </div>
  )
}
