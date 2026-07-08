/**
 * PreparationPage.jsx
 * Préparation = tableau de bord opérationnel de la demande.
 */

import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, interventionCampaignsApi } from '@/services/api'
import Button from '@/components/ui/Button'
import PreparationDossierPanel from '@/components/preparation/PreparationDossierPanel'
import PreparationPlanningPanel from '@/components/preparation/PreparationPlanningPanel'
import { collectInterventionsForBoard } from '@/lib/preparationBoard'
import InterventionTypeModal, { applyInterventionTypeToPath } from '@/components/interventions/InterventionTypeModal'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { buildCreateInterventionHref, openEssaiCreation } from '@/lib/preparationBoard'
import { resolvePlanningFocusDate, resolvePlanningTimelineStartDate } from '@/lib/planningShared'
import {
  FicheMain,
  FichePageShell,
  FicheTopbar,
  MetricCard,
} from '@/components/layout/FicheLayout'
import { ExternalLink, RefreshCw } from 'lucide-react'

function PreparationContextBar({ preparationReference, demande, demandeHref, campagnesHref, interventionsHref }) {
  if (!preparationReference && !demande?.reference) return null
  const contextLine = [
    demande.chantier,
    demande.client,
    demande.affaire_ref,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-[16px] border border-[#dbe1ea] bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[15px] font-black text-[#003170]">{preparationReference || '—'}</div>
        {demande.reference ? (
          <div className="mt-0.5 text-[12px] font-bold text-[#69758a]">
            Demande {demande.reference}
          </div>
        ) : null}
        {demande.nature || demande.type_mission ? (
          <div className="text-[13px] text-[#172033]">{demande.nature || demande.type_mission}</div>
        ) : null}
        {contextLine ? <div className="mt-1 text-[12px] text-[#69758a] truncate">{contextLine}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={demandeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#dbe1ea] bg-[#f8fafc] text-[12px] font-bold text-[#003170] hover:bg-white"
        >
          Voir demande
          <ExternalLink size={13} />
        </a>
        <a
          href={campagnesHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-xl border border-[#dbe1ea] text-[12px] font-bold text-[#69758a] hover:bg-[#f8fafc]"
        >
          Campagnes
        </a>
        <a
          href={interventionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-xl border border-[#dbe1ea] text-[12px] font-bold text-[#69758a] hover:bg-[#f8fafc]"
        >
          Interventions
        </a>
      </div>
    </div>
  )
}

export default function PreparationPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { uid } = useParams()
  const [searchParams] = useSearchParams()

  const demandeUid = useMemo(() => String(uid || searchParams.get('uid') || ''), [uid, searchParams])
  const demandeReferenceFromQuery = useMemo(() => searchParams.get('ref') || searchParams.get('reference') || '', [searchParams])
  const returnTo = resolveReturnTo(searchParams.get('return_to'), `/demandes/${demandeUid}`)
  const [view, setView] = useState('planning')
  const [interventionCreateDraft, setInterventionCreateDraft] = useState(null)
  const [boardError, setBoardError] = useState('')

  const { data: nav, isLoading: navLoading } = useQuery({
    queryKey: ['demande-nav', demandeUid],
    queryFn: () => api.get(`/demandes_rst/${demandeUid}/navigation`),
    enabled: !!demandeUid,
  })

  const originalPrep = nav?.preparation || {}
  const campaigns = nav?.campagnes || []
  const interventions = nav?.interventions || []
  const essais = nav?.essais || []
  const echantillons = nav?.echantillons || []
  const navCounts = nav?.counts || {}

  const demandeReference = nav?.demande?.reference || nav?.reference || demandeReferenceFromQuery || ''
  const preparationReference = originalPrep.reference || ''
  const demandeAffaire = nav?.demande?.affaire_reference || nav?.demande?.affaire_ref || nav?.affaire_reference || nav?.affaire_ref || ''
  const demandeChantier = nav?.demande?.chantier || nav?.chantier || nav?.demande?.site || nav?.site || ''

  const demandeForHero = useMemo(() => {
    const d = nav?.demande || {}
    return {
      reference: demandeReference,
      nature: d.nature,
      type_mission: d.type_mission,
      affaire_ref: demandeAffaire,
      chantier: demandeChantier,
      site: d.site || demandeChantier,
      client: d.client || nav?.client,
    }
  }, [nav, demandeReference, demandeAffaire, demandeChantier])

  const preparationReturnPath = `/preparations/${demandeUid}`
  const demandeExternalHref = buildPathWithReturnTo(`/demandes/${demandeUid}`, preparationReturnPath)
  const passationUid = nav?.passation_uid || null
  const passationExternalHref = passationUid
    ? buildPathWithReturnTo(`/passations/${passationUid}`, preparationReturnPath)
    : ''
  const campagnesExternalHref = buildPathWithReturnTo(`/campagnes?demande_id=${demandeUid}`, preparationReturnPath)
  const interventionsExternalHref = buildPathWithReturnTo(`/interventions?demande_id=${demandeUid}`, preparationReturnPath)

  const linkedInterventionCount = useMemo(() => {
    if (navCounts.interventions != null) return Number(navCounts.interventions) || 0
    return campaigns.reduce((total, campaign) => total + Number(campaign.intervention_count || 0), 0)
  }, [campaigns, navCounts.interventions])

  const essaiCount = useMemo(() => {
    if (navCounts.essais != null) return Number(navCounts.essais) || 0
    return essais.length
  }, [essais.length, navCounts.essais])

  const boardInterventions = useMemo(
    () => collectInterventionsForBoard(campaigns, interventions).all,
    [campaigns, interventions],
  )

  function isoDateOnly(value) {
    if (!value) return ''
    return String(value).slice(0, 10)
  }

  const affaireOpeningDate = nav?.demande?.date_ouverture_affaire || ''
  const planningTimelineOrigin = useMemo(() => (
    resolvePlanningTimelineStartDate({
      campaigns,
      affaireOpeningDate,
      passationDate: isoDateOnly(nav?.passation_date_passation || nav?.passation_created_at),
      demandeDate: isoDateOnly(nav?.demande?.date_reception || nav?.demande?.created_at),
      debutTravauxDate: isoDateOnly(nav?.affaire_date_debut_travaux_prevue || originalPrep.date_prevue),
      fallback: affaireOpeningDate,
    })
  ), [
    campaigns,
    affaireOpeningDate,
    nav?.passation_date_passation,
    nav?.passation_created_at,
    nav?.demande?.date_reception,
    nav?.demande?.created_at,
    nav?.affaire_date_debut_travaux_prevue,
    originalPrep.date_prevue,
  ])
  const planningEndDate = nav?.demande?.date_cloture_affaire || ''
  const planningFocusDate = useMemo(() => (
    resolvePlanningFocusDate({
      campaigns,
      timelineOrigin: planningTimelineOrigin,
      affaireOpeningDate,
      endDate: planningEndDate,
    })
  ), [campaigns, planningTimelineOrigin, affaireOpeningDate, planningEndDate])

  const dossierContext = useMemo(() => {
    const demande = nav?.demande || {}
    const debutTravauxDate = isoDateOnly(
      nav?.affaire_date_debut_travaux_prevue || originalPrep.date_prevue,
    )
    const debutTravauxRoute = demande.affaire_rst_id
      ? `/affaires/${demande.affaire_rst_id}`
      : preparationReturnPath
    return {
      passation: passationUid && nav?.passation_reference
        ? {
            reference: nav.passation_reference,
            route: `/passations/${passationUid}`,
            created: isoDateOnly(nav?.passation_date_passation || nav?.passation_created_at),
          }
        : null,
      demande: demandeReference
        ? {
            reference: demandeReference,
            route: `/demandes/${demandeUid}`,
            created: isoDateOnly(demande.date_reception || demande.created_at),
          }
        : null,
      affaire: demandeAffaire
        ? {
            reference: demandeAffaire,
            label: demandeChantier || demande.client || '',
            route: demande.affaire_rst_id ? `/affaires/${demande.affaire_rst_id}` : '',
            created: affaireOpeningDate,
          }
        : null,
      debutTravaux: debutTravauxDate
        ? {
            reference: 'Début travaux',
            route: debutTravauxRoute,
            created: debutTravauxDate,
          }
        : null,
    }
  }, [
    passationUid,
    nav?.passation_reference,
    nav?.passation_created_at,
    nav?.passation_date_passation,
    nav?.affaire_date_debut_travaux_prevue,
    nav?.demande,
    demandeReference,
    demandeUid,
    demandeAffaire,
    demandeChantier,
    affaireOpeningDate,
    originalPrep.date_prevue,
    preparationReturnPath,
  ])

  const createCampaignMutation = useMutation({
    mutationFn: async (template) => interventionCampaignsApi.create({
      demande_id: Number(demandeUid),
      code: template?.code || '',
      label: template?.label || 'Campagne',
      designation: '',
      date_debut_prevue: isoDateOnly(nav?.affaire_date_debut_travaux_prevue || originalPrep.date_prevue),
    }),
    onSuccess: async () => {
      setBoardError('')
      await qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })
      await qc.invalidateQueries({ queryKey: ['preparation-planning', demandeUid] })
    },
    onError: (error) => setBoardError(error.message),
  })

  const createEssaiMutation = useMutation({
    mutationFn: async ({ essaiCode, intervention, echantillon, campaignLabel }) => openEssaiCreation({
      essaiCode,
      intervention,
      echantillon,
      demande: demandeForHero,
      preparation: originalPrep,
      campaignLabel,
      returnTo: preparationReturnPath,
      navigate,
    }),
  })

  async function handleCreateEssai(payload) {
    setBoardError('')
    try {
      await createEssaiMutation.mutateAsync(payload)
    } catch (error) {
      setBoardError(error.message)
      throw error
    }
  }

  function openInterventionTypeModal(campaign = null) {
    const basePath = buildCreateInterventionHref({
      demandeUid,
      preparation: originalPrep,
      campaign,
      demande: demandeForHero,
      returnTo: preparationReturnPath,
    })
    setInterventionCreateDraft({
      basePath,
      campaign,
      campaignLabel: campaign?.reference || campaign?.label || '',
    })
  }

  function handleSelectInterventionType(typeIntervention) {
    if (!interventionCreateDraft?.basePath) return
    navigate(applyInterventionTypeToPath(interventionCreateDraft.basePath, typeIntervention))
    setInterventionCreateDraft(null)
  }

  if (!demandeUid) {
    return (
      <div className="p-6">
        <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">
          Demande introuvable.
        </div>
      </div>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnTo)}
        eyebrow="Préparation"
        title={preparationReference || `Préparation #${originalPrep.uid || demandeUid}`}
        subtitle={demandeReference ? `Planning · ${demandeReference}` : 'Planning opérationnel'}
      >
        <div className="inline-flex rounded-xl border border-[#dbe1ea] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setView('planning')}
            className={`px-3 py-1.5 rounded-[10px] text-[12px] font-bold ${view === 'planning' ? 'bg-[#003170] text-white' : 'text-[#69758a]'}`}
          >
            Planning
          </button>
          <button
            type="button"
            onClick={() => setView('board')}
            className={`px-3 py-1.5 rounded-[10px] text-[12px] font-bold ${view === 'board' ? 'bg-[#003170] text-white' : 'text-[#69758a]'}`}
          >
            Board
          </button>
        </div>
        <a
          href={demandeExternalHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]"
        >
          Demande
          <ExternalLink size={12} />
        </a>
        {passationExternalHref ? (
          <a
            href={passationExternalHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]"
          >
            Passation
            <ExternalLink size={12} />
          </a>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })} disabled={navLoading}>
          <RefreshCw size={13} />
          <span className="ml-1">Rafraîchir</span>
        </Button>
      </FicheTopbar>

      <FicheMain>
        {!navLoading && (preparationReference || demandeForHero.reference) ? (
          <PreparationContextBar
            preparationReference={preparationReference}
            demande={demandeForHero}
            demandeHref={demandeExternalHref}
            campagnesHref={campagnesExternalHref}
            interventionsHref={interventionsExternalHref}
          />
        ) : null}

        {navLoading ? (
          <div className="rounded-[18px] border border-[#dbe1ea] bg-white p-10 text-center text-[#69758a] text-[13px]">Chargement…</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <MetricCard label="Campagnes" value={campaigns.length} detail="Branches opérationnelles" />
              <MetricCard label="Interventions" value={linkedInterventionCount} detail="Fiches terrain" />
              <MetricCard label="Essais" value={essaiCount} detail="Labo et terrain" />
            </div>

            {view === 'planning' ? (
              <PreparationPlanningPanel
                demandeUid={demandeUid}
                returnTo={preparationReturnPath}
                campaigns={campaigns}
                planningStartDate={planningTimelineOrigin}
                planningFocusDate={planningFocusDate}
                planningEndDate={planningEndDate}
                dossierContext={dossierContext}
                boardInterventions={boardInterventions}
                echantillons={echantillons}
                onCreateCampaign={(template) => createCampaignMutation.mutateAsync(template)}
                onCreateIntervention={openInterventionTypeModal}
                onCreateEssai={handleCreateEssai}
                isCreatingCampaign={createCampaignMutation.isPending}
                isCreatingEssai={createEssaiMutation.isPending}
              />
            ) : null}

            {view === 'board' ? (
              <PreparationDossierPanel
                demandeUid={demandeUid}
                returnTo={preparationReturnPath}
                preparation={originalPrep}
                demande={demandeForHero}
                campaigns={campaigns}
                interventions={interventions}
                essais={essais}
                echantillons={echantillons}
                onCreateCampaign={(template) => createCampaignMutation.mutate(template)}
                onCreateIntervention={openInterventionTypeModal}
                onCreateEssai={handleCreateEssai}
                isCreatingCampaign={createCampaignMutation.isPending}
                isCreatingEssai={createEssaiMutation.isPending}
              />
            ) : null}

            {boardError ? (
              <div className="text-sm text-danger bg-[#fcebeb] border border-[#f0a0a0] rounded-lg px-3 py-2">
                {boardError}
              </div>
            ) : null}
          </div>
        )}
      </FicheMain>

      <InterventionTypeModal
        open={Boolean(interventionCreateDraft)}
        onClose={() => setInterventionCreateDraft(null)}
        onSelect={handleSelectInterventionType}
        subtitle={interventionCreateDraft?.campaignLabel ? `Campagne: ${interventionCreateDraft.campaignLabel}` : `Demande: ${demandeReference}`}
      />
    </FichePageShell>
  )
}
