import { motion, AnimatePresence } from 'framer-motion'

interface ForgeGutterProps {
  isForging: boolean
  heatLevel: number // 0-1, same as crucible/output
}

// Shared color scheme - must match ReferenceDropZone and ImageDisplay
const getHeatColor = (level: number) => {
  if (level < 0.2) return { border: '#3a3a3a', glow: 'transparent' }
  if (level < 0.4) return { border: '#8b4513', glow: 'rgba(139, 69, 19, 0.4)' }
  if (level < 0.6) return { border: '#d2691e', glow: 'rgba(210, 105, 30, 0.5)' }
  if (level < 0.8) return { border: '#ff6b35', glow: 'rgba(255, 107, 53, 0.6)' }
  return { border: '#ff4500', glow: 'rgba(255, 69, 0, 0.7)' }
}

export default function ForgeGutter({ isForging, heatLevel }: ForgeGutterProps) {
  const heatColors = getHeatColor(heatLevel)
  
  return (
    <div className="relative h-10 flex items-start justify-center">
      {/* The pour line - 4px to match crucible/output borders */}
      <div 
        className="w-1 h-full transition-all duration-300"
        style={{
          backgroundColor: heatColors.border,
          boxShadow: heatLevel > 0.2 
            ? `0 0 ${8 + heatLevel * 12}px ${heatColors.glow}`
            : 'none',
        }}
      />
      
      {/* Flowing molten pulses when forging */}
      <AnimatePresence>
        {isForging && (
          <>
            {/* Primary flow */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-1.5 rounded-full"
              initial={{ top: 0, height: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '80%'],
                height: ['20%', '20%'],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ 
                duration: 0.5, 
                repeat: Infinity,
                ease: 'easeIn',
              }}
              style={{
                background: 'linear-gradient(180deg, #ffdd44 0%, #ff6b35 40%, #ff4500 100%)',
                boxShadow: '0 0 12px #ff6b35, 0 0 24px rgba(255, 107, 53, 0.5)',
              }}
            />
            
            {/* Secondary flow */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-1 rounded-full"
              initial={{ top: 0, height: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '85%'],
                height: ['15%', '15%'],
                opacity: [0, 0.8, 0.8, 0],
              }}
              transition={{ 
                duration: 0.5, 
                repeat: Infinity,
                ease: 'easeIn',
                delay: 0.25,
              }}
              style={{
                background: 'linear-gradient(180deg, #ffa500 0%, #ff6b35 100%)',
                boxShadow: '0 0 8px #ff6b35',
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
