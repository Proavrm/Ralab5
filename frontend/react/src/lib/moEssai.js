import { num, rnd } from '@/components/essais/essaiFormUi'

/** Matière organique par perte au feu (étuvage + calcination) — méthode générique configurable. */
export function unwrapMoResultats(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '{}') } catch { parsed = {} }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
  return {
    methode: String(parsed.methode || '').trim(),
    norme: String(parsed.norme || '').trim(),
    base_resultat: parsed.base_resultat || 'matiere_seche',
    boite: parsed.boite ?? '',
    m1: parsed.m1 ?? '',
    m2: parsed.m2 ?? '',
    m3: parsed.m3 ?? '',
    observations: String(parsed.observations || '').trim(),
  }
}

export function computeMoResultats(values = {}) {
  const base = unwrapMoResultats(values)
  const m1 = num(base.m1)
  const m2 = num(base.m2)
  const m3 = num(base.m3)
  const masse_seche = m1 != null && m2 != null ? rnd(m2 - m1, 3) : null
  const masse_residu = m1 != null && m3 != null ? rnd(m3 - m1, 3) : null
  const masse_perdue = masse_seche != null && masse_residu != null
    ? rnd(masse_seche - masse_residu, 3)
    : null
  const mo_pct = masse_seche != null && masse_seche > 0 && masse_perdue != null
    ? rnd((masse_perdue / masse_seche) * 100, 2)
    : null
  return {
    ...base,
    masse_seche,
    masse_residu,
    masse_perdue,
    mo_pct,
    resultat: mo_pct,
  }
}

export function serializeMoResultats(values = {}) {
  return computeMoResultats(values)
}

export function moBaseLabel(value) {
  if (value === 'matiere_seche') return 'Sur matière sèche'
  if (value === 'matiere_brute') return 'Sur matière brute'
  return String(value || '').trim() || '—'
}
