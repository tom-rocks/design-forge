import { useState, useCallback, useEffect } from 'react'
import { Search, History, Monitor, Plus, Flame, Hammer, MessageSquare, Wifi, WifiOff, LayoutGrid, LogIn, LogOut, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from './config'
import { useAuth } from './hooks/useAuth'
import { 
  Button, 
  Panel, PanelHeader, PanelBody, 
  ModeSwitch, 
  Textarea,
  Thumb,
  MoltenPipe,
  LCDFire,
  HighriseSearch,
  HistoryGrid
} from './components'


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

type RefSource = 'drop' | 'items' | 'history'

export default function App() {
  // Auth
  const { loading: authLoading, authenticated, user, login, logout } = useAuth()
  
  // State
  const [mode, setMode] = useState<Mode>('create')
  const [prompt, setPrompt] = useState('')
  const [references, setReferences] = useState<Reference[]>([])
  const [editImage, setEditImage] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [refSource, setRefSource] = useState<RefSource>('drop')
  
  // Track image loading states
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  
  // Pipe fill state (0-1)
  const [pipeFill, setPipeFill] = useState(0)
  // Output frame hot state (delayed after pipe fills)
  const [outputHot, setOutputHot] = useState(false)
  
  // Bridge connection status
  const [bridgeConnected, setBridgeConnected] = useState(false)

  const canGenerate = prompt.trim() && (mode === 'create' || editImage)
  
  // Check bridge status
  useEffect(() => {
    const checkBridge = async () => {
      try {
        const res = await fetch(`${API_URL}/api/bridge/status`)
        const data = await res.json()
        setBridgeConnected(data.connected)
      } catch {
        setBridgeConnected(false)
      }
    }
    checkBridge()
    const interval = setInterval(checkBridge, 5000)
    return () => clearInterval(interval)
  }, [])

  // Animate pipe when forging
  useEffect(() => {
    if (isGenerating) {
      // Small delay to let CSS register the reset state before heating up
      const pipeTimer = setTimeout(() => setPipeFill(1), 400)
      // Output heats up after pipe fills
      const outputTimer = setTimeout(() => setOutputHot(true), 2000)
      return () => {
        clearTimeout(pipeTimer)
        clearTimeout(outputTimer)
      }
    } else if (result) {
      const timer = setTimeout(() => {
        setPipeFill(0)
        setOutputHot(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [isGenerating, result])

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || isGenerating) return
    
    // Reset all states immediately
    setIsGenerating(true)
    setError(null)
    setResult(null)
    setLoadedImages(new Set())
    setFailedImages(new Set())
    setPipeFill(0)
    setOutputHot(false)

    if (window.location.hostname === 'localhost') {
      await new Promise(resolve => setTimeout(resolve, 3000))
      setResult({
        imageUrl: 'https://picsum.photos/512/512',
        imageUrls: ['https://picsum.photos/512/512?r=1', 'https://picsum.photos/512/512?r=2'],
        prompt: prompt.trim()
      })
      setIsGenerating(false)
      return
    }

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
    setReferences(prev => {
      if (prev.length >= 14 || prev.find(r => r.id === ref.id)) return prev
      return [...prev, ref]
    })
  }

  const removeReference = (id: string) => {
    setReferences(references.filter(r => r.id !== id))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const data = e.dataTransfer.getData('application/x-reference')
    if (data) {
      try {
        addReference(JSON.parse(data))
        return
      } catch {}
    }
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const url = ev.target?.result as string
        addReference({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          name: file.name,
          type: 'file'
        })
      }
      reader.readAsDataURL(file)
    })
  }, [references])

  const images = result?.imageUrls?.length ? result.imageUrls : result?.imageUrl ? [result.imageUrl] : []
  const validImages = images.filter(url => !failedImages.has(url))
  // Check if all images have been processed (loaded or failed)
  const allProcessed = images.length > 0 && (loadedImages.size + failedImages.size) >= images.length
  const isLoadingImages = images.length > 0 && !allProcessed && !isGenerating

  // Preload images when result changes
  useEffect(() => {
    if (!result || images.length === 0) return
    
    images.forEach(url => {
      const img = new Image()
      img.onload = () => setLoadedImages(prev => new Set(prev).add(url))
      img.onerror = () => setFailedImages(prev => new Set(prev).add(url))
      img.src = url
    })
  }, [result, images.length])

  // Show login screen if not authenticated
  if (authLoading) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <img src="/forge_logo.svg" alt="Design Forge" className="login-logo" />
          <span className="login-loading">Loading...</span>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <img src="/forge_logo.svg" alt="Design Forge" className="login-logo" />
          <p className="login-subtitle">Asset creation and refinement for Highrise</p>
          <button onClick={login} className="btn btn-accent login-btn">
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
          <p className="login-note">Highrise team members only</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* HEADER */}
      <header className="app-header">
        <img src="/forge_logo.svg" alt="Design Forge" className="app-logo" />
        
        <div className="app-auth">
          <div className="auth-user">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name || ''} className="auth-avatar" />
            ) : (
              <User className="auth-avatar-icon" />
            )}
            <span className="auth-name">{user?.name || user?.email}</span>
            <button onClick={logout} className="btn btn-ghost auth-logout" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN FORGE AREA - Single column vertical flow */}
      <main className="forge-main">

        {/* INPUT BLOCK */}
        <div className="forge-block forge-input-block">
          <Panel>
            <PanelHeader>
              <MessageSquare className="w-4 h-4" />
              Prompt
              <ModeSwitch mode={mode} onChange={setMode} disabled={isGenerating} />
            </PanelHeader>
            <PanelBody>
              <Textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe what you want to create..."
                rows={2}
                disabled={isGenerating}
              />
            </PanelBody>
          </Panel>

          <motion.div
            className="edit-panel-wrapper"
            animate={{ 
              gridTemplateRows: mode === 'edit' ? '1fr' : '0fr',
              marginTop: mode === 'edit' ? 12 : 0
            }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="edit-panel-inner">
              <Panel>
                <PanelHeader>
                  <Hammer className="w-4 h-4" />
                  Edit Image
                </PanelHeader>
                <PanelBody>
                  {editImage ? (
                    <div className="edit-image-preview">
                      <img src={editImage} alt="Edit" />
                      <button onClick={() => setEditImage(null)} className="thumb-remove">×</button>
                    </div>
                  ) : (
                    <div className="edit-dropzone">
                      <span className="dropzone-text">Drop image to edit</span>
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </div>
          </motion.div>

          {/* CRUCIBLE - References panel with hot border when forging */}
          <motion.div 
            className="crucible-frame"
            animate={{
              background: pipeFill > 0 
                ? 'linear-gradient(135deg, #e64a19 0%, #ff5722 50%, #ff6d00 100%)'
                : 'linear-gradient(135deg, #b0aca8 0%, #c8c4c0 50%, #d0ccc8 100%)',
              boxShadow: pipeFill > 0
                ? 'inset 2px 2px 4px rgba(0,0,0,0.2), inset -1px -1px 2px rgba(255,200,100,0.4), 0 0 20px rgba(255,87,34,0.5), 0 0 40px rgba(255,87,34,0.3)'
                : 'inset 2px 2px 4px rgba(0,0,0,0.15), inset -1px -1px 2px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.1)'
            }}
            transition={{ duration: pipeFill > 0 ? 1.2 : 2.5, ease: 'easeOut' }}
          >
            {/* LCD Status Display */}
            <div className="lcd-screen">
              <LCDFire active={isGenerating} columns={42} rows={3} />
              <div className="lcd-refs">
                {[...Array(14)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`lcd-ref-dot ${i < references.length ? 'filled' : ''}`}
                  />
                ))}
              </div>
              <div className="lcd-bridge">
                <WifiOff className={`lcd-bridge-icon ${!bridgeConnected ? 'active' : ''}`} />
                <Wifi className={`lcd-bridge-icon ${bridgeConnected ? 'active' : ''}`} />
              </div>
              <div className="lcd-labels">
                <span className={`lcd-label ${!isGenerating ? 'active' : ''}`}>IDLE</span>
                <span className={`lcd-label ${isGenerating ? 'active' : ''}`}>FORGING</span>
              </div>
            </div>
            <Panel>
              <PanelHeader led={references.length > 0 ? 'on' : 'off'}>
                <Plus className="w-4 h-4" />
                References
              </PanelHeader>
              <PanelBody>
                {/* Reference source tabs */}
                <div className="ref-tabs">
                  <button 
                    className={`btn ${refSource === 'drop' ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => setRefSource('drop')}
                  >
                    <LayoutGrid className="w-3 h-3" />
                    References
                  </button>
                  <button 
                    className={`btn ${refSource === 'items' ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => setRefSource('items')}
                  >
                    <Search className="w-3 h-3" />
                    Items
                  </button>
                  <button 
                    className={`btn ${refSource === 'history' ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => setRefSource('history')}
                  >
                    <History className="w-3 h-3" />
                    History
                  </button>
                </div>

                {/* Reference content based on source */}
                {refSource === 'drop' ? (
                  <div 
                    className={`dropzone dropzone-refs ${isDragging ? 'active' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {references.length === 0 ? (
                      <span className="dropzone-text">
                        {isDragging ? 'Drop to add' : 'Drop images or select from Items'}
                      </span>
                    ) : (
                      <div className="thumb-grid">
                        <AnimatePresence mode="popLayout">
                          {references.map((ref) => (
                            <Thumb
                              key={ref.id}
                              src={ref.url.startsWith('http') || ref.url.startsWith('data:') ? ref.url : `${API_URL}${ref.url}`}
                              alt={ref.name}
                              onRemove={() => removeReference(ref.id)}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                ) : refSource === 'items' ? (
                  <HighriseSearch
                    references={references}
                    onAddReference={addReference}
                    onRemoveReference={removeReference}
                    maxRefs={14}
                    disabled={isGenerating}
                    bridgeConnected={bridgeConnected}
                  />
                ) : (
                  <HistoryGrid
                    authenticated={authenticated}
                    onLogin={login}
                    references={references}
                    onAddReference={addReference}
                    onRemoveReference={removeReference}
                    maxRefs={14}
                    disabled={isGenerating}
                    isActive={refMode === 'history'}
                  />
                )}
              </PanelBody>
            </Panel>
          </motion.div>

          {/* FORGE BUTTON */}
          <Button
            variant="accent"
            onClick={handleGenerate}
            disabled={!canGenerate}
            isLoading={isGenerating}
            className="w-full forge-button"
          >
            {isGenerating ? (
              <>
                {mode === 'create' ? <Flame className="w-4 h-4" /> : <Hammer className="w-4 h-4" />}
                {mode === 'create' ? 'Forging...' : 'Editing...'}
              </>
            ) : !canGenerate ? (
              !prompt.trim() ? 'Enter prompt' : mode === 'edit' && !editImage ? 'Add image' : 'Ready'
            ) : (
              <>
                {mode === 'create' ? <Flame className="w-4 h-4" /> : <Hammer className="w-4 h-4" />}
                {mode === 'create' ? 'Forge' : 'Edit'}
              </>
            )}
          </Button>
        </div>

        {/* PIPE - Connects crucible to output */}
        <div className="forge-pipe-wrapper">
          <MoltenPipe fill={pipeFill} />
        </div>

        {/* OUTPUT BLOCK */}
        <div className="forge-block forge-output-block">
          <motion.div 
            className="output-frame"
            animate={{
              background: outputHot 
                ? 'linear-gradient(135deg, #e64a19 0%, #ff5722 50%, #ff6d00 100%)'
                : 'linear-gradient(135deg, #b0aca8 0%, #c8c4c0 50%, #d0ccc8 100%)',
              boxShadow: outputHot
                ? 'inset 2px 2px 4px rgba(0,0,0,0.2), inset -1px -1px 2px rgba(255,200,100,0.4), 0 0 20px rgba(255,87,34,0.5), 0 0 40px rgba(255,87,34,0.3)'
                : 'inset 2px 2px 4px rgba(0,0,0,0.15), inset -1px -1px 2px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.1)'
            }}
            transition={{ duration: outputHot ? 1.2 : 2.5, ease: 'easeOut' }}
          >
            <Panel>
              <PanelHeader led={isGenerating || isLoadingImages ? 'on' : validImages.length > 0 && loadedImages.size > 0 ? 'success' : 'off'}>
                <Monitor className="w-4 h-4" />
                Output
              </PanelHeader>
            <PanelBody>
              <motion.div 
                className="output-container"
                layout="position"
              >
                <AnimatePresence mode="popLayout">
                  {isGenerating || isLoadingImages ? (
                    <motion.div 
                      key="waiting"
                      className="output-waiting"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="output-loader">
                        <div className="loader-label">{isGenerating ? 'RECEIVING' : 'LOADING'}</div>
                        <div className="loader-track">
                          {[...Array(12)].map((_, i) => (
                            <motion.div
                              key={i}
                              className="loader-segment"
                              animate={{ 
                                opacity: [0.2, 1, 0.2],
                                backgroundColor: ['#4a4540', '#ff5722', '#4a4540']
                              }}
                              transition={{
                                duration: 1.2,
                                delay: i * 0.08,
                                repeat: Infinity,
                                ease: 'easeInOut'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : validImages.length > 0 && loadedImages.size > 0 ? (
                    <motion.div 
                      key="images"
                      className={`output-grid ${validImages.length > 1 ? 'cols-2' : 'cols-1'}`}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.3 }}
                    >
                      {validImages.filter(url => loadedImages.has(url)).map((url, i) => (
                        <motion.img 
                          key={url}
                          src={url}
                          alt={`Output ${i + 1}`}
                          className="output-image"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.15, duration: 0.4 }}
                        />
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="empty"
                      className="output-empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span>Output appears here</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </PanelBody>
          </Panel>
          </motion.div>
        </div>

        {/* ERROR */}
        <AnimatePresence>
          {error && (
            <motion.div 
              className="forge-error"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
