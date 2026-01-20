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
    const frameInterval = 1000 / 30
    
    const simulate = (timestamp: number) => {
      if (timestamp - lastFrameRef.current < frameInterval) {
        frameRef.current = requestAnimationFrame(simulate)
        return
      }
      lastFrameRef.current = timestamp
      
      setGrid(prev => {
        const next = [...prev]
        
        if (active) {
          // Bottom row: generate heat
          for (let x = 0; x < cols; x++) {
            const idx = (rows - 1) * cols + x
            if (Math.random() < 0.4) next[idx] = Math.floor(Math.random() * 5) + 8
            else if (Math.random() < 0.6) next[idx] = Math.floor(Math.random() * 4) + 4
            else next[idx] = Math.floor(Math.random() * 4)
          }
          
          // Propagate upward
          for (let y = 0; y < rows - 1; y++) {
            for (let x = 0; x < cols; x++) {
              const idx = y * cols + x
              const below = next[(y + 1) * cols + x]
              const belowLeft = next[(y + 1) * cols + Math.max(0, x - 1)]
              const belowRight = next[(y + 1) * cols + Math.min(cols - 1, x + 1)]
              const avg = (below * 2 + belowLeft + belowRight) / 4
              const decay = Math.random() < 0.7 ? 1 : 2
              next[idx] = Math.max(0, Math.round(avg) - decay)
            }
          }
        } else {
          // Cool down
          for (let i = 0; i < next.length; i++) {
            if (next[i] > 0) next[i]--
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
    gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${dotSize}px)`,
    gap: `${gap}px`,
    background: '#1a1918',
    padding: `${gap}px`,
  }), [cols, rows, dotSize, gap])
  
  return (
    <div className={`lcd-fire-grid ${className}`} style={gridStyle}>
      {grid.map((value, i) => (
        <div
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: 1,
            backgroundColor: FIRE_COLORS[Math.min(value, FIRE_COLORS.length - 1)],
            boxShadow: value >= 8 ? `0 0 ${dotSize}px ${FIRE_COLORS[value]}` : undefined,
          }}
        />
      ))}
    </div>
  )
}
