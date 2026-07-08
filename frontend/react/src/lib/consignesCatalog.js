/** Catálogo consignes — livrables / critères (essais = competency_catalog via API). */

import { ESSAI_CODE_SET } from '@/lib/essaiCodesCatalog'

export const ESSAIS_CONSIGNES_FIELD = 'types_essais_prevus'

export const CONSIGNES_FIELD_CATALOGS = {
  livrables_attendus: {
    groups: [
      {
        title: 'Restitution',
        items: [
          { code: 'NOTE_TECH', label: 'Note technique' },
          { code: 'DIAG_CH', label: 'Diagnostic chaussée' },
          { code: 'RAP_DEFL', label: 'Rapport déflexions' },
          { code: 'BILAN', label: 'Bilan comparatif' },
        ],
      },
      {
        title: 'Terrain / plans',
        items: [
          { code: 'PV_SOND', label: 'PV sondages' },
          { code: 'PLAN_LOC', label: 'Plans localisation' },
          { code: 'PV_MO', label: 'PV mise en œuvre' },
        ],
      },
      {
        title: 'Mesures',
        items: [
          { code: 'RES_PMT', label: 'Résultats PMT' },
          { code: 'RES_ADH', label: 'Résultats adhérence' },
          { code: 'RES_ACO', label: 'Résultats acoustique' },
          { code: 'RES_SURF', label: 'Résultats surfaciques (PMT/adh/acoust.)' },
        ],
      },
    ],
  },
  criteres_conformite: {
    groups: [
      {
        title: 'Marché / qualité',
        items: [
          { code: 'CCTP', label: 'CCTP' },
          { code: 'PAQ', label: 'PAQ' },
          { code: 'FORM_VAL', label: 'Formulation validée' },
        ],
      },
      {
        title: 'Protocole / validation',
        items: [
          { code: 'CIRR', label: 'Protocole CIRR' },
          { code: 'MOE_MOA', label: 'Validation MOE/MOA' },
          { code: 'NON_BIAIS', label: 'Comparaison témoin/RARx non biaisée' },
        ],
      },
    ],
  },
}

export const CONSIGNES_FIELD_KEYS = [
  ESSAIS_CONSIGNES_FIELD,
  'livrables_attendus',
  'criteres_conformite',
]

const RST_CODE_SET = ESSAI_CODE_SET

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase()
}

function flattenGroups(groups = []) {
  return (groups || []).flatMap((group) => group.items || [])
}

export function resolveCatalogGroups(fieldKey, essaisCatalogGroups = []) {
  if (fieldKey === ESSAIS_CONSIGNES_FIELD) {
    return essaisCatalogGroups || []
  }
  return CONSIGNES_FIELD_CATALOGS[fieldKey]?.groups || []
}

export function getConsignesStorageCode(item) {
  if (!item) return ''
  const code = String(item.code || '').trim()
  // Préserve la compétence / norme (PREP, PREL, GR… partagés entre plusieurs entrées).
  if (code.startsWith('id:')) return code
  if (item.rst_code) return String(item.rst_code).trim().toUpperCase()
  return code
}

export function getCatalogItem(fieldKey, storageCode, essaisCatalogGroups = []) {
  const catalog = flattenGroups(resolveCatalogGroups(fieldKey, essaisCatalogGroups))
  const raw = String(storageCode || '').trim()
  if (!raw) return null

  if (raw.startsWith('id:')) {
    const competencyId = raw.slice(3)
    return catalog.find((item) => String(item.competency_id) === competencyId) || null
  }

  const normalized = normalizeToken(raw)

  if (fieldKey === ESSAIS_CONSIGNES_FIELD) {
    const byRst = catalog.find((item) => item.rst_code && normalizeToken(item.rst_code) === normalized)
    if (byRst) return byRst
  }

  const byExact = catalog.find((item) => String(item.code || '').trim() === raw)
  if (byExact) return byExact

  const byNormalizedCode = catalog.find((item) => normalizeToken(item.code) === normalized)
  if (byNormalizedCode) return byNormalizedCode

  if (fieldKey === ESSAIS_CONSIGNES_FIELD) {
    return catalog.find((item) => item.reference
      && normalizeToken(item.reference) === normalized) || null
  }

  return catalog.find((item) => normalizeToken(item.code) === normalized) || null
}

export function isEssaiItemSelected(item, selectedStorageCodes = []) {
  const selected = new Set((selectedStorageCodes || []).map((code) => normalizeToken(code)))
  if (selected.has(normalizeToken(getConsignesStorageCode(item)))) return true
  if (item.rst_code && selected.has(normalizeToken(item.rst_code))) return true
  if (selected.has(normalizeToken(item.code))) return true
  return false
}

