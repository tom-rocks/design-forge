import { Button } from './Button'
import { Flame, Hammer } from 'lucide-react'

interface ModeSwitchProps {
  mode: 'create' | 'edit'
  onChange: (mode: 'create' | 'edit') => void
  disabled?: boolean
}

export function ModeSwitch({ mode, onChange, disabled }: ModeSwitchProps) {
  return (
    <div className="btn-group mode-switch">
      <Button
        variant={mode === 'create' ? 'accent' : 'dark'}
        onClick={() => onChange('create')}
        disabled={disabled}
      >
        <Flame className="w-4 h-4" />
        Forge
      </Button>
      <Button
        variant={mode === 'edit' ? 'accent' : 'dark'}
        onClick={() => onChange('edit')}
        disabled={disabled}
      >
        <Hammer className="w-4 h-4" />
        Refine
      </Button>
    </div>
  )
}
