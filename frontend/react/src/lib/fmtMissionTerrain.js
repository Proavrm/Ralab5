import { DIRECT_ESSAI_TEMPLATE_BY_CODE } from '@/lib/directEssaiTemplates'
import {
  MISSION_DOCUMENT_ESSAI_BY_CODE,
  missionEssaiFromDocumentEntry,
} from '@/lib/missionDocumentEssaiCodes'
import { buildAffaireContactDisplayLabel } from '@/lib/affaireContacts'

export function parseInterventionObservations(raw) {
  if (!raw || typeof raw !== 'string') return {}
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return {}
  try {
    const parsed = JSON.parse(trimmed)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeMissionEssaiItem(source) {
  if (!source) return null

  if (typeof source === 'string') {
    const trimmed = source.trim()
    if (!trimmed) return null
    const byCode = DIRECT_ESSAI_TEMPLATE_BY_CODE[trimmed.toUpperCase()]
    const template = byCode || null
    return {
      code: template?.code || '',
      label: template?.label || trimmed,
      norme: template?.norme || '',
    }
  }

  if (typeof source !== 'object') return null

  const rawCode = String(source.code || source.essai_code || '').trim().toUpperCase()
  const documentEntry = MISSION_DOCUMENT_ESSAI_BY_CODE[rawCode] || null
  if (documentEntry) return missionEssaiFromDocumentEntry(documentEntry)

  const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[rawCode] || null
  const label = String(source.label || source.type_essai || template?.label || rawCode || '').trim()
  const norme = String(source.norme || template?.norme || '').trim()
  if (!label && !rawCode) return null

  return {
    code: template?.code || rawCode || '',
    label: label || template?.label || rawCode,
    norme,
  }
}

export function normalizeMissionEssaiList(rawValue, fallbackText = '') {
  const directItems = Array.isArray(rawValue) ? rawValue : []
  const fallbackItems = !directItems.length && typeof fallbackText === 'string' && fallbackText.trim()
    ? fallbackText.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
    : []

  return [...directItems, ...fallbackItems]
    .map((item) => normalizeMissionEssaiItem(item))
    .filter(Boolean)
}

export function formatMissionEssaiLine(item) {
  if (!item) return ''
  const code = String(item.code || '').trim()
  const label = String(item.label || '').trim()
  const norme = String(item.norme || '').trim()
  const main = code && label && label.toUpperCase() !== code
    ? `${code} — ${label}`
    : (label || code)
  return norme ? `${main} (${norme})` : main
}

export function buildAnnuaireContactMap(contacts = []) {
  const map = new Map()
  for (const contact of contacts || []) {
    if (contact?.id == null) continue
    map.set(String(contact.id), contact)
  }
  return map
}

function contactLineFromAnnuaireRecord(contact) {
  if (!contact) return ''
  return String(contact.display_label || buildAffaireContactDisplayLabel(contact)).trim()
}

export function resolveInterventionContactLine(intervention, contactById = null) {
  if (!intervention) return ''
  const obs = parseInterventionObservations(intervention.observations)
  const contactId = String(obs.prep_contact_id || intervention.prep_contact_id || '').trim()

  if (contactId && contactById?.has(contactId)) {
    return contactLineFromAnnuaireRecord(contactById.get(contactId))
  }

  const structuredLabel = buildAffaireContactDisplayLabel({
    full_name: obs.prep_contact_name || intervention.prep_contact_name || '',
    role_label: obs.prep_contact_role || intervention.prep_contact_role || '',
    organisation: obs.prep_contact_organisation || intervention.prep_contact_organisation || '',
    phone: obs.prep_contact_phone || intervention.prep_contact_phone || '',
    email: obs.prep_contact_email || intervention.prep_contact_email || '',
    notes: obs.prep_contact_notes || intervention.prep_contact_notes || '',
  })
  if (structuredLabel) return structuredLabel

  return String(obs.prep_contact_chantier || intervention.prep_contact_chantier || '').trim()
}

export function enrichInterventionForFmt(intervention, contactById = null) {
  if (!intervention) return null
  const obs = parseInterventionObservations(intervention.observations)
  const missionEssais = normalizeMissionEssaiList(
    obs.mission_essais_prevus,
    obs.prep_essais_a_effectuer || '',
  )
  const prepContactChantier = resolveInterventionContactLine(intervention, contactById)

  return {
    ...intervention,
    prep_contact_id: String(obs.prep_contact_id || intervention.prep_contact_id || '').trim(),
    prep_contact_chantier: prepContactChantier,
    prep_plan_prevention: String(obs.prep_plan_prevention || intervention.prep_plan_prevention || '').trim(),
    prep_contraintes_acces: String(obs.prep_contraintes_acces || intervention.prep_contraintes_acces || '').trim(),
    prep_points_a_realiser: String(obs.prep_points_a_realiser || '').trim(),
    mission_essais_prevus: missionEssais,
    zone: String(intervention.zone || obs.zone_intervention || '').trim(),
    finalite: String(
      intervention.finalite
      || intervention.finalite_intervention
      || obs.finalite_intervention
      || '',
    ).trim(),
    objectif_intervention: String(
      intervention.objectif_intervention
      || obs.objectif_intervention
      || intervention.objectif
      || obs.objectif
      || '',
    ).trim(),
  }
}

export function resolveFmtCommune({ demande = null, affaire = null } = {}) {
  return String(
    affaire?.site
    || demande?.site
    || '',
  ).trim()
}

function normalizeLookupToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

function parseCommuneParts(commune = '') {
  const raw = String(commune || '').trim()
  const match = raw.match(/^(.+?)\s*\((\d{2,5})\)\s*$/)
  if (match) {
    return { label: raw, city: match[1].trim(), postal: match[2] }
  }
  return { label: raw, city: raw, postal: '' }
}

export function resolveFmtAdresseOuvrage({
  commune = '',
  adresseOuvrage = '',
  geocodeLabel = '',
} = {}) {
  const raw = String(adresseOuvrage || geocodeLabel || '').trim()
  if (!raw) return ''

  const { city, postal } = parseCommuneParts(commune)
  if (!city && !postal) return raw

  const cityToken = normalizeLookupToken(city)
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  const kept = parts.filter((part) => {
    const token = normalizeLookupToken(part)
    if (cityToken && token === cityToken) return false
    if (postal && (part.includes(postal) || token === postal)) return false
    if (/^\d{5}$/.test(part)) return false
    if (/^france/i.test(part)) return false
    if (/m[ée]tropolitaine/i.test(part)) return false
    if (token === 'auvergne-rhone-alpes') return false
    if (token === 'isere' || token === 'rhone') return false
    return true
  })

  return kept.join(', ').trim() || raw
}

export function resolveFmtLocalisation({
  demande = null,
  affaire = null,
  geocodeLabel = '',
} = {}) {
  const commune = resolveFmtCommune({ demande, affaire })
  const adresse = resolveFmtAdresseOuvrage({
    commune,
    adresseOuvrage: affaire?.adresse_ouvrage || demande?.adresse_ouvrage || '',
    geocodeLabel,
  })
  return { commune, adresse }
}

export function resolveFmtTechnicienLabel({
  isJourneeMode = false,
  missionTechnicien = '',
  interventions = [],
} = {}) {
  if (isJourneeMode) {
    return String(missionTechnicien || '').trim() || 'Sans technicien'
  }
  const item = enrichInterventionForFmt(interventions[0])
  return String(
    item?.technicien
    || item?.geotechnicien
    || missionTechnicien
    || '',
  ).trim()
}

export function buildFmtProgrammeRows(interventions = [], contactById = null) {
  return (interventions || [])
    .map((item) => enrichInterventionForFmt(item, contactById))
    .filter(Boolean)
    .map((item) => ({
      uid: item.uid,
      reference: item.reference || '',
      type: item.type_intervention || '',
      zone: item.zone || '',
      objet: item.objectif_intervention || item.sujet || '',
      essais: item.mission_essais_prevus.map(formatMissionEssaiLine).filter(Boolean),
      points: item.prep_points_a_realiser || '',
    }))
}

export function collectTerrainContactLines(interventions = [], contactById = null) {
  const lines = []
  const seen = new Set()
  for (const raw of interventions) {
    const item = enrichInterventionForFmt(raw, contactById)
    const contact = String(item?.prep_contact_chantier || '').trim()
    if (!contact) continue
    const key = contact.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const ref = String(item.reference || '').trim()
    lines.push(ref ? `${ref} — ${contact}` : contact)
  }
  return lines
}

export function buildFmtMissionConsignes() {
  return [
    'EPI et consignes sécurité entreprise / chantier.',
    'Photos systématiques sur site.',
    'Procédures internes DST / NGE.',
    'En cas d\'accident : 112.',
  ]
}

export function resolveFmtTerrainContacts({
  demande = null,
  affaire = null,
  interventions = [],
  annuaireContacts = [],
} = {}) {
  const contactById = buildAnnuaireContactMap(annuaireContacts)
  const enriched = (interventions || []).map((item) => enrichInterventionForFmt(item, contactById)).filter(Boolean)
  const contactLines = collectTerrainContactLines(enriched, contactById)
  const planPrevention = enriched
    .map((item) => String(item.prep_plan_prevention || '').trim())
    .find(Boolean) || ''
  const contraintesAcces = enriched
    .map((item) => String(item.prep_contraintes_acces || '').trim())
    .find(Boolean) || ''

  return {
    contactChantier: contactLines.join('\n'),
    demandeur: String(demande?.demandeur || '').trim(),
    responsableDossier: String(affaire?.responsable || demande?.responsable_affaire || '').trim(),
    planPrevention,
    contraintesAcces,
    consignes: buildFmtMissionConsignes(),
  }
}

function normalizeFmtReadinessIntervention(raw) {
  if (!raw) return null
  return {
    ...raw,
    uid: raw.uid,
    reference: String(raw.reference || raw.ref || '').trim(),
    observations: raw.observations || '',
  }
}

export function buildFmtMissionReadinessWarnings(interventions = [], annuaireContacts = []) {
  const contactById = buildAnnuaireContactMap(annuaireContacts)
  const missingContact = []
  const missingEssais = []

  for (const raw of interventions || []) {
    const item = enrichInterventionForFmt(normalizeFmtReadinessIntervention(raw), contactById)
    if (!item) continue
    const ref = item.reference || `#${item.uid}`
    if (!item.prep_contact_chantier) missingContact.push(ref)
    if (!item.mission_essais_prevus?.length) missingEssais.push(ref)
  }

  return { missingContact, missingEssais }
}

export function formatFmtMissionReadinessConfirmMessage({
  missingContact = [],
  missingEssais = [],
} = {}) {
  if (!missingContact.length && !missingEssais.length) return ''

  const lines = ['La feuille mission sera incomplète :', '']
  if (missingContact.length) {
    lines.push(`• Contact chantier / accès manquant sur l'intervention : ${missingContact.join(', ')}`)
  }
  if (missingEssais.length) {
    lines.push(`• Essais prévus non renseignés : ${missingEssais.join(', ')}`)
  }
  lines.push('', 'Compléter dans l\'intervention puis régénérer, ou continuer quand même ?')
  return lines.join('\n')
}

export function confirmFmtMissionGeneration(interventions = [], annuaireContacts = []) {
  const warnings = buildFmtMissionReadinessWarnings(interventions, annuaireContacts)
  const message = formatFmtMissionReadinessConfirmMessage(warnings)
  if (!message) return true
  return window.confirm(message)
}

function normalizePersonLookupKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function resolveTechnicienPhoneFromDirectory(label, users = []) {
  const key = normalizePersonLookupKey(label)
  if (!key || key === 'sans technicien') return ''

  for (const user of users || []) {
    const candidates = [user?.display_name, user?.signature_display_name].filter(Boolean)
    if (candidates.some((name) => normalizePersonLookupKey(name) === key)) {
      return String(user?.phone || '').trim()
    }
  }
  return ''
}
