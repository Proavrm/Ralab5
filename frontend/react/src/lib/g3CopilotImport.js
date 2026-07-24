/**
 * Import JSON Copilot → mission G3 (schema ralab5.g3.import.v1).
 * Peut aussi créer affaire + demande si absentes.
 */
import { affairesApi, demandesApi, g3Api } from '@/services/api'

export const G3_IMPORT_SCHEMA = 'ralab5.g3.import.v1'
const RALAB_AFFAIRE_REF_RE = /^\d{4}-[A-Z]{2,4}-\d{2,5}$/i
const RALAB_DEMANDE_REF_RE = /^\d{4}-[A-Z]{2,4}-D\d{3,5}$/i

export function extractJsonPayload(rawText) {
  const text = String(rawText || '').trim()
  if (!text) throw new Error('Collez le JSON Copilot.')

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1].trim() : text

  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1))
    }
    throw new Error('JSON invalide.')
  }
}

export function parseG3CopilotImport(rawText) {
  const data = extractJsonPayload(rawText)
  const schema = String(data?.schema_version || '')
  if (!schema.startsWith('ralab5.g3.import')) {
    throw new Error(`Schéma attendu: ${G3_IMPORT_SCHEMA} (reçu: ${schema || '—'})`)
  }
  return data
}

function nonEmpty(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}

function pickString(value) {
  const text = String(value ?? '').trim()
  return text || undefined
}

