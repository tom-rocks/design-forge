import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PromptInput from './components/PromptInput'
import SettingsPanel from './components/SettingsPanel'
import ImageDisplay from './components/ImageDisplay'
import GenerateButton from './components/GenerateButton'
import Header from './components/Header'
import DebugPanel from './components/DebugPanel'
import HighriseSearch from './components/HighriseSearch'
import { API_URL } from './config'
import { AlertTriangle } from 'lucide-react'

export interface StyleImage {
  url: string
  strength: number
}

export interface Reference {
  name: string
  images: { url: string }[]
}

export type GeminiModel = 'flash' | 'pro'

export interface GenerationSettings {
  model: GeminiModel
  resolution: '1024' | '2048' | '4096'
  aspectRatio: string
  negativePrompt: string
  seed: string
  numImages: number
  styleImages?: StyleImage[]
  references?: Reference[]
}

export interface GenerationProgress {
  status: string
  message: string
  progress: number
  elapsed?: number
}

interface GenerationResult {
  imageUrl: string
  imageUrls?: string[]
  prompt: string
}

function App() {
  const [prompt, setPrompt] = useState('')
  const [settings, setSettings] = useState<GenerationSettings>({
    model: 'pro',  // Default to Pro for max references (14)
    resolution: '1024',
    aspectRatio: '1:1',
    negativePrompt: '',
    seed: '',
    numImages: 1,
    styleImages: [],
    references: [],
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return

    setIsGenerating(true)
    setError(null)
    setProgress({ status: 'connecting', message: 'ESTABLISHING CONNECTION...', progress: 0 })

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: settings.model,
          resolution: settings.resolution === '1024' ? '1K' : settings.resolution === '2048' ? '2K' : '4K',
          aspectRatio: settings.aspectRatio,
          numImages: settings.numImages > 1 ? settings.numImages : undefined,
          styleImages: settings.styleImages?.length ? settings.styleImages : undefined,
          negativePrompt: settings.negativePrompt || undefined,
          seed: settings.seed || undefined,
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response stream')

      let buffer = ''
      let currentEvent = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (currentEvent === 'progress') {
                setProgress({
                  status: data.status,
                  message: data.message?.toUpperCase() || 'PROCESSING...',
                  progress: data.progress || 0,
                  elapsed: data.elapsed,
                })
              } else if (currentEvent === 'complete') {
                console.log('Generation complete:', data)
                setResult({ 
                  imageUrl: data.imageUrl, 
                  imageUrls: data.imageUrls,
                  prompt: prompt.trim() 
                })
                setProgress(null)
                setIsGenerating(false)
                return
              } else if (currentEvent === 'error') {
                throw new Error(data.error)
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError)
            }
            currentEvent = ''
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setProgress(null)
    } finally {
      setIsGenerating(false)
    }
  }, [prompt, settings, isGenerating])

  // ASCII visualizer for progress
  const PIXELS = ' ░▒▓█'
  const [progressViz, setProgressViz] = useState<string[]>([])
  
  useEffect(() => {
    if (!progress) {
      setProgressViz([])
      return
    }
    
    const vizInterval = setInterval(() => {
      const width = 32
      const height = 6
      const time = Date.now() / 1000
      const prog = progress.progress / 100
      const lines: string[] = []
      
      for (let y = 0; y < height; y++) {
        let row = ''
        for (let x = 0; x < width; x++) {
          const nx = x / width
          const ny = (y / height - 0.5) * 2
          
          // Wave patterns
          const wave1 = Math.sin(nx * 8 - time * 3 + ny * 2)
          const wave2 = Math.sin(nx * 12 + time * 2)
          
          // Progress mask - more visible as progress increases
          const progressMask = nx < prog ? 1.2 : 0.3
          
          const combined = (wave1 + wave2) / 2 * progressMask
          const idx = Math.floor((combined + 1) * 2)
          row += PIXELS[Math.max(0, Math.min(idx, PIXELS.length - 1))]
        }
        lines.push(row)
      }
      
      setProgressViz(lines)
    }, 50)
    
    return () => clearInterval(vizInterval)
  }, [progress])

  return (
    <div className="min-h-screen bg-te-bg te-grid-bg">
      {/* Subtle vignette */}
      <div className="fixed inset-0 pointer-events-none" 
        style={{ background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.4) 100%)' }} 
      />
      
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Header />
        </motion.div>
        
        <main className="mt-8 space-y-6">
          {/* Prompt Input Module */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleGenerate}
              disabled={isGenerating}
            />
          </motion.div>

          {/* Asset Database Module */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <HighriseSearch
              selectedItems={settings.styleImages || []}
              onSelectionChange={(items) => setSettings({ ...settings, styleImages: items })}
              disabled={isGenerating}
              maxItems={settings.model === 'pro' ? 14 : 3}
              prompt={prompt}
            />
          </motion.div>

          {/* Controls Row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="flex flex-col lg:flex-row gap-4 items-stretch"
          >
            <div className="flex-1">
              <SettingsPanel
                settings={settings}
                onChange={setSettings}
                disabled={isGenerating}
              />
            </div>
            
            <div className="lg:w-auto">
              <GenerateButton
                onClick={handleGenerate}
                isLoading={isGenerating}
                disabled={!prompt.trim()}
              />
            </div>
          </motion.div>

          {/* Progress Indicator - ASCII Visualizer Style */}
          <AnimatePresence>
            {progress && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="te-panel overflow-hidden"
              >
                <div className="te-module-header py-2">
                  <span>PROCESS_STATUS</span>
                  <div className="flex-1" />
                  <span className="font-mono text-[10px] text-fuchsia-400">
                    {String(Math.floor(progress.progress)).padStart(3, '0')}%
                  </span>
                  <div className="w-2 h-2 led led-amber led-pulse ml-2" />
                </div>
                
                <div className="p-3" style={{ background: '#0a0510' }}>
                  {/* ASCII Visualizer */}
                  <pre 
                    className="font-mono text-[10px] leading-tight text-fuchsia-400/80 text-center select-none"
                    style={{ textShadow: '0 0 8px rgba(217, 70, 239, 0.4)' }}
                  >
                    {progressViz.join('\n')}
                  </pre>
                  
                  {/* Status message */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-fuchsia-500/20">
                    <motion.span 
                      className="font-mono text-[10px] text-fuchsia-300 tracking-widest uppercase"
                      key={progress.message}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      {progress.message}
                    </motion.span>
                    {progress.elapsed !== undefined && (
                      <span className="font-mono text-[10px] text-fuchsia-400/60">
                        {String(Math.floor(progress.elapsed)).padStart(3, '0')}s
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message - Console Style */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="te-panel overflow-hidden border-te-led-red/50"
              >
                <div className="te-module-header py-2 border-b-te-led-red/30">
                  <AlertTriangle className="w-3.5 h-3.5 text-te-led-red" />
                  <span className="text-te-led-red">SYSTEM_ERROR</span>
                  <div className="flex-1" />
                  <div className="w-2 h-2 led led-red" />
                </div>
                
                <div className="p-4 bg-te-lcd">
                  <p className="font-mono text-sm text-te-led-red uppercase tracking-wider mb-2">
                    GENERATION FAILED
                  </p>
                  <p className="font-mono text-xs text-te-cream-dim break-all">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Output Display Module */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.25 }}
          >
            <ImageDisplay
              result={result}
              isLoading={isGenerating}
            />
          </motion.div>
        </main>
        
        {/* Footer badge */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-te-panel border-2 border-te-border rounded-lg">
            <div className="w-1.5 h-1.5 led led-green" />
            <span className="font-mono text-[9px] text-te-cream-dim uppercase tracking-widest">
              DESIGN_FORGE CONSOLE v2.0 — ALL SYSTEMS NOMINAL
            </span>
          </div>
        </motion.footer>
      </div>
      
      <DebugPanel />
    </div>
  )
}

export default App
