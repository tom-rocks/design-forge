import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Pencil } from 'lucide-react'
import PromptInput from './components/PromptInput'
import ImageDisplay from './components/ImageDisplay'
import EditImageUpload from './components/EditImageUpload'
import GenerationHistory from './components/GenerationHistory'
import { EditImageRef } from './components/EditImageUpload'
import ReferenceDropZone, { ReferenceItem } from './components/ReferenceDropZone'
import ForgeGutter from './components/ForgeGutter'
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
  const [settings] = useState<GenerationSettings>({
    model: 'pro',
    resolution: '1024',
    aspectRatio: '1:1',
    negativePrompt: '',
    seed: '',
    numImages: 1,
    styleImages: [],
    references: [],
  })
  const [references, setReferences] = useState<ReferenceItem[]>([])
  const [editImage, setEditImage] = useState<EditImageRef | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  
  const maxRefs = settings.model === 'pro' ? 14 : 3

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

      // Convert references to styleImages format for API
      const styleImages = references.map(ref => ({
        url: ref.url.startsWith('http') || ref.url.startsWith('data:') 
          ? ref.url 
          : `${API_URL}${ref.url}`,
        strength: 1,
        name: ref.name,
      }))

      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: settings.model,
          resolution: settings.resolution,
          aspectRatio: settings.aspectRatio,
          numImages: settings.numImages > 1 ? settings.numImages : undefined,
          styleImages: styleImages.length > 0 ? styleImages : undefined,
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
  }, [prompt, settings, isGenerating, editImage, mode, references])

  // Add image as reference (from history or search)
  const handleAddReference = useCallback((imageUrl: string) => {
    if (references.length >= maxRefs) return
    
    const newRef: ReferenceItem = {
      id: `ref-${Date.now()}`,
      url: imageUrl,
      type: imageUrl.includes('/api/generations/') ? 'generation' : 'highrise',
    }
    
    // Avoid duplicates
    if (!references.find(r => r.url === imageUrl)) {
      setReferences(prev => [...prev, newRef].slice(0, maxRefs))
    }
  }, [references, maxRefs])

  // Edit an image (switches to EDIT mode)
  const handleEditImage = useCallback((ref: EditImageRef) => {
    setEditImage(ref)
    setMode('edit')
  }, [])

  const canGenerate = prompt.trim() && (mode === 'create' || editImage)
  const heatLevel = progress ? progress.progress / 100 : 0

  return (
    <div className="min-h-screen bg-forge-bg">
      <div className="fixed inset-0 bg-gradient-to-br from-forge-bg via-forge-surface to-forge-bg opacity-50" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-900/10 via-transparent to-transparent" />
      
      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8">
        <Header />
        
        <main className="mt-8 space-y-4">
          {/* 1. MODE SELECTOR */}
          <div className="te-panel p-2">
            <div className="flex gap-2">
              <button
                onClick={() => handleModeChange('create')}
                disabled={isGenerating}
                className={`
                  flex-1 flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-mono text-sm uppercase tracking-wider
                  transition-all duration-200
                  ${mode === 'create' 
                    ? 'bg-gradient-to-b from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30' 
                    : 'bg-te-panel-dark text-te-cream-dim hover:bg-te-panel hover:text-te-cream'
                  }
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <Zap className="w-5 h-5" />
                <span className="font-bold">FORGE</span>
              </button>
              
              <button
                onClick={() => handleModeChange('edit')}
                disabled={isGenerating}
                className={`
                  flex-1 flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-mono text-sm uppercase tracking-wider
                  transition-all duration-200
                  ${mode === 'edit' 
                    ? 'bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/30' 
                    : 'bg-te-panel-dark text-te-cream-dim hover:bg-te-panel hover:text-te-cream'
                  }
                  ${isGenerating ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <Pencil className="w-5 h-5" />
                <span className="font-bold">EDIT</span>
              </button>
            </div>
          </div>

          {/* 2. PROMPT INPUT - Small, expandable */}
          <PromptInput
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleGenerate}
            disabled={isGenerating}
            placeholder={mode === 'edit' ? 'Describe the changes...' : 'Describe what to forge...'}
          />

          {/* EDIT MODE: Image to edit */}
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

          {/* 3 & 4. BROWSE PANELS - Highrise + History side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Highrise items */}
            <HighriseSearch
              selectedItems={[]}
              onSelectionChange={() => {}}
              disabled={isGenerating}
              maxItems={maxRefs}
            />

            {/* Past generations */}
            <GenerationHistory
              key={historyKey}
              onUseAsReference={handleAddReference}
              onEditImage={handleEditImage}
              disabled={isGenerating}
            />
          </div>

          {/* FORGE MODE: Crucible + Gutter + Output (connected, no gaps) */}
          <AnimatePresence mode="wait">
            {mode === 'create' && (
              <motion.div
                key="forge-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Crucible + Button row */}
                <div className="flex gap-4 items-stretch">
                  <div className="flex-1">
                    <ReferenceDropZone
                      references={references}
                      onReferencesChange={setReferences}
                      maxRefs={maxRefs}
                      disabled={isGenerating}
                      isForging={isGenerating}
                    />
                  </div>
                  
                  {/* FORGE button */}
                  <motion.button
                    onClick={handleGenerate}
                    disabled={!canGenerate || isGenerating}
                    whileTap={canGenerate && !isGenerating ? { scale: 0.95, y: 2 } : undefined}
                    className={`
                      relative w-32 rounded-xl font-mono text-base font-bold uppercase tracking-wider
                      transition-all duration-200 overflow-hidden
                      ${!canGenerate || isGenerating
                        ? 'bg-te-panel-dark text-te-cream-dim cursor-not-allowed'
                        : 'bg-gradient-to-b from-orange-500 via-orange-600 to-red-700 text-white cursor-pointer'
                      }
                    `}
                    style={canGenerate && !isGenerating ? {
                      boxShadow: '0 0 30px rgba(255, 107, 53, 0.5), 0 4px 0 #7c2d12, inset 0 1px 0 rgba(255,255,255,0.2)',
                    } : {
                      boxShadow: '0 4px 0 #1a1a1a',
                    }}
                  >
                    {canGenerate && !isGenerating && (
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          boxShadow: [
                            'inset 0 0 20px rgba(255, 107, 53, 0.3)',
                            'inset 0 0 40px rgba(255, 107, 53, 0.5)',
                            'inset 0 0 20px rgba(255, 107, 53, 0.3)',
                          ]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                    )}
                    
                    {isGenerating ? (
                      <div className="flex flex-col items-center justify-center gap-2 p-4 h-full">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                          className="w-8 h-8 border-3 border-white/30 border-t-orange-300 rounded-full"
                        />
                        <span className="text-xs">FORGING</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 p-4 h-full">
                        <Zap className="w-10 h-10" />
                        <span>FORGE</span>
                      </div>
                    )}
                  </motion.button>
                </div>

                {/* Gutter - directly connected, no margin */}
                <div className="-mt-1">
                  <ForgeGutter 
                    isForging={isGenerating} 
                    progress={progress?.progress || 0}
                  />
                </div>

                {/* Output mold - directly connected */}
                <div className="-mt-1">
                  <ImageDisplay
                    result={result}
                    isLoading={isGenerating}
                    heatLevel={heatLevel}
                    onEditImage={(imageUrl) => handleEditImage({ type: 'storage', value: imageUrl })}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* EDIT MODE: Edit button + Output */}
          <AnimatePresence mode="wait">
            {mode === 'edit' && (
              <motion.div
                key="edit-section"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <motion.button
                  onClick={handleGenerate}
                  disabled={!canGenerate || isGenerating}
                  whileTap={canGenerate && !isGenerating ? { scale: 0.98 } : undefined}
                  className={`
                    relative w-full py-4 rounded-xl font-mono text-base font-bold uppercase tracking-wider
                    transition-all duration-200
                    ${!canGenerate || isGenerating
                      ? 'bg-te-panel-dark text-te-cream-dim cursor-not-allowed'
                      : 'bg-gradient-to-b from-cyan-500 to-cyan-600 text-white cursor-pointer shadow-lg shadow-cyan-500/30'
                    }
                  `}
                >
                  {isGenerating ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>EDITING...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3">
                      <Pencil className="w-6 h-6" />
                      <span>EDIT IMAGE</span>
                    </div>
                  )}
                </motion.button>

                <ImageDisplay
                  result={result}
                  isLoading={isGenerating}
                  heatLevel={heatLevel}
                  onEditImage={(imageUrl) => handleEditImage({ type: 'storage', value: imageUrl })}
                />
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
        </main>
      </div>
      
      <DebugPanel />
    </div>
  )
}

export default App
