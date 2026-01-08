import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, ChevronDown, ChevronUp } from 'lucide-react'
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

  const updateSetting = <K extends keyof GenerationSettings>(
    key: K,
    value: GenerationSettings[K]
  ) => {
    onChange({ ...settings, [key]: value })
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
        <span>Advanced</span>
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
            <div className="space-y-4 pt-2">
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
                  placeholder="For reproducibility"
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
