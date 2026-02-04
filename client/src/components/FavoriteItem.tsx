import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { StarOff, Expand, FolderOutput, ImageOff } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Favorite } from './Favorites'
import { getFavoriteThumbnailUrl } from './Favorites'

interface FavoriteItemProps {
  favorite: Favorite
  selected: boolean
  disabled: boolean
  onClick: () => void
  onDelete: () => void
  onExpand: () => void
  onMoveToRoot?: () => void  // Only passed when inside a folder
  onImageFailed?: (id: string) => void
}

export function FavoriteItem({
  favorite,
  selected,
  disabled,
  onClick,
  onDelete,
  onExpand,
  onMoveToRoot,
  onImageFailed,
}: FavoriteItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: favorite.id })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }
  
  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    onExpand()
  }
  
  const handleMoveToRoot = (e: React.MouseEvent) => {
    e.stopPropagation()
    onMoveToRoot?.()
  }
  
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    // Check for 1x1 placeholder images (server returns these when image unavailable)
    const is1x1 = img.naturalWidth <= 1 && img.naturalHeight <= 1
    if (is1x1) {
      setImageFailed(true)
      onImageFailed?.(favorite.id)
    } else {
      setImageLoaded(true)
    }
  }
  
  const handleImageError = () => {
    setImageFailed(true)
    onImageFailed?.(favorite.id)
  }
  
  // Show placeholder for failed images so user can delete them
  
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // Use highrise-item class for items, history-item class for works - reuse existing styles!
      className={`${favorite.type === 'item' ? 'highrise-item' : 'history-item'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      title={favorite.item_data.name || 'Favorite'}
    >
      {imageFailed ? (
        <div className="favorite-failed">
          <ImageOff className="w-5 h-5" />
        </div>
      ) : (
        <img 
          src={getFavoriteThumbnailUrl(favorite)} 
          alt={favorite.item_data.name || ''} 
          loading="lazy"
          className={imageLoaded ? 'loaded' : ''}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}
      
      {/* Expand button - top left, shows on hover */}
      <button
        className="item-expand"
        onClick={handleExpand}
        title="View full size"
      >
        <Expand className="w-3 h-3" />
      </button>
      
      {/* Unfavorite button - top right, shows on hover */}
      <button
        className="item-unfavorite"
        onClick={handleDelete}
        title="Remove from favorites"
      >
        <StarOff className="w-3 h-3" />
      </button>
      
      {/* Move to root button - only shown when inside a folder */}
      {onMoveToRoot && (
        <button
          className="item-move-out"
          onClick={handleMoveToRoot}
          title="Move out of folder"
        >
          <FolderOutput className="w-3 h-3" />
        </button>
      )}
      
      {/* Selected checkmark - same as highrise-item-check */}
      {selected && (
        <div className="highrise-item-check">
          <span>✓</span>
        </div>
      )}
    </motion.div>
  )
}
