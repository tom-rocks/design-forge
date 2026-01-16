import { useEffect, useRef, useState } from 'react'

interface LCDFireProps {
  active: boolean
  columns?: number
  rows?: number
}

// Color palette - smooth gradient from cold to hot
const FIRE_PALETTE = [
  '#2a2928', // 0 - off (LCD background)
  '#2a2928', '#2d2826', '#302924', '#352a22', // barely warm
  '#3d2820', '#45281e', '#4d281c', '#55281a', // ember glow starting
  '#5e2918', '#672a16', '#702b14', '#7a2c12', // deep ember
  '#842d10', '#8e2e0e', '#993010', '#a43212', // warming up
  '#b03414', '#bc3616', '#c83818', '#d43a1a', // getting hot
  '#e03c1c', '#e64a19', '#ec5816', '#f26613', // accent zone
  '#f87410', '#ff820d', '#ff8a0a', '#ff9207', // bright orange
  '#ff9a04', '#ffa201', '#ffaa00', '#ffb200', // very hot
  '#ffba00', '#ffc200', '#ffca00', '#ffd200', // white-hot
]

export function LCDFire({ active, columns = 64, rows = 3 }: LCDFireProps) {
  const [grid, setGrid] = useState<number[][]>(() => 
    Array(rows).fill(null).map(() => Array(columns).fill(0))
  )
  const frameRef = useRef<number>()
  const timeRef = useRef(0)
  const targetGridRef = useRef<number[][]>(
    Array(rows).fill(null).map(() => Array(columns).fill(0))
  )
  
  useEffect(() => {
    if (!active) {
      // Smooth cool down
      const coolDown = () => {
        setGrid(prev => {
          const allCold = prev.every(row => row.every(v => v < 1))
          if (allCold) return prev.map(row => row.map(() => 0))
          return prev.map(row => row.map(v => Math.max(0, v * 0.85)))
        })
      }
      const interval = setInterval(coolDown, 30)
      return () => clearInterval(interval)
    }
    
    const simulate = (timestamp: number) => {
      const time = timestamp / 1000
      timeRef.current = time
      
      // Generate target values using layered waves (audio visualizer style)
      const target = targetGridRef.current
      
      for (let x = 0; x < columns; x++) {
        const xNorm = x / columns
        
        // Layer multiple sine waves at different frequencies for organic feel
        const wave1 = Math.sin(time * 2.5 + xNorm * 8) * 0.5 + 0.5
        const wave2 = Math.sin(time * 4.1 + xNorm * 12 + 1.2) * 0.3 + 0.5
        const wave3 = Math.sin(time * 6.3 + xNorm * 6 - 0.8) * 0.2 + 0.5
        const wave4 = Math.sin(time * 1.7 + xNorm * 3) * 0.4 + 0.5 // slow rolling wave
        
        // Combine waves
        const combined = (wave1 + wave2 + wave3 + wave4) / 4
        
        // Add some high-frequency shimmer
        const shimmer = Math.sin(time * 15 + x * 0.5) * 0.1 + 0.9
        
        // Base intensity with variation
        const baseIntensity = combined * shimmer
        
        // Bottom row is hottest
        target[rows - 1][x] = baseIntensity * 36
        
        // Middle rows fade up with wave influence
        for (let y = rows - 2; y >= 0; y--) {
          const heightFade = (rows - 1 - y) / rows
          const flicker = Math.sin(time * 8 + x * 0.3 + y * 2) * 0.15 + 0.85
          // Heat rises less to top rows, creating flame tips
          const below = target[y + 1][x]
          target[y][x] = below * (0.4 - heightFade * 0.2) * flicker
        }
      }
      
      // Smooth interpolation toward target (creates fluid motion)
      setGrid(prev => {
        return prev.map((row, y) => 
          row.map((val, x) => {
            const targetVal = target[y][x]
            // Lerp toward target for smooth movement
            return val + (targetVal - val) * 0.15
          })
        )
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
          {Array(rows).fill(null).map((_, row) => {
            const value = grid[row]?.[col] || 0
            const colorIndex = Math.min(Math.floor(value), 36)
            const glowIntensity = value > 18 ? (value - 18) / 18 : 0
            
            return (
              <div 
                key={row}
                className="lcd-pixel"
                style={{ 
                  backgroundColor: FIRE_PALETTE[colorIndex],
                  boxShadow: glowIntensity > 0.2
                    ? `0 0 ${Math.floor(glowIntensity * 4)}px ${FIRE_PALETTE[colorIndex]}`
                    : 'none',
                  transition: 'background-color 0.05s ease-out'
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
