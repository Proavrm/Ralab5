/** Synthèse des points implantés à partir du payload canvas d'un plan PI. */

function collectCanvasPoints(payload) {
    const byCode = new Map()
    const root = payload && typeof payload === 'object' ? payload : {}

    const absorb = (points) => {
        if (!Array.isArray(points)) return
        for (const point of points) {
            const code = String(point?.code || '').trim()
            if (!code) continue
            const key = code.toUpperCase()
            const prev = byCode.get(key)
            const placed = point?.x != null && point?.y != null
            if (!prev) {
                byCode.set(key, { ...point, code, placed })
                continue
            }
            if (!prev.placed && placed) {
                byCode.set(key, { ...point, code, placed })
            }
        }
    }

    absorb(root.canvas?.points)
    const byFeuille = root.canvas_by_feuille
    if (byFeuille && typeof byFeuille === 'object') {
        Object.values(byFeuille).forEach((entry) => absorb(entry?.points))
    }

    return [...byCode.values()]
}

export function summarizePlanImplantation(plan) {
    const payload = plan?.payload || {}
    const points = collectCanvasPoints(payload)
    const implanted = points.filter((point) => point.placed).length
    const total = points.length
    return {
        total,
        implanted,
        pending: Math.max(0, total - implanted),
        hasCanvas: total > 0 || Boolean(plan?.fond_plan || payload?.fond_plan || payload?.canvas?.image_path),
    }
}

export function resolvePlanInterventionLabel(plan, interventionsByUid) {
    if (plan?.intervention_reference) return plan.intervention_reference
    const interventionId = Number(plan?.intervention_id || 0)
    if (interventionId > 0) {
        const row = interventionsByUid?.get?.(interventionId)
        if (row?.reference) return row.reference
        return `#${interventionId}`
    }
    return '—'
}

export function formatPlanPointsSummary(summary) {
    if (!summary?.hasCanvas && !summary?.total) return 'Aucun point'
    if (!summary.total) return 'Plan sans points'
    if (summary.implanted === summary.total) return `${summary.implanted} point${summary.implanted > 1 ? 's' : ''} implanté${summary.implanted > 1 ? 's' : ''}`
    return `${summary.implanted}/${summary.total} implanté${summary.total > 1 ? 's' : ''}`
}
