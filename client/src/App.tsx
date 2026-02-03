import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { LogIn, Plus, X, Search, Trash2, Star, Download, Flame, Hammer, Gem, RotateCcw, Anvil, ArchiveRestore, Swords, Box, Boxes } from 'lucide-react'
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
  thumbnailUrl?: string // Small preview for UI display
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

interface GenerationResult {
  imageUrl: string
  imageUrls?: string[]
  prompt: string
  // Settings used for this generation (for display in floating bar and replay)
  mode?: 'create' | 'edit'
  aspectRatio?: string
  resolution?: string
  model?: string
  styleImages?: { url: string; name?: string }[]
  parentId?: string | null // For edit mode - the parent generation that was refined
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
  
  // Detect Windows and apply scaling class
  useEffect(() => {
    const isWindows = navigator.platform.toLowerCase().includes('win') || 
                      navigator.userAgent.toLowerCase().includes('windows')
    if (isWindows) {
      document.documentElement.classList.add('os-windows')
    }
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
  const [refineGlow, setRefineGlow] = useState(false) // Temporary glow when image added
  const [modeFlameActive, setModeFlameActive] = useState(false) // Brief flame animation when switching modes
  const [refineExpanded, setRefineExpanded] = useState(false) // Whether refine picker is open
  void refineGlow // Suppress unused warning - effect still sets this
  void refineExpanded // Suppress unused warning - still set by callbacks
  const [isGenerating, setIsGenerating] = useState(false)
  const [viewingPastWork, setViewingPastWork] = useState(false) // True when viewing past work during generation
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDraggingRefine, setIsDraggingRefine] = useState(false)
  const [isDraggingAlloy, setIsDraggingAlloy] = useState(false)
  const [activeDropTarget, setActiveDropTarget] = useState<'refine' | 'refs' | null>(null) // Which dropzone receives paste
  const [favoritesResetKey, _setFavoritesResetKey] = useState(0)
  const [refineSource, setRefineSource] = useState<RefSource>('drop')
  const [canvasMode, setCanvasMode] = useState<'forge' | 'refine'>('forge')
  
  // Forge specs state
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [resolution, setResolution] = useState<string>('2K')
  const [outputCount, setOutputCount] = useState<1 | 2 | 4>(1)
  void setOutputCount // Output count UI removed, keeping state for generation logic
  
  // Alloy modal state
  const [alloyModalOpen, setAlloyModalOpen] = useState(false)
  
  // Works sidebar state
  const [generationTrigger, setGenerationTrigger] = useState(0)
  const [pendingGenerations, setPendingGenerations] = useState<Array<{
    id: string
    prompt: string
    outputCount: number
    mode: 'create' | 'edit'
    references: Reference[]
    editImageUrl?: string
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
    id: string // Composite: {generationId}-{imageIndex}
    generationId: string // Actual generation UUID for API calls
    mode: 'create' | 'edit'
    model?: string
    resolution?: string
    aspectRatio?: string
    parentId?: string | null // For edit mode - the parent generation that was refined
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
  
  // Abort controllers for cancelling generations (keyed by generation ID)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  
  // Track which pending generation is selected (shows in canvas when complete)
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null)
  
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
              generationId: gen.id, // Store actual UUID for API calls
              mode: gen.mode || 'create',
              model: gen.model,
              resolution: gen.resolution,
              aspectRatio: gen.aspect_ratio,
              parentId: gen.parent_id,
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
      const res = await fetch(`${API_URL}/api/generations/${img.generationId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      
      if (res.ok) {
        // Remove ALL images from this generation (not just the one clicked)
        setGalleryImages(prev => prev.filter(g => g.generationId !== img.generationId))
        if (galleryExpanded?.generationId === img.generationId) {
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
  
  // Track previous mode to detect transitions
  const prevModeRef = useRef<'forge' | 'refine'>('forge')
  const isReplayingRef = useRef(false) // Skip intro animations during replay
  const [shouldPlayForgeIntro, setShouldPlayForgeIntro] = useState(false)
  const [shouldPlayRefineIntro, setShouldPlayRefineIntro] = useState(false)
  const promptRef2 = useRef(prompt) // Track prompt without triggering effect
  promptRef2.current = prompt
  
  // Flame timer ref - allows clearing on rapid clicks
  const flameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Robust function to trigger flame animation - always works even with rapid clicks
  const triggerFlameAnimation = useCallback(() => {
    // Clear any existing timer
    if (flameTimerRef.current) {
      clearTimeout(flameTimerRef.current)
    }
    // Start flame animation
    setModeFlameActive(true)
    // Set new timer to turn off
    flameTimerRef.current = setTimeout(() => {
      setModeFlameActive(false)
      flameTimerRef.current = null
    }, 1500)
  }, [])
  
  // Derive current mode from state
  const currentMode = editImage || canvasMode === 'refine' ? 'refine' : 'forge'
  
  // Trigger effects when mode changes
  useEffect(() => {
    const prevMode = prevModeRef.current
    
    if (currentMode !== prevMode) {
      // Mode changed - trigger flame animation
      triggerFlameAnimation()
      
      if (currentMode === 'refine') {
        // Switching to refine
        setRefineGlow(true)
        if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
        glowTimerRef.current = setTimeout(() => setRefineGlow(false), 3000)
        // Trigger refine intro animation if prompt is empty and not replaying
        if (!promptRef2.current.trim() && !isReplayingRef.current) {
          setShouldPlayRefineIntro(true)
        }
      } else {
        // Switching to forge
        setRefineGlow(false)
        // Trigger forge intro animation if prompt is empty and not replaying
        if (!promptRef2.current.trim() && !isReplayingRef.current) {
          setShouldPlayForgeIntro(true)
        }
      }
      
      prevModeRef.current = currentMode
    }
    
    return () => {
      // Cleanup timers on unmount
      if (flameTimerRef.current) clearTimeout(flameTimerRef.current)
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
    }
  }, [currentMode, triggerFlameAnimation])
  
  // Sync canvasMode with editImage state - only auto-switch TO refine, not back
  // (switching back to forge is handled explicitly by buttons/onNewForge)
  useEffect(() => {
    if (editImage) {
      setCanvasMode('refine')
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
  const [introAnimating, setIntroAnimating] = useState(false)
  const lastModeRef = useRef<'create' | 'edit' | null>(null)
  
  // Refs to track intro animation timers for cancellation
  const introTimersRef = useRef<{ start?: ReturnType<typeof setTimeout>; type?: ReturnType<typeof setInterval>; cool?: ReturnType<typeof setTimeout>; clear?: ReturnType<typeof setTimeout> }>({})
  
  // Cancel intro animation immediately
  const cancelIntroAnimation = useCallback(() => {
    // Clear all timers - always clear even if not animating
    if (introTimersRef.current.start) clearTimeout(introTimersRef.current.start)
    if (introTimersRef.current.type) {
      // Could be setInterval OR requestAnimationFrame ID
      clearInterval(introTimersRef.current.type)
      cancelAnimationFrame(introTimersRef.current.type as unknown as number)
    }
    if (introTimersRef.current.cool) clearTimeout(introTimersRef.current.cool)
    if (introTimersRef.current.clear) clearTimeout(introTimersRef.current.clear)
    introTimersRef.current = {}
    
    // Clear prompt first (removes text), then hot state, to avoid color flash
    setPrompt('')
    setIntroAnimating(false)
    // Delay hot state reset slightly to avoid visual glitch
    setTimeout(() => setPromptHot(false), 0)
  }, [])
  
  // Play intro animation with custom text - smooth character reveal
  const playIntroAnimation = useCallback((text: string, delay = 500) => {
    // Cancel any existing animation
    if (introTimersRef.current.start) clearTimeout(introTimersRef.current.start)
    if (introTimersRef.current.type) clearInterval(introTimersRef.current.type)
    if (introTimersRef.current.cool) clearTimeout(introTimersRef.current.cool)
    if (introTimersRef.current.clear) clearTimeout(introTimersRef.current.clear)
    introTimersRef.current = {}
    
    setIntroAnimating(true)
    
    introTimersRef.current.start = setTimeout(() => {
      setPromptHot(true)
      
      // Smooth character reveal using requestAnimationFrame
      const duration = 600 // Total duration in ms
      const startTime = performance.now()
      
      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)
        const charCount = Math.floor(progress * text.length)
        
        setPrompt(text.slice(0, charCount))
        
        if (progress < 1) {
          introTimersRef.current.type = requestAnimationFrame(animate) as unknown as ReturnType<typeof setInterval>
        } else {
          // Ensure full text is shown
          setPrompt(text)
          
          // Cool down after a brief hold - clear text while still hot to avoid color flash
          introTimersRef.current.cool = setTimeout(() => {
            // Clear text first while still "hot" so it fades out in orange
            setPrompt('')
            setIntroPlayed(true)
            setIntroAnimating(false)
            // Then reset hot state after text is gone
            setTimeout(() => setPromptHot(false), 50)
          }, 600)
        }
      }
      
      requestAnimationFrame(animate)
    }, delay)
  }, [])
  
  // Initial intro animation on first load
  useEffect(() => {
    if (introPlayed || prompt) return // Only play once on load, skip if user already typed
    playIntroAnimation("Describe what you want to create...")
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  
  // Play intro animation when switching to refine mode
  useEffect(() => {
    const currentMode = editImage ? 'edit' : 'create'
    
    // Check if we just switched TO refine mode (but NOT during replay)
    if (currentMode === 'edit' && lastModeRef.current === 'create' && !isReplayingRef.current) {
      // Cancel any existing animation first
      cancelIntroAnimation()
      // Clear existing prompt and play the refine intro animation
      setPrompt('')
      playIntroAnimation("Describe what you want to change...", 300)
    }
    
    lastModeRef.current = currentMode
  }, [editImage, playIntroAnimation, cancelIntroAnimation])
  
  // Play intro animation when switching from refine to forge
  useEffect(() => {
    if (shouldPlayForgeIntro) {
      // Cancel any existing animation first
      cancelIntroAnimation()
      playIntroAnimation("Describe what you want to create...", 300)
      setShouldPlayForgeIntro(false)
    }
  }, [shouldPlayForgeIntro, playIntroAnimation, cancelIntroAnimation])
  
  // Play intro animation when switching to refine mode
  useEffect(() => {
    if (shouldPlayRefineIntro) {
      // Cancel any existing animation first
      cancelIntroAnimation()
      playIntroAnimation("Describe what you want to change...", 300)
      setShouldPlayRefineIntro(false)
    }
  }, [shouldPlayRefineIntro, playIntroAnimation, cancelIntroAnimation])
  
  // Replay a previous generation's settings with visual feedback
  const handleReplay = useCallback((config: ReplayConfig) => {
    console.log('[Replay] Config received:', { 
      mode: config.mode, 
      editImageUrl: config.editImageUrl,
      hasReferences: config.references?.length 
    })
    
    // Mark that we're replaying to prevent intro animations from interfering
    isReplayingRef.current = true
    
    // Close alloy modal if open
    setAlloyModalOpen(false)
    setRefineExpanded(false)
    
    // Clear existing references first
    setReferences([])
    
    // For edit mode, set the edit image (this derives mode automatically)
    if (config.mode === 'edit' && config.editImageUrl) {
      const fullUrl = `${API_URL}${config.editImageUrl}`
      console.log('[Replay] Setting edit image for refine replay:', fullUrl)
      
      // First clear everything to force AnimatePresence to see a proper exit
      setResult(null)
      setViewingPastWork(false)
      setEditImage(null)
      
      // Preload the image before showing it, so animation plays with visible content
      const img = new Image()
      img.onload = () => {
        console.log('[Replay] Parent image preloaded, now showing')
        setEditImage({ url: fullUrl })
        detectAndSetAspectRatio(fullUrl)
      }
      img.onerror = () => {
        // Still show even if preload fails (might work via ImageCanvas)
        console.log('[Replay] Preload failed, showing anyway')
        setEditImage({ url: fullUrl })
        detectAndSetAspectRatio(fullUrl)
      }
      img.src = fullUrl
    } else {
      console.log('[Replay] Clearing for forge mode. mode:', config.mode, 'editImageUrl:', config.editImageUrl)
      // Clear edit image and canvas for create/forge mode
      setEditImage(null)
      setResult(null)
      setCanvasMode('forge')
      setViewingPastWork(false)
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
        setTimeout(() => {
          setPromptHot(false)
          isReplayingRef.current = false // Done replaying
        }, 200)
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
    
    // Store abort controller keyed by generation ID
    abortControllersRef.current.set(genId, abortController)
    
    // Capture current values for this generation
    const genPrompt = prompt.trim()
    const genReferences = [...references]
    const genEditImage = editImage
    const genResolution = resolution
    const genAspectRatio = aspectRatio
    const genOutputCount = outputCount
    const genMode = genEditImage?.url ? 'edit' : 'create'
    
    // Extract parent generation ID from edit image URL if present
    // URL pattern: .../api/generations/{uuid}/image/{index}
    const parentIdMatch = genEditImage?.url?.match(/\/api\/generations\/([a-fA-F0-9-]+)\/image\//i)
    const genParentId = parentIdMatch?.[1] || null
    console.log('[Generate] Edit image URL:', genEditImage?.url, 'Extracted parentId:', genParentId)
    
    // Add to pending generations at the top and auto-select it
    setPendingGenerations(prev => [{
      id: genId,
      prompt: genPrompt,
      outputCount: genOutputCount,
      mode: genMode,
      references: [...genReferences],
      editImageUrl: genEditImage?.url
    }, ...prev])
    setSelectedPendingId(genId)
    
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

    // Helper to remove this generation from pending and clean up abort controller
    const removePending = () => {
      setPendingGenerations(prev => prev.filter(g => g.id !== genId))
      abortControllersRef.current.delete(genId)
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
        prompt: genPrompt,
        mode: genMode,
        aspectRatio: genAspectRatio,
        resolution: genResolution
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
          ...(genMode === 'edit' && genEditImage?.url ? { 
            editImage: genEditImage.url,
            parentId: genParentId // Store parent generation for replay functionality
          } : {}),
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
              console.log('[Complete] Setting result with mode:', genMode, 'parentId:', genParentId)
              setResult({ 
                imageUrl: data.imageUrl, 
                imageUrls: data.imageUrls, 
                prompt: genPrompt,
                mode: genMode,
                aspectRatio: genAspectRatio,
                resolution: genResolution,
                parentId: genParentId,
                styleImages: genReferences.map(ref => ({ url: ref.url, name: ref.name }))
              })
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
      let errorMessage = err instanceof Error ? err.message : 'Error'
      // Make content blocked errors more user-friendly
      if (errorMessage.includes('CONTENT_BLOCKED')) {
        errorMessage = 'Sensitive content detected. Try adjusting your prompt or covering parts of the source image.'
      }
      setError(errorMessage)
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

  // Cancel all pending generations
  const handleCancelAll = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort())
    abortControllersRef.current.clear()
    setIsGenerating(false)
    setPendingGenerations([])
    setSelectedPendingId(null)
    setPipeFill(0)
    setOutputHot(false)
  }, [])
  void handleCancelAll // Suppress unused warning
  
  // Cancel a specific pending generation
  const handleCancelPending = useCallback((pendingId: string) => {
    const controller = abortControllersRef.current.get(pendingId)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(pendingId)
    }
    setPendingGenerations(prev => {
      const remaining = prev.filter(g => g.id !== pendingId)
      if (remaining.length === 0) {
        setIsGenerating(false)
        setSelectedPendingId(null)
      }
      return remaining
    })
    if (selectedPendingId === pendingId) {
      setSelectedPendingId(null)
    }
  }, [selectedPendingId])
  
  // Select a pending generation - navigate to it and restore its setup
  const handleSelectPending = useCallback((pendingId: string) => {
    setSelectedPendingId(pendingId)
    // Clear current result to show the generating view for this pending item
    setResult(null)
    setViewingPastWork(false)
    
    // Find the pending generation and restore its setup
    const pending = pendingGenerations.find(p => p.id === pendingId)
    if (pending) {
      setPrompt(pending.prompt)
      setReferences(pending.references)
      if (pending.mode === 'edit' && pending.editImageUrl) {
        setEditImage({ url: pending.editImageUrl })
      } else {
        setEditImage(null)
        setCanvasMode('forge')
      }
    } else {
      setEditImage(null)
    }
  }, [pendingGenerations])

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

  // Handle drop on canvas - always sets as refine source (use alloy area for references)
  const handleRefineDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingRefine(false)
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    
    // Always use first dropped image as edit source for refining
    const file = files[0]
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target?.result as string
      setEditImage({ url })
      detectAndSetAspectRatio(url)
    }
    reader.readAsDataURL(file)
  }, [])

  // Handle drop on alloy area - always adds as references
  const handleAlloyDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingAlloy(false)
    
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    
    // Add all dropped images as alloy references (up to max 14)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const url = ev.target?.result as string
        const newRef: Reference = {
          id: `drop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          url,
          name: file.name,
          type: 'file',
        }
        setReferences(prev => {
          if (prev.length >= 14) return prev
          return [...prev, newRef]
        })
      }
      reader.readAsDataURL(file)
    })
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
  
  // Track zoom level from ImageCanvas
  const [canvasZoom, setCanvasZoom] = useState(100)
  
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
    <div className={`app ${editImage || canvasMode === 'refine' ? 'refine-mode' : ''}`}>
      {/* WORKS SIDEBAR - Left side works list */}
      <WorksSidebar
        authenticated={authenticated}
        onSelectImage={(imageUrl, generation) => {
          const genMode = generation.mode || 'create'
          
          // Store result info for reference (used by Replay button)
          setResult({
            imageUrl: imageUrl,
            imageUrls: generation.imageUrls.map(url => `${API_URL}${url}`),
            prompt: generation.prompt,
            mode: genMode,
            aspectRatio: generation.aspect_ratio || '1:1',
            resolution: generation.resolution || '1024',
            model: generation.model,
            styleImages: generation.settings?.styleImages,
            parentId: generation.parent_id
          })
          
          // Set mode and load data based on original generation type
          if (genMode === 'edit') {
            // Refine result: show as edit source for further refinement
            // Clear prompt and alloys - user will give NEW instructions
            setPrompt('')
            setReferences([])
            setEditImage({ url: imageUrl })
            // canvasMode will be derived from editImage
          } else {
            // Forge result: load prompt + alloys, ready to forge again
            setPrompt(generation.prompt || '')
            
            // Load alloy references from style_images
            const styleImages = generation.settings?.styleImages || []
            const refs: Reference[] = styleImages.map((img, i) => ({
              id: `ref-${generation.id}-${i}`,
              url: img.url.startsWith('http') || img.url.startsWith('data:') || img.url.startsWith('/')
                ? img.url 
                : `${API_URL}${img.url}`,
              name: img.name,
              type: 'generation' as const
            }))
            setReferences(refs)
            
            setEditImage(null)
            setCanvasMode('forge')
          }
          
          detectAndSetAspectRatio(imageUrl)
          setViewingPastWork(true)
          setCanvasZoom(100)
          
          // Reset image loading state
          setLoadedImages(new Set())
          setFailedImages(new Set())
        }}
        onNewForge={() => {
          // Start fresh - clear everything for a new creation
          setCanvasMode('forge')
          setEditImage(null)
          setResult(null)
          setPrompt('')
          setReferences([])
          setViewingPastWork(false)
          setSelectedPendingId(null)
          // Trigger forge intro animation
          if (!prompt.trim()) {
            setShouldPlayForgeIntro(true)
          }
        }}
        onDeleteImage={async (generationId) => {
          // Sidebar handles optimistic removal - just do the API call
          try {
            const res = await fetch(`${API_URL}/api/generations/${generationId}`, {
              method: 'DELETE',
              credentials: 'include',
            })
            if (res.ok) {
              // Also remove from gallery if open
              setGalleryImages(prev => prev.filter(g => g.generationId !== generationId))
            }
          } catch (err) {
            console.error('Failed to delete:', err)
          }
        }}
        onOpenWorksModal={openGallery}
        newGenerationTrigger={generationTrigger}
        pendingGenerations={pendingGenerations}
        onCancelPending={handleCancelPending}
        onSelectPending={handleSelectPending}
        selectedPendingId={selectedPendingId}
        isNewForgeActive={!result && !editImage && !selectedPendingId && !viewingPastWork && !isGenerating}
        selectedImageUrl={result?.imageUrl}
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
          {/* GENERATING STATE - only when viewing a pending generation, not when on fresh canvas */}
          {isGenerating && !viewingPastWork && !!selectedPendingId ? (
            <motion.div 
              key="generating"
              className="canvas-generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Preview slot with actual aspect ratio */}
              {(() => {
                const pending = pendingGenerations.find(p => p.id === selectedPendingId)
                const pendingMode = pending?.mode || 'create'
                // Parse aspect ratio to get actual proportions
                const [w, h] = aspectRatio.split(':').map(Number)
                const ratio = w / h
                return (
                  <motion.div
                    className="canvas-preview-slot"
                    style={{
                      aspectRatio: `${w} / ${h}`,
                      width: ratio >= 1 ? 'min(400px, 80vw)' : 'auto',
                      height: ratio < 1 ? 'min(400px, 60vh)' : 'auto',
                    }}
                    animate={{
                      opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                  >
                    {/* Show mode icon centered */}
                    {pendingMode === 'edit' 
                      ? <Hammer className="w-8 h-8" style={{ color: '#d4a017', opacity: 0.7 }} />
                      : <Flame className="w-8 h-8" style={{ color: '#ff5722', opacity: 0.7 }} />
                    }
                  </motion.div>
                )
              })()}
            </motion.div>
          ) : validImages.length > 0 ? (
            /* OUTPUT IMAGES - Zoomable Canvas */
            <motion.div 
              key="output"
              className="canvas-output"
              ref={outputRef}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ 
                duration: 0.25,
                exit: { duration: 0.15 }
              }}
            >
              <ImageCanvas images={validImages} onZoomChange={setCanvasZoom} />
            </motion.div>
          ) : editImage ? (
            /* EDIT IMAGE SELECTED - displays like output using ImageCanvas */
            <motion.div 
              key={`edit-image-${editImage.url}`}
              className="canvas-output"
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ 
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
                exit: { duration: 0.15 }
              }}
            >
              <ImageCanvas 
                images={[editImage.url]} 
                onZoomChange={setCanvasZoom}
                onImageError={() => setEditImage(null)}
              />
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
                  <ArchiveRestore className="w-4 h-4" />
                  Drop
                </button>
                <button 
                  className={`canvas-tab ${refineSource === 'items' ? 'active' : ''}`}
                  onClick={() => setRefineSource('items')}
                >
                  <Swords className="w-4 h-4" />
                  Items
                </button>
                <button 
                  className={`canvas-tab ${refineSource === 'history' ? 'active' : ''}`}
                  onClick={() => setRefineSource('history')}
                >
                  <Box className="w-4 h-4" />
                  Works
                </button>
                <button 
                  className={`canvas-tab ${refineSource === 'favorites' ? 'active' : ''}`}
                  onClick={() => setRefineSource('favorites')}
                >
                  <Star className="w-4 h-4" />
                  Favorites
                </button>
              </div>

              {/* Source content - kept mounted to preserve state */}
              <div className="canvas-source-content">
                {/* Drop tab - mode aware */}
                <div className={`canvas-tab-panel ${refineSource === 'drop' ? 'active' : ''}`}>
                  <div 
                    className={`canvas-dropzone ${isDraggingRefine ? 'dragging' : ''} ${activeDropTarget === 'refine' ? 'active' : ''}`}
                    onClick={() => setActiveDropTarget(activeDropTarget === 'refine' ? null : 'refine')}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setActiveDropTarget(activeDropTarget === 'refine' ? null : 'refine')}
                  >
                    <div className="canvas-dropzone-inner">
                      <span className="canvas-dropzone-icon">
                        {canvasMode === 'forge' 
                          ? <span className="btn-icon icon-alloy" style={{ width: 32, height: 32 }} />
                          : <ArchiveRestore style={{ width: 32, height: 32 }} />
                        }
                      </span>
                      <p className="canvas-dropzone-text">
                        Drop or paste an image to refine
                      </p>
                      <p className="canvas-dropzone-hint">
                        {activeDropTarget === 'refine' 
                          ? 'Ready to paste - press ⌘V' 
                          : 'Click to select, then paste'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Items tab */}
                <div className={`canvas-tab-panel ${refineSource === 'items' ? 'active' : ''}`}>
                  <div className="canvas-source-panel">
                    {canvasMode === 'forge' ? (
                      <HighriseSearch 
                        singleSelect={false}
                        onAddReference={(ref) => addAlloyReferences([ref])}
                        onRemoveReference={removeReference}
                        references={references}
                        maxRefs={14}
                        bridgeConnected={bridgeConnected}
                        useAPBridge={inAPContext}
                        onRefine={(url) => {
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                          setPrompt('')
                          setReferences([])
                        }}
                      />
                    ) : (
                      <HighriseSearch 
                        singleSelect
                        onSingleSelect={(item) => { 
                          const url = item.displayUrl || item.imageUrl
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                        }} 
                        bridgeConnected={bridgeConnected}
                        useAPBridge={inAPContext}
                        onRefine={(url) => {
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                          setPrompt('')
                          setReferences([])
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* History/Works tab */}
                <div className={`canvas-tab-panel ${refineSource === 'history' ? 'active' : ''}`}>
                  <div className="canvas-source-panel">
                    {canvasMode === 'forge' ? (
                      <HistoryGrid 
                        singleSelect={false}
                        onAddReference={(ref) => addAlloyReferences([ref])}
                        onRemoveReference={removeReference}
                        references={references}
                        maxRefs={14}
                        isActive={refineSource === 'history'}
                        onUseAlloy={addAlloyReferences}
                      />
                    ) : (
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
                        isActive={refineSource === 'history'}
                        onUseAlloy={addAlloyReferences}
                      />
                    )}
                  </div>
                </div>

                {/* Favorites tab */}
                <div className={`canvas-tab-panel ${refineSource === 'favorites' ? 'active' : ''}`}>
                  <div className="canvas-source-panel">
                    {canvasMode === 'forge' ? (
                      <Favorites 
                        authenticated={authenticated}
                        onLogin={login}
                        singleSelect={false}
                        onAddReference={(ref) => addAlloyReferences([ref])}
                        onRemoveReference={removeReference}
                        references={references}
                        maxRefs={14}
                        isActive={refineSource === 'favorites'}
                        onRefine={(url) => {
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                          setPrompt('')
                          setReferences([])
                        }}
                      />
                    ) : (
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
                        onRefine={(url) => {
                          setEditImage({ url })
                          detectAndSetAspectRatio(url)
                          setPrompt('')
                          setReferences([])
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
        {/* CANVAS CONTROLS BAR - Above prompt, visible when images exist or generating */}
        {(validImages.length > 0 && result) || (isGenerating && selectedPendingId) ? (
          <div className="image-canvas-controls">
            {/* Specs - shows result specs if available, otherwise current UI settings */}
            {(() => {
              const pending = pendingGenerations.find(p => p.id === selectedPendingId)
              const showMode = result?.mode || pending?.mode || (editImage ? 'edit' : 'create')
              const showRatio = result?.aspectRatio || aspectRatio
              const showRes = result?.resolution || resolution
              const isRefine = showMode === 'edit'
              return (
                <div className="lightbox-specs" style={{ margin: 0, padding: '6px 10px' }}>
                  {/* Mode */}
                  <span className="lightbox-spec" title={isRefine ? 'Refined' : 'Created'}>
                    {isRefine ? <Hammer className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
                  </span>
                  <span className="lightbox-spec-sep">·</span>
                  {/* Model */}
                  <span className="lightbox-spec" title="Pro">
                    <Gem className="w-4 h-4" />
                    Pro
                  </span>
                  <span className="lightbox-spec-sep">·</span>
                  {/* Aspect Ratio */}
                  <span className="lightbox-spec" title={`Ratio ${showRatio}`}>
                    <svg className="lightbox-ratio-icon" viewBox="0 0 14 14" width="14" height="14">
                      <rect 
                        x={(14 - getAspectDimensions(showRatio).w) / 2} 
                        y={(14 - getAspectDimensions(showRatio).h) / 2} 
                        width={getAspectDimensions(showRatio).w} 
                        height={getAspectDimensions(showRatio).h} 
                        fill="currentColor" 
                        rx="1" 
                      />
                    </svg>
                    {showRatio}
                  </span>
                  <span className="lightbox-spec-sep">·</span>
                  {/* Resolution */}
                  <span className="lightbox-spec" title={`Resolution ${showRes}`}>
                    {showRes}
                  </span>
                  {validImages.length > 0 && (
                    <>
                      <span className="lightbox-spec-sep">·</span>
                      {/* Zoom - only show when there's an image */}
                      <span className="lightbox-spec" title={`Zoom ${canvasZoom}%`}>
                        <Search className="w-4 h-4" />
                        {canvasZoom}%
                      </span>
                    </>
                  )}
                </div>
              )
            })()}
            
            {/* Image actions - only show when there are actual images */}
            {validImages.length > 0 && (
              <>
                {/* Separator */}
                <div className="canvas-controls-sep" />
                
                <button 
                  className={`canvas-control-btn canvas-control-btn-fav ${starredOutputUrls.has(validImages[0]) ? 'active' : ''}`}
                  onClick={() => toggleOutputFavorite(validImages[0])}
                  title={starredOutputUrls.has(validImages[0]) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className="w-4 h-4" />
                </button>
                <button 
                  className="canvas-control-btn"
                  onClick={() => {
                    if (result) {
                      const editImageUrl = result.mode === 'edit' && result.parentId 
                        ? `/api/generations/${result.parentId}/image/0`
                        : undefined
                      console.log('[Replay Button] Full result:', result)
                      console.log('[Replay Button] Computed editImageUrl:', editImageUrl)
                      console.log('[Replay Button] Condition check: mode=', result.mode, 'parentId=', result.parentId)
                      handleReplay({
                        prompt: result.prompt,
                        mode: result.mode || 'create',
                        model: result.model,
                        resolution: result.resolution,
                        aspectRatio: result.aspectRatio,
                        references: result.styleImages,
                        editImageUrl,
                      })
                    }
                  }}
                  title="Replay with same settings"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button 
                  className="canvas-control-btn"
                  onClick={() => {
                    // Set current image as edit source for refinement
                    setEditImage({ url: validImages[0] })
                    setPrompt('')
                    setReferences([])
                  }}
                  title="Refine this image"
                >
                  <Hammer className="w-4 h-4" />
                </button>
                <button 
                  className="canvas-control-btn"
                  onClick={() => downloadOutputImage(validImages[0])}
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        ) : null}
        
        <div className="floating-prompt-inner">
          {/* LCD status display - interactive with fire grids inside */}
          <div className="lcd-screen lcd-floating lcd-interactive">
            <LCDFireGrid active={(isGenerating && !!selectedPendingId) || modeFlameActive} cols={11} rows={3} dotSize={4} gap={1} className="lcd-fire-left" spreadDirection="left" mode={editImage || canvasMode === 'refine' ? 'refine' : 'forge'} />
            <span className="lcd-spec-item lcd-pro lit">
              <Anvil className="w-3 h-3" />
              V.2.19
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
                onClick={() => setAspectRatio(ratio)}
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
                onClick={() => setResolution(res)}
              >
                {res}
              </button>
            ))}
            <span className="lcd-spec-sep">│</span>
            <button 
              className={`lcd-spec-item lcd-mode forge ${!editImage && canvasMode === 'forge' ? 'lit' : ''}`}
              onClick={() => {
                // Clear editImage - the useEffect handles all animations
                if (editImage) {
                  setEditImage(null)
                  setResult(null)
                }
                setCanvasMode('forge')
              }}
            >
              <Flame className="w-3 h-3" />
              Forging
            </button>
            <button 
              className={`lcd-spec-item lcd-mode refine ${editImage || canvasMode === 'refine' ? 'lit' : ''}`}
              onClick={() => {
                // Already in refine mode with image - do nothing
                if (editImage) return
                
                // If we have an image showing on canvas, use it as the edit source
                const displayedImage = validImages[0]
                if (displayedImage) {
                  setEditImage({ url: displayedImage })
                  // Clear prompt for new refine instructions
                  setPrompt('')
                  setReferences([])
                }
                
                // Switch to refine mode (shows drop zone if no image)
                setCanvasMode('refine')
                
                // Trigger flame animation
                setModeFlameActive(true)
                if (flameTimerRef.current) clearTimeout(flameTimerRef.current)
                flameTimerRef.current = setTimeout(() => setModeFlameActive(false), 1200)
                
                // Trigger intro animation if prompt is empty
                if (!promptRef2.current?.trim() && !isReplayingRef.current) {
                  setShouldPlayRefineIntro(true)
                }
              }}
            >
              <Hammer className="w-3 h-3" />
              Refining
            </button>
            <LCDFireGrid active={(isGenerating && !!selectedPendingId) || modeFlameActive} cols={11} rows={3} dotSize={4} gap={1} className="lcd-fire-right" spreadDirection="right" mode={editImage || canvasMode === 'refine' ? 'refine' : 'forge'} />
          </div>
          
          {/* Main input row with logo */}
          <div className="floating-prompt-row">
            {/* Logo on left */}
            <img src="/forge_logo.svg" alt="Design Forge" className="prompt-bar-logo" />
            
            {/* Prompt input with LED */}
            <div className="floating-prompt-input-wrapper">
              <Textarea
                ref={promptRef}
                className={`floating-prompt-input ${promptHot ? 'prompt-hot' : ''} ${isGenerating && selectedPendingId ? 'forging' : ''}`}
                value={prompt}
                onChange={e => {
                  if (introAnimating) cancelIntroAnimation()
                  if (promptHot) setPromptHot(false)
                  setPrompt(e.target.value)
                }}
                onFocus={() => {
                  if (introAnimating) cancelIntroAnimation()
                  if (promptHot) setPromptHot(false)
                }}
                onKeyDown={e => {
                  // Enter submits, Shift+Enter for line break
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (canGenerate) handleGenerate()
                  }
                }}
                placeholder={introPlayed && !introAnimating ? (editImage ? "Describe what you want to change..." : "Describe what you want to create...") : ""}
                rows={1}
              />
              <span className={`led prompt-led ${!prompt.trim() && !isGenerating ? 'blink' : prompt.trim() ? 'on' : ''}`} />
            </div>
            
            {/* Forge/Refine button - always allow queueing more generations */}
            <Button
              variant={canGenerate ? 'accent' : 'dark'}
              onClick={!canGenerate && !prompt.trim() ? scrollToPrompt : handleGenerate}
              disabled={!canGenerate && prompt.trim() !== ''}
              className="floating-forge-btn"
            >
              {editImage ? <Hammer className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
              {editImage ? 'Refine' : (viewingPastWork || result) ? 'Re-Forge' : 'Forge'}{isGenerating ? ` +${pendingGenerations.length}` : ''}
            </Button>
          </div>
          
          {/* Alloy row - shows selected references below prompt */}
          <div 
            className={`prompt-alloy-row ${isDraggingAlloy ? 'dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsDraggingAlloy(true) }}
            onDragLeave={(e) => { 
              if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
                setIsDraggingAlloy(false)
              }
            }}
            onDrop={handleAlloyDrop}
          >
            <div className="prompt-alloy-label">
              <span className="btn-icon icon-alloy" />
              <span className="prompt-alloy-title">Alloy</span>
              {references.length < 9 && (
                <span className="prompt-alloy-subtitle">image references</span>
              )}
            </div>
            <div className="prompt-alloy-thumbs">
              {/* Clear all button - positioned to left of images */}
              {references.length > 0 && (
                <button
                  className="prompt-alloy-clear"
                  onClick={() => setReferences([])}
                  title="Clear all references"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
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
                      src={(() => {
                        // Use thumbnail for display if available, otherwise fall back to full URL
                        const displayUrl = ref.thumbnailUrl || ref.url
                        return displayUrl.startsWith('http') || displayUrl.startsWith('data:') 
                          ? displayUrl 
                          : `${API_URL}${displayUrl}`
                      })()} 
                      alt={ref.name || ''} 
                    />
                    <div className="prompt-alloy-thumb-remove">
                      <X className="w-4 h-4" />
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {/* + button always on far right of the row */}
            <button 
              className={`prompt-alloy-add ${references.length > 0 ? 'has-refs' : ''}`}
              onClick={() => setAlloyModalOpen(true)}
              title="Add style references"
            >
              <Plus className="w-4 h-4" />
            </button>
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
      {/* Gallery Expanded Lightbox - rendered outside gallery-overlay to avoid z-index conflicts */}
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
                    // For edit mode, include the parent image URL
                    editImageUrl: galleryExpanded.mode === 'edit' && galleryExpanded.parentId
                      ? `/api/generations/${galleryExpanded.parentId}/image/0`
                      : undefined,
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

      <AnimatePresence>
        {galleryOpen && (
          <motion.div 
            className="gallery-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: galleryExpanded ? 0 : 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !galleryExpanded && setGalleryOpen(false)}
            style={{ pointerEvents: galleryExpanded ? 'none' : 'auto' }}
          >
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
                    <h2><Boxes className="w-5 h-5" /> Past Works</h2>
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
                            <Trash2 className="w-3 h-3" />
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
