import { num, rnd } from '@/components/essais/essaiFormUi'

export const ES_TYPES = [
  { value: 'granulats', label: 'Granulats — NF EN 933-8 / NF P 18-622-8' },
  { value: 'sols', label: 'Sols — NF P 94-055' },
]

export const ES_ECART_MAX = 4

export function esTypeLabel(value) {
  return ES_TYPES.find((item) => item.value === value)?.label || 'Granulats — NF EN 933-8'
}

export function calcSE(h1, h2) {
  const n1 = num(h1)
  const n2 = num(h2)
  if (n1 === null || n2 === null || n1 <= 0) return null
  return rnd((n2 / n1) * 100, 0)
}

export function initEsDeterminations(res) {
  if (Array.isArray(res?.determinations) && res.determinations.length) {
    return res.determinations.map((row, index) => ({
      id: row.id ?? index + 1,
      actif: row.actif !== false,
      mh: row.mh ?? '',
      h1: row.h1 ?? '',
      h2: row.h2 ?? '',
      h2v: row.h2v ?? row.h2_vue ?? '',
    }))
  }
  return [
    { id: 1, actif: true, mh: '', h1: '', h2: '', h2v: '' },
    { id: 2, actif: true, mh: '', h1: '', h2: '', h2v: '' },
  ]
}

export function computeEsResultats({ type_materiau = 'granulats', nature_materiau = '', determinations = [] }) {
  const rows = (Array.isArray(determinations) ? determinations : []).map((row, index) => {
    const se_p = calcSE(row.h1, row.h2)
    const se_v = calcSE(row.h1, row.h2v)
    return {
      ...row,
      id: row.id ?? index + 1,
      actif: row.actif !== false,
      se_p,
      se_v,
    }
  })
  const active = rows.filter((row) => row.actif)
  const sePVals = active.map((row) => row.se_p).filter((value) => value !== null)
  const seVVals = active.map((row) => row.se_v).filter((value) => value !== null)
  const se_p = sePVals.length ? rnd(sePVals.reduce((sum, value) => sum + value, 0) / sePVals.length, 0) : null
  const se_v = seVVals.length ? rnd(seVVals.reduce((sum, value) => sum + value, 0) / seVVals.length, 0) : null
  const ecart_p = sePVals.length >= 2 ? rnd(Math.max(...sePVals) - Math.min(...sePVals), 0) : null
  const ecart_v = seVVals.length >= 2 ? rnd(Math.max(...seVVals) - Math.min(...seVVals), 0) : null
  const ecart_ok = ecart_p === null ? null : ecart_p <= ES_ECART_MAX
  return {
    type_materiau,
    nature_materiau,
    determinations: rows,
    se_p,
    se_v,
    es: se_p,
    nb_det: sePVals.length,
    ecart_p,
    ecart_v,
    ecart_ok,
  }
}

export function serializeEsResultats(payload) {
  return computeEsResultats(payload)
}

export function unwrapEsResultats(raw) {
  const res = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return {
    type_materiau: res.type_materiau || 'granulats',
    nature_materiau: res.nature_materiau || '',
    determinations: initEsDeterminations(res),
  }
}
