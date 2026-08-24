import { num, rnd } from '@/components/essais/essaiFormUi'

export function unwrapPhResultats(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '{}') } catch { parsed = {} }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
  return {
    methode: String(parsed.methode || '').trim(),
    norme: String(parsed.norme || '').trim(),
    ph_eau: parsed.ph_eau ?? '',
    ph_kcl: parsed.ph_kcl ?? '',
    temperature_c: parsed.temperature_c ?? '',
    ratio_sol_eau: parsed.ratio_sol_eau ?? '',
    observations: String(parsed.observations || '').trim(),
  }
}

export function computePhResultats(values = {}) {
  const base = unwrapPhResultats(values)
  const phEau = num(base.ph_eau)
  const phKcl = num(base.ph_kcl)
  return {
    ...base,
    ph_eau_num: phEau == null ? null : rnd(phEau, 2),
    ph_kcl_num: phKcl == null ? null : rnd(phKcl, 2),
    resultat: phEau == null ? null : rnd(phEau, 2),
  }
}

export function serializePhResultats(values = {}) {
  return computePhResultats(values)
}
