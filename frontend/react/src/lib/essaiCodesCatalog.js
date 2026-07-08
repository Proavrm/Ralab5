/**
 * Catálogo unificado de codes essai — composition sans modifier directEssaiTemplates / laboEssaiTypes.
 * Utilisé consignes, validation tokens et affichage admin.
 */
import { DIRECT_ESSAI_TEMPLATES } from '@/lib/directEssaiTemplates'
import { LABO_ESSAI_TYPES } from '@/lib/laboEssaiTypes'
import { MISSION_DOCUMENT_ESSAI_CODES } from '@/lib/missionDocumentEssaiCodes'

/** Opérations avant essai (consignes) — distinctes des folhas labo actuelles. */
export const OPERATION_ESSAI_CODES = [
  { code: 'PREP', label: "Préparation d'échantillon / prise d'essai", domain: 'labo' },
  { code: 'PREL', label: 'Prélèvement / échantillonnage', domain: 'labo' },
]

function mergeCatalogEntries() {
  const byCode = new Map()

  DIRECT_ESSAI_TEMPLATES.forEach((item) => {
    byCode.set(item.code, {
      code: item.code,
      label: item.label,
      norme: item.norme || '',
      domain: 'terrain',
    })
  })

  LABO_ESSAI_TYPES.forEach((item) => {
    if (!byCode.has(item.code)) {
      byCode.set(item.code, {
        code: item.code,
        label: item.label,
        norme: item.norme || '',
        domain: 'labo',
      })
    }
  })

  OPERATION_ESSAI_CODES.forEach((item) => {
    if (!byCode.has(item.code)) {
      byCode.set(item.code, {
        code: item.code,
        label: item.label,
        norme: '',
        domain: item.domain || 'labo',
      })
    }
  })

  MISSION_DOCUMENT_ESSAI_CODES.forEach((item) => {
    if (!byCode.has(item.code)) {
      byCode.set(item.code, {
        code: item.code,
        label: item.label,
        norme: item.norme || '',
        domain: 'terrain',
      })
    }
  })

  return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code))
}

export const ESSAI_CODE_CATALOG = mergeCatalogEntries()

export const ESSAI_CODE_SET = new Set(ESSAI_CODE_CATALOG.map((entry) => entry.code))

export const ESSAI_CODE_BY_CODE = ESSAI_CODE_CATALOG.reduce((accumulator, entry) => {
  accumulator[entry.code] = entry
  return accumulator
}, {})

export function getEssaiCodeLabel(code) {
  const normalized = String(code || '').trim().toUpperCase()
  return ESSAI_CODE_BY_CODE[normalized]?.label || normalized || null
}

/** Payload aligné API rst_codes / admin dropdown. */
export function essaiCodeCatalogPayload() {
  return ESSAI_CODE_CATALOG.map(({ code, label, domain }) => ({ code, label, domain }))
}

const MISSION_DOCUMENT_CODE_SET = new Set(
  MISSION_DOCUMENT_ESSAI_CODES.map((entry) => String(entry.code || '').trim().toUpperCase()),
)

/** Codes terrain du référentiel app (hors documents mission VC…). */
export const TERRAIN_ESSAI_PICKER_CODES = ESSAI_CODE_CATALOG.filter(
  (entry) => entry.domain === 'terrain'
    && !MISSION_DOCUMENT_CODE_SET.has(entry.code)
    && entry.code !== 'GEN',
)

export function filterTerrainEssaiCodes(searchQuery = '', { includeAll = false } = {}) {
  const query = String(searchQuery || '').trim().toLowerCase()
  if (!query) return includeAll ? TERRAIN_ESSAI_PICKER_CODES : []
  if (query.length < 2) return includeAll ? TERRAIN_ESSAI_PICKER_CODES : []

  return TERRAIN_ESSAI_PICKER_CODES.filter((entry) => {
    const code = entry.code.toLowerCase()
    const label = entry.label.toLowerCase()
    if (code.includes(query)) return true
    if (query.length >= 3 && label.includes(query)) return true
    return false
  })
}

export function missionEssaiFromEssaiCodeEntry(entry) {
  if (!entry) return null
  return {
    code: entry.code,
    rst_code: entry.code,
    label: entry.label,
    norme: entry.norme || '',
  }
}
