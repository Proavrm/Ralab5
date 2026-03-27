/**
 * components/ui/Button.jsx
 */
import { cn } from '@/lib/utils'

const variants = {
  primary: 'bg-accent hover:bg-accent-hover text-white border-accent',
  secondary: 'bg-surface hover:bg-bg text-text border-border',
  danger: 'bg-surface hover:bg-red-50 text-danger border-red-200',
  ghost: 'bg-transparent hover:bg-bg text-text border-transparent',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

export default function Button({
  children, variant = 'secondary', size = 'md',
  className, disabled, onClick, type = 'button', ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded border transition-colors cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
