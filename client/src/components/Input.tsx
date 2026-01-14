import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rows?: number
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`input ${className}`}
        {...props}
      />
    )
  }
)

Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className = '', rows = 3, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`textarea ${className}`}
        rows={rows}
        {...props}
      />
    )
  }
)

Textarea.displayName = 'Textarea'
