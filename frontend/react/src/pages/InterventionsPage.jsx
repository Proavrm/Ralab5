import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { interventionsApi, demandesApi } from '@/services/api'
import { formatDate } from '@/lib/utils'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import {
  DemandeHero,
  EmptyStateBox,
  FicheBadge,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  FieldCard,
  MetricCard,
  PRIO_CLS,
  SectionCard,
} from '@/components/layout/FicheLayout'

const TYPE_CLS = {
  Prélèvement: 'bg-[#e6f1fb] text-[#185fa5]',
  Essai: 'bg-[#eaf3de] text-[#3b6d11]',
  Mesure: 'bg-[#eeedfe] text-[#534ab7]',
  Contrôle: 'bg-[#faeeda] text-[#854f0b]',
}

function InterventionCard({ row, onOpen }) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row) } }}
      className="rounded-[18px] border border-[#dbe1ea] bg-white p-4 cursor-pointer transition-all hover:border-[#003170] hover:shadow-[0_8px_24px_rgba(0,49,112,0.08)] focus:outline-none focus:ring-2 focus:ring-[#003170]/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[.1em] text-[#69758a]">Intervention</div>
          <div className="mt-1 text-[18px] font-black text-[#003170]">{row.reference || `#${row.uid}`}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FicheBadge s={row.statut} />
          {row.type ? <FicheBadge s={row.type} map={TYPE_CLS} /> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <FieldCard label="Campagne" value={row.campagne_ref || row.campagne_reference} />
        <FieldCard label="Date prévue" value={row.date_prevue ? formatDate(row.date_prevue) : null} />
        <FieldCard label="Date réalisée" value={row.date_realisee ? formatDate(row.date_realisee) : null} />
        <FieldCard label="Technicien" value={row.technicien || row.operateur} />
        <FieldCard label="Essais" value={row.nb_essais != null ? String(row.nb_essais) : null} />
        <FieldCard label="Lieu" value={row.lieu || row.site} className="md:col-span-2" />
        <FieldCard label="Commentaire" value={row.commentaire} className="md:col-span-2" />
      </div>
    </article>
  )
}

export default function InterventionsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const filterDemandeId = searchParams.get('demande_id')
  const returnTo = resolveReturnTo(searchParams.get('return_to'), '/demandes')
  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState('')

  const { data: demande } = useQuery({
    queryKey: ['demande', filterDemandeId],
    queryFn: () => demandesApi.get(filterDemandeId),
    enabled: !!filterDemandeId,
  })

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['interventions', filterDemandeId],
    queryFn: () => interventionsApi.list(filterDemandeId ? { demande_id: filterDemandeId } : {}),
  })

  const statuts = useMemo(() => [...new Set(rows.map((r) => r.statut).filter(Boolean))].sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statutFilter && r.statut !== statutFilter) return false
      if (!q) return true
      return [r.reference, r.campagne_ref, r.campagne_reference, r.technicien, r.operateur, r.type, r.statut]
        .some((v) => String(v || '').toLowerCase().includes(q))
    })
  }, [rows, search, statutFilter])

  const metrics = useMemo(() => {
    const planifiees = rows.filter((r) => ['Planifiée', 'À planifier', 'Ouverte'].includes(r.statut)).length
    const realisees = rows.filter((r) => ['Réalisée', 'Terminée', 'Clôturée'].includes(r.statut)).length
    const essais = rows.reduce((acc, r) => acc + (Number(r.nb_essais) || 0), 0)
    return { total: rows.length, planifiees, realisees, essais }
  }, [rows])

  const openIntervention = (row) => {
    if (row?.uid) navigate(buildPathWithReturnTo(`/interventions/${row.uid}`, returnTo))
  }

  const goDemande = () => {
    if (filterDemandeId) navigate(buildPathWithReturnTo(`/demandes/${filterDemandeId}`, returnTo))
  }

  const goCampagnes = () => {
    if (filterDemandeId) navigate(buildPathWithReturnTo(`/campagnes?demande_id=${filterDemandeId}`, returnTo))
  }

  const goPreparation = () => {
    if (demande?.reference) {
      navigate(buildPathWithReturnTo(`/preparations/${filterDemandeId}?ref=${encodeURIComponent(demande.reference)}`, returnTo))
    }
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnTo)}
        eyebrow="Interventions"
        title={demande?.reference ? `Demande ${demande.reference}` : 'Liste des interventions'}
      >
        {filterDemandeId ? (
          <>
            <button type="button" onClick={goDemande} className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
              Demande
            </button>
            <button type="button" onClick={goCampagnes} className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
              Campagnes
            </button>
            <button type="button" onClick={goPreparation} className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]">
              Préparation
            </button>
          </>
        ) : null}
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
          subtitle={filterDemandeId ? 'Interventions rattachées à la demande' : 'Toutes les interventions'}
          chip={demande?.priorite ? <FicheBadge s={demande.priorite} map={PRIO_CLS} /> : null}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="min-w-[180px] rounded-xl border border-[#dbe1ea] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#003170]"
              />
              <select
                value={statutFilter}
                onChange={(e) => setStatutFilter(e.target.value)}
                className="rounded-xl border border-[#dbe1ea] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#003170]"
              >
                <option value="">Tous statuts</option>
                {statuts.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
        >
          {isLoading ? (
            <div className="py-10 text-center text-[#69758a] text-[13px]">Chargement…</div>
          ) : filtered.length === 0 ? (
            <EmptyStateBox
              icon="🔬"
              title="Aucune intervention"
              description={filterDemandeId ? 'Aucune intervention n’est rattachée à cette demande pour le moment.' : 'Aucune intervention ne correspond aux filtres.'}
            />
          ) : (
            <div className="flex flex-col gap-3.5">
              {filtered.map((row) => (
                <InterventionCard key={row.uid} row={row} onOpen={openIntervention} />
              ))}
            </div>
          )}
        </SectionCard>
      </FicheMain>
    </FichePageShell>
  )
}
