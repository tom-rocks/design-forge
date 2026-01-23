import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Wifi, WifiOff, LogIn, User, Trash2, Maximize2, ChevronDown, Gem, Hammer, Plus, Download, X, Flame, Search, BarChart3, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from './config'
import { useAuth } from './hooks/useAuth'
import { checkAPContext, waitForAP } from './lib/ap-bridge'
import { 
  Button, 
  Panel, PanelHeader, PanelBody, 
  Textarea,
  Thumb,
  MoltenPipe,
  LCDFireGrid,
  HighriseSearch,
  HistoryGrid,
  Favorites,
  Lightbox,
  type ReplayConfig,
  type LightboxData
} from './components'
import { Dashboard } from './Dashboard'



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

type RefSource = 'drop' | 'items' | 'history' | 'favorites'

// Helper to get aspect ratio icon dimensions
const getAspectDimensions = (ratio: string | undefined) => {
  switch (ratio) {
    case '1:1': return { w: 10, h: 10 }
    case '3:4': return { w: 9, h: 12 }
    case '4:3': return { w: 12, h: 9 }
    case '9:16': return { w: 7, h: 12 }
    case '16:9': return { w: 12, h: 7 }
    default: return { w: 10, h: 10 }
  }
}

export default function App() {
  // Simple routing based on pathname
  const [currentPage, setCurrentPage] = useState<'forge' | 'dashboard'>(() => {
    return window.location.pathname === '/dashboard' ? 'dashboard' : 'forge'
  })
  
  // Handle browser navigation
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(window.location.pathname === '/dashboard' ? 'dashboard' : 'forge')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  
  const navigateTo = useCallback((page: 'forge' | 'dashboard') => {
    const path = page === 'dashboard' ? '/dashboard' : '/'
    window.history.pushState(null, '', path)
    setCurrentPage(page)
  }, [])
  
  // Auth
  const { loading: authLoading, authenticated, user, login } = useAuth()
  
  // Admin users who can see the dashboard button
  const ADMIN_IDS = ['113838337580596527498'] // Add your Google user ID here
  const isAdmin = user?.id && ADMIN_IDS.includes(user.id)
  
  // State
  const [prompt, setPrompt] = useState('')
  const [references, setReferences] = useState<Reference[]>([])
  const [editImage, setEditImage] = useState<{ url: string; thumbnail?: string } | null>(null)
  const [refineGlow, setRefineGlow] = useState(false) // Temporary glow when image added
  const [refineExpanded, setRefineExpanded] = useState(false) // Whether refine picker is open
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingRefine, setIsDraggingRefine] = useState(false)
  const [activeDropTarget, setActiveDropTarget] = useState<'refine' | 'refs' | null>(null) // Which dropzone receives paste
  const [refSource, setRefSource] = useState<RefSource>('drop')
  const [refSourceCollapsed, setRefSourceCollapsed] = useState(false)
  const [favoritesResetKey, setFavoritesResetKey] = useState(0)
  const [refineSource, setRefineSource] = useState<RefSource>('drop')
  
  // Forge specs state
  const [alloyExpanded, setAlloyExpanded] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [resolution, setResolution] = useState<string>('2K')
  const [outputCount, setOutputCount] = useState<1 | 2 | 4>(1)
  
  
  // Track image loading states
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  
  // Pipe fill state (0-1)
  const [pipeFill, setPipeFill] = useState(0)
  // Output frame hot state (delayed after pipe fills)
  const [outputHot, setOutputHot] = useState(false)
  
  // Bridge connection status
  const [bridgeConnected, setBridgeConnected] = useState(false)
  
  // AP iframe context (when running inside Admin Panel microapp)
  const [inAPContext, setInAPContext] = useState(false)
  
  // Output lightbox - now uses full LightboxData for consistency
  const [outputLightbox, setOutputLightbox] = useState<LightboxData | null>(null)
  
  // Starred (favorited) images for output lightbox
  const [starredOutputUrls, setStarredOutputUrls] = useState<Set<string>>(new Set())
  
  // Works gallery
  interface GalleryImage {
    url: string
    thumbUrl: string
    prompt: string
    id: string
    mode: 'create' | 'edit'
    model?: string
    resolution?: string
    aspectRatio?: string
    settings?: {
      styleImages?: { url: string; name?: string }[]
      negativePrompt?: string
    }
  }
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryExpanded, setGalleryExpanded] = useState<GalleryImage | null>(null)
  const [gallerySearch, setGallerySearch] = useState('')
  const [galleryLoadedImages, setGalleryLoadedImages] = useState<Set<string>>(new Set())
  
  // Abort controller for cancelling generation
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Ref for prompt textarea
  const promptRef = useRef<HTMLTextAreaElement>(null)
  
  // Ref for output container (scroll target)
  const outputRef = useRef<HTMLDivElement>(null)
  
  // Ref for refine panel (scroll target when selecting image to refine)
  const refineRef = useRef<HTMLDivElement>(null)
  
  // Ref for crucible/alloy block (scroll target when generating)
  const crucibleRef = useRef<HTMLDivElement>(null)

  // Mode is derived from whether there's an edit image
  const mode: Mode = editImage ? 'edit' : 'create'
  const canGenerate = prompt.trim() && (mode === 'create' || editImage?.url)
  
  // Scroll to prompt and focus
  const scrollToPrompt = useCallback(() => {
    promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => promptRef.current?.focus(), 300)
  }, [])
  
  // Scroll to refine panel
  const scrollToRefine = useCallback(() => {
    refineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  
  // Scroll to alloy/crucible block
  const scrollToAlloy = useCallback(() => {
    crucibleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  
  // Open works gallery
  const openGallery = useCallback(async () => {
    setGalleryOpen(true)
    setGalleryLoading(true)
    setGalleryExpanded(null)
    setGallerySearch('')
    setGalleryLoadedImages(new Set())
    try {
      const res = await fetch(`${API_URL}/api/generations/my`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        // Flatten all images from all generations, using thumbnails for grid
        const images: GalleryImage[] = []
        for (const gen of data.generations || []) {
          // Use generation thumbnail for first image, fall back to full URL
          const thumbBase = gen.thumbnailUrl ? `${API_URL}${gen.thumbnailUrl}` : null
          for (let i = 0; i < gen.imageUrls.length; i++) {
            const fullUrl = `${API_URL}${gen.imageUrls[i]}`
            images.push({
              url: fullUrl,
              thumbUrl: i === 0 && thumbBase ? thumbBase : fullUrl,
              prompt: gen.prompt,
              id: `${gen.id}-${i}`,
              mode: gen.mode || 'create',
              model: gen.model,
              resolution: gen.resolution,
              aspectRatio: gen.aspect_ratio,
              settings: gen.settings
            })
          }
        }
        setGalleryImages(images)
      }
    } catch (e) {
      console.error('Failed to load gallery:', e)
    } finally {
      setGalleryLoading(false)
    }
  }, [])
  
  // Memoized filtered gallery images - prevents recomputation on every render
  const filteredGalleryImages = useMemo(() => {
    if (!gallerySearch.trim()) return galleryImages
    const searchLower = gallerySearch.toLowerCase()
    return galleryImages.filter(img => img.prompt.toLowerCase().includes(searchLower))
  }, [galleryImages, gallerySearch])
  
  // Handle gallery image load
  const handleGalleryImageLoad = useCallback((id: string) => {
    setGalleryLoadedImages(prev => new Set(prev).add(id))
  }, [])
  
  // Available aspect ratios and their decimal values
  const ASPECT_RATIOS = [
    { label: '1:1', value: 1 },
    { label: '4:3', value: 4/3 },
    { label: '3:4', value: 3/4 },
    { label: '16:9', value: 16/9 },
    { label: '9:16', value: 9/16 },
    { label: '3:2', value: 3/2 },
    { label: '2:3', value: 2/3 },
    { label: '5:4', value: 5/4 },
    { label: '4:5', value: 4/5 },
    { label: '21:9', value: 21/9 },
  ]
  
  // Detect aspect ratio from image and set closest match
  const detectAndSetAspectRatio = useCallback((imageUrl: string) => {
    const img = document.createElement('img')
    img.onload = () => {
      const ratio = img.width / img.height
      // Find closest matching aspect ratio
      let closest = ASPECT_RATIOS[0]
      let minDiff = Math.abs(ratio - closest.value)
      for (const ar of ASPECT_RATIOS) {
        const diff = Math.abs(ratio - ar.value)
        if (diff < minDiff) {
          minDiff = diff
          closest = ar
        }
      }
      setAspectRatio(closest.label)
    }
    img.src = imageUrl
  }, [])
  
  // Trigger glow effect when editImage is set, fade after 3 seconds
  useEffect(() => {
    if (editImage) {
      setRefineGlow(true)
      const timer = setTimeout(() => setRefineGlow(false), 3000)
      return () => clearTimeout(timer)
    } else {
      setRefineGlow(false)
    }
  }, [editImage])
  
  // Check bridge status (either via server WebSocket or AP iframe context)
  useEffect(() => {
    // First check if we're in AP iframe context
    const isInAP = checkAPContext()
    
    if (isInAP) {
      // We're in AP iframe - wait for parent to be ready
      setInAPContext(true)
      waitForAP(5000).then(ready => {
        setBridgeConnected(ready)
      })
      
      // Keep checking AP connection
      const interval = setInterval(async () => {
        const ready = await waitForAP(2000)
        setBridgeConnected(ready)
      }, 10000)
      return () => clearInterval(interval)
    } else {
      // Standalone mode - check server bridge status
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
    }
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

  // Replay animation state
  const [promptHot, setPromptHot] = useState(false)
  
  // Replay a previous generation's settings with visual feedback
  const handleReplay = useCallback((config: ReplayConfig) => {
    // Collapse alloy panel and tabs - references will show in the "Active" section
    setAlloyExpanded(false)
    setRefSourceCollapsed(true)
    setRefineExpanded(false)
    
    // Clear existing references first
    setReferences([])
    
    // For edit mode, set the edit image (this derives mode automatically)
    if (config.mode === 'edit' && config.editImageUrl) {
      const fullUrl = `${API_URL}${config.editImageUrl}`
      setTimeout(() => {
        setEditImage({ url: fullUrl })
        detectAndSetAspectRatio(fullUrl)
      }, 100)
    } else {
      // Clear edit image for create mode
      setEditImage(null)
    }
    
    setTimeout(() => {
      // Set aspect ratio
      if (config.aspectRatio) setAspectRatio(config.aspectRatio)
    }, 200)
    
    setTimeout(() => {
      // Set resolution
      if (config.resolution) {
        setResolution(config.resolution)
      }
    }, 400)
    
    // Type out the prompt character by character
    const fullPrompt = config.prompt || ''
    setPrompt('')
    setPromptHot(true) // Start hot (orange)
    let charIndex = 0
    const typeInterval = setInterval(() => {
      if (charIndex < fullPrompt.length) {
        setPrompt(fullPrompt.slice(0, charIndex + 1))
        charIndex++
      } else {
        clearInterval(typeInterval)
        // Cool down the prompt (orange → grey transition)
        setTimeout(() => setPromptHot(false), 200)
      }
    }, 15) // Fast but visible typing
    
    // Add references one by one, staggered with the typing
    if (config.references && config.references.length > 0) {
      config.references.forEach((ref, i) => {
        setTimeout(() => {
          setReferences(prev => [...prev, {
            id: `replay-${i}-${Date.now()}`,
            url: ref.url,
            name: ref.name,
            type: 'generation' as const,
          }])
        }, 500 + (i * 200)) // Start at 500ms, add one every 200ms
      })
    }
    
    // Scroll to prompt
    setTimeout(() => {
      promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
  }, [])

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
    
    // Scroll to show the alloy block (generation progress area)
    setTimeout(scrollToAlloy, 100)

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
      // Debug: log what we're sending
      console.log('[Generate] Sending request:', { 
        mode, 
        numImages: outputCount, 
        model: 'pro', 
        aspectRatio,
        hasEditImage: !!editImage?.url 
      })
      
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: 'pro',
          resolution,
          aspectRatio,
          styleImages: references.map(r => ({ url: r.url, strength: 1 })),
          mode,
          numImages: outputCount,
          ...(mode === 'edit' && editImage?.url ? { editImage: editImage.url } : {}),
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
  }, [prompt, references, editImage, canGenerate, isGenerating, resolution, aspectRatio, outputCount, scrollToAlloy])

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
  
  // Bulk add references from alloy (used by lightbox "Use Alloy" button)
  // Adds refs one at a time with animation, scrolls to alloy block
  const addAlloyReferences = useCallback((refs: Reference[]) => {
    // Expand alloy panel if collapsed
    setAlloyExpanded(true)
    
    // Scroll to alloy block
    setTimeout(() => {
      crucibleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    
    // Add refs one at a time with delay for smooth animation
    refs.forEach((ref, i) => {
      setTimeout(() => {
        setReferences(prev => {
          // Skip if already at max or duplicate
          if (prev.length >= 14 || prev.find(r => r.url === ref.url)) return prev
          return [...prev, ref]
        })
      }, 150 + i * 120) // Stagger each by 120ms
    })
  }, [])

  const cycleOutputCount = () => {
    setOutputCount(prev => prev === 1 ? 2 : prev === 2 ? 4 : 1)
    // Clear any existing output to show preview grid
    setResult(null)
    setLoadedImages(new Set())
    setFailedImages(new Set())
  }

  const downloadOutputImage = useCallback((url: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = `forge-output-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  // Toggle favorite for output image
  const toggleOutputFavorite = useCallback(async (imageUrl: string) => {
    const isCurrentlyStarred = starredOutputUrls.has(imageUrl)
    
    if (isCurrentlyStarred) {
      // Remove from local state (we don't have the favorite ID easily, so just update UI)
      setStarredOutputUrls(prev => {
        const next = new Set(prev)
        next.delete(imageUrl)
        return next
      })
      // Note: To properly remove, we'd need to find the favorite by URL and delete it
      // For now, just update local state - user can unfavorite from Favorites tab
    } else {
      // Add to favorites
      try {
        const res = await fetch(`${API_URL}/api/favorites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'work',
            itemData: {
              imageUrl,
              name: prompt?.slice(0, 50) || 'Generation',
              prompt,
            },
          }),
        })
        
        if (res.ok) {
          setStarredOutputUrls(prev => new Set(prev).add(imageUrl))
        }
      } catch (e) {
        console.error('Failed to add favorite:', e)
      }
    }
  }, [starredOutputUrls, prompt])

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
  
  // Handle drop on refinement dropzone
  const handleRefineDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRefine(false)
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length > 0) {
      const file = files[0] // Only take first image for refinement
      const reader = new FileReader()
      reader.onload = (ev) => {
        const url = ev.target?.result as string
        setEditImage({ url })
        detectAndSetAspectRatio(url)
      }
      reader.readAsDataURL(file)
    }
  }, [])

  // Handle paste from clipboard (Ctrl+V) - goes to active drop target
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
            
            if (activeDropTarget === 'refine') {
              // Paste to refinement
              setEditImage({ url })
              detectAndSetAspectRatio(url)
            } else {
              // Paste to references
              addReference({
                id: `paste-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                url,
                name: `Pasted image`,
                type: 'file'
              })
            }
          }
          reader.readAsDataURL(file)
          break // Only process first image
        }
      }
    }
    
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [references, activeDropTarget])

  const images = result?.imageUrls?.length ? result.imageUrls : result?.imageUrl ? [result.imageUrl] : []
  const validImages = images.filter(url => !failedImages.has(url))
  
  // Scroll to output when first image loads
  useEffect(() => {
    if (result && !isGenerating && loadedImages.size > 0) {
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [result, isGenerating, loadedImages.size])
  // Check if all images have been processed (loaded or failed)
  const allProcessed = images.length > 0 && (loadedImages.size + failedImages.size) >= images.length
  const isLoadingImages = images.length > 0 && !allProcessed && !isGenerating

  // Preload images when result changes
  useEffect(() => {
    if (!result || images.length === 0) return
    
    images.forEach(url => {
      const img = document.createElement('img')
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

  // Dashboard page
  if (currentPage === 'dashboard') {
    return <Dashboard onBack={() => navigateTo('forge')} />
  }

  return (
    <div className="app">
      {/* HEADER */}
      <header className="app-header">
        <img src="/forge_logo.svg" alt="Design Forge" className="app-logo" />
        
        <div className="app-auth">
          <button onClick={openGallery} className="btn btn-ghost gallery-btn" title="View all works">
            <span className="btn-icon icon-works" />
            PAST WORKS
          </button>
          {isAdmin && (
            <button onClick={() => navigateTo('dashboard')} className="btn btn-ghost gallery-btn" title="Operations Dashboard">
              <BarChart3 className="w-4 h-4" />
              DASHBOARD
            </button>
          )}
          <div className="auth-user">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name || ''} className="auth-avatar" />
            ) : (
              <User className="auth-avatar-icon" />
            )}
            <span className="auth-name">{user?.name || user?.email}</span>
          </div>
        </div>
      </header>

      {/* MAIN FORGE AREA - Single column vertical flow */}
      <main className="forge-main">

        {/* INPUT BLOCK */}
        <div className="forge-block forge-input-block">
          {/* REFINE PANEL - Always visible at top */}
          <motion.div 
            className="refine-panel" 
            ref={refineRef}
            animate={{
              background: editImage 
                ? 'linear-gradient(135deg, #e64a19 0%, #ff5722 50%, #ff6d00 100%)'
                : 'linear-gradient(135deg, #b0aca8 0%, #c8c4c0 50%, #d0ccc8 100%)',
              boxShadow: editImage
                ? refineGlow
                  ? 'inset 2px 2px 4px rgba(0,0,0,0.2), inset -1px -1px 2px rgba(255,200,100,0.4), 0 0 20px rgba(255,87,34,0.5), 0 0 40px rgba(255,87,34,0.3)'
                  : 'inset 2px 2px 4px rgba(0,0,0,0.2), inset -1px -1px 2px rgba(255,200,100,0.4), 0 2px 4px rgba(0,0,0,0.1)'
                : 'inset 2px 2px 4px rgba(0,0,0,0.15), inset -1px -1px 2px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.1)'
            }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            <Panel>
              <PanelHeader className="collapsible" onClick={() => setRefineExpanded(!refineExpanded)}>
                <span className="panel-icon icon-refinement" />
                Refine <span className="header-subtitle">{editImage ? 'image selected' : 'edit an image'}</span>
                <div className="header-right">
                  <motion.div 
                    animate={{ rotate: refineExpanded ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </motion.div>
                  <span className={`led ${editImage ? 'on' : ''}`} />
                </div>
              </PanelHeader>
              <AnimatePresence initial={false}>
                {refineExpanded && (
                  <motion.div
                    key="refine-content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                <PanelBody>
                  {/* Show selected image preview at top if exists */}
                  {editImage && (
                    <div className="edit-image-preview" style={{ marginBottom: 12 }}>
                      <div className="edit-image-preview-inner">
                        <img src={editImage.url} alt="Image to refine" />
                        <button 
                          onClick={() => setEditImage(null)} 
                          className="edit-image-remove"
                          title="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="btn-group refine-tabs">
                    <button 
                      className={`btn ${refineSource === 'drop' ? 'btn-accent' : 'btn-dark'}`}
                      onClick={() => setRefineSource('drop')}
                    >
                      <span className="btn-icon icon-drop" />
                      Drop
                    </button>
                    <button 
                      className={`btn ${refineSource === 'items' ? 'btn-accent' : 'btn-dark'}`}
                      onClick={() => setRefineSource('items')}
                    >
                      <span className="btn-icon icon-items" />
                      Items
                    </button>
                    <button 
                      className={`btn ${refineSource === 'history' ? 'btn-accent' : 'btn-dark'}`}
                      onClick={() => setRefineSource('history')}
                    >
                      <span className="btn-icon icon-works" />
                      Works
                    </button>
                    <button 
                      className={`btn ${refineSource === 'favorites' ? 'btn-accent' : 'btn-dark'}`}
                      onClick={() => setRefineSource('favorites')}
                    >
                      <span className="btn-icon icon-star" />
                      Favorites
                    </button>
                  </div>
                  <div className="refine-content">
                    {refineSource === 'drop' && (
                      <div 
                        className={`edit-dropzone ${isDraggingRefine ? 'dragging' : ''} ${activeDropTarget === 'refine' ? 'active' : ''}`}
                        onClick={() => setActiveDropTarget('refine')}
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingRefine(true) }}
                        onDragLeave={() => setIsDraggingRefine(false)}
                        onDrop={handleRefineDrop}
                      >
                        DROP OR PASTE IMAGE
                      </div>
                    )}
                    {refineSource === 'items' && (
                      <HighriseSearch 
                        singleSelect
                        onSingleSelect={(item) => { 
                          // Use crisp URL for higher quality if available, otherwise regular imageUrl
                          const url = item.apImageUrlCrisp || item.imageUrl
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                        }} 
                        bridgeConnected={bridgeConnected}
                        useAPBridge={inAPContext}
                      />
                    )}
                    {refineSource === 'history' && (
                      <HistoryGrid 
                        singleSelect
                        onSingleSelect={(gen) => { 
                          const url = `${API_URL}${gen.imageUrls[0]}`
                          setEditImage({ 
                            url,
                            thumbnail: gen.thumbnailUrl ? `${API_URL}${gen.thumbnailUrl}` : undefined
                          })
                          detectAndSetAspectRatio(url)
                        }}
                        isActive={refineExpanded}
                        onUseAlloy={addAlloyReferences}
                      />
                    )}
                    {refineSource === 'favorites' && (
                      <Favorites 
                        authenticated={authenticated}
                        onLogin={login}
                        singleSelect
                        onSingleSelect={(fav) => { 
                          // For items with valid dispId, construct crisp URL for best quality
                          // Skip if itemId looks like MongoDB ObjectId (24 hex chars) - use fallback
                          let url = fav.item_data.imageUrl
                          const itemId = fav.item_data.itemId
                          const isMongoId = itemId && /^[a-f0-9]{24}$/i.test(itemId)
                          
                          if (fav.type === 'item' && itemId && !isMongoId) {
                            const dispId = itemId
                            // Clothing categories support crisp
                            const isClothing = ['shirt', 'pants', 'shorts', 'skirt', 'dress', 'jacket', 'fullsuit',
                              'hat', 'shoes', 'glasses', 'bag', 'handbag', 'necklace', 'earrings',
                              'gloves', 'watch', 'sock'].includes(fav.item_data.category || '')
                            if (isClothing) {
                              url = `https://production-ap.highrise.game/avataritem/front/${dispId}.png?crisp=1`
                            } else if (!dispId.startsWith('cn-') && !dispId.startsWith('bg-')) {
                              url = `https://production-ap.highrise.game/avataritem/front/${dispId}.png`
                            }
                          }
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                        }}
                        isActive={refineSource === 'favorites'}
                      />
                    )}
                  </div>
                </PanelBody>
                  </motion.div>
                )}
              </AnimatePresence>
            </Panel>
          </motion.div>

          {/* CRUCIBLE - References panel with hot border when forging */}
          <motion.div 
            ref={crucibleRef}
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
              <LCDFireGrid active={isGenerating} cols={70} rows={3} dotSize={4} gap={1} spreadDirection="center" />
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
              <PanelHeader className="collapsible" onClick={() => setAlloyExpanded(!alloyExpanded)}>
                <span className="panel-icon icon-alloy" />
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
              <AnimatePresence initial={false}>
                {alloyExpanded && (
                  <motion.div
                    key="alloy-content"
                    className="alloy-content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
              <PanelBody>
                {/* Reference source tabs */}
                <div className="btn-group ref-tabs">
                  <button 
                    className={`btn ${refSource === 'drop' && !refSourceCollapsed ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => {
                      setRefSource('drop')
                      setRefSourceCollapsed(false)
                    }}
                  >
                    <span className="btn-icon icon-drop" />
                    Drop
                  </button>
                  <button 
                    className={`btn ${refSource === 'items' && !refSourceCollapsed ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => {
                      setRefSource('items')
                      setRefSourceCollapsed(false)
                    }}
                  >
                    <span className="btn-icon icon-items" />
                    Items
                  </button>
                  <button 
                    className={`btn ${refSource === 'history' && !refSourceCollapsed ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => {
                      setRefSource('history')
                      setRefSourceCollapsed(false)
                    }}
                  >
                    <span className="btn-icon icon-works" />
                    Works
                  </button>
                  <button 
                    className={`btn ${refSource === 'favorites' && !refSourceCollapsed ? 'btn-accent' : 'btn-dark'}`}
                    onClick={() => {
                      if (refSource === 'favorites' && !refSourceCollapsed) {
                        // Already on Favorites - trigger reset (back to root)
                        setFavoritesResetKey(k => k + 1)
                      } else {
                        setRefSource('favorites')
                        setRefSourceCollapsed(false)
                      }
                    }}
                  >
                    <span className="btn-icon icon-star" />
                    Favorites
                  </button>
                </div>

                {/* Reference content - all tabs stay mounted for smooth transitions */}
                <AnimatePresence initial={false}>
                  {!refSourceCollapsed && (
                    <motion.div
                      key="ref-content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      style={{ overflow: 'hidden' }}
                    >
                      {/* Tab content with layout animation for smooth height changes */}
                      <motion.div layout transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}>
                        <AnimatePresence mode="wait" initial={false}>
                          {refSource === 'drop' && (
                            <motion.div
                              key="drop"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.12 }}
                            >
                            <div 
                              className={`dropzone dropzone-refs ${isDragging ? 'dragging' : ''} ${activeDropTarget === 'refs' ? 'active' : ''}`}
                              onClick={() => setActiveDropTarget('refs')}
                              onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                            >
                              <span className="dropzone-text">
                                DROP OR PASTE IMAGES
                              </span>
                            </div>
                          </motion.div>
                        )}
                          {refSource === 'items' && (
                            <motion.div
                              key="items"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.12 }}
                            >
                            <HighriseSearch
                              references={references}
                              onAddReference={addReference}
                              onRemoveReference={removeReference}
                              maxRefs={14}
                              disabled={isGenerating}
                              bridgeConnected={bridgeConnected}
                              useAPBridge={inAPContext}
                            />
                          </motion.div>
                        )}
                          {refSource === 'history' && (
                            <motion.div
                              key="history"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.12 }}
                            >
                              <HistoryGrid
                              authenticated={authenticated}
                              onLogin={login}
                              references={references}
                              onAddReference={addReference}
                              onRemoveReference={removeReference}
                              maxRefs={14}
                              disabled={isGenerating}
                              isActive={refSource === 'history'}
                              onReplay={handleReplay}
                              onRefine={(url) => {
                                setEditImage({ url })
                                detectAndSetAspectRatio(url)
                                setRefineExpanded(true) // Expand to show the image was added
                                setTimeout(scrollToRefine, 100)
                              }}
                              onUseAlloy={addAlloyReferences}
                            />
                          </motion.div>
                        )}
                          {refSource === 'favorites' && (
                            <motion.div
                              key="favorites"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.12 }}
                            >
                              <Favorites
                                authenticated={authenticated}
                                onLogin={login}
                                references={references}
                                onAddReference={addReference}
                                onRemoveReference={removeReference}
                                maxRefs={14}
                                disabled={isGenerating}
                                isActive={refSource === 'favorites'}
                                resetKey={favoritesResetKey}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </PanelBody>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Always visible: Selected references - outside collapsible area */}
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
            </Panel>
          </motion.div>

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
              <PanelHeader>
                <span className="panel-icon icon-output" />
                Output
                <div className="header-right">
                  <button 
                    className="header-btn"
                    onClick={cycleOutputCount}
                    title={`Generate ${outputCount === 1 ? '2' : outputCount === 2 ? '4' : '1'} images`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className={`led ${isGenerating || isLoadingImages ? 'on' : validImages.length > 0 && loadedImages.size > 0 ? 'success' : ''}`} />
                </div>
              </PanelHeader>
            <PanelBody>
              <motion.div 
                ref={outputRef}
                className="output-container"
                layout="position"
              >
                <AnimatePresence mode="popLayout">
                  {isGenerating || isLoadingImages ? (
                    <motion.div 
                      key="forging"
                      className={`output-preview output-preview-${outputCount}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {[...Array(outputCount)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="output-preview-slot"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{
                            opacity: [0.4, 0.8, 0.4],
                            scale: 1,
                          }}
                          transition={{
                            opacity: {
                              duration: 1.5,
                              delay: i * (1.5 / outputCount),
                              repeat: Infinity,
                              ease: 'easeInOut'
                            },
                            scale: { duration: 0.2, delay: i * 0.05 }
                          }}
                        />
                      ))}
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
                          onClick={() => setOutputLightbox({
                            imageUrl: url,
                            prompt,
                            mode: editImage ? 'edit' : 'create',
                            resolution,
                            aspectRatio,
                            references: references.map(r => ({ url: r.url, name: r.name })),
                          })}
                        >
                          <img 
                            src={url}
                            alt={`Output ${i + 1}`}
                            className="output-image"
                          />
                          <div className="output-expand-center" title="View full size">
                            <Maximize2 className="w-5 h-5" />
                          </div>
                          <div className="output-actions" onClick={(e) => e.stopPropagation()}>
                            <button 
                              className="output-action-btn"
                              onClick={() => {
                                setEditImage({ url })
                                detectAndSetAspectRatio(url)
                                setRefineExpanded(true) // Expand to show the image was added
                                setTimeout(scrollToRefine, 100)
                              }}
                              title="Refine this image"
                            >
                              <span className="btn-icon icon-refinement" style={{ width: 16, height: 16 }} />
                            </button>
                            <button 
                              className="output-action-btn"
                              onClick={() => downloadOutputImage(url)}
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <motion.div 
                      key={`empty-${outputCount}`}
                      className={`output-preview output-preview-${outputCount}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {[...Array(outputCount)].map((_, i) => (
                        <motion.div 
                          key={i} 
                          className="output-preview-slot"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2, delay: i * 0.05 }}
                        />
                      ))}
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

      {/* FLOATING PROMPT - Sticky at bottom */}
      <div className="floating-prompt-container">
        <div className="floating-prompt-inner">
          {/* LCD status display - interactive with fire grids inside */}
          <div className="lcd-screen lcd-floating lcd-interactive">
            <LCDFireGrid active={isGenerating} cols={16} rows={3} dotSize={4} gap={1} className="lcd-fire-left" spreadDirection="left" />
            <span className="lcd-spec-item lcd-pro lit">
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
              <button 
                key={ratio} 
                className={`lcd-spec-item ${aspectRatio === ratio ? 'lit' : ''}`}
                onClick={() => !isGenerating && setAspectRatio(ratio)}
                disabled={isGenerating}
              >
                <svg className="lcd-ratio-icon" viewBox="0 0 16 16" width="14" height="14">
                  <rect x={(16-w)/2} y={(16-h)/2} width={w} height={h} fill="currentColor" rx="1" />
                </svg>
                {ratio}
              </button>
            ))}
            <span className="lcd-spec-sep">│</span>
            {[
              { res: '1K', cls: 'lcd-1k' },
              { res: '2K', cls: 'lcd-2k' },
              { res: '4K', cls: 'lcd-4k' },
            ].map(({ res, cls }) => (
              <button 
                key={res} 
                className={`lcd-spec-item ${cls} ${resolution === res ? 'lit' : ''}`}
                onClick={() => !isGenerating && setResolution(res)}
                disabled={isGenerating}
              >
                {res}
              </button>
            ))}
            <span className="lcd-spec-sep">│</span>
            <button 
              className="lcd-spec-item lcd-output-count"
              onClick={cycleOutputCount}
              disabled={isGenerating}
            >
              <span className="lcd-grid-icon">
                <span className={`lcd-grid-cell ${outputCount >= 1 ? 'lit' : ''}`} />
                <span className={`lcd-grid-cell ${outputCount >= 2 ? 'lit' : ''}`} />
                <span className={`lcd-grid-cell ${outputCount >= 4 ? 'lit' : ''}`} />
                <span className={`lcd-grid-cell ${outputCount >= 4 ? 'lit' : ''}`} />
              </span>
            </button>
            <LCDFireGrid active={isGenerating} cols={16} rows={3} dotSize={4} gap={1} className="lcd-fire-right" spreadDirection="right" />
          </div>
          
          {/* Main input row */}
          <div className="floating-prompt-row">
            {/* Prompt input */}
            <div className="floating-prompt-input-wrapper">
              <span className={`led ${!prompt.trim() && !isGenerating ? 'blink' : prompt.trim() ? 'on' : ''}`} />
              <Textarea
                ref={promptRef}
                className={`floating-prompt-input ${promptHot ? 'prompt-hot' : ''}`}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Describe what you want to create..."
                rows={1}
                disabled={isGenerating}
              />
            </div>
            
            {/* Forge button */}
            <Button
              variant={canGenerate || isGenerating ? 'accent' : 'dark'}
              onClick={isGenerating ? handleCancel : !canGenerate && !prompt.trim() ? scrollToPrompt : handleGenerate}
              disabled={!isGenerating && !canGenerate && prompt.trim() !== ''}
              className="floating-forge-btn"
            >
              {isGenerating ? 'Cancel' : 'Forge'}
            </Button>
          </div>
        </div>
      </div>

      {/* Output Lightbox */}
      <Lightbox
        data={outputLightbox}
        onClose={() => setOutputLightbox(null)}
        onDownload={downloadOutputImage}
        onRefine={(url) => {
          setEditImage({ url })
          detectAndSetAspectRatio(url)
          setRefineExpanded(true)
          setOutputLightbox(null)
          setTimeout(scrollToRefine, 100)
        }}
        onFavorite={toggleOutputFavorite}
        isFavorited={outputLightbox ? starredOutputUrls.has(outputLightbox.imageUrl) : false}
      />

      {/* Works Gallery Lightbox */}
      <AnimatePresence>
        {galleryOpen && (
          <motion.div 
            className="gallery-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setGalleryOpen(false)}
          >
            {/* Expanded single image view */}
            <AnimatePresence>
              {galleryExpanded && (
                <motion.div 
                  className="gallery-expanded-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={(e) => {
                    e.stopPropagation() // Don't close the gallery, just the lightbox
                    setGalleryExpanded(null)
                  }}
                >
                  <motion.div 
                    className="lightbox-content"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="lightbox-scroll-area">
                      <div className="lightbox-image-container">
                        <img src={galleryExpanded.url} alt="Full size" />
                      </div>
                      {/* Specs bar */}
                      <div className="lightbox-specs">
                        <span className="lightbox-spec" title={galleryExpanded.mode === 'edit' ? 'Refined' : 'Created'}>
                          {galleryExpanded.mode === 'edit' ? <Hammer className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                        </span>
                        <span className="lightbox-spec-sep">·</span>
                        <span className="lightbox-spec" title="Pro">
                          <Gem className="w-4 h-4" />
                          Pro
                        </span>
                        <span className="lightbox-spec-sep">·</span>
                        {galleryExpanded.aspectRatio && (
                          <>
                            <span className="lightbox-spec" title={`Ratio ${galleryExpanded.aspectRatio}`}>
                              <svg className="lightbox-ratio-icon" viewBox="0 0 14 14" width="14" height="14">
                                <rect 
                                  x={(14 - getAspectDimensions(galleryExpanded.aspectRatio).w) / 2} 
                                  y={(14 - getAspectDimensions(galleryExpanded.aspectRatio).h) / 2} 
                                  width={getAspectDimensions(galleryExpanded.aspectRatio).w} 
                                  height={getAspectDimensions(galleryExpanded.aspectRatio).h} 
                                  fill="currentColor" 
                                  rx="1" 
                                />
                              </svg>
                              {galleryExpanded.aspectRatio}
                            </span>
                            <span className="lightbox-spec-sep">·</span>
                          </>
                        )}
                        <span className="lightbox-spec" title={`Resolution ${galleryExpanded.resolution || '1K'}`}>
                          {galleryExpanded.resolution || '1K'}
                        </span>
                      </div>
                      
                      {/* Alloy section - show references used */}
                      {galleryExpanded.settings?.styleImages && galleryExpanded.settings.styleImages.length > 0 && (
                        <div className="lightbox-alloy">
                          <div className="lightbox-alloy-header">
                            <span className="panel-icon icon-alloy" />
                            <span className="lightbox-alloy-title">Alloy</span>
                            <span className="lightbox-alloy-count">{galleryExpanded.settings.styleImages.length}</span>
                            <button
                              className="lightbox-alloy-use"
                              onClick={() => {
                                // Convert styleImages to Reference format and add
                                const refs = galleryExpanded.settings!.styleImages!.map((img, i) => ({
                                  id: `alloy-gallery-${i}-${Date.now()}`,
                                  url: img.url.startsWith('http') || img.url.startsWith('data:') || img.url.startsWith('/') 
                                    ? img.url 
                                    : `${API_URL}${img.url}`,
                                  name: img.name || `Ref ${i + 1}`,
                                  type: 'generation' as const,
                                }))
                                addAlloyReferences(refs)
                                setGalleryExpanded(null)
                                setGalleryOpen(false)
                              }}
                              title="Add these references to your alloy"
                            >
                              <Plus className="w-3 h-3" />
                              Use
                            </button>
                          </div>
                          <div className="lightbox-alloy-grid">
                            {galleryExpanded.settings.styleImages.map((img, i) => {
                              const imgUrl = img.url.startsWith('http') || img.url.startsWith('data:') 
                                ? img.url 
                                : `${API_URL}${img.url}`
                              return (
                                <div key={i} className="lightbox-alloy-thumb" title={img.name || `Reference ${i + 1}`}>
                                  <img src={imgUrl} alt={img.name || `Reference ${i + 1}`} />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      
                      <div className="lightbox-footer">
                        <p className="lightbox-prompt">{galleryExpanded.prompt}</p>
                        <div className="lightbox-actions">
                          <button 
                            className="lightbox-btn"
                            onClick={() => {
                              // Replay - restore all settings
                              handleReplay({
                                prompt: galleryExpanded.prompt,
                                mode: galleryExpanded.mode,
                                model: galleryExpanded.model,
                                resolution: galleryExpanded.resolution,
                                aspectRatio: galleryExpanded.aspectRatio,
                                references: galleryExpanded.settings?.styleImages,
                              })
                              setGalleryExpanded(null)
                              setGalleryOpen(false)
                            }}
                            title="Replay settings"
                          >
                            <RotateCcw className="w-5 h-5" />
                          </button>
                          <button 
                            className="lightbox-btn"
                            onClick={() => {
                              setEditImage({ url: galleryExpanded.url })
                              detectAndSetAspectRatio(galleryExpanded.url)
                              setRefineExpanded(true) // Expand to show the image was added
                              setGalleryOpen(false)
                              setGalleryExpanded(null)
                              setTimeout(scrollToRefine, 100)
                            }}
                            title="Refine this image"
                          >
                            <span className="btn-icon icon-refinement" style={{ width: 20, height: 20 }} />
                          </button>
                          <button 
                            className="lightbox-btn"
                            onClick={() => downloadOutputImage(galleryExpanded.url)}
                            title="Download"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Gallery grid - stays mounted to preserve scroll position */}
            <motion.div 
              className="gallery-container"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ 
                scale: 1, 
                opacity: galleryExpanded ? 0 : 1,
                pointerEvents: galleryExpanded ? 'none' : 'auto'
              }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              style={{ visibility: galleryExpanded ? 'hidden' : 'visible' }}
            >
                <div className="gallery-header">
                  <div className="gallery-header-top">
                    <h2><span className="btn-icon icon-works" /> Past Works</h2>
                    <button className="gallery-close" onClick={() => setGalleryOpen(false)}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="gallery-search">
                    <Search className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search by prompt..."
                      value={gallerySearch}
                      onChange={e => setGallerySearch(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
                <div className="gallery-content">
                  {galleryLoading ? (
                    <div className="gallery-loading">Loading your works...</div>
                  ) : galleryImages.length === 0 ? (
                    <div className="gallery-empty">No works yet. Start creating!</div>
                  ) : filteredGalleryImages.length === 0 ? (
                    <div className="gallery-empty">No works match your search</div>
                  ) : (
                    <div className="gallery-grid">
                      {filteredGalleryImages.map((img) => (
                        <div
                          key={img.id}
                          className="gallery-item"
                          onClick={() => setGalleryExpanded(img)}
                        >
                          {!galleryLoadedImages.has(img.id) && (
                            <div className="gallery-item-skeleton" />
                          )}
                          <img 
                            src={img.thumbUrl} 
                            alt={img.prompt} 
                            loading="lazy"
                            className={galleryLoadedImages.has(img.id) ? 'loaded' : ''}
                            onLoad={() => handleGalleryImageLoad(img.id)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
