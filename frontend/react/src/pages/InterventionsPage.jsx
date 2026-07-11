/**
 * InterventionsPage.jsx — liste des interventions (filtre demande_id)
 * Layout aligné sur AffairesPage : tableau pleine largeur, double-clic → fiche
 */
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useResizableColumns } from '@/hooks/useResizableColumns'
import { interventionsApi, demandesApi } from '@/services/api'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { RefreshCw, X } from 'lucide-react'
import {
  DemandeHero,
  DEMANDE_STAT_CLS,
  EmptyStateBox,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  MetricCard,
  SectionCard,
} from '@/components/layout/FicheLayout'

const STAT_CLS = {
  Planifiée: 'bg-[#e6f1fb] text-[#185fa5]',
  'En cours': 'bg-[#eaf3de] text-[#3b6d11]',
  Réalisée: 'bg-[#e0f5ef] text-[#0f6e56]',
  Annulée: 'bg-[#fcebeb] text-[#a32d2d]',
  Importée: 'bg-[#eeedfe] text-[#534ab7]',
  ...DEMANDE_STAT_CLS,
}

function StatBadge({ s }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
      {s || '—'}
    </span>
  )
}

function normalizeRow(row) {
  return {
    ...row,
    uid: row.uid ?? row.id,
    reference: row.reference || '',
    type_label: row.type_intervention || row.type || '',
    statut: row.statut || '',
    date_label: row.date_intervention || row.date_prevue || row.date_realisee || '',
    technicien_label: row.technicien || row.operateur || row.geotechnicien || '',
    campagne_label: row.campagne_ref || row.campaign_ref || row.campagne_reference || '',
    demande_label: row.demande_ref || row.demande_reference || '',
    chantier_label: row.chantier || '',
    lieu_label: row.lieu || row.site || row.zone_intervention || '',
    nb_essais: Number(row.nb_essais) || 0,
  }
}

