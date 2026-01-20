import { useEffect, useRef } from 'react'

interface LCDFireCanvasProps {
  active: boolean
  width?: number
  height?: number
  cols?: number
  rows?: number
  className?: string
}

const FIRE_PALETTE = [
  [42, 41, 40], [61, 31, 16], [92, 37, 16], [122, 45, 10],
  [153, 53, 5], [184, 64, 0], [217, 74, 0], [230, 74, 25],
  [245, 93, 0], [255, 114, 0], [255, 136, 0], [255, 160, 48], [255, 184, 80],
]

export function LCDFireCanvas({ 
  active, width = 200, height = 17, cols = 56, rows = 3, className = ''
}: LCDFireCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fireStateRef = useRef<Uint8Array | null>(null)
  const frameRef = useRef<number>(0)
  const lastFrameRef = useRef<number>(0)
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Handle high-DPI displays
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)
    
    // Disable image smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false
    
    if (!fireStateRef.current || fireStateRef.current.length !== cols * rows) {
      fireStateRef.current = new Uint8Array(cols * rows)
    }
    
    const fireState = fireStateRef.current
    const pixelWidth = width / cols
    const pixelHeight = height / rows
    const frameInterval = 1000 / 30
    
    const simulate = () => {
      if (active) {
        for (let x = 0; x < cols; x++) {
          const idx = (rows - 1) * cols + x
          if (Math.random() < 0.4) fireState[idx] = Math.floor(Math.random() * 5) + 8
          else if (Math.random() < 0.6) fireState[idx] = Math.floor(Math.random() * 4) + 4
          else fireState[idx] = Math.floor(Math.random() * 4)
        }
        for (let y = 0; y < rows - 1; y++) {
          for (let x = 0; x < cols; x++) {
            const idx = y * cols + x
            const below = fireState[(y + 1) * cols + x]
            const belowLeft = fireState[(y + 1) * cols + Math.max(0, x - 1)]
            const belowRight = fireState[(y + 1) * cols + Math.min(cols - 1, x + 1)]
            const avg = (below * 2 + belowLeft + belowRight) / 4
            const decay = Math.random() < 0.7 ? 1 : 2
            fireState[idx] = Math.max(0, Math.round(avg) - decay)
          }
        }
      } else {
        for (let i = 0; i < fireState.length; i++) {
          if (fireState[i] > 0) fireState[i]--
        }
      }
    }
    
    const render = () => {
      ctx.fillStyle = '#1a1918'
      ctx.fillRect(0, 0, width, height)
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const value = Math.min(fireState[y * cols + x], FIRE_PALETTE.length - 1)
          const [r, g, b] = FIRE_PALETTE[value]
          ctx.fillStyle = `rgb(${r},${g},${b})`
          ctx.fillRect(
            Math.floor(x * pixelWidth), 
            Math.floor(y * pixelHeight), 
            Math.ceil(pixelWidth) - 1, 
            Math.ceil(pixelHeight) - 1
          )
        }
      }
    }
    
    const loop = (timestamp: number) => {
      if (timestamp - lastFrameRef.current >= frameInterval) {
        simulate()
        render()
        lastFrameRef.current = timestamp
      }
      frameRef.current = requestAnimationFrame(loop)
    }
    
    render()
    frameRef.current = requestAnimationFrame(loop)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [active, width, height, cols, rows])
  
  return <canvas ref={canvasRef} className={`lcd-fire-canvas ${className}`} />
}
