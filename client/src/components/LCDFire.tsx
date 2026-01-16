import { useEffect, useRef, useState } from 'react'

interface LCDFireProps {
  active: boolean
  columns?: number
  rows?: number
}

// Classic fire palette - from black to white-hot
const FIRE_COLORS = [
  '#2a2928', // 0 - off/cold
  '#3d1f10', // 1 - barely warm
  '#5c2510', // 2 - ember
  '#7a2d0a', // 3 - deep red
  '#993505', // 4 - red-orange
  '#b84000', // 5 - orange
  '#d94a00', // 6 - bright orange
  '#e64a19', // 7 - accent orange
  '#f55d00', // 8 - hot orange
  '#ff7200', // 9 - yellow-orange
  '#ff8800', // 10 - yellow
  '#ffa030', // 11 - bright yellow
  '#ffb850', // 12 - white-yellow
]

export function LCDFire({ active, columns = 48, rows = 3 }: LCDFireProps) {
  const [grid, setGrid] = useState<number[][]>(() => 
    Array(rows).fill(null).map(() => Array(columns).fill(0))
  )
  const frameRef = useRef<number>()
  
  useEffect(() => {
    if (!active) {
      // Cool down
      const coolDown = () => {
        setGrid(prev => {
          const allCold = prev.every(row => row.every(v => v === 0))
          if (allCold) return prev
          return prev.map(row => row.map(v => Math.max(0, v - 1)))
        })
      }
      const interval = setInterval(coolDown, 50)
      return () => clearInterval(interval)
    }
    
    const simulate = () => {
      setGrid(prev => {
        const next = prev.map(row => [...row])
        
        // Bottom row: generate heat sources (fire seeds)
        for (let x = 0; x < columns; x++) {
          // Random intense flames
          if (Math.random() < 0.4) {
            next[rows - 1][x] = Math.floor(Math.random() * 5) + 8 // Hot: 8-12
          } else if (Math.random() < 0.6) {
            next[rows - 1][x] = Math.floor(Math.random() * 4) + 4 // Medium: 4-7
          } else {
            next[rows - 1][x] = Math.floor(Math.random() * 4) // Cool: 0-3
          }
        }
        
        // Propagate fire upward (from top to bottom-1, reading from below)
        for (let y = 0; y < rows - 1; y++) {
          for (let x = 0; x < columns; x++) {
            // Sample from below with slight horizontal spread
            const below = next[y + 1][x]
            const belowLeft = next[y + 1][Math.max(0, x - 1)]
            const belowRight = next[y + 1][Math.min(columns - 1, x + 1)]
            
            // Average with random decay (fire loses heat as it rises)
            const avg = (below * 2 + belowLeft + belowRight) / 4
            const decay = Math.random() < 0.7 ? 1 : 2 // Usually decay by 1, sometimes 2
            const wind = Math.random() < 0.1 ? (Math.random() < 0.5 ? -1 : 1) : 0
            
            next[y][x] = Math.max(0, Math.round(avg) - decay + wind)
          }
        }
        
        return next
      })
      
      frameRef.current = requestAnimationFrame(simulate)
    }
    
    frameRef.current = requestAnimationFrame(simulate)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [active, columns, rows])
  
  return (
    <div className="lcd-grid-fire">
      {grid[0].map((_, colIdx) => (
        <div key={colIdx} className="lcd-column">
          {grid.map((row, rowIdx) => {
            const value = row[colIdx]
            const color = FIRE_COLORS[Math.min(value, FIRE_COLORS.length - 1)]
            
            return (
              <div 
                key={rowIdx}
                className="lcd-pixel"
                style={{ 
                  backgroundColor: color,
                  boxShadow: value >= 8 ? `0 0 3px ${color}` : 'none',
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
