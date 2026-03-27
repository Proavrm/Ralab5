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

// Format date PT/FR style
export function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
