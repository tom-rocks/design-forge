import { motion, AnimatePresence } from 'framer-motion'

interface ForgeGutterProps {
  isForging: boolean
  heatLevel: number
}

export default function ForgeGutter({ isForging, heatLevel }: ForgeGutterProps) {
  const color = heatLevel > 0.2 ? `rgba(255, 107, 53, ${0.3 + heatLevel * 0.7})` : '#444'
  
  return (
    <div className="flex justify-center py-2">
      <div 
        className="w-px h-8 transition-all duration-300"
        style={{
          backgroundColor: color,
          boxShadow: isForging ? `0 0 8px ${color}` : 'none',
        }}
      >
        {/* Flowing pulse when forging */}
        <AnimatePresence>
          {isForging && (
            <motion.div
              className="w-0.5 -ml-px rounded-full"
              initial={{ top: 0, height: 0, opacity: 0 }}
              animate={{ 
                height: ['30%', '30%'],
                y: ['0%', '250%'],
                opacity: [0, 1, 0],
              }}
              transition={{ duration: 0.4, repeat: Infinity, ease: 'easeIn' }}
              style={{
                background: 'linear-gradient(180deg, #ffcc00, #ff6b35)',
                boxShadow: '0 0 6px #ff6b35',
                position: 'relative',
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
