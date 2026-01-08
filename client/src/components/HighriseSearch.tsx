import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, ChevronDown } from 'lucide-react'
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

const CATEGORIES = [
  { id: '', label: 'All Categories' },
  { id: 'shirt', label: 'Shirts' },
  { id: 'dress', label: 'Dresses' },
  { id: 'pants', label: 'Pants' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'skirt', label: 'Skirts' },
  { id: 'jacket', label: 'Jackets' },
  { id: 'fullsuit', label: 'Fullsuits' },
  { id: 'hat', label: 'Hats' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'hair_front', label: 'Hair' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'bag', label: 'Bags' },
  { id: 'necklace', label: 'Necklaces' },
  { id: 'earrings', label: 'Earrings' },
]

export default function HighriseSearch({ 
  selectedItems, 
  onSelectionChange, 
  disabled,
  maxItems = 15 
}: HighriseSearchProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [items, setItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Fetch items from API (backend handles both name and ID search)
  const fetchItems = useCallback(async (searchQuery: string, cat: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('q', searchQuery)
      if (cat) params.set('category', cat)
      params.set('limit', '60')

      const res = await fetch(`${API_URL}/api/highrise/items?${params}`)
      const data = await res.json()
      setItems(data.items || [])
    } catch (e) {
      console.error('Failed to fetch items:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetchItems(query, category)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, category, fetchItems])

  // Initial load
  useEffect(() => {
    fetchItems('', '')
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isSelected = (item: HighriseItem) => 
    selectedItems.some(s => s.url === item.imageUrl)

  const toggleItem = (item: HighriseItem) => {
    if (isSelected(item)) {
      onSelectionChange(selectedItems.filter(s => s.url !== item.imageUrl))
    } else if (selectedItems.length < maxItems) {
      onSelectionChange([...selectedItems, { url: item.imageUrl, strength: 1, name: item.name }])
    }
  }

  const updateStrength = (url: string, strength: number) => {
    onSelectionChange(selectedItems.map(s => 
      s.url === url ? { ...s, strength } : s
    ))
  }

  const removeItem = (url: string) => {
    onSelectionChange(selectedItems.filter(s => s.url !== url))
  }

  const getRarityBorder = (r: string) => {
    switch (r) {
      case 'legendary': return 'border-yellow-500/60'
      case 'epic': return 'border-purple-500/60'
      case 'rare': return 'border-blue-500/60'
      default: return 'border-forge-border'
    }
  }

  const getRarityBg = (r: string) => {
    switch (r) {
      case 'legendary': return 'bg-yellow-500/10'
      case 'epic': return 'bg-purple-500/10'
      case 'rare': return 'bg-blue-500/10'
      default: return 'bg-forge-bg'
    }
  }

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div ref={containerRef} className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-muted" />
            <input
              type="text"
              placeholder="Search Highrise items (name or ID like 'hoodie')..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setIsOpen(true)}
              disabled={disabled}
              className="w-full pl-10 pr-4 py-2.5 bg-forge-surface border border-forge-border rounded-xl text-sm text-forge-text placeholder-forge-text-muted/50 focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400 animate-spin" />
            )}
          </div>
          
          <div className="relative">
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              disabled={disabled}
              className="appearance-none h-full px-3 pr-8 bg-forge-surface border border-forge-border rounded-xl text-sm text-forge-text focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            >
              {CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-muted pointer-events-none" />
          </div>
        </div>

        {/* Dropdown Results */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-20 left-0 right-0 mt-2 max-h-80 overflow-y-auto bg-forge-surface border border-forge-border rounded-xl shadow-xl"
            >
              {loading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-6 h-6 text-violet-400 animate-spin mx-auto" />
                  <p className="text-xs text-forge-text-muted mt-2">Searching...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center text-forge-text-muted text-sm">
                  {query ? `No items found for "${query}"` : 'Type to search items'}
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-3">
                  {items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleItem(item)}
                      disabled={!isSelected(item) && selectedItems.length >= maxItems}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${
                        isSelected(item)
                          ? 'border-violet-500 ring-2 ring-violet-500/30'
                          : `${getRarityBorder(item.rarity)} hover:border-violet-500/30`
                      } disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                      <div className={`aspect-square ${getRarityBg(item.rarity)}`}>
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      </div>
                      {isSelected(item) && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                      <div className="px-1.5 py-1 bg-forge-bg/90 border-t border-forge-border">
                        <p className="text-[10px] text-forge-text truncate font-medium">{item.name}</p>
                        <p className="text-[9px] text-forge-text-muted truncate">{item.id}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Selected Items with Strength Sliders */}
      {selectedItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-forge-text-muted">
              {selectedItems.length}/{maxItems} style references
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
                className="relative group bg-forge-surface border border-forge-border rounded-lg overflow-hidden"
                style={{ width: '80px' }}
              >
                <img
                  src={item.url}
                  alt={item.name || 'Reference'}
                  className="w-full h-16 object-contain bg-forge-bg"
                />
                <button
                  onClick={() => removeItem(item.url)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-2.5 h-2.5 text-white" />
                </button>
                
                {/* Name */}
                {item.name && (
                  <div className="px-1 py-0.5 border-t border-forge-border">
                    <p className="text-[9px] text-forge-text truncate">{item.name}</p>
                  </div>
                )}
                
                {/* Strength slider */}
                <div className="px-1 pb-1">
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.5"
                    value={item.strength}
                    onChange={e => updateStrength(item.url, parseFloat(e.target.value))}
                    className="w-full h-1 accent-violet-500 cursor-pointer"
                  />
                  <div className="text-[9px] text-center text-forge-text-muted">
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
