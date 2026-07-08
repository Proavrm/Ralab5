/** Brouillon partagé feuilles terrain + rapports essais in situ. */

export const TERRAIN_HEADER_FIELDS = [
  { key: 'affaire_ref', label: "N° d'affaire" },
  { key: 'demande_ref', label: 'Demande' },
  { key: 'campagne_ref', label: 'Campagne' },
  { key: 'intervention_ref', label: 'Intervention' },
  { key: 'site', label: 'Chantier / site' },
  { key: 'zone', label: 'Zone / localisation' },
  { key: 'operator', label: 'Opérateur' },
  { key: 'test_date', label: 'Date essai' },
  { key: 'weather', label: 'Conditions météo' },
  { key: 'controlled_section', label: 'Section contrôlée' },
]

export function terrainDraftStorageKey(code, essaiId = 'draft') {
  return `ralab5:terrain-essai:${String(code || 'GEN').toUpperCase()}:${essaiId}`
}

export function readTerrainDraft(code, essaiId = 'draft') {
  const empty = {
    header: Object.fromEntries(TERRAIN_HEADER_FIELDS.map((field) => [field.key, ''])),
    values: {},
    points: [],
    conclusion: { comments: '', conformity: 'pour_info', controller: '' },
    saved_at: '',
  }
  try {
    const raw = window.localStorage.getItem(terrainDraftStorageKey(code, essaiId))
    if (!raw) return empty
    const parsed = JSON.parse(raw)
    return {
      ...empty,
      ...parsed,
      header: { ...empty.header, ...(parsed.header || {}) },
      values: { ...(parsed.values || {}) },
      points: Array.isArray(parsed.points) ? parsed.points : [],
      conclusion: { ...empty.conclusion, ...(parsed.conclusion || {}) },
    }
  } catch {
    return empty
  }
}

export function writeTerrainDraft(code, essaiId, payload) {
  const saved = { ...payload, saved_at: new Date().toISOString() }
  window.localStorage.setItem(terrainDraftStorageKey(code, essaiId), JSON.stringify(saved))
  return saved
}

export function buildTerrainContextFromSearchParams(searchParams = new URLSearchParams()) {
  const mapping = {
    affaire_ref: ['affaire_ref', 'affaire'],
    demande_ref: ['demande_ref', 'demande'],
    campagne_ref: ['campagne_ref', 'campaign_ref'],
    intervention_ref: ['intervention_ref', 'intervention'],
    site: ['site', 'chantier'],
    zone: ['zone', 'campaign_zone'],
    operator: ['operator', 'technicien', 'operateur'],
    test_date: ['test_date', 'date_essai'],
    weather: ['weather', 'cond_meteo'],
    controlled_section: ['controlled_section', 'section'],
  }
  const header = {}
  Object.entries(mapping).forEach(([key, aliases]) => {
    for (const alias of aliases) {
      const value = String(searchParams.get(alias) || '').trim()
      if (value) {
        header[key] = value
        break
      }
    }
  })
  return header
}

export function buildRapportSearchParams(code, essaiId, draft, extra = {}) {
  const params = new URLSearchParams()
  params.set('essai_code', String(code || '').toUpperCase())
  if (essaiId) params.set('essai_id', String(essaiId))
  Object.entries(draft?.header || {}).forEach(([key, value]) => {
    if (value) params.set(key, String(value))
  })
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value != null && value !== '') params.set(key, String(value))
  })
  return params
}
