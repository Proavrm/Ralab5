/** Coordonnées des zones plan de situation — % de l’image OSM (A4). */

/** A4 paysage ~150 dpi (297×210 mm) — itinéraire */
export const ITINERARY_IMAGE_WIDTH = 1486
export const ITINERARY_IMAGE_HEIGHT = 1050

/** A4 portrait ~150 dpi (210×297 mm) — plan de situation */
export const SITE_PLAN_IMAGE_WIDTH = 1050
export const SITE_PLAN_IMAGE_HEIGHT = 1486

export const SITE_PLAN_IMAGE_ASPECT = SITE_PLAN_IMAGE_WIDTH / SITE_PLAN_IMAGE_HEIGHT
export const ITINERARY_IMAGE_ASPECT = ITINERARY_IMAGE_WIDTH / ITINERARY_IMAGE_HEIGHT

/** @deprecated utiliser imageWidth/imageHeight explicites */
export const SITE_PLAN_A4_LANDSCAPE = {
  width: ITINERARY_IMAGE_WIDTH,
  height: ITINERARY_IMAGE_HEIGHT,
}
export const SITE_PLAN_A4_PORTRAIT = {
  width: SITE_PLAN_IMAGE_WIDTH,
  height: SITE_PLAN_IMAGE_HEIGHT,
}

export const A4_ORIENTATION_PORTRAIT = 'portrait'
export const A4_ORIENTATION_LANDSCAPE = 'landscape'

/** Dimensions A4 selon l’orientation choisie (capture + aperçu). */
export function a4CaptureDimensions(orientation = A4_ORIENTATION_PORTRAIT) {
  if (orientation === A4_ORIENTATION_LANDSCAPE) {
    return {
      width: ITINERARY_IMAGE_WIDTH,
      height: ITINERARY_IMAGE_HEIGHT,
      aspect: ITINERARY_IMAGE_ASPECT,
      orientation: A4_ORIENTATION_LANDSCAPE,
    }
  }
  return {
    width: SITE_PLAN_IMAGE_WIDTH,
    height: SITE_PLAN_IMAGE_HEIGHT,
    aspect: SITE_PLAN_IMAGE_ASPECT,
    orientation: A4_ORIENTATION_PORTRAIT,
  }
}

export function orientationFromMeta(meta) {
  const stored = String(meta?.orientation || '').trim().toLowerCase()
  if (stored === A4_ORIENTATION_LANDSCAPE || stored === 'paysage') {
    return A4_ORIENTATION_LANDSCAPE
  }
  if (stored === A4_ORIENTATION_PORTRAIT) {
    return A4_ORIENTATION_PORTRAIT
  }
  const width = Number(meta?.image_width)
  const height = Number(meta?.image_height)
  if (Number.isFinite(width) && Number.isFinite(height) && width > height) {
    return A4_ORIENTATION_LANDSCAPE
  }
  return A4_ORIENTATION_PORTRAIT
}

export function clampPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/** Zone utile de l’image OSM dans un conteneur object-contain. */
export function getContainedImageLayout(containerRect, imageAspect = SITE_PLAN_IMAGE_ASPECT) {
  if (!containerRect?.width || !containerRect?.height) {
    return null
  }

  const cw = containerRect.width
  const ch = containerRect.height
  const containerAspect = cw / ch

  if (imageAspect > containerAspect) {
    const renderW = cw
    const renderH = cw / imageAspect
    return {
      offsetX: 0,
      offsetY: (ch - renderH) / 2,
      renderW,
      renderH,
    }
  }

  const renderH = ch
  const renderW = ch * imageAspect
  return {
    offsetX: (cw - renderW) / 2,
    offsetY: 0,
    renderW,
    renderH,
  }
}

export function imagePercentToContainerPoint(layout, xPercent, yPercent) {
  if (!layout) return { x: 0, y: 0 }
  return {
    x: layout.offsetX + (layout.renderW * clampPercent(xPercent)) / 100,
    y: layout.offsetY + (layout.renderH * clampPercent(yPercent)) / 100,
  }
}

/** Mapping object-contain : clic écran → % image. */
export function clientPointToImagePercent(containerRect, clientX, clientY, imageAspect = SITE_PLAN_IMAGE_ASPECT) {
  const layout = getContainedImageLayout(containerRect, imageAspect)
  if (!layout) {
    return { x: 0, y: 0 }
  }

  const localX = clientX - containerRect.left - layout.offsetX
  const localY = clientY - containerRect.top - layout.offsetY

  return {
    x: clampPercent((localX / layout.renderW) * 100),
    y: clampPercent((localY / layout.renderH) * 100),
  }
}

export function imagePercentToSvgPoint(point) {
  return {
    x: clampPercent(point?.x),
    y: clampPercent(point?.y),
  }
}

export function polygonCentroid(points = []) {
  if (!points.length) return { x: 50, y: 50 }
  const sum = points.reduce(
    (acc, point) => ({
      x: acc.x + clampPercent(point.x),
      y: acc.y + clampPercent(point.y),
    }),
    { x: 0, y: 0 },
  )
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  }
}

export function pointsToSvgPath(points = []) {
  if (!points.length) return ''
  const head = points.map((point) => {
    const p = imagePercentToSvgPoint(point)
    return `${p.x},${p.y}`
  })
  return head.join(' ')
}
