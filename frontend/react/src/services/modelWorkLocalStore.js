const MODEL_DEFINITION_SCHEMA_VERSION = 1
const MODEL_DEFINITION_CODE_DE = 'DE'
const MODEL_DEFINITION_CODE_DE_RAPPORT = 'DE_RAPPORT'
const LEGACY_DE_STORAGE_KEY = 'ralab5_modele_base_DE'
const MODEL_DEFINITIONS_STORAGE_KEY = 'ralab5_model_definitions_v1'
const WORK_DOCUMENTS_STORAGE_KEY = 'ralab5_work_documents_v1'
const RAPPORT_MODELS_DE_STORAGE_KEY = 'ralab5_de_rapport_models_v1'
// NOTE (2026-05-01):
// DE-specific runtime publication key. Target architecture is publication partitioned by essai code/type.
const RUNTIME_PUBLICATION_DE_STORAGE_KEY = 'ralab5_de_runtime_publication_v1'
export const WORK_STATUS_DE = {
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
  // NOTE:
  // Normalizes multilingual/legacy labels into internal status values.
  // Keep reusable: other essai/model pipelines should share the same normalization behavior.
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'draft'
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (
    normalized === 'approved' ||
    normalized === 'approuve' ||
    normalized === 'aprovado' ||
    normalized === 'valide' ||
    normalized === 'validated'
  ) {
    return 'approved'
  }
  return 'draft'
}

export function computeDeSummary(pointsRows = []) {
  const normalized = normalizeRows(pointsRows).filter((row) => {
    return [row?.masse_volumique, row?.compacite_pct, row?.vides_pct].some((value) => parseNumber(value) != null)
  })

  const mvValues = normalized.map((row) => parseNumber(row.masse_volumique)).filter((value) => value != null)
  const compValues = normalized.map((row) => parseNumber(row.compacite_pct)).filter((value) => value != null)
  const videsValues = normalized.map((row) => parseNumber(row.vides_pct)).filter((value) => value != null)

  const avg = (arr, decimals) => {
    if (!arr.length) return null
    const total = arr.reduce((sum, value) => sum + Number(value || 0), 0)
    return Number((total / arr.length).toFixed(decimals))
  }

  return {
    points: normalized.length,
    moyenne_mv: avg(mvValues, 3),
    moyenne_compacite_pct: avg(compValues, 2),
    moyenne_vides_pct: avg(videsValues, 2),
  }
}

function normalizeRuntimeValuesDE(values = {}) {
  const safe = values && typeof values === 'object' ? values : {}
  const pointsRows = normalizeRows(safe.points_rows)
  return {
    meta: safe.meta && typeof safe.meta === 'object' ? { ...safe.meta } : {},
    points_rows: pointsRows,
    resume: computeDeSummary(pointsRows),
  }
}

function normalizeModelDefinitionDE(payload = {}) {
  const values = normalizeRuntimeValuesDE(payload?.values)
  return {
    id: String(payload?.id || `${MODEL_DEFINITION_CODE_DE}-local`),
    code: MODEL_DEFINITION_CODE_DE,
    schema_version: MODEL_DEFINITION_SCHEMA_VERSION,
    status: normalizeStatusValue(payload?.status),
    reference: String(payload?.reference || ''),
    values,
    source: payload?.source && typeof payload.source === 'object' ? { ...payload.source } : null,
    updated_at: String(payload?.updated_at || new Date().toISOString()),
  }
}

function normalizeRapportTemplateDE(payload = {}) {
  const template = payload?.template && typeof payload.template === 'object' ? payload.template : {}
  return {
    id: String(payload?.id || `${MODEL_DEFINITION_CODE_DE_RAPPORT}-${Date.now()}`),
    code: MODEL_DEFINITION_CODE_DE_RAPPORT,
    schema_version: MODEL_DEFINITION_SCHEMA_VERSION,
    status: normalizeStatusValue(payload?.status),
    reference: String(payload?.reference || ''),
    template: { ...template },
    updated_at: String(payload?.updated_at || new Date().toISOString()),
  }
}

function readRapportModelsDE() {
  const raw = readStorageObject(RAPPORT_MODELS_DE_STORAGE_KEY, [])
  return Array.isArray(raw) ? raw : []
}

