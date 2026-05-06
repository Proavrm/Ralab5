/** Chiffres + un seul séparateur décimal ; s’arrête au premier caractère non numérique (ex. « 25000 m³ » → « 25000 »). */
export function sanitizePmtNumberFieldInput(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).replace(/[\s\u00a0]/g, '')
  let out = ''
  let sep = false
  for (const ch of s) {
    if (ch >= '0' && ch <= '9') {
      out += ch
    } else if ((ch === '.' || ch === ',') && !sep) {
      sep = true
      out += out === '' ? '0.' : '.'
    } else {
      break
    }
  }
  return out
}

export function parsePmtNumericValue(value) {
  if (value == null || value === '') return null
  const normalized = String(value).replace(/[\s\u00a0]/g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** PMT (mm) = 4V / (π d²) avec V en mm³, d en mm (NF EN 13036-1 / même logique que le rapport). */
export function computePmtFromDiameterAndVolume(diameterMm, volumeMm3) {
  const d = parsePmtNumericValue(diameterMm)
  const v = parsePmtNumericValue(volumeMm3)
  if (d == null || d <= 0 || v == null || v <= 0) return null
  return Number(((4 * v) / (Math.PI * d * d)).toFixed(2))
}

/** d (mm) = √(4V / (π · PMT)) */
export function computeDiameterFromPmtAndVolume(pmtMm, volumeMm3) {
  const pmt = parsePmtNumericValue(pmtMm)
  const v = parsePmtNumericValue(volumeMm3)
  if (pmt == null || pmt <= 0 || v == null || v <= 0) return null
  return Number(Math.sqrt((4 * v) / (Math.PI * pmt)).toFixed(2))
}

/** V (mm³) = π d² PMT / 4 */
export function computeVolumeFromDiameterAndPmt(diameterMm, pmtMm) {
  const d = parsePmtNumericValue(diameterMm)
  const pmt = parsePmtNumericValue(pmtMm)
  if (d == null || d <= 0 || pmt == null || pmt <= 0) return null
  return Number(((Math.PI * d * d * pmt) / 4).toFixed(2))
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
