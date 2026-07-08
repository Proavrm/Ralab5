/** Helpers for interactive OSM plan de situation preview (zoom + pan + pin). */

import {
  SITE_PLAN_IMAGE_HEIGHT,
  SITE_PLAN_IMAGE_WIDTH,
} from '@/lib/sitePlanImageCoords'

export const MAP_ZOOM_MIN = 10
export const MAP_ZOOM_MAX = 19
export const MAP_ZOOM_DEFAULT = 16

const MAX_LAT = 85.05112878
const TILE_SIZE = 256

function clampLat(lat) {
  return Math.max(Math.min(lat, MAX_LAT), -MAX_LAT)
}

export function latLonToPixel(lat, lon, zoom) {
  const scale = TILE_SIZE * (2 ** zoom)
  const clampedLat = clampLat(lat)
  const x = ((lon + 180) / 360) * scale
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  return { x, y }
}

/** Déplace le centre carte en pixels écran (dx/dy positifs = carte tirée vers la droite/bas). */
export function offsetMapCenter(lat, lon, zoom, deltaX, deltaY) {
  const scale = TILE_SIZE * (2 ** zoom)
  const clampedLat = clampLat(lat)
  const x = ((lon + 180) / 360) * scale
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  const newX = x - deltaX
  const newY = y - deltaY
  const newLon = (newX / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * newY) / scale
  const newLat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return {
    lat: clampLat(newLat),
    lon: newLon,
  }
}

/** Position du pin en % de l’image OSM (stable à l’échelle du PNG). */
export function geoToImagePercent(
  mapCenterLat,
  mapCenterLon,
  pointLat,
  pointLon,
  zoom,
  imageWidth = SITE_PLAN_IMAGE_WIDTH,
  imageHeight = SITE_PLAN_IMAGE_HEIGHT,
) {
  const center = latLonToPixel(mapCenterLat, mapCenterLon, zoom)
  const point = latLonToPixel(pointLat, pointLon, zoom)
  return {
    x: 50 + ((point.x - center.x) / imageWidth) * 100,
    y: 50 + ((point.y - center.y) / imageHeight) * 100,
  }
}

/** Coordonnées géo à partir d’une position % sur l’image OSM. */
export function imagePercentToGeo(
  mapCenterLat,
  mapCenterLon,
  zoom,
  xPercent,
  yPercent,
  imageWidth = SITE_PLAN_IMAGE_WIDTH,
  imageHeight = SITE_PLAN_IMAGE_HEIGHT,
) {
  const offsetX = ((xPercent - 50) / 100) * imageWidth
  const offsetY = ((yPercent - 50) / 100) * imageHeight
  return pointFromPixelOffset(mapCenterLat, mapCenterLon, zoom, offsetX, offsetY)
}

/** @deprecated Préférer geoToImagePercent + imagePercentToContainerPoint */
export function computePinPixelOffset(mapCenterLat, mapCenterLon, pointLat, pointLon, zoom) {
  const center = latLonToPixel(mapCenterLat, mapCenterLon, zoom)
  const point = latLonToPixel(pointLat, pointLon, zoom)
  return {
    x: point.x - center.x,
    y: point.y - center.y,
  }
}

