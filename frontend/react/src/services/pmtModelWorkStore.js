const MODEL_DEFINITION_SCHEMA_VERSION = 1
const MODEL_DEFINITION_CODE_PMT = 'PMT'
const MODEL_DEFINITION_CODE_PMT_RAPPORT = 'PMT_RAPPORT'

const PMT_MODEL_DEFINITIONS_STORAGE_KEY = 'ralab5_pmt_model_definitions_v1'
const PMT_WORK_DOCUMENTS_STORAGE_KEY = 'ralab5_pmt_work_documents_v1'
const PMT_RAPPORT_MODELS_STORAGE_KEY = 'ralab5_pmt_rapport_models_v1'
const PMT_RUNTIME_PUBLICATION_STORAGE_KEY = 'ralab5_pmt_runtime_publication_v1'

export const WORK_STATUS_PMT = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  VALIDATED: 'validated',
}

function safeParseJson(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function readStorageObject(key, fallback) {
  const parsed = safeParseJson(localStorage.getItem(key))
  return parsed && typeof parsed === 'object' ? parsed : fallback
}

function writeStorageObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, index) => ({ ...row, id: row?.id ?? index + 1 }))
}

function parseNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeStatusValue(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'draft'
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (['approved', 'approuve', 'aprovado', 'valide', 'validated'].includes(normalized)) return 'approved'
  return 'draft'
}

export function computePmtSummary(pointsRows = [], minPmt = null) {
  const normalized = normalizeRows(pointsRows)
  const values = normalized
    .map((row) => parseNumber(row?.profondeur_macrotexture_mm ?? row?.pmt_mm))
    .filter((value) => value != null)
  const min = parseNumber(minPmt)
  const average = values.length ? Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2)) : null
  const minValue = values.length ? Number(Math.min(...values).toFixed(2)) : null
  const maxValue = values.length ? Number(Math.max(...values).toFixed(2)) : null
  const conformCount = min == null ? values.length : values.filter((v) => v >= min).length
  const conformityPct = values.length ? Number(((conformCount / values.length) * 100).toFixed(2)) : null
  return {
    points: values.length,
    profondeur_macrotexture_generale_mm: average,
    min_pmt_mm: minValue,
    max_pmt_mm: maxValue,
    pourcentage_valeurs_conformes: conformityPct,
  }
}

function normalizeRuntimeValuesPMT(values = {}) {
  const safe = values && typeof values === 'object' ? values : {}
  const pointsRows = normalizeRows(safe.points_rows)
  return {
    meta: safe.meta && typeof safe.meta === 'object' ? { ...safe.meta } : {},
    points_rows: pointsRows,
    resume: computePmtSummary(pointsRows, safe?.meta?.criteria_pmt_min),
  }
}

function normalizeModelDefinitionPMT(payload = {}) {
  const values = normalizeRuntimeValuesPMT(payload?.values)
  return {
    id: String(payload?.id || `${MODEL_DEFINITION_CODE_PMT}-local`),
    code: MODEL_DEFINITION_CODE_PMT,
    schema_version: MODEL_DEFINITION_SCHEMA_VERSION,
    status: normalizeStatusValue(payload?.status),
    reference: String(payload?.reference || ''),
    values,
    source: payload?.source && typeof payload.source === 'object' ? { ...payload.source } : null,
    updated_at: String(payload?.updated_at || new Date().toISOString()),
  }
}

function normalizeRapportTemplatePMT(payload = {}) {
  const template = payload?.template && typeof payload.template === 'object' ? payload.template : {}
  return {
    id: String(payload?.id || `${MODEL_DEFINITION_CODE_PMT_RAPPORT}-${Date.now()}`),
    code: MODEL_DEFINITION_CODE_PMT_RAPPORT,
    schema_version: MODEL_DEFINITION_SCHEMA_VERSION,
    status: normalizeStatusValue(payload?.status),
    reference: String(payload?.reference || ''),
    template: { ...template },
    updated_at: String(payload?.updated_at || new Date().toISOString()),
  }
}

function readModelDefinitionsPMT() {
  const raw = readStorageObject(PMT_MODEL_DEFINITIONS_STORAGE_KEY, [])
  return Array.isArray(raw) ? raw : []
}

function writeModelDefinitionsPMT(models) {
  writeStorageObject(PMT_MODEL_DEFINITIONS_STORAGE_KEY, Array.isArray(models) ? models : [])
}

export function listModelDefinitionsPMT() {
  return readModelDefinitionsPMT()
    .map((item) => normalizeModelDefinitionPMT(item))
    .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
}

export function listApprovedModelDefinitionsPMT() {
  return listModelDefinitionsPMT().filter((item) => item.status === 'approved')
}

export function getModelDefinitionPMT() {
  return listModelDefinitionsPMT()[0] || null
}

export function getModelDefinitionPMTById(id) {
  if (!id) return null
  return listModelDefinitionsPMT().find((item) => String(item.id) === String(id)) || null
}

