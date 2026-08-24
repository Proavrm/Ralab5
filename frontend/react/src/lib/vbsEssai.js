import { num, parseRes, rnd } from '@/components/essais/essaiFormUi'
import { unwrapWeResultats, weUsageFromResultats, weWMoyenFromResultats } from '@/lib/weEssai'

export const VBS_TYPES = [
  { value: 'granulats',   label: 'VBS — Granulats (NF EN 933-9)' },
  { value: 'sols',        label: 'VBS — Sols (NF P 94-068)' },
  { value: 'mb_0_2',     label: 'MB — Granulats fraction 0/2 mm' },
  { value: 'mbf_0_0125', label: 'MBF — Granulats fraction 0/0.125 mm' },
]

export const VBS_METHODES = [
  { value: 'nf_en_933_9',     label: 'NF EN 933-9 — Granulats' },
  { value: 'nf_p_94_068',     label: 'NF P 94-068 — Sols' },
  { value: 'nf_en_933_9_mb',  label: 'NF EN 933-9 — MB agrégats 0/2' },
  { value: 'nf_en_933_9_mbf', label: 'NF EN 933-9 — MBF agrégats 0/0.125' },
]

export function initVBSDets(res) {
  if (res.determinations?.length) return res.determinations
  return [{ actif: true, numero: 1, m_echantillon: '', m_humide: '', v_bleu: '', c_bleu: '', m_seche: '' }]
}

export function pickWEForUsage(essais, currentUid, usageKey) {
  return (Array.isArray(essais) ? essais : []).find(e => {
    const code = e?.essai_code || e?.code_essai
    if (code !== 'WE') return false
    if (String(e?.uid || '') === String(currentUid || '')) return false
    return String(weUsageFromResultats(e?.resultats) || '') === usageKey
  }) || null
}

export function extractWFromWE(resultats) {
  const w = weWMoyenFromResultats(resultats)
  if (w != null && w !== '') return String(w)
  const rr = parseRes(resultats)
  const n1 = num(rr?.m1), n2 = num(rr?.m2), n3 = num(rr?.m3)
  if (n1 !== null && n2 !== null && n3 !== null && (n3-n1) > 0)
    return String(rnd((n2-n3)/(n3-n1)*100, 2))
  return null
}


export function calcDryMassFromHumidity(mHumide, humidityPercent) {
  const mh = num(mHumide), w = num(humidityPercent)
  if (mh === null || w === null) return null
  const denom = 100 + w
  if (denom <= 0) return null
  return rnd((100 * mh) / denom, 2)
}

export function calcVBS(determinations, type, humidityPercent = null, coeffCFromGR = null, useManualDryMass = false) {
  return determinations.map(det => {
    const m_echantillon = num(type === 'granulats' ? det.m_echantillon : det.m_humide)
    const v_bleu = num(det.v_bleu)
    const c_bleu = num(det.c_bleu)
    if (type === 'granulats') {
      if (m_echantillon !== null && v_bleu !== null && c_bleu !== null)
        return { ...det, vbs: rnd((v_bleu * c_bleu) / m_echantillon, 1) }
      return { ...det, vbs: null }
    }
    const m0 = useManualDryMass ? num(det.m_seche) : calcDryMassFromHumidity(det.m_humide, humidityPercent)
    const mSeche = m0 !== null && m0 >= 0 ? rnd(m0, 2) : null
    const c = num(coeffCFromGR) !== null ? num(coeffCFromGR) : (c_bleu !== null ? c_bleu : 1)
    if (m0 !== null && m0 > 0 && v_bleu !== null) {
      const vbs = rnd((v_bleu * c) / m0, 2)
      return { ...det, c_bleu: c, m_seche: mSeche, vbs, vb: vbs }
    }
    return { ...det, c_bleu: c, m_seche: mSeche, vbs: null, vb: null }
  })
}

