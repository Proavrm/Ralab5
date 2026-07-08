import { analyserPlanningChipContent } from '@/lib/planningShared'

export default function AnalyserPlanningChip({ item, onItemClick, variant = 'month' }) {
  const { ref, lines, badge } = analyserPlanningChipContent(item)
  const className = variant === 'week' ? 't4-wchip' : 't4-mevt'
  const clickable = Boolean(onItemClick)

  return (
    <button
      type="button"
      className={`${className} ${item?.urg || ''}${clickable ? ' t4-chip-clickable t4-chip-rich' : ''}`}
      onClick={clickable ? (event) => {
        event.stopPropagation()
        onItemClick(item, event.currentTarget.getBoundingClientRect())
      } : undefined}
      title={[ref, ...lines, badge?.label].filter(Boolean).join('\n')}
    >
      <span className="t4-chip-ref">{ref}</span>
      {lines.map((line) => (
        <span key={`${item.key}-${line}`} className="t4-chip-line">{line}</span>
      ))}
      {badge ? (
        <span className={`t4-chip-badge ${badge.className}`}>{badge.label}</span>
      ) : null}
    </button>
  )
}
