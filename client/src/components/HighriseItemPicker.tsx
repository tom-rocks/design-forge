import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check, Loader2, ChevronDown, Sparkles } from 'lucide-react'
import { API_URL } from '../config'

interface HighriseItem {
  id: string
  name: string
  category: string
  rarity: string
  imageUrl: string
}

interface HighriseItemPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (items: { url: string; strength: number }[]) => void
  selectedUrls: string[]
  maxItems?: number
}

const CATEGORIES = [
  { id: '', label: 'All' },
  { id: 'shirt', label: 'Shirts' },
  { id: 'dress', label: 'Dresses' },
  { id: 'pants', label: 'Pants' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'skirt', label: 'Skirts' },
  { id: 'jacket', label: 'Jackets' },
  { id: 'hat', label: 'Hats' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'hair_front', label: 'Hair (Front)' },
  { id: 'hair_back', label: 'Hair (Back)' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'bag', label: 'Bags' },
  { id: 'handbag', label: 'Handbags' },
  { id: 'necklace', label: 'Necklaces' },
  { id: 'earrings', label: 'Earrings' },
  { id: 'gloves', label: 'Gloves' },
  { id: 'fullsuit', label: 'Fullsuits' },
  { id: 'watch', label: 'Watches' },
  { id: 'tattoo', label: 'Tattoos' },
]

const RARITIES = [
  { id: '', label: 'All' },
  { id: 'none', label: 'Common' },
  { id: 'rare', label: 'Rare' },
  { id: 'epic', label: 'Epic' },
  { id: 'legendary', label: 'Legendary' },
]

export default function HighriseItemPicker({ 
  isOpen, 
  onClose, 
  onSelect, 
  selectedUrls,
  maxItems = 15 
}: HighriseItemPickerProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [rarity, setRarity] = useState('')
  const [items, setItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedUrls))
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)

  const searchItems = useCallback(async (append = false) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (category) params.set('category', category)
      if (rarity) params.set('rarity', rarity)
      if (append && cursor) params.set('starts_after', cursor)
      params.set('limit', '24')

      const res = await fetch(`${API_URL}/api/highrise/items?${params}`)
      const data = await res.json()
      
      if (append) {
        setItems(prev => [...prev, ...data.items])
      } else {
        setItems(data.items || [])
      }
      setHasMore(data.hasMore)
      setCursor(data.nextCursor)
    } catch (e) {
      console.error('Failed to search items:', e)
    } finally {
      setLoading(false)
    }
  }, [query, category, rarity, cursor])

  // Initial load and search on filter change
  useEffect(() => {
    if (isOpen) {
      setCursor(null)
      searchItems(false)
    }
  }, [isOpen, query, category, rarity])

  // Sync selected with external selectedUrls
  useEffect(() => {
    setSelected(new Set(selectedUrls))
  }, [selectedUrls])

  const toggleSelect = (item: HighriseItem) => {
    const newSelected = new Set(selected)
    if (newSelected.has(item.imageUrl)) {
      newSelected.delete(item.imageUrl)
    } else if (newSelected.size < maxItems) {
      newSelected.add(item.imageUrl)
    }
    setSelected(newSelected)
  }

  const handleConfirm = () => {
    const styleImages = Array.from(selected).map(url => ({ url, strength: 1 }))
    onSelect(styleImages)
    onClose()
  }

  const getRarityColor = (r: string) => {
    switch (r) {
      case 'legendary': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
      case 'epic': return 'text-purple-400 bg-purple-500/10 border-purple-500/30'
      case 'rare': return 'text-blue-400 bg-blue-500/10 border-blue-500/30'
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/30'
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-4xl max-h-[85vh] bg-forge-surface border border-forge-border rounded-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b border-forge-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                <h2 className="text-lg font-semibold text-forge-text">Highrise Items</h2>
                <span className="text-xs text-forge-text-muted">
                  ({selected.size}/{maxItems} selected)
                </span>
              </div>
              <button onClick={onClose} className="p-1 text-forge-text-muted hover:text-forge-text">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-muted" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-forge-bg border border-forge-border rounded-lg text-sm text-forge-text placeholder-forge-text-muted focus:outline-none focus:border-violet-500/50"
                />
              </div>

              {/* Category dropdown */}
              <div className="relative">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="appearance-none px-4 py-2 pr-8 bg-forge-bg border border-forge-border rounded-lg text-sm text-forge-text focus:outline-none focus:border-violet-500/50"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-muted pointer-events-none" />
              </div>

              {/* Rarity dropdown */}
              <div className="relative">
                <select
                  value={rarity}
                  onChange={e => setRarity(e.target.value)}
                  className="appearance-none px-4 py-2 pr-8 bg-forge-bg border border-forge-border rounded-lg text-sm text-forge-text focus:outline-none focus:border-violet-500/50"
                >
                  {RARITIES.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-muted pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-forge-text-muted">
                No items found. Try a different search.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3">
                  {items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleSelect(item)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        selected.has(item.imageUrl)
                          ? 'border-violet-500 ring-2 ring-violet-500/30'
                          : 'border-forge-border hover:border-forge-muted'
                      }`}
                      title={item.name}
                    >
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-contain bg-forge-bg"
                        loading="lazy"
                      />
                      {selected.has(item.imageUrl) && (
                        <div className="absolute inset-0 bg-violet-500/20 flex items-center justify-center">
                          <Check className="w-6 h-6 text-violet-400" />
                        </div>
                      )}
                      <div className={`absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[10px] truncate border-t ${getRarityColor(item.rarity)}`}>
                        {item.name}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="flex justify-center mt-4">
                    <button
                      onClick={() => searchItems(true)}
                      disabled={loading}
                      className="px-4 py-2 bg-forge-bg border border-forge-border rounded-lg text-sm text-forge-text hover:border-violet-500/50 disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Load More'
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-forge-border flex items-center justify-between">
            <div className="text-sm text-forge-text-muted">
              {selected.size > 0 && `${selected.size} item${selected.size > 1 ? 's' : ''} selected`}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelected(new Set())}
                className="px-4 py-2 text-sm text-forge-text-muted hover:text-forge-text transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={handleConfirm}
                disabled={selected.size === 0}
                className="px-6 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add {selected.size} as References
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
