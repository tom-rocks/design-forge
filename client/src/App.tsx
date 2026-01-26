import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { LogIn, Plus, X, Search, ImageOff, Trash2, Star, Download, RotateCcw, Flame, Hammer, Gem } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from './config'
import { useAuth } from './hooks/useAuth'
import { checkAPContext, waitForAP } from './lib/ap-bridge'
import { 
  Button, 
  Textarea,
  LCDFireGrid,
  HighriseSearch,
  HistoryGrid,
  Favorites,
  Lightbox,
  AlloyModal,
  WorksSidebar,
  ImageCanvas,
  type ReplayConfig,
  type LightboxData
} from './components'
import { Dashboard } from './Dashboard'

// Helper to get aspect ratio icon dimensions
const getAspectDimensions = (ratio: string) => {
  switch (ratio) {
    case '1:1': return { w: 10, h: 10 }
    case '3:4': return { w: 9, h: 12 }
    case '4:3': return { w: 12, h: 9 }
    case '9:16': return { w: 7, h: 12 }
    case '16:9': return { w: 12, h: 7 }
    default: return { w: 10, h: 10 }
  }
}

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
  
  // Admin users who can access the dashboard (via /dashboard URL)
  const ADMIN_IDS = ['113838337580596527498'] // Add your Google user ID here
  const isAdmin = user?.id && ADMIN_IDS.includes(user.id)
  void isAdmin // Suppress unused warning - admin status checked for dashboard access
  
  // State
  const [prompt, setPrompt] = useState('')
  const [references, setReferences] = useState<Reference[]>([])
  const [editImage, setEditImage] = useState<{ url: string; thumbnail?: string } | null>(null)
  const [editImageError, setEditImageError] = useState(false)
  const [refineGlow, setRefineGlow] = useState(false) // Temporary glow when image added
  const [refineExpanded, setRefineExpanded] = useState(false) // Whether refine picker is open
  void refineGlow // Suppress unused warning - effect still sets this
  void refineExpanded // Suppress unused warning - still set by callbacks
  const [isGenerating, setIsGenerating] = useState(false)
  const [viewingPastWork, setViewingPastWork] = useState(false) // True when viewing past work during generation
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDraggingRefine, setIsDraggingRefine] = useState(false)
  const [activeDropTarget, setActiveDropTarget] = useState<'refine' | 'refs' | null>(null) // Which dropzone receives paste
  void setActiveDropTarget // Suppress unused warning - paste handler still uses activeDropTarget
  const [favoritesResetKey, _setFavoritesResetKey] = useState(0)
  const [refineSource, setRefineSource] = useState<RefSource>('drop')
  
  // Forge specs state
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [resolution, setResolution] = useState<string>('2K')
  const [outputCount, setOutputCount] = useState<1 | 2 | 4>(1)
  
  // Alloy modal state
  const [alloyModalOpen, setAlloyModalOpen] = useState(false)
  
  // Works sidebar state
  const [generationTrigger, setGenerationTrigger] = useState(0)
  const [pendingGenerations, setPendingGenerations] = useState<Array<{
    id: string
    prompt: string
    outputCount: number
  }>>([])
  
  
  // Track image loading states
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  
  // Pipe fill state (0-1)
  const [_pipeFill, setPipeFill] = useState(0)
  // Output frame hot state (delayed after pipe fills)
  const [outputHot, setOutputHot] = useState(false)
  void outputHot // Suppress unused warning - animation effect still sets this
  
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
  
  // Open works gallery (kept for potential future use)
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
  void openGallery // Suppress unused warning - gallery still rendered, just no UI trigger currently
  
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
  
  // Delete gallery image
  const deleteGalleryImage = useCallback(async (img: GalleryImage, e: React.MouseEvent) => {
    e.stopPropagation()
    
    if (!confirm(`Delete this generation?\n\n"${img.prompt?.slice(0, 50)}..."`)) {
      return
    }
    
    try {
      const res = await fetch(`${API_URL}/api/generations/${img.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      
      if (res.ok) {
        setGalleryImages(prev => prev.filter(g => g.id !== img.id))
        if (galleryExpanded?.id === img.id) {
          setGalleryExpanded(null)
        }
      }
    } catch (err) {
      console.error('[Gallery] Error deleting:', err)
    }
  }, [galleryExpanded])
  
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
  // Also reset error state when editImage changes
  useEffect(() => {
    if (editImage) {
      setEditImageError(false) // Reset error when new image is selected
      setRefineGlow(true)
      const timer = setTimeout(() => setRefineGlow(false), 3000)
      return () => clearTimeout(timer)
    } else {
      setRefineGlow(false)
      setEditImageError(false)
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
  const [introPlayed, setIntroPlayed] = useState(false)
  
  // Intro animation - type out placeholder text on first load
  useEffect(() => {
    if (introPlayed || prompt) return // Only play once, skip if user already typed
    
    const introText = "Describe what you want to create..."
    let charIndex = 0
    
    // Delay before starting animation
    const startTimer = setTimeout(() => {
      setPromptHot(true)
      
      const typeInterval = setInterval(() => {
        if (charIndex < introText.length) {
          setPrompt(introText.slice(0, charIndex + 1))
          charIndex++
        } else {
          clearInterval(typeInterval)
          // Cool down and clear after transition completes
          setTimeout(() => {
            setPromptHot(false)
            // Wait for full 2s color/glow transition to complete
            setTimeout(() => {
              setPrompt('')
              setIntroPlayed(true)
            }, 2100)
          }, 300)
        }
      }, 45)
      
      return () => clearInterval(typeInterval)
    }, 500)
    
    return () => clearTimeout(startTimer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Replay a previous generation's settings with visual feedback
  const handleReplay = useCallback((config: ReplayConfig) => {
    // Close alloy modal if open
    setAlloyModalOpen(false)
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
    if (!canGenerate) return
    
    // Create unique ID for this generation
    const genId = `pending-${Date.now()}`
    
    // Create abort controller for this specific generation
    const abortController = new AbortController()
    const signal = abortController.signal
    
    // Store abort controller (use latest one as "current")
    abortControllerRef.current = abortController
    
    // Capture current values for this generation
    const genPrompt = prompt.trim()
    const genReferences = [...references]
    const genEditImage = editImage
    const genResolution = resolution
    const genAspectRatio = aspectRatio
    const genOutputCount = outputCount
    const genMode = genEditImage?.url ? 'edit' : 'create'
    
    // Add to pending generations
    setPendingGenerations(prev => [...prev, {
      id: genId,
      prompt: genPrompt,
      outputCount: genOutputCount
    }])
    
    // Only update UI state if this is the first/only generation
    if (!isGenerating) {
      setIsGenerating(true)
      setViewingPastWork(false)
      setError(null)
      setAlloyModalOpen(false)
      setResult(null)
      setLoadedImages(new Set())
      setFailedImages(new Set())
      setPipeFill(0)
      setOutputHot(false)
    }

    // Helper to remove this generation from pending
    const removePending = () => {
      setPendingGenerations(prev => prev.filter(g => g.id !== genId))
    }

    if (window.location.hostname === 'localhost') {
      await new Promise(resolve => setTimeout(resolve, 3000))
      if (signal.aborted) {
        removePending()
        return
      }
      setResult({
        imageUrl: 'https://picsum.photos/512/512',
        imageUrls: [`https://picsum.photos/512/512?r=${genId}-1`, `https://picsum.photos/512/512?r=${genId}-2`],
        prompt: genPrompt
      })
      removePending()
      // Only clear isGenerating if no more pending
      setPendingGenerations(prev => {
        if (prev.filter(g => g.id !== genId).length === 0) {
          setIsGenerating(false)
          setViewingPastWork(false)
        }
        return prev.filter(g => g.id !== genId)
      })
      return
    }

    try {
      console.log('[Generate] Sending request:', { 
        genId,
        mode: genMode, 
        numImages: genOutputCount, 
        model: 'pro', 
        aspectRatio: genAspectRatio,
        hasEditImage: !!genEditImage?.url 
      })
      
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: genPrompt,
          model: 'pro',
          resolution: genResolution,
          aspectRatio: genAspectRatio,
          styleImages: genReferences.map(r => ({ url: r.url, strength: 1 })),
          mode: genMode,
          numImages: genOutputCount,
          ...(genMode === 'edit' && genEditImage?.url ? { editImage: genEditImage.url } : {}),
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
              setResult({ imageUrl: data.imageUrl, imageUrls: data.imageUrls, prompt: genPrompt })
              setViewingPastWork(false)
              removePending()
              setGenerationTrigger(prev => prev + 1)
              // Check if more pending after removing this one
              setPendingGenerations(prev => {
                const remaining = prev.filter(g => g.id !== genId)
                if (remaining.length === 0) {
                  setIsGenerating(false)
                }
                return remaining
              })
              return
            } else if (currentEvent === 'error') {
              throw new Error(data.error)
            }
            currentEvent = ''
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        removePending()
        return
      }
      setError(err instanceof Error ? err.message : 'Error')
      removePending()
    } finally {
      // Check if this was the last generation
      setPendingGenerations(prev => {
        if (prev.length <= 1) {
          setIsGenerating(false)
        }
        return prev
      })
    }
  }, [prompt, references, editImage, canGenerate, isGenerating, resolution, aspectRatio, outputCount])

  // Cancel all pending generations (currently unused, may add cancel button later)
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsGenerating(false)
      setPendingGenerations([])
      setPipeFill(0)
      setOutputHot(false)
    }
  }, [])
  void handleCancel // Suppress unused warning

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
  // Adds refs one at a time with animation
  const addAlloyReferences = useCallback((refs: Reference[]) => {
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
    // Check if user is authenticated first
    if (!authenticated) {
      setError('Please sign in to save favorites')
      setTimeout(() => setError(null), 3000)
      return
    }
    
    const isCurrentlyStarred = starredOutputUrls.has(imageUrl)
    
    // Optimistic update - update UI immediately
    if (isCurrentlyStarred) {
      setStarredOutputUrls(prev => {
        const next = new Set(prev)
        next.delete(imageUrl)
        return next
      })
      // Note: To properly remove, we'd need to find the favorite by URL and delete it
      // For now, just update local state - user can unfavorite from Favorites tab
    } else {
      // Add to UI immediately (optimistic)
      setStarredOutputUrls(prev => new Set(prev).add(imageUrl))
      
      // Then persist to server
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
        
        if (!res.ok) {
          // Revert on failure
          setStarredOutputUrls(prev => {
            const next = new Set(prev)
            next.delete(imageUrl)
            return next
          })
          if (res.status === 401) {
            setError('Session expired - please refresh the page')
            setTimeout(() => setError(null), 5000)
          }
        }
      } catch (e) {
        console.error('Failed to add favorite:', e)
        // Revert on failure
        setStarredOutputUrls(prev => {
          const next = new Set(prev)
          next.delete(imageUrl)
          return next
        })
      }
    }
  }, [authenticated, starredOutputUrls, prompt])

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
      {/* WORKS SIDEBAR - Left side works list */}
      <WorksSidebar
        authenticated={authenticated}
        onSelectImage={(imageUrl, generation) => {
          // Show in canvas as if just generated
          setResult({
            imageUrl: imageUrl,
            imageUrls: generation.imageUrls.map(url => `${API_URL}${url}`),
            prompt: generation.prompt
          })
          setEditImage(null) // Clear refine mode
          setViewingPastWork(true) // Allow viewing even during generation
          setPrompt(generation.prompt || '')
          
          // Set resolution and aspect ratio
          if (generation.resolution) setResolution(generation.resolution)
          if (generation.aspect_ratio) setAspectRatio(generation.aspect_ratio)
          
          // Load alloy references from settings
          if (generation.settings?.styleImages?.length) {
            const refs = generation.settings.styleImages.map((img, i) => ({
              id: `sidebar-ref-${generation.id}-${i}-${Date.now()}`,
              url: img.url.startsWith('http') || img.url.startsWith('data:') || img.url.startsWith('/') 
                ? img.url 
                : `${API_URL}${img.url}`,
              name: img.name || `Ref ${i + 1}`,
              type: 'generation' as const,
            }))
            setReferences(refs)
          } else {
            setReferences([])
          }
          
          // Reset image loading state
          setLoadedImages(new Set())
          setFailedImages(new Set())
        }}
        onOpenWorksModal={openGallery}
        newGenerationTrigger={generationTrigger}
        pendingGenerations={pendingGenerations}
      />

      {/* MAIN CANVAS - Clean, centered workspace */}
      <main 
        className={`forge-canvas ${isDraggingRefine ? 'dragging' : ''}`}
        ref={refineRef}
        onDragOver={(e) => { e.preventDefault(); setIsDraggingRefine(true) }}
        onDragLeave={(e) => { 
          // Only trigger if leaving the main area, not entering children
          if (e.currentTarget === e.target) setIsDraggingRefine(false) 
        }}
        onDrop={handleRefineDrop}
      >
        <AnimatePresence mode="wait">
          {/* GENERATING STATE - only during actual generation, not when viewing past works */}
          {isGenerating && !viewingPastWork ? (
            <motion.div 
              key="generating"
              className="canvas-generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`canvas-preview-grid preview-${outputCount}`}>
                {[...Array(outputCount)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="canvas-preview-slot"
                    animate={{
                      opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                      duration: 1.5,
                      delay: i * (1.5 / outputCount),
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                  />
                ))}
              </div>
              <p className="canvas-status">Forging...</p>
            </motion.div>
          ) : validImages.length > 0 ? (
            /* OUTPUT IMAGES - Zoomable Canvas */
            <motion.div 
              key="output"
              className="canvas-output"
              ref={outputRef}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              <ImageCanvas images={validImages} />
            </motion.div>
          ) : editImage ? (
            /* EDIT IMAGE SELECTED */
            <motion.div 
              key="edit-image"
              className="canvas-edit-image"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`canvas-edit-preview ${editImageError ? 'error' : ''}`}>
                {editImageError ? (
                  <div className="canvas-edit-error">
                    <ImageOff className="w-12 h-12" />
                    <span>Image unavailable</span>
                  </div>
                ) : (
                  <img 
                    src={editImage.url} 
                    alt="Image to refine" 
                    onError={() => setEditImageError(true)}
                  />
                )}
                <button 
                  onClick={() => setEditImage(null)} 
                  className="canvas-edit-remove"
                  title="Remove image"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="canvas-edit-label">{editImageError ? 'Image not found' : 'Refine Mode'}</p>
            </motion.div>
          ) : (
            /* EMPTY STATE - Source picker */
            <motion.div 
              key="empty"
              className="canvas-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Source tabs */}
              <div className="canvas-source-tabs">
                <button 
                  className={`canvas-tab ${refineSource === 'drop' ? 'active' : ''}`}
                  onClick={() => setRefineSource('drop')}
                >
                  <span className="btn-icon icon-drop" />
                  Drop
                </button>
                <button 
                  className={`canvas-tab ${refineSource === 'items' ? 'active' : ''}`}
                  onClick={() => setRefineSource('items')}
                >
                  <span className="btn-icon icon-items" />
                  Items
                </button>
                <button 
                  className={`canvas-tab ${refineSource === 'history' ? 'active' : ''}`}
                  onClick={() => setRefineSource('history')}
                >
                  <span className="btn-icon icon-works" />
                  Works
                </button>
                <button 
                  className={`canvas-tab ${refineSource === 'favorites' ? 'active' : ''}`}
                  onClick={() => setRefineSource('favorites')}
                >
                  <span className="btn-icon icon-star" />
                  Favorites
                </button>
              </div>

              {/* Source content */}
              <div className="canvas-source-content">
                <AnimatePresence mode="wait">
                  {refineSource === 'drop' && (
                    <motion.div
                      key="drop"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className={`canvas-dropzone ${isDraggingRefine ? 'dragging' : ''}`}
                    >
                      <div className="canvas-dropzone-inner">
                        <span className="canvas-dropzone-icon">
                          <span className="btn-icon icon-drop" style={{ width: 56, height: 56 }} />
                        </span>
                        <p className="canvas-dropzone-text">Drop or paste an image to refine</p>
                        <p className="canvas-dropzone-hint">Or just type a prompt below to create</p>
                      </div>
                    </motion.div>
                  )}
                  {refineSource === 'items' && (
                    <motion.div
                      key="items"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="canvas-source-panel"
                    >
                      <HighriseSearch 
                        singleSelect
                        onSingleSelect={(item) => { 
                          const url = item.displayUrl || item.imageUrl
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                        }} 
                        bridgeConnected={bridgeConnected}
                        useAPBridge={inAPContext}
                      />
                    </motion.div>
                  )}
                  {refineSource === 'history' && (
                    <motion.div
                      key="history"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="canvas-source-panel"
                    >
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
                        isActive={true}
                        onUseAlloy={addAlloyReferences}
                      />
                    </motion.div>
                  )}
                  {refineSource === 'favorites' && (
                    <motion.div
                      key="favorites"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className="canvas-source-panel"
                    >
                      <Favorites 
                        authenticated={authenticated}
                        onLogin={login}
                        singleSelect
                        onSingleSelect={(fav) => { 
                          let url = fav.item_data.imageUrl
                          const itemId = fav.item_data.itemId
                          const isMongoId = itemId && /^[a-f0-9]{24}$/i.test(itemId)
                          
                          if (fav.type === 'item' && itemId && !isMongoId) {
                            const dispId = itemId
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CANVAS CONTROLS BAR - Always visible when images exist */}
        {validImages.length > 0 && (
          <div className="image-canvas-controls">
            {/* Specs - same as lightbox */}
            <div className="lightbox-specs" style={{ margin: 0, padding: '6px 10px' }}>
              {/* Mode */}
              <span className="lightbox-spec" title={editImage ? 'Refined' : 'Created'}>
                {editImage ? <Hammer className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
              </span>
              <span className="lightbox-spec-sep">·</span>
              {/* Model */}
              <span className="lightbox-spec" title="Pro">
                <Gem className="w-4 h-4" />
                Pro
              </span>
              <span className="lightbox-spec-sep">·</span>
              {/* Aspect Ratio */}
              <span className="lightbox-spec" title={`Ratio ${aspectRatio}`}>
                <svg className="lightbox-ratio-icon" viewBox="0 0 14 14" width="14" height="14">
                  <rect 
                    x={(14 - getAspectDimensions(aspectRatio).w) / 2} 
                    y={(14 - getAspectDimensions(aspectRatio).h) / 2} 
                    width={getAspectDimensions(aspectRatio).w} 
                    height={getAspectDimensions(aspectRatio).h} 
                    fill="currentColor" 
                    rx="1" 
                  />
                </svg>
                {aspectRatio}
              </span>
              <span className="lightbox-spec-sep">·</span>
              {/* Resolution */}
              <span className="lightbox-spec" title={`Resolution ${resolution}`}>
                {resolution}
              </span>
            </div>
            
            {/* Separator */}
            <div className="canvas-controls-sep" />
            
            {/* Image actions */}
            <button 
              className={`canvas-control-btn ${starredOutputUrls.has(validImages[0]) ? 'active' : ''}`}
              onClick={() => toggleOutputFavorite(validImages[0])}
              title={starredOutputUrls.has(validImages[0]) ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className="w-4 h-4" />
            </button>
            <button 
              className="canvas-control-btn"
              onClick={() => {
                setEditImage({ url: validImages[0] })
                detectAndSetAspectRatio(validImages[0])
                setReferences([])
              }}
              title="Refine this image"
            >
              <span className="btn-icon icon-refinement" style={{ width: 16, height: 16 }} />
            </button>
            <button 
              className="canvas-control-btn"
              onClick={() => downloadOutputImage(validImages[0])}
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ERROR */}
        <AnimatePresence>
          {error && (
            <motion.div 
              className="canvas-error"
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
              <svg className="lcd-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M1 10l4-2h12l2 2v2l-2 1v1H7v-1l-2-1v-2H1zm6 6h10v2H7v-2z"/>
              </svg>
              V.1.21
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
          
          {/* Main input row with logo */}
          <div className="floating-prompt-row">
            {/* Logo on left */}
            <img src="/forge_logo.svg" alt="Design Forge" className="prompt-bar-logo" />
            
            {/* Prompt input with LED */}
            <div className="floating-prompt-input-wrapper">
              <Textarea
                ref={promptRef}
                className={`floating-prompt-input ${promptHot ? 'prompt-hot' : ''} ${isGenerating ? 'forging' : ''}`}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={introPlayed ? "Describe what you want to create..." : ""}
                rows={1}
                disabled={isGenerating}
              />
              <span className={`led prompt-led ${!prompt.trim() && !isGenerating ? 'blink' : prompt.trim() ? 'on' : ''}`} />
            </div>
            
            {/* Forge/Refine button - always allow queueing more generations */}
            <Button
              variant={canGenerate && introPlayed ? 'accent' : 'dark'}
              onClick={!canGenerate && !prompt.trim() ? scrollToPrompt : handleGenerate}
              disabled={!canGenerate && prompt.trim() !== ''}
              className="floating-forge-btn"
            >
              {editImage ? 'Refine' : 'Forge'}{isGenerating ? ` +${pendingGenerations.length}` : ''}
            </Button>
          </div>
          
          {/* Alloy row - shows selected references below prompt */}
          <div className="prompt-alloy-row">
            <div className="prompt-alloy-label">
              <span className="btn-icon icon-alloy" />
              <span className="prompt-alloy-title">Alloy</span>
              {references.length < 9 && (
                <span className="prompt-alloy-subtitle">image references</span>
              )}
            </div>
            <div className="prompt-alloy-thumbs">
              <AnimatePresence mode="popLayout">
                {references.map((ref) => (
                  <motion.div
                    key={ref.id}
                    className="prompt-alloy-thumb"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => removeReference(ref.id)}
                    title={ref.name || 'Click to remove'}
                  >
                    <img 
                      src={ref.url.startsWith('http') || ref.url.startsWith('data:') ? ref.url : `${API_URL}${ref.url}`} 
                      alt={ref.name || ''} 
                    />
                    <div className="prompt-alloy-thumb-remove">
                      <X className="w-4 h-4" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <button 
                className={`prompt-alloy-add ${references.length > 0 ? 'has-refs' : ''}`}
                onClick={() => setAlloyModalOpen(true)}
                disabled={isGenerating}
                title="Add style references"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alloy Modal */}
      <AlloyModal
        isOpen={alloyModalOpen}
        onClose={() => setAlloyModalOpen(false)}
        references={references}
        onAddReference={addReference}
        onRemoveReference={removeReference}
        onClearAll={() => setReferences([])}
        maxRefs={14}
        disabled={isGenerating}
        bridgeConnected={bridgeConnected}
        inAPContext={inAPContext}
        authenticated={authenticated}
        onLogin={login}
        onReplay={handleReplay}
        onRefine={(url) => {
          setEditImage({ url })
          detectAndSetAspectRatio(url)
          setReferences([]) // Clear alloy when refining
          setRefineExpanded(true)
          setAlloyModalOpen(false)
          setTimeout(scrollToRefine, 100)
        }}
        onUseAlloy={addAlloyReferences}
        favoritesResetKey={favoritesResetKey}
      />

      {/* Output Lightbox */}
      <Lightbox
        data={outputLightbox}
        onClose={() => setOutputLightbox(null)}
        onDownload={downloadOutputImage}
        onRefine={(url) => {
          setEditImage({ url })
          detectAndSetAspectRatio(url)
          setReferences([]) // Clear alloy when refining
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
            {/* Expanded single image view - uses shared Lightbox component with zoom */}
            <Lightbox
              data={galleryExpanded ? {
                imageUrl: galleryExpanded.url,
                prompt: galleryExpanded.prompt,
                mode: galleryExpanded.mode,
                resolution: galleryExpanded.resolution,
                aspectRatio: galleryExpanded.aspectRatio,
                references: galleryExpanded.settings?.styleImages?.map(img => ({
                  url: img.url.startsWith('http') || img.url.startsWith('data:') 
                    ? img.url 
                    : `${API_URL}${img.url}`,
                  name: img.name,
                })),
              } : null}
              onClose={() => setGalleryExpanded(null)}
              onDownload={downloadOutputImage}
              onRefine={(url) => {
                setEditImage({ url })
                detectAndSetAspectRatio(url)
                setReferences([]) // Clear alloy when refining
                setRefineExpanded(true)
                setGalleryOpen(false)
                setGalleryExpanded(null)
                setTimeout(scrollToRefine, 100)
              }}
              onReplay={() => {
                if (galleryExpanded) {
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
                }
              }}
              onUseAlloy={galleryExpanded?.settings?.styleImages ? () => {
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
              } : undefined}
            />

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
                          <button
                            className="gallery-item-delete"
                            onClick={(e) => deleteGalleryImage(img, e)}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
