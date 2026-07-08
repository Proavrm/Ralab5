import { isItineraryType, isPlanSituationType } from '@/lib/documentDropCatalog'
import { confirmFmtMissionGeneration } from '@/lib/fmtMissionTerrain'
import { affairesApi, api } from '@/services/api'

/** @deprecated use MISSION_TERRAIN_FICHE_TITLE */
export const SITE_ACCESS_RAPPORT_TITLE = 'FICHE DE MISSION TERRAIN'
/** @deprecated use MISSION_TERRAIN_FICHE_SUBTITLE */
export const SITE_ACCESS_RAPPORT_SUBTITLE = 'Mission · Accès · Implantation'

export const MISSION_TERRAIN_FICHE_TITLE = SITE_ACCESS_RAPPORT_TITLE
export const MISSION_TERRAIN_FICHE_SUBTITLE = SITE_ACCESS_RAPPORT_SUBTITLE
export const MISSION_TERRAIN_FICHE_BUTTON_LABEL = 'Fiche de mission terrain'
export const MISSION_JOURNEE_BUTTON_LABEL = 'Générer feuille mission'

/** @deprecated use MISSION_TERRAIN_FICHE_TITLE */
export const INTERVENTION_TERRAIN_FICHE_TITLE = MISSION_TERRAIN_FICHE_TITLE
/** @deprecated use MISSION_TERRAIN_FICHE_SUBTITLE */
export const INTERVENTION_TERRAIN_FICHE_SUBTITLE = MISSION_TERRAIN_FICHE_SUBTITLE
/** @deprecated use MISSION_TERRAIN_FICHE_BUTTON_LABEL */
export const INTERVENTION_TERRAIN_FICHE_BUTTON_LABEL = MISSION_TERRAIN_FICHE_BUTTON_LABEL

export function findPlanSituationDocument(documents = []) {
  return (documents || []).find(
    (doc) => isPlanSituationType(doc?.document_type) && String(doc?.stored_path || '').trim(),
  ) || null
}

export function findItineraryDocument(documents = []) {
  return (documents || []).find(
    (doc) => isItineraryType(doc?.document_type) && String(doc?.stored_path || '').trim(),
  ) || null
}

export function buildSiteAccessRapportPath({
  demandeUid,
  campagneUid = '',
  interventionUid = '',
  missionDate = '',
  technicien = '',
  returnTo = '',
  embed = false,
  hideToolbar = false,
  autoprint = false,
} = {}) {
  const id = String(demandeUid || '').trim()
  if (!id) return ''
  const params = new URLSearchParams()
  if (String(campagneUid || '').trim()) params.set('campagne_uid', String(campagneUid).trim())
  if (String(interventionUid || '').trim()) params.set('intervention_uid', String(interventionUid).trim())
  if (String(missionDate || '').trim()) params.set('mission_date', String(missionDate).trim())
  if (technicien != null && String(technicien).trim()) {
    params.set('technicien', String(technicien).trim())
  } else if (String(missionDate || '').trim()) {
    params.set('technicien', 'Sans technicien')
  }
  if (String(returnTo || '').trim()) params.set('return_to', String(returnTo).trim())
  if (embed) params.set('embed', '1')
  if (hideToolbar) params.set('hide_toolbar', '1')
  if (autoprint) params.set('autoprint', '1')
  const qs = params.toString()
  return `/rapports/acces-chantier/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`
}

export async function openSiteAccessRapport(options = {}) {
  const {
    interventions,
    annuaireContacts = null,
    skipReadinessCheck = false,
    demandeUid,
    ...rest
  } = options

  if (!skipReadinessCheck && Array.isArray(interventions) && interventions.length) {
    let contacts = Array.isArray(annuaireContacts) ? annuaireContacts : null
    if (!contacts && String(demandeUid || '').trim()) {
      try {
        const demande = await api.get(`/demandes_rst/${String(demandeUid).trim()}`)
        const affaireUid = demande?.affaire_rst_id
        if (affaireUid) {
          contacts = await affairesApi.listContacts(affaireUid)
        }
      } catch {
        contacts = []
      }
    }
    if (!confirmFmtMissionGeneration(interventions, contacts || [])) return
  }
  const isJournee = Boolean(String(rest.missionDate || '').trim())
  const path = buildSiteAccessRapportPath({
    ...rest,
    embed: rest.embed ?? isJournee,
    hideToolbar: rest.hideToolbar ?? isJournee,
  })
  if (!path) return
  window.open(path, '_blank', 'noopener,noreferrer')
}

export function resolvePlanImplantationImage(plan) {
  if (!plan) return ''
  const payload = plan.payload && typeof plan.payload === 'object' ? plan.payload : {}
  const canvasByFeuille = payload.canvas_by_feuille && typeof payload.canvas_by_feuille === 'object'
    ? payload.canvas_by_feuille
    : null
  if (canvasByFeuille) {
    for (const entry of Object.values(canvasByFeuille)) {
      const imagePath = String(entry?.image_path || '').trim()
      if (imagePath) return imagePath
    }
  }
  const legacyCanvas = payload.canvas && typeof payload.canvas === 'object' ? payload.canvas : null
  if (legacyCanvas?.image_path) return String(legacyCanvas.image_path).trim()
  return String(plan.fond_plan || payload.fond_plan || '').trim()
}

export function countPlanImplantationPoints(plan) {
  const payload = plan?.payload && typeof plan.payload === 'object' ? plan.payload : {}
  const canvasByFeuille = payload.canvas_by_feuille && typeof payload.canvas_by_feuille === 'object'
    ? payload.canvas_by_feuille
    : null
  if (canvasByFeuille) {
    return Object.values(canvasByFeuille).reduce(
      (total, entry) => total + (Array.isArray(entry?.points) ? entry.points.length : 0),
      0,
    )
  }
  const legacyPoints = payload.canvas?.points
  if (Array.isArray(legacyPoints)) return legacyPoints.length
  return Array.isArray(plan?.points) ? plan.points.length : 0
}
