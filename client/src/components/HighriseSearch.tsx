import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, Plus, Database, Sparkles } from 'lucide-react'
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
  prompt?: string
}

const HIGHRISE_CDN = 'https://cdn.highrisegame.com/avatar'

// Always search all item types

const ITEM_KEYWORDS = [
  'hoodie', 'hoodies', 'shirt', 'shirts', 'top', 'tops', 'sweater', 'sweaters', 
  'jacket', 'jackets', 'coat', 'coats', 'blazer', 'blazers', 'cardigan', 'cardigans',
  'tank', 'tanktop', 'tee', 'tshirt', 't-shirt', 'blouse', 'crop', 'croptop',
  'vest', 'polo', 'henley', 'turtleneck', 'sweatshirt',
  'pants', 'jeans', 'shorts', 'skirt', 'skirts', 'leggings', 'trousers',
  'joggers', 'sweatpants', 'cargo', 'denim', 'slacks', 'capris',
  'dress', 'dresses', 'jumpsuit', 'romper', 'overalls', 'fullsuit', 'suit', 'suits',
  'gown', 'outfit', 'costume', 'uniform',
  'shoes', 'boots', 'sneakers', 'heels', 'sandals', 'slippers', 'loafers',
  'flats', 'platforms', 'trainers', 'kicks', 'sock', 'socks',
  'hat', 'hats', 'cap', 'caps', 'beanie', 'beret', 'glasses', 'sunglasses',
  'bag', 'bags', 'purse', 'backpack', 'handbag', 'clutch', 'tote',
  'necklace', 'earrings', 'bracelet', 'watch', 'ring', 'jewelry', 'jewellery',
  'gloves', 'scarf', 'tie', 'bowtie', 'belt', 'headband', 'crown', 'tiara',
  'hair', 'wig', 'bangs', 'ponytail', 'braid', 'braids', 'afro', 'curls',
  'casual', 'formal', 'sporty', 'punk', 'goth', 'vintage', 'retro', 'elegant',
  'black', 'white', 'red', 'blue', 'green', 'pink', 'purple', 'yellow', 
  'orange', 'brown', 'gold', 'silver', 'pastel', 'neon',
  'leather', 'denim', 'silk', 'velvet', 'lace', 'cotton', 'wool', 'fur',
]

const extractKeywords = (prompt: string): string[] => {
  if (!prompt) return []
  
  const words = prompt.toLowerCase().replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(w => w.length > 2)
  const found: string[] = []
  
  for (const word of words) {
    const match = ITEM_KEYWORDS.find(kw => word === kw || word.startsWith(kw) || kw.startsWith(word))
    if (match && !found.includes(match)) {
      const singular = match.endsWith('s') && !match.endsWith('ss') ? match.slice(0, -1) : match
      if (!found.includes(singular)) found.push(singular)
    }
  }
  
  return found.slice(0, 3)
}

