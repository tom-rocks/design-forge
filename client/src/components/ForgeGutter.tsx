import { motion, AnimatePresence } from 'framer-motion'

interface ForgeGutterProps {
  isForging: boolean
  progress: number // 0-100
}

export default function ForgeGutter({ isForging, progress }: ForgeGutterProps) {
  const heatLevel = Math.min(progress / 100, 1)
  
  // Base color when not forging
  const baseColor = heatLevel > 0.1 ? `rgba(255, 107, 53, ${0.3 + heatLevel * 0.4})` : '#333'
  
  return (
    <div className="relative h-12 flex items-start justify-center pt-0">
      {/* The pour line - simple and elegant */}
      <div 
        className="w-0.5 h-full rounded-full transition-all duration-500"
        style={{
          backgroundColor: isForging ? '#ff6b35' : baseColor,
          boxShadow: isForging 
            ? `0 0 ${8 + heatLevel * 15}px rgba(255, 107, 53, ${0.6 + heatLevel * 0.4}), 0 0 ${4 + heatLevel * 8}px rgba(255, 69, 0, 0.9)`
            : heatLevel > 0.1 
              ? `0 0 ${heatLevel * 10}px rgba(255, 107, 53, ${heatLevel * 0.5})`
              : 'none',
        }}
      />
      
      {/* Flowing molten pulses when forging */}
      <AnimatePresence>
        {isForging && (
          <>
            {/* Primary flow */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-1 rounded-full"
              initial={{ top: 0, height: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '85%'],
                height: ['15%', '15%'],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ 
                duration: 0.6, 
                repeat: Infinity,
                ease: 'easeIn',
              }}
              style={{
                background: 'linear-gradient(180deg, #ffdd44 0%, #ff6b35 40%, #ff4500 100%)',
                boxShadow: '0 0 10px #ff6b35, 0 0 20px rgba(255, 107, 53, 0.6)',
              }}
            />
            
            {/* Secondary flow - offset timing */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-0.5 rounded-full"
              initial={{ top: 0, height: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '90%'],
                height: ['10%', '10%'],
                opacity: [0, 0.7, 0.7, 0],
              }}
              transition={{ 
                duration: 0.6, 
                repeat: Infinity,
                ease: 'easeIn',
                delay: 0.3,
              }}
              style={{
                background: 'linear-gradient(180deg, #ffa500 0%, #ff6b35 100%)',
                boxShadow: '0 0 6px #ff6b35',
              }}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
