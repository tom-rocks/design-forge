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
  const itemType = 'all'
  const [items, setItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [bridgeConnected, setBridgeConnected] = useState(false)
  const isOpen = true // Always open
  const [source, setSource] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalPages, setTotalPages] = useState(0)
  
  // Preview modal state
  const [previewItem, setPreviewItem] = useState<HighriseItem | null>(null)

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

  // Debounced search
  useEffect(() => {
    if (!query.trim() && !bridgeConnected) return
    
    const timeout = setTimeout(() => {
      searchItems(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  // Initial load
  useEffect(() => {
    if (bridgeConnected && items.length === 0) {
      searchItems(false)
    }
  }, [bridgeConnected])

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      searchItems(true)
    }
  }, [loadingMore, hasMore, searchItems])

  const addItemById = async (id: string) => {
    const url = `${HIGHRISE_CDN}/${id}.png`
    if (selectedItems.some(s => s.url === url) || selectedItems.length >= maxItems) return
    
    try {
      const res = await fetch(`${API_URL}/api/highrise/items/${id}`)
      if (res.ok) {
        const item = await res.json()
        onSelectionChange([...selectedItems, { url: item.imageUrl || url, strength: 1, name: item.name || id }])
      } else {
        onSelectionChange([...selectedItems, { url, strength: 1, name: id }])
      }
    } catch {
      onSelectionChange([...selectedItems, { url, strength: 1, name: id }])
    }
    setQuery('')
  }

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
      default: return 'border-gray-700'
    }
  }

  return (
    <>
      <div className="te-panel overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
          <Search className="w-4 h-4 text-purple-400" />
          <span className="font-mono text-xs uppercase tracking-wider text-gray-300">Highrise Items</span>
          <div className="flex-1" />
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] ${
            bridgeConnected 
              ? 'bg-purple-500/10 text-purple-400' 
              : 'bg-gray-700/50 text-gray-500'
          }`}>
            {bridgeConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {bridgeConnected ? 'Full' : 'Limited'}
          </div>
          <span className="font-mono text-[9px] text-gray-500">DRAG TO CRUCIBLE</span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-white/10">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder={bridgeConnected ? "Search items..." : "Paste item ID..."}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && query.trim() && isItemId(query.trim())) {
                    e.preventDefault()
                    addItemById(query.trim())
                  }
                }}
                disabled={disabled}
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                </div>
              )}
            </div>

            {query.trim() && isItemId(query.trim()) && (
              <button
                onClick={() => addItemById(query.trim())}
                disabled={disabled || selectedItems.length >= maxItems}
                className="px-3 bg-purple-500 hover:bg-purple-400 text-white rounded-lg disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Results Grid */}
        {isOpen && items.length > 0 && (
          <div className="max-h-[280px] overflow-y-auto">
            {source && (
              <div className="px-3 py-1.5 border-b border-white/5 text-[10px] text-gray-500 flex justify-between">
                <span>{source === 'bridge' ? '✓ Full catalog' : '⚠️ Limited'}</span>
                {totalPages > 0 && <span>Page {page + 1}/{totalPages}</span>}
              </div>
            )}
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 p-3">
              {items.map(item => {
                const selected = isSelected(item)
                return (
                  <div
                    key={item.id}
                    draggable={!selected && !disabled}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-reference', JSON.stringify({
                        id: `hr-${item.id}`,
                        url: item.imageUrl,
                        name: item.name,
                        type: 'highrise',
                      }))
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => setPreviewItem(item)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing ${
                      selected
                        ? 'border-purple-500 ring-2 ring-purple-500/30 cursor-pointer'
                        : `${getRarityColor(item.rarity)} hover:border-purple-500/50`
                    } ${!selected && selectedItems.length >= maxItems ? 'opacity-40' : ''}`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-contain bg-gray-950 pointer-events-none"
                    />
                    {selected && (
                      <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            
            {/* Load More */}
            {hasMore && (
              <div className="p-3 border-t border-white/5">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Load More
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && !loading && (
          <div className="p-8 text-center text-gray-500">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="font-mono text-xs">
              {bridgeConnected ? 'Search for items' : 'Connect bridge for search'}
            </p>
          </div>
        )}
      </div>

      {/* Preview Modal - Tap to enlarge */}
      <AnimatePresence>
        {previewItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setPreviewItem(null)}
          >
            {/* Close button */}
            <button
              onClick={() => setPreviewItem(null)}
              className="absolute top-4 right-4 p-2 bg-gray-900 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Item preview */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative"
            >
              <div className="bg-gray-900 rounded-xl border-2 border-gray-700 p-4 max-w-sm">
                <img
                  src={previewItem.imageUrl}
                  alt={previewItem.name}
                  className="w-64 h-64 object-contain mx-auto bg-gray-950 rounded-lg"
                />
                
                {/* Item info */}
                <div className="mt-4 text-center">
                  <h3 className="font-mono text-sm text-gray-200 truncate">{previewItem.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 capitalize">
                    {previewItem.category} · {previewItem.rarity || 'Common'}
                  </p>
                </div>

                {/* Add button */}
                <button
                  onClick={() => {
                    if (!isSelected(previewItem) && selectedItems.length < maxItems) {
                      onSelectionChange([...selectedItems, { 
                        url: previewItem.imageUrl, 
                        strength: 1, 
                        name: previewItem.name 
                      }])
                    }
                    setPreviewItem(null)
                  }}
                  disabled={disabled || isSelected(previewItem) || selectedItems.length >= maxItems}
                  className="w-full mt-4 py-3 bg-orange-500 hover:bg-orange-400 text-white font-mono text-sm uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSelected(previewItem) ? 'Already Added' : '+ Add to Crucible'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
