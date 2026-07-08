import { clampPercent } from '@/lib/sitePlanImageCoords'

export const SITE_PLAN_ZONE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#ca8a04',
  '#db2777',
]

export function mkZoneId() {
  return `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function normalizeZonePoint(point) {
  return {
    x: clampPercent(point?.x),
    y: clampPercent(point?.y),
  }
}

export function normalizeZone(zone, index = 0) {
  const points = (Array.isArray(zone?.points) ? zone.points : [])
    .map(normalizeZonePoint)
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))

  if (points.length < 3) return null

  return {
    id: String(zone?.id || mkZoneId()).trim() || mkZoneId(),
    label: String(zone?.label || `Zone ${index + 1}`).trim() || `Zone ${index + 1}`,
    color: String(zone?.color || SITE_PLAN_ZONE_COLORS[index % SITE_PLAN_ZONE_COLORS.length]).trim(),
    points,
  }
}

export function normalizeZones(zones = []) {
  return (Array.isArray(zones) ? zones : [])
    .map((zone, index) => normalizeZone(zone, index))
    .filter(Boolean)
}

export function createZone(index = 0, points = []) {
  return normalizeZone({
    id: mkZoneId(),
    label: `Zone ${index + 1}`,
    color: SITE_PLAN_ZONE_COLORS[index % SITE_PLAN_ZONE_COLORS.length],
    points,
  })
}

export function zoneFromDraftPoints(points = [], index = 0) {
  const normalized = points.map(normalizeZonePoint)
  if (normalized.length < 3) return null
  return createZone(index, normalized)
}

export function updateZonePoint(zones, zoneId, pointIndex, nextPoint) {
  return zones.map((zone) => {
    if (zone.id !== zoneId) return zone
    const points = zone.points.map((point, idx) => (
      idx === pointIndex ? normalizeZonePoint(nextPoint) : point
    ))
    return normalizeZone({ ...zone, points })
  }).filter(Boolean)
}

export function removeZone(zones, zoneId) {
  return zones.filter((zone) => zone.id !== zoneId)
}

export function renameZone(zones, zoneId, label) {
  return zones.map((zone) => (
    zone.id === zoneId ? { ...zone, label: String(label || zone.label).trim() || zone.label } : zone
  ))
}
