import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'

// ── MouleSelect ───────────────────────────────────────────────────────────────
// Dropdown qui liste les moules de la page Matériel (qualite_equipment)
// avec m_tare et/ou volume_cm3 renseignés.
// Props:
//   value       — moule_ref actuel (string)
//   onSelect    — fn({ code, m_tare, volume_cm3 }) appelée au choix
//   disabled    — boolean
//   placeholder — texte vide
export function MouleSelect({ value, onSelect, disabled, placeholder = 'Choisir…' }) {
  const { data: equipRaw = [] } = useQuery({
    queryKey: ['qualite-equipment-moules'],
    queryFn:  () => api.get('/qualite/equipment'),
    staleTime: 5 * 60 * 1000,
  })
  const moules = (Array.isArray(equipRaw) ? equipRaw : [])
    .filter(e => e.m_tare != null || e.volume_cm3 != null)
    .sort((a, b) => a.code.localeCompare(b.code))

  function handleChange(e) {
    const code = e.target.value
    if (!code) { onSelect({ code: '', m_tare: null, volume_cm3: null }); return }
    const found = moules.find(m => m.code === code)
    onSelect({ code, m_tare: found?.m_tare ?? null, volume_cm3: found?.volume_cm3 ?? null, label: found?.label ?? '' })
  }

  return (
    <select value={value || ''} onChange={handleChange} disabled={disabled}
      className="w-full px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge disabled:opacity-40"
      title="Choisir un moule depuis Matériel">
      <option value="">{moules.length === 0 ? '— aucun équipement —' : placeholder}</option>
      {moules.map(m => (
        <option key={m.code} value={m.code}>
          {m.code}{m.label ? ` — ${m.label}` : ''}{m.m_tare != null ? ` · ${m.m_tare}g` : ''}{m.volume_cm3 != null ? ` / ${m.volume_cm3}cm³` : ''}
        </option>
      ))}
    </select>
  )
}


// ── AnnauSelect ───────────────────────────────────────────────────────────────
// Dropdown qui liste les anneaux/capteurs depuis Matériel (facteur_k renseigné)
export function AnnauSelect({ value, onSelect, disabled, placeholder = 'Anneau…' }) {
  const { data: equipRaw = [] } = useQuery({
    queryKey: ['qualite-equipment-anneaux'],
    queryFn:  () => api.get('/qualite/equipment'),
    staleTime: 5 * 60 * 1000,
  })
  const anneaux = (Array.isArray(equipRaw) ? equipRaw : [])
    .filter(e => e.facteur_k != null)
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <select value={value || ''} onChange={e => {
      const code = e.target.value
      const found = anneaux.find(a => a.code === code)
      onSelect({ code, facteur_k: found?.facteur_k ?? null, capacite: found?.capacite ?? null, label: found?.label ?? '' })
    }} disabled={disabled}
      className="w-full px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge disabled:opacity-40">
      <option value="">{anneaux.length === 0 ? '— aucun anneau —' : placeholder}</option>
      {anneaux.map(a => (
        <option key={a.code} value={a.code}>
          {a.code}{a.label ? ` — ${a.label}` : ''}{a.facteur_k != null ? ` · k=${a.facteur_k}` : ''}{a.capacite != null ? ` / ${a.capacite}kN` : ''}
        </option>
      ))}
    </select>
  )
}
