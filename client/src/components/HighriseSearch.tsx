import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2, Plus, ExternalLink } from 'lucide-react'
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
  const [itemId, setItemId] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [recentItems, setRecentItems] = useState<HighriseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)

  // Load some recent items for browsing
  useEffect(() => {
    const fetchRecent = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_URL}/api/highrise/items?limit=30`)
        const data = await res.json()
        setRecentItems(data.items || [])
      } catch (e) {
        console.error('Failed to fetch items:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchRecent()
  }, [])

  // Preview item when ID changes
  useEffect(() => {
    if (!itemId.trim()) {
      setPreviewUrl(null)
      setPreviewError(false)
      return
    }
    
    const url = `${HIGHRISE_CDN}/${itemId.trim()}.png`
    setPreviewUrl(url)
    setPreviewError(false)
  }, [itemId])

  const addItem = (id: string, name?: string) => {
    const url = `${HIGHRISE_CDN}/${id}.png`
    if (!selectedItems.some(s => s.url === url) && selectedItems.length < maxItems) {
      onSelectionChange([...selectedItems, { url, strength: 1, name: name || id }])
      setItemId('')
      setPreviewUrl(null)
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

  const isSelected = (id: string) => {
    const url = `${HIGHRISE_CDN}/${id}.png`
    return selectedItems.some(s => s.url === url)
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-forge-text">Style References</h3>
          <p className="text-xs text-forge-text-muted">
            Add Highrise items as style context ({selectedItems.length}/{maxItems})
          </p>
        </div>
        <a
          href="https://highrise.game/en/catalog"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
        >
          Browse Catalog <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Item ID Input */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-text-muted" />
          <input
            type="text"
            placeholder="Paste item ID (e.g. shirt-n_coolhoodie2024)"
            value={itemId}
            onChange={e => setItemId(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && itemId.trim()) {
                e.preventDefault()
                addItem(itemId.trim())
              }
            }}
            disabled={disabled}
            className="w-full pl-10 pr-4 py-2.5 bg-forge-surface border border-forge-border rounded-xl text-sm text-forge-text placeholder-forge-text-muted/50 focus:outline-none focus:border-violet-500/50 disabled:opacity-50 font-mono"
          />
        </div>
        <button
          onClick={() => itemId.trim() && addItem(itemId.trim())}
          disabled={disabled || !itemId.trim() || selectedItems.length >= maxItems}
          className="px-4 py-2.5 bg-violet-500 hover:bg-violet-600 disabled:bg-forge-surface disabled:text-forge-text-muted text-white rounded-xl transition-colors disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Preview */}
      {previewUrl && (
        <div className="flex items-center gap-3 p-3 bg-forge-surface border border-forge-border rounded-xl">
          <div className="w-16 h-16 bg-forge-bg rounded-lg overflow-hidden flex-shrink-0">
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-full object-contain"
              onError={() => setPreviewError(true)}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-forge-text-muted truncate font-mono">{itemId}</p>
            {previewError ? (
              <p className="text-xs text-red-400">Item not found - check the ID</p>
            ) : (
              <p className="text-xs text-green-400">✓ Valid item</p>
            )}
          </div>
          {!previewError && (
            <button
              onClick={() => addItem(itemId.trim())}
              disabled={isSelected(itemId.trim())}
              className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:bg-forge-muted text-white text-xs rounded-lg"
            >
              {isSelected(itemId.trim()) ? 'Added' : 'Add'}
            </button>
          )}
        </div>
      )}

      {/* Browse Recent Toggle */}
      <button
        onClick={() => setShowBrowse(!showBrowse)}
        className="text-xs text-forge-text-muted hover:text-forge-text"
      >
        {showBrowse ? '▼ Hide recent items' : '▶ Browse recent items'}
      </button>

      {/* Recent Items Grid */}
      <AnimatePresence>
        {showBrowse && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {loading ? (
              <div className="py-4 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-violet-400" />
              </div>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 py-2">
                {recentItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item.id, item.name)}
                    disabled={isSelected(item.id) || selectedItems.length >= maxItems}
                    className={`relative aspect-square rounded-lg overflow-hidden border transition-all ${
                      isSelected(item.id)
                        ? 'border-violet-500 opacity-50'
                        : 'border-forge-border hover:border-violet-500/50'
                    } disabled:cursor-not-allowed`}
                    title={`${item.name}\n${item.id}`}
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-contain bg-forge-bg"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-forge-text-muted text-center">
              Note: Public API only shows limited items. Use the catalog link above to find items and paste their IDs.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Items with Strength Sliders */}
      {selectedItems.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-forge-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-forge-text-muted font-medium">
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
                className="relative group bg-forge-surface border border-forge-border rounded-lg overflow-hidden"
                style={{ width: '90px' }}
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
                  <div className="px-1 py-0.5 border-t border-forge-border bg-forge-bg/50">
                    <p className="text-[8px] text-forge-text truncate">{item.name}</p>
                  </div>
                )}
                
                {/* Strength slider */}
                <div className="px-1.5 pb-1">
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
