import { clampPercent } from '@/lib/sitePlanImageCoords'

export function mkPinId() {
  return `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function normalizePin(pin, index = 0) {
  const x = clampPercent(pin?.x)
  const y = clampPercent(pin?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null

  const comment = String(pin?.comment ?? `Repère ${index + 1}`).trim() || `Repère ${index + 1}`

  return {
    id: String(pin?.id || mkPinId()).trim() || mkPinId(),
    x,
    y,
    comment,
  }
}

export function normalizePins(pins = []) {
  return (Array.isArray(pins) ? pins : [])
    .map((pin, index) => normalizePin(pin, index))
    .filter(Boolean)
}

export function createPin(index = 0, point = { x: 50, y: 50 }) {
  return normalizePin({
    id: mkPinId(),
    x: point.x,
    y: point.y,
    comment: `Repère ${index + 1}`,
  }, index)
}

export function updatePinPoint(pins, pinId, point) {
  return pins.map((pin) => (
    pin.id === pinId
      ? normalizePin({ ...pin, x: point.x, y: point.y }, 0)
      : pin
  )).filter(Boolean)
}

export function updatePinComment(pins, pinId, comment) {
  return pins.map((pin) => (
    pin.id === pinId ? { ...pin, comment: String(comment || pin.comment).trim() || pin.comment } : pin
  ))
}

export function removePin(pins, pinId) {
  return pins.filter((pin) => pin.id !== pinId)
}
