import { computeDeConformiteValue } from '@/lib/de/compute'
import { normalizePositionCodes } from '@/lib/positionCodes'
import { computeDeSummary } from '@/services/modelWorkLocalStore'

export function normalizeDeMetaAliases(meta = {}) {
  const safe = meta && typeof meta === 'object' ? { ...meta } : {}

  if ((safe.criteria_void_min == null || safe.criteria_void_min === '') && safe.criteria_vides_min != null) {
    safe.criteria_void_min = safe.criteria_vides_min
  }
  if ((safe.criteria_void_max == null || safe.criteria_void_max === '') && safe.criteria_vides_max != null) {
    safe.criteria_void_max = safe.criteria_vides_max
  }
  if ((safe.date_essai == null || safe.date_essai === '') && safe.date_essai_raw) {
    safe.date_essai = safe.date_essai_raw
  }
  if ((safe.conclusion_courte == null || safe.conclusion_courte === '') && safe.conclusion) {
    safe.conclusion_courte = safe.conclusion
  }

  return safe
}

export function toDeDraft(values = {}) {
  return {
    meta: normalizeDeMetaAliases(values?.meta),
    points_rows: Array.isArray(values?.points_rows)
      ? values.points_rows.map((row, index) => ({
          ...row,
          id: row?.id ?? index + 1,
          position_codes: normalizePositionCodes(row?.position_codes),
        }))
      : [],
  }
}

export function hasSavedDeRuntimeContent(payload = {}) {
  if (!payload || typeof payload !== 'object') return false
  if (Array.isArray(payload.points_rows) && payload.points_rows.length > 0) return true
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {}
  return Object.keys(meta).length > 0
}

export function buildInheritedDeMetaFromFeuille(feuilleData = {}, payload = {}) {
  const meta = {}
  const dateFeuille = String(feuilleData?.date_feuille || '').trim()
  if (dateFeuille) meta.date_essai = dateFeuille
  const operateur = String(feuilleData?.operateur || '').trim()
  if (operateur) meta.operateur = operateur
  const section = String(
    payload?.section_controlee
    || feuilleData?.intervention_subject
    || '',
  ).trim()
  if (section) meta.section_controlee = section
  return meta
}

export function resolveDeDraftFromFeuille(feuilleData = {}) {
  const payload = feuilleData?.payload && typeof feuilleData.payload === 'object' ? feuilleData.payload : {}

  if (hasSavedDeRuntimeContent(payload)) {
    return toDeDraft(payload)
  }

  const inherited = buildInheritedDeMetaFromFeuille(feuilleData, payload)
  return toDeDraft({
    meta: {
      ...inherited,
      demande_id: feuilleData?.demande_id ?? '',
      intervention_id: feuilleData?.intervention_id ?? '',
      campagne_id: feuilleData?.campagne_id ?? feuilleData?.campaign_id ?? '',
    },
    points_rows: [],
  })
}

export function buildDeRuntimePayload(draft = {}) {
  const rows = Array.isArray(draft.points_rows) ? draft.points_rows : []
  const meta = normalizeDeMetaAliases(draft?.meta || {})
  const resume = computeDeSummary(rows)
  const conformite = computeDeConformiteValue(
    resume?.moyenne_vides_pct,
    meta?.criteria_void_min,
    meta?.criteria_void_max,
  )
  return {
    meta: { ...meta, conformite },
    points_rows: rows,
    resume,
  }
}

const CONFORMITE_LABELS = {
  conforme: 'Conforme',
  non_conforme: 'Non conforme',
  pour_info: 'Pour info',
}

export function resolveDeConformiteLabel(meta = {}, resume = {}) {
  const code = String(meta?.conformite || '').trim()
    || computeDeConformiteValue(
      resume?.moyenne_vides_pct ?? resume?.average_voids,
      meta?.criteria_void_min,
      meta?.criteria_void_max,
    )
  return CONFORMITE_LABELS[code] || ''
}

export function resolveDeResumeForReport(resume = {}) {
  const safe = resume && typeof resume === 'object' ? resume : {}
  return {
    averageDensity: safe.average_density ?? safe.moyenne_mv ?? '',
    averageCompacity: safe.average_compacity ?? safe.moyenne_compacite_pct ?? '',
    averageVoids: safe.average_voids ?? safe.moyenne_vides_pct ?? '',
    conformityRate: safe.conformity_rate ?? safe.taux_conformite ?? '',
  }
}
