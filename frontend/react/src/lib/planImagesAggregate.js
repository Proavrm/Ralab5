import {
    formatPlanPointsSummary,
    resolvePlanInterventionLabel,
} from '@/lib/planImplantationSummary'
import {
    isStorageImagePath,
    normalizePlanImagePath,
    planImageLabel,
} from '@/lib/planImagePaths'

function resolveInterventionLabel(plan, interventionsByUid) {
    return resolvePlanInterventionLabel(plan, interventionsByUid)
}

function absorbPoints(target, points, source) {
    if (!Array.isArray(points)) return
    for (const point of points) {
        const code = String(point?.code || '').trim()
        if (!code) continue
        const placed = point?.x != null && point?.y != null
        const key = `${source.interventionId || 0}:${code.toUpperCase()}`
        if (target.pointKeys.has(key)) continue
        target.pointKeys.add(key)
        target.points.push({
            ...point,
            code,
            placed,
            interventionReference: source.interventionReference,
            planUid: source.planUid,
        })
        target.total += 1
        if (placed) target.implanted += 1
    }
}

function registerSource(entry, source) {
    const existing = entry.sources.find((item) => item.planUid === source.planUid)
    if (existing) return
    entry.sources.push(source)
    if (source.interventionReference && !entry.interventionLabels.includes(source.interventionReference)) {
        entry.interventionLabels.push(source.interventionReference)
    }
}

function ensureEntry(byPath, rawPath, seed = {}) {
    const imagePath = normalizePlanImagePath(rawPath)
    if (!imagePath || !isStorageImagePath(imagePath)) return null
    if (!byPath.has(imagePath)) {
        byPath.set(imagePath, {
            imagePath,
            label: seed.label || planImageLabel(imagePath),
            relativePath: seed.relativePath || '',
            updatedAt: seed.updatedAt || '',
            points: [],
            pointKeys: new Set(),
            sources: [],
            interventionLabels: [],
            total: 0,
            implanted: 0,
        })
    }
    const entry = byPath.get(imagePath)
    if (seed.label && entry.label === planImageLabel(imagePath)) entry.label = seed.label
    if (seed.relativePath && !entry.relativePath) entry.relativePath = seed.relativePath
    if (seed.updatedAt && !entry.updatedAt) entry.updatedAt = seed.updatedAt
    return entry
}

function collectCanvasEntries(payload) {
    const entries = []
    const root = payload && typeof payload === 'object' ? payload : {}
    const canvasByFeuille = root.canvas_by_feuille
    if (canvasByFeuille && typeof canvasByFeuille === 'object') {
        Object.values(canvasByFeuille).forEach((item) => {
            if (item && typeof item === 'object') entries.push(item)
        })
    }
    if (root.canvas && typeof root.canvas === 'object') {
        entries.push(root.canvas)
    }
    const fondPlan = normalizePlanImagePath(root.fond_plan || '')
    if (fondPlan && isStorageImagePath(fondPlan)) {
        entries.push({
            image_path: fondPlan,
            points: root.canvas?.points || [],
        })
    }
    return entries
}

export function aggregatePlanImages({
    plans = [],
    imageFiles = [],
    interventionsByUid,
    includeUnusedImages = true,
}) {
    const byPath = new Map()

    if (includeUnusedImages) {
        for (const file of imageFiles) {
            ensureEntry(byPath, file?.path, {
                label: file?.name || planImageLabel(file?.path),
                relativePath: file?.relative_path || '',
                updatedAt: file?.updated_at || '',
            })
        }
    }

    for (const plan of plans) {
        const source = {
            planUid: plan?.uid,
            planReference: plan?.reference || '',
            interventionId: Number(plan?.intervention_id || 0),
            interventionReference: resolveInterventionLabel(plan, interventionsByUid),
            statut: plan?.statut || '',
        }
        const payload = plan?.payload || {}
        const fondPlan = normalizePlanImagePath(plan?.fond_plan || payload?.fond_plan || '')

        for (const canvasEntry of collectCanvasEntries(payload)) {
            const imagePath = normalizePlanImagePath(canvasEntry?.image_path || fondPlan)
            const entry = ensureEntry(byPath, imagePath, {
                label: planImageLabel(imagePath),
            })
            if (!entry) continue
            registerSource(entry, source)
            absorbPoints(entry, canvasEntry?.points, source)
        }

        if (fondPlan && isStorageImagePath(fondPlan)) {
            const entry = ensureEntry(byPath, fondPlan, { label: planImageLabel(fondPlan) })
            if (entry) registerSource(entry, source)
        }
    }

    const rows = [...byPath.values()]
        .map((entry) => {
            const summary = {
                total: entry.total,
                implanted: entry.implanted,
                pending: Math.max(0, entry.total - entry.implanted),
                hasCanvas: entry.total > 0,
            }
            const statut = entry.total === 0
                ? (entry.sources.length ? 'Sans implantation' : 'Plan disponible')
                : (entry.implanted === entry.total ? 'Implanté' : 'Partiel')
            return {
                ...entry,
                summary,
                pointsSummary: formatPlanPointsSummary(summary),
                statut,
                interventionLabel: entry.interventionLabels.length
                    ? entry.interventionLabels.join(', ')
                    : '—',
            }
        })
        .sort((left, right) => {
            const leftScore = left.total > 0 ? 0 : 1
            const rightScore = right.total > 0 ? 0 : 1
            if (leftScore !== rightScore) return leftScore - rightScore
            return String(left.label || '').localeCompare(String(right.label || ''), 'fr', { sensitivity: 'base' })
        })

    if (!includeUnusedImages) {
        return rows.filter((row) => row.total > 0 || row.sources.length > 0)
    }
    return rows
}
