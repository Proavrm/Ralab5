import { num, rnd } from '@/components/essais/essaiFormUi'
import {
  readTerrainDraft,
  TERRAIN_HEADER_FIELDS,
} from '@/lib/terrainEssaiDraft'

function text(value) {
  if (value == null) return ''
  return String(value).trim()
}

export function emptyFwdHeader() {
  return Object.fromEntries(TERRAIN_HEADER_FIELDS.map((field) => [field.key, '']))
}

export function emptyFwdPoint(index = 0) {
  return {
    id: index + 1,
    point_code: `P${index + 1}`,
    pk: '',
    deflexion_mm: '',
    temperature_c: '',
    observations: '',
  }
}

export function emptyFwdPayload() {
  return {
    header: emptyFwdHeader(),
    values: {
      equipment: '',
      load_kg: '',
      sensor_type: '',
      criteria_deflexion_mm: '',
    },
    points: [emptyFwdPoint(0), emptyFwdPoint(1)],
    conclusion: {
      comments: '',
      conformity: 'pour_info',
      controller: '',
    },
    moyenne_deflexion_mm: null,
    taux_conformes_percent: null,
  }
}

function normalizePoint(row, index) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ...source,
    id: source.id ?? index + 1,
    point_code: text(source.point_code || source.point || source.point_no) || `P${index + 1}`,
    pk: text(source.pk || source.localisation),
    deflexion_mm: source.deflexion_mm ?? source.d_mm ?? '',
    temperature_c: source.temperature_c ?? source.t_c ?? '',
    observations: text(source.observations || source.observation),
  }
}

function hasFwdShape(source) {
  if (!source || typeof source !== 'object') return false
  return Boolean(
    source.header
    || source.values
    || (Array.isArray(source.points) && source.points.length)
    || source.conclusion,
  )
}

export function unwrapFwdPayload(raw, { localDraft = null } = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const fallback = localDraft && typeof localDraft === 'object' ? localDraft : null
  const base = hasFwdShape(source) ? source : (fallback || {})
  const empty = emptyFwdPayload()
  const points = Array.isArray(base.points) && base.points.length
    ? base.points.map((row, index) => normalizePoint(row, index))
    : empty.points
  return {
    ...empty,
    ...base,
    header: { ...empty.header, ...(base.header && typeof base.header === 'object' ? base.header : {}) },
    values: { ...empty.values, ...(base.values && typeof base.values === 'object' ? base.values : {}) },
    points,
    conclusion: { ...empty.conclusion, ...(base.conclusion && typeof base.conclusion === 'object' ? base.conclusion : {}) },
  }
}

export function hydrateFwdPayload(raw, extras = {}) {
  const essaiId = typeof extras === 'string' ? extras : (extras?.essaiId || 'draft')
  const localDraft = typeof window !== 'undefined' ? readTerrainDraft('FWD', essaiId) : null
  const hasLocal = Boolean(localDraft?.saved_at || (localDraft?.points || []).length)
  return unwrapFwdPayload(raw, { localDraft: hasLocal ? localDraft : null })
}

export function computeFwdResultats(raw) {
  const draft = unwrapFwdPayload(raw)
  const values = draft.points
    .map((row) => num(row.deflexion_mm))
    .filter((value) => value != null)
  const moyenne = values.length ? rnd(values.reduce((sum, value) => sum + value, 0) / values.length, 2) : null
  const criterion = num(draft.values?.criteria_deflexion_mm)
  let taux = null
  if (criterion != null && values.length) {
    const ok = values.filter((value) => value <= criterion).length
    taux = rnd((ok / values.length) * 100, 0)
  }
  return {
    ...draft,
    moyenne_deflexion_mm: moyenne,
    taux_conformes_percent: taux,
    nb_points: values.length,
  }
}

export function serializeFwdPayload(raw) {
  const computed = computeFwdResultats(raw)
  return {
    ...computed,
    points: computed.points.map((row, index) => ({
      ...row,
      point_code: text(row.point_code) || `P${index + 1}`,
      deflexion_mm: num(row.deflexion_mm) ?? row.deflexion_mm,
      temperature_c: num(row.temperature_c) ?? row.temperature_c,
      observations: text(row.observations),
    })),
  }
}
