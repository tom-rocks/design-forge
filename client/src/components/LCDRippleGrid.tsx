import { useEffect, useRef, useState, useMemo } from 'react'

interface LCDRippleGridProps {
  /** Increment this to trigger a new ripple */
  trigger: number
  cols?: number
  rows?: number
  dotSize?: number
  gap?: number
  className?: string
  /** Direction ripple travels: 'left' or 'right' */
  direction?: 'left' | 'right'
  /** Color mode: 'forge' = orange, 'refine' = yellow/gold */
  mode?: 'forge' | 'refine'
}

// Ripple colors - using the same LED palette as fire, arranged as a wave
// Ramp up to peak brightness then back down
const RIPPLE_COLORS_FORGE = [
  '#2a2928', // 0 - off
  '#3d1f10', // 1 
  '#5c2510', // 2 
  '#7a2d0a', // 3 
  '#993505', // 4 
  '#b84000', // 5 
  '#d94a00', // 6 
  '#e64a19', // 7 
  '#f55d00', // 8 
  '#ff7200', // 9 
  '#ff8800', // 10 - peak
  '#ff7200', // 11
  '#f55d00', // 12
  '#e64a19', // 13
  '#d94a00', // 14
  '#b84000', // 15
  '#993505', // 16
  '#7a2d0a', // 17
  '#5c2510', // 18
  '#3d1f10', // 19
  '#2a2928', // 20 - back to off
]

const RIPPLE_COLORS_REFINE = [
  '#2a2928', // 0 - off
  '#3d2f10', // 1 
  '#5c4a10', // 2 
  '#7a6510', // 3 
  '#998005', // 4 
  '#b89500', // 5 
  '#d9a800', // 6 
  '#e6b000', // 7 
  '#f5b800', // 8 
  '#ffc200', // 9 
  '#ffcc00', // 10 - peak
  '#ffc200', // 11
  '#f5b800', // 12
  '#e6b000', // 13
  '#d9a800', // 14
  '#b89500', // 15
  '#998005', // 16
  '#7a6510', // 17
  '#5c4a10', // 18
  '#3d2f10', // 19
  '#2a2928', // 20 - back to off
]

export function LCDRippleGrid({ 
  trigger, 
  cols = 14, 
  rows = 3, 
  dotSize = 4,
  gap = 1,
  className = '',
  direction = 'right',
  mode = 'forge'
}: LCDRippleGridProps) {
  const RIPPLE_COLORS = mode === 'refine' ? RIPPLE_COLORS_REFINE : RIPPLE_COLORS_FORGE
  const WAVE_WIDTH = RIPPLE_COLORS.length
  
  const [wavePosition, setWavePosition] = useState(-WAVE_WIDTH)
  const [isAnimating, setIsAnimating] = useState(false)
  const animationRef = useRef<number>(0)
  const lastTriggerRef = useRef(0)
  
  // Trigger ripple when trigger value changes
  useEffect(() => {
    if (trigger > 0 && trigger !== lastTriggerRef.current) {
      lastTriggerRef.current = trigger
      
      // Cancel any existing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      
      setIsAnimating(true)
      const startPos = direction === 'right' ? -WAVE_WIDTH : cols + WAVE_WIDTH
      const endPos = direction === 'right' ? cols + WAVE_WIDTH : -WAVE_WIDTH
      setWavePosition(startPos)
      
      const duration = 1200 // Slower - 1.2 seconds for wave to cross
      const startTime = Date.now()
      
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(1, elapsed / duration)
        // Smooth ease-in-out
        const eased = progress < 0.5 
          ? 2 * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 2) / 2
        
        const currentPos = startPos + (endPos - startPos) * eased
        setWavePosition(currentPos)
        
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate)
        } else {
          setIsAnimating(false)
        }
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [trigger, cols, direction, WAVE_WIDTH])
  
  // Calculate color for each cell based on wave position
  const getColorIndex = (x: number): number => {
    if (!isAnimating) return 0
    
    const distanceFromWave = x - wavePosition
    const halfWidth = WAVE_WIDTH / 2
    const normalizedDist = distanceFromWave + halfWidth
    
    if (normalizedDist < 0 || normalizedDist >= WAVE_WIDTH) {
      return 0
    }
    
    return Math.floor(normalizedDist)
  }
  
  const gridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${dotSize}px)`,
    gap: `${gap}px`,
    background: 'transparent', // Transparent so fire shows through when not rippling
    padding: `${gap}px`,
    transform: 'translateZ(0)',
    willChange: 'contents',
  }), [cols, rows, dotSize, gap])
  
  // Pre-calculate all cell colors
  const cells = useMemo(() => {
    const result = []
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const colorIdx = getColorIndex(x)
        // Slight vertical variation - brighter in middle row
        const verticalBoost = y === 1 ? 1.1 : 1
        const adjustedIdx = Math.round(colorIdx * verticalBoost)
        const color = RIPPLE_COLORS[Math.max(0, Math.min(adjustedIdx, RIPPLE_COLORS.length - 1))]
        result.push(colorIdx > 0 ? color : 'transparent') // Transparent when not lit
      }
    }
    return result
  }, [wavePosition, isAnimating, cols, rows, RIPPLE_COLORS])
  
  return (
    <div className={`lcd-ripple-grid ${className}`} style={gridStyle}>
      {cells.map((color, i) => (
        <div
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: 1,
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  )
}
