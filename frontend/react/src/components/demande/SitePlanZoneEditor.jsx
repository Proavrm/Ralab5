import { useLayoutEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  clientPointToImagePercent,
  getContainedImageLayout,
  imagePercentToContainerPoint,
  pointsToSvgPath,
  polygonCentroid,
  SITE_PLAN_IMAGE_ASPECT,
} from '@/lib/sitePlanImageCoords'
import {
  createZone,
  normalizeZones,
  removeZone,
  renameZone,
  updateZonePoint,
  zoneFromDraftPoints,
} from '@/lib/sitePlanZones'
import {
  createPin,
  normalizePins,
  removePin,
  updatePinComment,
} from '@/lib/sitePlanPins'

export const INTERACTION_MAP = 'map'
export const INTERACTION_PIN = 'pin'
export const INTERACTION_MARKER = 'marker'
export const INTERACTION_ZONE = 'zone'
export const INTERACTION_CADRAGE = 'cadrage'

export default function SitePlanZonePanel({
  interactionMode,
  onInteractionModeChange,
  zones,
  onZonesChange,
  selectedZoneId,
  onSelectedZoneIdChange,
  draftPoints,
  onDraftPointsChange,
  pins = [],
  onPinsChange,
  selectedPinId,
  onSelectedPinIdChange,
  disabled = false,
}) {
  function startNewZone() {
    onInteractionModeChange(INTERACTION_ZONE)
    onSelectedZoneIdChange(null)
    onDraftPointsChange([])
  }

  function finishDraft() {
    const nextZone = zoneFromDraftPoints(draftPoints, zones.length)
    if (!nextZone) return
    onZonesChange([...zones, nextZone])
    onDraftPointsChange([])
    onSelectedZoneIdChange(nextZone.id)
  }

  function cancelDraft() {
    onDraftPointsChange([])
  }

  function deleteSelectedZone() {
    if (!selectedZoneId) return
    onZonesChange(removeZone(zones, selectedZoneId))
    onSelectedZoneIdChange(null)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-[#69758a]">Outil</span>
        {[
          { id: INTERACTION_MAP, label: 'Carte' },
          { id: INTERACTION_PIN, label: 'Pin chantier' },
          {
            id: INTERACTION_MARKER,
            label: 'Repère + commentaire',
            accent: true,
          },
          { id: INTERACTION_ZONE, label: 'Zone' },
          { id: INTERACTION_CADRAGE, label: 'Cadrage' },
        ].map((tool) => (
          <button
            key={tool.id}
            type="button"
            disabled={disabled}
            onClick={() => onInteractionModeChange(tool.id)}
            className={`rounded border px-2 py-1 text-[11px] transition-colors ${
              interactionMode === tool.id
                ? tool.accent
                  ? 'border-[#d97706] bg-[#fff7ed] font-semibold text-[#9a3412]'
                  : 'border-[#3b5bdb] bg-[#eef4ff] font-semibold text-[#1e3a8a]'
                : tool.accent
                  ? 'border-[#fde68a] bg-white text-[#92400e] hover:border-[#f59e0b]'
                  : 'border-border bg-white text-[#334155] hover:border-nge'
            }`}
          >
            {tool.label}
          </button>
        ))}
        <Button size="sm" variant="secondary" onClick={startNewZone} disabled={disabled}>
          + Zone
        </Button>
        {draftPoints.length >= 3 ? (
          <Button size="sm" onClick={finishDraft} disabled={disabled}>
            Fermer polygone
          </Button>
        ) : null}
        {draftPoints.length > 0 ? (
          <Button size="sm" variant="secondary" onClick={cancelDraft} disabled={disabled}>
            Annuler tracé
          </Button>
        ) : null}
      </div>

      {interactionMode === INTERACTION_CADRAGE ? (
        <div className="text-[10px] leading-relaxed text-[#69758a]">
          Tracez un rectangle sur la carte pour zoomer et ajuster la zone sélectionnée à la fenêtre
        </div>
      ) : null}

      {interactionMode === INTERACTION_ZONE ? (
        <div className="text-[10px] leading-relaxed text-[#69758a]">
          Cliquez sur la carte pour ajouter des sommets · minimum 3 points · « Fermer polygone » pour valider
          {selectedZoneId ? ' · glisser les sommets pour ajuster la zone sélectionnée' : ''}
        </div>
      ) : null}

      {interactionMode === INTERACTION_MARKER ? (
        <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] px-2.5 py-2 text-[10px] leading-relaxed text-[#92400e]">
          <strong>Repères orange</strong> — cliquez sur la carte pour placer un point · glissez pour déplacer · saisissez le commentaire dans la liste ci-dessous
        </div>
      ) : (
        <div className="text-[10px] leading-relaxed text-[#69758a]">
          Pour ajouter un point annoté (accès, parking, etc.) : cliquez sur{' '}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onInteractionModeChange(INTERACTION_MARKER)}
            className="font-semibold text-[#d97706] hover:underline"
          >
            Repère + commentaire
          </button>
          {' '}puis cliquez sur la carte.
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-lg border border-[#fde68a]/60 bg-[#fffbeb]/40 px-2 py-2">
        <div className="text-[10px] font-semibold text-[#92400e]">
          Repères commentés {pins.length > 0 ? `(${pins.length})` : ''}
        </div>
      {pins.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {pins.map((pin, index) => {
            const active = pin.id === selectedPinId
            return (
              <div
                key={pin.id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                  active ? 'border-[#d97706] bg-white' : 'border-[#dbe1ea] bg-white/80'
                }`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelectedPinIdChange(pin.id)
                    onInteractionModeChange(INTERACTION_MARKER)
                    onSelectedZoneIdChange(null)
                    onDraftPointsChange([])
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-white bg-[#f59e0b] text-[7px] font-bold text-white shadow">
                    {index + 1}
                  </span>
                  <input
                    value={pin.comment}
                    disabled={disabled}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onPinsChange(updatePinComment(pins, pin.id, event.target.value))}
                    placeholder="Commentaire du repère"
                    className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[#172033] outline-none"
                  />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onPinsChange(removePin(pins, pin.id))
                    if (selectedPinId === pin.id) onSelectedPinIdChange(null)
                  }}
                  className="rounded p-1 text-[#69758a] hover:bg-red-50 hover:text-red-600"
                  title="Supprimer le repère"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[10px] text-[#b45309]">
          Aucun repère pour l’instant — activez « Repère + commentaire » et cliquez sur la carte.
        </div>
      )}
      </div>

      {zones.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {zones.map((zone) => {
            const active = zone.id === selectedZoneId
            return (
              <div
                key={zone.id}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                  active ? 'border-[#3b5bdb] bg-white' : 'border-[#dbe1ea] bg-white/80'
                }`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelectedZoneIdChange(zone.id)
                    onInteractionModeChange(INTERACTION_ZONE)
                    onDraftPointsChange([])
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white shadow"
                    style={{ backgroundColor: zone.color }}
                  />
                  <input
                    value={zone.label}
                    disabled={disabled}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => onZonesChange(renameZone(zones, zone.id, event.target.value))}
                    className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-[#172033] outline-none"
                  />
                  <span className="text-[10px] text-[#69758a]">{zone.points.length} pts</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSelectedZoneIdChange(zone.id)
                    onZonesChange(removeZone(zones, zone.id))
                  }}
                  className="rounded p-1 text-[#69758a] hover:bg-red-50 hover:text-red-600"
                  title="Supprimer la zone"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[10px] text-[#69758a]">Aucune zone — « + Zone » pour délimiter le périmètre chantier.</div>
      )}

      {selectedZoneId && !draftPoints.length ? (
        <button
          type="button"
          disabled={disabled}
          onClick={deleteSelectedZone}
          className="self-start text-[10px] text-red-600 hover:underline"
        >
          Supprimer la zone sélectionnée
        </button>
      ) : null}
    </div>
  )
}

export function SitePlanMapViewport({
  previewPath,
  previewKey,
  mapCenter,
  pointLocation,
  mapZoom,
  dragOffset,
  pinImagePercent,
  pinDragOffset,
  zones = [],
  draftPoints = [],
  selectedZoneId,
  interactionMode,
  isBusy,
  isPreviewLoading,
  resolvedLabel,
  distanceCaption,
  onMapPointerDown,
  onMapPointerMove,
  onMapPointerUp,
  onPinPointerDown,
  onPinPointerMove,
  onPinPointerUp,
  onMapClick,
  onChantierPinPlace,
  onCadrageComplete,
  onVertexDrag,
  onMarkerClick,
  pins = [],
  selectedPinId,
  onAnnotationPinPointerDown,
  onAnnotationPinPointerMove,
  onAnnotationPinPointerUp,
  mapContainerRef,
  itineraryRoutePercents = [],
  imageAspect = SITE_PLAN_IMAGE_ASPECT,
  viewportMaxHeight = 'min(56vh,780px)',
}) {
  const vertexDragRef = useRef(null)
  const cadrageDragRef = useRef(null)
  const [tempCadrageRect, setTempCadrageRect] = useState(null)
  const [imageLayout, setImageLayout] = useState(null)
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) || null

  useLayoutEffect(() => {
    const element = mapContainerRef.current
    if (!element) return undefined

    function measure() {
      const rect = element.getBoundingClientRect()
      setImageLayout(getContainedImageLayout(rect, imageAspect))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mapContainerRef, previewPath, previewKey, mapZoom, dragOffset.x, dragOffset.y, imageAspect])

  const pinContainerPoint = pinImagePercent
    ? imagePercentToContainerPoint(imageLayout, pinImagePercent.x, pinImagePercent.y)
    : null

  function handlePointerDown(event) {
    if (interactionMode === INTERACTION_MARKER && onMarkerClick) {
      if (event.target.closest('[data-site-plan-pin]')) return
      if (event.target.closest('[data-site-plan-marker]')) return
      const rect = mapContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = clientPointToImagePercent(rect, event.clientX, event.clientY, imageAspect)
      event.stopPropagation()
      onMarkerClick(point)
      return
    }

    if (interactionMode === INTERACTION_ZONE && onMapClick) {
      const rect = mapContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = clientPointToImagePercent(rect, event.clientX, event.clientY, imageAspect)

      const hitRadius = 1.8
      if (selectedZone) {
        const hitIndex = selectedZone.points.findIndex((vertex) => (
          Math.hypot(vertex.x - point.x, vertex.y - point.y) <= hitRadius
        ))
        if (hitIndex >= 0) {
          event.stopPropagation()
          vertexDragRef.current = { zoneId: selectedZone.id, pointIndex: hitIndex }
          event.currentTarget.setPointerCapture(event.pointerId)
          return
        }
      }

      if (event.target.closest('[data-site-plan-pin]')) return
      if (event.target.closest('[data-site-plan-marker]')) return
      event.stopPropagation()
      onMapClick(point)
      return
    }

    if (interactionMode === INTERACTION_CADRAGE && onCadrageComplete) {
      if (event.button !== 0) return
      const rect = mapContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = clientPointToImagePercent(rect, event.clientX, event.clientY, imageAspect)
      cadrageDragRef.current = { start: point }
      setTempCadrageRect({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }

    if (interactionMode === INTERACTION_PIN && onChantierPinPlace) {
      if (event.target.closest('[data-site-plan-pin]')) return
      if (event.target.closest('[data-site-plan-marker]')) return
      const rect = mapContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = clientPointToImagePercent(rect, event.clientX, event.clientY, imageAspect)
      event.stopPropagation()
      onChantierPinPlace(point)
      return
    }

    if (interactionMode === INTERACTION_PIN || interactionMode === INTERACTION_MARKER) return
    if (interactionMode === INTERACTION_MAP) {
      onMapPointerDown(event)
    }
  }

  function handlePointerMove(event) {
    const cadrage = cadrageDragRef.current
    if (cadrage && interactionMode === INTERACTION_CADRAGE) {
      const rect = mapContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = clientPointToImagePercent(rect, event.clientX, event.clientY, imageAspect)
      setTempCadrageRect({
        x1: cadrage.start.x,
        y1: cadrage.start.y,
        x2: point.x,
        y2: point.y,
      })
      return
    }

    const drag = vertexDragRef.current
    if (drag && onVertexDrag) {
      const rect = mapContainerRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = clientPointToImagePercent(rect, event.clientX, event.clientY, imageAspect)
      onVertexDrag(drag.zoneId, drag.pointIndex, point)
      return
    }

    if (interactionMode === INTERACTION_MAP) {
      onMapPointerMove(event)
    } else if (interactionMode === INTERACTION_PIN) {
      onPinPointerMove(event)
    } else if (interactionMode === INTERACTION_MARKER) {
      onAnnotationPinPointerMove?.(event)
    }
  }

  function handlePointerUp(event) {
    const cadrage = cadrageDragRef.current
    if (cadrage && interactionMode === INTERACTION_CADRAGE) {
      cadrageDragRef.current = null
      const rect = mapContainerRef.current?.getBoundingClientRect()
      const endPoint = rect
        ? clientPointToImagePercent(rect, event.clientX, event.clientY, imageAspect)
        : cadrage.start
      const x1 = Math.min(cadrage.start.x, endPoint.x)
      const x2 = Math.max(cadrage.start.x, endPoint.x)
      const y1 = Math.min(cadrage.start.y, endPoint.y)
      const y2 = Math.max(cadrage.start.y, endPoint.y)
      setTempCadrageRect(null)
      if (x2 - x1 >= 1.5 && y2 - y1 >= 1.5) {
        onCadrageComplete?.({ x1, y1, x2, y2 })
      }
      return
    }

    if (vertexDragRef.current) {
      vertexDragRef.current = null
      return
    }
    if (interactionMode === INTERACTION_MAP) {
      onMapPointerUp(event)
    } else if (interactionMode === INTERACTION_PIN) {
      onPinPointerUp(event)
    } else if (interactionMode === INTERACTION_MARKER) {
      onAnnotationPinPointerUp?.(event)
    }
  }

  const cursorClass = interactionMode === INTERACTION_MAP && mapCenter
    ? 'cursor-grab active:cursor-grabbing'
    : interactionMode === INTERACTION_ZONE || interactionMode === INTERACTION_MARKER || interactionMode === INTERACTION_CADRAGE
      ? 'cursor-crosshair'
      : ''

  return (
    <div
      ref={mapContainerRef}
      className={`relative w-full mx-auto rounded-xl border border-[#dbe1ea] bg-[#eef2f7] overflow-hidden touch-none ${cursorClass}`}
      style={{ aspectRatio: String(imageAspect), maxHeight: viewportMaxHeight }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {previewPath ? (
        <>
          <div
            className="absolute inset-0 will-change-transform"
            style={{
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
            }}
          >
            <img
              key={previewKey}
              src={previewPath}
              alt="Aperçu plan de situation"
              draggable={false}
              className="h-full w-full object-contain pointer-events-none select-none"
            />
          </div>

          {imageLayout ? (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${imageLayout.offsetX}px`,
                top: `${imageLayout.offsetY}px`,
                width: `${imageLayout.renderW}px`,
                height: `${imageLayout.renderH}px`,
                transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
              }}
            >
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                {zones.map((zone) => {
                  const active = zone.id === selectedZoneId
                  return (
                    <g key={zone.id}>
                      <polygon
                        points={pointsToSvgPath(zone.points)}
                        fill={active ? 'rgba(59,130,246,0.14)' : 'rgba(59,130,246,0.08)'}
                        stroke={zone.color}
                        strokeWidth={active ? 0.55 : 0.4}
                        strokeDasharray={active ? '1.2 0.6' : '0.9 0.7'}
                      />
                      {zone.label ? (
                        <text
                          x={polygonCentroid(zone.points).x}
                          y={polygonCentroid(zone.points).y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="2.4"
                          fill={zone.color}
                          fontFamily="sans-serif"
                          fontWeight="700"
                        >
                          {zone.label}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
                {draftPoints.length > 0 ? (
                  <>
                    <polyline
                      points={pointsToSvgPath(draftPoints)}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="0.45"
                      strokeDasharray="1 0.7"
                    />
                    {draftPoints.map((point, index) => (
                      <circle
                        key={`draft-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r="0.7"
                        fill="#2563eb"
                        stroke="#ffffff"
                        strokeWidth="0.25"
                      />
                    ))}
                  </>
                ) : null}
                {selectedZone && interactionMode === INTERACTION_ZONE ? selectedZone.points.map((point, index) => (
                  <circle
                    key={`${selectedZone.id}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r="1"
                    fill="#ffffff"
                    stroke={selectedZone.color}
                    strokeWidth="0.35"
                  />
                )) : null}
                {tempCadrageRect ? (
                  <rect
                    x={Math.min(tempCadrageRect.x1, tempCadrageRect.x2)}
                    y={Math.min(tempCadrageRect.y1, tempCadrageRect.y2)}
                    width={Math.abs(tempCadrageRect.x2 - tempCadrageRect.x1)}
                    height={Math.abs(tempCadrageRect.y2 - tempCadrageRect.y1)}
                    fill="rgba(59,130,246,0.12)"
                    stroke="#2563eb"
                    strokeWidth="0.45"
                    strokeDasharray="1.2 0.8"
                  />
                ) : null}
                {itineraryRoutePercents.length >= 2 ? (
                  <>
                    <polyline
                      points={pointsToSvgPath(itineraryRoutePercents)}
                      fill="none"
                      stroke="#7c3aed"
                      strokeWidth="0.55"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <rect
                      x={itineraryRoutePercents[0].x - 1.1}
                      y={itineraryRoutePercents[0].y - 1.1}
                      width="2.2"
                      height="2.2"
                      fill="#1d4ed8"
                      stroke="#ffffff"
                      strokeWidth="0.35"
                    />
                  </>
                ) : null}
              </svg>
            </div>
          ) : null}

          {isPreviewLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/35 pointer-events-none">
              <Loader2 size={28} className="animate-spin text-[#3b5bdb]" />
            </div>
          ) : null}

          {resolvedLabel ? (
            <div className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-[11px] text-white leading-snug pointer-events-none">
              <div>{resolvedLabel}</div>
              {distanceCaption ? (
                <div className="mt-0.5 text-white/80">{distanceCaption}</div>
              ) : null}
            </div>
          ) : null}

          {mapCenter ? (
            <div className="absolute left-2 top-2 rounded bg-white/90 px-2 py-1 text-[10px] text-[#69758a] pointer-events-none">
              {interactionMode === INTERACTION_MAP
                ? 'Glisser la carte pour recadrer · slider pour zoomer'
                : interactionMode === INTERACTION_PIN
                  ? 'Cliquer ou glisser le pin rouge pour le point chantier'
                  : interactionMode === INTERACTION_MARKER
                    ? 'Cliquer pour ajouter un repère orange · glisser pour déplacer'
                    : interactionMode === INTERACTION_CADRAGE
                      ? 'Tracez un rectangle pour zoomer sur la zone sélectionnée'
                      : 'Cliquer pour ajouter des sommets au polygone'}
            </div>
          ) : null}

          {pins.map((pin, index) => {
            const containerPoint = imagePercentToContainerPoint(imageLayout, pin.x, pin.y)
            if (!containerPoint) return null
            const active = pin.id === selectedPinId
            return (
              <div
                key={pin.id}
                data-site-plan-marker
                className={`absolute z-[9] -translate-x-1/2 -translate-y-full touch-none ${
                  interactionMode === INTERACTION_MARKER ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
                }`}
                style={{
                  left: `${containerPoint.x + dragOffset.x}px`,
                  top: `${containerPoint.y + dragOffset.y}px`,
                  transform: 'translate(-50%, -100%)',
                }}
                onPointerDown={(event) => onAnnotationPinPointerDown?.(event, pin.id)}
                onPointerMove={onAnnotationPinPointerMove}
                onPointerUp={onAnnotationPinPointerUp}
                onPointerCancel={onAnnotationPinPointerUp}
              >
                <span
                  className={`relative flex h-4 w-4 items-center justify-center rounded-full border-2 border-white text-[8px] font-bold text-white shadow-md ${
                    active ? 'bg-[#ea580c] ring-2 ring-[#fdba74]' : 'bg-[#f59e0b]'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="absolute left-1/2 top-full h-1.5 w-0.5 -translate-x-1/2 bg-[#f59e0b]" />
                {pin.comment ? (
                  <span
                    className={`absolute left-1/2 top-0 ml-2 max-w-[140px] -translate-y-1 rounded px-1.5 py-0.5 text-[9px] font-medium leading-tight shadow ${
                      active ? 'bg-[#fff7ed] text-[#9a3412] border border-[#fdba74]' : 'bg-white/95 text-[#78350f] border border-[#fde68a]'
                    }`}
                  >
                    {pin.comment}
                  </span>
                ) : null}
              </div>
            )
          })}

          {pinContainerPoint && pointLocation ? (
            <button
              type="button"
              data-site-plan-pin
              aria-label="Déplacer le point chantier"
              className="absolute z-10 -translate-x-1/2 -translate-y-full cursor-grab touch-none active:cursor-grabbing"
              style={{
                left: `${pinContainerPoint.x + pinDragOffset.x + dragOffset.x}px`,
                top: `${pinContainerPoint.y + pinDragOffset.y + dragOffset.y}px`,
                transform: 'translate(-50%, -100%)',
              }}
              onPointerDown={onPinPointerDown}
              onPointerMove={onPinPointerMove}
              onPointerUp={onPinPointerUp}
              onPointerCancel={onPinPointerUp}
            >
              <span className="relative flex h-5 w-5 items-center justify-center rounded-full border-[3px] border-white bg-[#e03131] shadow-md">
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
              <span className="absolute left-1/2 top-full h-2 w-0.5 -translate-x-1/2 bg-[#e03131]" />
            </button>
          ) : null}
        </>
      ) : (
        <div className="flex min-h-[min(58vh,640px)] flex-col items-center justify-center gap-2 px-6 text-center text-[#69758a]">
          {isBusy || isPreviewLoading ? <Loader2 size={24} className="animate-spin" /> : <MapPin size={28} className="opacity-50" />}
          <div className="text-[12px] leading-relaxed">
            Localisation et aperçu carte en cours…
          </div>
        </div>
      )}
    </div>
  )
}

export { normalizeZones, createZone, updateZonePoint, normalizePins, createPin }
