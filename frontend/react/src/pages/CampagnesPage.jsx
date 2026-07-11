/**
 * CampagnesPage.jsx — liste des campagnes (filtre demande_id)
 * Style aligné sur DemandePage (fiche demande)
 */
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { demandesApi, interventionCampaignsApi } from '@/services/api'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import { RefreshCw, X } from 'lucide-react'
import {
  DemandeHero,
  EmptyStateBox,
  FieldCard,
  FicheBadge,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  MetricCard,
  SectionCard,
} from '@/components/layout/FicheLayout'

const STATUTS = ['À cadrer', 'En cours', 'Terminée', 'Archivée']

function CampaignCard({ campaign, listReturnTo, navigate, demandeId }) {
  const statut = campaign.statut || campaign.preparation_status || 'À cadrer'
  const ficheHref = buildPathWithReturnTo(`/campagnes/${campaign.uid}`, listReturnTo)

  return (
    <article className="overflow-hidden rounded-[18px] border border-border bg-[#fbfcfe] transition-colors hover:border-nge/25">
      <button
        type="button"
        onClick={() => navigate(ficheHref)}
        className="w-full text-left px-5 py-4 border-b border-[#e5e9f0]"
        style={{ background: 'linear-gradient(90deg, #ffffff 0%, #f8fafc 100%)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[16px] font-black text-nge">{campaign.reference}</span>
              <span className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-bold text-text-muted">
                {campaign.label || 'Campagne'}
              </span>
            </div>
            <div className="mt-1.5 text-[13px] text-[#172033] line-clamp-2">
              {campaign.programme_specifique || campaign.designation || campaign.zone_scope || 'Programme à cadrer'}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <FicheBadge s={statut} />
            <span className="inline-flex items-center rounded-full border border-[#d8ead1] bg-[#edf8e8] px-2.5 py-1 text-[11px] font-bold text-[#3b6d11]">
              {campaign.intervention_count ?? 0} intervention{(campaign.intervention_count ?? 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </button>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5">
        <FieldCard label="Programme" value={campaign.programme_specifique || campaign.designation} />
        <FieldCard label="Zone / temporalité" value={[campaign.zone_scope, campaign.temporalite].filter(Boolean).join(' · ')} />
        <FieldCard label="Essais prévus" value={campaign.types_essais_prevus} />
        <FieldCard label="Priorité" value={campaign.priorite} />
        <FieldCard label="Responsable" value={campaign.responsable_technique} />
        <FieldCard label="Attribué à" value={campaign.attribue_a} />
        <FieldCard label="Essais liés" value={campaign.essai_count != null ? String(campaign.essai_count) : '0'} highlight={Number(campaign.essai_count) > 0} />
        <FieldCard label="Prochaine étape" value={campaign.next_step} className="sm:col-span-2 lg:col-span-1" />
      </div>

      <div className="flex flex-wrap gap-2 px-5 pb-5">
        <Button size="sm" variant="primary" onClick={() => navigate(ficheHref)}>Fiche campagne</Button>
        {demandeId ? (
          <Button
            size="sm"
            onClick={() => navigate(buildPathWithReturnTo(`/interventions?demande_id=${demandeId}`, listReturnTo))}
          >
            Interventions
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export default function CampagnesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const filterDemandeId = searchParams.get('demande_id') || null
  const detailReturnTo = `${location.pathname}${location.search || ''}`
  const explicitReturnTo = resolveReturnTo(searchParams, '')
  const listReturnTo = detailReturnTo

  const [search, setSearch] = useState('')
  const [statut, setStatut] = useState('')
  const timer = useRef(null)

  const { data: demande, isLoading: demandeLoading } = useQuery({
    queryKey: ['demande', filterDemandeId],
    queryFn: () => demandesApi.get(filterDemandeId),
    enabled: Boolean(filterDemandeId),
  })

  const { data: campagnes = [], isLoading, refetch } = useQuery({
    queryKey: ['campagnes', filterDemandeId],
    queryFn: () => {
      const params = {}
      if (filterDemandeId) params.demande_id = filterDemandeId
      return interventionCampaignsApi.list(params)
    },
  })

  function onSearchChange(value) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSearch(value), 300)
  }

  function openPreparationForCreate() {
    if (!filterDemandeId) return
    const refParam = demande?.reference ? `?ref=${encodeURIComponent(demande.reference)}` : ''
    navigate(buildPathWithReturnTo(`/preparations/${filterDemandeId}${refParam}`, listReturnTo))
  }

  function handleBackNavigation() {
    if (explicitReturnTo) {
      navigate(explicitReturnTo)
      return
    }
    if (filterDemandeId) {
      navigate(`/demandes/${filterDemandeId}`)
      return
    }
    navigate('/demandes')
  }

  const filtered = [...campagnes]
    .filter((item) => {
      const matchStatut = !statut || item.statut === statut || item.preparation_status === statut
      const q = search.toLowerCase()
      const matchSearch = !q || [
        item.reference,
        item.label,
        item.designation,
        item.demande_reference,
        item.programme_specifique,
      ].some((value) => String(value || '').toLowerCase().includes(q))
      return matchStatut && matchSearch
    })
    .sort((a, b) => String(a.reference || '').localeCompare(String(b.reference || '')))

  const totalInterventions = filtered.reduce((sum, item) => sum + Number(item.intervention_count || 0), 0)
  const totalEssais = filtered.reduce((sum, item) => sum + Number(item.essai_count || 0), 0)
  const d = demande

  const backLabel = filterDemandeId ? '← Demande' : '← Demandes'
  const pageEyebrow = filterDemandeId ? 'Campagnes demande' : 'Campagnes RST'
  const pageTitle = filterDemandeId
    ? (d?.reference || demandeLoading ? '…' : `#${filterDemandeId}`)
    : 'Toutes les campagnes'

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel={backLabel}
        onBack={handleBackNavigation}
        eyebrow={pageEyebrow}
        title={pageTitle}
      >
        {filterDemandeId && d?.affaire_rst_id ? (
          <Button size="sm" onClick={() => navigate(`/affaires/${d.affaire_rst_id}`)}>Affaire</Button>
        ) : null}
        {filterDemandeId ? (
          <>
            <Button size="sm" onClick={() => navigate(buildPathWithReturnTo(`/demandes/${filterDemandeId}`, explicitReturnTo))}>Demande</Button>
            <Button size="sm" onClick={() => navigate(buildPathWithReturnTo(`/preparations/${filterDemandeId}${d?.reference ? `?ref=${encodeURIComponent(d.reference)}` : ''}`, listReturnTo))}>
              Préparation
            </Button>
            <Button size="sm" onClick={() => navigate(buildPathWithReturnTo(`/interventions?demande_id=${filterDemandeId}`, listReturnTo))}>
              Interventions
            </Button>
          </>
        ) : null}
        {filterDemandeId ? (
          <Button size="sm" variant="primary" onClick={openPreparationForCreate}>
            Créer via la préparation
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={() => refetch()} className="rounded-xl px-2 text-text-muted" title="Actualiser">
          <RefreshCw size={14} />
        </Button>
      </FicheTopbar>

      <FicheMain>
        {filterDemandeId && d ? (
          <>
            <DemandeHero demande={d} badgeLabel="RaLab 5 · Campagnes" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 -mt-2">
              <MetricCard
                label="Campagnes"
                value={filtered.length}
                detail={`${filtered.length} campagne${filtered.length !== 1 ? 's' : ''} cadrée${filtered.length !== 1 ? 's' : ''}`}
              />
              <MetricCard
                label="Interventions"
                value={totalInterventions}
                detail="Rattachées aux campagnes listées"
              />
              <MetricCard
                label="Essais"
                value={totalEssais}
                detail="Liés aux campagnes listées"
              />
              <MetricCard
                label="Échéance"
                value={d.date_echeance ? formatDate(d.date_echeance) : '—'}
                detail={d.date_echeance ? 'Date demande' : 'Non définie'}
              />
            </div>
          </>
        ) : null}

        <SectionCard
          title="Campagnes d'intervention"
          subtitle={filterDemandeId ? 'Campagnes cadrées pour cette demande' : 'Vue globale des campagnes RST'}
          chip={(
            <span className="inline-flex items-center rounded-full border border-nge-yellow-dark bg-nge-yellow text-nge px-2.5 py-1.5 text-[11px] font-black leading-none">
              {filtered.length}
            </span>
          )}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <input
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Référence, libellé, programme…"
                className="min-w-[180px] max-w-[240px] px-3 py-1.5 border border-border rounded-lg text-sm bg-white outline-none focus:border-nge"
              />
              <Select value={statut} onChange={(event) => setStatut(event.target.value)} className="text-xs py-1.5 min-w-[120px]">
                <option value="">Tous statuts</option>
                {STATUTS.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
              {(statut || search) ? (
                <button
                  type="button"
                  onClick={() => { setStatut(''); setSearch('') }}
                  className="text-xs text-text-muted hover:text-danger flex items-center gap-1"
                >
                  <X size={11} /> Effacer
                </button>
              ) : null}
            </div>
          )}
        >
          {isLoading ? (
            <div className="text-xs text-text-muted text-center py-12">Chargement…</div>
          ) : filtered.length === 0 ? (
            <EmptyStateBox
              icon="📋"
              title="Aucune campagne"
              description={filterDemandeId
                ? 'Créez les campagnes depuis la préparation (DIAG-CH, Témoin, RARx, Suivi…).'
                : 'Aucune campagne ne correspond aux filtres sélectionnés.'}
              action={filterDemandeId ? (
                <Button size="sm" variant="primary" onClick={openPreparationForCreate}>
                  Ouvrir la préparation
                </Button>
              ) : null}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((campaign) => (
                <CampaignCard
                  key={campaign.uid}
                  campaign={campaign}
                  listReturnTo={listReturnTo}
                  navigate={navigate}
                  demandeId={filterDemandeId || campaign.demande_id || campaign.demande_uid}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </FicheMain>
    </FichePageShell>
  )
}
