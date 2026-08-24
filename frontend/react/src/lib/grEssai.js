import { num, rnd } from '@/components/essais/essaiFormUi'

export const GR_MODELES = {
  'Sols GTR':  [0.08, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 31.5, 40, 50, 63, 80, 100, 150],
  'Granulats': [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 5, 6.3, 8, 10, 12.5, 14, 16, 20, 25, 31.5, 40, 50, 63, 80, 100, 150],
  'Enrobés':   [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 6.3, 8, 10, 12.5, 14, 16, 20],
  'Béton':     [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 5, 6.3, 8, 10, 12.5, 16, 20, 25, 31.5],
  'LA / MDE':  [4, 6.3, 8, 10, 11.2, 12.5, 14, 16],
}

export const ALL_TAMIS = [...new Set([
  0.063, 0.08, 0.1, 0.125, 0.16, 0.2, 0.25, 0.315, 0.4, 0.5, 0.63, 0.8,
  1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 11.2, 12.5, 14, 16, 20,
  25, 31.5, 40, 50, 63, 80, 100, 125, 150, 200,
])].sort((a, b) => a - b)

export function initGRTamis(res) {
  if (Array.isArray(res.tamis) && res.tamis.length) return res.tamis
  return GR_MODELES['Sols GTR'].map(d => ({ d, r: '' }))
}

export function buildSegmentTamis(modele, minD = null, maxD = null, fallbackEnd = 0.08) {
  const base = Array.isArray(GR_MODELES[modele]) ? GR_MODELES[modele] : GR_MODELES['Sols GTR']
  const vals = base.filter(d => {
    if (minD !== null && d < minD) return false
    if (maxD !== null && d > maxD) return false
    return true
  })
  const withBounds = [...vals]
  if (maxD !== null && !withBounds.includes(maxD)) withBounds.push(maxD)
  if (minD !== null && !withBounds.includes(minD)) withBounds.push(minD)
  if (minD === null && !withBounds.includes(fallbackEnd)) withBounds.push(fallbackEnd)
  return [...new Set(withBounds)].sort((a, b) => a - b).map(d => ({ d, r: '' }))
}

export function initGRCutoffState(res, modele) {
  const d1 = num(res.d1) ?? 20
  const hasD2 = !!res.has_d2
  const d2 = num(res.d2) ?? 5
  return {
    d1,
    has_d2: hasD2,
    d2,
    coarse: Array.isArray(res.coarse_tamis) && res.coarse_tamis.length
      ? res.coarse_tamis
      : buildSegmentTamis(modele, d1, null),
    frac1: {
      m1: res.frac1?.m1 ?? '',
      m2: res.frac1?.m2 ?? '',
      m3: res.frac1?.m3 ?? '',
      mh: res.frac1?.mh ?? '',
      tamis: Array.isArray(res.frac1?.tamis) && res.frac1.tamis.length
        ? res.frac1.tamis
        : buildSegmentTamis(modele, hasD2 ? d2 : 0.08, d1),
    },
    frac2: {
      m1: res.frac2?.m1 ?? '',
      m2: res.frac2?.m2 ?? '',
      m3: res.frac2?.m3 ?? '',
      mh: res.frac2?.mh ?? '',
      tamis: Array.isArray(res.frac2?.tamis) && res.frac2.tamis.length
        ? res.frac2.tamis
        : buildSegmentTamis(modele, 0.08, d2),
    },
  }
}

export function calcWaterInputs(m1, m2, m3, mh) {
  const n1 = num(m1)
  const n2 = num(m2)
  const n3 = num(m3)
  const mhNum = num(mh)
  const m_eau = n1 !== null && n2 !== null && n3 !== null ? rnd(n2 - n3, 2) : null
  const m_sol_sec = n1 !== null && n3 !== null ? rnd(n3 - n1, 2) : null
  const w = m_sol_sec !== null && m_sol_sec > 0 ? rnd((m_eau / m_sol_sec) * 100, 2) : null
  const ms = w !== null && mhNum !== null ? rnd(mhNum / (1 + w / 100), 2) : null
  return { m_eau, m_sol_sec, w, ms, mh: mhNum }
}

export function calcGR(tamis, ms) {
  if (!ms || ms <= 0) return (Array.isArray(tamis) ? tamis : []).map(t => ({ ...t, rc_g: null, rc_pct: null, passant: null }))
  let rc = 0
  return [...(Array.isArray(tamis) ? tamis : [])]
    .sort((a, b) => b.d - a.d)
    .map(t => {
      const rp = parseFloat(t.r) || 0
      rc += rp
      const rc_pct = rnd((rc / ms) * 100, 2)
      return { ...t, rc_g: rnd(rc, 2), rc_pct, passant: rnd(Math.max(0, 100 - rc_pct), 2) }
    })
    .sort((a, b) => a.d - b.d)
}