export default function HighriseSearch({ 
  selectedItems, 
  onSelectionChange, 
  disabled,
  maxItems = 15,
  prompt = ''
}: HighriseSearchProps) {
  const [query, setQuery] = useState('')
  const itemType = 'all' // Always search all types
  const [items, setItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [bridgeConnected, setBridgeConnected] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalPages, setTotalPages] = useState(0)
  
  const [smartItems, setSmartItems] = useState<HighriseItem[]>([])
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartKeywords, setSmartKeywords] = useState<string[]>([])
  const [showSmartSuggestions, setShowSmartSuggestions] = useState(true)

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

  const searchItems = useCallback(async (append = false) => {
    if (!query.trim() && !bridgeConnected) return
    
    const currentPage = append ? page + 1 : 0
    if (append) setLoadingMore(true)
    else { setLoading(true); setPage(0) }
    
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      params.set('type', itemType)
      params.set('limit', '40')
      params.set('page', String(currentPage))

      const res = await fetch(`${API_URL}/api/highrise/items?${params}`)
      const data = await res.json()
      
      if (append) { setItems(prev => [...prev, ...(data.items || [])]); setPage(currentPage) }
      else setItems(data.items || [])
      
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

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (query.trim() || bridgeConnected) searchItems(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, bridgeConnected])

  useEffect(() => {
    if (bridgeConnected && items.length === 0) searchItems(false)
  }, [bridgeConnected])

  useEffect(() => {
    const keywords = extractKeywords(prompt)
    setSmartKeywords(keywords)
    
    if (keywords.length === 0 || !bridgeConnected) { setSmartItems([]); return }

    const searchSmartItems = async () => {
      setSmartLoading(true)
      try {
        // Search 40 items per keyword to get good coverage
        const results = await Promise.all(keywords.map(async (keyword) => {
          const params = new URLSearchParams()
          params.set('q', keyword)
          params.set('type', 'clothing')
          params.set('limit', '40') // Increased from 10 - search more items per keyword
          const res = await fetch(`${API_URL}/api/highrise/items?${params}`)
          const data = await res.json()
          return data.items || []
        }))
        
        // Deduplicate and interleave results from different keywords
        const seenIds = new Set<string>()
        const allResults: HighriseItem[] = []
        const maxPerRound = Math.max(...results.map(r => r.length))
        
        for (let i = 0; i < maxPerRound; i++) {
          for (const items of results) {
            if (i < items.length && !seenIds.has(items[i].id)) {
              seenIds.add(items[i].id)
              allResults.push(items[i])
            }
          }
        }
        // Show up to 40 items so users see good variety
        setSmartItems(allResults.slice(0, 40))
      } catch (e) {
        console.error('Smart search failed:', e)
        setSmartItems([])
      } finally {
        setSmartLoading(false)
      }
    }

    const timeout = setTimeout(searchSmartItems, 500)
    return () => clearTimeout(timeout)
  }, [prompt, bridgeConnected])

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) searchItems(true)
  }, [loadingMore, hasMore, searchItems])

  const toggleItem = (item: HighriseItem) => {
    const alreadySelected = selectedItems.some(s => s.url === item.imageUrl)
    if (alreadySelected) onSelectionChange(selectedItems.filter(s => s.url !== item.imageUrl))
    else if (selectedItems.length < maxItems) onSelectionChange([...selectedItems, { url: item.imageUrl, strength: 1, name: item.name }])
  }

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

  const updateStrength = (url: string, strength: number) => {
    onSelectionChange(selectedItems.map(s => s.url === url ? { ...s, strength } : s))
  }

  const removeItem = (url: string) => {
    onSelectionChange(selectedItems.filter(s => s.url !== url))
  }

  const isSelected = (item: HighriseItem) => selectedItems.some(s => s.url === item.imageUrl)
  const isItemId = (text: string) => text.includes('-') && !text.includes(' ')

  const getRarityColor = (r: string) => {
    switch (r?.toLowerCase()) {
      case 'legendary': return 'border-yellow-400 bg-yellow-500/10'
      case 'epic': return 'border-purple-400 bg-purple-500/10'
      case 'rare': return 'border-blue-400 bg-blue-500/10'
      default: return 'border-te-border bg-te-lcd'
    }
  }

  const ItemButton = ({ item }: { item: HighriseItem }) => {
    const selected = isSelected(item)
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => toggleItem(item)}
        disabled={!selected && selectedItems.length >= maxItems}
        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
          selected
            ? 'border-te-fuchsia ring-2 ring-te-fuchsia/40 bg-te-fuchsia/10'
            : `${getRarityColor(item.rarity)} hover:border-te-fuchsia/60`
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title={item.name}
      >
        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-0.5" loading="lazy" />
        {selected && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute inset-0 bg-te-fuchsia/30 flex items-center justify-center"
          >
            <div className="w-5 h-5 bg-te-fuchsia rounded-full flex items-center justify-center shadow-lg">
              <X className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
          </motion.div>
        )}
      </motion.button>
    )
  }

  return (
    <div className="te-panel overflow-hidden">
      {/* Module Header */}
      <div className="te-module-header">
        <Database className="w-3.5 h-3.5 text-te-fuchsia" />
        <span>STYLE_ASSETS</span>
        <div className="flex-1" />
        
        {/* Counter display */}
        <div className="flex items-center gap-1 mr-3">
          <span className="font-mono text-[10px] text-te-cream-dim">{selectedItems.length}</span>
          <span className="font-mono text-[10px] text-te-cream-dim">/</span>
          <span className="font-mono text-[10px] text-te-cream-dim">{maxItems}</span>
        </div>
        
        <div className={`w-2 h-2 led ${bridgeConnected ? 'led-green led-pulse' : 'led-amber'}`} 
          title={bridgeConnected ? 'Connected' : 'Limited'} 
        />
      </div>

      <div className="p-4 space-y-4">
        {/* Search Row */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-te-cream-dim" />
            <input
              type="text"
              placeholder="SEARCH ASSETS..."
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
              className="te-input w-full pl-10 pr-4 py-2.5 text-sm"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-te-fuchsia te-spinner" />
            )}
          </div>

          {query.trim() && isItemId(query.trim()) && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => addItemById(query.trim())}
              disabled={disabled || selectedItems.length >= maxItems}
              className="te-button px-4"
            >
              <Plus className="w-4 h-4" />
            </motion.button>
          )}
        </div>

        {/* Smart Suggestions */}
        <AnimatePresence>
          {showSmartSuggestions && smartKeywords.length > 0 && bridgeConnected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border-2 border-te-fuchsia/40 bg-gradient-to-br from-te-fuchsia/5 to-transparent overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 bg-te-fuchsia/10 border-b border-te-fuchsia/20">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-te-fuchsia" />
                    <span className="font-mono text-[10px] text-te-fuchsia uppercase tracking-widest font-bold">
                      AUTO_SUGGEST
                    </span>
                    <div className="flex gap-1 ml-2">
                      {smartKeywords.map(kw => (
                        <span key={kw} className="px-2 py-0.5 bg-te-fuchsia/20 text-te-fuchsia text-[9px] font-mono rounded-full uppercase font-bold">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => setShowSmartSuggestions(false)} className="text-te-cream-dim hover:text-te-cream p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Content */}
                {smartLoading ? (
                  <div className="p-6 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 text-te-fuchsia te-spinner" />
                    <span className="font-mono text-[10px] text-te-cream-dim uppercase tracking-wider">Scanning Database...</span>
                  </div>
                ) : smartItems.length > 0 ? (
                  <div className="p-3 max-h-80 overflow-y-auto">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {smartItems.map(item => <ItemButton key={item.id} item={item} />)}
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-center font-mono text-[10px] text-te-cream-dim uppercase">
                    No matching assets
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle smart suggestions */}
        {!showSmartSuggestions && smartKeywords.length > 0 && bridgeConnected && (
          <button
            onClick={() => setShowSmartSuggestions(true)}
            className="flex items-center gap-2 font-mono text-[10px] text-te-fuchsia hover:text-te-cream transition-colors uppercase tracking-wider"
          >
            <Sparkles className="w-3 h-3" />
            Show suggestions for: {smartKeywords.join(', ')}
          </button>
        )}

        {/* Search Results */}
        <AnimatePresence>
          {isOpen && items.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border-2 border-te-border max-h-96 overflow-hidden bg-te-panel-dark"
            >
              {source && (
                <div className="px-3 py-1.5 border-b border-te-border font-mono text-[9px] text-te-cream-dim flex justify-between uppercase tracking-wider bg-te-panel">
                  <span>SRC: {source === 'bridge' ? 'FULL_DB' : 'LIMITED'}</span>
                  {totalPages > 0 && <span>PAGE {page + 1}/{totalPages}</span>}
                </div>
              )}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 p-3 max-h-80 overflow-y-auto">
                {items.map(item => <ItemButton key={item.id} item={item} />)}
              </div>
              
              {hasMore && (
                <div className="p-2 border-t border-te-border bg-te-panel">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full py-2 bg-te-panel-dark hover:bg-te-border font-mono text-[10px] text-te-cream rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 uppercase tracking-wider border border-te-border"
                  >
                    {loadingMore ? (
                      <><Loader2 className="w-3 h-3 te-spinner" /> Loading...</>
                    ) : (
                      <><Plus className="w-3 h-3" /> Load More</>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Limited mode warning */}
        {!bridgeConnected && (
          <div className="flex items-center gap-3 px-3 py-2 bg-te-lcd rounded-lg border border-te-border">
            <div className="w-2 h-2 led led-amber flex-shrink-0" />
            <span className="font-mono text-[10px] text-te-cream-dim uppercase tracking-wider">
              LIMITED MODE — PASTE ITEM IDS TO ADD ASSETS
            </span>
          </div>
        )}

        {/* Selected Items Rack */}
        {selectedItems.length > 0 && (
          <div className="space-y-3 pt-4 border-t-2 border-te-border">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
                LOADED_ASSETS [{selectedItems.length}]
              </span>
              <button
                onClick={() => onSelectionChange([])}
                className="font-mono text-[9px] text-te-led-red hover:text-red-400 uppercase tracking-wider flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                CLEAR
              </button>
            </div>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {selectedItems.map((item) => (
                <div 
                  key={item.url} 
                  className="relative group rounded-lg overflow-hidden border-2 border-te-fuchsia/50 bg-te-lcd"
                >
                  <img src={item.url} alt={item.name || 'Asset'} className="w-full aspect-square object-contain p-1" />
                  
                  {/* Remove button */}
                  <button
                    onClick={() => removeItem(item.url)}
                    className="absolute top-1 right-1 w-5 h-5 bg-te-led-red rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <X className="w-3 h-3 text-white" strokeWidth={3} />
                  </button>
                  
                  {/* Strength slider */}
                  <div className="px-1 pb-1 bg-te-panel">
                    <input
                      type="range"
                      min="-2"
                      max="2"
                      step="0.5"
                      value={item.strength}
                      onChange={e => updateStrength(item.url, parseFloat(e.target.value))}
                      className="w-full h-1 accent-te-fuchsia cursor-pointer"
                    />
                    <div className="font-mono text-[8px] text-center text-te-lcd-text">
                      {item.strength > 0 ? '+' : ''}{item.strength}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
