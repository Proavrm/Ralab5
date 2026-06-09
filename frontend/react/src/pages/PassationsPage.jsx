/**
 * PassationsPage.jsx — liste des passations (filtre affaire_id)
 * Style aligné sur DemandePage / CampagnesPage
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { api, affairesApi } from '@/services/api'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import {
  AffaireHero,
  EmptyStateBox,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  MetricCard,
  SectionCard,
} from '@/components/layout/FicheLayout'
import { Plus, RefreshCw, X } from 'lucide-react'

const SOURCE_CLS = {
  DST: 'bg-[#e6f1fb] text-[#185fa5]',
  Études: 'bg-[#eaf3de] text-[#3b6d11]',
  NGE: 'bg-[#eeedfe] text-[#534ab7]',
  Interne: 'bg-[#f1efe8] text-[#5f5e5a]',
}

function infoState(item) {
  const docs = item.nb_documents || 0
  const acts = item.nb_actions || 0
  return `${docs} doc${docs !== 1 ? 's' : ''} · ${acts} action${acts !== 1 ? 's' : ''}`
}

function DetItem({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>
    </div>
  )
}

export default function PassationsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const filterAffaireId = searchParams.get('affaire_id')

  const [search, setSearch] = useState('')
  const [source, setSource] = useState('')
  const [type, setType] = useState('')
  const [sortCol, setSortCol] = useState('date_passation')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState(null)

  const { data: passations = [], isLoading, refetch } = useQuery({
    queryKey: ['passations', filterAffaireId],
    queryFn: () => {
      const p = {}
      if (filterAffaireId) p.affaire_rst_id = filterAffaireId
      return api.get('/passations?' + new URLSearchParams(p))
    },
  })

  const { data: affaire } = useQuery({
    queryKey: ['affaire', filterAffaireId],
    queryFn: () => affairesApi.get(filterAffaireId),
    enabled: !!filterAffaireId,
  })

  const { data: filters = {} } = useQuery({
    queryKey: ['passations-filters'],
    queryFn: () => api.get('/passations/filters'),
  })

  const deleteMutation = useMutation({
    mutationFn: (uid) => api.delete(`/passations/${uid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passations'] }),
    onError: (e) => alert(e.message || 'Suppression impossible.'),
  })

  const filtered = useMemo(() => [...passations]
    .filter((p) => {
      const matchSource = !source || p.source === source
      const matchType = !type || p.operation_type === type
      const q = search.toLowerCase()
      const matchSearch = !q || [p.reference, p.chantier, p.numero_etude, p.affaire_ref, p.client]
        .some((v) => v?.toLowerCase().includes(q))
      return matchSource && matchType && matchSearch
    })
    .sort((a, b) => {
      const va = String(a[sortCol] || '').toLowerCase()
      const vb = String(b[sortCol] || '').toLowerCase()
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    }), [passations, source, type, search, sortCol, sortAsc])

  const metrics = useMemo(() => {
    const docs = filtered.reduce((acc, p) => acc + (Number(p.nb_documents) || 0), 0)
    const actions = filtered.reduce((acc, p) => acc + (Number(p.nb_actions) || 0), 0)
    const sources = new Set(filtered.map((p) => p.source).filter(Boolean)).size
    return { total: filtered.length, docs, actions, sources }
  }, [filtered])

  const returnToAffaire = filterAffaireId ? `/affaires/${filterAffaireId}` : '/passations'
  const { widths, getColProps } = useResizableColumns([180, 180, 150, 150, 280, 150, 170, 150, 180])

  function openPassation(p) {
    const path = filterAffaireId
      ? buildPathWithReturnTo(`/passations/${p.uid}`, returnToAffaire)
      : `/passations/${p.uid}`
    navigate(path)
  }

  function createDemandeFromPassation(p) {
    navigate(`/demandes?passation_uid=${p.uid}&create=1${filterAffaireId ? `&affaire_id=${filterAffaireId}` : ''}`)
  }

  function handleDelete(p) {
    if (!confirm(`Supprimer la passation ${p.reference} ?`)) return
    deleteMutation.mutate(p.uid)
  }

  function Th({ label, colIdx }) {
    const { style, resizerProps } = getColProps(colIdx ?? 0)
    return (
      <th
        style={style}
        className="relative overflow-hidden bg-bg px-3 py-1.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10"
      >
        {label}
        <span {...resizerProps} />
      </th>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnToAffaire)}
        eyebrow="Passations"
        title={affaire?.reference ? `Affaire ${affaire.reference}` : 'Liste des passations'}
      >
        {filterAffaireId ? (
          <>
            <button type="button" onClick={() => navigate(`/affaires/${filterAffaireId}`)} className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
              Affaire
            </button>
            <button type="button" onClick={() => navigate(`/demandes?affaire_id=${filterAffaireId}`)} className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
              Demandes
            </button>
          </>
        ) : null}
        <button type="button" onClick={() => navigate('/passations/new')} className="px-3.5 py-2 rounded-xl bg-[#003170] text-white text-[13px] font-bold hover:bg-[#00224f] inline-flex items-center gap-1.5">
          <Plus size={14} /> Nouvelle passation
        </button>
        <button type="button" onClick={() => refetch()} className="px-3 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[#69758a] hover:bg-[#f3f6fb]">
          <RefreshCw size={14} />
        </button>
      </FicheTopbar>

      <FicheMain>
        {affaire ? <AffaireHero affaire={affaire} badgeLabel="RaLab 5 · Passations" /> : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <MetricCard label="Passations" value={metrics.total} detail="Sur la sélection courante" />
          <MetricCard label="Documents" value={metrics.docs} detail="Pièces reçues cumulées" />
          <MetricCard label="Actions" value={metrics.actions} detail="Suivi associé" />
          <MetricCard label="Sources" value={metrics.sources} detail="Origines distinctes" />
        </div>

        <SectionCard
          title="Passations"
          subtitle="Tableau principal et panneau de détail"
          actions={(
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Référence, chantier, étude..."
                className="flex-1 min-w-[220px] max-w-[320px] px-3 py-1.5 border border-[#dbe1ea] rounded text-sm bg-white outline-none focus:border-[#003170]"
              />
              <Select value={source} onChange={(e) => setSource(e.target.value)} className="text-xs py-1.5">
                <option value="">Toutes sources</option>
                {(filters.sources || filters.source_options || []).map((v) => <option key={v}>{v}</option>)}
              </Select>
              <Select value={type} onChange={(e) => setType(e.target.value)} className="text-xs py-1.5">
                <option value="">Tous types</option>
                {(filters.operation_types || filters.operation_type_options || []).map((v) => <option key={v}>{v}</option>)}
              </Select>
              <select
                value={`${sortCol}:${sortAsc ? 'asc' : 'desc'}`}
                onChange={(e) => {
                  const [col, dir] = e.target.value.split(':')
                  setSortCol(col)
                  setSortAsc(dir === 'asc')
                }}
                className="rounded border border-[#dbe1ea] bg-white px-3 py-1.5 text-xs outline-none focus:border-[#003170]"
              >
                <option value="date_passation:desc">Date ↓</option>
                <option value="date_passation:asc">Date ↑</option>
                <option value="reference:asc">Référence A→Z</option>
              </select>
              {(source || type || search) ? (
                <button type="button" onClick={() => { setSource(''); setType(''); setSearch('') }} className="text-xs text-[#69758a] hover:text-[#a32d2d] flex items-center gap-1">
                  <X size={11} /> Effacer
                </button>
              ) : null}
              <span className="text-xs text-[#69758a] ml-auto">{filtered.length} passation{filtered.length !== 1 ? 's' : ''}</span>
            </div>
          )}
        >
          {isLoading ? (
            <div className="py-10 text-center text-[#69758a] text-[13px]">Chargement…</div>
          ) : filtered.length === 0 ? (
            <EmptyStateBox
              icon="🤝"
              title="Aucune passation"
              description={affaire ? 'Aucune passation n’est rattachée à cette affaire pour le moment.' : 'Aucune passation ne correspond aux filtres.'}
              action={(
                <button type="button" onClick={() => navigate('/passations/new')} className="px-4 py-2 rounded-xl bg-[#003170] text-white text-[13px] font-bold hover:bg-[#00224f]">
                  Créer une passation
                </button>
              )}
            />
          ) : (
            <div className="flex overflow-hidden max-h-[66vh]">
              <div className="flex-1 overflow-x-scroll overflow-y-auto bg-surface min-w-0">
                <table
                  className="border-collapse text-sm min-w-full [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis"
                  style={{ width: 'max-content', tableLayout: 'fixed' }}
                >
                  <colgroup>
                    {widths.map((w, i) => (
                      <col key={i} style={{ width: w, minWidth: w, maxWidth: w }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <Th colIdx={0} label="Référence" />
                      <Th colIdx={1} label="Affaire RST" />
                      <Th colIdx={2} label="Source" />
                      <Th colIdx={3} label="Type" />
                      <Th colIdx={4} label="Chantier / Client" />
                      <Th colIdx={5} label="N° étude" />
                      <Th colIdx={6} label="N° aff. NGE" />
                      <Th colIdx={7} label="Date" />
                      <Th colIdx={8} label="Suivi" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr
                        key={p.uid}
                        onClick={() => setSelected(selected?.uid === p.uid ? null : p)}
                        className={`border-b border-border cursor-pointer transition-colors ${selected?.uid === p.uid ? 'bg-[#eeeffe]' : 'hover:bg-[#f8f8fc]'}`}
                      >
                        <td className="px-3 py-1.5">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openPassation(p) }}
                            className="text-accent text-xs font-mono hover:underline"
                          >
                            {p.reference}
                          </button>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-text-muted">{p.affaire_ref || '—'}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {p.source ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${(SOURCE_CLS[p.source] || 'bg-[#f1efe8] text-[#5f5e5a]')}`}>
                              {p.source}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-xs">{p.operation_type || '—'}</td>
                        <td className="px-3 py-1.5 text-xs max-w-[260px] truncate" title={p.chantier || p.client || ''}>{p.chantier || p.client || '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{p.numero_etude || '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{p.numero_affaire_nge || '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{p.date_passation ? formatDate(p.date_passation) : '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{infoState(p)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected ? (
                <div className="w-[360px] min-w-[320px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
                  <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
                    <div>
                      <div className="text-[13px] font-bold text-accent">{selected.reference}</div>
                      <div className="text-[11px] font-semibold text-text mt-0.5">{selected.chantier || selected.client || '—'}</div>
                    </div>
                    <button onClick={() => setSelected(null)} className="p-1 rounded text-text-muted hover:bg-bg shrink-0">
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 px-[18px] py-4 border-b border-border">
                    <DetItem label="Source" value={selected.source} />
                    <DetItem label="Type opération" value={selected.operation_type} />
                    <DetItem label="Phase" value={selected.phase_operation} />
                    <DetItem label="Affaire" value={selected.affaire_ref} />
                    <DetItem label="Client" value={selected.client} />
                    <DetItem label="Responsable" value={selected.responsable} />
                    <DetItem label="N° étude" value={selected.numero_etude} />
                    <DetItem label="N° aff. NGE" value={selected.numero_affaire_nge} />
                    <DetItem label="Date passation" value={selected.date_passation ? formatDate(selected.date_passation) : '—'} />
                    <DetItem label="Suivi" value={infoState(selected)} />
                  </div>

                  {(selected.synthese || selected.description_generale) ? (
                    <div className="px-[18px] py-4 border-b border-border flex-1">
                      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted mb-2">Synthèse</div>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap text-text">{selected.synthese || selected.description_generale}</p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
                    <button type="button" onClick={() => openPassation(selected)} className="px-3 py-1.5 rounded-lg border border-[#dbe1ea] bg-white text-[12px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
                      Fiche
                    </button>
                    <button type="button" onClick={() => createDemandeFromPassation(selected)} className="px-3 py-1.5 rounded-lg border border-[#dbe1ea] bg-white text-[12px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
                      + Demande
                    </button>
                    <button type="button" onClick={() => handleDelete(selected)} className="px-3 py-1.5 rounded-lg border border-[#f0c0c0] bg-[#fcebeb] text-[12px] font-bold text-[#a32d2d] hover:bg-[#fae0e0]">
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </SectionCard>
      </FicheMain>
    </FichePageShell>
  )
}
