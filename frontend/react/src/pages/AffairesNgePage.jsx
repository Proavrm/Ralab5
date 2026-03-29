/**
 * AffairesNgePage.jsx — colonnes réelles: n°affaire, libellé, code_agence, titulaire, responsable, source_sheet
 */
import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import { RefreshCw, X } from 'lucide-react'

function DetField({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>
    </div>
  )
}
function DetSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1">{title}</div>
      {children}
    </div>
  )
}

export default function AffairesNgePage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [sortCol, setSortCol]   = useState('numero_affaire_complet')
  const [sortAsc, setSortAsc]   = useState(true)
  const timer = useRef(null)

  function onSearch(v) {
    setSearch(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebouncedSearch(v), 250)
  }

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['affaires-nge-rows', debouncedSearch],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '2000' })
      if (debouncedSearch) p.set('search', debouncedSearch)
      return api.get(`/reference-affaires/rows?${p}`)
    },
  })

  const { data: affairesRst = [] } = useQuery({
    queryKey: ['affaires'],
    queryFn: () => api.get('/affaires'),
  })

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  const sorted = [...rows].sort((a, b) => {
    const va = String(a[sortCol] ?? '').toLowerCase()
    const vb = String(b[sortCol] ?? '').toLowerCase()
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  function normCode(v) {
    return String(v || '').replace(/[*\s\-_/.]/g, '').toLowerCase()
  }

  function findMatchingRst(row) {
    const code = normCode(row.numero_affaire_complet || row.numero_affaire)
    if (!code) return null
    return affairesRst.find(a => normCode(a.affaire_nge) === code)
  }

  function createAffaire() {
    if (!selected) return
    navigate('/affaires', { state: {
      openCreate: true,
      source_type: 'affaire_nge',
      source_id: selected.id,
      prefill: {
        chantier:    selected.libelle || '',
        affaire_nge: selected.numero_affaire_complet || selected.numero_affaire || '',
        titulaire:   selected.titulaire || '',
        responsable: selected.responsable || '',
      }
    }})
  }

  function createDemande() {
    if (!selected) return
    const affaire = findMatchingRst(selected)
    navigate('/demandes', { state: {
      openCreate: true,
      source_type: 'affaire_nge',
      source_id: selected.id,
      prefill: {
        demande: {
          affaire_rst_id:       affaire?.uid || null,
          numero_affaire_nge:   selected.numero_affaire_complet || selected.numero_affaire || '',
          type_mission:         'À définir',
          nature:               'Demande affaire NGE',
          demandeur:            selected.responsable || '',
          description:          [selected.libelle, selected.titulaire && `Titulaire: ${selected.titulaire}`].filter(Boolean).join('\n'),
          observations:         `Préremplie depuis Affaires NGE ${selected.numero_affaire_complet || selected.numero_affaire || ''}`.trim(),
        }
      }
    }})
  }

  function Th({ col, label }) {
    return (
      <th onClick={() => toggleSort(col)}
        className="bg-bg px-3 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text">
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">↕</span>}
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">Affaires NGE</span>
        <Button size="sm" variant="warn" onClick={() => navigate('/tools')}>🛠 Maintenance DB</Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </div>

      <div className="flex items-center gap-3 px-6 py-2.5 bg-surface border-b border-border shrink-0">
        <input value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher N° affaire, libellé, responsable…"
          className="flex-1 max-w-[400px] px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-accent" />
        <span className="text-xs text-text-muted ml-auto">{rows.length} ligne{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : sorted.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">🏗️ Aucune affaire NGE — mets à jour la DB dans Outils</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th col="numero_affaire_complet" label="N° affaire" />
                  <Th col="libelle"     label="Libellé" />
                  <Th col="code_agence" label="Agence" />
                  <Th col="titulaire"   label="Titulaire" />
                  <Th col="responsable" label="Responsable" />
                  <Th col="source_sheet" label="Feuille" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.id ?? i}
                    onClick={() => setSelected(selected?.id === row.id ? null : row)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.id === row.id ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3 py-2.5"><strong className="text-accent text-xs font-mono">{row.numero_affaire_complet || row.numero_affaire || '—'}</strong></td>
                    <td className="px-3 py-2.5 text-xs max-w-[300px] truncate">{row.libelle || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{row.code_agence || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {row.titulaire
                        ? <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#002C77] text-white">{row.titulaire}</span>
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{row.responsable || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-text-muted">{row.source_sheet || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <div className="w-[340px] min-w-[300px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
              <div>
                <div className="text-[13px] font-bold text-accent">{selected.numero_affaire_complet || selected.numero_affaire || '—'}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected.libelle || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg shrink-0"><X size={14} /></button>
            </div>

            <div className="flex flex-wrap gap-1.5 px-[18px] pt-3">
              {selected.titulaire && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#002C77] text-white">{selected.titulaire}</span>}
              {selected.code_agence && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#e6f1fb] text-[#185fa5]">{selected.code_agence}</span>}
            </div>

            <div className="flex flex-col gap-4 px-[18px] py-4 flex-1">
              <DetSection title="Affaire NGE">
                <DetField label="N° affaire complet" value={selected.numero_affaire_complet} />
                <DetField label="N° affaire brut"    value={selected.numero_affaire} />
                <DetField label="Libellé"            value={selected.libelle} />
                <DetField label="Code agence"        value={selected.code_agence} />
                <DetField label="Source sheet"       value={selected.source_sheet} />
              </DetSection>
              <DetSection title="Parties">
                <DetField label="Titulaire"   value={selected.titulaire} />
                <DetField label="Responsable" value={selected.responsable} />
              </DetSection>
              <DetSection title="Informations complémentaires">
                <DetField label="Marché n°"       value={selected.marche_numero} />
                <DetField label="Compte bancaire" value={selected.compte_bancaire} />
                <DetField label="Observations"    value={selected.observations} />
              </DetSection>
            </div>

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={createAffaire}>📋 Créer une affaire RST</Button>
              <Button size="sm" onClick={createDemande}>📂 Créer une demande</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
