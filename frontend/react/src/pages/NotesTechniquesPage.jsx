/**
 * NotesTechniquesPage.jsx — portefeuille G3 des notes techniques
 * Layout aligné sur AffairesPage : métriques, tableau + panneau détail
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { interventionsApi, avisTechniqueApi, demandesApi } from '@/services/api'
import Button from '@/components/ui/Button'
import DemandeReferencePicker from '@/components/demande/DemandeReferencePicker'
import Input, { Select } from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils'
import { buildG3NotesTechniquesPath, resolveG3NotesTechniquesPath } from '@/lib/modeleNTContent'
import { isNoteTechniqueIntervention } from '@/lib/noteTechniqueIntervention'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { RefreshCw, X } from 'lucide-react'
import {
  EmptyStateBox,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  MetricCard,
  SectionCard,
} from '@/components/layout/FicheLayout'

const STAT_CLS = {
  Planifiée: 'bg-[#eeedfe] text-[#534ab7]',
  'En rédaction': 'bg-[#e6f1fb] text-[#185fa5]',
  'En validation': 'bg-[#faeeda] text-[#854f0b]',
  Envoyée: 'bg-[#e0f5ef] text-[#0f6e56]',
  Clôturée: 'bg-[#eaf3de] text-[#3b6d11]',
  'En cours': 'bg-[#eaf3de] text-[#3b6d11]',
  Réalisée: 'bg-[#e0f5ef] text-[#0f6e56]',
  Annulée: 'bg-[#fcebeb] text-[#a32d2d]',
}

function StatBadge({ s }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
      {s || '—'}
    </span>
  )
}

function DetItem({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] text-text-muted">{label}</label>
      <span className={`text-[13px] ${value ? 'font-medium' : 'text-text-muted italic font-normal'}`}>
        {value || '—'}
      </span>
    </div>
  )
}

function normalizeRow(row) {
  return {
    ...row,
    uid: row.uid ?? row.id,
    reference: row.reference || '',
    demande_ref: row.demande_ref || row.demande_reference || '',
    affaire_ref: row.affaire_ref || row.affaire_reference || '',
    chantier: row.chantier || '',
    site: row.site || '',
    client: row.client || '',
    statut: row.statut || '',
    date_label: row.date_intervention || row.date_prevue || row.date_realisee || '',
    date_fin: row.date_fin || '',
    date_envoi: row.date_envoi || '',
    geotechnicien: row.geotechnicien || row.technicien || '',
    sujet: row.sujet || row.finalite || '',
    demande_id: row.demande_id ?? row.source_demande_id,
    affaire_rst_id: row.affaire_rst_id,
  }
}

function normalizeAvisRow(row) {
  return {
    uid: `avis-${row.id}`,
    avis_id: row.id,
    kind: 'avis',
    reference: row.reference || '',
    demande_ref: row.demande_ref || '',
    affaire_ref: row.affaire_ref || '',
    chantier: row.chantier || row.titre || '',
    site: '',
    client: '',
    statut: row.statut || '',
    date_label: row.created_at || '',
    date_fin: '',
    date_envoi: '',
    geotechnicien: row.auteur || '',
    sujet: row.titre || 'Avis technique',
    demande_id: row.demande_id,
    affaire_rst_id: null,
  }
}

export default function NotesTechniquesPage() {
  const navigate = useNavigate()
  const listReturnTo = '/g3/notes-techniques'

  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  const [sortCol, setSortCol] = useState('reference')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createDemandeQuery, setCreateDemandeQuery] = useState('')
  const [createDemandeId, setCreateDemandeId] = useState(null)

  const { data: interventionRows = [], isLoading: loadingInterventions, refetch: refetchInterventions } = useQuery({
    queryKey: ['notes-techniques'],
    queryFn: () => interventionsApi.list(),
  })

  const { data: avisRows = [], isLoading: loadingAvis, refetch: refetchAvis } = useQuery({
    queryKey: ['notes-techniques-avis'],
    queryFn: () => avisTechniqueApi.listInstances({}),
  })

  const isLoading = loadingInterventions || loadingAvis

  function refetch() {
    refetchInterventions()
    refetchAvis()
  }

  const notes = useMemo(() => {
    const fromInterventions = (Array.isArray(interventionRows) ? interventionRows : [])
      .filter(isNoteTechniqueIntervention)
      .map((row) => ({ ...normalizeRow(row), kind: 'intervention' }))
    const fromAvis = (Array.isArray(avisRows) ? avisRows : []).map(normalizeAvisRow)
    return [...fromAvis, ...fromInterventions]
  }, [interventionRows, avisRows])

  const statutOptions = useMemo(
    () => [...new Set(notes.map((row) => row.statut).filter(Boolean))].sort(),
    [notes],
  )

  function toggleSort(col) {
    if (sortCol === col) setSortAsc((value) => !value)
    else {
      setSortCol(col)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...notes]
      .filter((row) => {
        if (statut && row.statut !== statut) return false
        if (!q) return true
        return [
          row.reference,
          row.demande_ref,
          row.affaire_ref,
          row.chantier,
          row.site,
          row.client,
          row.geotechnicien,
          row.sujet,
        ].some((value) => String(value || '').toLowerCase().includes(q))
      })
      .sort((a, b) => {
        const va = String(a[sortCol] ?? '').toLowerCase()
        const vb = String(b[sortCol] ?? '').toLowerCase()
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      })
  }, [notes, search, statut, sortCol, sortAsc])

  const metrics = useMemo(() => {
    const total = filtered.length
    const planifiees = filtered.filter((row) => row.statut === 'Planifiée').length
    const enCours = filtered.filter((row) => row.statut === 'En cours').length
    const realisees = filtered.filter((row) => ['Réalisée', 'Terminée', 'Clôturée'].includes(row.statut)).length
    return { total, planifiees, enCours, realisees }
  }, [filtered])

  const { widths, getColProps } = useResizableColumns([140, 130, 120, 200, 120, 100, 100, 100, 130])

  function Th({ col, label, colIdx, className = '' }) {
    const { style, resizerProps } = getColProps(colIdx ?? 0)
    return (
      <th
        onClick={() => toggleSort(col)}
        style={style}
        className={`relative overflow-hidden bg-bg px-3 py-1.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text ${className}`}
      >
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">↕</span>}
        <span {...resizerProps} onClick={(event) => event.stopPropagation()} />
      </th>
    )
  }

  function openRedaction(row) {
    if (row?.kind === 'avis' && row.avis_id) {
      navigate(buildPathWithReturnTo(`/avis-technique/${row.avis_id}`, listReturnTo))
      return
    }
    if (!row?.demande_id) return
    navigate(buildG3NotesTechniquesPath({
      demandeUid: row.demande_id,
      interventionUid: row.uid,
      returnTo: listReturnTo,
    }))
  }

  async function openCreateRedaction() {
    const value = String(createDemandeQuery || '').trim()
    if (!value) return

    let demandeId = createDemandeId
    if (!demandeId) {
      try {
        const demandes = await demandesApi.list({ search: value })
        const list = Array.isArray(demandes) ? demandes : (demandes?.items || [])
        const match = list.find((d) => String(d.reference || '').toLowerCase() === value.toLowerCase())
          || list.find((d) => String(d.reference || '').toLowerCase().includes(value.toLowerCase()))
        demandeId = match?.id ?? match?.uid ?? null
      } catch {
        demandeId = null
      }
    }

    if (demandeId) {
      navigate(buildPathWithReturnTo(`/avis-technique/nouveau?demande_id=${demandeId}`, listReturnTo))
      setCreateOpen(false)
      setCreateDemandeQuery('')
      setCreateDemandeId(null)
      return
    }

    const path = await resolveG3NotesTechniquesPath({
      demandeRef: value,
      returnTo: listReturnTo,
    })
    navigate(path)
    setCreateOpen(false)
    setCreateDemandeQuery('')
    setCreateDemandeId(null)
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Accueil"
        onBack={() => navigate('/dashboard')}
        eyebrow="G3"
        title="Notes techniques"
        subtitle="Portefeuille et rédaction — repères visibles sur le planning"
      >
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="px-3.5 py-2 rounded-xl bg-[#5b4b8a] text-white text-[13px] font-bold hover:bg-[#4a3d72] inline-flex items-center gap-1.5"
        >
          + Rédaction pour une demande
        </button>
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()} className="rounded-xl px-3 text-text-muted">
          <RefreshCw size={14} />
        </Button>
      </FicheTopbar>

      <FicheMain>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <MetricCard label="Notes techniques" value={metrics.total} detail="Selon filtres actifs" />
          <MetricCard label="Planifiées" value={metrics.planifiees} detail="Statut initial" />
          <MetricCard label="En cours" value={metrics.enCours} detail="Rédaction ou suivi" />
          <MetricCard label="Réalisées" value={metrics.realisees} detail="Clôturées ou terminées" />
        </div>

        <SectionCard
          title="Notes techniques"
          subtitle="Tableau principal et panneau de détail"
          actions={(
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Réf. NT, demande, affaire, chantier…"
                className="flex-1 min-w-[220px] max-w-[320px] px-3 py-1.5 border border-border rounded text-sm bg-white outline-none focus:border-[#5b4b8a]"
              />
              <Select value={statut} onChange={(event) => setStatut(event.target.value)} className="text-xs py-1.5">
                <option value="">Tous statuts</option>
                {statutOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
              {(search || statut) ? (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setStatut('') }}
                  className="text-xs text-text-muted hover:text-danger flex items-center gap-1"
                >
                  <X size={11} /> Effacer
                </button>
              ) : null}
              <span className="text-xs text-text-muted ml-auto">
                {filtered.length} note{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        >
          <div className="flex overflow-hidden max-h-[66vh]">
            <div className="flex-1 overflow-x-scroll overflow-y-auto bg-surface min-w-0">
              {isLoading ? (
                <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
              ) : filtered.length === 0 ? (
                <EmptyStateBox
                  icon="📝"
                  title="Aucune note technique"
                  description="Créez une rédaction depuis une demande ou attendez la première NT du dossier."
                />
              ) : (
                <table
                  className="border-collapse text-sm min-w-full [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis"
                  style={{ width: Math.max(widths.reduce((sum, width) => sum + width, 0), 0), minWidth: '100%', tableLayout: 'fixed' }}
                >
                  <colgroup>
                    {widths.map((width, index) => (
                      <col key={index} style={{ width, minWidth: width, maxWidth: width }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <Th col="reference" colIdx={0} label="Réf. NT" />
                      <Th col="demande_ref" colIdx={1} label="Demande" />
                      <Th col="affaire_ref" colIdx={2} label="Affaire" />
                      <Th col="chantier" colIdx={3} label="Chantier" />
                      <Th col="statut" colIdx={4} label="Statut" />
                      <Th col="date_label" colIdx={5} label="Début" />
                      <Th col="date_fin" colIdx={6} label="Fin" />
                      <Th col="date_envoi" colIdx={7} label="Envoi" />
                      <Th col="geotechnicien" colIdx={8} label="Géotechnicien" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.uid}
                        onClick={() => setSelected(row.uid === selected?.uid ? null : row)}
                        onDoubleClick={() => openRedaction(row)}
                        className={`border-b border-border cursor-pointer transition-colors ${
                          selected?.uid === row.uid ? 'bg-[#eeedfe]' : 'hover:bg-[#f8f8fc]'
                        }`}
                      >
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <strong className="text-[#5b4b8a] text-xs font-mono truncate">{row.reference || '—'}</strong>
                            {row.kind === 'avis' ? (
                              <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold bg-[#e6f1fb] text-[#185fa5]">Avis</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-xs font-mono text-nge">{row.demande_ref || '—'}</td>
                        <td className="px-3 py-1.5 text-xs font-mono">{row.affaire_ref || '—'}</td>
                        <td className="px-3 py-1.5 text-xs max-w-[200px] truncate" title={row.chantier}>{row.chantier || '—'}</td>
                        <td className="px-3 py-1.5"><StatBadge s={row.statut} /></td>
                        <td className="px-3 py-1.5 text-xs">{formatDate(row.date_label)}</td>
                        <td className="px-3 py-1.5 text-xs">{formatDate(row.date_fin)}</td>
                        <td className="px-3 py-1.5 text-xs">{formatDate(row.date_envoi)}</td>
                        <td className="px-3 py-1.5 text-xs max-w-[130px] truncate" title={row.geotechnicien}>{row.geotechnicien || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selected ? (
              <div className="w-[360px] min-w-[320px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
                <div className="flex items-start justify-between gap-2 px-[18px] py-4 border-b border-border shrink-0">
                  <div>
                    <div className="text-[13px] font-bold text-[#5b4b8a] font-mono">{selected.reference || '—'}</div>
                    <div className="text-[11px] font-semibold text-text mt-0.5">{selected.sujet || 'Note technique synthétique'}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="p-1 rounded text-text-muted hover:bg-bg hover:text-text transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 px-[18px] py-4 border-b border-border">
                  <DetItem label="Type" value={selected.kind === 'avis' ? 'Avis technique' : 'Note technique (planche)'} />
                  <DetItem label="Demande" value={selected.demande_ref} />
                  <DetItem label="Affaire" value={selected.affaire_ref} />
                  <DetItem label="Chantier" value={selected.chantier} />
                  <DetItem label="Site" value={selected.site} />
                  <DetItem label="Client" value={selected.client} />
                  <DetItem label="Statut" value={selected.statut} />
                  <DetItem label="Début" value={formatDate(selected.date_label)} />
                  <DetItem label="Fin" value={formatDate(selected.date_fin)} />
                  <DetItem label="Envoi" value={formatDate(selected.date_envoi)} />
                  <DetItem label="Géotechnicien" value={selected.geotechnicien} />
                </div>

                <div className="flex flex-wrap gap-2 px-[18px] py-3.5 border-t border-border shrink-0">
                  <Button size="sm" variant="primary" onClick={() => openRedaction(selected)}>📝 Rédaction</Button>
                  {selected.demande_id ? (
                    <Button size="sm" onClick={() => navigate(`/demandes/${selected.demande_id}`)}>📂 Demande</Button>
                  ) : null}
                  {selected.demande_id ? (
                    <Button size="sm" onClick={() => navigate(`/preparations/${selected.demande_id}`)}>📅 Préparation</Button>
                  ) : null}
                  {selected.affaire_rst_id ? (
                    <Button size="sm" onClick={() => navigate(`/affaires/${selected.affaire_rst_id}`)}>📋 Affaire</Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </FicheMain>

      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateDemandeQuery(''); setCreateDemandeId(null) }}
        title="Rédaction pour une demande"
        size="md"
      >
        <p className="text-[12px] text-text-muted mb-2">
          Ouvre l’espace Avis technique (réf. NT commune). Les planches NT RARx restent accessibles depuis une intervention existante.
        </p>
        <DemandeReferencePicker
          value={createDemandeQuery}
          onChange={(value) => { setCreateDemandeQuery(value); setCreateDemandeId(null) }}
          onSelect={(row) => {
            setCreateDemandeQuery(row.reference)
            setCreateDemandeId(row.uid ?? row.id ?? null)
          }}
          autoFocus
          defaultOpen
          enabled={createOpen}
          listMode="inline"
          placeholder="Filtrer par référence, affaire, chantier…"
        />
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="secondary" onClick={() => { setCreateOpen(false); setCreateDemandeQuery(''); setCreateDemandeId(null) }}>Annuler</Button>
          <Button variant="primary" onClick={openCreateRedaction} disabled={!createDemandeQuery.trim()}>
            Ouvrir
          </Button>
        </div>
      </Modal>
    </FichePageShell>
  )
}
