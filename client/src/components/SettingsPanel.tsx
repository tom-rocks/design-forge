import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, ChevronDown, ChevronUp, ImagePlus, X, Palette } from 'lucide-react'
import type { GenerationSettings } from '../App'

interface SettingsPanelProps {
  settings: GenerationSettings
  onChange: (settings: GenerationSettings) => void
  disabled?: boolean
}

const resolutions = [
  { id: '1024', label: '1K', desc: '1024px' },
  { id: '2048', label: '2K', desc: '2048px' },
  { id: '4096', label: '4K', desc: '4096px' },
] as const

const aspectRatios = [
  { id: '1:1', label: '1:1', name: 'Square' },
  { id: '16:9', label: '16:9', name: 'Wide' },
  { id: '9:16', label: '9:16', name: 'Tall' },
  { id: '4:3', label: '4:3', name: 'Standard' },
  { id: '3:4', label: '3:4', name: 'Portrait' },
  { id: '21:9', label: '21:9', name: 'Ultra' },
  { id: '3:2', label: '3:2', name: 'Photo' },
  { id: '2:3', label: '2:3', name: 'Photo V' },
] as const

export default function SettingsPanel({ settings, onChange, disabled }: SettingsPanelProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const styleImageInput = useRef<HTMLInputElement>(null)
  const referenceInput = useRef<HTMLInputElement>(null)

  const updateSetting = <K extends keyof GenerationSettings>(
    key: K,
    value: GenerationSettings[K]
  ) => {
    onChange({ ...settings, [key]: value })
  }

  const handleStyleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Convert to base64 data URL for preview and sending
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const current = settings.styleImages || []
      if (current.length < 4) {
        updateSetting('styleImages', [...current, { url, strength: 1 }])
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      const current = settings.references || []
      updateSetting('references', [...current, { 
        name: `reference-${current.length + 1}`, 
        images: [{ url }] 
      }])
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const removeStyleImage = (index: number) => {
    const current = settings.styleImages || []
    updateSetting('styleImages', current.filter((_, i) => i !== index))
  }

  const updateStyleStrength = (index: number, strength: number) => {
    const current = settings.styleImages || []
    const updated = [...current]
    updated[index] = { ...updated[index], strength }
    updateSetting('styleImages', updated)
  }

  const removeReference = (index: number) => {
    const current = settings.references || []
    updateSetting('references', current.filter((_, i) => i !== index))
  }

  return (
    <div className="flex-1 space-y-4">
      {/* Model Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/20 rounded-full">
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
        <span className="text-xs font-medium text-blue-300">Gemini Pro 3</span>
      </div>

      {/* Quick Settings */}
      <div className="flex flex-wrap gap-6">
        {/* Resolution */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider">
            Resolution
          </label>
          <div className="flex gap-1">
            {resolutions.map((res) => (
              <button
                key={res.id}
                onClick={() => updateSetting('resolution', res.id)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  settings.resolution === res.id
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'bg-forge-surface border border-forge-border text-forge-text-muted hover:text-forge-text hover:border-forge-muted'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {res.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider">
            Aspect Ratio
          </label>
          <div className="flex flex-wrap gap-1">
            {aspectRatios.slice(0, 5).map((ar) => (
              <button
                key={ar.id}
                onClick={() => updateSetting('aspectRatio', ar.id)}
                disabled={disabled}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  settings.aspectRatio === ar.id
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'bg-forge-surface border border-forge-border text-forge-text-muted hover:text-forge-text hover:border-forge-muted'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title={ar.name}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>

        {/* Num Images */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider">
            Variations
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((num) => (
              <button
                key={num}
                onClick={() => updateSetting('numImages', num)}
                disabled={disabled}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-all duration-200 ${
                  settings.numImages === num
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                    : 'bg-forge-surface border border-forge-border text-forge-text-muted hover:text-forge-text hover:border-forge-muted'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Advanced Settings Toggle */}
      <button
        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        className="flex items-center gap-2 text-xs text-forge-text-muted hover:text-forge-text transition-colors"
      >
        <Settings className="w-3 h-3" />
        <span>Advanced Settings</span>
        {isAdvancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Advanced Settings Panel */}
      <AnimatePresence>
        {isAdvancedOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-5 pt-2 pb-2">
              {/* More Aspect Ratios */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider">
                  More Aspect Ratios
                </label>
                <div className="flex flex-wrap gap-1">
                  {aspectRatios.slice(5).map((ar) => (
                    <button
                      key={ar.id}
                      onClick={() => updateSetting('aspectRatio', ar.id)}
                      disabled={disabled}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        settings.aspectRatio === ar.id
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                          : 'bg-forge-surface border border-forge-border text-forge-text-muted hover:text-forge-text hover:border-forge-muted'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      title={ar.name}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Style Reference Images */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Palette className="w-3 h-3" />
                  Style Reference (up to 4)
                </label>
                <p className="text-xs text-forge-text-muted/70">
                  Upload images to influence the style of your generation
                </p>
                <div className="flex flex-wrap gap-2">
                  {(settings.styleImages || []).map((img, i) => (
                    <div key={i} className="relative group">
                      <img 
                        src={img.url} 
                        alt={`Style ${i + 1}`}
                        className="w-16 h-16 object-cover rounded-lg border border-forge-border"
                      />
                      <button
                        onClick={() => removeStyleImage(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.5"
                        value={img.strength}
                        onChange={(e) => updateStyleStrength(i, parseFloat(e.target.value))}
                        className="absolute -bottom-3 left-0 w-16 h-1 accent-violet-500"
                        title={`Strength: ${img.strength}`}
                      />
                    </div>
                  ))}
                  {(settings.styleImages || []).length < 4 && (
                    <button
                      onClick={() => styleImageInput.current?.click()}
                      disabled={disabled}
                      className="w-16 h-16 rounded-lg border border-dashed border-forge-border hover:border-violet-500/50 flex items-center justify-center text-forge-text-muted hover:text-violet-400 transition-colors disabled:opacity-50"
                    >
                      <ImagePlus className="w-5 h-5" />
                    </button>
                  )}
                  <input
                    ref={styleImageInput}
                    type="file"
                    accept="image/*"
                    onChange={handleStyleImageUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Reference Images */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider flex items-center gap-2">
                  <ImagePlus className="w-3 h-3" />
                  Reference Images
                </label>
                <p className="text-xs text-forge-text-muted/70">
                  Add images for the AI to reference during generation
                </p>
                <div className="flex flex-wrap gap-2">
                  {(settings.references || []).map((ref, i) => (
                    <div key={i} className="relative group">
                      <img 
                        src={ref.images[0]?.url} 
                        alt={ref.name}
                        className="w-16 h-16 object-cover rounded-lg border border-forge-border"
                      />
                      <button
                        onClick={() => removeReference(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => referenceInput.current?.click()}
                    disabled={disabled}
                    className="w-16 h-16 rounded-lg border border-dashed border-forge-border hover:border-violet-500/50 flex items-center justify-center text-forge-text-muted hover:text-violet-400 transition-colors disabled:opacity-50"
                  >
                    <ImagePlus className="w-5 h-5" />
                  </button>
                  <input
                    ref={referenceInput}
                    type="file"
                    accept="image/*"
                    onChange={handleReferenceUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Negative Prompt */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider">
                  Negative Prompt
                </label>
                <input
                  type="text"
                  value={settings.negativePrompt}
                  onChange={(e) => updateSetting('negativePrompt', e.target.value)}
                  disabled={disabled}
                  placeholder="Things to avoid..."
                  className="w-full px-3 py-2 bg-forge-surface border border-forge-border rounded-lg text-sm text-forge-text placeholder-forge-text-muted/50 focus:outline-none focus:border-forge-muted disabled:opacity-50"
                />
              </div>

              {/* Seed */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-forge-text-muted uppercase tracking-wider">
                  Seed
                </label>
                <input
                  type="text"
                  value={settings.seed}
                  onChange={(e) => updateSetting('seed', e.target.value.replace(/\D/g, ''))}
                  disabled={disabled}
                  placeholder="Random seed for reproducibility"
                  className="w-full max-w-[200px] px-3 py-2 bg-forge-surface border border-forge-border rounded-lg text-sm text-forge-text placeholder-forge-text-muted/50 focus:outline-none focus:border-forge-muted font-mono disabled:opacity-50"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
