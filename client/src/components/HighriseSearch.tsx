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
  const [filteredItems, setFilteredItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Fetch items from API
  const fetchItems = useCallback(async (searchQuery: string, cat: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('q', searchQuery)
      if (cat) params.set('category', cat)
      params.set('limit', '100') // Fetch more to filter client-side

      const res = await fetch(`${API_URL}/api/highrise/items?${params}`)
      const data = await res.json()
      setItems(data.items || [])
    } catch (e) {
      console.error('Failed to fetch items:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Filter items client-side to match both ID and name
  useEffect(() => {
    if (!query.trim()) {
      setFilteredItems(items)
      return
    }
    
    const q = query.toLowerCase()
    const filtered = items.filter(item => 
      item.id.toLowerCase().includes(q) || 
      item.name.toLowerCase().includes(q)
    )
    setFilteredItems(filtered)
  }, [items, query])

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
      onSelectionChange([...selectedItems, { url: item.imageUrl, strength: 1 }])
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

  const getRarityColor = (r: string) => {
    switch (r) {
      case 'legendary': return 'border-yellow-500/50 bg-yellow-500/5'
      case 'epic': return 'border-purple-500/50 bg-purple-500/5'
      case 'rare': return 'border-blue-500/50 bg-blue-500/5'
      default: return 'border-forge-border'
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
              placeholder="Search Highrise items by name or ID..."
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
          {isOpen && filteredItems.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute z-20 left-0 right-0 mt-2 max-h-64 overflow-y-auto bg-forge-surface border border-forge-border rounded-xl shadow-xl"
            >
              <div className="grid grid-cols-5 gap-1 p-2">
                {filteredItems.slice(0, 50).map(item => (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item)}
                    disabled={!isSelected(item) && selectedItems.length >= maxItems}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected(item)
                        ? 'border-violet-500 ring-2 ring-violet-500/30'
                        : `${getRarityColor(item.rarity)} hover:border-violet-500/30`
                    } disabled:opacity-30 disabled:cursor-not-allowed`}
                    title={`${item.name} (${item.id})`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-contain bg-forge-bg"
                      loading="lazy"
                    />
                    {isSelected(item) && (
                      <div className="absolute inset-0 bg-violet-500/30 flex items-center justify-center">
                        <div className="w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {filteredItems.length > 50 && (
                <div className="px-3 py-2 text-xs text-forge-text-muted text-center border-t border-forge-border">
                  Showing 50 of {filteredItems.length} results. Refine your search.
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
            {selectedItems.map((item, i) => (
              <div 
                key={item.url} 
                className="relative group bg-forge-surface border border-forge-border rounded-lg p-1"
              >
                <img
                  src={item.url}
                  alt={`Reference ${i + 1}`}
                  className="w-14 h-14 object-contain"
                />
                <button
                  onClick={() => removeItem(item.url)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                
                {/* Strength slider */}
                <div className="mt-1">
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.5"
                    value={item.strength}
                    onChange={e => updateStrength(item.url, parseFloat(e.target.value))}
                    className="w-full h-1 accent-violet-500 cursor-pointer"
                    title={`Strength: ${item.strength}`}
                  />
                  <div className="text-[10px] text-center text-forge-text-muted">
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
