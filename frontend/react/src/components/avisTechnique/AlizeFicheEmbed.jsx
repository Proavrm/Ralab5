/**
 * Affiche la fiche calcul Alizé (HTML annexe) en lecture seule.
 */
import { useEffect, useState } from 'react'
import { getTokenFromStorage } from '@/services/api'

export default function AlizeFicheEmbed({ calculId, className = '' }) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      setHtml('')
      if (!calculId) {
        setLoading(false)
        return
      }
      try {
        const headers = {}
        const token = getTokenFromStorage()
        if (token) headers.Authorization = `Bearer ${token}`
        const res = await fetch(`/api/calculs/calculations/${calculId}/fiche`, {
          headers,
          credentials: 'same-origin',
        })
        if (!res.ok) throw new Error(`Fiche ${res.status}`)
        const text = await res.text()
        if (!cancelled) setHtml(text)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Fiche indisponible')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [calculId])

  if (loading) {
    return <div className="rounded border border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 text-center text-[13px] text-[#64748b]">Chargement fiche…</div>
  }
  if (error) {
    return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
  }
  if (!html) return null

  return (
    <iframe
      title={`Fiche calcul ${calculId}`}
      srcDoc={html}
      className={`w-full min-h-[720px] rounded-lg border border-[#d0d7e2] bg-white shadow-sm ${className}`}
      sandbox="allow-same-origin"
    />
  )
}
