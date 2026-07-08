/**
 * Codes documents mission (VC…) — zone source distincte, fusionnée dans essaiCodesCatalog / rst_codes.
 * Sélection manuelle uniquement dans le picker « Essais à réaliser » (pas de pré-remplissage auto en UI).
 */

export const MISSION_DOCUMENT_ESSAI_CODES = [
  {
    code: 'VC',
    label: 'Feuille de visite chantier',
    norme: '',
  },
]

export const MISSION_DOCUMENT_ESSAI_BY_CODE = MISSION_DOCUMENT_ESSAI_CODES.reduce((accumulator, entry) => {
  accumulator[entry.code] = entry
  return accumulator
}, {})

export function isMissionDocumentEssaiCode(code) {
  return Boolean(MISSION_DOCUMENT_ESSAI_BY_CODE[String(code || '').trim().toUpperCase()])
}

export function missionEssaiFromDocumentEntry(entry) {
  if (!entry) return null
  return {
    code: entry.code,
    rst_code: entry.code,
    label: entry.label,
    norme: entry.norme || '',
  }
}

/** Filtre picker — même table que les essais RST ; libellé exige 3+ caractères (évite « de » → DE). */
export function filterMissionDocumentEssaiCodes(searchQuery = '') {
  const query = String(searchQuery || '').trim().toLowerCase()
  if (query.length < 2) return MISSION_DOCUMENT_ESSAI_CODES

  return MISSION_DOCUMENT_ESSAI_CODES.filter((entry) => {
    const code = entry.code.toLowerCase()
    const label = entry.label.toLowerCase()
    const norme = String(entry.norme || '').toLowerCase()
    if (code.includes(query)) return true
    if (norme.includes(query)) return true
    if (query.length >= 3 && label.includes(query)) return true
    return false
  })
}
