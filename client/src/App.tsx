import { useState, useCallback, useEffect, useRef } from 'react'
import { Search, History, Download, Flame, Hammer, Wifi, WifiOff, LogIn, LogOut, User, Trash2, Maximize2, X, ChevronDown, Zap, Gem } from 'lucide-react'
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
  const [editImage, setEditImage] = useState<{ url: string; thumbnail?: string } | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [refSource, setRefSource] = useState<RefSource>('drop')
  const [refSourceCollapsed, setRefSourceCollapsed] = useState(false)
  const [refineSource, setRefineSource] = useState<RefSource>('drop')
  
  // Forge specs state
  const [specsExpanded, setSpecsExpanded] = useState(false)
  const [alloyExpanded, setAlloyExpanded] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [resolution, setResolution] = useState<string>('1K')
  const [genModel, setGenModel] = useState<string>('flash')
  
  // Handle model change - auto-correct resolution if needed
  const handleModelChange = useCallback((model: string) => {
    setGenModel(model)
    // Flash only supports 1K, so reset if switching to flash with higher res
    if (model === 'flash' && resolution !== '1K') {
      setResolution('1K')
    }
  }, [resolution])
  
  // Track image loading states
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  
  // Pipe fill state (0-1)
  const [pipeFill, setPipeFill] = useState(0)
  // Output frame hot state (delayed after pipe fills)
  const [outputHot, setOutputHot] = useState(false)
  
  // Bridge connection status
  const [bridgeConnected, setBridgeConnected] = useState(false)
  
  // Output lightbox
  const [outputLightbox, setOutputLightbox] = useState<string | null>(null)
  
  // Abort controller for cancelling generation
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Ref for prompt textarea
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const canGenerate = prompt.trim() && (mode === 'create' || editImage?.url)
  
  // Scroll to prompt and focus
  const scrollToPrompt = useCallback(() => {
    promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => promptRef.current?.focus(), 300)
  }, [])
  
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
    
    // Create new abort controller for this generation
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    
    // Reset all states immediately
    setIsGenerating(true)
    setError(null)
    setRefSourceCollapsed(true) // Collapse tabs to focus on output
    setResult(null)
    setLoadedImages(new Set())
    setFailedImages(new Set())
    setPipeFill(0)
    setOutputHot(false)

    if (window.location.hostname === 'localhost') {
      await new Promise(resolve => setTimeout(resolve, 3000))
      if (signal.aborted) return
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
          ...(mode === 'edit' && editImage?.url ? { editImageValue: editImage.url, editImageType: 'url' } : {}),
        }),
        signal,
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
      // Don't show error if it was cancelled
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsGenerating(false)
      abortControllerRef.current = null
    }
  }, [prompt, references, mode, editImage, canGenerate, isGenerating])

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsGenerating(false)
      setPipeFill(0)
      setOutputHot(false)
    }
  }, [])

  const addReference = (ref: Reference) => {
    setReferences(prev => {
      if (prev.length >= 14 || prev.find(r => r.id === ref.id)) return prev
      return [...prev, ref]
    })
  }

  const removeReference = (id: string) => {
    setReferences(references.filter(r => r.id !== id))
  }

  const downloadOutputImage = useCallback((url: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = `forge-output-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

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

  // Handle paste from clipboard (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          
          const reader = new FileReader()
          reader.onload = (ev) => {
            const url = ev.target?.result as string
            addReference({
              id: `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              url,
              name: `Pasted image`,
              type: 'file'
            })
          }
          reader.readAsDataURL(file)
        }
      }
    }
    
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
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
              Prompt
              <ModeSwitch mode={mode} onChange={setMode} disabled={isGenerating} />
            </PanelHeader>
            <PanelBody>
              <div className="prompt-input-wrapper">
                <div className="prompt-led-row">
                  <span className={`led ${!prompt.trim() && !isGenerating ? 'blink' : prompt.trim() ? 'on' : ''}`} />
                </div>
                <Textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe what you want to create..."
                  rows={2}
                  disabled={isGenerating}
                />
              </div>
            </PanelBody>
          </Panel>

          {/* FORGE SPECS */}
          <motion.div
            className="specs-frame"
            animate={{ marginTop: 12 }}
          >
            {/* LCD status display - horizontal, compact, all options visible */}
            <div className="lcd-screen lcd-specs-status">
              <span className={`lcd-spec-item lcd-flash ${genModel === 'flash' ? 'lit' : ''}`}>
                <Zap className="lcd-icon" /> FLASH
              </span>
              <span className={`lcd-spec-item lcd-pro ${genModel === 'pro' ? 'lit' : ''}`}>
                <Gem className="lcd-icon" /> PRO
              </span>
              <span className="lcd-spec-sep">│</span>
              {[
                { ratio: '1:1', w: 10, h: 10 },
                { ratio: '4:3', w: 12, h: 9 },
                { ratio: '3:4', w: 9, h: 12 },
                { ratio: '16:9', w: 14, h: 8 },
                { ratio: '9:16', w: 8, h: 14 },
              ].map(({ ratio, w, h }) => (
                <span key={ratio} className={`lcd-spec-item ${aspectRatio === ratio ? 'lit' : ''}`}>
                  <svg className="lcd-ratio-icon" viewBox="0 0 16 16" width="14" height="14">
                    <rect x={(16-w)/2} y={(16-h)/2} width={w} height={h} fill="currentColor" rx="1" />
                  </svg>
                  {ratio}
                </span>
              ))}
              <span className="lcd-spec-sep">│</span>
              {[
                { res: '1K', cls: 'lcd-1k' },
                { res: '2K', cls: 'lcd-2k' },
                { res: '4K', cls: 'lcd-4k' },
              ].map(({ res, cls }) => (
                <span key={res} className={`lcd-spec-item ${cls} ${resolution === res ? 'lit' : ''} ${genModel === 'flash' && res !== '1K' ? 'unavailable' : ''}`}>{res}</span>
              ))}
            </div>
            <Panel>
              <PanelHeader onClick={() => setSpecsExpanded(!specsExpanded)}>
                Forge Specs <span className="header-subtitle">advanced settings</span>
                <div className="header-right">
                  <motion.div 
                    animate={{ rotate: specsExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </motion.div>
                  <span className={`led ${genModel !== 'flash' || aspectRatio !== '1:1' || resolution !== '1K' ? 'on' : ''}`} />
                </div>
              </PanelHeader>
              <motion.div
                className="specs-options"
                animate={{ 
                  height: specsExpanded ? 'auto' : 0,
                  opacity: specsExpanded ? 1 : 0
                }}
                transition={{ duration: 0.2 }}
              >
                <PanelBody>
                  <div className="specs-row">
                    <span className="specs-label">MODEL</span>
                    <div className="specs-buttons">
                      <button 
                        className={`specs-btn ${genModel === 'flash' ? 'active' : ''}`}
                        onClick={() => handleModelChange('flash')}
                        disabled={isGenerating}
                      >Flash</button>
                      <button 
                        className={`specs-btn ${genModel === 'pro' ? 'active' : ''}`}
                        onClick={() => handleModelChange('pro')}
                        disabled={isGenerating}
                      >Pro</button>
                    </div>
                  </div>
                  <div className="specs-row">
                    <span className="specs-label">RATIO</span>
                    <div className="specs-buttons">
                      {['1:1', '4:3', '3:4', '16:9', '9:16'].map(r => (
                        <button 
                          key={r}
                          className={`specs-btn ${aspectRatio === r ? 'active' : ''}`}
                          onClick={() => setAspectRatio(r)}
                          disabled={isGenerating}
                        >{r}</button>
                      ))}
                    </div>
                  </div>
                  <div className="specs-row">
                    <span className="specs-label">SIZE</span>
                    <div className="specs-buttons">
                      {['1K', '2K', '4K'].map(s => (
                        <button 
                          key={s}
                          className={`specs-btn ${resolution === s ? 'active' : ''}`}
                          onClick={() => setResolution(s)}
                          disabled={isGenerating || (genModel === 'flash' && s !== '1K')}
                        >{s}</button>
                      ))}
                    </div>
                  </div>
                </PanelBody>
              </motion.div>
            </Panel>
          </motion.div>

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
                  Refine <span className="header-subtitle">edit an image</span>
                  <div className="header-right">
                    <span className={`led ${mode === 'edit' && prompt.trim() && !editImage?.url && !isGenerating ? 'blink' : editImage?.url ? 'on' : ''}`} />
                  </div>
                </PanelHeader>
                <PanelBody>
                  {editImage ? (
                    <div className="edit-image-preview">
                      <img src={editImage.thumbnail || editImage.url} alt="Refine" />
                      <button onClick={() => setEditImage(null)} className="thumb-remove">×</button>
                    </div>
                  ) : (
                    <>
                      <div className="btn-group refine-tabs">
                        <button 
                          className={`btn ${refineSource === 'drop' ? 'btn-accent' : 'btn-dark'}`}
                          onClick={() => setRefineSource('drop')}
                        >
                          <Download className="w-4 h-4" />
                          Drop
                        </button>
                        <button 
                          className={`btn ${refineSource === 'items' ? 'btn-accent' : 'btn-dark'}`}
                          onClick={() => setRefineSource('items')}
                        >
                          <Search className="w-4 h-4" />
                          Items
                        </button>
                        <button 
                          className={`btn ${refineSource === 'history' ? 'btn-accent' : 'btn-dark'}`}
                          onClick={() => setRefineSource('history')}
                        >
                          <History className="w-4 h-4" />
                          Works
                        </button>
                      </div>
                      <div className="refine-content">
                        {refineSource === 'drop' && (
                          <div className="edit-dropzone">
                            <span className="dropzone-text">Drop or paste image</span>
                          </div>
                        )}
                        {refineSource === 'items' && (
                          <HighriseSearch 
                            singleSelect
                            onSingleSelect={(item) => setEditImage({ url: item.imageUrl })} 
                            bridgeConnected={bridgeConnected}
                          />
                        )}
                        {refineSource === 'history' && (
                          <HistoryGrid 
                            singleSelect
                            onSingleSelect={(gen) => setEditImage({ 
                              url: `${API_URL}${gen.imageUrls[0]}`,
                              thumbnail: gen.thumbnailUrl ? `${API_URL}${gen.thumbnailUrl}` : undefined
                            })}
                            isActive={mode === 'edit'}
                          />
                        )}
                      </div>
                    </>
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
              <PanelHeader onClick={() => setAlloyExpanded(!alloyExpanded)}>
                Alloy <span className="header-subtitle">image references</span>
                <div className="header-right">
                  <motion.div 
                    animate={{ rotate: alloyExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </motion.div>
                  <span className={`led ${references.length > 0 ? 'on' : ''}`} />
                </div>
              </PanelHeader>
              <motion.div
                className="alloy-content"
                animate={{ 
                  height: alloyExpanded ? 'auto' : 0,
                  opacity: alloyExpanded ? 1 : 0
                }}
                transition={{ duration: 0.2 }}
              >
              <PanelBody>
                {/* Reference source tabs */}
                <div className="btn-group ref-tabs">
                  <button 
                    className={`btn ${refSource === 'drop' && !refSourceCollapsed ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => {
                      if (refSource === 'drop' && !refSourceCollapsed) {
                        setRefSourceCollapsed(true)
                      } else {
                        setRefSource('drop')
                        setRefSourceCollapsed(false)
                      }
                    }}
                  >
                    <Download className="w-3 h-3" />
                    Drop
                  </button>
                  <button 
                    className={`btn ${refSource === 'items' && !refSourceCollapsed ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => {
                      if (refSource === 'items' && !refSourceCollapsed) {
                        setRefSourceCollapsed(true)
                      } else {
                        setRefSource('items')
                        setRefSourceCollapsed(false)
                      }
                    }}
                  >
                    <Search className="w-3 h-3" />
                    Items
                  </button>
                  <button 
                    className={`btn ${refSource === 'history' && !refSourceCollapsed ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => {
                      if (refSource === 'history' && !refSourceCollapsed) {
                        setRefSourceCollapsed(true)
                      } else {
                        setRefSource('history')
                        setRefSourceCollapsed(false)
                      }
                    }}
                  >
                    <History className="w-3 h-3" />
                    Works
                  </button>
                </div>

                {/* Reference content - all tabs stay mounted, collapsible */}
                {!refSourceCollapsed && (
                  <>
                    <div className={`ref-tab-content ${refSource === 'drop' ? 'active' : ''}`}>
                      <div 
                        className={`dropzone dropzone-refs ${isDragging ? 'active' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <span className="dropzone-text">
                          {isDragging ? 'Drop to add' : 'Drop or paste images'}
                        </span>
                      </div>
                    </div>
                    <div className={`ref-tab-content ${refSource === 'items' ? 'active' : ''}`}>
                      <HighriseSearch
                        references={references}
                        onAddReference={addReference}
                        onRemoveReference={removeReference}
                        maxRefs={14}
                        disabled={isGenerating}
                        bridgeConnected={bridgeConnected}
                      />
                    </div>
                    <div className={`ref-tab-content ${refSource === 'history' ? 'active' : ''}`}>
                      <HistoryGrid
                        authenticated={authenticated}
                        onLogin={login}
                        references={references}
                        onAddReference={addReference}
                        onRemoveReference={removeReference}
                        maxRefs={14}
                        disabled={isGenerating}
                        isActive={refSource === 'history'}
                      />
                    </div>
                  </>
                )}

                {/* Always visible: Selected references */}
                {references.length > 0 && (
                  <div className="active-refs">
                    <div className="active-refs-header">
                      <span className="led on" />
                      <span>Active ({references.length}/14)</span>
                      <button 
                        className="active-refs-clear"
                        onClick={() => setReferences([])}
                        title="Clear all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
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
                  </div>
                )}
              </PanelBody>
              </motion.div>
            </Panel>
          </motion.div>

          {/* FORGE BUTTON */}
          <Button
            variant={canGenerate || isGenerating ? 'accent' : 'dark'}
            onClick={isGenerating ? handleCancel : !canGenerate && !prompt.trim() ? scrollToPrompt : handleGenerate}
            disabled={!isGenerating && !canGenerate && prompt.trim() !== ''}
            isLoading={false}
            className="w-full forge-button"
          >
            {isGenerating ? (
              <>
                <X className="w-4 h-4" />
                Tap to cancel
              </>
            ) : !canGenerate ? (
              !prompt.trim() ? 'Enter prompt' : mode === 'edit' && !editImage?.url ? 'Select image' : 'Ready'
            ) : (
              <>
                {mode === 'create' ? <Flame className="w-4 h-4" /> : <Hammer className="w-4 h-4" />}
                {mode === 'create' ? 'Forge' : 'Refine'}
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
                        <div className="loader-label">{isGenerating ? 'CASTING' : 'LOADING'}</div>
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
                        <motion.div 
                          key={url}
                          className="output-image-wrapper"
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.15, duration: 0.4 }}
                        >
                          <img 
                            src={url}
                            alt={`Output ${i + 1}`}
                            className="output-image"
                          />
                          <button 
                            className="output-expand"
                            onClick={() => setOutputLightbox(url)}
                            title="View full size"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                        </motion.div>
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
                      <span>Ready to cast</span>
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

      {/* Output Lightbox */}
      <AnimatePresence>
        {outputLightbox && (
          <motion.div 
            className="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOutputLightbox(null)}
          >
            <motion.div 
              className="lightbox-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <img src={outputLightbox} alt="Output full size" />
              <div className="lightbox-footer">
                <div className="lightbox-prompt">{prompt}</div>
                <button 
                    className="lightbox-download"
                    onClick={() => downloadOutputImage(outputLightbox)}
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
