import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PromptInput from './components/PromptInput'
import SettingsPanel from './components/SettingsPanel'
import ImageDisplay from './components/ImageDisplay'
import GenerateButton from './components/GenerateButton'
import Header from './components/Header'
import DebugPanel from './components/DebugPanel'
import { API_URL } from './config'

export interface StyleImage {
  url: string
  strength: number
}

export interface Reference {
  name: string
  images: { url: string }[]
}

export interface GenerationSettings {
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
    setProgress({ status: 'connecting', message: 'Connecting...', progress: 0 })

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          numImages: settings.numImages > 1 ? settings.numImages : undefined,
          styleImages: settings.styleImages?.length ? settings.styleImages : undefined,
          references: settings.references?.length ? settings.references : undefined,
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response stream')

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const event = line.slice(7)
            const dataLine = lines[lines.indexOf(line) + 1]
            if (dataLine?.startsWith('data: ')) {
              const data = JSON.parse(dataLine.slice(6))
              
              if (event === 'progress') {
                setProgress({
                  status: data.status,
                  message: data.message,
                  progress: data.progress || 0,
                  elapsed: data.elapsed,
                })
              } else if (event === 'complete') {
                setResult({ 
                  imageUrl: data.imageUrl, 
                  imageUrls: data.imageUrls,
                  prompt: prompt.trim() 
                })
                setProgress(null)
                setIsGenerating(false)
                return
              } else if (event === 'error') {
                throw new Error(data.error)
              }
            }
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

  return (
    <div className="min-h-screen bg-forge-bg">
      <div className="fixed inset-0 bg-gradient-to-br from-forge-bg via-forge-surface to-forge-bg opacity-50" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/10 via-transparent to-transparent" />
      
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <Header />
        
        <main className="mt-12 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <PromptInput
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleGenerate}
              disabled={isGenerating}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col sm:flex-row gap-4 items-start sm:items-end justify-between"
          >
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              disabled={isGenerating}
            />
            
            <GenerateButton
              onClick={handleGenerate}
              isLoading={isGenerating}
              disabled={!prompt.trim()}
            />
          </motion.div>

          {/* Progress indicator */}
          <AnimatePresence>
            {progress && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-forge-surface border border-forge-border rounded-xl"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />
                    <span className="text-forge-text text-sm font-medium">{progress.message}</span>
                  </div>
                  {progress.elapsed && (
                    <span className="text-forge-text-muted text-xs tabular-nums">{progress.elapsed}s</span>
                  )}
                </div>
                {/* Progress bar */}
                <div className="h-1.5 bg-forge-border rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.progress}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
              >
                <div className="font-medium mb-1">Generation Error</div>
                <div className="text-red-300/80 text-xs font-mono break-all">{error}</div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <ImageDisplay
              result={result}
              isLoading={isGenerating}
            />
          </motion.div>
        </main>
      </div>
      
      <DebugPanel />
    </div>
  )
}

export default App
