import { motion, AnimatePresence } from 'framer-motion'

interface ForgeGutterProps {
  isForging: boolean
  progress: number // 0-100
}

export default function ForgeGutter({ isForging, progress }: ForgeGutterProps) {
  const heatLevel = progress / 100
  
  return (
    <div className="relative py-2">
      {/* Stone/metal gutter channel */}
      <div 
        className="relative mx-auto w-20 h-16 overflow-visible"
        style={{
          perspective: '200px',
        }}
      >
        {/* Channel walls - carved look */}
        <div 
          className="absolute inset-x-0 top-0 bottom-0"
          style={{
            background: 'linear-gradient(90deg, #2a2a2a 0%, #1a1a1a 30%, #1a1a1a 70%, #2a2a2a 100%)',
            borderLeft: '4px solid #3a3a3a',
            borderRight: '4px solid #3a3a3a',
            boxShadow: `
              inset 4px 0 8px rgba(0,0,0,0.8),
              inset -4px 0 8px rgba(0,0,0,0.8),
              inset 0 4px 8px rgba(0,0,0,0.6)
            `,
          }}
        />
        
        {/* Inner channel depth */}
        <div 
          className="absolute inset-x-2 top-1 bottom-1"
          style={{
            background: 'linear-gradient(180deg, #0a0a0a 0%, #151515 50%, #0a0a0a 100%)',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.9)',
          }}
        />

        {/* Molten flow when forging */}
        <AnimatePresence>
          {isForging && (
            <>
              {/* Main molten stream */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 w-10"
                initial={{ height: 0, top: 0 }}
                animate={{ height: '100%', top: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  background: `linear-gradient(180deg, 
                    #ff6b35 0%, 
                    #ff4500 20%, 
                    #ff8c00 50%,
                    #ffa500 80%,
                    #ff6b35 100%
                  )`,
                  boxShadow: `
                    0 0 20px rgba(255, 107, 53, 0.8),
                    0 0 40px rgba(255, 69, 0, 0.5),
                    inset 0 0 10px rgba(255, 200, 0, 0.3)
                  `,
                  filter: 'blur(1px)',
                  borderRadius: '4px',
                }}
              />
              
              {/* Bright core */}
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 w-4"
                initial={{ height: 0, top: 0 }}
                animate={{ height: '100%', top: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
                style={{
                  background: 'linear-gradient(180deg, #ffcc00 0%, #ff9500 50%, #ffcc00 100%)',
                  boxShadow: '0 0 15px rgba(255, 200, 0, 0.9)',
                  borderRadius: '2px',
                }}
              />
              
              {/* Flowing shimmer */}
              <motion.div
                className="absolute inset-x-4 top-0 bottom-0"
                animate={{
                  backgroundPosition: ['0% 0%', '0% 200%'],
                }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                style={{
                  background: `linear-gradient(180deg, 
                    transparent 0%,
                    rgba(255, 255, 200, 0.4) 20%,
                    transparent 40%,
                    rgba(255, 255, 200, 0.3) 60%,
                    transparent 80%
                  )`,
                  backgroundSize: '100% 50%',
                }}
              />

              {/* Sparks flying off */}
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 rounded-full"
                  initial={{ 
                    x: '50%',
                    y: `${20 + Math.random() * 60}%`,
                    opacity: 0,
                  }}
                  animate={{
                    x: [`50%`, `${Math.random() > 0.5 ? 150 : -50}%`],
                    y: [`${20 + Math.random() * 60}%`, `${Math.random() * 100}%`],
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 0.6 + Math.random() * 0.4,
                    repeat: Infinity,
                    delay: Math.random() * 0.5,
                    ease: 'easeOut',
                  }}
                  style={{
                    background: `hsl(${30 + Math.random() * 20}, 100%, ${60 + Math.random() * 30}%)`,
                    boxShadow: '0 0 4px #ff6b35',
                  }}
                />
              ))}

              {/* Ambient glow */}
              <motion.div
                className="absolute inset-x-[-50%] top-0 bottom-0 pointer-events-none"
                animate={{
                  opacity: [0.4, 0.7, 0.4],
                }}
                transition={{ duration: 0.3, repeat: Infinity }}
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(255, 107, 53, 0.5) 0%, transparent 70%)',
                }}
              />
            </>
          )}
        </AnimatePresence>

        {/* Heat residue when not forging but was recently */}
        {!isForging && heatLevel > 0 && (
          <motion.div
            className="absolute inset-x-4 top-0 bottom-0"
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2 }}
            style={{
              background: `linear-gradient(180deg, 
                rgba(255, 107, 53, ${heatLevel * 0.3}) 0%, 
                rgba(255, 69, 0, ${heatLevel * 0.2}) 50%,
                rgba(255, 107, 53, ${heatLevel * 0.3}) 100%
              )`,
              boxShadow: `0 0 ${heatLevel * 20}px rgba(255, 107, 53, ${heatLevel * 0.5})`,
            }}
          />
        )}
      </div>

      {/* Drips falling from gutter */}
      <AnimatePresence>
        {isForging && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-20 h-8 overflow-visible">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-3 h-4 rounded-full"
                initial={{ y: -4, opacity: 0, x: `${40 + i * 10}%` }}
                animate={{
                  y: [0, 32],
                  opacity: [0, 1, 1, 0],
                  scaleY: [1, 1.5, 1],
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: 'easeIn',
                }}
                style={{
                  background: 'linear-gradient(180deg, #ff6b35 0%, #ff4500 50%, #ff8c00 100%)',
                  boxShadow: '0 0 10px #ff6b35, 0 4px 8px rgba(255, 69, 0, 0.5)',
                  left: `${30 + i * 15}%`,
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
