import { useMemo } from 'react'
import { aggregatePlanImages } from '@/lib/planImagesAggregate'
import { buildStorageImageUrl } from '@/lib/planImagePaths'

const CROQUIS_PALETTE = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function buildTypeColors(points) {
    const typeColors = {}
    let colorIdx = 0
    points.forEach((point) => {
        const type = point.type || point.point_type || 'Point'
        if (!typeColors[type]) {
            typeColors[type] = CROQUIS_PALETTE[colorIdx % CROQUIS_PALETTE.length]
            colorIdx += 1
        }
    })
    return typeColors
}

export function PlanImageCanvas({ row, rowActions = null }) {
    const imageUrl = buildStorageImageUrl(row?.imagePath)
    const points = (row?.points || []).filter((point) => point?.x != null && point?.y != null)
    const typeColors = buildTypeColors(points)

    if (!imageUrl) {
        return (
            <div className="rounded-lg border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 text-center text-[13px] text-[#69758a]">
                Image indisponible — {row?.label || 'plan'}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#003170]">{row.label}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#69758a]">
                        {row.interventionLabel !== '—' ? <span>Intervention {row.interventionLabel}</span> : null}
                        <span>{row.pointsSummary}</span>
                        <span>{row.statut}</span>
                    </div>
                </div>
                {typeof rowActions === 'function' ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {rowActions(row)}
                    </div>
                ) : null}
            </div>
            <div className="relative w-full overflow-hidden rounded-lg border border-[#dbe1ea] bg-[#f8fafc]">
                <img
                    src={imageUrl}
                    alt={row.label || 'Plan'}
                    className="block w-full h-auto select-none"
                    draggable={false}
                />
                {points.length > 0 ? (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none">
                        {points.map((point, index) => {
                            const type = point.type || point.point_type || 'Point'
                            const color = typeColors[type] || CROQUIS_PALETTE[index % CROQUIS_PALETTE.length]
                            return (
                                <g key={`${point.code}-${index}`}>
                                    <circle cx={point.x} cy={point.y} r="1.8" fill={color} stroke="#fff" strokeWidth="0.35" />
                                    <text x={point.x} y={Math.max(2.5, point.y - 2.2)} fontSize="2.4" fill={color} fontWeight="700">
                                        {point.code}
                                    </text>
                                </g>
                            )
                        })}
                    </svg>
                ) : null}
            </div>
        </div>
    )
}

export function usePlanImageRows({
    plans = [],
    imageFiles = [],
    interventionsByUid,
    includeUnusedImages = true,
}) {
    return useMemo(
        () => aggregatePlanImages({
            plans,
            imageFiles,
            interventionsByUid,
            includeUnusedImages,
        }),
        [plans, imageFiles, interventionsByUid, includeUnusedImages],
    )
}

export function buildPlanImagesSubtitle(rows, emptyMessage) {
    if (!rows.length) return emptyMessage || 'Aucun plan image disponible'
    const implantedTotal = rows.reduce((acc, row) => acc + row.summary.implanted, 0)
    const pointsTotal = rows.reduce((acc, row) => acc + row.summary.total, 0)
    return `${rows.length} plan${rows.length > 1 ? 's' : ''} image${rows.length > 1 ? 's' : ''} · ${implantedTotal}/${pointsTotal || implantedTotal} points implantés`
}

export default function PlanImagesStack({
    rows = [],
    footerNote = 'Consultation des plans image — modification des implantations via le canevas de chaque intervention.',
    rowActions = null,
}) {
    if (!rows.length) return null

    return (
        <div className="flex flex-col gap-6">
            {rows.map((row) => (
                <PlanImageCanvas key={row.imagePath} row={row} rowActions={rowActions} />
            ))}
            {footerNote ? (
                <p className="text-[11px] text-[#69758a]">{footerNote}</p>
            ) : null}
        </div>
    )
}
