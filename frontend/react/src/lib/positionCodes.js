const POSITION_OPTIONS = ['G', 'A', 'D']

export function normalizePositionCodes(value) {
  const list = Array.isArray(value) ? value : []
  const seen = new Set()
  const out = []
  for (const item of list) {
    const code = String(item || '').trim().toUpperCase()
    if (!POSITION_OPTIONS.includes(code) || seen.has(code)) continue
    seen.add(code)
    out.push(code)
  }
  return out
}

export function togglePositionCode(codes, code) {
  const normalized = normalizePositionCodes(codes)
  const target = String(code || '').trim().toUpperCase()
  if (!POSITION_OPTIONS.includes(target)) return normalized
  return normalized.includes(target)
    ? normalized.filter((item) => item !== target)
    : [...normalized, target]
}

export function hasPositionCode(codes, code) {
  const target = String(code || '').trim().toUpperCase()
  if (!POSITION_OPTIONS.includes(target)) return false
  return normalizePositionCodes(codes).includes(target)
}

export function positionCodesToDbFlags(codes) {
  const normalized = normalizePositionCodes(codes)
  return {
    position_g: normalized.includes('G') ? 1 : 0,
    position_a: normalized.includes('A') ? 1 : 0,
    position_d: normalized.includes('D') ? 1 : 0,
  }
}
