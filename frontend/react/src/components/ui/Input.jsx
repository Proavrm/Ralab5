/**
 * components/ui/Input.jsx
 */
import { cn } from '@/lib/utils'

export default function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'w-full px-3 py-2 border border-border rounded text-sm bg-bg',
        'outline-none focus:border-accent focus:bg-surface transition-colors',
        'placeholder:text-text-muted',
        className
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        'px-3 py-2 border border-border rounded text-sm bg-surface',
        'outline-none focus:border-accent transition-colors cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}