export function parseConsignesSelection(fieldKey, raw = '', essaisCatalogGroups = []) {
  const catalog = flattenGroups(resolveCatalogGroups(fieldKey, essaisCatalogGroups))
  const text = String(raw || '').trim()
  if (!text) return { codes: [], unknown: [] }

  const codes = []
  const unknown = []
  const seen = new Set()

  function addStorageCode(storageCode) {
    const normalized = normalizeToken(storageCode)
    if (!normalized || seen.has(normalized)) return
    if (fieldKey === ESSAIS_CONSIGNES_FIELD) {
      if (RST_CODE_SET.has(normalized)) {
        seen.add(normalized)
        codes.push(normalized)
        return
      }
      const item = getCatalogItem(fieldKey, storageCode, essaisCatalogGroups)
      if (item) {
        const resolved = getConsignesStorageCode(item)
        const resolvedNormalized = normalizeToken(resolved)
        if (resolvedNormalized && !seen.has(resolvedNormalized)) {
          seen.add(resolvedNormalized)
          codes.push(resolved)
        }
        return
      }
    } else {
      const item = getCatalogItem(fieldKey, storageCode, essaisCatalogGroups)
      if (item) {
        seen.add(normalized)
        codes.push(item.code)
        return
      }
    }
    if (!unknown.includes(storageCode)) unknown.push(storageCode)
  }

  text.split(/[,;|/]+/).map((part) => part.trim()).filter(Boolean).forEach((token) => {
    if (fieldKey === ESSAIS_CONSIGNES_FIELD && RST_CODE_SET.has(normalizeToken(token))) {
      addStorageCode(token)
      return
    }

    const byStorage = catalog.find((item) => normalizeToken(getConsignesStorageCode(item)) === normalizeToken(token))
    if (byStorage) {
      addStorageCode(getConsignesStorageCode(byStorage))
      return
    }

    const byId = catalog.find((item) => token.startsWith('id:')
      && String(item.competency_id) === token.slice(3))
    if (byId) {
      addStorageCode(byId.code)
      return
    }

    const byReference = catalog.find((item) => item.reference
      && normalizeToken(item.reference) === normalizeToken(token))
    if (byReference) {
      addStorageCode(getConsignesStorageCode(byReference))
      return
    }

    const byAlias = catalog.find((item) => (item.aliases || []).some(
      (alias) => normalizeToken(alias) === normalizeToken(token),
    ))
    if (byAlias) {
      addStorageCode(getConsignesStorageCode(byAlias))
      return
    }

    const byLabel = catalog.find((item) => item.label.toLowerCase() === token.toLowerCase())
    if (byLabel) {
      addStorageCode(getConsignesStorageCode(byLabel))
      return
    }

    if (!unknown.includes(token)) unknown.push(token)
  })

  return { codes, unknown }
}

export function serializeConsignesSelection(fieldKey, codes = [], essaisCatalogGroups = []) {
  const cleaned = [...new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean))]
  return cleaned
    .map((code) => {
      if (fieldKey === ESSAIS_CONSIGNES_FIELD && RST_CODE_SET.has(normalizeToken(code))) {
        return normalizeToken(code)
      }
      const item = getCatalogItem(fieldKey, code, essaisCatalogGroups)
      return item ? getConsignesStorageCode(item) : code
    })
    .join(', ')
}

export function filterGroupsToSelected(groups = [], selectedStorageCodes = [], fieldKey = '') {
  const selected = new Set((selectedStorageCodes || []).map((code) => normalizeToken(code)))
  if (!selected.size) return []

  if (fieldKey === ESSAIS_CONSIGNES_FIELD) {
    const catalog = flattenGroups(groups)
    const seenRst = new Set()
    const items = []
    selectedStorageCodes.forEach((storageCode) => {
      const normalized = normalizeToken(storageCode)
      if (RST_CODE_SET.has(normalized)) {
        if (seenRst.has(normalized)) return
        const match = catalog.find((item) => normalizeToken(item.rst_code) === normalized)
          || getCatalogItem(fieldKey, storageCode, groups)
        if (match) {
          seenRst.add(normalized)
          items.push(match)
        }
        return
      }
      const item = getCatalogItem(fieldKey, storageCode, groups)
      if (item) items.push(item)
    })
    if (!items.length) return []
    return [{ title: 'Sélection amont', items }]
  }

  return (groups || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => selected.has(normalizeToken(item.code))),
    }))
    .filter((group) => group.items.length > 0)
}

export function getEssaiDisplayParts(item, rstCodeCatalog = []) {
  if (!item) return { code: '', label: '', reference: '', title: '' }
  const reference = String(item.reference || '').trim()
  const rstCode = String(item.rst_code || '').trim().toUpperCase()
  const rstLabel = String(item.rst_label || '').trim()
    || rstCodeCatalog.find((entry) => normalizeToken(entry.code) === normalizeToken(rstCode))?.label
    || ''
  const code = rstCode || (String(item.code || '').startsWith('id:') ? `#${String(item.code).slice(3)}` : '')
  const title = rstCode && rstLabel ? rstLabel : String(item.label || '').trim()
  return {
    code,
    label: String(item.label || '').trim(),
    reference,
    title,
    rstCode,
    rstLabel,
  }
}

