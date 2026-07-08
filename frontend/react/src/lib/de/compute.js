export function parseDeNumericValue(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function computeDeConformiteValue(moyenneVides, critereMin, critereMax) {
  const avg = parseDeNumericValue(moyenneVides)
  const min = parseDeNumericValue(critereMin)
  const max = parseDeNumericValue(critereMax)
  if (avg === null || min === null || max === null) return 'pour_info'
  return avg >= min && avg <= max ? 'conforme' : 'non_conforme'
}

export function applyDeComputedFields(row, mvreValue, changedKey = '') {
  const nextRow = { ...(row || {}) }
  const mv = parseDeNumericValue(nextRow.masse_volumique)
  const mvre = parseDeNumericValue(mvreValue)
  const compacite = parseDeNumericValue(nextRow.compacite_pct)
  const vides = parseDeNumericValue(nextRow.vides_pct)
  if (changedKey === 'compacite_pct' && compacite != null) {
    const nextVides = Number((100 - compacite).toFixed(2))
    nextRow.vides_pct = nextVides
    if (mvre != null && mvre > 0) nextRow.masse_volumique = Number(((mvre * compacite) / 100).toFixed(3))
    return nextRow
  }
  if (changedKey === 'vides_pct' && vides != null) {
    const nextCompacite = Number((100 - vides).toFixed(2))
    nextRow.compacite_pct = nextCompacite
    if (mvre != null && mvre > 0) nextRow.masse_volumique = Number(((mvre * nextCompacite) / 100).toFixed(3))
    return nextRow
  }
  if ((changedKey === 'masse_volumique' || changedKey === 'mvre') && mv != null && mvre != null && mvre > 0) {
    const computedCompacite = Number(((mv / mvre) * 100).toFixed(2))
    nextRow.compacite_pct = computedCompacite
    nextRow.vides_pct = Number((100 - computedCompacite).toFixed(2))
    return nextRow
  }
  if (changedKey === 'mvre' && mvre != null && mvre > 0) {
    if (compacite != null) {
      const nextVides = Number((100 - compacite).toFixed(2))
      nextRow.vides_pct = nextVides
      nextRow.masse_volumique = Number(((mvre * compacite) / 100).toFixed(3))
      return nextRow
    }
    if (vides != null) {
      const nextCompacite = Number((100 - vides).toFixed(2))
      nextRow.compacite_pct = nextCompacite
      nextRow.masse_volumique = Number(((mvre * nextCompacite) / 100).toFixed(3))
      return nextRow
    }
  }
  return nextRow
}

export function isDeVidesNonConforme(videsPct, critereMin, critereMax) {
  const vides = parseDeNumericValue(videsPct)
  const min = parseDeNumericValue(critereMin)
  const max = parseDeNumericValue(critereMax)
  if (vides == null || min == null || max == null) return false
  return vides < min || vides > max
}

export function formatDeResult(value, unit) {
  if (value == null || value === '') return ''
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
  }
  return `${value}${unit ? ` ${unit}` : ''}`
}
