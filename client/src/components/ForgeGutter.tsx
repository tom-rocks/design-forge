import { motion, AnimatePresence } from 'framer-motion'

interface ForgeGutterProps {
  isForging: boolean
  progress: number // 0-100
}

export default function ForgeGutter({ isForging, progress }: ForgeGutterProps) {
  const heatLevel = progress / 100
  
  return (
    <div className="relative h-16 flex items-center justify-center">
      {/* Simple vertical line */}
      <div 
        className="w-0.5 h-full rounded-full transition-all duration-300"
        style={{
          backgroundColor: isForging ? '#ff6b35' : '#333',
          boxShadow: isForging 
            ? `0 0 ${10 + heatLevel * 20}px rgba(255, 107, 53, ${0.5 + heatLevel * 0.5}), 0 0 ${5 + heatLevel * 10}px rgba(255, 69, 0, 0.8)`
            : 'none',
        }}
      />
      
      {/* Flowing molten animation when forging */}
      <AnimatePresence>
        {isForging && (
          <>
            {/* Main flow pulse */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-1 rounded-full"
              initial={{ top: 0, height: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '100%'],
                height: ['20%', '20%'],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ 
                duration: 0.8, 
                repeat: Infinity,
                ease: 'easeIn',
              }}
              style={{
                background: 'linear-gradient(180deg, #ffcc00 0%, #ff6b35 50%, #ff4500 100%)',
                boxShadow: '0 0 12px #ff6b35, 0 0 24px rgba(255, 107, 53, 0.5)',
              }}
            />
            
            {/* Secondary flow pulse - offset */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-1 rounded-full"
              initial={{ top: 0, height: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '100%'],
                height: ['15%', '15%'],
                opacity: [0, 0.8, 0.8, 0],
              }}
              transition={{ 
                duration: 0.8, 
                repeat: Infinity,
                ease: 'easeIn',
                delay: 0.4,
              }}
              style={{
                background: 'linear-gradient(180deg, #ffa500 0%, #ff6b35 100%)',
                boxShadow: '0 0 8px #ff6b35',
              }}
            />

            {/* Ambient glow */}
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 w-8 h-full pointer-events-none"
              animate={{
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{ duration: 0.5, repeat: Infinity }}
              style={{
                background: 'radial-gradient(ellipse at center, rgba(255, 107, 53, 0.3) 0%, transparent 70%)',
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Residual glow when not forging but has heat */}
      {!isForging && heatLevel > 0 && (
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-0.5 h-full rounded-full"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2 }}
          style={{
            background: `linear-gradient(180deg, rgba(255, 107, 53, ${heatLevel * 0.5}) 0%, rgba(255, 69, 0, ${heatLevel * 0.3}) 100%)`,
            boxShadow: `0 0 ${heatLevel * 10}px rgba(255, 107, 53, ${heatLevel * 0.4})`,
          }}
        />
      )}
    </div>
  )
}
