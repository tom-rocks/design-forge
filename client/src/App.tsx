import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PromptInput from './components/PromptInput'
import SettingsPanel from './components/SettingsPanel'
import ImageDisplay from './components/ImageDisplay'
import GenerateButton from './components/GenerateButton'
import EditImageUpload from './components/EditImageUpload'
import Header from './components/Header'
import DebugPanel from './components/DebugPanel'
import HighriseSearch from './components/HighriseSearch'
import { API_URL } from './config'

export interface StyleImage {
  url: string
  strength: number
}

export interface Reference {
  name: string
  images: { url: string }[]
}

export type GeminiModel = 'flash' | 'pro'
export type GenerationMode = 'create' | 'edit'

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
    model: 'pro',
    resolution: '1024',
    aspectRatio: '1:1',
    negativePrompt: '',
    seed: '',
    numImages: 1,
    styleImages: [],
    references: [],
  })
  const [editImage, setEditImage] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadingMode, setLoadingMode] = useState<GenerationMode | null>(null)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = useCallback(async (mode: GenerationMode) => {
    if (!prompt.trim() || isGenerating) return
    if (mode === 'edit' && !editImage) return

    setIsGenerating(true)
    setLoadingMode(mode)
    setError(null)
    setProgress({ status: 'connecting', message: 'Connecting...', progress: 0 })

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: settings.model,
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          numImages: settings.numImages > 1 ? settings.numImages : undefined,
          styleImages: settings.styleImages?.length ? settings.styleImages : undefined,
          references: settings.references?.length ? settings.references : undefined,
          mode,
          editImage: mode === 'edit' ? editImage : undefined,
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
                  message: data.message,
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
                setLoadingMode(null)
                return
              } else if (currentEvent === 'error') {
                throw new Error(data.error)
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError)
            }
            currentEvent = '' // Reset after processing
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setProgress(null)
    } finally {
      setIsGenerating(false)
      setLoadingMode(null)
    }
  }, [prompt, settings, isGenerating, editImage])

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
              onSubmit={() => handleGenerate(editImage ? 'edit' : 'create')}
              disabled={isGenerating}
            />
          </motion.div>

          {/* Edit Image Upload */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <EditImageUpload
              image={editImage}
              onImageChange={setEditImage}
              disabled={isGenerating}
            />
          </motion.div>

          {/* Highrise Item Search - Style References */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <HighriseSearch
              selectedItems={settings.styleImages || []}
              onSelectionChange={(items) => setSettings({ ...settings, styleImages: items })}
              disabled={isGenerating}
              maxItems={settings.model === 'pro' ? 14 : 3}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
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
              editDisabled={!editImage}
              loadingMode={loadingMode}
            />
          </motion.div>

          {/* Progress indicator - Same ASCII style as canvas */}
          <AnimatePresence>
            {progress && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-xl overflow-hidden"
                style={{ background: 'linear-gradient(180deg, #0d0712 0%, #0a0510 100%)', border: '1px solid #2a1a3a' }}
              >
                <div className="flex items-center justify-between px-4 py-2">
                  <span 
                    className="font-mono text-xs uppercase tracking-wider"
                    style={{ color: '#e879f9', textShadow: '0 0 8px rgba(232, 121, 249, 0.5)' }}
                  >
                    {progress.message}
                  </span>
                  <span className="font-mono text-xs" style={{ color: '#a855f7' }}>
                    {Math.floor(progress.progress)}%{progress.elapsed !== undefined && ` · ${progress.elapsed}s`}
                  </span>
                </div>
                {/* ASCII progress - same characters as canvas: ·:;░▒▓█ */}
                <pre 
                  className="px-4 pb-3 font-mono text-sm select-none whitespace-pre overflow-hidden"
                  style={{ 
                    color: '#e879f9', 
                    textShadow: '0 0 8px rgba(232, 121, 249, 0.6)',
                    letterSpacing: '0.05em',
                  }}
                >
{(() => {
  const width = 60
  const filled = Math.floor((progress.progress / 100) * width)
  const empty = width - filled
  return '█'.repeat(filled) + '░'.repeat(empty)
})()}
                </pre>
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
