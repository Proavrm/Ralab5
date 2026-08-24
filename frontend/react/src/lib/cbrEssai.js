import { num, rnd } from '@/components/essais/essaiFormUi'

// ═══════════════════════════════════════════════════════════════════════════════
// IPI / CBRi / CBR — Portance des sols compactés
// IPI:  NF P 94-078 — Indice Portant Immédiat (1 moule, sans immersion)
// CBRi: NF P 94-090-1 — CBR immédiat (3 moules, sans immersion)
// CBR:  NF P 94-090-1 — CBR après immersion (3 moules, 4 jours)
//
// Protocole commun:
//   Grand moule CBR — Ø152.4mm, V≈2131 cm³, H=127mm
//   Piston Ø50mm (surface 19.635 cm²), vitesse 1.27 mm/min
//   Lectures de force à 2.5mm et 5.0mm
//
// Calcul CBR:
//   CBR_2.5 = (F_2.5 [kN] / 13.24) × 100
//   CBR_5.0 = (F_5.0 [kN] / 19.96) × 100
//   CBR = max(CBR_2.5, CBR_5.0)
//   Si CBR_5 > CBR_2.5 : vérifier l'essai (piston incliné ?)
//
// CBR avec immersion (NF P 94-090-1):
//   Gonflement (%) = (δ_fin − δ_ini) / H_moule × 100
//   H_moule standard = 127mm
//
// Liaison Proctor:
//   ρd_95 = 0.95 × ρdOPN (valeur corrigée en priorité)
//   CBR à 95% OPN = interpolation linéaire sur courbe CBR vs ρd
// ═══════════════════════════════════════════════════════════════════════════════

export const F_REF_2_5 = 13.24   // kN — force étalon à 2.5mm (NF P 94-090-1)
export const F_REF_5_0 = 19.96   // kN — force étalon à 5.0mm
export const H_MOULE_CBR = 127   // mm — hauteur standard grand moule CBR

export function calcCBRPoint(f25, f50) {
  const n25 = num(f25), n50 = num(f50)
  const cbr25 = n25 !== null ? rnd(n25 / F_REF_2_5 * 100, 1) : null
  const cbr50 = n50 !== null ? rnd(n50 / F_REF_5_0 * 100, 1) : null
  if (cbr25 === null && cbr50 === null) return { cbr25, cbr50, cbr: null, controlling: null, suspect: false }
  const cbr = Math.max(cbr25 ?? -Infinity, cbr50 ?? -Infinity)
  const suspect = cbr25 !== null && cbr50 !== null && cbr50 > cbr25 * 1.1
  const controlling = (cbr50 !== null && cbr25 !== null && cbr50 >= cbr25) ? '5.0mm' : '2.5mm'
  return { cbr25, cbr50, cbr: rnd(cbr, 1), controlling, suspect }
}

export function calcRhoFromMoule(m_tot, m_moule, v_moule, w) {
  const mt = num(m_tot), mm = num(m_moule), vv = num(v_moule), ww = num(w)
  if (mt === null || mm === null || vv === null || vv <= 0) return { rho_h: null, rho_d: null }
  const rho_h = rnd((mt - mm) / vv, 3)
  if (ww === null || (100 + ww) <= 0) return { rho_h, rho_d: null }
  return { rho_h, rho_d: rnd(rho_h / (1 + ww / 100), 3) }
}

