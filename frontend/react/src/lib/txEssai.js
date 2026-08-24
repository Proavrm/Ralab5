import { num, rnd } from '@/components/essais/essaiFormUi'

export const TX_FRACTIONS = [
  { key: 'argiles', label: 'Argiles < 2 µm', unit: '%' },
  { key: 'limons_fins', label: 'Limons fins 2 à 20 µm', unit: '%' },
  { key: 'limons_grossiers', label: 'Limons grossiers 20 à 50 µm', unit: '%' },
  { key: 'sables_fins', label: 'Sables fins 50 à 200 µm', unit: '%' },
  { key: 'sables_grossiers', label: 'Sables grossiers 200 à 2000 µm', unit: '%' },
  { key: 'fraction_inf_2mm', label: 'Fraction < 2 mm', unit: '%' },
  { key: 'fraction_sup_2mm', label: 'Fraction > 2 mm', unit: '%' },
]

export function unwrapTxResultats(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '{}') } catch { parsed = {} }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
  return {
    methode: String(parsed.methode || '').trim(),
    norme: String(parsed.norme || '').trim(),
    argiles: parsed.argiles ?? '',
    limons_fins: parsed.limons_fins ?? '',
    limons_grossiers: parsed.limons_grossiers ?? '',
    sables_fins: parsed.sables_fins ?? '',
    sables_grossiers: parsed.sables_grossiers ?? '',
    fraction_inf_2mm: parsed.fraction_inf_2mm ?? '',
    fraction_sup_2mm: parsed.fraction_sup_2mm ?? '',
    observations: String(parsed.observations || '').trim(),
  }
}

export function computeTxResultats(values = {}) {
  const base = unwrapTxResultats(values)
  const limons_totaux = (() => {
    const a = num(base.limons_fins)
    const b = num(base.limons_grossiers)
    if (a == null && b == null) return null
    return rnd((a || 0) + (b || 0), 2)
  })()
  const sables_totaux = (() => {
    const a = num(base.sables_fins)
    const b = num(base.sables_grossiers)
    if (a == null && b == null) return null
    return rnd((a || 0) + (b || 0), 2)
  })()
  return {
    ...base,
    limons_totaux,
    sables_totaux,
  }
}

export function serializeTxResultats(values = {}) {
  return computeTxResultats(values)
}
