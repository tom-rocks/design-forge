import { useEffect, useRef, useState, useMemo } from 'react'

interface LCDRippleGridProps {
  active: boolean
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

// Ripple colors - subtle glow that passes through
const RIPPLE_COLORS_FORGE = [
  '#2a2928', // 0 - off/base
  '#352a25', // 1 
  '#453028', // 2 
  '#55382a', // 3 
  '#65402c', // 4 
  '#75482e', // 5 - peak approaching
  '#8a5535', // 6 
  '#a0653f', // 7 - peak
  '#8a5535', // 8 
  '#75482e', // 9 
  '#65402c', // 10
  '#55382a', // 11
  '#453028', // 12
  '#352a25', // 13
  '#2a2928', // 14 - back to off
]

const RIPPLE_COLORS_REFINE = [
  '#2a2928', // 0 - off/base
  '#2d2c25', // 1 
  '#353320', // 2 
  '#3d3a1a', // 3 
  '#454115', // 4 
  '#504a12', // 5 - peak approaching
  '#605510', // 6 
  '#70620e', // 7 - peak
  '#605510', // 8 
  '#504a12', // 9 
  '#454115', // 10
  '#3d3a1a', // 11
  '#353320', // 12
  '#2d2c25', // 13
  '#2a2928', // 14 - back to off
]

export function LCDRippleGrid({ 
  active, 
  cols = 14, 
  rows = 3, 
  dotSize = 4,
  gap = 1,
  className = '',
  direction = 'right',
  mode = 'forge'
}: LCDRippleGridProps) {
  const RIPPLE_COLORS = mode === 'refine' ? RIPPLE_COLORS_REFINE : RIPPLE_COLORS_FORGE
  const WAVE_WIDTH = RIPPLE_COLORS.length // Width of the wave in columns
  
  const [wavePosition, setWavePosition] = useState(-WAVE_WIDTH) // Start off-screen
  const [isAnimating, setIsAnimating] = useState(false)
  const animationRef = useRef<number>(0)
  const wasActiveRef = useRef(false)
  
  // Trigger ripple when active becomes true
  useEffect(() => {
    if (active && !wasActiveRef.current) {
      setIsAnimating(true)
      const startPos = direction === 'right' ? -WAVE_WIDTH : cols + WAVE_WIDTH
      const endPos = direction === 'right' ? cols + WAVE_WIDTH : -WAVE_WIDTH
      setWavePosition(startPos)
      
      const duration = 800 // ms for wave to cross
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
    wasActiveRef.current = active
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [active, cols, direction, WAVE_WIDTH])
  
  // Calculate color for each cell based on wave position
  const getColorIndex = (x: number): number => {
    if (!isAnimating) return 0
    
    // Distance from wave center
    const distanceFromWave = x - wavePosition
    
    // Map distance to color index (center of wave is peak brightness)
    const halfWidth = WAVE_WIDTH / 2
    const normalizedDist = distanceFromWave + halfWidth
    
    if (normalizedDist < 0 || normalizedDist >= WAVE_WIDTH) {
      return 0 // Outside wave
    }
    
    return Math.floor(normalizedDist)
  }
  
  const gridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${dotSize}px)`,
    gap: `${gap}px`,
    background: '#1a1918',
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
        // Slight vertical variation - dimmer at top
        const verticalFade = 1 - (y * 0.15)
        const adjustedIdx = Math.round(colorIdx * verticalFade)
        result.push(RIPPLE_COLORS[Math.max(0, Math.min(adjustedIdx, RIPPLE_COLORS.length - 1))])
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
            transition: 'background-color 50ms linear',
          }}
        />
      ))}
    </div>
  )
}
