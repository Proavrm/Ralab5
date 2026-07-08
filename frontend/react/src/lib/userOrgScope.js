/** Périmètre orga utilisateur — région, agences et laboratoires depuis le référentiel BD. */
import { normalizeLaboCode } from '@/lib/labGeo'
import { labDisplayName } from '@/lib/laboratoireCatalog'

export const ORG_REGION_ARS = 'ARS'

export function normalizeOrgCode(code) {
  return String(code || '').trim().toUpperCase()
}

function collectAllLabCodes(orgRegions = []) {
  const codes = new Set()
  for (const region of orgRegions) {
    for (const lab of region.laboratoires || []) {
      const key = normalizeLaboCode(typeof lab === 'string' ? lab : lab?.code)
      if (key) codes.add(key)
    }
    for (const agence of region.agences || []) {
      for (const lab of agence.laboratoires || []) {
        const key = normalizeLaboCode(typeof lab === 'string' ? lab : lab?.code)
        if (key) codes.add(key)
      }
      for (const code of agence.lab_codes || []) {
        const key = normalizeLaboCode(code)
        if (key) codes.add(key)
      }
    }
    for (const code of region.lab_codes || []) {
      const key = normalizeLaboCode(code)
      if (key) codes.add(key)
    }
  }
  return [...codes]
}

function labCodesForRegion(regionCode, orgRegions = []) {
  const region = (orgRegions || []).find((row) => normalizeOrgCode(row.code) === normalizeOrgCode(regionCode))
  if (!region) return []
  return collectAllLabCodes([region])
}

function labCodesForAgence(agenceCode, orgRegions = []) {
  const key = normalizeOrgCode(agenceCode)
  for (const region of orgRegions || []) {
    for (const agence of region.agences || []) {
      if (normalizeOrgCode(agence.code) !== key) continue
      const fromObjects = (agence.laboratoires || [])
        .map((item) => (typeof item === 'string' ? item : item?.code))
        .map(normalizeLaboCode)
        .filter(Boolean)
      const fromCodes = (agence.lab_codes || []).map(normalizeLaboCode).filter(Boolean)
      return [...new Set([...fromObjects, ...fromCodes])]
    }
  }
  return []
}

function isKnownLabCode(code, orgRegions = []) {
  const normalized = normalizeLaboCode(code)
  const known = new Set(collectAllLabCodes(orgRegions))
  return known.has(normalized) || known.has(normalizeOrgCode(code))
}
export function isRegionalRstUser(user) {
  return normalizeOrgCode(user?.service_code) === ORG_REGION_ARS
}

export function getRegionalRstTitle() {
  return 'Référent Scientifique et Technique · région ARS'
}

export function getRegionalRstShortLabel() {
  return 'RST · ARS'
}

function agenceLabelFromOrg(code, orgRegions = []) {
  const key = normalizeOrgCode(code)
  for (const region of orgRegions) {
    const agence = (region.agences || []).find((row) => normalizeOrgCode(row.code) === key)
    if (agence?.label) return String(agence.label).trim()
  }
  return ''
}

export function resolveLabCodesForScope(serviceCode, orgRegions = []) {
  const code = normalizeOrgCode(serviceCode)
  if (!code) return []

  const regionLabs = labCodesForRegion(code, orgRegions)
  if (regionLabs.length) return regionLabs

  const agenceLabs = labCodesForAgence(code, orgRegions)
  if (agenceLabs.length) return agenceLabs

  if (isKnownLabCode(code, orgRegions)) {
    return [normalizeLaboCode(code)]
  }

  return []
}
export function getUserOrgScope(user, orgRegions = [], catalog = null) {
  const serviceCode = normalizeOrgCode(user?.service_code)
  const labCodes = resolveLabCodesForScope(serviceCode, orgRegions)
  const isRegionalRst = serviceCode === ORG_REGION_ARS

  let kind = 'none'
  let label = ''
  if (isRegionalRst) {
    kind = 'org_region'
    label = getRegionalRstTitle()
  } else if (serviceCode === 'RA') {
    kind = 'agence'
    const agLabel = agenceLabelFromOrg('RA', orgRegions)
    label = agLabel ? `Agence RA · ${agLabel}` : 'Agence RA'
  } else if (serviceCode === 'AUV') {
    kind = 'agence'
    const agLabel = agenceLabelFromOrg('AUV', orgRegions)
    label = agLabel ? `Agence AUV · ${agLabel}` : 'Agence AUV'
  } else if (labCodes.length === 1) {
    kind = 'laboratoire'
    const labName = catalog ? labDisplayName(labCodes[0], catalog) : ''
    label = labName ? `Laboratoire ${labCodes[0]} · ${labName}` : `Laboratoire ${labCodes[0]}`
  } else if (serviceCode) {
    kind = 'unknown'
    label = serviceCode
  }

  return {
    serviceCode,
    kind,
    label,
    isRegionalRst,
    labCodes,
    regionCode: isRegionalRst ? ORG_REGION_ARS : '',
    filterActive: labCodes.length > 0,
  }
}

export function recordMatchesOrgScope(record, scope, laboKeys = ['labo_code', 'laboCode']) {
  if (!scope?.filterActive || !scope.labCodes?.length) return true
  const allowed = new Set(scope.labCodes.map(normalizeLaboCode))
  for (const key of laboKeys) {
    const value = normalizeLaboCode(record?.[key])
    if (value && allowed.has(value)) return true
  }
  return false
}

export function partitionDestinataireUsers(users = [], orgRegions = []) {
  const regionalRst = []
  const laboLocal = []
  const other = []

  const agenceCodes = new Set(
    (orgRegions || []).flatMap((region) => (region.agences || []).map((agence) => normalizeOrgCode(agence.code))),
  )
  const labCodes = new Set(collectAllLabCodes(orgRegions))

  for (const entry of users) {
    const code = normalizeOrgCode(entry.service_code)
    const email = String(entry.email || '').trim().toLowerCase()
    if (!email) continue
    const row = {
      email,
      display_name: String(entry.display_name || email).trim(),
      service_code: code,
    }
    if (code === ORG_REGION_ARS) {
      regionalRst.push(row)
    } else if (agenceCodes.has(code) || labCodes.has(normalizeLaboCode(code))) {
      laboLocal.push(row)
    } else {
      other.push(row)
    }
  }
  const byName = (a, b) => a.display_name.localeCompare(b.display_name, 'fr')
  regionalRst.sort(byName)
  laboLocal.sort(byName)
  other.sort(byName)

  return { regionalRst, laboLocal, other }
}
