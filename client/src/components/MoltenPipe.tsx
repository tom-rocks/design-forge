import { motion } from 'framer-motion'

interface MoltenPipeProps {
  /** Fill progress from 0 to 1 */
  fill: number
  className?: string
}

/**
 * CSS-based pipe that matches the crucible frame aesthetic
 * Uses the same gradient and shadows as the frame
 */
export function MoltenPipe({ 
  fill, 
  className = '' 
}: MoltenPipeProps) {
  return (
    <div className={`molten-pipe ${className}`}>
      <motion.div
        className={`molten-pipe-fill ${fill > 0 ? 'active' : ''}`}
        initial={{ height: 0, opacity: 0 }}
        animate={{ 
          height: `${fill * 100}%`,
          opacity: fill > 0 ? 1 : 0
        }}
        transition={{
          height: { duration: 1.5, ease: "easeOut" },
          opacity: { duration: fill > 0 ? 0.3 : 1.2 }
        }}
      />
    </div>
  )
}
