import { motion } from 'framer-motion'
import { Sparkles, Loader2 } from 'lucide-react'

interface GenerateButtonProps {
  onClick: () => void
  isLoading: boolean
  disabled: boolean
}

export default function GenerateButton({ onClick, isLoading, disabled }: GenerateButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || isLoading}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={`
        relative group px-8 py-3 rounded-xl font-medium text-sm
        transition-all duration-300 overflow-hidden
        ${disabled || isLoading
          ? 'bg-forge-muted text-forge-text-muted cursor-not-allowed'
          : 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40'
        }
      `}
    >
      {/* Animated background gradient */}
      {!disabled && !isLoading && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-violet-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          initial={false}
        />
      )}
      
      {/* Shimmer effect when loading */}
      {isLoading && (
        <motion.div
          className="absolute inset-0 shimmer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      
      <span className="relative flex items-center gap-2">
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Generating...</span>
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>Generate</span>
          </>
        )}
      </span>
    </motion.button>
  )
}