export function interpolateDp(calcs, p) {
  const pts = (Array.isArray(calcs) ? calcs : []).filter(t => t.passant !== null).sort((a, b) => a.d - b.d)
  if (pts.length < 2) return null
  for (let i = 0; i < pts.length - 1; i++) {
    const lo = pts[i]
    const hi = pts[i + 1]
    if (lo.passant <= p && hi.passant >= p) {
      if (hi.passant === lo.passant) return lo.d
      const t = (p - lo.passant) / (hi.passant - lo.passant)
      return rnd(Math.pow(10, Math.log10(lo.d) + t * (Math.log10(hi.d) - Math.log10(lo.d))), 3)
    }
  }
  return null
}

export function calcCuCc(calcs) {
  const d10 = interpolateDp(calcs, 10)
  const d30 = interpolateDp(calcs, 30)
  const d60 = interpolateDp(calcs, 60)
  const cu = d10 && d60 ? rnd(d60 / d10, 2) : null
  const cc = d10 && d30 && d60 ? rnd((d30 * d30) / (d10 * d60), 2) : null
  return { d10, d30, d60, cu, cc }
}

export function calcCoeffVBSFromCalcs(calcs) {
  const p5 = num((Array.isArray(calcs) ? calcs : []).find(t => Number(t.d) === 5)?.passant)
  const p50 = num((Array.isArray(calcs) ? calcs : []).find(t => Number(t.d) === 50)?.passant)
  if (p5 === null || p50 === null || p50 <= 0) return null
  return rnd(p5 / p50, 3)
}

export function computePassantAtD(calcs, d) {
  return (Array.isArray(calcs) ? calcs : []).find(t => Number(t.d) === Number(d))?.passant ?? null
}

export function reconstructGlobalGR({ d1, d2, hasD2, coarseTamis, frac1Calcs, frac2Calcs, ms1, ms2 }) {
  const coarseSorted = [...(Array.isArray(coarseTamis) ? coarseTamis : [])].sort((a, b) => b.d - a.d)
  const massGtD1 = rnd(coarseSorted.reduce((sum, row) => sum + (num(row.r) || 0), 0), 2)
  const massLtD1 = ms1 !== null ? ms1 : null
  const msTotal = massLtD1 !== null ? rnd(massGtD1 + massLtD1, 2) : null
  const passingD1 = msTotal && msTotal > 0 ? rnd((massLtD1 / msTotal) * 100, 2) : null

  const passingD2Local = hasD2 ? computePassantAtD(frac1Calcs, d2) : null
  const passingD2 = hasD2 && passingD1 !== null && passingD2Local !== null
    ? rnd((passingD1 * passingD2Local) / 100, 2)
    : null

  const union = new Set()
  coarseSorted.forEach(t => union.add(Number(t.d)))
  ;(Array.isArray(frac1Calcs) ? frac1Calcs : []).forEach(t => union.add(Number(t.d)))
  if (hasD2) (Array.isArray(frac2Calcs) ? frac2Calcs : []).forEach(t => union.add(Number(t.d)))
  if (d1 !== null) union.add(Number(d1))
  if (hasD2 && d2 !== null) union.add(Number(d2))

  const sizes = [...union].filter(v => Number.isFinite(v)).sort((a, b) => b - a)

  const rawRows = sizes.map(d => {
    let pass = null
    if (d >= d1) {
      if (msTotal !== null && msTotal > 0) {
        const retained = coarseSorted.filter(t => Number(t.d) >= d).reduce((sum, row) => sum + (num(row.r) || 0), 0)
        pass = rnd(Math.max(0, 100 - (retained / msTotal) * 100), 2)
      }
    } else if (hasD2 && d < d2) {
      const local = computePassantAtD(frac2Calcs, d)
      if (passingD2 !== null && local !== null) pass = rnd((passingD2 * local) / 100, 2)
    } else {
      const local = computePassantAtD(frac1Calcs, d)
      if (passingD1 !== null && local !== null) pass = rnd((passingD1 * local) / 100, 2)
    }
    return { d, passant: pass }
  })

  const rows = rawRows.map((row, idx) => {
    if (msTotal === null || row.passant === null) return { ...row, rc_g: null, rc_pct: null, retained_g: null }
    const rc_pct = rnd(Math.max(0, 100 - row.passant), 2)
    const rc_g = rnd((rc_pct / 100) * msTotal, 2)
    const nextRc = idx === 0 ? 0 : (rawRows[idx - 1].passant !== null ? rnd((Math.max(0, 100 - rawRows[idx - 1].passant) / 100) * msTotal, 2) : 0)
    return { ...row, rc_pct, rc_g, retained_g: rnd(rc_g - nextRc, 2) }
  }).sort((a, b) => a.d - b.d)

  const p80 = rows.find(t => Number(t.d) === 0.08 || Number(t.d) === 0.063)?.passant ?? null
  const dmax = [...rows].sort((a, b) => b.d - a.d).find(t => t.passant !== null && t.passant < 100)?.d ?? null
  const coeffVBS = calcCoeffVBSFromCalcs(rows)

  return {
    rows,
    msTotal,
    massGtD1,
    massLtD1,
    passingD1,
    passingD2,
    p80,
    dmax,
    coeffVBS,
  }
}