export function calcWaterMoisture({ m1, m2, m3 }) {
  const n1 = num(m1), n2 = num(m2), n3 = num(m3)
  if (n1 === null || n2 === null || n3 === null) return { w: null, ms: null, meau: null }
  const meau = rnd(n2 - n3)
  const ms   = rnd(n3 - n1)
  const w    = ms !== null && ms > 0 ? rnd((meau / ms) * 100, 1) : null
  return {
    meau: meau !== null && meau >= 0 ? meau : null,
    ms:   ms   !== null && ms   >= 0 ? ms   : null,
    w:    w    !== null && w    >= 0 ? w    : null,
  }
}

export function pickWEForVBS(essais, currentUid, preferredUsage = 'vbs') {
  const candidates = (Array.isArray(essais) ? essais : []).filter(e => {
    const code = e?.essai_code || e?.code_essai
    return code === 'WE' && String(e?.uid || '') !== String(currentUid || '')
  })
  if (candidates.length === 0) return null
  const withPriority = candidates.map(e => {
    const rr = parseRes(e?.resultats)
    const we = unwrapWeResultats(e?.resultats)
    const usage = String(we.usage || rr?.usage || '')
    const hasDirectMasses = num(rr?.m1) !== null && num(rr?.m2) !== null && num(rr?.m3) !== null
    const hasDetMasses = Array.isArray(we.determinations)
      && we.determinations.some(d => num(d?.m1) !== null && num(d?.m2) !== null && num(d?.m3) !== null)
    return { e, rankUsage: usage === preferredUsage ? 0 : 1, rankMasses: (hasDirectMasses || hasDetMasses) ? 0 : 1 }
  }).sort((a, b) => (a.rankUsage - b.rankUsage) || (a.rankMasses - b.rankMasses))
  return withPriority[0]?.e || null
}

export function extractWEMasses(resultats) {
  const rr = parseRes(resultats)
  if (num(rr?.m1) !== null && num(rr?.m2) !== null && num(rr?.m3) !== null)
    return { m1: String(rr.m1), m2: String(rr.m2), m3: String(rr.m3) }
  const we = unwrapWeResultats(resultats)
  const d = Array.isArray(we.determinations)
    ? we.determinations.find(x => num(x?.m1) !== null && num(x?.m2) !== null && num(x?.m3) !== null)
    : null
  if (!d) return null
  return { m1: String(d.m1), m2: String(d.m2), m3: String(d.m3) }
}

export function pickGRForVBS(essais, currentUid) {
  return (Array.isArray(essais) ? essais : []).find(e => {
    const code = e?.essai_code || e?.code_essai
    return code === 'GR' && String(e?.uid || '') !== String(currentUid || '')
  }) || null
}

export { extractCoeffCFromGR } from '@/lib/grEssai'

// ── MB / MBF — Valeur au bleu pour granulats (NF EN 933-9) ──────────────────
// MB  = (V1 × 10) / Ms   fraction 0/2mm     — g/kg — arrondi 0.1
// MBF = (V1 × 10) / Ms   fraction 0/0.125mm — g/kg — arrondi 0.1
// Correction kaolinite optionnelle: MB = ((V1 − V') × 10) / Ms
// Humidité: même protocole que VBS — M1 récipient, M2 +humide, M3 +sec
// NE PAS utiliser le coefficient C sol ici
export function calcMBResult({ m1, m2, m3, ms_manual, use_manual_ms, v1, v_prime, use_kaolinite }) {
  const v  = num(v1)
  const vp = use_kaolinite ? (num(v_prime) || 0) : 0

  let ms = null
  let w = null
  let meau = null

  if (use_manual_ms) {
    const manualMs = num(ms_manual)
    ms = manualMs !== null && manualMs >= 0 ? rnd(manualMs, 2) : null
  } else {
    const n1 = num(m1), n2 = num(m2), n3 = num(m3)
    if (n1 !== null && n2 !== null && n3 !== null) {
      meau = rnd(n2 - n3, 2)
      ms = rnd(n3 - n1, 2)
      w = ms > 0 ? rnd(meau / ms * 100, 2) : null
    }
  }

  if (v === null || ms === null || ms <= 0) return { ms, w, meau, result: null }
  return { ms, w, meau, result: rnd(((v - vp) * 10) / ms, 1) }
}
