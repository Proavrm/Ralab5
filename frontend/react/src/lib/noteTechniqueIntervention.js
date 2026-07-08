export const NOTE_TECHNIQUE_TYPE = 'Note technique'
export const NOTE_TECHNIQUE_NATURE = 'Note technique'
export const NOTE_TECHNIQUE_STATUTS = [
  'Planifiée',
  'En rédaction',
  'En validation',
  'Envoyée',
  'Clôturée',
  'Annulée',
]

export function toDateInputValue(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return text.slice(0, 10)
}

export function buildNoteTechniqueLifecyclePayload({
  dateDebut = '',
  statut = '',
  dateFin = '',
  dateEnvoi = '',
} = {}) {
  return {
    date_intervention: dateDebut || null,
    statut: statut || 'Planifiée',
    date_fin: dateFin || null,
    date_envoi: dateEnvoi || null,
  }
}

export function isNoteTechniqueIntervention(item) {
  if (!item) return false
  if (item.is_demande_scope === true) return true
  const type = String(item.type_intervention || item.kind || '').toLowerCase()
  const nature = String(item.nature_reelle || '').toLowerCase()
  const ref = String(item.reference || item.ref || '').toUpperCase()
  return type.includes('note technique')
    || nature.includes('note technique')
    || /-\d+-[A-Z0-9]+-NT\d+$/i.test(ref)
    || /-NT\d+$/i.test(ref)
}

export function collectInterventionCandidates({ campaigns = [], interventions = [] } = {}) {
  const items = []
  const seen = new Set()
  for (const campaign of campaigns || []) {
    for (const intervention of campaign.interventions || []) {
      const key = String(intervention.uid || intervention.id || '')
      if (!key || seen.has(key)) continue
      seen.add(key)
      items.push(intervention)
    }
  }
  for (const intervention of interventions || []) {
    const key = String(intervention.uid || intervention.id || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    items.push(intervention)
  }
  return items
}

export function findNoteTechniqueIntervention({
  campaigns = [],
  interventions = [],
  notesTechniques = [],
} = {}) {
  for (const item of notesTechniques || []) {
    if (isNoteTechniqueIntervention(item)) return item
  }
  return collectInterventionCandidates({ campaigns, interventions }).find(isNoteTechniqueIntervention) || null
}

export function isNoteTechniqueCancelled(item) {
  return String(item?.statut || '').trim() === 'Annulée'
}

export function buildNoteTechniqueCreatePayload({
  demandeUid,
  preparation = {},
  demande = {},
  campaign = null,
}) {
  const zone = String(campaign?.zone_scope || preparation.zone_localisation || demande.chantier || '').trim()
  const objectif = String(
    preparation.objectif_mission || preparation.objectifs || campaign?.designation || demande.nature || '',
  ).trim()
  const responsable = String(
    preparation.responsable_referent || campaign?.responsable_technique || '',
  ).trim()

  return {
    demande_id: Number(demandeUid),
    type_intervention: NOTE_TECHNIQUE_TYPE,
    sujet: objectif
      ? `Note technique — ${objectif.slice(0, 120)}`
      : 'Note technique synthétique',
    finalite: objectif || 'Cadrage méthodologique et présentation de la démarche',
    zone,
    geotechnicien: responsable,
    technicien: responsable,
    statut: 'Planifiée',
  }
}