export function unwrapGrResultats(raw) {
  const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw || '{}') } catch { return {} } })() : (raw || {})
  return parsed && typeof parsed === 'object' ? parsed : {}
}

export function extractCoeffCFromGR(resultats) {
  const rr = unwrapGrResultats(resultats)
  const stored = num(rr?.coeff_vbs)
  if (stored !== null && stored > 0) return rnd(stored, 3)
  const ms = num(rr?.ms ?? rr?.ms_total)
  const tamis = Array.isArray(rr?.tamis) ? rr.tamis : []
  if (ms === null || ms <= 0 || tamis.length === 0) return null
  const calcs = calcGR(tamis, ms)
  const p5  = calcs.find(t => Number(t.d) === 5)?.passant
  const p50 = calcs.find(t => Number(t.d) === 50)?.passant
  const n5 = num(p5), n50 = num(p50)
  if (n5 === null || n50 === null || n50 <= 0) return null
  const cc = n5 / n50
  return cc > 0 ? rnd(cc, 3) : null
}

export function extractPassant20FromGR(grResultats) {
  return extractPassantAt(grResultats, 20)
}

export function extractPassantAt(grResultats, diameterMm) {
  const r = unwrapGrResultats(grResultats)
  const d = Number(diameterMm)
  if (!Number.isFinite(d)) return null
  const key = `passant_${String(d).replace('.', '_')}`
  const stored = num(r?.[key])
  if (stored != null) return stored
  if (d === 0.08 || d === 0.080) {
    const p80 = num(r?.passant_80 ?? r?.p80)
    if (p80 != null) return p80
  }
  const fromRows = passantFromRows(r?.rows, d)
  if (fromRows != null) return fromRows
  if (Array.isArray(r?.tamis) && r.tamis.length && num(r.ms) != null) {
    const calcs = calcGR(r.tamis, num(r.ms))
    const fromCalcs = passantFromRows(calcs, d)
    if (fromCalcs != null) return fromCalcs
  }
  return null
}

function passantFromRows(rows, diameterMm) {
  const pts = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ d: Number(row?.d), passant: num(row?.passant) }))
    .filter((row) => Number.isFinite(row.d) && row.passant != null)
    .sort((a, b) => a.d - b.d)
  if (!pts.length) return null
  const exact = pts.find((row) => row.d === Number(diameterMm))
  if (exact) return exact.passant
  for (let i = 0; i < pts.length - 1; i += 1) {
    const lo = pts[i]
    const hi = pts[i + 1]
    if (lo.d <= diameterMm && diameterMm <= hi.d) {
      if (hi.d === lo.d) return lo.passant
      const t = (Math.log10(diameterMm) - Math.log10(lo.d)) / (Math.log10(hi.d) - Math.log10(lo.d))
      return rnd(lo.passant + t * (hi.passant - lo.passant), 2)
    }
  }
  return null
}

export function extractGrCurve(grResultats) {
  const r = unwrapGrResultats(grResultats)
  const global = Array.isArray(r?.tamis_global) && r.tamis_global.length ? r.tamis_global : null
  const tamis = Array.isArray(r?.tamis) ? r.tamis : []
  const ms = num(r?.ms ?? r?.ms_total)
  let rows = global
  if (!rows && tamis.length && ms != null && ms > 0) rows = calcGR(tamis, ms)
  if (!rows) rows = Array.isArray(r?.rows) && r.rows.length ? r.rows : tamis
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ d: num(row?.d), passant: num(row?.passant) }))
    .filter((row) => row.d != null && row.passant != null)
    .sort((a, b) => a.d - b.d)
}
