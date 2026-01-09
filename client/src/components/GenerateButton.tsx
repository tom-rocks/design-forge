import { motion } from 'framer-motion'
import { Zap } from 'lucide-react'

interface GenerateButtonProps {
  onClick: () => void
  isLoading: boolean
  disabled: boolean
}

export default function GenerateButton({ onClick, isLoading, disabled }: GenerateButtonProps) {
  const isInactive = disabled || isLoading

  return (
    <div className="te-panel p-3 h-full flex flex-col">
      {/* Module label */}
      <div className="te-module-header border-b-0 px-0 pb-2">
        <span>EXECUTE</span>
        <div className="flex-1" />
        <div className={`w-2 h-2 led ${isLoading ? 'led-amber led-pulse' : isInactive ? 'led-off' : 'led-green led-pulse'}`} />
      </div>
      
      {/* Big tactile button */}
      <motion.button
        onClick={onClick}
        disabled={isInactive}
        whileTap={!isInactive ? { y: 4 } : undefined}
        className={`
          relative flex-1 min-h-[80px] w-full min-w-[160px] rounded-xl font-mono text-base font-bold uppercase tracking-widest
          transition-all duration-100 overflow-hidden
          ${isInactive
            ? 'bg-te-panel-dark text-te-cream-dim cursor-not-allowed'
            : 'text-white cursor-pointer'
          }
        `}
        style={!isInactive ? {
          background: 'linear-gradient(180deg, #e879f9 0%, #d946ef 50%, #a21caf 100%)',
          boxShadow: '0 6px 0 #86198f, 0 8px 20px rgba(217, 70, 239, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
        } : {
          boxShadow: '0 6px 0 #1a1a1a, 0 8px 16px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* Surface texture lines */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 4px)',
        }} />
        
        {/* Glow pulse when ready */}
        {!isInactive && (
          <motion.div
            className="absolute inset-0 rounded-xl"
            animate={{ 
              boxShadow: [
                'inset 0 0 20px rgba(255,255,255,0.1)',
                'inset 0 0 40px rgba(255,255,255,0.2)',
                'inset 0 0 20px rgba(255,255,255,0.1)',
              ]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        
        {/* Loading state - scanning line */}
        {isLoading && (
          <motion.div
            className="absolute left-0 right-0 h-1 bg-te-fuchsia"
            initial={{ top: 0, opacity: 0 }}
            animate={{ 
              top: ['0%', '100%', '0%'],
              opacity: [0.5, 0.8, 0.5]
            }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          />
        )}
        
        {/* Button content */}
        <div className="relative flex flex-col items-center justify-center gap-2 p-4">
          {isLoading ? (
            <>
              {/* Pulsing rings */}
              <div className="relative w-8 h-8">
                <motion.div
                  className="absolute inset-0 border-2 border-te-cream/30 rounded-full"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <motion.div
                  className="absolute inset-0 border-2 border-te-cream/30 rounded-full"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
                />
                <div className="absolute inset-2 border-2 border-te-cream border-t-transparent rounded-full te-spinner" />
              </div>
              <span className="text-sm">FORGING...</span>
            </>
          ) : (
            <>
              <Zap className="w-7 h-7" strokeWidth={2.5} />
              <span>FORGE</span>
            </>
          )}
        </div>
        
        {/* Bottom edge highlight */}
        {!isInactive && (
          <div className="absolute bottom-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        )}
      </motion.button>
    </div>
  )
}
