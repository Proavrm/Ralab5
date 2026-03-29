/**
 * components/ui/Input.jsx
 */
import { cn } from '@/lib/utils'

export default function Input({ className, value, ...props }) {
  return (
    <input
      // value null/undefined → '' para garantir que é sempre controlled
      value={value ?? ''}
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

export function Select({ className, value, children, ...props }) {
  return (
    <select
      value={value ?? ''}
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
