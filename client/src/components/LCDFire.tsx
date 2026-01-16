import { useEffect, useRef, useState } from 'react'

interface LCDFireProps {
  active: boolean
  columns?: number
  rows?: number
}

// Color palette for fire - from bottom (hottest) to top (cooler tips)
const getFireColor = (row: number, maxRows: number, intensity: number) => {
  // Bottom is hottest (white/yellow), top is cooler (red/orange)
  const heightRatio = row / maxRows // 0 at bottom, 1 at top
  
  if (intensity < 0.1) return '#2a2928' // off
  
  // Interpolate colors based on height and intensity
  if (heightRatio < 0.33) {
    // Bottom third - bright orange to yellow
    const t = intensity
    return `rgb(${Math.floor(255)}, ${Math.floor(140 + t * 80)}, ${Math.floor(t * 60)})`
  } else if (heightRatio < 0.66) {
    // Middle third - orange
    const t = intensity
    return `rgb(${Math.floor(255)}, ${Math.floor(80 + t * 60)}, ${Math.floor(t * 20)})`
  } else {
    // Top third - red/deep orange tips
    const t = intensity * 0.8
    return `rgb(${Math.floor(200 + t * 55)}, ${Math.floor(50 + t * 40)}, ${Math.floor(t * 15)})`
  }
}

export function LCDFire({ active, columns = 56, rows = 3 }: LCDFireProps) {
  // Heights array - one value per column (0 to 1, represents how high the bar goes)
  const [heights, setHeights] = useState<number[]>(() => Array(columns).fill(0))
  const frameRef = useRef<number>()
  const timeRef = useRef(0)
  
  useEffect(() => {
    if (!active) {
      // Cool down smoothly
      const coolDown = () => {
        setHeights(prev => {
          const allCold = prev.every(h => h < 0.01)
          if (allCold) return prev.map(() => 0)
          return prev.map(h => h * 0.9)
        })
      }
      const interval = setInterval(coolDown, 30)
      return () => clearInterval(interval)
    }
    
    const simulate = (timestamp: number) => {
      const time = timestamp / 1000
      timeRef.current = time
      
      setHeights(prev => {
        return prev.map((currentHeight, x) => {
          const xNorm = x / columns
          
          // Layer multiple waves for organic movement
          const wave1 = Math.sin(time * 3 + xNorm * Math.PI * 4) * 0.5 + 0.5
          const wave2 = Math.sin(time * 5 + xNorm * Math.PI * 7 + 1) * 0.3 + 0.5
          const wave3 = Math.sin(time * 2 + xNorm * Math.PI * 2) * 0.4 + 0.5
          const wave4 = Math.sin(time * 7 + xNorm * Math.PI * 10 + 2) * 0.2 + 0.5
          
          // Combine waves
          const targetHeight = (wave1 + wave2 + wave3 + wave4) / 4
          
          // Add some randomness for flicker
          const flicker = 0.95 + Math.random() * 0.1
          
          // Smooth interpolation toward target
          const newHeight = currentHeight + (targetHeight * flicker - currentHeight) * 0.2
          
          return Math.max(0, Math.min(1, newHeight))
        })
      })
      
      frameRef.current = requestAnimationFrame(simulate)
    }
    
    frameRef.current = requestAnimationFrame(simulate)
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [active, columns])
  
  return (
    <div className="lcd-grid-fire">
      {Array(columns).fill(null).map((_, col) => {
        const height = heights[col] || 0
        // Calculate how many rows should be lit (from bottom up)
        const litRows = height * rows
        
        return (
          <div key={col} className="lcd-column">
            {Array(rows).fill(null).map((_, row) => {
              // Rows are rendered top to bottom, but we want bottom-up lighting
              const rowFromBottom = rows - 1 - row
              const isLit = rowFromBottom < litRows
              const intensity = isLit ? Math.min(1, litRows - rowFromBottom) : 0
              const color = isLit ? getFireColor(rowFromBottom, rows, intensity) : '#2a2928'
              
              return (
                <div 
                  key={row}
                  className="lcd-pixel"
                  style={{ 
                    backgroundColor: color,
                    boxShadow: intensity > 0.5
                      ? `0 0 ${Math.floor(intensity * 3)}px ${color}`
                      : 'none',
                  }}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
