import { useEffect, useRef, useState } from 'react'

interface LCDFireProps {
  active: boolean
  columns?: number
  rows?: number
}

// Color palette matching theme - dark → deep red → accent orange → bright
const FIRE_PALETTE = [
  '#2a2928', // 0 - off (LCD background)
  '#2a2928', '#2a2928', '#2a2928', '#2a2928', // very cold
  '#3d2018', '#4a2515', '#5c2a12', '#6b3010', // warming - dark browns
  '#7a350d', '#8b3a0a', '#9c4008', '#ad4506', // deep ember
  '#bf4a04', '#c84f03', '#d15402', '#da5901', // getting hot
  '#e35e00', '#e64a19', '#ea5015', '#ee5611', // accent zone (e64a19 = deep orange)
  '#f25c0d', '#f66109', '#fa6705', '#ff6d00', // bright orange
  '#ff7300', '#ff7900', '#ff7f00', '#ff8500', // hot orange
  '#ff8b00', '#ff9100', '#ff9700', '#ff9d00', // very hot
  '#ffa300', '#ffab40', '#ffb060', '#ffb880', // white-hot glow
]

export function LCDFire({ active, columns = 56, rows = 3 }: LCDFireProps) {
  const [grid, setGrid] = useState<number[][]>(() => 
    Array(rows).fill(null).map(() => Array(columns).fill(0))
  )
  const frameRef = useRef<number>()
  
  useEffect(() => {
    if (!active) {
      // Cool down gradually
      const coolDown = () => {
        setGrid(prev => {
          const allCold = prev.every(row => row.every(v => v === 0))
          if (allCold) return prev
          return prev.map(row => row.map(v => Math.max(0, v - 2)))
        })
      }
      const interval = setInterval(coolDown, 50)
      return () => clearInterval(interval)
    }
    
    let lastTime = 0
    const frameDelay = 80 // ~12fps for that LED look
    
    const simulate = (time: number) => {
      if (time - lastTime < frameDelay) {
        frameRef.current = requestAnimationFrame(simulate)
        return
      }
      lastTime = time
      
      setGrid(prev => {
        const next = prev.map(row => [...row])
        
        // Bottom row: sporadic heat bursts (not constant)
        for (let x = 0; x < columns; x++) {
          if (Math.random() > 0.6) {
            // Occasional hot spot
            next[rows - 1][x] = Math.floor(Math.random() * 15) + 20
          } else if (Math.random() > 0.4) {
            // Medium warmth
            next[rows - 1][x] = Math.floor(Math.random() * 10) + 8
          } else {
            // Some spots stay cooler
            next[rows - 1][x] = Math.max(0, next[rows - 1][x] - 3)
          }
        }
        
        // Propagate heat upward with heavy decay (so top row isn't always lit)
        for (let y = 0; y < rows - 1; y++) {
          for (let x = 0; x < columns; x++) {
            const below = next[y + 1][x]
            const belowLeft = next[y + 1][Math.max(0, x - 1)]
            const belowRight = next[y + 1][Math.min(columns - 1, x + 1)]
            
            // Heavy decay so flames rarely reach top
            const avg = (below * 2 + belowLeft + belowRight) / 4
            const decay = 8 + Math.random() * 6 // aggressive decay
            const wind = (Math.random() - 0.5) * 3
            
            next[y][x] = Math.max(0, Math.floor(avg - decay + wind))
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
      {Array(columns).fill(null).map((_, col) => (
        <div key={col} className="lcd-column">
          {Array(rows).fill(null).map((_, row) => (
            <div 
              key={row}
              className="lcd-pixel"
              style={{ 
                backgroundColor: FIRE_PALETTE[Math.min(grid[row]?.[col] || 0, 36)],
                boxShadow: (grid[row]?.[col] || 0) > 15 
                  ? `0 0 ${Math.floor((grid[row]?.[col] || 0) / 6)}px ${FIRE_PALETTE[Math.min(grid[row]?.[col] || 0, 36)]}`
                  : 'none'
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
