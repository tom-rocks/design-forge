import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Search, Loader2, WifiOff, Expand, Download, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '../config'

interface HighriseItem {
  id: string
  name: string
  category: string
  rarity: string
  imageUrl: string
}

interface Reference {
  id: string
  url: string
  name?: string
  type: 'file' | 'highrise' | 'generation'
}

interface HighriseSearchProps {
  references?: Reference[]
  onAddReference?: (ref: Reference) => void
  onRemoveReference?: (id: string) => void
  maxRefs?: number
  disabled?: boolean
  bridgeConnected?: boolean
  // Single select mode - pick one item
  singleSelect?: boolean
  onSingleSelect?: (item: HighriseItem) => void
}

export default function HighriseSearch({ 
  references = [],
  onAddReference,
  onRemoveReference,
  maxRefs = 14,
  disabled,
  bridgeConnected = false,
  singleSelect = false,
  onSingleSelect
}: HighriseSearchProps) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [lightbox, setLightbox] = useState<HighriseItem | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Search items
  const searchItems = useCallback(async (append = false) => {
    if (!query.trim() && !bridgeConnected) return
    
    const currentPage = append ? page + 1 : 0
    
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setPage(0)
    }
    
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      params.set('type', 'all')
      params.set('limit', '40')
      params.set('page', String(currentPage))

      const res = await fetch(`${API_URL}/api/highrise/items?${params}`)
      const data = await res.json()
      
      if (append) {
        setItems(prev => [...prev, ...(data.items || [])])
        setPage(currentPage)
      } else {
        setItems(data.items || [])
      }
      
      setHasMore(data.hasMore || false)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query, page, bridgeConnected])

  // Debounced search
  useEffect(() => {
    if (!query.trim() && !bridgeConnected) return
    
    const timeout = setTimeout(() => {
      searchItems(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  // Initial load when bridge connects
  useEffect(() => {
    if (bridgeConnected && items.length === 0) {
      searchItems(false)
    }
  }, [bridgeConnected])

  // Load more
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      searchItems(true)
    }
  }, [loadingMore, hasMore, searchItems])

  // Infinite scroll with scroll event
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = grid
      // Load more when within 100px of bottom
      if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loadingMore) {
        loadMore()
      }
    }

    grid.addEventListener('scroll', handleScroll)
    return () => grid.removeEventListener('scroll', handleScroll)
  }, [hasMore, loadingMore, loadMore])

  // Toggle item selection
  const toggleItem = (item: HighriseItem) => {
    // Single select mode - just call the callback
    if (singleSelect && onSingleSelect) {
      onSingleSelect(item)
      return
    }
    
    // Multi-select mode
    if (!onAddReference || !onRemoveReference) return
    
    const existingRef = references.find(r => r.url === item.imageUrl)
    if (existingRef) {
      onRemoveReference(existingRef.id)
    } else if (references.length < maxRefs) {
      onAddReference({
        id: `hr-${item.id}`,
        url: item.imageUrl,
        name: item.name,
        type: 'highrise'
      })
    }
  }

  // Memoize selected URLs for O(1) lookups
  const selectedUrls = useMemo(() => new Set(references.map(r => r.url)), [references])
  const isSelected = useCallback((item: HighriseItem) => selectedUrls.has(item.imageUrl), [selectedUrls])

  const getRarityColor = (r: string) => {
    switch (r?.toLowerCase()) {
      case 'legendary': return 'rarity-legendary'
      case 'epic': return 'rarity-epic'
      case 'rare': return 'rarity-rare'
      default: return ''
    }
  }

  // Download image
  const downloadImage = async (item: HighriseItem) => {
    try {
      const res = await fetch(item.imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${item.name.replace(/[^a-z0-9]/gi, '-')}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Failed to download:', e)
    }
  }

  return (
    <div className="highrise-search">
      {/* Search Bar */}
      <div className="highrise-search-bar">
        <Search className="search-icon" />
        <input
          type="text"
          placeholder={bridgeConnected ? "Search any item..." : "Search (limited)..."}
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={disabled}
          className="input"
        />
        {loading && <Loader2 className="search-loader" />}
      </div>

      {/* Results Grid */}
      <AnimatePresence mode="wait">
        {items.length > 0 ? (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-results"
          >
            <div className="highrise-grid" ref={gridRef}>
              {items.map(item => {
                const selected = isSelected(item)
                return (
                  <motion.div
                    key={item.id}
                    className={`highrise-item ${getRarityColor(item.rarity)} ${selected ? 'selected' : ''} ${!selected && references.length >= maxRefs ? 'disabled' : ''}`}
                    onClick={() => !disabled && toggleItem(item)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title={item.name}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      loading="lazy"
                    />
                    {selected && (
                      <div className="highrise-item-check">
                        <span>✓</span>
                      </div>
                    )}
                    {/* Expand button on hover */}
                    <button
                      className="highrise-item-expand"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLightbox(item)
                      }}
                      title="View full size"
                    >
                      <Expand className="w-4 h-4" />
                    </button>
                  </motion.div>
                )
              })}
              
              {/* Loading indicator */}
              {loadingMore && (
                <div className="highrise-loader-sentinel">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}
            </div>
          </motion.div>
        ) : loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-loading"
          >
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Searching...</span>
          </motion.div>
        ) : query.trim() && !bridgeConnected ? (
          <motion.div
            key="limited"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-notice"
          >
            <WifiOff className="w-4 h-4" />
            <span>Limited mode - connect bridge for full search</span>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="highrise-empty"
          >
            <Search className="w-5 h-5" />
            <span>Search Highrise items above</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            className="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
          >
            <motion.div
              className="lightbox-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="lightbox-close"
                onClick={() => setLightbox(null)}
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={lightbox.imageUrl}
                alt={lightbox.name}
              />
              <div className="lightbox-footer">
                <p className="lightbox-prompt">
                  <strong>{lightbox.name}</strong>
                  <span className="lightbox-meta"> · {lightbox.category} · {lightbox.rarity}</span>
                </p>
                <button
                  className="lightbox-download"
                  onClick={() => downloadImage(lightbox)}
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
