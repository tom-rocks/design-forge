import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Wand2 } from 'lucide-react'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
}

export default function PromptInput({ value, onChange, onSubmit, disabled }: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative group">
      {/* Glow effect */}
      <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative bg-forge-surface border border-forge-border rounded-2xl overflow-hidden transition-colors duration-300 group-hover:border-forge-muted">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 border-b border-forge-border/50">
          <Wand2 className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-medium text-forge-text-muted uppercase tracking-wider">
            Prompt
          </span>
        </div>
        
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Describe the image you want to create..."
          className="w-full px-4 py-4 bg-transparent text-forge-text placeholder-forge-text-muted/50 resize-none focus:outline-none font-mono text-sm leading-relaxed min-h-[100px] disabled:opacity-50"
          rows={3}
        />
        
        <div className="flex items-center justify-between px-4 pb-3 text-xs text-forge-text-muted">
          <span>{value.length} characters</span>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: value.length > 0 ? 1 : 0 }}
            className="flex items-center gap-1"
          >
            <kbd className="px-1.5 py-0.5 bg-forge-muted rounded text-[10px]">⌘</kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 bg-forge-muted rounded text-[10px]">↵</kbd>
            <span className="ml-1">to generate</span>
          </motion.span>
        </div>
      </div>
    </div>
  )
}
