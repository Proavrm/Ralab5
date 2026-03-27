/**
 * components/shared/Badge.jsx
 * Badge de statut réutilisable.
 */
import { cn, statutColor } from '@/lib/utils'

export default function Badge({ statut, className }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      statutColor(statut),
      className
    )}>
      {statut || '—'}
    </span>
  )
}
