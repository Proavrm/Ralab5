export function parsePmtNumericValue(value) {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function computePmtFromDiameter(diameterMm) {
  const d = parsePmtNumericValue(diameterMm)
  if (d == null || d <= 0) return null
  return Number(d.toFixed(2))
}

export function summarizePmtRows(rows = [], minThreshold = null) {
  const values = (Array.isArray(rows) ? rows : [])
    .map((row) => parsePmtNumericValue(row?.profondeur_macrotexture_mm ?? row?.pmt_mm))
    .filter((value) => value != null)

  const threshold = parsePmtNumericValue(minThreshold)
  const count = values.length
  const average = count ? Number((values.reduce((sum, v) => sum + v, 0) / count).toFixed(2)) : null
  const min = count ? Number(Math.min(...values).toFixed(2)) : null
  const max = count ? Number(Math.max(...values).toFixed(2)) : null
  const conformCount = threshold == null ? count : values.filter((v) => v >= threshold).length
  const conformityPct = count ? Number(((conformCount / count) * 100).toFixed(2)) : null

  return {
    points: count,
    profondeur_macrotexture_generale_mm: average,
    min_pmt_mm: min,
    max_pmt_mm: max,
    pourcentage_valeurs_conformes: conformityPct,
  }
}

export function isPmtNonConforme(summary = {}, minConformityPct = null) {
  const pct = parsePmtNumericValue(summary?.pourcentage_valeurs_conformes)
  const minPct = parsePmtNumericValue(minConformityPct)
  if (pct == null || minPct == null) return false
  return pct < minPct
}
