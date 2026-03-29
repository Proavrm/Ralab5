/**
 * PassationsPage.jsx — fidèle à passations.html legacy
 * Split table + detail panel
 * Colonnes: Réf., Affaire, Chantier, Source, Type, Date, Suivi
 * Panel: Identité, Contexte, Suivi, Synthèse
 * Actions: Fiche, Affaire, + Demande, Supprimer
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { Plus, RefreshCw, X } from 'lucide-react'

function DetField({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium' : 'text-text-muted italic font-normal'}`}>
        {value || '—'}
      </span>
    </div>
  )
}
function DetSection({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1">
        {title}
      </div>
      {children}
    </div>
  )
}

function infoState(item) {
  const docs = item.nb_documents || 0
  const acts = item.nb_actions || 0
  return `${docs} doc${docs !== 1 ? 's' : ''} · ${acts} action${acts !== 1 ? 's' : ''}`
}

export default function PassationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const filterAffaireId = searchParams.get('affaire_id')

  const [search,   setSearch]   = useState('')
  const [source,   setSource]   = useState('')
  const [type,     setType]     = useState('')
  const [selected, setSelected] = useState(null)
  const [sortCol,  setSortCol]  = useState('date_passation')
  const [sortAsc,  setSortAsc]  = useState(false)

  const { data: passations = [], isLoading, refetch } = useQuery({
    queryKey: ['passations', filterAffaireId],
    queryFn: () => {
      const p = {}
      if (filterAffaireId) p.affaire_rst_id = filterAffaireId
      return api.get('/passations?' + new URLSearchParams(p))
    },
  })

  const { data: filters = {} } = useQuery({
    queryKey: ['passations-filters'],
    queryFn: () => api.get('/passations/filters'),
  })

  const deleteMutation = useMutation({
    mutationFn: (uid) => api.delete(`/passations/${uid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['passations'] })
      setSelected(null)
    },
  })

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(true) }
  }

  function handleDelete() {
    if (!selected || !confirm(`Supprimer la passation ${selected.reference} ?`)) return
    deleteMutation.mutate(selected.uid)
  }

  const filtered = [...passations]
    .filter(p => {
      const matchSource = !source || p.source === source
      const matchType   = !type   || p.operation_type === type
      const q = search.toLowerCase()
      const matchSearch = !q || [p.reference, p.chantier, p.numero_etude, p.affaire_ref, p.client]
        .some(v => v?.toLowerCase().includes(q))
      return matchSource && matchType && matchSearch
    })
    .sort((a, b) => {
      const va = String(a[sortCol] || '').toLowerCase()
      const vb = String(b[sortCol] || '').toLowerCase()
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  function Th({ col, label }) {
    return (
      <th onClick={() => toggleSort(col)}
        className="bg-bg px-3.5 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text">
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">↕</span>}
      </th>
    )
  }

  const filterAffaireRef = filterAffaireId
    ? passations.find(p => String(p.affaire_rst_id) === String(filterAffaireId))?.affaire_ref
    : null

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">
          {filterAffaireRef ? `Passations — Affaire ${filterAffaireRef}` : 'Passations'}
        </span>
        <Button variant="primary" size="sm" onClick={() => navigate('/passations/new')}>
          <Plus size={13} /> Nouvelle passation
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw size={13} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-surface border-b border-border shrink-0 flex-wrap">
        <Input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Référence, chantier, étude…"
          className="flex-1 max-w-[280px] text-xs py-1.5"
        />
        <Select value={source} onChange={e => setSource(e.target.value)} className="text-xs py-1.5">
          <option value="">Toutes sources</option>
          {(filters.sources || filters.source_options || []).map(v => <option key={v}>{v}</option>)}
        </Select>
        <Select value={type} onChange={e => setType(e.target.value)} className="text-xs py-1.5">
          <option value="">Tous types</option>
          {(filters.operation_types || filters.operation_type_options || []).map(v => <option key={v}>{v}</option>)}
        </Select>
        {(source || type || search) && (
          <button onClick={() => { setSource(''); setType(''); setSearch('') }}
            className="text-xs text-text-muted hover:text-danger flex items-center gap-1">
            <X size={11} /> Effacer
          </button>
        )}
        <span className="text-xs text-text-muted ml-auto">
          {filtered.length} passation{filtered.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-text-muted">Passation = aide facultative de saisie</span>
      </div>

      {/* Split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 overflow-y-auto bg-surface min-w-0">
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-12">🤝 Aucune passation</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th col="reference"      label="Réf." />
                  <Th col="affaire_ref"    label="Affaire" />
                  <Th col="chantier"       label="Chantier" />
                  <Th col="source"         label="Source" />
                  <Th col="operation_type" label="Type" />
                  <Th col="date_passation" label="Date" />
                  <th className="bg-bg px-3.5 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border sticky top-0 z-10">
                    Suivi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.uid}
                    onClick={() => setSelected(p.uid === selected?.uid ? null : p)}
                    className={`border-b border-border cursor-pointer transition-colors ${
                      selected?.uid === p.uid ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'
                    }`}>
                    <td className="px-3.5 py-2.5">
                      <strong className="text-accent text-xs">{p.reference}</strong>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs text-text-muted">{p.affaire_ref || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs max-w-[220px] truncate">{p.chantier || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs">{p.source || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs">{p.operation_type || '—'}</td>
                    <td className="px-3.5 py-2.5 text-xs">{formatDate(p.date_passation)}</td>
                    <td className="px-3.5 py-2.5">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#e6f1fb] text-[#185fa5]">
                        {infoState(p)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[360px] min-w-[320px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
              <div>
                <div className="text-[15px] font-bold">{selected.reference}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#faeeda] text-[#854f0b]">
                    {selected.phase_operation || 'Sans phase'}
                  </span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f1efe8] text-[#5f5e5a]">
                    {selected.source || 'Sans source'}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-1 rounded text-text-muted hover:bg-bg hover:text-text transition-colors shrink-0">
                <X size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-4 px-[18px] py-4 flex-1">
              <DetSection title="Identité">
                <DetField label="Affaire"        value={selected.affaire_ref} />
                <DetField label="Client"         value={selected.client} />
                <DetField label="Chantier"       value={selected.chantier} />
                <DetField label="N° étude"       value={selected.numero_etude} />
                <DetField label="N° affaire NGE" value={selected.numero_affaire_nge} />
              </DetSection>

              <DetSection title="Contexte">
                <DetField label="Source"         value={selected.source} />
                <DetField label="Type opération" value={selected.operation_type} />
                <DetField label="Phase"          value={selected.phase_operation} />
                <DetField label="Responsable"    value={selected.responsable} />
              </DetSection>

              <DetSection title="Suivi">
                <DetField label="Documents reçus" value={String(selected.nb_documents || 0)} />
                <DetField label="Actions"         value={String(selected.nb_actions || 0)} />
                <DetField label="Date passation"  value={formatDate(selected.date_passation)} />
              </DetSection>

              <DetSection title="Synthèse">
                <DetField label="Résumé" value={selected.synthese || selected.description_generale} />
              </DetSection>
            </div>

            <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
              <Button size="sm" variant="primary" onClick={() => navigate(`/passations/${selected.uid}`)}>
                📋 Fiche
              </Button>
              <Button size="sm" onClick={() => navigate(`/affaires/${selected.affaire_rst_id}`)}>
                📁 Affaire
              </Button>
              <Button size="sm" onClick={() => navigate(`/demandes?passation_uid=${selected.uid}&create=1`)}>
                ➕ Demande
              </Button>
              <Button size="sm" variant="danger" onClick={handleDelete}>🗑</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
