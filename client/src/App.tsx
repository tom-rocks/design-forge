import { useState, useCallback } from 'react'
import { Zap, Pencil, Search, History, Monitor, Plus, X } from 'lucide-react'
import { API_URL } from './config'

/* ============================================
   TYPES
   ============================================ */

type Mode = 'create' | 'edit'

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

interface GenerationResult {
  imageUrl: string
  imageUrls?: string[]
  prompt: string
}

/* ============================================
   APP
   ============================================ */

export default function App() {
  const [mode, setMode] = useState<Mode>('create')
  const [prompt, setPrompt] = useState('')
  const [references, setReferences] = useState<Reference[]>([])
  const [editImage, setEditImage] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = prompt.trim() && (mode === 'create' || editImage)

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || isGenerating) return
    
    setIsGenerating(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: 'pro',
          resolution: '1024',
          aspectRatio: '1:1',
          styleImages: references.map(r => ({ url: r.url, strength: 1 })),
          mode,
          ...(mode === 'edit' && editImage ? { editImageValue: editImage, editImageType: 'url' } : {}),
        }),
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response')

      const decoder = new TextDecoder()
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
            const data = JSON.parse(line.slice(6))
            if (currentEvent === 'complete') {
              setResult({ imageUrl: data.imageUrl, imageUrls: data.imageUrls, prompt: prompt.trim() })
              setIsGenerating(false)
              return
            } else if (currentEvent === 'error') {
              throw new Error(data.error)
            }
            currentEvent = ''
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsGenerating(false)
    }
  }, [prompt, references, mode, editImage, canGenerate, isGenerating])

  const addReference = (ref: Reference) => {
    if (references.length >= 14 || references.find(r => r.id === ref.id)) return
    setReferences([...references, ref])
  }

  const removeReference = (id: string) => {
    setReferences(references.filter(r => r.id !== id))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const data = e.dataTransfer.getData('application/x-reference')
    if (data) {
      try {
        addReference(JSON.parse(data))
      } catch {}
    }
  }, [references])

  const images = result?.imageUrls?.length ? result.imageUrls : result?.imageUrl ? [result.imageUrl] : []

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg)' }}>
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="text-center py-4">
          <h1 className="text-2xl font-bold tracking-tight">DESIGN FORGE</h1>
          <p className="text-dim text-sm mt-1">Concept Art Generator</p>
        </header>

        {/* MODE SELECTOR */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('create')}
            className={`btn flex-1 ${mode === 'create' ? 'btn-primary' : ''}`}
          >
            <Zap className="w-4 h-4" />
            Forge
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`btn flex-1 ${mode === 'edit' ? 'btn-primary' : ''}`}
          >
            <Pencil className="w-4 h-4" />
            Edit
          </button>
        </div>

        {/* PROMPT */}
        <div className="panel">
          <div className="panel-body">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe what you want to create..."
              rows={3}
              disabled={isGenerating}
            />
          </div>
        </div>

        {/* EDIT MODE: Image to edit */}
        {mode === 'edit' && (
          <div className="panel">
            <div className="panel-header">
              <Pencil />
              <span>Image to Edit</span>
            </div>
            <div className="panel-body">
              {editImage ? (
                <div className="relative inline-block">
                  <img src={editImage} alt="Edit" className="max-h-40 rounded" />
                  <button 
                    onClick={() => setEditImage(null)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ) : (
                <div className="text-dim text-sm">Drop an image here or select from history</div>
              )}
            </div>
          </div>
        )}

        {/* BROWSE PANELS */}
        <div className="grid grid-cols-2 gap-6">
          {/* Highrise Items */}
          <div className="panel">
            <div className="panel-header">
              <Search />
              <span>Highrise Items</span>
            </div>
            <div className="panel-body">
              <input type="text" placeholder="Search items..." className="mb-4" />
              <div className="text-dim text-sm text-center py-8">
                Search for items above
              </div>
            </div>
          </div>

          {/* History */}
          <div className="panel">
            <div className="panel-header">
              <History />
              <span>History</span>
            </div>
            <div className="panel-body">
              <div className="text-dim text-sm text-center py-8">
                Past generations will appear here
              </div>
            </div>
          </div>
        </div>

        {/* CRUCIBLE (References) */}
        {mode === 'create' && (
          <div 
            className="panel"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="panel-header">
              <Plus />
              <span>Crucible</span>
              <span className="ml-auto">{references.length}/14</span>
            </div>
            <div className="panel-body min-h-[100px]">
              {references.length === 0 ? (
                <div className="text-dim text-sm text-center py-8">
                  Drop references here from Highrise or History
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {references.map(ref => (
                    <div key={ref.id} className="relative w-16 h-16">
                      <img 
                        src={ref.url.startsWith('http') || ref.url.startsWith('data:') ? ref.url : `${API_URL}${ref.url}`}
                        alt={ref.name || 'Ref'}
                        className="w-full h-full object-cover rounded"
                      />
                      <button
                        onClick={() => removeReference(ref.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <X className="w-2 h-2 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* GENERATE BUTTON */}
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="btn btn-primary w-full py-4 text-base"
        >
          {isGenerating ? (
            <>
              <div className="spinner" />
              Generating...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              {mode === 'create' ? 'Forge' : 'Edit'}
            </>
          )}
        </button>

        {/* ERROR */}
        {error && (
          <div className="panel" style={{ borderColor: '#ef4444' }}>
            <div className="panel-body text-red-400 text-sm">
              {error}
            </div>
          </div>
        )}

        {/* OUTPUT */}
        <div className="panel">
          <div className="panel-header">
            <Monitor />
            <span>Output</span>
            <div className={`status-dot ml-auto ${isGenerating ? 'active' : result ? 'success' : ''}`} />
          </div>
          <div className="panel-body">
            {isGenerating ? (
              <div className="aspect-square flex items-center justify-center">
                <div className="spinner" style={{ width: 40, height: 40 }} />
              </div>
            ) : images.length > 0 ? (
              <div className={`grid gap-4 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {images.map((url, i) => (
                  <img 
                    key={i}
                    src={url}
                    alt={`Output ${i + 1}`}
                    className="w-full rounded"
                  />
                ))}
              </div>
            ) : (
              <div className="aspect-square flex items-center justify-center text-dim text-sm">
                Output will appear here
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
