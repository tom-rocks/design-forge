import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2, Edit2, Check, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Favorite, Folder } from './Favorites'
import { getFavoriteThumbnailUrl } from './Favorites'

interface FavoriteFolderProps {
  folder: Folder
  items: Favorite[]
  onOpen: () => void
  onDelete: () => void
  onRename: (name: string) => void
}

export function FavoriteFolder({
  folder,
  items,
  onOpen,
  onDelete,
  onRename,
}: FavoriteFolderProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(folder.name)
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: `folder-${folder.id}` })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  
  // Get first 4 items for preview
  const previewItems = items.slice(0, 4)
  const remainingCount = items.length - 4
  
  const handleRename = () => {
    if (editName.trim() && editName !== folder.name) {
      onRename(editName.trim())
    }
    setIsEditing(false)
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setEditName(folder.name)
      setIsEditing(false)
    }
  }
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete folder "${folder.name}"? Items inside will be moved to root.`)) {
      onDelete()
    }
  }
  
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
  }
  
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`favorite-folder ${isOver ? 'drop-target' : ''}`}
      onClick={onOpen}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      {/* iPhone-style 2x2 preview grid */}
      <div className="folder-preview">
        {previewItems.map((item) => (
          <div key={item.id} className="folder-preview-item">
            <img src={getFavoriteThumbnailUrl(item)} alt="" />
          </div>
        ))}
        
        {/* Empty slots */}
        {[...Array(Math.max(0, 4 - previewItems.length))].map((_, i) => (
          <div key={`empty-${i}`} className="folder-preview-item empty" />
        ))}
        
        {/* More items indicator */}
        {remainingCount > 0 && (
          <div className="folder-more-badge">
            +{remainingCount}
          </div>
        )}
      </div>
      
      {/* Folder name */}
      <div className="folder-name-row">
        {isEditing ? (
          <div className="folder-name-edit" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            <button onClick={handleRename} className="folder-edit-btn">
              <Check className="w-3 h-3" />
            </button>
            <button onClick={() => { setEditName(folder.name); setIsEditing(false) }} className="folder-edit-btn">
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            <span className="folder-name">{folder.name}</span>
            <span className="folder-count">({items.length})</span>
          </>
        )}
      </div>
      
      {/* Action buttons */}
      <div className="folder-actions">
        <button onClick={handleEdit} className="folder-action-btn" title="Rename">
          <Edit2 className="w-3 h-3" />
        </button>
        <button onClick={handleDelete} className="folder-action-btn" title="Delete folder">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  )
}
