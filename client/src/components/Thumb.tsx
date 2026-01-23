import { ReactNode, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ThumbProps {
  src: string
  alt?: string
  onRemove?: () => void
}

interface ThumbAddProps {
  onClick?: () => void
  children?: ReactNode
}

export function Thumb({ src, alt = '', onRemove }: ThumbProps) {
  const [showRemove, setShowRemove] = useState(false)
  
  const handleClick = () => {
    if (showRemove && onRemove) {
      onRemove()
    } else {
      setShowRemove(true)
    }
  }
  
  const handleMouseLeave = () => {
    setShowRemove(false)
  }
  
  return (
    <motion.div 
      className={`thumb ${showRemove ? 'removing' : ''}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      onClick={onRemove ? handleClick : undefined}
      onMouseLeave={handleMouseLeave}
    >
      <img src={src} alt={alt} />
      <AnimatePresence>
        {showRemove && onRemove && (
          <motion.div 
            className="thumb-remove-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <X className="w-6 h-6" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function ThumbAdd({ onClick, children }: ThumbAddProps) {
  return (
    <motion.button 
      className="thumb thumb-add"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {children || (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </motion.button>
  )
}