function normalizeRef(value) {
  return String(value || '').trim().toUpperCase()
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function getExternalRefs(payload) {
  return payload?.mission?.external_refs || {}
}

function guessLaboCode(payload, fallback = 'SP') {
  const fromMission = String(payload?.mission?.laboratoire || '').trim().toUpperCase()
  if (/^[A-Z]{2,4}$/.test(fromMission)) return fromMission
  const demandeRef = String(getExternalRefs(payload).demande_reference || '').trim()
  const match = demandeRef.match(/^\d{4}-([A-Z]{2,4})-D/i)
  if (match) return match[1].toUpperCase()
  return fallback
}

function extractLookupRefs(payload) {
  const refs = getExternalRefs(payload)
  const candidates = [
    refs.affaire_ralab,
    refs.demande_ralab,
    refs.demande_reference,
    refs.dst_reference,
    refs.affaire_client,
    refs.commune,
    refs.adresse,
    ...(Array.isArray(refs.autres) ? refs.autres : []),
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean)

  // Repérer aussi une réf. RaLab noyée dans un texte libre.
  const embedded = []
  for (const value of candidates) {
    const found = value.match(/\b\d{4}-[A-Z]{2,4}-(?:D\d{3,5}|\d{2,5})\b/gi) || []
    embedded.push(...found)
  }

  let affaireRef = ''
  let demandeRef = ''

  // Champs dédiés en priorité.
  if (RALAB_AFFAIRE_REF_RE.test(String(refs.affaire_ralab || '').trim())) {
    affaireRef = String(refs.affaire_ralab).trim().toUpperCase()
  }
  if (RALAB_DEMANDE_REF_RE.test(String(refs.demande_ralab || '').trim())) {
    demandeRef = String(refs.demande_ralab).trim().toUpperCase()
  }

  for (const value of [...candidates, ...embedded]) {
    const token = String(value || '').trim()
    if (!demandeRef && RALAB_DEMANDE_REF_RE.test(token)) demandeRef = token.toUpperCase()
    if (!affaireRef && RALAB_AFFAIRE_REF_RE.test(token) && !RALAB_DEMANDE_REF_RE.test(token)) {
      affaireRef = token.toUpperCase()
    }
  }
  return { affaireRef, demandeRef }
}

function pickNumeroDst(refs = {}) {
  const demandeRef = String(refs.demande_reference || '').trim()
  const dstRef = String(refs.dst_reference || '').trim()
  // CET / DST métier — pas une référence affaire RaLab.
  if (demandeRef && !RALAB_AFFAIRE_REF_RE.test(demandeRef) && !RALAB_DEMANDE_REF_RE.test(demandeRef)) {
    return demandeRef
  }
  if (dstRef && !RALAB_AFFAIRE_REF_RE.test(dstRef) && !RALAB_DEMANDE_REF_RE.test(dstRef)) {
    return dstRef
  }
  if (/^CET/i.test(demandeRef) || /^CET/i.test(dstRef)) {
    return demandeRef || dstRef
  }
  return ''
}

export function summarizeG3Import(data) {
  const mission = data?.mission || {}
  const refs = extractLookupRefs(data)
  const media = Array.isArray(data?.media_assets) ? data.media_assets : []
  const mediaFound = media.filter((m) => m?.found_in_source).length
  const mediaMissing = media.filter((m) => m && m.found_in_source === false).length
  const hasSituation = media.some((m) => String(m?.role || '') === 'plan_situation')
  const hasImplantation = media.some((m) => String(m?.role || '') === 'plan_implantation')
  const situationMissing = media.some((m) => String(m?.role || '') === 'plan_situation' && m.found_in_source === false)
  const implantationMissing = media.some((m) => String(m?.role || '') === 'plan_implantation' && m.found_in_source === false)
  return {
    title: mission.title || '—',
    client: mission.client || '—',
    chantier: mission.chantier || '—',
    lookupAffaireRef: refs.affaireRef || '',
    lookupDemandeRef: refs.demandeRef || '',
    missionTypes: Array.isArray(mission.mission_types) ? mission.mission_types.length : 0,
    zones: Array.isArray(data?.zones) ? data.zones.length : 0,
    documents: Array.isArray(data?.documents) ? data.documents.length : 0,
    objectives: Array.isArray(data?.objectives) ? data.objectives.length : 0,
    interventions: Array.isArray(data?.interventions_planned) ? data.interventions_planned.length : 0,
    holdPoints: Array.isArray(data?.hold_points_suggested) ? data.hold_points_suggested.length : 0,
    mediaTotal: media.length,
    mediaFound,
    mediaMissing,
    hasSituation,
    hasImplantation,
    situationMissing,
    implantationMissing,
    confidence: typeof data?.confidence_global === 'number' ? data.confidence_global : null,
    warnings: Array.isArray(data?.warnings) ? data.warnings.filter(Boolean) : [],
    missingCritical: Array.isArray(data?.missing_critical) ? data.missing_critical.filter(Boolean) : [],
  }
}

function mediaRoleToDocumentType(role, suggested) {
  const fromSuggested = pickString(suggested)
  if (fromSuggested) return fromSuggested
  const map = {
    plan_situation: 'Plan de situation',
    plan_implantation: "Plan d'implantation",
    plan_terrassement: 'Plans terrassement',
    plan_exe: 'Plans EXE',
    coupe_profil: 'Coupes / profils',
    vue_en_plan: 'Plans PRO',
    photo_chantier: 'Photos',
    photo_desordre: 'Photos',
    schema: 'Autre',
    autre_visuel: 'Autre',
  }
  return map[String(role || '')] || 'Autre'
}

function documentIdentityKey(doc) {
  return [
    String(doc?.type || '').trim().toLowerCase(),
    String(doc?.reference || '').trim().toLowerCase(),
    String(doc?.name || '').trim().toLowerCase(),
  ].join('|')
}

/** Fusionne media_assets → documents[] (sans doublon) pour l’import G3. */
export function mergeMediaAssetsIntoDocuments(payload) {
  const documents = Array.isArray(payload?.documents) ? [...payload.documents] : []
  const existing = new Set(documents.map(documentIdentityKey))
  for (const asset of payload?.media_assets || []) {
    if (!asset) continue
    const type = mediaRoleToDocumentType(asset.role, asset.suggested_document_type)
    const name = pickString(asset.title)
      || pickString(asset.source_filename)
      || type
    const reference = [
      pickString(asset.source_filename),
      pickString(asset.source_page) ? `p.${pickString(asset.source_page)}` : null,
    ].filter(Boolean).join(' · ')
    const row = {
      temp_zone_id: null,
      type,
      name,
      reference,
      version: '',
      document_date: null,
      author: '',
      received: Boolean(asset.found_in_source),
      analyzed: Boolean(asset.found_in_source),
      used_in_report: false,
      observations: [
        pickString(asset.description),
        pickString(asset.role) ? `role=${asset.role}` : null,
        pickString(asset.ralab_action) ? `action=${asset.ralab_action}` : null,
        asset.found_in_source === false
          ? (pickString(asset.missing_reason) || 'À fournir / capturer dans RaLab')
          : null,
      ].filter(Boolean).join(' · '),
    }
    const key = documentIdentityKey(row)
    if (existing.has(key)) continue
    existing.add(key)
    documents.push(row)
  }
  return { ...payload, documents }
}

async function findAffaireByReference(reference) {
  const ref = String(reference || '').trim()
  if (!ref) return null
  const rows = await affairesApi.list({ search: ref })
  const needle = normalizeRef(ref)
  return (rows || []).find((row) => normalizeRef(row.reference) === needle) || null
}

async function findDemandeByReference(reference) {
  const ref = String(reference || '').trim()
  if (!ref) return null
  const rows = await demandesApi.list({ search: ref })
  const needle = normalizeRef(ref)
  return (rows || []).find((row) => normalizeRef(row.reference) === needle) || null
}

function buildAffaireCreateBody(payload, reference) {
  const mission = payload?.mission || {}
  const refs = getExternalRefs(payload)
  const client = pickString(mission.client) || 'Non communiqué'
  const chantier = pickString(mission.chantier) || pickString(mission.title) || 'Non communiqué'
  return {
    reference,
    client,
    chantier,
    site: pickString(refs.commune) || '',
    adresse_ouvrage: pickString(mission.location) || pickString(refs.adresse) || '',
    maitre_ouvrage: pickString(mission.moa) || '',
    maitre_oeuvre: pickString(mission.moe) || '',
    responsable: pickString(mission.rst_responsible) || '',
    autre_reference: [
      pickString(refs.affaire_client),
      pickString(refs.dst_reference) && !RALAB_AFFAIRE_REF_RE.test(String(refs.dst_reference || ''))
        ? pickString(refs.dst_reference)
        : null,
    ].filter(Boolean).join(' · ') || '',
    date_ouverture: todayIso(),
    statut: 'À qualifier',
  }
}

function buildDemandeCreateBody(payload, affaireRstId, laboCode) {
  const mission = payload?.mission || {}
  const refs = getExternalRefs(payload)
  const types = Array.isArray(mission.mission_types) ? mission.mission_types.filter(Boolean) : []
  return {
    affaire_rst_id: Number(affaireRstId),
    labo_code: laboCode || 'SP',
    statut: 'À qualifier',
    priorite: 'Normale',
    type_mission: types.includes('Contrôle chantier') || types.length
      ? 'Exploitation G3'
      : 'À définir',
    nature: pickString(mission.title) || pickString(mission.chantier) || '',
    type_prestation_attendue: pickString(mission.main_objective) || '',
    description: pickString(mission.description) || '',
    numero_dst: pickNumeroDst(refs),
    demandeur: pickString(mission.conducteur) || pickString(mission.moe) || '',
    date_reception: todayIso(),
    service_interne: pickString(mission.laboratoire) || '',
  }
}

/**
 * Résout ou crée affaire + demande à partir du JSON Copilot.
 * @returns {{ affaire, demande, createdAffaire: boolean, createdDemande: boolean }}
 */
export async function resolveOrCreateAffaireDemandeFromImport({
  payload,
  affaireId = null,
  laboCode = 'SP',
} = {}) {
  const refs = extractLookupRefs(payload)
  const resolvedLabo = guessLaboCode(payload, laboCode)

  let affaire = null
  let createdAffaire = false
  if (affaireId != null && String(affaireId).trim() !== '') {
    affaire = await affairesApi.get(affaireId)
  } else if (refs.affaireRef) {
    affaire = await findAffaireByReference(refs.affaireRef)
  }

  if (!affaire) {
    const next = await affairesApi.nextRef()
    const reference = next?.reference
    if (!reference) throw new Error('Impossible d’obtenir la prochaine référence affaire.')
    affaire = await affairesApi.create(buildAffaireCreateBody(payload, reference))
    createdAffaire = true
  }

  const affaireUid = affaire.uid ?? affaire.id
  let demande = null
  let createdDemande = false

  if (refs.demandeRef) {
    const found = await findDemandeByReference(refs.demandeRef)
    if (found) {
      const foundAffaireId = found.affaire_rst_id ?? found.affaire_id
      if (foundAffaireId != null && Number(foundAffaireId) !== Number(affaireUid)) {
        throw new Error(
          `La demande ${refs.demandeRef} existe déjà sur une autre affaire.`,
        )
      }
      demande = found
    }
  }

  if (!demande) {
    demande = await demandesApi.create(buildDemandeCreateBody(payload, affaireUid, resolvedLabo))
    createdDemande = true
  }

  return { affaire, demande, createdAffaire, createdDemande }
}

function buildMissionPatch(mission = {}) {
  const patch = {}
  const fields = [
    'title', 'client', 'chantier', 'location', 'status',
    'description', 'main_objective',
    'conducteur', 'chef_chantier', 'rst_responsible',
    'laboratoire', 'lab_intervenant', 'geotechnicien_externe',
    'moa', 'moe', 'bureau_controle',
    'start_date', 'end_date',
  ]
  fields.forEach((key) => {
    const value = mission[key]
    if (value == null) return
    if (typeof value === 'string' && !value.trim()) return
    patch[key] = typeof value === 'string' ? value.trim() : value
  })
  if (Array.isArray(mission.mission_types) && mission.mission_types.length) {
    patch.mission_types = mission.mission_types.map((t) => String(t).trim()).filter(Boolean)
  }
  return patch
}

function resolveZoneId(tempZoneId, zoneMap) {
  if (tempZoneId == null || tempZoneId === '') return null
  const key = String(tempZoneId)
  return zoneMap[key] ?? null
}

/**
 * Applique un import Copilot sur une demande (crée ou met à jour la mission G3).
 * @returns {{ mission, created, counts }}
 */
export async function applyG3CopilotImport({ demandeId, payload, preferMissionId = null }) {
  const id = Number(demandeId)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('Demande cible invalide.')
  }

  payload = mergeMediaAssetsIntoDocuments(payload)

  const existing = await g3Api.listByDemande(id)
  let mission = null
  let created = false

  if (preferMissionId) {
    mission = (existing || []).find((m) => Number(m.id) === Number(preferMissionId)) || null
  }
  if (!mission && Array.isArray(existing) && existing.length) {
    mission = existing[0]
  }
  if (!mission) {
    const missionBody = {
      demande_id: id,
      ...buildMissionPatch(payload.mission || {}),
    }
    mission = await g3Api.createMission(missionBody)
    created = true
  } else {
    const patch = buildMissionPatch(payload.mission || {})
    if (Object.keys(patch).length) {
      mission = await g3Api.updateMission(mission.id, patch)
    } else {
      mission = await g3Api.getMission(mission.id)
    }
  }

  const missionId = mission.id
  const zoneMap = {}
  const counts = {
    zones: 0,
    documents: 0,
    objectives: 0,
    interventions: 0,
    holdPoints: 0,
  }

  for (const zone of payload.zones || []) {
    if (!zone || (!nonEmpty(zone.name) && !nonEmpty(zone.type))) continue
    const createdZone = await g3Api.createZone(missionId, {
      name: pickString(zone.name) || 'Zone',
      type: pickString(zone.type) || 'Autre',
      description: pickString(zone.description) || '',
      location: pickString(zone.location) || '',
      status: pickString(zone.status) || '',
      risk_level: pickString(zone.risk_level) || 'Faible',
      responsible: pickString(zone.responsible) || '',
      observations: pickString(zone.observations) || '',
    })
    if (zone.temp_id != null) zoneMap[String(zone.temp_id)] = createdZone.id
    counts.zones += 1
  }

  for (const doc of payload.documents || []) {
    if (!doc || (!nonEmpty(doc.name) && !nonEmpty(doc.reference) && !nonEmpty(doc.type))) continue
    await g3Api.createDocument(missionId, {
      zone_id: resolveZoneId(doc.temp_zone_id, zoneMap),
      type: pickString(doc.type) || 'Autre',
      name: pickString(doc.name) || pickString(doc.reference) || 'Document',
      reference: pickString(doc.reference) || '',
      version: pickString(doc.version) || '',
      document_date: pickString(doc.document_date) || null,
      author: pickString(doc.author) || '',
      received: Boolean(doc.received),
      analyzed: Boolean(doc.analyzed),
      used_in_report: Boolean(doc.used_in_report),
      observations: pickString(doc.observations) || '',
    })
    counts.documents += 1
  }

  for (const objective of payload.objectives || []) {
    if (!objective || !nonEmpty(objective.label)) continue
    await g3Api.createObjective(missionId, {
      zone_id: resolveZoneId(objective.temp_zone_id, zoneMap),
      label: pickString(objective.label),
      description: pickString(objective.description) || '',
      priority: pickString(objective.priority) || 'Moyenne',
      status: pickString(objective.status) || 'À faire',
      responsible: pickString(objective.responsible) || '',
      expected_result: pickString(objective.expected_result) || '',
      comments: pickString(objective.comments) || '',
    })
    counts.objectives += 1
  }

  for (const item of payload.interventions_planned || []) {
    if (!item || (!nonEmpty(item.type) && !nonEmpty(item.objective))) continue
    await g3Api.addProgrammeItem(missionId, {
      zone_id: resolveZoneId(item.temp_zone_id, zoneMap),
      type: pickString(item.type) || 'Visite initiale chantier',
      objective: pickString(item.objective) || '',
      means: pickString(item.means) || '',
      responsible: pickString(item.responsible) || '',
      prerequisites: pickString(item.prerequisites) || '',
      date: pickString(item.date) || null,
      status: pickString(item.status) || 'À prévoir',
      expected_deliverable: pickString(item.expected_deliverable) || '',
      comments: pickString(item.comments) || '',
    })
    counts.interventions += 1
  }

  for (const hp of payload.hold_points_suggested || []) {
    if (!hp || (!nonEmpty(hp.label) && !nonEmpty(hp.code))) continue
    await g3Api.createHoldPoint(missionId, {
      zone_id: resolveZoneId(hp.temp_zone_id, zoneMap),
      code: pickString(hp.code) || '',
      label: pickString(hp.label) || pickString(hp.code) || 'Point d’arrêt',
      description: pickString(hp.description) || '',
      due_date: pickString(hp.due_date) || null,
      observations: pickString(hp.comments) || '',
      requires_tests: Boolean(hp.requires_tests),
      requires_notice: Boolean(hp.requires_notice),
    })
    counts.holdPoints += 1
  }

  const refreshed = await g3Api.getMission(missionId)
  return { mission: refreshed, created, counts }
}

/**
 * Chaîne complète : (crée) affaire + demande + mission G3 + contenu.
 */
export async function applyG3CopilotImportFull({
  payload,
  demandeId = null,
  affaireId = null,
  createMissing = false,
  laboCode = 'SP',
  preferMissionId = null,
} = {}) {
  let resolvedDemandeId = demandeId
  let createdAffaire = false
  let createdDemande = false
  let affaire = null
  let demande = null

  if (!resolvedDemandeId) {
    if (!createMissing) {
      throw new Error('Demande cible invalide.')
    }
    const resolved = await resolveOrCreateAffaireDemandeFromImport({
      payload,
      affaireId,
      laboCode,
    })
    affaire = resolved.affaire
    demande = resolved.demande
    createdAffaire = resolved.createdAffaire
    createdDemande = resolved.createdDemande
    resolvedDemandeId = demande.uid ?? demande.id
  }

  const result = await applyG3CopilotImport({
    demandeId: resolvedDemandeId,
    payload,
    preferMissionId,
  })

  return {
    ...result,
    affaire,
    demande,
    createdAffaire,
    createdDemande,
  }
}
