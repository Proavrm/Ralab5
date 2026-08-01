import { buildPathWithReturnTo } from '@/lib/detailNavigation'

export const RST_PRESTATION_TEMPLATES = [
  { key: 'intervention_terrain', need_code: 'INTERVENTION_TERRAIN', domain_code: 'TERRAIN', need_label: 'Intervention terrain' },
  { key: 'essais_terrain', need_code: 'ESSAIS_TERRAIN', domain_code: 'TERRAIN', need_label: 'Essais terrain' },
  { key: 'prelevements_echantillons', need_code: 'PRELEVEMENTS_ECHANTILLONS', domain_code: 'PRELEVEMENTS', need_label: 'Prélèvements / échantillons' },
  { key: 'essais_laboratoire', need_code: 'ESSAIS_LABO', domain_code: 'LABORATOIRE', need_label: 'Essais laboratoire' },
  { key: 'etude_technique', need_code: 'ETUDE_TECHNIQUE', domain_code: 'ETUDE', need_label: 'Étude technique' },
  { key: 'mission_g3', need_code: 'MISSION_G3', domain_code: 'G3', need_label: 'Mission G3' },
  { key: 'essais_externes', need_code: 'ESSAIS_EXTERNES', domain_code: 'EXTERNE', need_label: 'Essais externes' },
  { key: 'equipements_specifiques', need_code: 'EQUIPEMENTS_SPECIFIQUES', domain_code: 'MOYENS', need_label: 'Équipements spécifiques' },
  { key: 'ressources_humaines', need_code: 'RESSOURCES_HUMAINES', domain_code: 'RESSOURCES', need_label: 'Ressources humaines' },
]

export const RST_NEED_STATUS_OPTIONS = ['À confirmer', 'Requis', 'Optionnel', 'Hors périmètre', 'Annulé']

/**
 * Liens métier par famille de prestation (pas de type de calcul en dur).
 * module: clé générique → chemin construit via buildPrestationFollowUp().
 */
export const RST_PRESTATION_FOLLOW_UPS = {
  ETUDE_TECHNIQUE: { module: 'avis', label: 'Ouvrir l’avis technique', countKey: 'avis' },
  MISSION_G3: { module: 'g3', label: 'Voir la mission G3' },
  INTERVENTION_TERRAIN: { module: 'interventions', label: 'Voir les interventions', countKey: 'interventions' },
  ESSAIS_TERRAIN: { module: 'preparation', label: 'Ouvrir la préparation' },
  PRELEVEMENTS_ECHANTILLONS: { module: 'preparation', label: 'Ouvrir la préparation' },
  ESSAIS_LABO: { module: 'preparation', label: 'Ouvrir la préparation' },
}

const TEMPLATE_BY_NEED_CODE = Object.fromEntries(
  RST_PRESTATION_TEMPLATES.map((template) => [template.need_code, template]),
)

export function resolvePrestationDomainCode(needCode, fallback = 'RST') {
  return TEMPLATE_BY_NEED_CODE[String(needCode || '').trim()]?.domain_code || fallback
}

/**
 * @param {{ need_code?: string }} item
 * @param {{
 *   demandeId?: number|string|null,
 *   affaireId?: number|string|null,
 *   preparationHref?: string|null,
 *   returnTo?: string|null,
 *   counts?: Record<string, number>,
 * }} context
 * @returns {{ label: string, href: string, module: string } | null}
 */
export function buildPrestationFollowUp(item, context = {}) {
  const needCode = String(item?.need_code || '').trim()
  const def = RST_PRESTATION_FOLLOW_UPS[needCode]
  if (!def) return null

  const demandeId = context.demandeId != null && context.demandeId !== ''
    ? Number(context.demandeId)
    : null
  if (!Number.isFinite(demandeId)) return null

  const params = new URLSearchParams({ demande_id: String(demandeId) })
  const affaireId = context.affaireId != null && context.affaireId !== ''
    ? Number(context.affaireId)
    : null
  if (Number.isFinite(affaireId)) params.set('affaire_rst_id', String(affaireId))

  let href = null
  let alreadyHasReturnTo = false
  switch (def.module) {
    case 'calculs':
      href = `/calculs?${params}`
      break
    case 'avis':
      href = `/avis-technique/nouveau?${params}`
      break
    case 'g3':
      href = `/g3/missions?${params}`
      break
    case 'interventions':
      href = `/interventions?${params}`
      break
    case 'preparation':
      href = context.preparationHref || null
      alreadyHasReturnTo = true
      break
    default:
      href = null
  }
  if (!href) return null
  if (!alreadyHasReturnTo && context.returnTo) {
    href = buildPathWithReturnTo(href, context.returnTo)
  }

  const count = def.countKey && context.counts
    ? Number(context.counts[def.countKey]) || 0
    : 0
  const label = count > 0 ? `${def.label} (${count})` : def.label

  return { module: def.module, label, href }
}

function createClientKey() {
  return `rst-need-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createStructuredNeed(template = {}) {
  return {
    client_key: createClientKey(),
    need_code: template.need_code || '',
    domain_code: template.domain_code || '',
    need_label: template.need_label || '',
    description: '',
    quantity: '',
    request_status: 'À confirmer',
    notes: '',
  }
}

export function normalizeStructuredNeed(item = {}) {
  const needCode = item.need_code || ''
  return {
    ...createStructuredNeed(),
    ...item,
    client_key: item.client_key || createClientKey(),
    domain_code: item.domain_code || resolvePrestationDomainCode(needCode),
  }
}

export function serializePrestations(items = []) {
  return items
    .filter(
      (item) =>
        String(item.need_code || '').trim()
        || String(item.need_label || '').trim()
        || String(item.description || '').trim()
    )
    .map(({ client_key, domain_code, ...item }) => ({ ...item }))
}