export function upsertModelDefinitionPMT(payload) {
  const normalized = normalizeModelDefinitionPMT(payload)
  const rows = listModelDefinitionsPMT()
  const index = rows.findIndex((item) => String(item.id) === String(normalized.id))
  const next = index >= 0
    ? rows.map((item, idx) => (idx === index ? normalized : item))
    : [normalized, ...rows]
  writeModelDefinitionsPMT(next)
  return normalized
}

export function deleteModelDefinitionPMT(id = '') {
  const rows = listModelDefinitionsPMT()
  if (!rows.length) return false
  if (!id) {
    writeModelDefinitionsPMT([])
    return true
  }
  const next = rows.filter((item) => String(item.id) !== String(id))
  if (next.length === rows.length) return false
  writeModelDefinitionsPMT(next)
  return true
}

function readRapportModelsPMT() {
  const raw = readStorageObject(PMT_RAPPORT_MODELS_STORAGE_KEY, [])
  return Array.isArray(raw) ? raw : []
}

function writeRapportModelsPMT(models) {
  writeStorageObject(PMT_RAPPORT_MODELS_STORAGE_KEY, Array.isArray(models) ? models : [])
}

export function listRapportModelDefinitionsPMT() {
  return readRapportModelsPMT()
    .map((item) => normalizeRapportTemplatePMT(item))
    .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
}

export function listApprovedRapportModelDefinitionsPMT() {
  return listRapportModelDefinitionsPMT().filter((item) => item.status === 'approved')
}

export function getRapportModelDefinitionPMTById(id) {
  if (!id) return null
  return listRapportModelDefinitionsPMT().find((item) => String(item.id) === String(id)) || null
}

export function upsertRapportModelDefinitionPMT(payload) {
  const normalized = normalizeRapportTemplatePMT(payload)
  const rows = listRapportModelDefinitionsPMT()
  const index = rows.findIndex((item) => String(item.id) === String(normalized.id))
  const next = index >= 0
    ? rows.map((item, idx) => (idx === index ? normalized : item))
    : [normalized, ...rows]
  writeRapportModelsPMT(next)
  return normalized
}

function readWorkDocumentsPMT() {
  const raw = readStorageObject(PMT_WORK_DOCUMENTS_STORAGE_KEY, [])
  return Array.isArray(raw) ? raw : []
}

function writeWorkDocumentsPMT(documents) {
  writeStorageObject(PMT_WORK_DOCUMENTS_STORAGE_KEY, Array.isArray(documents) ? documents : [])
}

function normalizeWorkDocumentPMT(payload = {}) {
  const now = new Date().toISOString()
  return {
    id: String(payload?.id || `work-pmt-${Date.now()}`),
    code: MODEL_DEFINITION_CODE_PMT,
    schema_version: MODEL_DEFINITION_SCHEMA_VERSION,
    model_definition_id: String(payload?.model_definition_id || ''),
    model_version: Number(payload?.model_version || MODEL_DEFINITION_SCHEMA_VERSION),
    source_essai_uid: payload?.source_essai_uid == null ? null : Number(payload.source_essai_uid),
    source_terrain_uid: payload?.source_terrain_uid == null ? null : Number(payload.source_terrain_uid),
    rapport_model_definition_id: String(payload?.rapport_model_definition_id || ''),
    rapport_model_version: payload?.rapport_model_version == null ? null : Number(payload.rapport_model_version),
    runtime_values: normalizeRuntimeValuesPMT(payload?.runtime_values || {}),
    work_status: Object.values(WORK_STATUS_PMT).includes(String(payload?.work_status || ''))
      ? String(payload.work_status)
      : WORK_STATUS_PMT.DRAFT,
    review_notes: String(payload?.review_notes || ''),
    reviewed_by: String(payload?.reviewed_by || ''),
    reviewed_at: payload?.reviewed_at ? String(payload.reviewed_at) : null,
    validated_by: String(payload?.validated_by || ''),
    validated_at: payload?.validated_at ? String(payload.validated_at) : null,
    created_at: String(payload?.created_at || now),
    updated_at: String(payload?.updated_at || now),
  }
}

export function createWorkDocumentPMT({
  modelDefinitionId,
  modelVersion,
  runtimeValues = {},
  sourceEssaiUid = null,
  sourceTerrainUid = null,
  rapportModelDefinitionId = '',
  rapportModelVersion = null,
}) {
  const rows = readWorkDocumentsPMT()
  const document = normalizeWorkDocumentPMT({
    id: `work-pmt-${Date.now()}`,
    model_definition_id: String(modelDefinitionId || ''),
    model_version: Number(modelVersion || MODEL_DEFINITION_SCHEMA_VERSION),
    source_essai_uid: sourceEssaiUid == null ? null : Number(sourceEssaiUid),
    source_terrain_uid: sourceTerrainUid == null ? null : Number(sourceTerrainUid),
    rapport_model_definition_id: String(rapportModelDefinitionId || ''),
    rapport_model_version: rapportModelVersion == null ? null : Number(rapportModelVersion),
    runtime_values: normalizeRuntimeValuesPMT(runtimeValues),
    work_status: WORK_STATUS_PMT.DRAFT,
  })
  writeWorkDocumentsPMT([...rows, document])
  return document
}