export default function InterventionsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const filterDemandeId = searchParams.get('demande_id')
  const initialMineOnly = searchParams.get('mine') === '1'
  const returnTo = resolveReturnTo(searchParams.get('return_to'), filterDemandeId ? `/demandes/${filterDemandeId}` : '/demandes')

  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(initialMineOnly)
  const [sortCol, setSortCol] = useState('date_label')
  const [sortAsc, setSortAsc] = useState(false)

  const { data: demande } = useQuery({
    queryKey: ['demande', filterDemandeId],
    queryFn: () => demandesApi.get(filterDemandeId),
    enabled: !!filterDemandeId,
  })

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ['interventions', filterDemandeId],
    queryFn: () => interventionsApi.list(filterDemandeId ? { demande_id: filterDemandeId } : {}),
  })

  const normalizedRows = useMemo(
    () => (Array.isArray(rows) ? rows : []).map(normalizeRow),
    [rows]
  )

  const statuts = useMemo(
    () => [...new Set(normalizedRows.map((r) => r.statut).filter(Boolean))].sort(),
    [normalizedRows]
  )

  function toggleSort(col) {
    if (sortCol === col) setSortAsc((a) => !a)
    else {
      setSortCol(col)
      setSortAsc(true)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const myDisplay = String(user?.display_name || '').trim().toLowerCase()
    const myEmail = String(user?.email || '').trim().toLowerCase()

    return [...normalizedRows]
      .filter((r) => {
        if (statutFilter && r.statut !== statutFilter) return false
        if (mineOnly) {
          const assignees = [r.technicien, r.operateur, r.geotechnicien]
            .map((v) => String(v || '').trim().toLowerCase())
          if (!assignees.some((v) => v && (v === myDisplay || v === myEmail))) return false
        }
        if (!q) return true
        return [
          r.reference,
          r.type_label,
          r.campagne_label,
          r.demande_label,
          r.technicien_label,
          r.statut,
          r.chantier_label,
          r.lieu_label,
        ].some((v) => String(v || '').toLowerCase().includes(q))
      })
      .sort((a, b) => {
        const va = String(a[sortCol] ?? '').toLowerCase()
        const vb = String(b[sortCol] ?? '').toLowerCase()
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      })
  }, [normalizedRows, search, statutFilter, mineOnly, user?.display_name, user?.email, sortCol, sortAsc])

  const metrics = useMemo(() => {
    const planifiees = normalizedRows.filter((r) => ['Planifiée', 'À planifier', 'Ouverte'].includes(r.statut)).length
    const realisees = normalizedRows.filter((r) => ['Réalisée', 'Terminée', 'Clôturée'].includes(r.statut)).length
    const essais = normalizedRows.reduce((acc, r) => acc + (r.nb_essais || 0), 0)
    return { total: normalizedRows.length, planifiees, realisees, essais }
  }, [normalizedRows])

  const { widths, getColProps } = useResizableColumns([150, 180, 110, 110, 140, 130, 130, 200, 120, 70])

  function Th({ col, label, colIdx, className = '' }) {
    const { style, resizerProps } = getColProps(colIdx ?? 0)
    return (
      <th
        onClick={() => toggleSort(col)}
        style={style}
        className={`relative overflow-hidden bg-bg px-3 py-1.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap sticky top-0 z-10 cursor-pointer select-none hover:text-text ${className}`}
      >
        {label} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span className="opacity-30">↕</span>}
        <span {...resizerProps} onClick={(e) => e.stopPropagation()} />
      </th>
    )
  }

  function openIntervention(row) {
    if (!row?.uid) return
    navigate(buildPathWithReturnTo(`/interventions/${row.uid}`, returnTo))
  }

  function goDemande() {
    if (filterDemandeId) navigate(buildPathWithReturnTo(`/demandes/${filterDemandeId}`, returnTo))
  }

  function goCampagnes() {
    if (filterDemandeId) navigate(buildPathWithReturnTo(`/campagnes?demande_id=${filterDemandeId}`, returnTo))
  }

  function goPreparation() {
    if (demande?.reference && filterDemandeId) {
      navigate(buildPathWithReturnTo(`/preparations/${filterDemandeId}?ref=${encodeURIComponent(demande.reference)}`, returnTo))
    }
  }

  const hasFilters = Boolean(search || statutFilter || mineOnly)
  const backLabel = filterDemandeId ? '← Demande' : '← Demandes'

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel={backLabel}
        onBack={() => navigate(returnTo)}
        eyebrow="Interventions"
        title={demande?.reference ? `Demande ${demande.reference}` : 'Liste des interventions'}
      >
        {filterDemandeId ? (
          <>
            <Button size="sm" onClick={goDemande}>Demande</Button>
            <Button size="sm" onClick={goCampagnes}>Campagnes</Button>
            <Button size="sm" onClick={goPreparation}>Préparation</Button>
          </>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()} className="rounded-xl px-3 text-text-muted">
          <RefreshCw size={14} />
        </Button>
      </FicheTopbar>

      <FicheMain>
        {demande ? <DemandeHero demande={demande} badgeLabel="RaLab 5 · Interventions" /> : null}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <MetricCard label="Interventions" value={metrics.total} detail={`${filtered.length} affichée${filtered.length !== 1 ? 's' : ''}`} />
          <MetricCard label="Planifiées" value={metrics.planifiees} detail="En attente ou ouvertes" />
          <MetricCard label="Réalisées" value={metrics.realisees} detail="Terminées ou clôturées" />
          <MetricCard label="Essais liés" value={metrics.essais} detail="Total sur la sélection" />
        </div>

        <SectionCard
          title="Interventions"
          subtitle="Double-clic sur une ligne pour ouvrir la fiche"
          actions={(
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Référence, type, technicien, campagne…"
                className="flex-1 min-w-[220px] max-w-[320px] px-3 py-1.5 border border-border rounded text-sm bg-white outline-none focus:border-nge"
              />
              <select
                value={statutFilter}
                onChange={(e) => setStatutFilter(e.target.value)}
                className="text-xs py-1.5 px-2 border border-border rounded bg-white outline-none focus:border-nge"
              >
                <option value="">Tous statuts</option>
                {statuts.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="inline-flex items-center gap-2 text-xs text-[#123]">
                <input
                  type="checkbox"
                  checked={mineOnly}
                  onChange={(e) => setMineOnly(e.target.checked)}
                />
                <span>Mes attributions</span>
              </label>
              {hasFilters ? (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setStatutFilter(''); setMineOnly(false) }}
                  className="text-xs text-text-muted hover:text-danger flex items-center gap-1"
                >
                  <X size={11} /> Effacer
                </button>
              ) : null}
              <span className="text-xs text-text-muted ml-auto">
                {filtered.length} intervention{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        >
          <div className="overflow-hidden max-h-[66vh]">
            <div className="overflow-x-scroll overflow-y-auto bg-surface">
              {isLoading ? (
                <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
              ) : filtered.length === 0 ? (
                <EmptyStateBox
                  icon="🔬"
                  title="Aucune intervention"
                  description={filterDemandeId
                    ? 'Aucune intervention n’est rattachée à cette demande pour le moment.'
                    : 'Aucune intervention ne correspond aux filtres.'}
                />
              ) : (
                <table
                  className="border-collapse text-sm min-w-full [&_td]:whitespace-nowrap [&_td]:overflow-hidden [&_td]:text-ellipsis"
                  style={{ width: Math.max(widths.reduce((sum, w) => sum + w, 0), 0), minWidth: '100%', tableLayout: 'fixed' }}
                >
                  <colgroup>
                    {widths.map((w, i) => (
                      <col key={i} style={{ width: w, minWidth: w, maxWidth: w }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <Th col="reference" colIdx={0} label="Référence" />
                      <Th col="type_label" colIdx={1} label="Type" />
                      <Th col="statut" colIdx={2} label="Statut" />
                      <Th col="date_label" colIdx={3} label="Date" />
                      <Th col="technicien_label" colIdx={4} label="Technicien" />
                      <Th col="campagne_label" colIdx={5} label="Campagne" />
                      <Th col="demande_label" colIdx={6} label="Demande" />
                      <Th col="chantier_label" colIdx={7} label="Chantier" />
                      <Th col="lieu_label" colIdx={8} label="Lieu" />
                      <th
                        style={getColProps(9).style}
                        className="relative overflow-hidden bg-bg px-3 py-1.5 text-center text-[11px] font-medium text-text-muted border-b border-border sticky top-0 z-10"
                      >
                        Ess.
                        <span {...getColProps(9).resizerProps} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr
                        key={row.uid}
                        onDoubleClick={() => openIntervention(row)}
                        className="border-b border-border cursor-pointer transition-colors hover:bg-[#f8f8fc]"
                      >
                        <td className="px-3 py-1.5">
                          <strong className="text-nge text-xs font-mono">{row.reference || `#${row.uid}`}</strong>
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-[180px] truncate" title={row.type_label}>
                          {row.type_label || '—'}
                        </td>
                        <td className="px-3 py-1.5"><StatBadge s={row.statut} /></td>
                        <td className="px-3 py-1.5 text-xs">
                          {row.date_label ? formatDate(row.date_label) : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-[140px] truncate" title={row.technicien_label}>
                          {row.technicien_label || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-[130px] truncate" title={row.campagne_label}>
                          {row.campagne_label || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-[130px] truncate" title={row.demande_label}>
                          {row.demande_label || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-[200px] truncate" title={row.chantier_label}>
                          {row.chantier_label || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-xs max-w-[120px] truncate" title={row.lieu_label}>
                          {row.lieu_label || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          {row.nb_essais > 0 ? (
                            <span className="inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#e6f1fb] text-[#185fa5]">
                              {row.nb_essais}
                            </span>
                          ) : (
                            <span className="text-text-muted text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </SectionCard>
      </FicheMain>
    </FichePageShell>
  )
}
