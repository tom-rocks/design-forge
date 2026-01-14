import { forwardRef, ReactNode } from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'

type ButtonVariant = 'dark' | 'accent' | 'ghost'

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: ButtonVariant
  isLoading?: boolean
  children: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  dark: 'btn-dark',
  accent: 'btn-accent',
  ghost: 'btn-ghost',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'dark', isLoading, className = '', children, disabled, ...props }, ref) => {
    const classes = [
      'btn',
      variantClasses[variant],
      isLoading && 'btn-forging',
      className,
    ].filter(Boolean).join(' ')

    return (
      <motion.button
        ref={ref}
        className={classes}
        disabled={disabled || isLoading}
        whileTap={!disabled && !isLoading ? { y: 2 } : undefined}
        transition={{ duration: 0.1 }}
        {...props}
      >
        {children}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'
