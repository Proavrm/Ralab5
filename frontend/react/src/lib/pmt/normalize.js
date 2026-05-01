import { summarizePmtRows } from './compute'

export function normalizePmtRows(rows = []) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, index) => ({
    id: row?.id ?? index + 1,
    point: String(row?.point || ''),
    profondeur_macrotexture_mm: row?.profondeur_macrotexture_mm ?? row?.pmt_mm ?? '',
    observation: String(row?.observation || ''),
  }))
}

export function normalizePmtMeta(meta = {}) {
  const safe = meta && typeof meta === 'object' ? meta : {}
  return {
    reference_chantier: String(safe.reference_chantier || ''),
    date_essai: String(safe.date_essai || ''),
    emplacement: String(safe.emplacement || ''),
    criteria_pmt_min: safe.criteria_pmt_min ?? '',
    criteria_conformity_min_pct: safe.criteria_conformity_min_pct ?? '',
  }
}

export function normalizePmtRuntimeValues(values = {}) {
  const safe = values && typeof values === 'object' ? values : {}
  const meta = normalizePmtMeta(safe.meta)
  const pointsRows = normalizePmtRows(safe.points_rows)
  const resume = summarizePmtRows(pointsRows, meta.criteria_pmt_min)
  return {
    meta,
    points_rows: pointsRows,
    resume,
  }
}
