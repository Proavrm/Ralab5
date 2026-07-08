import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import PlanImagesStack, { buildPlanImagesSubtitle, usePlanImageRows } from '@/components/plans/PlanImagesStack'
import { FicheMain, FichePageShell, FicheTopbar } from '@/components/layout/FicheLayout'
import { navigateBackWithFallback, resolveReturnTo } from '@/lib/detailNavigation'
import { affairesApi, api, demandesApi, interventionCampaignsApi, interventionsApi, plansImplantationApi } from '@/services/api'

function useDemandePlanImages(uid) {
    const { data: demande } = useQuery({
        queryKey: ['demande', uid],
        queryFn: () => demandesApi.get(uid),
        enabled: Boolean(uid),
    })

    const { data: nav } = useQuery({
        queryKey: ['demande-nav', uid],
        queryFn: () => api.get(`/demandes_rst/${uid}/navigation`),
        enabled: Boolean(uid),
    })

    const { data: plans = [] } = useQuery({
        queryKey: ['plans-implantation', 'demande', uid],
        queryFn: () => plansImplantationApi.list({ demande_id: Number(uid) }),
        enabled: Boolean(uid),
    })

    const affaireUid = demande?.affaire_rst_id
    const { data: planImagesData } = useQuery({
        queryKey: ['affaire-plan-images', affaireUid],
        queryFn: () => affairesApi.listPlanImages(affaireUid),
        enabled: Boolean(affaireUid),
    })

    const interventionsByUid = useMemo(
        () => new Map((nav?.interventions || []).map((item) => [Number(item.uid), item])),
        [nav?.interventions],
    )

    const imageFiles = Array.isArray(planImagesData?.files) ? planImagesData.files : []

    return {
        isLoading: !demande,
        title: demande?.reference ? `Plans — ${demande.reference}` : "Plans d'implantation",
        eyebrow: 'Demande',
        backLabel: 'Demande',
        plans,
        imageFiles,
        interventionsByUid,
        includeUnusedImages: true,
    }
}

function useCampaignPlanImages(uid) {
    const { data: campaign, isLoading } = useQuery({
        queryKey: ['campaign', uid],
        queryFn: () => interventionCampaignsApi.get(uid),
        enabled: Boolean(uid),
    })

    const demandeUid = campaign?.demande_id ?? campaign?.demande_uid
    const { data: campaignPlansSource = [] } = useQuery({
        queryKey: ['plans-implantation', 'demande', demandeUid],
        queryFn: () => plansImplantationApi.list({ demande_id: Number(demandeUid) }),
        enabled: Boolean(demandeUid) && Boolean(campaign),
    })

    const campaignInterventionIds = useMemo(() => new Set(
        (Array.isArray(campaign?.interventions) ? campaign.interventions : [])
            .map((item) => Number(item?.uid))
            .filter((value) => Number.isInteger(value) && value > 0),
    ), [campaign?.interventions])

    const plans = useMemo(() => {
        const campaignUid = Number(uid)
        return campaignPlansSource.filter((plan) => {
            const interventionId = Number(plan?.intervention_id || 0)
            const campagneId = Number(plan?.campagne_id || 0)
            return campagneId === campaignUid || campaignInterventionIds.has(interventionId)
        })
    }, [campaignPlansSource, uid, campaignInterventionIds])

    const interventionsByUid = useMemo(
        () => new Map(
            (Array.isArray(campaign?.interventions) ? campaign.interventions : [])
                .map((item) => [Number(item.uid), item]),
        ),
        [campaign?.interventions],
    )

    return {
        isLoading,
        title: campaign?.reference ? `Plans — ${campaign.reference}` : "Plans d'implantation",
        eyebrow: 'Campagne',
        backLabel: 'Campagne',
        plans,
        imageFiles: [],
        interventionsByUid,
        includeUnusedImages: false,
    }
}

function useInterventionPlanImages(uid) {
    const interventionUid = Number(uid)
    const { data: intervention, isLoading } = useQuery({
        queryKey: ['intervention', uid],
        queryFn: () => interventionsApi.get(uid),
        enabled: Boolean(uid),
    })

    const { data: plans = [] } = useQuery({
        queryKey: ['plans-implantation', 'intervention', interventionUid],
        queryFn: () => plansImplantationApi.list({ intervention_id: interventionUid }),
        enabled: Boolean(uid),
    })

    const interventionsByUid = useMemo(
        () => (intervention ? new Map([[interventionUid, intervention]]) : new Map()),
        [intervention, interventionUid],
    )

    return {
        isLoading,
        title: intervention?.reference ? `Plans — ${intervention.reference}` : "Plans d'implantation",
        eyebrow: 'Intervention',
        plans,
        imageFiles: [],
        interventionsByUid,
        includeUnusedImages: false,
        backLabel: 'Intervention',
    }
}

export default function PlanImagesViewPage({ scope = 'demande' }) {
    const { uid = '' } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const isDemande = scope === 'demande'
    const isCampaign = scope === 'campagne'
    const isIntervention = scope === 'intervention'

    const demandeData = useDemandePlanImages(isDemande ? uid : null)
    const campaignData = useCampaignPlanImages(isCampaign ? uid : null)
    const interventionData = useInterventionPlanImages(isIntervention ? uid : null)
    const source = isIntervention ? interventionData : isCampaign ? campaignData : demandeData

    const rows = usePlanImageRows({
        plans: source.plans,
        imageFiles: source.imageFiles,
        interventionsByUid: source.interventionsByUid,
        includeUnusedImages: source.includeUnusedImages,
    })

    const fallbackReturnTo = isIntervention
        ? `/interventions/${uid}`
        : isCampaign
            ? `/campagnes/${uid}`
            : `/demandes/${uid}`
    const returnTo = resolveReturnTo(searchParams, fallbackReturnTo)
    const subtitle = buildPlanImagesSubtitle(
        rows,
        isIntervention
            ? 'Aucun plan image rattaché à cette intervention.'
            : isCampaign
                ? 'Aucun plan image avec implantation pour cette campagne.'
                : 'Aucun plan image disponible pour cette demande.',
    )

    if (source.isLoading) {
        return (
            <FichePageShell>
                <FicheMain>
                    <div className="py-16 text-center text-sm text-text-muted">Chargement des plans…</div>
                </FicheMain>
            </FichePageShell>
        )
    }

    return (
        <FichePageShell>
            <FicheTopbar
                backLabel="← Retour"
                onBack={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}
                eyebrow={source.eyebrow}
                title={source.title}
                subtitle={subtitle}
            >
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(returnTo || fallbackReturnTo)}
                >
                    {source.backLabel || 'Retour'}
                </Button>
            </FicheTopbar>

            <FicheMain>
                {rows.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 text-[13px] text-[#69758a] leading-6">
                        {isIntervention
                            ? 'Aucun plan image rattaché à cette intervention.'
                            : isCampaign
                                ? 'Aucun plan image avec implantation pour cette campagne.'
                                : 'Les plans image du dossier affaire apparaîtront ici avec les implantations réalisées depuis les interventions.'}
                    </div>
                ) : (
                    <PlanImagesStack rows={rows} />
                )}
            </FicheMain>
        </FichePageShell>
    )
}
