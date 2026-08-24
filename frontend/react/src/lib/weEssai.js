export const WE_USAGES = [
  { value: 'wn', label: 'Wn — Teneur en eau naturelle' },
  { value: 'vbs', label: "VBS — Prise d'essai au bleu (fraction < 5mm)" },
  { value: 'coupure_20', label: 'Coupure 0/20mm' },
  { value: 'coupure_5', label: 'Coupure 0/5mm' },
  { value: 'coupure_0250', label: 'MB — Fraction 0/0.250mm (pour MB 0/2)' },
  { value: 'coupure_0125', label: 'MBF — Fraction 0/0.125mm (pour MBF)' },
  { value: 'proctor', label: 'Proctor (point de compactage)' },
  { value: 'traitement', label: 'Étude traitement de sols' },
  { value: 'wl', label: 'wL — Limite de liquidité' },
  { value: 'wp', label: 'wP — Limite de plasticité' },
]

export const WE_METHODES = [
  { value: '105', label: 'Étuvage 105°C — NF P 94-050' },
  { value: '50', label: 'Étuvage 50°C (matériaux sensibles)' },
  { value: 'mw', label: 'Micro-ondes — NF P 94-049-1' },
  { value: 'pc', label: 'Plaque chauffante — NF P 94-049-2' },
]

export const WE_ECART_MAX_PERCENT = 1

export function emptyWeDetermination(index) {
  return {
    id: index,
    boite: '',
    m1: '',
    m2: '',
    m3: '',
    actif: index <= 2,
  }
}

export function weDeterminationCountForUsage(usage) {
  return (usage === 'proctor' || usage === 'traitement') ? 5 : 3
}

export function defaultWeDeterminations(usage = 'wn') {
  const count = weDeterminationCountForUsage(usage)
  const activeCount = count === 5 ? 5 : 2
  return Array.from({ length: count }, (_, index) => ({
    ...emptyWeDetermination(index + 1),
    actif: index < activeCount,
  }))
}

export function padWeDeterminations(list, usage) {
  const current = Array.isArray(list) ? list.map((row, index) => ({
    ...emptyWeDetermination(index + 1),
    ...row,
    id: index + 1,
  })) : []
  const needed = Math.max(current.length, weDeterminationCountForUsage(usage))
  while (current.length < needed) {
    current.push(emptyWeDetermination(current.length + 1))
  }
  return current
}

export function weUsageLabel(value) {
  return WE_USAGES.find((item) => item.value === value)?.label || String(value || '').trim()
}

export function weMethodeLabel(value) {
  return WE_METHODES.find((item) => item.value === value)?.label || String(value || '').trim()
}

export function unwrapWeResultats(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '{}') } catch { parsed = {} }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
  const nested = parsed.draft && typeof parsed.draft === 'object' && !Array.isArray(parsed.draft)
    ? parsed.draft
    : {}
  const determinations = Array.isArray(parsed.determinations) && parsed.determinations.length
    ? parsed.determinations
    : (Array.isArray(nested.determinations) && nested.determinations.length ? nested.determinations : defaultWeDeterminations())
  return {
    usage: parsed.usage || nested.usage || 'wn',
    methode: parsed.methode || nested.methode || '105',
    determinations,
    w_moyen: parsed.w_moyen ?? nested.w_moyen ?? null,
    nb_det: parsed.nb_det ?? nested.nb_det ?? null,
  }
}

export function serializeWeResultats(values = {}) {
  const usage = values.usage || 'wn'
  const methode = values.methode || '105'
  const determinations = Array.isArray(values.determinations) && values.determinations.length
    ? values.determinations
    : defaultWeDeterminations(usage)
  const computed = computeWeDraft({ determinations })
  return {
    usage,
    methode,
    determinations,
    w_moyen: computed.wMoyen,
    nb_det: computed.nbDet,
  }
}

export function weUsageFromResultats(raw) {
  return unwrapWeResultats(raw).usage
}

export function weWMoyenFromResultats(raw) {
  const we = unwrapWeResultats(raw)
  if (we.w_moyen != null && we.w_moyen !== '') return we.w_moyen
  return computeWeDraft(we).wMoyen
}

function toNumber(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function roundValue(value, digits = 2) {
  if (value == null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function calcWeDetermination(row) {
  const m1 = toNumber(row?.m1)
  const m2 = toNumber(row?.m2)
  const m3 = toNumber(row?.m3)
  if (m1 == null || m2 == null || m3 == null) {
    return { m_eau: null, m_sol_sec: null, w: null }
  }
  const mEau = m2 - m3
  const mSolSec = m3 - m1
  const w = mSolSec > 0 ? roundValue((mEau / mSolSec) * 100, 2) : null
  return {
    m_eau: roundValue(mEau, 2),
    m_sol_sec: roundValue(mSolSec, 2),
    w,
  }
}

export function computeWeDraft(draft) {
  const determinations = Array.isArray(draft?.determinations) ? draft.determinations : []
  const calcs = determinations.map((row) => ({
    ...row,
    ...calcWeDetermination(row),
  }))
  const valides = calcs.filter((row) => row.actif && row.w != null)
  const wMoyen = valides.length
    ? roundValue(valides.reduce((sum, row) => sum + row.w, 0) / valides.length, 2)
    : null
  const ecart = valides.length >= 2
    ? roundValue(Math.max(...valides.map((row) => row.w)) - Math.min(...valides.map((row) => row.w)), 2)
    : null
  let conforme = null
  if (ecart != null) conforme = ecart <= WE_ECART_MAX_PERCENT
  return {
    determinations: calcs,
    wMoyen,
    nbDet: valides.length,
    ecart,
    conforme,
  }
}
