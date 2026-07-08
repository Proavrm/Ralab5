import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import PlanImagesConsultSection from '@/components/plans/PlanImagesConsultSection'
import { buildPathWithReturnTo, navigateWithReturnTo } from '@/lib/detailNavigation'
import { plansImplantationApi } from '@/services/api'

function buildPlanCreatePath({
    interventionId,
    demandeId,
    campagneId,
    interventionReference,
    demandeReference,
    campagneReference,
}) {
    const params = new URLSearchParams({
        scope: 'intervention',
        intervention_id: String(interventionId),
        demande_id: String(demandeId),
    })
    if (campagneId) params.set('campagne_id', String(campagneId))
    if (interventionReference) params.set('intervention_reference', interventionReference)
    if (demandeReference) params.set('demande_reference', demandeReference)
    if (campagneReference) params.set('campagne_reference', campagneReference)
    return `/plans-implantation/new?${params.toString()}`
}

function LinkPlanModal({ plans, onClose, onLink, linkingUid }) {
    const linkable = (plans || []).filter((plan) => !plan?.intervention_id)
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-xl rounded-xl border border-border bg-surface shadow-xl">
                <div className="border-b border-border px-4 py-3">
                    <h3 className="text-sm font-semibold text-text">Lier un plan existant</h3>
                    <p className="mt-1 text-xs text-text-muted">
                        Plans de la demande sans intervention rattachée. L&apos;édition se fait ensuite dans le canevas.
                    </p>
                </div>
                <div className="max-h-[360px] overflow-y-auto p-3 flex flex-col gap-2">
                    {linkable.length === 0 ? (
                        <p className="text-sm text-text-muted px-1 py-2">Aucun plan disponible à lier.</p>
                    ) : linkable.map((plan) => (
                        <div key={plan.uid} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg px-3 py-2.5">
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-text truncate">{plan.reference || `PI #${plan.uid}`}</div>
                                <div className="text-xs text-text-muted truncate">{plan.titre || plan.zone || '—'}</div>
                            </div>
                            <Button
                                size="sm"
                                variant="primary"
                                disabled={linkingUid === plan.uid}
                                onClick={() => onLink(plan)}
                            >
                                {linkingUid === plan.uid ? '…' : 'Lier'}
                            </Button>
                        </div>
                    ))}
                </div>
                <div className="border-t border-border px-4 py-3 flex justify-end">
                    <Button size="sm" variant="secondary" onClick={onClose}>Fermer</Button>
                </div>
            </div>
        </div>
    )
}

export default function InterventionPlansPanel({
    interventionUid,
    demandeId,
    campagneId = '',
    interventionReference = '',
    demandeReference = '',
    campagneReference = '',
    returnTo,
    readOnly = false,
}) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [linkModalOpen, setLinkModalOpen] = useState(false)
    const [linkingUid, setLinkingUid] = useState(null)

    const hasIntervention = Number.isInteger(interventionUid) && interventionUid > 0
    const hasDemande = Number.isInteger(demandeId) && demandeId > 0

    const { data: linkedPlans = [], isLoading } = useQuery({
        queryKey: ['plans-implantation', 'intervention', interventionUid],
        queryFn: () => plansImplantationApi.list({ intervention_id: interventionUid }),
        enabled: hasIntervention,
    })

    const { data: demandePlans = [] } = useQuery({
        queryKey: ['plans-implantation', 'demande', demandeId],
        queryFn: () => plansImplantationApi.list({ demande_id: demandeId }),
        enabled: hasDemande && linkModalOpen,
    })

    const interventionsByUid = useMemo(
        () => new Map([[interventionUid, { uid: interventionUid, reference: interventionReference }]]),
        [interventionUid, interventionReference],
    )

    const linkMutation = useMutation({
        mutationFn: (plan) => plansImplantationApi.update(plan.uid, {
            scope: 'intervention',
            demande_id: demandeId,
            campagne_id: campagneId ? Number(campagneId) : null,
            intervention_id: interventionUid,
        }),
        onSuccess: async () => {
            setLinkModalOpen(false)
            setLinkingUid(null)
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['plans-implantation', 'intervention', interventionUid] }),
                queryClient.invalidateQueries({ queryKey: ['plans-implantation', 'demande', demandeId] }),
                queryClient.invalidateQueries({ queryKey: ['nivellements', 'intervention', interventionUid] }),
            ])
        },
        onError: () => setLinkingUid(null),
    })

    const deletePlanMutation = useMutation({
        mutationFn: (planUid) => plansImplantationApi.delete(planUid),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['plans-implantation', 'intervention', interventionUid] }),
                queryClient.invalidateQueries({ queryKey: ['plans-implantation', 'demande', demandeId] }),
                queryClient.invalidateQueries({ queryKey: ['nivellements', 'intervention', interventionUid] }),
            ])
        },
    })

    function handleDeletePlan(planUid) {
        const plan = linkedPlans.find((item) => Number(item.uid) === Number(planUid))
        const label = plan?.reference || `PI #${planUid}`
        if (!window.confirm(
            `Supprimer le plan d'implantation ${label} ?\n\nLe canevas et les implantations planimétriques seront supprimés. Les points terrain (feuilles) et leurs coordonnées Z restent inchangés.`,
        )) return
        deletePlanMutation.mutate(planUid)
    }

    if (!hasIntervention || !hasDemande) return null

    const managementActions = (
        <>
            <Button size="sm" variant="secondary" onClick={() => setLinkModalOpen(true)}>
                Lier existant
            </Button>
            <Button
                size="sm"
                variant="primary"
                onClick={() => navigateWithReturnTo(
                    navigate,
                    buildPlanCreatePath({
                        interventionId: interventionUid,
                        demandeId,
                        campagneId,
                        interventionReference,
                        demandeReference,
                        campagneReference,
                    }),
                    returnTo,
                )}
            >
                Nouveau plan
            </Button>
        </>
    )

    const rowActions = (row) => {
        const planUid = row?.sources?.[0]?.planUid
        if (!planUid) return null
        return (
            <>
                <Button
                    size="sm"
                    variant="primary"
                    onClick={() => navigate(buildPathWithReturnTo(
                        `/plans-implantation/${planUid}/canvas`,
                        returnTo,
                    ))}
                >
                    Canevas
                </Button>
                <Button
                    size="sm"
                    variant="danger"
                    disabled={deletePlanMutation.isPending}
                    onClick={() => handleDeletePlan(planUid)}
                >
                    Supprimer
                </Button>
            </>
        )
    }

    return (
        <>
            <PlanImagesConsultSection
                title="Plans d'implantation"
                subtitle={isLoading
                    ? 'Chargement…'
                    : undefined}
                plans={linkedPlans}
                interventionsByUid={interventionsByUid}
                includeUnusedImages={false}
                separateViewHref={buildPathWithReturnTo(`/interventions/${interventionUid}/plans`, returnTo)}
                extraActions={managementActions}
                rowActions={rowActions}
                defaultOpen={readOnly}
                alwaysShowToggle
                emptyMessage={readOnly
                    ? 'Aucun plan image rattaché à cette intervention.'
                    : 'Aucun plan rattaché à cette intervention. Créez un plan ou liez un plan existant de la demande, puis implantez les points dans le canevas.'}
            />

            {linkModalOpen ? (
                <LinkPlanModal
                    plans={demandePlans}
                    linkingUid={linkingUid}
                    onClose={() => setLinkModalOpen(false)}
                    onLink={(plan) => {
                        setLinkingUid(plan.uid)
                        linkMutation.mutate(plan)
                    }}
                />
            ) : null}
        </>
    )
}
