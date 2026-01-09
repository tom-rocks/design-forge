import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, Plus, Wifi, WifiOff } from 'lucide-react'
import { API_URL } from '../config'

interface HighriseItem {
  id: string
  name: string
  category: string
  rarity: string
  imageUrl: string
}

interface StyleImage {
  url: string
  strength: number
  name?: string
}

interface HighriseSearchProps {
  selectedItems: StyleImage[]
  onSelectionChange: (items: StyleImage[]) => void
  disabled?: boolean
  maxItems?: number
}

const HIGHRISE_CDN = 'https://cdn.highrisegame.com/avatar'

export default function HighriseSearch({ 
  selectedItems, 
  onSelectionChange, 
  disabled,
  maxItems = 15 
}: HighriseSearchProps) {
  const [query, setQuery] = useState('')
  const itemType = 'all' // Always search all item types
  const [items, setItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [bridgeConnected, setBridgeConnected] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalPages, setTotalPages] = useState(0)

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
      params.set('type', itemType)
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
      
      setSource(data.source || null)
      setHasMore(data.hasMore || false)
      setTotalPages(data.totalPages || 0)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query, page, bridgeConnected])

  // Debounced search - reset pagination on new search
  useEffect(() => {
    // Skip if no search criteria and bridge not connected
    if (!query.trim() && !bridgeConnected) return
    
    const timeout = setTimeout(() => {
      searchItems(false) // false = fresh search, not append
    }, 300)
    return () => clearTimeout(timeout)
  }, [query]) // Only trigger on query changes

  // Initial load when bridge connects (one-time)
  useEffect(() => {
    if (bridgeConnected && items.length === 0) {
      searchItems(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeConnected]) // Only run when bridge status changes

  // Load more items
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      searchItems(true)
    }
  }, [loadingMore, hasMore, searchItems])

  const toggleItem = (item: HighriseItem) => {
    const isCurrentlySelected = selectedItems.some(s => s.url === item.imageUrl)
    if (isCurrentlySelected) {
      // Remove item
      onSelectionChange(selectedItems.filter(s => s.url !== item.imageUrl))
    } else if (selectedItems.length < maxItems) {
      // Add item
      onSelectionChange([...selectedItems, { url: item.imageUrl, strength: 1, name: item.name }])
    }
  }

  const addItemById = async (id: string) => {
    const url = `${HIGHRISE_CDN}/${id}.png`
    if (selectedItems.some(s => s.url === url) || selectedItems.length >= maxItems) return
    
    // Try to fetch actual item name from API
    try {
      const res = await fetch(`${API_URL}/api/highrise/items/${id}`)
      if (res.ok) {
        const item = await res.json()
        onSelectionChange([...selectedItems, { url: item.imageUrl || url, strength: 1, name: item.name || id }])
      } else {
        // Fallback to ID if item not found
        onSelectionChange([...selectedItems, { url, strength: 1, name: id }])
      }
    } catch {
      onSelectionChange([...selectedItems, { url, strength: 1, name: id }])
    }
    setQuery('')
  }

  const updateStrength = (url: string, strength: number) => {
    onSelectionChange(selectedItems.map(s => 
      s.url === url ? { ...s, strength } : s
    ))
  }

  const removeItem = (url: string) => {
    onSelectionChange(selectedItems.filter(s => s.url !== url))
  }

  // Memoize selected URLs as a Set for O(1) lookups
  const selectedUrls = useMemo(() => new Set(selectedItems.map(s => s.url)), [selectedItems])
  
  const isSelected = useCallback((item: HighriseItem) => {
    return selectedUrls.has(item.imageUrl)
  }, [selectedUrls])

  const isItemId = (text: string) => text.includes('-') && !text.includes(' ')

  const getRarityColor = (r: string) => {
    switch (r?.toLowerCase()) {
      case 'legendary': return 'border-yellow-500/60'
      case 'epic': return 'border-purple-500/60'
      case 'rare': return 'border-blue-500/60'
      default: return 'border-te-border'
    }
  }

  return (
    <div className="space-y-3">
      {/* Header with Bridge Status */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-te-cream">Style References</h3>
          <p className="text-xs text-te-cream-muted">
            Search Highrise items ({selectedItems.length}/{maxItems})
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
          bridgeConnected 
            ? 'bg-fuchsia-500/10 text-fuchsia-400' 
            : 'bg-te-cream-muted/10 text-te-cream-muted'
        }`}>
          {bridgeConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {bridgeConnected ? 'Full Search' : 'Limited'}
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-te-cream-muted" />
          <input
            type="text"
            placeholder={bridgeConnected ? "Search any item..." : "Paste item ID or search..."}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter' && query.trim() && isItemId(query.trim())) {
                e.preventDefault()
                addItemById(query.trim())
              }
            }}
            disabled={disabled}
            className="w-full pl-10 pr-4 py-2.5 bg-te-panel border border-te-border rounded-xl text-sm text-te-cream placeholder-te-cream-dim/50 focus:outline-none focus:border-te-fuchsia/50 disabled:opacity-50"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 text-te-fuchsia animate-spin" />
            </div>
          )}
        </div>

        {query.trim() && isItemId(query.trim()) && (
          <button
            onClick={() => addItemById(query.trim())}
            disabled={disabled || selectedItems.length >= maxItems}
            className="px-4 bg-te-fuchsia hover:bg-te-fuchsia-dim text-white rounded-xl disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      <AnimatePresence>
        {isOpen && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-te-panel border border-te-border rounded-xl shadow-xl max-h-80 overflow-y-auto"
          >
            {source && (
              <div className="px-3 py-1.5 border-b border-te-border text-[10px] text-te-cream-muted flex justify-between">
                <span>Source: {source === 'bridge' ? '✓ Full catalog' : '⚠️ Limited'}</span>
                {totalPages > 0 && <span>Page {page + 1} of {totalPages}</span>}
              </div>
            )}
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 p-2">
              {items.map(item => {
                const selected = isSelected(item)
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item)}
                    disabled={!selected && selectedItems.length >= maxItems}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors duration-150 ${
                      selected
                        ? 'border-te-fuchsia ring-2 ring-te-fuchsia/30'
                        : `${getRarityColor(item.rarity)} hover:border-te-fuchsia/50`
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                    title={`${item.name}\n${item.id}${selected ? '\n(Click to remove)' : ''}`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-contain bg-te-bg"
                    />
                    {selected && (
                      <div className="absolute inset-0 bg-te-fuchsia/20 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-te-fuchsia flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            
            {/* Load More Button */}
            {hasMore && (
              <div className="p-2 border-t border-te-border">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2 bg-te-bg hover:bg-te-border text-sm text-te-cream rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Load More ({items.length} shown)
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Bridge Warning */}
      {!bridgeConnected && query && items.length === 0 && !loading && (
        <div className="p-3 bg-te-fuchsia/10 border border-te-fuchsia/20 rounded-xl text-xs text-te-cream-muted">
          <strong className="text-te-cream">Limited mode:</strong> Connect the AP bridge for full search.
          You can paste item IDs directly (e.g., <code className="bg-black/30 px-1 rounded text-te-cream">shirt-n_coolhoodie2024</code>)
        </div>
      )}

      {/* Selected Items */}
      {selectedItems.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-te-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-te-cream-muted">
              Selected ({selectedItems.length}/{maxItems})
            </span>
            <button
              onClick={() => onSelectionChange([])}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear all
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {selectedItems.map((item) => (
              <div 
                key={item.url} 
                className="relative group bg-te-panel border border-te-border rounded-lg overflow-hidden"
                style={{ width: '85px' }}
              >
                <img
                  src={item.url}
                  alt={item.name || 'Reference'}
                  className="w-full h-14 object-contain bg-te-bg"
                />
                <button
                  onClick={() => removeItem(item.url)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
                
                {item.name && (
                  <div className="px-1 py-0.5 border-t border-te-border bg-te-bg/50">
                    <p className="text-[8px] text-te-cream truncate">{item.name}</p>
                  </div>
                )}
                
                <div className="px-1.5 pb-1">
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.5"
                    value={item.strength}
                    onChange={e => updateStrength(item.url, parseFloat(e.target.value))}
                    className="w-full h-1 accent-fuchsia-500 cursor-pointer"
                  />
                  <div className="text-[9px] text-center text-te-cream-muted">
                    {item.strength > 0 ? '+' : ''}{item.strength}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
