/**
 * lib/utils.js
 * Utilitários partilhados.
 */
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Merge Tailwind classes safely
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Format date for display: dd-mm-yyyy (ISO yyyy-mm-dd stays for inputs, search, API)
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const raw = String(dateStr).trim()
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

// Status badge color
export const STATUT_COLORS = {
  'À qualifier':    'bg-gray-100 text-gray-700',
  'Demande':        'bg-blue-100 text-blue-700',
  'En Cours':       'bg-yellow-100 text-yellow-700',
  'Répondu':        'bg-purple-100 text-purple-700',
  'Fini':           'bg-green-100 text-green-700',
  'Envoyé - Perdu': 'bg-red-100 text-red-700',
  'En cours':       'bg-yellow-100 text-yellow-700',
  'Terminée':       'bg-green-100 text-green-700',
  'Archivée':       'bg-gray-100 text-gray-500',
}

export function statutColor(statut) {
  return STATUT_COLORS[statut] || 'bg-gray-100 text-gray-600'
}

// Truncate text
export function truncate(str, max = 40) {
  if (!str) return '—'
  return str.length > max ? str.slice(0, max) + '…' : str
}
