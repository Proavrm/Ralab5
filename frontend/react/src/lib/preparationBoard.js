import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { findNoteTechniqueIntervention, isNoteTechniqueIntervention } from '@/lib/noteTechniqueIntervention'
import { DIRECT_ESSAI_TEMPLATE_BY_CODE } from '@/lib/directEssaiTemplates'
import {
  buildGenericTerrainEssaiOpenPath,
  buildTerrainFeuilleOpenPath,
  createTerrainFeuilleForIntervention,
  isFeuilleTerrainEssaiCode,
  isGenericTerrainEssaiCode,
} from '@/lib/terrainFeuilleFromIntervention'

function normalizeNonEmpty(value) {
  return String(value || '').trim()
}

export function buildCreateInterventionHref({
  demandeUid,
  preparation = {},
  campaign = null,
  demande = {},
  returnTo,
}) {
  const params = new URLSearchParams()
  params.set('demande_id', String(demandeUid || ''))
  params.set('source', campaign?.uid ? 'campagne' : 'preparation')
  if (campaign?.uid) params.set('campaign_uid', String(campaign.uid))
  if (campaign?.reference) params.set('campaign_ref', campaign.reference)
  if (campaign?.code) params.set('campaign_code', campaign.code)
  if (campaign?.label) params.set('campaign_label', campaign.label)
  if (campaign?.designation) params.set('campaign_designation', campaign.designation)
  if (campaign?.zone_scope) params.set('campaign_zone', campaign.zone_scope)
  if (campaign?.responsable_technique) params.set('campaign_responsable', campaign.responsable_technique)
  if (campaign?.attribue_a) params.set('campaign_attribue_a', campaign.attribue_a)

  const zone = normalizeNonEmpty(campaign?.zone_scope) || normalizeNonEmpty(preparation?.zone_localisation)
  const objectif = normalizeNonEmpty(campaign?.designation) || normalizeNonEmpty(preparation?.objectif_mission) || normalizeNonEmpty(demande?.nature)
  const responsable = normalizeNonEmpty(campaign?.responsable_technique) || normalizeNonEmpty(preparation?.responsable_referent)
  const assignee = normalizeNonEmpty(campaign?.attribue_a) || normalizeNonEmpty(preparation?.attribue_a)

  if (normalizeNonEmpty(preparation?.type_intervention_prevu)) params.set('type_intervention', preparation.type_intervention_prevu)
  if (normalizeNonEmpty(preparation?.finalite)) params.set('finalite', preparation.finalite)
  if (zone) params.set('zone', zone)
  if (normalizeNonEmpty(preparation?.materiau_objet)) params.set('materiau', preparation.materiau_objet)
  if (objectif) params.set('objectif', objectif)
  if (responsable) params.set('responsable', responsable)
  if (assignee) params.set('attribue_a', assignee)

  return buildPathWithReturnTo(`/interventions/new?${params.toString()}`, returnTo)
}

export function collectInterventionsForBoard(campaigns = [], interventions = []) {
  const fromCampaigns = []
  campaigns.forEach((campaign) => {
    ;(campaign.interventions || []).forEach((item) => {
      fromCampaigns.push({
        ...item,
        campagne_uid: campaign.uid,
        campagne_reference: campaign.reference,
        campagne_label: campaign.label || campaign.code,
      })
    })
  })

  const seen = new Set(fromCampaigns.map((item) => String(item.uid)))
  const demandeScope = findNoteTechniqueIntervention({ campaigns, interventions })
  const demandeScopeEntries = demandeScope && !seen.has(String(demandeScope.uid))
    ? [{
      ...demandeScope,
      campagne_uid: null,
      campagne_reference: '',
      campagne_label: 'Demande',
      is_demande_scope: true,
    }]
    : []

  const orphans = (interventions || [])
    .filter((item) => item?.uid && !seen.has(String(item.uid)) && !isNoteTechniqueIntervention(item))
    .map((item) => ({
      uid: item.uid,
      reference: item.reference,
      date_intervention: item.date_intervention,
      type_intervention: item.type_intervention,
      sujet: item.sujet,
      statut: item.statut,
      campagne_uid: item.campagne_id || null,
      campagne_reference: item.campagne_reference || '',
      campagne_label: item.campagne_label || item.campagne_code || '',
    }))

  return {
    all: [...demandeScopeEntries, ...fromCampaigns, ...orphans],
    orphans,
    noteTechnique: demandeScope || null,
  }
}

export async function openEssaiCreation({
  essaiCode,
  intervention = null,
  echantillon = null,
  demande = {},
  preparation = {},
  campaignLabel = '',
  returnTo,
  navigate,
}) {
  const code = String(essaiCode || 'GEN').trim().toUpperCase()
  const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[code] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN

  if (intervention?.uid) {
    if (isGenericTerrainEssaiCode(code)) {
      navigate(buildPathWithReturnTo(
        buildGenericTerrainEssaiOpenPath({
          interventionId: Number(intervention.uid),
          code,
          interventionRef: intervention.reference || '',
          demandeRef: demande.reference || '',
          campagneRef: campaignLabel || intervention.campagne_reference || '',
          site: demande.chantier || demande.site || '',
          zone: preparation.zone_localisation || '',
          operateur: intervention.technicien || '',
          dateFeuille: intervention.date_intervention || '',
          returnTo,
        }),
        returnTo,
      ))
      return
    }

    if (isFeuilleTerrainEssaiCode(code)) {
      const { feuilleUid } = await createTerrainFeuilleForIntervention({
        interventionId: Number(intervention.uid),
        code,
        label: template.label,
        dateFeuille: intervention.date_intervention || '',
        operateur: intervention.technicien || '',
      })
      navigate(buildPathWithReturnTo(buildTerrainFeuilleOpenPath(feuilleUid, code), returnTo))
      return
    }

    const params = new URLSearchParams({
      intervention_id: String(intervention.uid),
      essai_code: template.code,
      type_essai: template.typeEssai,
    })
    if (intervention.reference) params.set('intervention_ref', intervention.reference)
    if (demande.reference) params.set('demande_ref', demande.reference)
    if (intervention.sujet || intervention.type_intervention) {
      params.set('intervention_subject', intervention.sujet || intervention.type_intervention)
    }
    navigate(buildPathWithReturnTo(`/essais/new?${params.toString()}`, returnTo))
    return
  }

  if (echantillon?.uid) {
    const params = new URLSearchParams({
      echantillon_id: String(echantillon.uid),
      essai_code: template.code,
      type_essai: template.typeEssai,
      norme: template.norme || '',
    })
    navigate(buildPathWithReturnTo(`/essais/new?${params.toString()}`, returnTo))
    return
  }

  throw new Error('Choisissez une intervention ou un échantillon pour créer l’essai.')
}