/** Coordonnées du point à partir d'un offset pixel depuis le centre carte. */
export function pointFromPixelOffset(mapCenterLat, mapCenterLon, zoom, offsetX, offsetY) {
  const scale = TILE_SIZE * (2 ** zoom)
  const clampedLat = clampLat(mapCenterLat)
  const x = ((mapCenterLon + 180) / 360) * scale
  const sinLat = Math.sin((clampedLat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
  const pointX = x + offsetX
  const pointY = y + offsetY
  const lon = (pointX / scale) * 360 - 180
  const n = Math.PI - (2 * Math.PI * pointY) / scale
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return {
    lat: clampLat(lat),
    lon,
  }
}

/** Position % pour chaque point d’un itinéraire géo. */
export function routeGeoToImagePercents(
  mapCenterLat,
  mapCenterLon,
  route,
  zoom,
  imageWidth = SITE_PLAN_IMAGE_WIDTH,
  imageHeight = SITE_PLAN_IMAGE_HEIGHT,
) {
  return (route || [])
    .filter((point) => point?.lat != null && point?.lon != null)
    .map((point) => geoToImagePercent(
      mapCenterLat,
      mapCenterLon,
      Number(point.lat),
      Number(point.lon),
      zoom,
      imageWidth,
      imageHeight,
    ))
}

/** Centre et zoom pour cadrer une liste de points géo dans l’image OSM. */
export function computeViewForGeoPoints(
  points,
  imageWidth = SITE_PLAN_IMAGE_WIDTH,
  imageHeight = SITE_PLAN_IMAGE_HEIGHT,
  paddingPercent = 10,
) {
  const valid = (points || []).filter(
    (point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon)),
  )
  if (!valid.length) return null

  const lats = valid.map((point) => Number(point.lat))
  const lons = valid.map((point) => Number(point.lon))
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lon: (Math.min(...lons) + Math.max(...lons)) / 2,
  }

  const padX = (paddingPercent / 100) * imageWidth
  const padY = (paddingPercent / 100) * imageHeight
  const maxHalfW = imageWidth / 2 - padX
  const maxHalfH = imageHeight / 2 - padY

  for (let zoom = MAP_ZOOM_MAX; zoom >= MAP_ZOOM_MIN; zoom -= 1) {
    const centerPx = latLonToPixel(center.lat, center.lon, zoom)
    let fits = true
    for (const point of valid) {
      const px = latLonToPixel(Number(point.lat), Number(point.lon), zoom)
      const dx = Math.abs(px.x - centerPx.x)
      const dy = Math.abs(px.y - centerPx.y)
      if (dx > maxHalfW || dy > maxHalfH) {
        fits = false
        break
      }
    }
    if (fits) {
      return { center, zoom }
    }
  }

  return { center, zoom: MAP_ZOOM_MIN }
}

/** Cadrage : rectangle en % image → nouveau centre + zoom pour remplir la fenêtre. */
export function computeViewForImagePercentRect(
  mapCenterLat,
  mapCenterLon,
  mapZoom,
  rect,
  imageWidth = SITE_PLAN_IMAGE_WIDTH,
  imageHeight = SITE_PLAN_IMAGE_HEIGHT,
  paddingPercent = 4,
) {
  if (!rect || mapCenterLat == null || mapCenterLon == null) return null

  const x1 = Math.min(Number(rect.x1), Number(rect.x2))
  const x2 = Math.max(Number(rect.x1), Number(rect.x2))
  const y1 = Math.min(Number(rect.y1), Number(rect.y2))
  const y2 = Math.max(Number(rect.y1), Number(rect.y2))

  if (x2 - x1 < 1 || y2 - y1 < 1) return null

  const corners = [
    imagePercentToGeo(mapCenterLat, mapCenterLon, mapZoom, x1, y1, imageWidth, imageHeight),
    imagePercentToGeo(mapCenterLat, mapCenterLon, mapZoom, x2, y1, imageWidth, imageHeight),
    imagePercentToGeo(mapCenterLat, mapCenterLon, mapZoom, x2, y2, imageWidth, imageHeight),
    imagePercentToGeo(mapCenterLat, mapCenterLon, mapZoom, x1, y2, imageWidth, imageHeight),
  ]

  return computeViewForGeoPoints(corners, imageWidth, imageHeight, paddingPercent)
}

/** Repositionne un point % image après changement centre/zoom. */
export function transformImagePercentAcrossView(
  xPercent,
  yPercent,
  fromCenter,
  fromZoom,
  toCenter,
  toZoom,
  imageWidth = SITE_PLAN_IMAGE_WIDTH,
  imageHeight = SITE_PLAN_IMAGE_HEIGHT,
) {
  const geo = imagePercentToGeo(
    fromCenter.lat,
    fromCenter.lon,
    fromZoom,
    xPercent,
    yPercent,
    imageWidth,
    imageHeight,
  )
  return geoToImagePercent(
    toCenter.lat,
    toCenter.lon,
    geo.lat,
    geo.lon,
    toZoom,
    imageWidth,
    imageHeight,
  )
}

export function zoomLabel(zoom) {
  const value = Number(zoom)
  if (value <= 12) return 'Vue large'
  if (value <= 15) return 'Quartier'
  if (value <= 17) return 'Rue'
  return 'Détail'
}
