import { useEffect, useRef, useState, useMemo } from 'react'

interface LCDFireGridProps {
  active: boolean
  cols?: number
  rows?: number
  dotSize?: number
  gap?: number
  className?: string
}

// Fire color palette
const FIRE_COLORS = [
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
  '#ff8800', // 10
  '#ffa030', // 11
  '#ffb850', // 12
]

export function LCDFireGrid({ 
  active, 
  cols = 14, 
  rows = 3, 
  dotSize = 4,
  gap = 1,
  className = '' 
}: LCDFireGridProps) {
  const [grid, setGrid] = useState<number[]>(() => new Array(cols * rows).fill(0))
  const frameRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  
  useEffect(() => {
    // Slower frame rate for smoother feel
    const frameInterval = 1000 / 10
    
    const simulate = (timestamp: number) => {
      if (timestamp - lastFrameRef.current < frameInterval) {
        frameRef.current = requestAnimationFrame(simulate)
        return
      }
      lastFrameRef.current = timestamp
      
      setGrid(prev => {
        const next = [...prev]
        
        if (active) {
          // Bottom row: gentler heat generation, blend with existing
          for (let x = 0; x < cols; x++) {
            const idx = (rows - 1) * cols + x
            const current = prev[idx]
            let target: number
            
            // Less frequent changes, more stable base
            if (Math.random() < 0.25) {
              target = Math.floor(Math.random() * 3) + 10 // hot spots
            } else if (Math.random() < 0.4) {
              target = Math.floor(Math.random() * 3) + 7 // warm
            } else {
              target = Math.floor(Math.random() * 3) + 4 // ember
            }
            
            // Blend toward target instead of jumping
            next[idx] = Math.round(current * 0.6 + target * 0.4)
          }
          
          // Propagate upward with smoother blending
          for (let y = 0; y < rows - 1; y++) {
            for (let x = 0; x < cols; x++) {
              const idx = y * cols + x
              const current = prev[idx]
              const below = next[(y + 1) * cols + x]
              const belowLeft = next[(y + 1) * cols + Math.max(0, x - 1)]
              const belowRight = next[(y + 1) * cols + Math.min(cols - 1, x + 1)]
              
              // Weighted average favoring center
              const avg = (below * 3 + belowLeft + belowRight) / 5
              const decay = 1 + (y * 0.5) // More decay higher up
              const target = Math.max(0, avg - decay)
              
              // Smooth transition
              next[idx] = Math.round(current * 0.5 + target * 0.5)
            }
          }
        } else {
          // Gradual cool down
          for (let i = 0; i < next.length; i++) {
            if (next[i] > 0) {
              next[i] = Math.max(0, next[i] - 1)
            }
          }
        }
        
        return next
      })
      
      frameRef.current = requestAnimationFrame(simulate)
    }
    
    frameRef.current = requestAnimationFrame(simulate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [active, cols, rows])
  
  const gridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, ${dotSize}px)`,
    gap: `${gap}px`,
    background: '#1a1918',
    padding: `${gap}px`,
    minWidth: cols * (dotSize + gap) + gap, // Minimum based on original sizing
  }), [cols, rows, dotSize, gap])
  
  return (
    <div className={`lcd-fire-grid ${className}`} style={gridStyle}>
      {grid.map((value, i) => (
        <div
          key={i}
          style={{
            width: '100%',
            height: dotSize,
            borderRadius: 1,
            backgroundColor: FIRE_COLORS[Math.min(value, FIRE_COLORS.length - 1)],
            boxShadow: value >= 8 ? `0 0 ${dotSize}px ${FIRE_COLORS[value]}` : undefined,
            transition: 'background-color 120ms ease, box-shadow 120ms ease',
          }}
        />
      ))}
    </div>
  )
}
