import { isPlanSituationType, isItineraryType, ITINERARY_TYPE, PLAN_SITUATION_TYPE } from '@/lib/documentDropCatalog'

export function ensurePlanSituationDocumentRow(documents = []) {
  const list = Array.isArray(documents) ? [...documents] : []
  if (list.some((doc) => isPlanSituationType(doc?.document_type))) {
    return list
  }
  return [
    {
      document_type: PLAN_SITUATION_TYPE,
      is_received: false,
      version: '',
      document_date: null,
      uploaded_at: null,
      comment: '',
      stored_path: '',
    },
    ...list,
  ]
}

export function ensureItineraryDocumentRow(documents = []) {
  const list = Array.isArray(documents) ? [...documents] : []
  if (list.some((doc) => isItineraryType(doc?.document_type))) {
    return list
  }
  const planIndex = list.findIndex((doc) => isPlanSituationType(doc?.document_type))
  const row = {
    document_type: ITINERARY_TYPE,
    is_received: false,
    version: '',
    document_date: null,
    uploaded_at: null,
    comment: '',
    stored_path: '',
  }
  if (planIndex >= 0) {
    const next = [...list]
    next.splice(planIndex + 1, 0, row)
    return next
  }
  return [...list, row]
}

export function ensureSiteCaptureDocumentRows(documents = []) {
  return ensureItineraryDocumentRow(ensurePlanSituationDocumentRow(documents))
}

export function findItineraryDocumentIndex(documents = []) {
  return (documents || []).findIndex((doc) => isItineraryType(doc?.document_type))
}

export function isPlanSituationDocument(doc) {
  return String(doc?.document_type || '').trim().toLowerCase() === PLAN_SITUATION_TYPE.toLowerCase()
}

export function hasPlanSituationFile(documents = []) {
  return (documents || []).some(
    (doc) => isPlanSituationDocument(doc) && String(doc?.stored_path || '').trim(),
  )
}

/** Adresse complète pour géocodage : rue (adresse ouvrage) + commune/CP (site). */
export function buildSiteGeocodeAddress({ adresseOuvrage = '', site = '' } = {}) {
  return buildGeocodeStreetQuery(adresseOuvrage, site)
}

/** Requête rue + commune/CP (numéro de rue optionnel). */
export function buildGeocodeStreetQuery(street = '', locality = '') {
  const streetText = String(street || '').trim()
  const localityText = String(locality || '').trim()
  if (streetText && localityText) {
    const streetLower = streetText.toLowerCase()
    const localityToken = localityText.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)[0]?.toLowerCase() || ''
    if (localityToken && streetLower.includes(localityToken)) {
      return `${streetText}, France`
    }
    return `${streetText}, ${localityText}, France`
  }
  if (streetText) return `${streetText}, France`
  return buildGeocodeLocalityQuery(localityText)
}

/** Requête commune / code postal seule. */
export function buildGeocodeLocalityQuery(locality = '') {
  const text = String(locality || '').trim()
  if (!text) return ''
  if (/,\s*france/i.test(text)) return text
  return `${text}, France`
}

export function combineAddressLabel(street = '', locality = '') {
  const streetText = String(street || '').trim()
  const localityText = String(locality || '').trim()
  if (streetText && localityText) return `${streetText}, ${localityText}`
  return streetText || localityText
}

export function validateSiteGeocodeQuery({ adresseOuvrage = '', site = '' } = {}) {
  if (!String(site || '').trim()) {
    return 'Renseignez le site (commune et code postal) sur l’affaire — requis pour localiser la carte.'
  }
  return ''
}

/** @deprecated alias — capture autorise rue sans numéro si le CP/commune est renseigné */
export function validateSiteCaptureQuery({ adresseOuvrage = '', site = '' } = {}) {
  return validateSiteGeocodeQuery({ adresseOuvrage, site })
}

export function validatePassationSitePlan({ adresseOuvrage, documents }) {
  if (!String(adresseOuvrage || '').trim()) {
    return 'Adresse ouvrage obligatoire (section Identité passation : rue et numéro).'
  }
  if (!hasPlanSituationFile(documents)) {
    return 'Plan de situation obligatoire : déposez le fichier ou capturez la carte dans le quadro C.'
  }
  return ''
}

export function validateDemandeSitePlan({ adresseOuvrage, documents, passationUid }) {
  if (!String(adresseOuvrage || '').trim()) {
    return 'Adresse ouvrage obligatoire (section Identité demande : rue et numéro).'
  }
  if (passationUid && hasPlanSituationFile(documents)) {
    return ''
  }
  if (!hasPlanSituationFile(documents)) {
    if (passationUid) {
      return 'Plan de situation manquant : vérifiez la passation ou complétez le quadro C de cette demande.'
    }
    return 'Plan de situation obligatoire : déposez le fichier ou capturez la carte dans le quadro C.'
  }
  return ''
}
