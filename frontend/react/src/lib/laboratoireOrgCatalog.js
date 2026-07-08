/** Organisation labos — région ARS, agences RA/AUV, labos SP/PDC (données API). */
import { normalizeLaboCode } from '@/lib/labGeo'

export function normalizeOrgCode(code) {
  return String(code || '').trim().toUpperCase()
}

export function buildOrgIndex(orgRegions = []) {
  const regions = Array.isArray(orgRegions) ? orgRegions : []
  const regionCodes = new Set(regions.map((row) => normalizeOrgCode(row.code)))
  const agenceCodes = new Set()
  const agences = []
  for (const region of regions) {
    for (const agence of region.agences || []) {
      agenceCodes.add(normalizeOrgCode(agence.code))
      agences.push({ ...agence, region_code: region.code, region_label: region.label })
    }
  }
  return { regions, regionCodes, agenceCodes, agences }
}

export function isOrgRegionCode(code, orgRegions = []) {
  const { regionCodes } = buildOrgIndex(orgRegions)
  return regionCodes.has(normalizeOrgCode(code))
}

export function isAgenceCode(code, orgRegions = []) {
  const { agenceCodes } = buildOrgIndex(orgRegions)
  return agenceCodes.has(normalizeOrgCode(code))
}

export function orgRegionLabel(code, orgRegions = []) {
  const key = normalizeOrgCode(code)
  const region = (orgRegions || []).find((row) => normalizeOrgCode(row.code) === key)
  return region?.label || key
}

export function agenceLabel(code, orgRegions = []) {
  const key = normalizeOrgCode(code)
  for (const region of orgRegions || []) {
    const agence = (region.agences || []).find((row) => normalizeOrgCode(row.code) === key)
    if (agence) return agence.label
  }
  return key
}

export function userMatchesLabScope(serviceCode, labCode, lab = {}, orgRegions = []) {
  const userCode = normalizeOrgCode(serviceCode)
  if (!userCode) return false
  const targetLab = normalizeLaboCode(labCode)
  if (!targetLab) return false

  if (isOrgRegionCode(userCode, orgRegions)) {
    const regionCode = normalizeOrgCode(lab.region || lab.rst_region)
    return regionCode === userCode
  }

  if (isAgenceCode(userCode, orgRegions)) {
    const agenceCode = normalizeOrgCode(lab.agence_code || lab.agency_code)
    return agenceCode === userCode
  }

  return normalizeLaboCode(userCode) === targetLab
}

export function groupLabsByOrg(orgRegions = [], labs = []) {
  return (orgRegions || []).map((region) => ({
    ...region,
    laboratoires: labs.filter((lab) => normalizeOrgCode(lab.region || lab.rst_region) === normalizeOrgCode(region.code)),
  })).filter((group) => (group.laboratoires || []).length > 0)
}

export function buildUserOrgAssociation(serviceCode, labs = [], orgRegions = []) {
  const code = normalizeOrgCode(serviceCode)
  if (isOrgRegionCode(code, orgRegions)) {
    const region = (orgRegions || []).find((row) => normalizeOrgCode(row.code) === code)
    const attached = labs.filter((lab) => normalizeOrgCode(lab.region || lab.rst_region) === code)
    return {
      kind: 'org_region',
      code: region?.code || code,
      label: region?.label || code,
      laboratoires: attached,
    }
  }

  if (isAgenceCode(code, orgRegions)) {
    for (const region of orgRegions || []) {
      const agence = (region.agences || []).find((row) => normalizeOrgCode(row.code) === code)
      if (!agence) continue
      const attached = labs.filter((lab) => normalizeOrgCode(lab.agence_code || lab.agency_code) === code)
      return {
        kind: 'agence',
        code: agence.code,
        label: agence.label,
        region_code: region.code,
        region_label: region.label,
        laboratoires: attached,
      }
    }
  }

  const lab = labs.find((row) => normalizeLaboCode(row.code) === normalizeLaboCode(code))
  if (lab) {
    return {
      kind: 'laboratoire',
      code: lab.code,
      label: lab.name,
      region: lab.region || lab.rst_region,
      region_label: lab.region_label || lab.rst_region_label || orgRegionLabel(lab.region, orgRegions),
      agence_code: lab.agence_code || lab.agency_code,
      agence_label: lab.agence_label || agenceLabel(lab.agence_code, orgRegions),
      laboratoire: lab,
    }
  }

  if (code) return { kind: 'unknown', code, label: code, laboratoires: [] }
  return { kind: 'none', code: '', label: '', laboratoires: [] }
}

export function agenceForLab(lab) {
  if (!lab) return ''
  return normalizeOrgCode(lab.agence_code || lab.agency_code)
}

export function buildLabAgencyLabel(lab) {
  return agenceForLab(lab)
}

// Legacy aliases
export const buildUserRstAssociation = buildUserOrgAssociation
export const isRstRegionCode = isOrgRegionCode
export const rstRegionLabel = orgRegionLabel
export const RST_REGION_LIST = []
