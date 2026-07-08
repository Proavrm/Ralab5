export const PLAN_SITUATION_TYPE = 'Plan de situation'
export const ITINERARY_TYPE = 'Itinéraire'
export const PLANS_TYPE = 'Plans'

export const PLAN_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
]

export const ACCEPTED_PLAN_SITUATION_EXTENSIONS = [
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tif',
  '.tiff',
]

export const DEFAULT_DOCUMENT_DROP_TYPES = [
  'CCTP',
  'Plans',
  PLAN_SITUATION_TYPE,
  ITINERARY_TYPE,
  'Planning travaux',
  'Mémoire technique',
  'Programme essais',
  'Études existantes',
  'Rapports géotechniques',
  'CR de passation',
  'Variantes',
  'Documents marché',
  'Autre',
]

export function normalizeDocumentDropTypes(options = []) {
  const seen = new Set()
  const merged = []
  for (const value of [...(options || []), ...DEFAULT_DOCUMENT_DROP_TYPES]) {
    const label = String(value || '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(label)
  }
  return merged
}

export function fileExtension(name) {
  const text = String(name || '').trim().toLowerCase()
  const idx = text.lastIndexOf('.')
  if (idx <= 0) return ''
  return text.slice(idx)
}

export function isPlanSituationType(documentType) {
  return String(documentType || '').trim().toLowerCase() === PLAN_SITUATION_TYPE.toLowerCase()
}

export function isItineraryType(documentType) {
  return String(documentType || '').trim().toLowerCase() === ITINERARY_TYPE.toLowerCase()
}

export function isPlansType(documentType) {
  return String(documentType || '').trim().toLowerCase() === PLANS_TYPE.toLowerCase()
}

export function isPlanImageFile(file) {
  if (!file) return false
  const ext = fileExtension(file.name)
  return PLAN_IMAGE_EXTENSIONS.includes(ext)
}

export function needsPlanImageConversion(file) {
  if (!file) return false
  return !isPlanImageFile(file)
}

export function isAcceptedPlanSituationFile(file) {
  if (!file) return false
  const ext = fileExtension(file.name)
  return ACCEPTED_PLAN_SITUATION_EXTENSIONS.includes(ext)
}