export function interpCBRAt95(pts, rho95) {
  // pts: [{rho_d, cbr}] — interpolation linéaire
  const valid = pts.filter(p => p.rho_d !== null && p.cbr !== null)
    .sort((a, b) => a.rho_d - b.rho_d)
  if (valid.length < 2) return null
  // extrapolation incluse (au-delà des bornes)
  for (let i = 0; i < valid.length - 1; i++) {
    const lo = valid[i], hi = valid[i + 1]
    if (lo.rho_d <= rho95 + 0.001 && hi.rho_d >= rho95 - 0.001) {
      if (hi.rho_d === lo.rho_d) return rnd(lo.cbr, 1)
      const t = (rho95 - lo.rho_d) / (hi.rho_d - lo.rho_d)
      return rnd(lo.cbr + t * (hi.cbr - lo.cbr), 1)
    }
  }
  // extrapolation hors bornes
  if (rho95 < valid[0].rho_d) {
    const lo = valid[0], hi = valid[1]
    const t = (rho95 - lo.rho_d) / (hi.rho_d - lo.rho_d)
    return rnd(lo.cbr + t * (hi.cbr - lo.cbr), 1)
  }
  const lo = valid.at(-2), hi = valid.at(-1)
  const t = (rho95 - lo.rho_d) / (hi.rho_d - lo.rho_d)
  return rnd(lo.cbr + t * (hi.cbr - lo.cbr), 1)
}

export const CBR_DEPTHS = [1.25, 2.0, 2.5, 3.0, 5.0, 7.5, 10.0, 12.0]

export function initCBRLectures(saved, f_2_5_legacy, f_5_0_legacy) {
  if (saved?.length) {
    const byDepth = Object.fromEntries(saved.map(l => [l.depth, l.force]))
    return CBR_DEPTHS.map(d => ({
      depth: d,
      force: byDepth[d] ?? (d === 2.5 ? (f_2_5_legacy ?? '') : d === 5.0 ? (f_5_0_legacy ?? '') : '')
    }))
  }
  return CBR_DEPTHS.map(d => ({
    depth: d,
    force: d === 2.5 ? (f_2_5_legacy ?? '') : d === 5.0 ? (f_5_0_legacy ?? '') : ''
  }))
}


export function initIPIMoules(res, mode) {
  if (res.moules?.length) return res.moules.map((m, idx) => ({
    id: m.id ?? idx + 1,
    actif: m.actif !== false,
    nb_coups: m.nb_coups ?? 25,
    moule_ref: m.moule_ref ?? '',
    m_moule: m.m_moule ?? '',
    v_moule: m.v_moule ?? '2131',
    m_tot: m.m_tot ?? '',
    w: m.w ?? '',
    m1: m.m1 ?? '',
    m2: m.m2 ?? '',
    m3: m.m3 ?? '',
    lectures: initCBRLectures(m.lectures, m.f_2_5, m.f_5_0),
    delta0: m.delta0 ?? 0,
    correction_mode: m.correction_mode ?? (num(m.delta0) > 0 ? 'delta0' : 'auto'),
    delta0_manual: m.delta0_manual ?? m.delta0 ?? '',
    correction_low: m.correction_low ?? 1.0,
    correction_high: m.correction_high ?? 3.0,
    gonf_ini: m.gonf_ini ?? '',
    gonf_fin: m.gonf_fin ?? '',
    h_moule: m.h_moule ?? String(H_MOULE_CBR),
    surcharge_kg: m.surcharge_kg ?? '',
    pn_point_id: m.pn_point_id ?? '',
    pn_point_w: m.pn_point_w ?? null,
    pn_point_rho_d: m.pn_point_rho_d ?? null,
  }))
  return [{
    id: 1,
    actif: true,
    nb_coups: 25,
    moule_ref: '',
    m_moule: '',
    v_moule: '2131',
    m_tot: '',
    w: '',
    m1: '',
    m2: '',
    m3: '',
    lectures: initCBRLectures(null, '', ''),
    delta0: 0,
    correction_mode: 'auto',
    delta0_manual: '',
    correction_low: 1.0,
    correction_high: 3.0,
    gonf_ini: '',
    gonf_fin: '',
    h_moule: String(H_MOULE_CBR),
    surcharge_kg: '',
    pn_point_id: '',
    pn_point_w: null,
    pn_point_rho_d: null,
  }]
}

export function getPenetrationForcePoints(lectures) {
  return (Array.isArray(lectures) ? lectures : [])
    .map(l => ({ d: num(l?.depth), f: num(l?.force) }))
    .filter(p => p.d !== null && p.f !== null)
    .sort((a, b) => a.d - b.d)
}

