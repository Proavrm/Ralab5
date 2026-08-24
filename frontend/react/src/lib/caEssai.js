import { num, rnd } from '@/components/essais/essaiFormUi'

/**
 * Calcaire actif — feuille générique.
 * Saisie des mesures de laboratoire ; calcul du résultat (% CaCO3 actif)
 * selon facteur de titre configurable (ne fige pas une norme inventée).
 */
export function unwrapCaResultats(raw) {
  let parsed = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw || '{}') } catch { parsed = {} }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {}
  return {
    methode: String(parsed.methode || '').trim(),
    norme: String(parsed.norme || '').trim(),
    prise_essai_g: parsed.prise_essai_g ?? '',
    volume_titre_ml: parsed.volume_titre_ml ?? '',
    facteur_titre: parsed.facteur_titre ?? '',
    blanc_ml: parsed.blanc_ml ?? '',
    observations: String(parsed.observations || '').trim(),
  }
}

export function computeCaResultats(values = {}) {
  const base = unwrapCaResultats(values)
  const prise = num(base.prise_essai_g)
  const volume = num(base.volume_titre_ml)
  const facteur = num(base.facteur_titre)
  const blanc = num(base.blanc_ml) ?? 0
  const volume_net = volume != null ? rnd(volume - blanc, 3) : null
  const ca_pct = prise != null && prise > 0 && volume_net != null && facteur != null
    ? rnd((volume_net * facteur) / prise, 2)
    : null
  return {
    ...base,
    volume_net,
    ca_pct,
    resultat: ca_pct,
  }
}

export function serializeCaResultats(values = {}) {
  return computeCaResultats(values)
}
