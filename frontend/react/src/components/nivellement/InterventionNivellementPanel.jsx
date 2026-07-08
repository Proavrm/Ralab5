import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SectionCard } from '@/components/layout/FicheLayout'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { nivellementsApi, plansImplantationApi } from '@/services/api'

function formatCoord(value) {
    if (value == null || value === '') return '—'
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '—'
    return numeric.toLocaleString('fr-FR', { maximumFractionDigits: 3 })
}

export default function InterventionNivellementPanel({
    interventionUid,
    demandeId,
    returnTo,
    readOnly = false,
}) {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(!readOnly)
    const ensureRequestedRef = useRef(false)

    const hasIntervention = Number.isInteger(interventionUid) && interventionUid > 0
    const hasDemande = Number.isInteger(demandeId) && demandeId > 0

    const { data: linkedPlans = [], isLoading: plansLoading } = useQuery({
        queryKey: ['plans-implantation', 'intervention', interventionUid],
        queryFn: () => plansImplantationApi.list({ intervention_id: interventionUid }),
        enabled: hasIntervention,
    })

    const hasPi = linkedPlans.length > 0

    const { data: linkedNivellements = [], isLoading: nivellementsLoading } = useQuery({
        queryKey: ['nivellements', 'intervention', interventionUid],
        queryFn: () => nivellementsApi.list({ intervention_id: interventionUid }),
        enabled: hasIntervention,
    })

    const ensureMutation = useMutation({
        mutationFn: () => nivellementsApi.ensureForIntervention(interventionUid),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['nivellements', 'intervention', interventionUid] })
        },
    })

    const deleteNivellementMutation = useMutation({
        mutationFn: (nivellementUid) => nivellementsApi.delete(nivellementUid),
        onSuccess: async () => {
            ensureRequestedRef.current = false
            await queryClient.invalidateQueries({ queryKey: ['nivellements', 'intervention', interventionUid] })
        },
    })

    useEffect(() => {
        ensureRequestedRef.current = false
    }, [interventionUid])

    useEffect(() => {
        if (!hasIntervention || !hasPi || nivellementsLoading || ensureRequestedRef.current) return
        if (linkedNivellements.length > 0) return
        ensureRequestedRef.current = true
        ensureMutation.mutate()
    }, [hasIntervention, hasPi, linkedNivellements.length, nivellementsLoading, ensureMutation])

    const primaryNivellement = linkedNivellements[0] || null
    const isEnsuring = ensureMutation.isPending || (hasPi && !nivellementsLoading && !primaryNivellement && !ensureMutation.isError)

    function handleDeleteNivellement() {
        if (!primaryNivellement?.uid) return
        const label = primaryNivellement.reference || `NI #${primaryNivellement.uid}`
        if (!window.confirm(
            `Supprimer le nivellement ${label} ?\n\nLa fiche NI sera supprimée. Les altitudes Z déjà saisies sur les points terrain restent inchangées.`,
        )) return
        deleteNivellementMutation.mutate(primaryNivellement.uid)
    }

    const { data: nivellementDetail } = useQuery({
        queryKey: ['nivellement', primaryNivellement?.uid],
        queryFn: () => nivellementsApi.get(primaryNivellement.uid),
        enabled: Boolean(primaryNivellement?.uid),
    })

    const terrainPoints = useMemo(
        () => (Array.isArray(nivellementDetail?.terrain_points) ? nivellementDetail.terrain_points : []),
        [nivellementDetail?.terrain_points],
    )

    const pointsWithZ = useMemo(
        () => terrainPoints.filter((item) => item?.z != null && item.z !== '').length,
        [terrainPoints],
    )

    if (!hasIntervention || !hasDemande) return null
    if (!hasPi && !primaryNivellement && !nivellementsLoading && !isEnsuring) return null

    const subtitle = plansLoading || nivellementsLoading || isEnsuring
        ? 'Synchronisation PI / NI…'
        : primaryNivellement
            ? `${primaryNivellement.reference || 'Nivellement'} · ${terrainPoints.length || primaryNivellement.points_count || 0} point(s) · ${pointsWithZ} avec Z`
            : 'Nivellement rattaché au plan d\'implantation de cette intervention.'

    const managementActions = (
        <>
            {primaryNivellement ? (
                <>
                    <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate(buildPathWithReturnTo(`/nivellements/${primaryNivellement.uid}`, returnTo))}
                    >
                        Ouvrir NI
                    </Button>
                    <Button
                        size="sm"
                        variant="danger"
                        disabled={deleteNivellementMutation.isPending}
                        onClick={handleDeleteNivellement}
                    >
                        Supprimer
                    </Button>
                </>
            ) : null}
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="inline-flex items-center justify-center rounded-lg border border-[#dbe1ea] bg-white p-1.5 text-[#69758a] transition-colors hover:bg-[#eef3f9] hover:text-[#003170]"
                title={open ? 'Masquer le nivellement' : 'Afficher le nivellement'}
                aria-expanded={open}
            >
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
        </>
    )

    return (
        <SectionCard
            title="Nivellement (NI)"
            subtitle={subtitle}
            actions={managementActions}
        >
            {isEnsuring ? (
                <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-4 text-[13px] text-[#69758a] leading-6">
                    Création automatique du nivellement associé au plan d&apos;implantation…
                </div>
            ) : primaryNivellement && open ? (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2.5">
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-text truncate">
                                {primaryNivellement.reference || `NI #${primaryNivellement.uid}`}
                            </div>
                            <div className="text-xs text-text-muted truncate">
                                {primaryNivellement.titre || 'Nivellement intervention'}
                                {primaryNivellement.date_releve ? ` · ${primaryNivellement.date_releve}` : ''}
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(buildPathWithReturnTo(`/nivellements/${primaryNivellement.uid}`, returnTo))}
                        >
                            Fiche NI
                        </Button>
                    </div>

                    {terrainPoints.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-bg border-b border-border">
                                        <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Point</th>
                                        <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Type</th>
                                        <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">X</th>
                                        <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Y</th>
                                        <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Z</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {terrainPoints.map((point) => (
                                        <tr key={point.uid} className="border-b border-border last:border-b-0">
                                            <td className="px-2 py-1.5 text-[12px] font-semibold text-text">{point.point_code || '—'}</td>
                                            <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.point_type || '—'}</td>
                                            <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{formatCoord(point.x ?? point.plan_canvas_x)}</td>
                                            <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{formatCoord(point.y ?? point.plan_canvas_y)}</td>
                                            <td className="px-2 py-1.5 text-[12px] text-right font-medium text-text">{formatCoord(point.z)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-[13px] text-text-muted">
                            Aucun point terrain pour cette intervention. Implantez des points dans le canevas PI pour saisir ensuite le Z ici.
                        </div>
                    )}
                </div>
            ) : null}
        </SectionCard>
    )
}
