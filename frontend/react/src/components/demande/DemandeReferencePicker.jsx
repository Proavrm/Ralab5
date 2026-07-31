import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Input from '@/components/ui/Input'
import { demandesApi } from '@/services/api'
import { cn } from '@/lib/utils'

const MAX_OPTIONS = 40

function normalizeDemande(row) {
  return {
    uid: row.uid ?? row.id,
    reference: String(row.reference || '').trim(),
    chantier: row.chantier || '',
    affaire_ref: row.affaire_ref || row.affaire_reference || '',
    affaire_rst_id: row.affaire_rst_id ?? null,
    client: row.client || '',
  }
}

function DemandeOptionRow({ row, onPick, compact = false }) {
  const subtitle = [row.affaire_ref, row.chantier].filter(Boolean).join(' · ') || row.client
  return (
    <button
      type="button"
      onClick={() => onPick(row)}
      className={cn(
        'w-full text-left hover:bg-[#eeedfe] border-b border-[#eef2f7] last:border-0 transition-colors',
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
      )}
    >
      <div className={cn('flex items-baseline gap-2 min-w-0', compact && 'gap-1.5')}>
        <span className="text-xs font-mono font-bold text-[#5b4b8a] shrink-0">{row.reference}</span>
        {subtitle ? (
          <span className="text-[11px] text-text-muted truncate">{subtitle}</span>
        ) : null}
      </div>
    </button>
  )
}

export default function DemandeReferencePicker({
  value = '',
  onChange,
  onSelect,
  placeholder = 'Filtrer…',
  disabled = false,
  autoFocus = false,
  className = '',
  listMode = 'dropdown',
  defaultOpen = false,
  enabled = true,
}) {
  const inline = listMode === 'inline'
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(defaultOpen || inline)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    if (defaultOpen || inline) setOpen(true)
  }, [defaultOpen, inline, enabled])

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(String(query || '').trim()), 200)
    return () => clearTimeout(timer)
  }, [query])

  const listActive = enabled && !disabled && (inline || open)

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['demande-reference-picker', debouncedSearch],
    queryFn: () => demandesApi.list(debouncedSearch ? { search: debouncedSearch } : {}),
    enabled: listActive,
    staleTime: 30_000,
  })

  const options = useMemo(() => {
    const list = (Array.isArray(rows) ? rows : []).map(normalizeDemande).filter((row) => row.reference)
    const q = String(query || '').trim().toLowerCase()
    if (!q) return list.slice(0, MAX_OPTIONS)
    return list
      .filter((row) => {
        const haystack = [row.reference, row.chantier, row.affaire_ref, row.client].join(' ').toLowerCase()
        return haystack.includes(q)
      })
      .slice(0, MAX_OPTIONS)
  }, [rows, query])

  useEffect(() => {
    if (inline) return undefined
    function onDocumentClick(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [inline])

  function pick(row) {
    setQuery(row.reference)
    onChange?.(row.reference)
    onSelect?.(row)
    if (!inline) setOpen(false)
  }

  const listBody = isLoading ? (
    <div className="px-3 py-3 text-xs text-text-muted">Chargement…</div>
  ) : options.length === 0 ? (
    <div className="px-3 py-3 text-xs text-text-muted">Aucune demande</div>
  ) : (
    options.map((row) => (
      <DemandeOptionRow key={row.uid} row={row} onPick={pick} compact={inline} />
    ))
  )

  return (
    <div ref={rootRef} className={cn(inline ? 'flex flex-col gap-2' : 'relative', className)}>
      <Input
        value={query}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          onChange?.(next)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !inline) setOpen(false)
          if (event.key === 'Enter' && options.length === 1) {
            event.preventDefault()
            pick(options[0])
          }
        }}
      />

      {inline ? (
        <div className="rounded-xl border border-[#c9d4e3] bg-white min-h-[280px] max-h-[min(50vh,420px)] overflow-y-auto shadow-inner">
          {listBody}
        </div>
      ) : null}

      {!inline && open && !disabled ? (
        <div className="absolute z-[60] left-0 right-0 top-full mt-1 max-h-[280px] overflow-y-auto rounded-xl border border-[#c9d4e3] bg-white shadow-xl">
          {listBody}
        </div>
      ) : null}
    </div>
  )
}
