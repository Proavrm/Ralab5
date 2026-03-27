/**
 * components/ui/Card.jsx
 */
import { cn } from '@/lib/utils'

export default function Card({ children, className, onClick }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-surface border border-border rounded-[8px]',
        onClick && 'cursor-pointer hover:border-accent/40 transition-colors',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }) {
  return (
    <div className={cn('px-5 py-4 border-b border-border', className)}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={cn('text-[11px] font-semibold uppercase tracking-wider text-text-muted', className)}>
      {children}
    </h3>
  )
}

export function CardBody({ children, className }) {
  return (
    <div className={cn('p-5', className)}>
      {children}
    </div>
  )
}
