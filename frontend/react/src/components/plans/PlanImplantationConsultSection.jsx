import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SectionCard } from '@/components/layout/FicheLayout'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import {
    formatPlanPointsSummary,
    resolvePlanInterventionLabel,
    summarizePlanImplantation,
} from '@/lib/planImplantationSummary'
import { formatDate } from '@/lib/utils'

function PlanConsultRow({ plan, interventionLabel, summary, onVoir }) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dbe1ea] bg-white px-4 py-3">
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[#003170]">{plan.reference || `PI #${plan.uid}`}</div>
                <div className="mt-0.5 text-[12px] text-[#172033]">{plan.titre || "Plan d'implantation"}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#69758a]">
                    <span>Intervention {interventionLabel}</span>
                    <span>{formatPlanPointsSummary(summary)}</span>
                    {plan.zone ? <span>{plan.zone}</span> : null}
                    {plan.date_plan ? <span>{formatDate(plan.date_plan)}</span> : null}
                </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {plan.statut ? (
                    <span className="inline-flex items-center rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2 py-0.5 text-[10px] font-medium text-[#69758a]">
                        {plan.statut}
                    </span>
                ) : null}
                <Button size="sm" variant="secondary" onClick={onVoir}>
                    Voir
                </Button>
            </div>
        </div>
    )
}

export default function PlanImplantationConsultSection({
    title = "Plans d'implantation",
    subtitle,
    plans = [],
    interventionsByUid,
    detailReturnTo,
    emptyMessage,
    defaultOpen = false,
}) {
    const navigate = useNavigate()
    const [open, setOpen] = useState(defaultOpen)
    const rows = useMemo(
        () => (Array.isArray(plans) ? plans : []).map((plan) => ({
            plan,
            summary: summarizePlanImplantation(plan),
            interventionLabel: resolvePlanInterventionLabel(plan, interventionsByUid),
        })),
        [plans, interventionsByUid],
    )

    const implantedTotal = rows.reduce((acc, row) => acc + row.summary.implanted, 0)
    const pointsTotal = rows.reduce((acc, row) => acc + row.summary.total, 0)
    const resolvedSubtitle = subtitle || (rows.length
        ? `${rows.length} plan${rows.length > 1 ? 's' : ''} · ${implantedTotal}/${pointsTotal || implantedTotal} points implantés (synthèse)`
        : emptyMessage || 'Aucun plan enregistré')

    return (
        <SectionCard title={title} subtitle={resolvedSubtitle}>
            {rows.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-4 text-[13px] text-[#69758a] leading-6">
                    {emptyMessage || "Les plans créés depuis les interventions apparaîtront ici en lecture seule."}
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => setOpen((value) => !value)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-left transition-colors hover:bg-[#eef3f9]"
                    >
                        <div>
                            <div className="text-[13px] font-semibold text-[#003170]">
                                {open ? 'Masquer les plans' : 'Afficher les plans et implantations'}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[#69758a]">
                                Consultation agrégée — modifications uniquement depuis chaque intervention (canevas).
                            </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-[#69758a] transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open ? (
                        <div className="flex flex-col gap-2">
                            {rows.map(({ plan, summary, interventionLabel }) => (
                                <PlanConsultRow
                                    key={plan.uid}
                                    plan={plan}
                                    summary={summary}
                                    interventionLabel={interventionLabel}
                                    onVoir={() => navigate(buildPathWithReturnTo(
                                        `/plans-implantation/${plan.uid}?mode=consultation`,
                                        detailReturnTo,
                                    ))}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
            )}
        </SectionCard>
    )
}
