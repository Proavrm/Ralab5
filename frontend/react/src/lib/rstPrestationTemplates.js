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
  return {
    ...createStructuredNeed(),
    ...item,
    client_key: item.client_key || createClientKey(),
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
