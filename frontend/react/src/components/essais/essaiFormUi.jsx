export function parseRes(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}) }
  catch { return {} }
}

export function num(value) {
  const text = typeof value === 'string' ? value.trim().replace(',', '.') : value
  const parsed = parseFloat(text)
  return Number.isNaN(parsed) ? null : parsed
}

export function rnd(value, digits = 2) {
  return value === null ? null : parseFloat(value.toFixed(digits))
}

export function Card({ title, children }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      {title ? (
        <div className="border-b border-border bg-bg px-4 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

export function FR({ label, value }) {
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium ${!value && value !== 0 ? 'font-normal italic text-text-muted' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}