function writeRapportModelsDE(models) {
  writeStorageObject(RAPPORT_MODELS_DE_STORAGE_KEY, Array.isArray(models) ? models : [])
}

function migrateLegacySingleRapportModelIfNeeded() {
  const list = readRapportModelsDE()
  if (list.length > 0) return

  const definitions = readModelDefinitions()
  const legacySingle = definitions[MODEL_DEFINITION_CODE_DE_RAPPORT]
  if (!legacySingle) return

  const normalized = normalizeRapportTemplateDE(legacySingle)
  writeRapportModelsDE([normalized])
  delete definitions[MODEL_DEFINITION_CODE_DE_RAPPORT]
  writeModelDefinitions(definitions)
}

function readModelDefinitions() {
  return readStorageObject(MODEL_DEFINITIONS_STORAGE_KEY, {})
}

function writeModelDefinitions(definitionsByCode) {
  writeStorageObject(MODEL_DEFINITIONS_STORAGE_KEY, definitionsByCode)
}

export function getModelDefinitionDE() {
  return listModelDefinitionsDE()[0] || null
}

export function listModelDefinitionsDE() {
  const definitions = readModelDefinitions()
  const entry = definitions[MODEL_DEFINITION_CODE_DE]
  const list = Array.isArray(entry)
    ? entry
    : entry && typeof entry === 'object'
      ? [entry]
      : []
  return list
    .map((item) => normalizeModelDefinitionDE(item))
    .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
}

export function listApprovedModelDefinitionsDE() {
  return listModelDefinitionsDE().filter((item) => item.status === 'approved')
}

export function upsertModelDefinitionDE(payload) {
  const definitions = readModelDefinitions()
  const normalized = normalizeModelDefinitionDE(payload)
  const existing = listModelDefinitionsDE()
  const index = existing.findIndex((item) => String(item?.id) === String(normalized.id))
  if (index >= 0) {
    existing[index] = normalized
  } else {
    existing.unshift(normalized)
  }
  definitions[MODEL_DEFINITION_CODE_DE] = existing
  writeModelDefinitions(definitions)
  return normalized
}

export function getRapportModelDefinitionDE() {
  migrateLegacySingleRapportModelIfNeeded()
  const models = readRapportModelsDE().map((item) => normalizeRapportTemplateDE(item))
  return models[0] || null
}

export function listRapportModelDefinitionsDE() {
  migrateLegacySingleRapportModelIfNeeded()
  return readRapportModelsDE()
    .map((item) => normalizeRapportTemplateDE(item))
    .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
}

export function listApprovedRapportModelDefinitionsDE() {
  return listRapportModelDefinitionsDE().filter((item) => item.status === 'approved')
}

export function upsertRapportModelDefinitionDE(payload) {
  const normalized = normalizeRapportTemplateDE(payload)
  const models = listRapportModelDefinitionsDE()
  const index = models.findIndex((item) => String(item?.id) === String(normalized.id))
  if (index >= 0) {
    models[index] = normalized
  } else {
    models.unshift(normalized)
  }
  writeRapportModelsDE(models)
  return normalized
}

export function getApprovedRapportModelDefinitionDE() {
  return listApprovedRapportModelDefinitionsDE()[0] || null
}

export function getRapportModelDefinitionDEById(id) {
  if (!id) return null
  return listRapportModelDefinitionsDE().find((item) => String(item.id) === String(id)) || null
}

export function deleteModelDefinitionDE() {
  const definitions = readModelDefinitions()
  const rapportModels = readRapportModelsDE()
  if (!definitions[MODEL_DEFINITION_CODE_DE] && !definitions[MODEL_DEFINITION_CODE_DE_RAPPORT] && rapportModels.length === 0) return
  delete definitions[MODEL_DEFINITION_CODE_DE]
  delete definitions[MODEL_DEFINITION_CODE_DE_RAPPORT]
  writeModelDefinitions(definitions)
  writeRapportModelsDE([])
}

export function deleteModelDefinitionDEById(id) {
  const targetId = String(id || '').trim()
  if (!targetId) return false

  const definitions = readModelDefinitions()
  const existing = listModelDefinitionsDE()
  if (!existing.length) return false

  const next = existing.filter((item) => String(item?.id || '') !== targetId)
  if (next.length === existing.length) return false

  definitions[MODEL_DEFINITION_CODE_DE] = next
  writeModelDefinitions(definitions)
  return true
}