function essaiSingleTokenMatches(item, groupTitle, token) {
  const normalizedToken = normalizeSearch(token)
  if (!normalizedToken) return true

  const upperToken = normalizedToken.toUpperCase()
  if (RST_CODE_SET.has(upperToken)) {
    return normalizeToken(item.rst_code) === upperToken
  }

  const parts = getEssaiDisplayParts(item)
  const label = normalizeSearch(parts.label)
  const reference = normalizeSearch(parts.reference)
  const group = normalizeSearch(groupTitle)
  const domain = normalizeSearch(item.domain)
  const contextType = normalizeSearch(item.context_type)
  const rstLabel = normalizeSearch(parts.rstLabel)

  if (item.rst_code && normalizeSearch(item.rst_code) === normalizedToken) return true
  if (rstLabel.includes(normalizedToken)) return true
  if ((item.aliases || []).some((alias) => normalizeSearch(alias) === normalizedToken)) return true
  if (normalizedToken.length >= 4 && reference.includes(normalizedToken)) return true
  if (normalizedToken.length >= 3 && label.includes(normalizedToken)) return true
  if (normalizedToken.length >= 3 && group.includes(normalizedToken)) return true
  if (normalizedToken.length >= 3 && domain.includes(normalizedToken)) return true
  if (normalizedToken.length >= 3 && contextType.includes(normalizedToken)) return true

  return false
}

export function essaiItemMatchesSearch(item, groupTitle, query) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return true

  const parts = getEssaiDisplayParts(item)
  const reference = normalizeSearch(parts.reference)
  const label = normalizeSearch(parts.label)
  const rstLabel = normalizeSearch(parts.rstLabel)

  if (normalizedQuery.length >= 5) {
    if (reference.includes(normalizedQuery)) return true
    if (label.includes(normalizedQuery)) return true
    if (rstLabel.includes(normalizedQuery)) return true
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (tokens.length === 1) {
    return essaiSingleTokenMatches(item, groupTitle, tokens[0])
  }

  return tokens.every((token) => essaiSingleTokenMatches(item, groupTitle, token))
}

export function filterEssaiGroupsBySearch(groups = [], query = '') {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return groups
  return (groups || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => essaiItemMatchesSearch(item, group.title, normalizedQuery)),
    }))
    .filter((group) => group.items.length > 0)
}

export function catalogItemMatchesSearch(item, groupTitle, query) {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return true
  const haystack = normalizeSearch([
    item.code,
    item.label,
    groupTitle,
  ].filter(Boolean).join(' '))
  return haystack.includes(normalizedQuery)
    || normalizedQuery.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token))
}

export function filterCatalogGroupsBySearch(groups = [], query = '') {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return groups
  return (groups || [])
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((item) => catalogItemMatchesSearch(item, group.title, normalizedQuery)),
    }))
    .filter((group) => group.items.length > 0)
}

export function formatConsignesPreview(fieldKey, raw = '', essaisCatalogGroups = [], max = 72, rstCodeCatalog = []) {
  const { codes, unknown } = parseConsignesSelection(fieldKey, raw, essaisCatalogGroups)
  const labels = codes.map((code) => {
    const item = getCatalogItem(fieldKey, code, essaisCatalogGroups)
    if (fieldKey === ESSAIS_CONSIGNES_FIELD) {
      if (RST_CODE_SET.has(normalizeToken(code))) {
        const rstLabel = rstCodeCatalog.find((entry) => normalizeToken(entry.code) === normalizeToken(code))?.label
        return rstLabel ? `${normalizeToken(code)} · ${rstLabel}` : normalizeToken(code)
      }
      if (item) {
        const parts = getEssaiDisplayParts(item, rstCodeCatalog)
        if (parts.code && parts.title) return `${parts.code} · ${parts.title}`
        return parts.title || parts.label || code
      }
    }
    return item?.label || code
  }).concat(unknown).filter(Boolean)
  if (!labels.length) return 'À compléter — cliquer pour sélectionner'
  const text = labels.join(' · ')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function countConsignesFilled(values = {}, essaisCatalogGroups = []) {
  return CONSIGNES_FIELD_KEYS.filter((key) => {
    const groups = key === ESSAIS_CONSIGNES_FIELD ? essaisCatalogGroups : undefined
    const { codes, unknown } = parseConsignesSelection(key, values[key], groups)
    return codes.length > 0 || unknown.length > 0
  }).length
}

export function toggleEssaiStorageCode(item, selectedStorageCodes = []) {
  const storageCode = getConsignesStorageCode(item)
  const normalized = normalizeToken(storageCode)
  const current = [...selectedStorageCodes]
  const index = current.findIndex((code) => normalizeToken(code) === normalized)
  if (index >= 0) {
    current.splice(index, 1)
    return current
  }
  current.push(storageCode)
  return current
}