export function interpolatePenetrationForce(pts, depth) {
  if (!pts.length) return null
  if (depth <= pts[0].d) return pts[0].f
  if (depth >= pts.at(-1).d) return pts.at(-1).f
  for (let i = 0; i < pts.length - 1; i += 1) {
    const lo = pts[i]
    const hi = pts[i + 1]
    if (lo.d <= depth && hi.d >= depth) {
      const span = hi.d - lo.d
      if (span <= 0) return lo.f
      const t = (depth - lo.d) / span
      return lo.f + t * (hi.f - lo.f)
    }
  }
  return null
}

export function detectAutoCorrectionLine(lectures) {
  const pts = getPenetrationForcePoints(lectures)
  if (pts.length < 3) return { mode: 'none', delta0: 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }

  let best = null
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1]
    const m = pts[i]
    const b = pts[i + 1]
    const span = b.d - a.d
    if (span < 0.8 || span > 3.2) continue
    if (m.d < 0.75 || m.d > 4.0) continue
    if (b.d > 5.5) continue

    const s1 = (m.f - a.f) / Math.max(m.d - a.d, 1e-9)
    const s2 = (b.f - m.f) / Math.max(b.d - m.d, 1e-9)
    const slope = (b.f - a.f) / span
    if (!Number.isFinite(slope) || slope <= 0) continue
    if (s1 < -0.05 || s2 < -0.05) continue

    const raw = m.d - (m.f / slope)
    if (!Number.isFinite(raw) || raw <= 0 || raw > 3.0) continue

    const curvaturePenalty = Math.abs(s2 - s1)
    const centerBonus = m.d >= 1.0 && m.d <= 3.0 ? 1.0 : 0.85
    const spanBonus = 0.8 + Math.min(span, 2.4) / 3.0
    const score = (slope * centerBonus * spanBonus) - (curvaturePenalty * 0.35)

    if (!best || score > best.score) {
      best = { a, b, m, slope, score, raw }
    }
  }

  if (!best) return { mode: 'none', delta0: 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }
  const delta0 = rnd(best.raw, 2)
  return {
    mode: delta0 > 0 ? 'auto' : 'none',
    delta0,
    x1: best.a.d,
    y1: best.a.f,
    x2: best.b.d,
    y2: best.b.f,
    slope: rnd(best.slope, 4),
    low: rnd(best.a.d, 2),
    high: rnd(best.b.d, 2),
  }
}

export function resolveCorrectionInfo(lectures, raw) {
  const pts = getPenetrationForcePoints(lectures)
  const legacyDelta = num(raw?.delta0)
  const mode = String(raw?.correction_mode || (num(raw?.delta0_manual) > 0 || legacyDelta > 0 ? 'delta0' : 'auto'))
  if (!pts.length) {
    return { mode: 'none', source: 'none', delta0: 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }
  }
  if (mode === 'delta0') {
    const delta0 = num(raw?.delta0_manual) ?? legacyDelta ?? 0
    return { mode, source: delta0 > 0 ? 'manual_delta0' : 'none', delta0: delta0 > 0 ? rnd(delta0, 2) : 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }
  }
  if (mode === 'line') {
    const low = num(raw?.correction_low)
    const high = num(raw?.correction_high)
    if (low !== null && high !== null && high > low) {
      const y1 = interpolatePenetrationForce(pts, low)
      const y2 = interpolatePenetrationForce(pts, high)
      if (y1 !== null && y2 !== null && y2 > y1) {
        const slope = (y2 - y1) / (high - low)
        const rawDelta = low - (y1 / slope)
        const delta0 = rawDelta > 0 ? rnd(Math.min(rawDelta, 3), 2) : 0
        return { mode, source: delta0 > 0 ? 'manual_line' : 'none', delta0, x1: low, y1: y1, x2: high, y2: y2, slope: rnd(slope, 4), low, high }
      }
    }
    return { mode, source: 'none', delta0: 0, x1: low, y1: null, x2: high, y2: null, slope: null, low, high }
  }
  const auto = detectAutoCorrectionLine(lectures)
  return { ...auto, source: auto.mode === 'auto' ? 'auto' : 'none', low: null, high: null }
}

