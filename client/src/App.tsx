import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Pencil } from 'lucide-react'
import PromptInput from './components/PromptInput'
import SettingsPanel from './components/SettingsPanel'
import ImageDisplay from './components/ImageDisplay'
import EditImageUpload from './components/EditImageUpload'
import GenerationHistory from './components/GenerationHistory'
import { EditImageRef } from './components/EditImageUpload'
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
  const [mode, setMode] = useState<GenerationMode>('create')
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
  const [editImage, setEditImage] = useState<EditImageRef | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)

  // Switch mode - clear edit image when switching to create
  const handleModeChange = useCallback((newMode: GenerationMode) => {
    setMode(newMode)
    if (newMode === 'create') {
      setEditImage(null)
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return
    if (mode === 'edit' && !editImage) return

    setIsGenerating(true)
    setError(null)
    setProgress({ status: 'connecting', message: 'Connecting...', progress: 0 })

    try {
      const editData = mode === 'edit' && editImage ? {
        editImageType: editImage.type,
        editImageValue: editImage.value,
        parentId: editImage.generationId,
      } : {}

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
          ...editData,
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
                setResult({ 
                  imageUrl: data.imageUrl, 
                  imageUrls: data.imageUrls,
                  prompt: prompt.trim() 
                })
                setProgress(null)
                setIsGenerating(false)
                setHistoryKey(k => k + 1)
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
  }, [prompt, settings, isGenerating, editImage, mode])

  // Use image as style reference (stays in FORGE mode)
  const handleUseAsReference = useCallback((imageUrl: string) => {
    const newRef: StyleImage = { url: imageUrl, strength: 1 }
    const maxRefs = settings.model === 'pro' ? 14 : 3
    
    setSettings(prev => ({
      ...prev,
      styleImages: [...(prev.styleImages || []), newRef].slice(0, maxRefs)
    }))
  }, [settings.model])

  // Edit an image (switches to EDIT mode)
  const handleEditImage = useCallback((ref: EditImageRef) => {
    setEditImage(ref)
    setMode('edit')
  }, [])

  const canGenerate = prompt.trim() && (mode === 'create' || editImage)

  return (
    <div className="min-h-screen bg-forge-bg">
      <div className="fixed inset-0 bg-gradient-to-br from-forge-bg via-forge-surface to-forge-bg opacity-50" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/10 via-transparent to-transparent" />
      
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <Header />
        
        <main className="mt-8 space-y-6">
          {/* MODE SELECTOR - Big and clear */}
          <div className="te-panel p-2">
            <div className="flex gap-2">
              <button
                onClick={() => handleModeChange('create')}
                disabled={isGenerating}
                className={`
                  flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-lg font-mono text-sm uppercase tracking-wider
                  transition-all duration-200
                  ${mode === 'create' 
                    ? 'bg-gradient-to-b from-fuchsia-500 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-500/30' 
                    : 'bg-te-panel-dark text-te-cream-dim hover:bg-te-panel hover:text-te-cream'
                  }
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <Zap className="w-5 h-5" />
                <span className="text-base font-bold">FORGE</span>
                <span className="text-xs opacity-70">Create new</span>
              </button>
              
              <button
                onClick={() => handleModeChange('edit')}
                disabled={isGenerating}
                className={`
                  flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-lg font-mono text-sm uppercase tracking-wider
                  transition-all duration-200
                  ${mode === 'edit' 
                    ? 'bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/30' 
                    : 'bg-te-panel-dark text-te-cream-dim hover:bg-te-panel hover:text-te-cream'
                  }
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <Pencil className="w-5 h-5" />
                <span className="text-base font-bold">EDIT</span>
                <span className="text-xs opacity-70">Modify existing</span>
              </button>
            </div>
          </div>

          {/* EDIT MODE: Image to edit (only shown in edit mode) */}
          <AnimatePresence mode="wait">
            {mode === 'edit' && (
              <motion.div
                key="edit-upload"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <EditImageUpload
                  image={editImage}
                  onImageChange={setEditImage}
                  disabled={isGenerating}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* PROMPT - Always visible */}
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            disabled={isGenerating}
            placeholder={mode === 'edit' ? 'Describe the changes you want...' : 'Describe what you want to create...'}
          />

          {/* FORGE MODE: Style references */}
          <AnimatePresence mode="wait">
            {mode === 'create' && (
              <motion.div
                key="forge-refs"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <HighriseSearch
                  selectedItems={settings.styleImages || []}
                  onSelectionChange={(items) => setSettings({ ...settings, styleImages: items })}
                  disabled={isGenerating}
                  maxItems={settings.model === 'pro' ? 14 : 3}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* HISTORY - Simple: +REF or EDIT */}
          <GenerationHistory
            key={historyKey}
            onUseAsReference={handleUseAsReference}
            onEditImage={handleEditImage}
            disabled={isGenerating}
          />

          {/* SETTINGS + GENERATE */}
          <div className="flex flex-col sm:flex-row gap-4 items-stretch">
            <div className="flex-1">
              <SettingsPanel
                settings={settings}
                onChange={setSettings}
                disabled={isGenerating}
              />
            </div>
            
            {/* Single generate button - color changes based on mode */}
            <motion.button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              whileTap={canGenerate && !isGenerating ? { scale: 0.98 } : undefined}
              className={`
                relative min-w-[180px] min-h-[100px] rounded-xl font-mono text-base font-bold uppercase tracking-wider
                transition-all duration-200 overflow-hidden
                ${!canGenerate || isGenerating
                  ? 'bg-te-panel-dark text-te-cream-dim cursor-not-allowed'
                  : mode === 'create'
                    ? 'bg-gradient-to-b from-fuchsia-500 to-fuchsia-600 text-white cursor-pointer shadow-lg shadow-fuchsia-500/30 hover:shadow-fuchsia-500/50'
                    : 'bg-gradient-to-b from-cyan-500 to-cyan-600 text-white cursor-pointer shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50'
                }
              `}
            >
              {isGenerating ? (
                <div className="flex flex-col items-center justify-center gap-2 p-4">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-sm">{mode === 'create' ? 'FORGING...' : 'EDITING...'}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 p-4">
                  {mode === 'create' ? (
                    <>
                      <Zap className="w-8 h-8" />
                      <span>FORGE</span>
                    </>
                  ) : (
                    <>
                      <Pencil className="w-8 h-8" />
                      <span>EDIT</span>
                    </>
                  )}
                </div>
              )}
            </motion.button>
          </div>

          {/* Progress */}
          <AnimatePresence>
            {progress && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-xl overflow-hidden"
                style={{ 
                  background: 'linear-gradient(180deg, #0d0712 0%, #0a0510 100%)', 
                  border: `1px solid ${mode === 'create' ? '#a21caf' : '#0891b2'}` 
                }}
              >
                <div className="flex items-center justify-between px-4 py-2">
                  <span 
                    className="font-mono text-xs uppercase tracking-wider"
                    style={{ 
                      color: mode === 'create' ? '#e879f9' : '#22d3ee', 
                      textShadow: `0 0 8px ${mode === 'create' ? 'rgba(232, 121, 249, 0.5)' : 'rgba(34, 211, 238, 0.5)'}` 
                    }}
                  >
                    {progress.message}
                  </span>
                  <span className="font-mono text-xs" style={{ color: mode === 'create' ? '#a855f7' : '#06b6d4' }}>
                    {Math.floor(progress.progress)}%{progress.elapsed !== undefined && ` · ${progress.elapsed}s`}
                  </span>
                </div>
                <pre 
                  className="px-4 pb-3 font-mono text-sm select-none whitespace-pre overflow-hidden"
                  style={{ 
                    color: mode === 'create' ? '#e879f9' : '#22d3ee', 
                    textShadow: `0 0 8px ${mode === 'create' ? 'rgba(232, 121, 249, 0.6)' : 'rgba(34, 211, 238, 0.6)'}`,
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

          {/* Error */}
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

          {/* Output */}
          <ImageDisplay
            result={result}
            isLoading={isGenerating}
            onEditImage={(imageUrl) => handleEditImage({ type: 'storage', value: imageUrl })}
          />
        </main>
      </div>
      
      <DebugPanel />
    </div>
  )
}

export default App