export function migrateLegacyDeDraftIfNeeded() {
  const existing = getModelDefinitionDE()
  if (existing) return { model: existing, migrated: false }

  const legacy = safeParseJson(localStorage.getItem(LEGACY_DE_STORAGE_KEY))
  if (!legacy) return { model: null, migrated: false }

  const migrated = upsertModelDefinitionDE({
    reference: String(legacy?.reference || ''),
    values: legacy?.values && typeof legacy.values === 'object' ? legacy.values : {},
    source: legacy?.source && typeof legacy.source === 'object' ? legacy.source : null,
    status: 'draft',
  })
  return { model: migrated, migrated: true }
}

function readWorkDocuments() {
  const raw = readStorageObject(WORK_DOCUMENTS_STORAGE_KEY, [])
  return Array.isArray(raw) ? raw : []
}

function writeWorkDocuments(documents) {
  writeStorageObject(WORK_DOCUMENTS_STORAGE_KEY, Array.isArray(documents) ? documents : [])
}

function normalizeWorkDocumentDE(payload = {}) {
  const now = new Date().toISOString()
  return {
    id: String(payload?.id || `work-de-${Date.now()}`),
    code: MODEL_DEFINITION_CODE_DE,
    schema_version: MODEL_DEFINITION_SCHEMA_VERSION,
    model_definition_id: String(payload?.model_definition_id || ''),
    model_version: Number(payload?.model_version || MODEL_DEFINITION_SCHEMA_VERSION),
    source_essai_uid: payload?.source_essai_uid == null ? null : Number(payload.source_essai_uid),
    source_terrain_uid: payload?.source_terrain_uid == null ? null : Number(payload.source_terrain_uid),
    rapport_model_definition_id: String(payload?.rapport_model_definition_id || ''),
    rapport_model_version: payload?.rapport_model_version == null ? null : Number(payload.rapport_model_version),
    runtime_values: normalizeRuntimeValuesDE(payload?.runtime_values || {}),
    work_status: Object.values(WORK_STATUS_DE).includes(String(payload?.work_status || ''))
      ? String(payload.work_status)
      : WORK_STATUS_DE.DRAFT,
    review_notes: String(payload?.review_notes || ''),
    reviewed_by: String(payload?.reviewed_by || ''),
    reviewed_at: payload?.reviewed_at ? String(payload.reviewed_at) : null,
    validated_by: String(payload?.validated_by || ''),
    validated_at: payload?.validated_at ? String(payload.validated_at) : null,
    created_at: String(payload?.created_at || now),
    updated_at: String(payload?.updated_at || now),
  }
}

export function createWorkDocumentDE({
  modelDefinitionId,
  modelVersion,
  runtimeValues = {},
  sourceEssaiUid = null,
  sourceTerrainUid = null,
  rapportModelDefinitionId = '',
  rapportModelVersion = null,
}) {
  const docs = readWorkDocuments()
  const document = normalizeWorkDocumentDE({
    id: `work-de-${Date.now()}`,
    model_definition_id: String(modelDefinitionId || ''),
    model_version: Number(modelVersion || MODEL_DEFINITION_SCHEMA_VERSION),
    source_essai_uid: sourceEssaiUid == null ? null : Number(sourceEssaiUid),
    source_terrain_uid: sourceTerrainUid == null ? null : Number(sourceTerrainUid),
    rapport_model_definition_id: String(rapportModelDefinitionId || ''),
    rapport_model_version: rapportModelVersion == null ? null : Number(rapportModelVersion),
    runtime_values: normalizeRuntimeValuesDE(runtimeValues),
    work_status: WORK_STATUS_DE.DRAFT,
  })
  writeWorkDocuments([...docs, document])
  return document
}

export function createWorkDocumentDEFromModel(modelDefinition) {
  const normalizedModel = normalizeModelDefinitionDE(modelDefinition || {})
  return createWorkDocumentDE({
    modelDefinitionId: normalizedModel.id,
    modelVersion: normalizedModel.schema_version,
    runtimeValues: normalizedModel.values,
    rapportModelDefinitionId: '',
    rapportModelVersion: null,
  })
}

