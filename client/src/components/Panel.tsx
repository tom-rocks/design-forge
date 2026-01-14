import { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  className?: string
}

interface PanelHeaderProps {
  children: ReactNode
  className?: string
  led?: 'off' | 'on' | 'success' | 'error'
}

export function Panel({ children, className = '' }: PanelProps) {
  return (
    <div className={`panel ${className}`}>
      {children}
    </div>
  )
}

export function PanelHeader({ children, className = '', led }: PanelHeaderProps) {
  return (
    <div className={`panel-header ${className}`}>
      {children}
      {led && (
        <div className={`led ml-auto ${led !== 'off' ? led : ''}`} />
      )}
    </div>
  )
}

export function PanelBody({ children, className = '' }: PanelProps) {
  return (
    <div className={`panel-body ${className}`}>
      {children}
    </div>
  )
}

export function PanelInset({ children, className = '' }: PanelProps) {
  return (
    <div className={`panel-inset ${className}`}>
      {children}
    </div>
  )
}
