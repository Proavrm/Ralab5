export const CORRECTION_REQUESTED_STATUS = 'Correction demandée'

export const CORRECTION_REASON_LABELS = {
    wrong_calculations: 'Valeurs / calculs erronés',
    data_entry_error: 'Erreur de saisie',
    missing_data: 'Données manquantes ou incomplètes',
    model_mismatch: 'Incohérence avec le modèle / la procédure',
    photo_document: 'Photo, coupe ou document à corriger',
    layout_format: 'Mise en forme du rapport',
    identification_layers: 'Identification des couches / matériaux',
    lab_results: 'Résultats de laboratoire à revoir',
    other: 'Autre motif',
}

export function normalizeValidationStatus(status) {
    const value = String(status || '').trim()
    if (!value) return ''
    const lower = value.toLowerCase()
    if (lower === 'correction demandée' || lower === 'correction demandee') {
        return CORRECTION_REQUESTED_STATUS
    }
    return value
}

export function isCorrectionRequested(status) {
    return normalizeValidationStatus(status) === CORRECTION_REQUESTED_STATUS
}

export function formatCorrectionReasons(reasonIds = []) {
    if (!Array.isArray(reasonIds) || !reasonIds.length) return []
    return reasonIds
        .map((id) => CORRECTION_REASON_LABELS[id] || String(id || '').trim())
        .filter(Boolean)
}

function resolveCommentFromHistory(history = []) {
    if (!Array.isArray(history)) return ''
    for (const item of history) {
        const comment = String(item?.comment || '').trim()
        if (comment) return comment
    }
    return ''
}

export function buildValidationInfo({
    status = '',
    comment = '',
    reasons = [],
    history = [],
} = {}) {
    const normalizedStatus = normalizeValidationStatus(status)
    const resolvedComment = String(comment || '').trim() || resolveCommentFromHistory(history)
    const resolvedReasons = formatCorrectionReasons(reasons)
    const isCorrection = isCorrectionRequested(normalizedStatus)

    return {
        status: normalizedStatus,
        comment: resolvedComment,
        reasons: resolvedReasons,
        isCorrection,
        hasNote: Boolean(resolvedComment) || resolvedReasons.length > 0 || isCorrection,
    }
}

export function getFeuilleValidationInfo(data) {
    const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {}
    const history = Array.isArray(payload.validation_history) ? payload.validation_history : []

    return buildValidationInfo({
        status: payload.rapport_status
            || payload.validation_status
            || payload.report_status
            || data?.rapport_status
            || data?.validation_status
            || data?.statut
            || '',
        comment: payload.validation_comment || data?.validation_comment || '',
        reasons: payload.correction_reasons || data?.correction_reasons || [],
        history,
    })
}

export function getPmtValidationInfo(essai) {
    const history = Array.isArray(essai?.validation_history) ? essai.validation_history : []

    return buildValidationInfo({
        status: essai?.statut || essai?.status || essai?.rapport_status || '',
        comment: essai?.validation_comment || essai?.validationComment || '',
        reasons: essai?.correction_reasons || essai?.correctionReasons || [],
        history,
    })
}

export function buildEssaiTarget(report) {
    const type = String(report?.type || '').trim().toUpperCase()
    const sourceUid = String(report?.sourceUid || '').trim()
    const pointUid = String(report?.pointUid || '').trim()
    const pmtEssaiId = String(report?.pmtEssaiId || report?.sourceId || '').trim()

    if (type === 'SC' && sourceUid) {
        const params = new URLSearchParams()
        params.set('source_family', 'terrain')
        params.set('source_uid', sourceUid)
        if (pointUid) params.set('point', pointUid)
        params.set('edit', '1')
        return `/modeles/sc?${params.toString()}`
    }
    if (type === 'DE' && sourceUid) {
        return `/feuilles-terrain/de/${encodeURIComponent(sourceUid)}/runtime`
    }
    if (type === 'PMT' && pmtEssaiId) {
        const params = new URLSearchParams()
        params.set('pmt_essai_id', pmtEssaiId)
        return `/modeles/pmt?${params.toString()}`
    }
    if (type === 'SO' && sourceUid) {
        const params = new URLSearchParams()
        if (pointUid) params.set('point', pointUid)
        params.set('edit', '1')
        return `/feuilles-terrain/${encodeURIComponent(sourceUid)}?${params.toString()}`
    }
    return ''
}

export function buildScEssaiRoute(sourceUid, pointUid = '', edit = true) {
    const params = new URLSearchParams()
    params.set('source_family', 'terrain')
    params.set('source_uid', String(sourceUid))
    if (String(pointUid || '').trim()) params.set('point', String(pointUid))
    if (edit) params.set('edit', '1')
    return `/modeles/sc?${params.toString()}`
}
