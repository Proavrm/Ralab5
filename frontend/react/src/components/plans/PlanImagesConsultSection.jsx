import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import { SectionCard } from '@/components/layout/FicheLayout'
import PlanImagesStack, { buildPlanImagesSubtitle, usePlanImageRows } from '@/components/plans/PlanImagesStack'

export default function PlanImagesConsultSection({
    title = "Plans d'implantation",
    subtitle,
    plans = [],
    imageFiles = [],
    interventionsByUid,
    includeUnusedImages = true,
    emptyMessage,
    separateViewHref = '',
    extraActions = null,
    rowActions = null,
    defaultOpen = false,
    alwaysShowToggle = false,
}) {
    const [open, setOpen] = useState(defaultOpen)

    const rows = usePlanImageRows({
        plans,
        imageFiles,
        interventionsByUid,
        includeUnusedImages,
    })

    const resolvedSubtitle = subtitle || buildPlanImagesSubtitle(rows, emptyMessage)
    const hasToggle = rows.length > 0 || alwaysShowToggle
    const showExpanded = open && rows.length > 0

    const headerActions = (hasToggle || extraActions) ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {extraActions}
            {separateViewHref && rows.length > 0 ? (
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => window.open(separateViewHref, '_blank', 'noopener,noreferrer')}
                    title="Ouvrir les plans dans un nouvel onglet"
                >
                    <ExternalLink size={13} />
                    <span className="ml-1">Nouvel onglet</span>
                </Button>
            ) : null}
            {hasToggle ? (
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="inline-flex items-center justify-center rounded-lg border border-[#dbe1ea] bg-white p-1.5 text-[#69758a] transition-colors hover:bg-[#eef3f9] hover:text-[#003170]"
                    title={open ? 'Masquer les plans' : 'Afficher les plans'}
                    aria-expanded={open}
                >
                    <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
            ) : null}
        </div>
    ) : null

    return (
        <SectionCard title={title} subtitle={resolvedSubtitle} actions={headerActions}>
            {rows.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-4 text-[13px] text-[#69758a] leading-6">
                    {emptyMessage || 'Les plans image du dossier affaire apparaîtront ici avec les implantations réalisées depuis les interventions.'}
                </div>
            ) : showExpanded ? (
                <PlanImagesStack rows={rows} rowActions={rowActions} />
            ) : null}
        </SectionCard>
    )
}
