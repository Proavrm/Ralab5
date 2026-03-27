/**
 * components/ui/Table.jsx
 * Tabela reutilizável com suporte a ordenação.
 */
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Table({ columns, rows, onRowClick, emptyText = 'Aucun résultat' }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  function toggleSort(key) {
    setSort(s => s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }
    )
  }

  const sorted = sort.key
    ? [...rows].sort((a, b) => {
        const av = a[sort.key] ?? ''
        const bv = b[sort.key] ?? ''
        const cmp = String(av).localeCompare(String(bv), 'fr', { numeric: true })
        return sort.dir === 'asc' ? cmp : -cmp
      })
    : rows

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                onClick={() => col.sortable !== false && toggleSort(col.key)}
                className={cn(
                  'bg-bg px-3.5 py-2.5 text-left text-xs font-medium text-text-muted border-b border-border whitespace-nowrap',
                  col.sortable !== false && 'cursor-pointer hover:text-text select-none'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable !== false && (
                    sort.key === col.key
                      ? sort.dir === 'asc'
                        ? <ChevronUp size={12} />
                        : <ChevronDown size={12} />
                      : <ChevronsUpDown size={12} className="opacity-30" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-text-muted text-xs">
                {emptyText}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={row.id ?? row.uid ?? i}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  'border-b border-border last:border-0 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-[#f8f8fc]'
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-3.5 py-2.5 align-middle">
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
