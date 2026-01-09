import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, Image as ImageIcon } from 'lucide-react'

interface EditImageUploadProps {
  image: string | null
  onImageChange: (image: string | null) => void
  disabled?: boolean
}

export default function EditImageUpload({ image, onImageChange, disabled }: EditImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      onImageChange(result)
    }
    reader.readAsDataURL(file)
  }, [onImageChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (disabled) return
    
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [disabled, handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleClick = () => {
    if (!disabled) fileInputRef.current?.click()
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onImageChange(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div className="te-module-header">
        <ImageIcon className="w-3.5 h-3.5 text-te-fuchsia" />
        <span>EDIT_TARGET</span>
        <div className="flex-1" />
        <span className="font-mono text-[9px] text-te-cream-dim">
          {image ? 'IMAGE LOADED' : 'DROP OR CLICK'}
        </span>
        <div className={`w-2 h-2 led ${image ? 'led-green' : 'led-off'}`} />
      </div>

      <motion.div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative te-panel overflow-hidden cursor-pointer transition-all duration-200
          ${isDragging ? 'border-te-fuchsia bg-te-fuchsia/10' : ''}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-te-fuchsia/50'}
          ${image ? 'p-0' : 'p-6'}
        `}
        whileHover={disabled ? {} : { scale: 1.005 }}
        whileTap={disabled ? {} : { scale: 0.995 }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          className="hidden"
          disabled={disabled}
        />

        <AnimatePresence mode="wait">
          {image ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <img
                src={image}
                alt="Image to edit"
                className="w-full h-auto max-h-[300px] object-contain"
              />
              
              {/* Clear button */}
              <motion.button
                onClick={handleClear}
                className="absolute top-2 right-2 p-2 rounded-lg bg-te-bg/90 border border-te-border hover:border-te-fuchsia hover:bg-te-fuchsia/20 transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                disabled={disabled}
              >
                <X className="w-4 h-4 text-te-cream" />
              </motion.button>

              {/* Label overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-te-bg/90 to-transparent">
                <span className="font-mono text-[10px] text-te-fuchsia uppercase tracking-wider">
                  ▶ IMAGE TO EDIT
                </span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <motion.div
                animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <Upload className={`w-10 h-10 mb-3 ${isDragging ? 'text-te-fuchsia' : 'text-te-cream-dim'}`} />
              </motion.div>
              
              <p className="font-mono text-sm text-te-cream mb-1">
                {isDragging ? 'DROP IMAGE HERE' : 'UPLOAD IMAGE TO EDIT'}
              </p>
              <p className="font-mono text-[10px] text-te-cream-dim">
                DRAG & DROP OR CLICK TO BROWSE
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drag overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 border-2 border-dashed border-te-fuchsia bg-te-fuchsia/10 rounded-lg pointer-events-none"
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
