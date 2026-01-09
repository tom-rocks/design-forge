import { motion } from 'framer-motion'
import { Hammer } from 'lucide-react'

type Mode = 'create' | 'edit'

interface GenerateButtonProps {
  onClick: (mode: Mode) => void
  isLoading: boolean
  disabled: boolean
  editDisabled?: boolean
  loadingMode?: Mode | null
}

// Actual Chisel icon - blade tool for carving
const ChiselIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Handle */}
    <path d="M19 3l2 2-1 1-2-2 1-1z" />
    <path d="M17 5l-3 3" />
    {/* Shaft */}
    <line x1="14" y1="8" x2="8" y2="14" />
    {/* Blade - wide flat end */}
    <path d="M8 14l-4 4-1 3 3-1 4-4" />
    <path d="M3 21l2-2" />
  </svg>
)

export default function GenerateButton({ 
  onClick, 
  isLoading, 
  disabled, 
  editDisabled = true,
  loadingMode = null
}: GenerateButtonProps) {
  const forgeDisabled = disabled || isLoading
  const editButtonDisabled = disabled || isLoading || editDisabled

  return (
    <div className="te-panel p-3 sm:w-[280px]">
      {/* Module label */}
      <div className="te-module-header border-b-0 px-0 pb-2">
        <span>EXECUTE</span>
        <div className="flex-1" />
        <div className={`w-2 h-2 led ${isLoading ? 'led-amber led-pulse' : forgeDisabled ? 'led-off' : 'led-green led-pulse'}`} />
      </div>
      
      {/* Button row */}
      <div className="flex gap-2">
        {/* FORGE Button - Fuchsia */}
        <motion.button
          onClick={() => onClick('create')}
          disabled={forgeDisabled}
          whileTap={!forgeDisabled ? { y: 3 } : undefined}
          className={`
            relative flex-1 h-[72px] rounded-lg font-mono text-sm font-bold uppercase tracking-wider
            transition-all duration-100 overflow-hidden
            ${forgeDisabled
              ? 'bg-te-panel-dark text-te-cream-dim cursor-not-allowed'
              : 'text-white cursor-pointer'
            }
          `}
          style={!forgeDisabled ? {
            background: 'linear-gradient(180deg, #e879f9 0%, #d946ef 50%, #a21caf 100%)',
            boxShadow: '0 4px 0 #86198f, 0 6px 16px rgba(217, 70, 239, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
          } : {
            boxShadow: '0 4px 0 #1a1a1a, 0 6px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Surface texture lines */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 4px)',
          }} />
          
          {/* Glow pulse when ready */}
          {!forgeDisabled && (
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
          {isLoading && loadingMode === 'create' && (
            <motion.div
              className="absolute left-0 right-0 h-1 bg-white/50"
              initial={{ top: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '100%', '0%'],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          )}
          
          {/* Button content */}
          <div className="relative flex flex-col items-center justify-center gap-1 h-full">
            {isLoading && loadingMode === 'create' ? (
              <>
                <div className="relative w-6 h-6">
                  <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full te-spinner" />
                </div>
                <span className="text-xs">FORGING</span>
              </>
            ) : (
              <>
                <Hammer className="w-6 h-6" strokeWidth={2.5} />
                <span>FORGE</span>
              </>
            )}
          </div>
          
          {/* Bottom edge highlight */}
          {!forgeDisabled && (
            <div className="absolute bottom-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          )}
        </motion.button>

        {/* REFINE Button - Cyan/Teal */}
        <motion.button
          onClick={() => onClick('edit')}
          disabled={editButtonDisabled}
          whileTap={!editButtonDisabled ? { y: 3 } : undefined}
          className={`
            relative flex-1 h-[72px] rounded-lg font-mono text-sm font-bold uppercase tracking-wider
            transition-all duration-100 overflow-hidden
            ${editButtonDisabled
              ? 'bg-te-panel-dark text-te-cream-dim cursor-not-allowed'
              : 'text-white cursor-pointer'
            }
          `}
          style={!editButtonDisabled ? {
            background: 'linear-gradient(180deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%)',
            boxShadow: '0 4px 0 #0e7490, 0 6px 16px rgba(6, 182, 212, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
          } : {
            boxShadow: '0 4px 0 #1a1a1a, 0 6px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* Surface texture lines */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.1) 3px, rgba(0,0,0,0.1) 4px)',
          }} />
          
          {/* Glow pulse when ready */}
          {!editButtonDisabled && (
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
          {isLoading && loadingMode === 'edit' && (
            <motion.div
              className="absolute left-0 right-0 h-1 bg-white/50"
              initial={{ top: 0, opacity: 0 }}
              animate={{ 
                top: ['0%', '100%', '0%'],
                opacity: [0.5, 0.8, 0.5]
              }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          )}
          
          {/* Button content */}
          <div className="relative flex flex-col items-center justify-center gap-1 h-full">
            {isLoading && loadingMode === 'edit' ? (
              <>
                <div className="relative w-6 h-6">
                  <div className="absolute inset-0 border-2 border-white border-t-transparent rounded-full te-spinner" />
                </div>
                <span className="text-xs">REFINING</span>
              </>
            ) : (
              <>
                <ChiselIcon className="w-6 h-6" />
                <span>REFINE</span>
              </>
            )}
          </div>
          
          {/* Bottom edge highlight */}
          {!editButtonDisabled && (
            <div className="absolute bottom-0 left-2 right-2 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          )}
        </motion.button>
      </div>
      
      {/* Hint when edit is disabled */}
      {editDisabled && !isLoading && (
        <p className="font-mono text-[9px] text-te-cream-dim text-center mt-2 uppercase">
          Upload an image above to enable refining
        </p>
      )}
    </div>
  )
}
