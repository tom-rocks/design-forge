type LEDState = 'off' | 'on' | 'success' | 'error'

interface LEDProps {
  state?: LEDState
  className?: string
}

export function LED({ state = 'off', className = '' }: LEDProps) {
  const stateClass = state !== 'off' ? state : ''
  
  return (
    <div className={`led ${stateClass} ${className}`} />
  )
}
