import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sliders, ChevronDown, ChevronUp, Zap, Sparkles } from 'lucide-react'
import type { GenerationSettings, GeminiModel } from '../App'

interface SettingsPanelProps {
  settings: GenerationSettings
  onChange: (settings: GenerationSettings) => void
  disabled?: boolean
}

const models: { id: GeminiModel; label: string; desc: string; icon: typeof Zap; maxRefs: number }[] = [
  { id: 'flash', label: 'FLASH', desc: '3 refs • 1K • Fast', icon: Zap, maxRefs: 3 },
  { id: 'pro', label: 'PRO', desc: '5 refs • 4K • Quality', icon: Sparkles, maxRefs: 5 },
]

const resolutions: { id: '1024' | '2048' | '4096'; label: string; desc: string; proOnly?: boolean }[] = [
  { id: '1024', label: '1K', desc: '1024px' },
  { id: '2048', label: '2K', desc: '2048px', proOnly: true },
  { id: '4096', label: '4K', desc: '4096px', proOnly: true },
]

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

  const handleModelChange = (model: GeminiModel) => {
    // If switching to flash and resolution is high, downgrade to 1K
    const newSettings = { ...settings, model }
    if (model === 'flash' && settings.resolution !== '1024') {
      newSettings.resolution = '1024'
    }
    onChange(newSettings)
  }

  const isPro = settings.model === 'pro'

  return (
    <div className="te-panel flex-1 overflow-hidden">
      {/* Module Header */}
      <div className="te-module-header">
        <Sliders className="w-3.5 h-3.5 text-te-fuchsia" />
        <span>CONTROL_PARAMETERS</span>
        <div className="flex-1" />
        <div className={`w-2 h-2 led ${disabled ? 'led-amber' : 'led-green'}`} />
      </div>

      <div className="p-4 space-y-5">
        {/* Model Selection - First and prominent */}
        <div className="space-y-2">
          <label className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
            MODEL_ENGINE
          </label>
          <div className="grid grid-cols-2 gap-2">
            {models.map((model) => {
              const Icon = model.icon
              const isSelected = settings.model === model.id
              return (
                <button
                  key={model.id}
                  onClick={() => handleModelChange(model.id)}
                  disabled={disabled}
                  className={`relative px-4 py-3 font-mono text-left transition-all duration-150 rounded-lg border-2 ${
                    isSelected
                      ? 'bg-te-fuchsia/20 text-te-cream border-te-fuchsia shadow-te-glow'
                      : 'bg-te-panel-dark text-te-cream-muted border-te-border hover:border-te-fuchsia/50 hover:text-te-cream'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-te-fuchsia' : ''}`} />
                    <span className="text-sm font-bold tracking-wider">{model.label}</span>
                  </div>
                  <div className="text-[9px] text-te-cream-dim uppercase tracking-wider">
                    {model.desc}
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 led led-green" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Control Groups */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          
          {/* Resolution Module */}
          <div className="space-y-2">
            <label className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
              OUTPUT_RES
            </label>
            <div className="flex gap-1">
              {resolutions.map((res) => {
                const isDisabled = res.proOnly && !isPro
                return (
                  <button
                    key={res.id}
                    onClick={() => updateSetting('resolution', res.id)}
                    disabled={disabled || isDisabled}
                    className={`flex-1 px-2 py-2 font-mono text-xs font-bold uppercase tracking-wider transition-all duration-150 rounded-md border-2 ${
                      settings.resolution === res.id
                        ? 'bg-te-fuchsia text-white border-te-fuchsia shadow-te-glow'
                        : isDisabled
                          ? 'bg-te-panel-dark/50 text-te-cream-dim/50 border-te-border/50 cursor-not-allowed'
                          : 'bg-te-panel-dark text-te-cream-muted border-te-border hover:border-te-fuchsia/50 hover:text-te-cream'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={isDisabled ? 'Requires Pro model' : res.desc}
                  >
                    {res.label}
                  </button>
                )
              })}
            </div>
            {!isPro && (
              <div className="text-[8px] text-te-cream-dim font-mono uppercase">
                2K/4K requires PRO model
              </div>
            )}
          </div>

          {/* Aspect Ratio Module */}
          <div className="space-y-2">
            <label className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
              ASPECT_RATIO
            </label>
            <div className="grid grid-cols-5 gap-1">
              {aspectRatios.slice(0, 5).map((ar) => (
                <button
                  key={ar.id}
                  onClick={() => updateSetting('aspectRatio', ar.id)}
                  disabled={disabled}
                  className={`px-1.5 py-1.5 font-mono text-[10px] font-bold transition-all duration-150 rounded-md border-2 ${
                    settings.aspectRatio === ar.id
                      ? 'bg-te-fuchsia text-white border-te-fuchsia'
                      : 'bg-te-panel-dark text-te-cream-muted border-te-border hover:border-te-fuchsia/50 hover:text-te-cream'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title={ar.name}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>

          {/* Variations Module */}
          <div className="space-y-2">
            <label className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
              VARIATIONS
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  onClick={() => updateSetting('numImages', num)}
                  disabled={disabled}
                  className={`flex-1 aspect-square max-w-[40px] font-mono text-sm font-bold transition-all duration-150 rounded-md border-2 ${
                    settings.numImages === num
                      ? 'bg-te-fuchsia text-white border-te-fuchsia'
                      : 'bg-te-panel-dark text-te-cream-muted border-te-border hover:border-te-fuchsia/50 hover:text-te-cream'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Advanced Toggle */}
        <button
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className="flex items-center gap-2 font-mono text-[10px] text-te-cream-muted hover:text-te-fuchsia transition-colors uppercase tracking-widest"
        >
          <span className="w-4 h-px bg-te-border" />
          <span>ADVANCED_OPTIONS</span>
          {isAdvancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span className="flex-1 h-px bg-te-border" />
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
                  <label className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
                    EXTENDED_RATIOS
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {aspectRatios.slice(5).map((ar) => (
                      <button
                        key={ar.id}
                        onClick={() => updateSetting('aspectRatio', ar.id)}
                        disabled={disabled}
                        className={`px-2.5 py-1.5 font-mono text-[10px] font-bold transition-all duration-150 rounded-md border-2 ${
                          settings.aspectRatio === ar.id
                            ? 'bg-te-fuchsia text-white border-te-fuchsia'
                            : 'bg-te-panel-dark text-te-cream-muted border-te-border hover:border-te-fuchsia/50 hover:text-te-cream'
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
                  <label className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
                    NEGATIVE_PROMPT
                  </label>
                  <input
                    type="text"
                    value={settings.negativePrompt}
                    onChange={(e) => updateSetting('negativePrompt', e.target.value)}
                    disabled={disabled}
                    placeholder="exclusions..."
                    className="te-input w-full px-3 py-2 text-sm"
                  />
                </div>

                {/* Seed */}
                <div className="space-y-2">
                  <label className="font-mono text-[10px] text-te-cream-muted uppercase tracking-widest">
                    SEED_VALUE
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={settings.seed}
                      onChange={(e) => updateSetting('seed', e.target.value.replace(/\D/g, ''))}
                      disabled={disabled}
                      placeholder="auto"
                      className="te-input w-32 px-3 py-2 text-sm"
                    />
                    <span className="font-mono text-[9px] text-te-cream-dim uppercase">for reproducibility</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
