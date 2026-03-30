/**
 * EtudesPage.jsx — fidèle à etudes.html
 * API: GET /reference-etudes/rows → champs snake_case: numero_etude, nom_affaire, responsable_etude…
 * Prefill: sessionStorage['ralab4_source_prefill'] + navigate('/affaires?create=1&...')
 */
import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
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

function normalizeEtudeNumber(v) {
  return String(v || '').trim().toLowerCase()
}

function formatSite(row) {
  const ville = String(row?.ville || '').trim()
  const dept  = String(row?.departement || '').trim()
  if (ville && dept) return `${ville} (${dept})`
  return ville || dept || ''
}

export default function EtudesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState(null)
  const [sortCol, setSortCol] = useState('numero_etude')
  const [sortAsc, setSortAsc] = useState(true)
  const timer = useRef(null)

  function onSearch(v) {
    setSearch(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(v), 250)
  }

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['etudes-rows', debounced],
    queryFn: () => {
      const p = new URLSearchParams({ limit: '2000' })
      if (debounced) p.set('search', debounced)
      return api.get(`/reference-etudes/rows?${p}`)
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

  function findMatchingRst(row) {
    const num = normalizeEtudeNumber(row.numero_etude)
    if (!num) return null
    return affairesRst.find(a => normalizeEtudeNumber(a.numero_etude) === num) || null
  }

  function buildAffaireUrl(row) {
    const p = new URLSearchParams({
      create: '1',
      source_type: 'etude',
      source_id: String(row.id || ''),
      chantier: row.nom_affaire || '',
      site: formatSite(row),
      numero_etude: row.numero_etude || '',
      filiale: row.filiale || '',
      responsable: row.responsable_etude || '',
      client: '',
      affaire_nge: '',
      titulaire: '',
      statut: 'À qualifier',
    })
    return `/affaires?${p}`
  }

  function createAffaire() {
    if (!selected) return
    navigate(buildAffaireUrl(selected))
  }

  function createDemande() {
    if (!selected) return
    const affaire = findMatchingRst(selected)
    if (!affaire) {
      navigate(buildAffaireUrl(selected))
      return
    }
    const site = formatSite(selected)
    const prefill = {
      target: 'demande_rst',
      source_type: 'etude',
      source_id: selected.id,
      prefill: {
        affaire_rst_id: affaire.uid,
        numero_dst: '',
        numero_etude: selected.numero_etude || '',
        numero_affaire_nge: '',
        type_mission: 'À définir',
        nature: 'Demande liée à une étude',
        demandeur: selected.responsable_etude || '',
        chantier: selected.nom_affaire || '',
        site,
        filiale: selected.filiale || '',
        client: '',
        description: [selected.numero_etude, selected.nom_affaire, site].filter(Boolean).join('\n'),
        observations: `Préremplie depuis Étude ${selected.numero_etude || ''}`.trim(),
      },
    }
    sessionStorage.setItem('ralab4_source_prefill', JSON.stringify(prefill))
    navigate('/demandes?create=1')
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
        <span className="text-[15px] font-semibold flex-1">Études</span>
        <Button size="sm" variant="warn" onClick={() => navigate('/tools')}>🛠 Maintenance DB</Button>
        <Button size="sm" variant="ghost" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </div>

      <div className="flex items-center gap-3 px-6 py-2.5 bg-surface border-b border-border shrink-0">
        <input value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Rechercher N° étude, nom affaire, ville, filiale…"
          className="flex-1 max-w-[400px] px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-accent" />
        <span className="text-xs text-text-muted ml-auto">{rows.length} ligne{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : sorted.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">📚 Aucune étude — mets à jour la DB dans Outils</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th col="numero_etude"    label="N° étude" />
                  <Th col="nom_affaire"     label="Chantier" />
                  <Th col="filiale"         label="Filiale" />
                  <Th col="ville"           label="Ville" />
                  <Th col="departement"     label="Dépt." />
                  <Th col="responsable_etude" label="Resp. étude" />
                  <Th col="statut_affaire"  label="Statut" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, i) => (
                  <tr key={row.id ?? i}
                    onClick={() => setSelected(selected?.id === row.id ? null : row)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.id === row.id ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3 py-2.5"><strong className="text-accent text-xs font-mono">{row.numero_etude || '—'}</strong></td>
                    <td className="px-3 py-2.5 text-xs max-w-[260px] truncate">{row.nom_affaire || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{row.filiale || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{row.ville || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{row.departement || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{row.responsable_etude || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">{row.statut_affaire || '—'}</td>
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
                <div className="text-[13px] font-bold text-accent">{selected.numero_etude || '—'}</div>
                <div className="text-[11px] font-semibold text-text mt-0.5">{selected.nom_affaire || '—'}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg shrink-0"><X size={14} /></button>
            </div>

            <div className="flex flex-wrap gap-1.5 px-[18px] pt-3">
              {selected.filiale && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#e6f1fb] text-[#185fa5]">{selected.filiale}</span>}
              {selected.statut_affaire && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f1efe8] text-[#5f5e5a]">{selected.statut_affaire}</span>}
            </div>

            <div className="flex flex-col gap-4 px-[18px] py-4 flex-1">
              <DetSection title="Étude">
                <DetField label="N° étude"  value={selected.numero_etude} />
                <DetField label="Chantier"  value={selected.nom_affaire} />
                <DetField label="Site"      value={formatSite(selected)} />
                <DetField label="Filiale"   value={selected.filiale} />
                <DetField label="Direction" value={selected.direction} />
              </DetSection>
              <DetSection title="Acteurs">
                <DetField label="Responsable étude"  value={selected.responsable_etude} />
                <DetField label="Maître d'ouvrage"   value={selected.maitre_ouvrage} />
                <DetField label="Maître d'œuvre"     value={selected.maitre_oeuvre} />
                <DetField label="Mandataire"         value={selected.mandataire} />
              </DetSection>
              <DetSection title="Suivi">
                <DetField label="Statut"                       value={selected.statut_affaire} />
                <DetField label="Date réception dossier"       value={formatDate(selected.date_reception_dossier)} />
                <DetField label="Date information attribution" value={formatDate(selected.date_information_attribution)} />
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