export function createWorkDocumentPMTFromModel(modelDefinition) {
  const normalizedModel = normalizeModelDefinitionPMT(modelDefinition || {})
  return createWorkDocumentPMT({
    modelDefinitionId: normalizedModel.id,
    modelVersion: normalizedModel.schema_version,
    runtimeValues: normalizedModel.values,
  })
}

export function updateWorkDocumentPMT(id, updates = {}) {
  const rows = readWorkDocumentsPMT()
  let updated = null
  const next = rows.map((doc) => {
    if (String(doc?.id) !== String(id)) return doc
    updated = {
      ...normalizeWorkDocumentPMT(doc),
      source_essai_uid: updates.source_essai_uid != null
        ? (updates.source_essai_uid === '' ? null : Number(updates.source_essai_uid))
        : (doc?.source_essai_uid ?? null),
      source_terrain_uid: updates.source_terrain_uid != null
        ? (updates.source_terrain_uid === '' ? null : Number(updates.source_terrain_uid))
        : (doc?.source_terrain_uid ?? null),
      rapport_model_definition_id: updates.rapport_model_definition_id != null
        ? String(updates.rapport_model_definition_id || '')
        : String(doc?.rapport_model_definition_id || ''),
      rapport_model_version: updates.rapport_model_version != null
        ? (updates.rapport_model_version === '' ? null : Number(updates.rapport_model_version))
        : (doc?.rapport_model_version ?? null),
      runtime_values: updates.runtime_values && typeof updates.runtime_values === 'object'
        ? normalizeRuntimeValuesPMT(updates.runtime_values)
        : (doc?.runtime_values || {}),
      work_status: updates.work_status && Object.values(WORK_STATUS_PMT).includes(String(updates.work_status))
        ? String(updates.work_status)
        : (doc?.work_status || WORK_STATUS_PMT.DRAFT),
      review_notes: updates.review_notes != null ? String(updates.review_notes) : String(doc?.review_notes || ''),
      reviewed_by: updates.reviewed_by != null ? String(updates.reviewed_by) : String(doc?.reviewed_by || ''),
      reviewed_at: updates.reviewed_at != null ? (updates.reviewed_at ? String(updates.reviewed_at) : null) : (doc?.reviewed_at || null),
      validated_by: updates.validated_by != null ? String(updates.validated_by) : String(doc?.validated_by || ''),
      validated_at: updates.validated_at != null ? (updates.validated_at ? String(updates.validated_at) : null) : (doc?.validated_at || null),
      updated_at: new Date().toISOString(),
    }
    return updated
  })
  writeWorkDocumentsPMT(next)
  return updated
}

export function deleteWorkDocumentPMT(id) {
  const rows = readWorkDocumentsPMT()
  const before = rows.length
  const next = rows.filter((doc) => String(doc?.id) !== String(id))
  if (next.length === before) return false
  writeWorkDocumentsPMT(next)
  return true
}

export function listWorkDocumentsPMT() {
  return readWorkDocumentsPMT()
    .filter((doc) => String(doc?.code || '').toUpperCase() === MODEL_DEFINITION_CODE_PMT)
    .map((doc) => normalizeWorkDocumentPMT(doc))
    .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
}

export function getWorkDocumentPMT(id) {
  return listWorkDocumentsPMT().find((doc) => String(doc?.id) === String(id)) || null
}

function normalizeRuntimePublicationPMT(payload = {}) {
  const now = new Date().toISOString()
  const modelSnapshot = payload?.model_snapshot && typeof payload.model_snapshot === 'object' ? payload.model_snapshot : null
  const rapportSnapshot = payload?.rapport_snapshot && typeof payload.rapport_snapshot === 'object' ? payload.rapport_snapshot : null
  return {
    code: MODEL_DEFINITION_CODE_PMT,
    work_document_id: String(payload?.work_document_id || ''),
    model_definition_id: String(payload?.model_definition_id || ''),
    rapport_model_definition_id: String(payload?.rapport_model_definition_id || ''),
    model_snapshot: modelSnapshot,
    rapport_snapshot: rapportSnapshot,
    published_at: String(payload?.published_at || now),
    updated_at: String(payload?.updated_at || now),
  }
}

export function getRuntimePublicationPMT() {
  const record = readStorageObject(PMT_RUNTIME_PUBLICATION_STORAGE_KEY, null)
  if (!record || typeof record !== 'object') return null
  return normalizeRuntimePublicationPMT(record)
}

export function publishRuntimePMT(payload = {}) {
  const normalized = normalizeRuntimePublicationPMT(payload)
  if (!normalized.work_document_id) return null
  writeStorageObject(PMT_RUNTIME_PUBLICATION_STORAGE_KEY, normalized)
  return normalized
}
