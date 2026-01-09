import { useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Terminal } from 'lucide-react'

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
    <div className="te-panel overflow-hidden">
      {/* Module Header */}
      <div className="te-module-header">
        <Terminal className="w-3.5 h-3.5 text-te-fuchsia" />
        <span>INPUT_PROMPT</span>
        <div className="flex-1" />
        <div className={`w-2 h-2 led ${disabled ? 'led-amber' : 'led-green'} led-pulse`} />
      </div>
      
      {/* Input area with terminal styling */}
      <div className="p-4 bg-te-panel-dark">
        <div className="relative">
          {/* Terminal prefix */}
          <div className="absolute left-0 top-0 font-mono text-te-fuchsia text-sm select-none pointer-events-none">
            <span className="opacity-60">&gt;</span>
          </div>
          
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="describe your vision..."
            className="w-full pl-5 bg-transparent text-te-cream placeholder-te-cream-dim resize-none focus:outline-none font-mono text-sm leading-relaxed min-h-[80px] disabled:opacity-50"
            rows={3}
          />
          
          {/* Blinking cursor indicator when empty */}
          {value.length === 0 && !disabled && (
            <motion.span 
              className="absolute left-5 top-0 font-mono text-te-fuchsia text-sm"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "steps(1)" }}
            >
              █
            </motion.span>
          )}
        </div>
      </div>
      
      {/* Footer with data displays */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-te-border bg-te-panel">
        {/* Character count LCD */}
        <div className="te-data-display">
          <span className="text-te-lcd-text-dim">CHR:</span>
          <span className="ml-1">{String(value.length).padStart(4, '0')}</span>
        </div>
        
        {/* Keyboard shortcut */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: value.length > 0 ? 1 : 0 }}
          className="flex items-center gap-1.5"
        >
          <span className="te-keycap">⌘</span>
          <span className="text-te-cream-dim text-xs">+</span>
          <span className="te-keycap">↵</span>
          <span className="font-mono text-[10px] text-te-cream-muted ml-2 uppercase tracking-wider">execute</span>
        </motion.div>
      </div>
    </div>
  )
}
