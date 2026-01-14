import { ReactNode } from 'react'
import { motion } from 'framer-motion'

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
  return (
    <motion.div 
      className="thumb"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
    >
      <img src={src} alt={alt} />
      {onRemove && (
        <button className="thumb-remove" onClick={onRemove}>
          ×
        </button>
      )}
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
