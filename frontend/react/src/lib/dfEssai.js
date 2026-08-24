import { num, rnd } from '@/components/essais/essaiFormUi'

function text(value) {
  if (value == null) return ''
  return String(value).trim()
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function findRowKey(row, fragments) {
  const keys = Object.keys(row || {})
  const needles = fragments.map(normalizeKey)
  return keys.find((key) => {
    const haystack = normalizeKey(key)
    return needles.some((needle) => haystack.includes(needle))
  }) || ''
}

export const DF_OUVRAGE_OPTIONS = [
  { key: 'arase', label: 'Arase' },
  { key: 'couche_de_forme', label: 'Couche de forme' },
  { key: 'chaussees', label: 'Chaussées' },
  { key: 'autres', label: 'Autres' },
]

export function emptyDfPoint(index = 0) {
  return {
    id: index + 1,
    essai_no: String(index + 1),
    profil: '',
    gauche: '',
    axe: '',
    droite: '',
    observations: '',
  }
}

export function emptyDfPayload() {
  return {
    operateur: '',
    date_essai: '',
    materiel: '',
    charge_roulante_kn: '130',
    temperature_surface_c: '',
    materiaux: '',
    age: '',
    dosage_liant: '',
    partie_ouvrage: '',
    nature_materiau: '',
    section_controlee: '',
    ouvrage: {
      arase: false,
      couche_de_forme: false,
      chaussees: false,
      autres: false,
      autres_libelle: '',
    },
    source_criteres: '',
    critere_deflexion_100e_mm: '',
    points: [emptyDfPoint(0), emptyDfPoint(1)],
    moyenne_gauche: null,
    moyenne_axe: null,
    moyenne_droite: null,
    taux_conformes_percent: null,
    conclusion: '',
    rows: [],
    header_snapshot: null,
  }
}

function mapHistoricalRow(row, index) {
  const source = row && typeof row === 'object' ? row : {}
  const essaiKey = findRowKey(source, ['n essai', 'essai', 'point'])
  const profilKey = findRowKey(source, ['profil'])
  const gaucheKey = findRowKey(source, ['gauche', 'left'])
  const axeKey = findRowKey(source, ['axe', 'centre', 'center'])
  const droiteKey = findRowKey(source, ['droite', 'right'])
  const obsKey = findRowKey(source, ['obs', 'commentaire'])
  return {
    id: index + 1,
    essai_no: text(source.essai_no || (essaiKey ? source[essaiKey] : '') || String(index + 1)),
    profil: text(source.profil || (profilKey ? source[profilKey] : '')),
    gauche: source.gauche ?? (gaucheKey ? source[gaucheKey] : ''),
    axe: source.axe ?? (axeKey ? source[axeKey] : ''),
    droite: source.droite ?? (droiteKey ? source[droiteKey] : ''),
    observations: text(source.observations || source.observation || (obsKey ? source[obsKey] : '')),
    source_row: source,
  }
}

function normalizePoint(row, index) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ...source,
    id: source.id ?? index + 1,
    essai_no: text(source.essai_no || source.point_no || source.point || '') || String(index + 1),
    profil: text(source.profil || source.profileNumber || ''),
    gauche: source.gauche ?? '',
    axe: source.axe ?? '',
    droite: source.droite ?? '',
    observations: text(source.observations || source.observation),
  }
}

function average(values) {
  const nums = values.filter((value) => value != null)
  if (!nums.length) return null
  return rnd(nums.reduce((sum, value) => sum + value, 0) / nums.length, 1)
}

export function unwrapDfPayload(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const ouvrage = {
    ...emptyDfPayload().ouvrage,
    ...(source.ouvrage && typeof source.ouvrage === 'object' ? source.ouvrage : {}),
  }
  let points = Array.isArray(source.points) ? source.points.map((row, index) => normalizePoint(row, index)) : []
  if (!points.length && Array.isArray(source.rows) && source.rows.length) {
    points = source.rows.map((row, index) => mapHistoricalRow(row, index))
  }
  if (!points.length) points = emptyDfPayload().points
  return {
    ...emptyDfPayload(),
    ...source,
    ouvrage,
    points,
    rows: Array.isArray(source.rows) ? source.rows : [],
    header_snapshot: source.header_snapshot ?? null,
  }
}

export function computeDfResultats(raw) {
  const draft = unwrapDfPayload(raw)
  const gauche = draft.points.map((row) => num(row.gauche))
  const axe = draft.points.map((row) => num(row.axe))
  const droite = draft.points.map((row) => num(row.droite))
  const criterion = num(draft.critere_deflexion_100e_mm)
  const measured = [...gauche, ...axe, ...droite].filter((value) => value != null)
  let taux = num(draft.taux_conformes_percent)
  if (criterion != null && measured.length) {
    const ok = measured.filter((value) => value >= criterion).length
    taux = rnd((ok / measured.length) * 100, 0)
  } else if (!measured.length) {
    taux = null
  }
  return {
    ...draft,
    moyenne_gauche: average(gauche),
    moyenne_axe: average(axe),
    moyenne_droite: average(droite),
    taux_conformes_percent: taux,
    nb_mesures: measured.length,
  }
}

export function serializeDfPayload(raw) {
  const computed = computeDfResultats(raw)
  return {
    ...computed,
    points: computed.points.map((row, index) => ({
      ...row,
      essai_no: text(row.essai_no) || String(index + 1),
      gauche: num(row.gauche) ?? row.gauche,
      axe: num(row.axe) ?? row.axe,
      droite: num(row.droite) ?? row.droite,
      observations: text(row.observations),
    })),
  }
}