export function calcCBRFromLectures(lectures, correction = 0) {
  const pts = getPenetrationForcePoints(lectures)
  const corr = typeof correction === 'object' && correction !== null ? resolveCorrectionInfo(lectures, correction) : resolveCorrectionInfo(lectures, { delta0: correction })
  const d0 = corr.delta0 || 0
  const f25r = interpolatePenetrationForce(pts, 2.5)
  const f50r = interpolatePenetrationForce(pts, 5.0)
  const f25c = d0 > 0 ? interpolatePenetrationForce(pts, 2.5 + d0) : f25r
  const f50c = d0 > 0 ? interpolatePenetrationForce(pts, 5.0 + d0) : f50r
  const cbr25  = f25r !== null ? rnd(f25r / F_REF_2_5 * 100, 1) : null
  const cbr50  = f50r !== null ? rnd(f50r / F_REF_5_0 * 100, 1) : null
  const cbr25c = f25c !== null ? rnd(f25c / F_REF_2_5 * 100, 1) : null
  const cbr50c = f50c !== null ? rnd(f50c / F_REF_5_0 * 100, 1) : null
  const cbrRaw  = (cbr25 !== null || cbr50 !== null) ? rnd(Math.max(cbr25 ?? -Infinity, cbr50 ?? -Infinity), 1) : null
  const cbrCorr = (cbr25c !== null || cbr50c !== null) ? rnd(Math.max(cbr25c ?? -Infinity, cbr50c ?? -Infinity), 1) : null
  const cbr = d0 > 0 ? cbrCorr : cbrRaw
  const ctrlRaw = cbr25 !== null && cbr50 !== null ? (cbr50 >= cbr25 ? '5.0mm' : '2.5mm') : (cbr25 !== null ? '2.5mm' : cbr50 !== null ? '5.0mm' : null)
  const ctrlCorr = cbr25c !== null && cbr50c !== null ? (cbr50c >= cbr25c ? '5.0mm' : '2.5mm') : ctrlRaw
  const controlling = d0 > 0 ? ctrlCorr : ctrlRaw
  const f_kn = controlling === '2.5mm' ? (d0 > 0 ? f25c : f25r) : controlling === '5.0mm' ? (d0 > 0 ? f50c : f50r) : null
  return {
    cbr25, cbr50, cbr25c, cbr50c, cbrRaw, cbrCorr, cbr,
    controlling,
    f_kn: f_kn !== null ? rnd(f_kn, 3) : null,
    delta0_auto: corr.source === 'auto' ? corr.delta0 : null,
    delta0_used: corr.delta0 || 0,
    delta0_source: corr.source,
    correction_line: corr,
  }
}

export function calcIPIFromLectures(lectures, correction = 0) {
  const c = calcCBRFromLectures(lectures, correction)
  return {
    cbr25: c.cbr25,
    cbr50: c.cbr50,
    cbr25c: c.cbr25c,
    cbr50c: c.cbr50c,
    ipiRaw: c.cbrRaw,
    ipiCorr: c.cbrCorr,
    ipi: c.cbr,
    controlling: c.controlling,
    f_kn: c.f_kn,
    delta0_auto: c.delta0_auto,
    delta0_used: c.delta0_used,
    delta0_source: c.delta0_source,
    correction_line: c.correction_line,
  }
}

export const IPI_DEPTHS = [1.25, 2.0, 2.5, 3.0, 5.0, 7.5, 10.0, 12.0]
export const IPI_COLORS = ['#3b82f6','#ea580c','#16a34a','#7c3aed','#dc2626','#0891b2']

export function calcStoredIPIResult(test) {
  const c = calcIPIFromLectures(test.lectures || [], test)
  return c
}

