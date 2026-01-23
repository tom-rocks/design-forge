import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Favorite } from './Favorites'

interface FavoriteItemProps {
  favorite: Favorite
  selected: boolean
  disabled: boolean
  onClick: () => void
  onDelete: () => void
  onImageFailed?: (id: string) => void
}

export function FavoriteItem({
  favorite,
  selected,
  disabled,
  onClick,
  onDelete,
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
  
  // Hide failed images - with correct URL storage, failures should be rare
  if (imageFailed) {
    return null
  }
  
  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // Use highrise-item class for items, history-item class for works - reuse existing styles!
      className={`${favorite.type === 'item' ? 'highrise-item' : 'history-item'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      title={favorite.item_data.name || 'Favorite'}
    >
      <img 
        src={favorite.item_data.imageUrl} 
        alt={favorite.item_data.name || ''} 
        loading="lazy"
        className={imageLoaded ? 'loaded' : ''}
        onLoad={handleImageLoad}
        onError={handleImageError}
      />
      
      {/* Delete button - top right, shows on hover like pin/star */}
      <button
        className="item-delete"
        onClick={handleDelete}
        title="Remove from favorites"
      >
        <X className="w-3 h-3" />
      </button>
      
      {/* Selected checkmark - same as highrise-item-check */}
      {selected && (
        <div className="highrise-item-check">
          <span>✓</span>
        </div>
      )}
    </motion.div>
  )
}