export function updateWorkDocumentDE(id, updates = {}) {
  const docs = readWorkDocuments()
  let updated = null
  const next = docs.map((doc) => {
    if (String(doc?.id) !== String(id)) return doc
    updated = {
      ...normalizeWorkDocumentDE(doc),
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
        ? normalizeRuntimeValuesDE(updates.runtime_values)
        : (doc?.runtime_values || {}),
      work_status: updates.work_status && Object.values(WORK_STATUS_DE).includes(String(updates.work_status))
        ? String(updates.work_status)
        : (doc?.work_status || WORK_STATUS_DE.DRAFT),
      review_notes: updates.review_notes != null ? String(updates.review_notes) : String(doc?.review_notes || ''),
      reviewed_by: updates.reviewed_by != null ? String(updates.reviewed_by) : String(doc?.reviewed_by || ''),
      reviewed_at: updates.reviewed_at != null ? (updates.reviewed_at ? String(updates.reviewed_at) : null) : (doc?.reviewed_at || null),
      validated_by: updates.validated_by != null ? String(updates.validated_by) : String(doc?.validated_by || ''),
      validated_at: updates.validated_at != null ? (updates.validated_at ? String(updates.validated_at) : null) : (doc?.validated_at || null),
      updated_at: new Date().toISOString(),
    }
    return updated
  })
  writeWorkDocuments(next)
  return updated
}

export function deleteWorkDocumentDE(id) {
  const docs = readWorkDocuments()
  const before = docs.length
  const next = docs.filter((doc) => String(doc?.id) !== String(id))
  if (next.length === before) return false
  writeWorkDocuments(next)
  return true
}

export function listWorkDocumentsDE() {
  return readWorkDocuments()
    .filter((doc) => String(doc?.code || '').toUpperCase() === MODEL_DEFINITION_CODE_DE)
    .map((doc) => normalizeWorkDocumentDE(doc))
    .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
}

export function getWorkDocumentDE(id) {
  return listWorkDocumentsDE().find((doc) => String(doc?.id) === String(id)) || null
}

export function findWorkDocumentDEBySourceEssaiUid(essaiUid) {
  const uid = Number(essaiUid)
  if (!Number.isFinite(uid)) return null
  return listWorkDocumentsDE().find((doc) => Number(doc?.source_essai_uid) === uid) || null
}

export function findWorkDocumentDEBySourceTerrainUid(terrainUid) {
  const uid = Number(terrainUid)
  if (!Number.isFinite(uid)) return null
  return listWorkDocumentsDE().find((doc) => Number(doc?.source_terrain_uid) === uid) || null
}

function normalizeRuntimePublicationDE(payload = {}) {
  const now = new Date().toISOString()
  const modelSnapshot = payload?.model_snapshot && typeof payload.model_snapshot === 'object'
    ? payload.model_snapshot
    : null
  const rapportSnapshot = payload?.rapport_snapshot && typeof payload.rapport_snapshot === 'object'
    ? payload.rapport_snapshot
    : null
  return {
    code: MODEL_DEFINITION_CODE_DE,
    work_document_id: String(payload?.work_document_id || ''),
    model_definition_id: String(payload?.model_definition_id || ''),
    rapport_model_definition_id: String(payload?.rapport_model_definition_id || ''),
    model_snapshot: modelSnapshot,
    rapport_snapshot: rapportSnapshot,
    published_at: String(payload?.published_at || now),
    updated_at: String(payload?.updated_at || now),
  }
}

export function getRuntimePublicationDE() {
  // NOTE:
  // Global DE publication for current phase. This should evolve to a generic getRuntimePublicationByCode(code).
  const record = readStorageObject(RUNTIME_PUBLICATION_DE_STORAGE_KEY, null)
  if (!record || typeof record !== 'object') return null
  return normalizeRuntimePublicationDE(record)
}

export function publishRuntimeDE(payload = {}) {
  // NOTE:
  // Stores the active approved DE package (work doc + model/rapport snapshots) consumed by runtime.
  // Future step: generic publisher keyed by essai code.
  const normalized = normalizeRuntimePublicationDE(payload)
  if (!normalized.work_document_id) return null
  writeStorageObject(RUNTIME_PUBLICATION_DE_STORAGE_KEY, normalized)
  return normalized
}