export function calcIPITestResult(test) {
  const fk = num(test.facteur_k)
  const lectures = test.mode_saisie === 'mm' && fk !== null
    ? (Array.isArray(test.lectures)
        ? test.lectures.map(l => ({ ...l, force: num(l.force) !== null ? String(rnd(num(l.force) * fk, 4)) : l.force }))
        : [])
    : (Array.isArray(test.lectures) ? test.lectures : [])
  if (getPenetrationForcePoints(lectures).length) return { lectures, ...calcIPIFromLectures(lectures, test) }
  return { lectures, ...calcStoredIPIResult({ ...test, lectures }) }
}

export function calcCBRTestResult(test, defaults = {}) {
  const fk = num(test.facteur_k ?? defaults.facteur_k)
  const modeSaisie = test.mode_saisie ?? defaults.mode_saisie ?? 'kn'
  const lectures = modeSaisie === 'mm' && fk !== null
    ? (Array.isArray(test.lectures)
        ? test.lectures.map(l => ({ ...l, force: num(l.force) !== null ? String(rnd(num(l.force) * fk, 4)) : l.force }))
        : [])
    : (Array.isArray(test.lectures) ? test.lectures : [])
  const calc = calcCBRFromLectures(lectures, test)
  const n1 = num(test.m1), n2 = num(test.m2), n3 = num(test.m3)
  let w = null
  if (n1 !== null && n2 !== null && n3 !== null && (n3 - n1) > 0) w = rnd((n2 - n3) / (n3 - n1) * 100, 2)
  else if (test.w !== '') w = num(test.w)
  const { rho_h, rho_d } = calcRhoFromMoule(test.m_tot, num(test.m_moule), num(test.v_moule), w)
  const gi = num(test.gonf_ini), gf = num(test.gonf_fin), hm = num(test.h_moule) ?? H_MOULE_CBR
  const gonf = gi !== null && gf !== null && hm > 0 ? rnd((gf - gi) / hm * 100, 2) : null
  return {
    lectures,
    ...calc,
    w_calc: w,
    rho_h,
    rho_d,
    gonf,
    surcharge_kg: num(test.surcharge_kg ?? defaults.surcharge_kg),
    soak_days: num(test.soak_days ?? defaults.soak_days),
    delta0: calc.delta0_used,
  }
}

export function initIPILectures(saved) {
  if (Array.isArray(saved) && saved.length) {
    const byDepth = Object.fromEntries(saved.map(l => [l.depth, l.force]))
    return IPI_DEPTHS.map(d => ({ depth: d, force: byDepth[d] ?? '' }))
  }
  return IPI_DEPTHS.map(d => ({ depth: d, force: '' }))
}

export function initIPITests(res) {
  if (Array.isArray(res?.tests) && res.tests.length) {
    return res.tests.map((t, idx) => ({
      id: t.id ?? idx + 1,
      actif: t.actif !== false,
      pn_point_id: t.pn_point_id ?? '',
      pn_point_w: t.pn_point_w ?? null,
      pn_point_rho_d: t.pn_point_rho_d ?? null,
      moule_ref: t.moule_ref ?? '',
      anneau_ref: t.anneau_ref ?? '',
      facteur_k: t.facteur_k ?? null,
      mode_saisie: t.mode_saisie ?? 'kn',
      delta0: t.delta0 ?? 0,
      correction_mode: t.correction_mode ?? (num(t.delta0) > 0 ? 'delta0' : 'auto'),
      delta0_manual: t.delta0_manual ?? t.delta0 ?? '',
      correction_low: t.correction_low ?? 1.0,
      correction_high: t.correction_high ?? 3.0,
      lectures: initIPILectures(t.lectures),
    }))
  }
  return [{ id: 1, actif: true, pn_point_id: '', pn_point_w: null, pn_point_rho_d: null, moule_ref: '', anneau_ref: '', facteur_k: null, mode_saisie: 'kn', delta0: 0, correction_mode: 'auto', delta0_manual: '', correction_low: 1.0, correction_high: 3.0, lectures: initIPILectures(null) }]
}
