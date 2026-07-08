/** Miroir frontend de lab_geo_catalog.py — distance chantier ↔ laboratoire. */

export function normalizeLaboCode(code) {
  const text = String(code || 'SP').trim().toUpperCase()
  if (!text) return 'SP'
  if (text === 'AUV') return 'PDC'
  return text
}

export function userMatchesLab(serviceCode, labCode) {
  const userLab = normalizeLaboCode(serviceCode)
  const targetLab = normalizeLaboCode(labCode)
  if (!userLab) return false
  return userLab === targetLab
}

export function formatDistanceToLab(distanceToLab) {
  if (!distanceToLab) return ''
  const text = String(distanceToLab.distance_text || '').trim()
  if (text) return text
  const km = Number(distanceToLab.distance_km)
  if (!Number.isFinite(km)) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 100) return `${String(km.toFixed(1)).replace('.', ',')} km`
  return `${Math.round(km)} km`
}

export function buildDistanceToLabCaption(distanceToLab) {
  if (!distanceToLab) return ''
  const labCode = normalizeLaboCode(distanceToLab.labo_code)
  const labLabel = distanceToLab.labo_label || labCode
  const distance = formatDistanceToLab(distanceToLab)
  if (!distance) return ''
  return `${distance} du labo ${labLabel}`
}

export function buildAffaireSiteGeoCaption(affaire, laboCode = 'SP') {
  const geo = affaire?.site_geo
  if (geo?.distance_to_lab) {
    return buildDistanceToLabCaption(geo.distance_to_lab)
  }
  const label = String(affaire?.site_geocode_label || '').trim()
  if (label) return label
  if (affaire?.site_lat != null && affaire?.site_lon != null) {
    return `${Number(affaire.site_lat).toFixed(5)}, ${Number(affaire.site_lon).toFixed(5)}`
  }
  return ''
}
