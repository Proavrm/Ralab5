import { useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, FileUp, Loader2, ImageIcon, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import SitePlanZonePanel, {
  INTERACTION_MAP,
  INTERACTION_PIN,
  INTERACTION_MARKER,
  INTERACTION_ZONE,
  INTERACTION_CADRAGE,
  SitePlanMapViewport,
  normalizeZones,
  normalizePins,
  createPin,
  updateZonePoint,
} from '@/components/demande/SitePlanZoneEditor'
import {
  isAcceptedPlanSituationFile,
  isPlanSituationType,
  isPlansType,
  needsPlanImageConversion,
  normalizeDocumentDropTypes,
  ITINERARY_TYPE,
  PLAN_SITUATION_TYPE,
  PLANS_TYPE,
} from '@/lib/documentDropCatalog'
import {
  buildGeocodeLocalityQuery,
  buildGeocodeStreetQuery,
  combineAddressLabel,
} from '@/lib/sitePlanRequirements'
import { buildDistanceToLabCaption } from '@/lib/labGeo'
import { updatePinPoint } from '@/lib/sitePlanPins'
import {
  MAP_ZOOM_DEFAULT,
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  computeViewForGeoPoints,
  computeViewForImagePercentRect,
  transformImagePercentAcrossView,
  geoToImagePercent,
  imagePercentToGeo,
  offsetMapCenter,
  routeGeoToImagePercents,
  zoomLabel,
} from '@/lib/sitePlanMapView'
import {
  a4CaptureDimensions,
  A4_ORIENTATION_LANDSCAPE,
  A4_ORIENTATION_PORTRAIT,
  clientPointToImagePercent,
  orientationFromMeta,
} from '@/lib/sitePlanImageCoords'

function renderOrientationToggle(value, onChange, disabled = false) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-border">
      {[
        { id: A4_ORIENTATION_PORTRAIT, label: 'Portrait' },
        { id: A4_ORIENTATION_LANDSCAPE, label: 'Paysage' },
      ].map((option) => {
        const active = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`px-2.5 py-1 text-[11px] transition-colors ${
              active
                ? 'bg-[#eef4ff] font-semibold text-[#1e3a8a]'
                : 'bg-white text-[#334155] hover:bg-[#f8fafc]'
            } disabled:opacity-40`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function DocumentDropModal({
  open,
  file,
  initialDocumentType = '',
  initialStep = 'type',
  documentTypeOptions = [],
  defaultSiteAddress = '',
  defaultStreet = '',
  defaultLocality = '',
  initialSitePlanMeta = null,
  replaceStoredPath = '',
  replaceItineraryStoredPath = '',
  onClose,
  onUploadFile,
  onCaptureSitePlan,
}) {
  const types = useMemo(
    () => normalizeDocumentDropTypes(documentTypeOptions),
    [documentTypeOptions],
  )

  const [selectedType, setSelectedType] = useState('')
  const [step, setStep] = useState('type')
  const [address, setAddress] = useState('')
  const [streetQuery, setStreetQuery] = useState('')
  const [localityQuery, setLocalityQuery] = useState('')
  const [manualPlacementActive, setManualPlacementActive] = useState(false)
  const [resolvedLocation, setResolvedLocation] = useState(null)
  const [pointLocation, setPointLocation] = useState(null)
  const [mapCenter, setMapCenter] = useState(null)
  const [mapZoom, setMapZoom] = useState(MAP_ZOOM_DEFAULT)
  const [suggestions, setSuggestions] = useState([])
  const [previewPath, setPreviewPath] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const [error, setError] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [pinDragOffset, setPinDragOffset] = useState({ x: 0, y: 0 })
  const [interactionMode, setInteractionMode] = useState(INTERACTION_MAP)
  const [zones, setZones] = useState([])
  const [pins, setPins] = useState([])
  const [selectedPinId, setSelectedPinId] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  const [draftPoints, setDraftPoints] = useState([])
  const [itineraryRoute, setItineraryRoute] = useState([])
  const [itineraryMeta, setItineraryMeta] = useState(null)
  const [isItineraryLoading, setIsItineraryLoading] = useState(false)
  const [itinMapCenter, setItinMapCenter] = useState(null)
  const [itinMapZoom, setItinMapZoom] = useState(MAP_ZOOM_DEFAULT)
  const [itinPreviewPath, setItinPreviewPath] = useState('')
  const [itinPreviewKey, setItinPreviewKey] = useState(0)
  const [isItinPreviewLoading, setIsItinPreviewLoading] = useState(false)
  const [itinDragOffset, setItinDragOffset] = useState({ x: 0, y: 0 })
  const [planOrientation, setPlanOrientation] = useState(A4_ORIENTATION_PORTRAIT)
  const [itinOrientation, setItinOrientation] = useState(A4_ORIENTATION_LANDSCAPE)
  const autoPreviewStarted = useRef(false)
  const previewBlobRef = useRef('')
  const itinPreviewBlobRef = useRef('')
  const panStateRef = useRef(null)
  const itinPanStateRef = useRef(null)
  const pinDragStateRef = useRef(null)
  const annotationPinDragRef = useRef(null)
  const mapContainerRef = useRef(null)
  const itinMapContainerRef = useRef(null)
  const previewTimerRef = useRef(null)
  const itinPreviewTimerRef = useRef(null)
  const previewRequestRef = useRef(0)
  const itinPreviewRequestRef = useRef(0)
  const mapViewRef = useRef({ center: null, zoom: MAP_ZOOM_DEFAULT })
  const itinMapViewRef = useRef({ center: null, zoom: MAP_ZOOM_DEFAULT })
  const itineraryFetchKeyRef = useRef('')

  const isZonageOnly = Boolean(String(replaceStoredPath || '').trim())

  const resolvedLabel = String(resolvedLocation?.label || '').trim()
  const distanceCaption = buildDistanceToLabCaption(resolvedLocation?.distance_to_lab)

  useEffect(() => {
    if (!open) return
    const preset = String(initialDocumentType || PLAN_SITUATION_TYPE).trim()
    const directCapture = initialStep === 'plan-capture'
    const nextType = directCapture
      ? (types.includes(preset) ? preset : PLAN_SITUATION_TYPE)
      : (types.includes(preset) ? preset : '')
    setSelectedType(nextType)
    setStep(directCapture && isPlanSituationType(nextType) ? 'plan-capture' : 'type')
    setAddress(String(defaultSiteAddress || '').trim())
    setStreetQuery(String(defaultStreet || '').trim())
    setLocalityQuery(String(defaultLocality || defaultSiteAddress || '').trim())
    setManualPlacementActive(false)
    setResolvedLocation(null)
    setPointLocation(null)
    setMapCenter(null)
    setMapZoom(MAP_ZOOM_DEFAULT)
    setSuggestions([])
    setPreviewPath('')
    setPreviewKey(0)
    setError('')
    setIsBusy(false)
    setIsPreviewLoading(false)
    setDragOffset({ x: 0, y: 0 })
    setPinDragOffset({ x: 0, y: 0 })
    setInteractionMode(INTERACTION_MAP)
    setZones([])
    setPins([])
    setSelectedPinId(null)
    setSelectedZoneId(null)
    setDraftPoints([])
    setItineraryRoute([])
    setItineraryMeta(null)
    setIsItineraryLoading(false)
    setItinMapCenter(null)
    setItinMapZoom(MAP_ZOOM_DEFAULT)
    setItinPreviewPath('')
    setItinPreviewKey(0)
    setIsItinPreviewLoading(false)
    setItinDragOffset({ x: 0, y: 0 })
    setPlanOrientation(A4_ORIENTATION_PORTRAIT)
    setItinOrientation(A4_ORIENTATION_LANDSCAPE)
    itineraryFetchKeyRef.current = ''
    autoPreviewStarted.current = false
    panStateRef.current = null
    itinPanStateRef.current = null
    pinDragStateRef.current = null
    annotationPinDragRef.current = null
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
    if (itinPreviewTimerRef.current) {
      clearTimeout(itinPreviewTimerRef.current)
      itinPreviewTimerRef.current = null
    }
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current)
      previewBlobRef.current = ''
    }
    if (itinPreviewBlobRef.current) {
      URL.revokeObjectURL(itinPreviewBlobRef.current)
      itinPreviewBlobRef.current = ''
    }
  }, [open, file, initialDocumentType, initialStep, defaultSiteAddress, defaultStreet, defaultLocality, types, initialSitePlanMeta, replaceStoredPath])

  useEffect(() => {
    setAddress(combineAddressLabel(streetQuery, localityQuery))
  }, [streetQuery, localityQuery])

  const planDimensions = useMemo(
    () => a4CaptureDimensions(planOrientation),
    [planOrientation],
  )
  const itinDimensions = useMemo(
    () => a4CaptureDimensions(itinOrientation),
    [itinOrientation],
  )

  async function hydrateFromSitePlanMeta(meta) {
    if (!meta?.lat || !meta?.lon) return
    const nextPlanOrientation = orientationFromMeta(meta)
    setPlanOrientation(nextPlanOrientation)
    const center = {
      lat: meta.map_center_lat ?? meta.lat,
      lon: meta.map_center_lon ?? meta.lon,
    }
    const point = { lat: meta.lat, lon: meta.lon }
    const location = {
      lat: meta.lat,
      lon: meta.lon,
      label: meta.address_label || meta.address_query || defaultSiteAddress,
      distance_to_lab: meta.distance_to_lab || null,
    }
    setAddress(String(meta.address_label || meta.address_query || defaultSiteAddress || '').trim())
    setResolvedLocation(location)
    setPointLocation(point)
    const nextZoom = clampZoom(meta.zoom || MAP_ZOOM_DEFAULT)
    setMapCenter(center)
    setMapZoom(nextZoom)
    syncMapViewRef(center, nextZoom)
    setZones(normalizeZones(meta.zones || []))
    setPins(normalizePins(meta.pins || []))
    setSelectedPinId(null)
    setItineraryRoute([])
    setItineraryMeta(null)
    itineraryFetchKeyRef.current = ''
    setSelectedZoneId(null)
    setDraftPoints([])
    setDragOffset({ x: 0, y: 0 })
    setPinDragOffset({ x: 0, y: 0 })
    await loadMapPreview(center, nextZoom, a4CaptureDimensions(nextPlanOrientation))
  }

  useEffect(() => () => {
    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current)
    }
    if (itinPreviewBlobRef.current) {
      URL.revokeObjectURL(itinPreviewBlobRef.current)
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
    }
    if (itinPreviewTimerRef.current) {
      clearTimeout(itinPreviewTimerRef.current)
    }
  }, [])

  useEffect(() => {
    mapViewRef.current = { center: mapCenter, zoom: mapZoom }
  }, [mapCenter, mapZoom])

  useEffect(() => {
    itinMapViewRef.current = { center: itinMapCenter, zoom: itinMapZoom }
  }, [itinMapCenter, itinMapZoom])

  async function loadMapPreview(center, zoom, dimensions = planDimensions) {
    if (!center?.lat || !center?.lon || !onCaptureSitePlan?.preview) {
      throw new Error('Capture carte indisponible.')
    }
    const preview = await onCaptureSitePlan.preview({
      lat: center.lat,
      lon: center.lon,
      zoom,
      width: dimensions.width,
      height: dimensions.height,
    })
    const blobUrl = preview.blobUrl || preview.previewPath || ''
    if (previewBlobRef.current && previewBlobRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(previewBlobRef.current)
    }
    if (blobUrl.startsWith('blob:')) {
      previewBlobRef.current = blobUrl
    }
    setPreviewPath(blobUrl)
    setPreviewKey((value) => value + 1)
  }

  async function fetchMapPreview(center, zoom) {
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId
    setIsPreviewLoading(true)
    try {
      await loadMapPreview(center, zoom)
    } catch (err) {
      if (requestId === previewRequestRef.current) {
        setError(err?.message || 'Impossible de charger l’aperçu carte.')
      }
    } finally {
      if (requestId === previewRequestRef.current) {
        setIsPreviewLoading(false)
      }
    }
  }

  function scheduleMapPreview(center, zoom, { delay = 0 } = {}) {
    if (!center?.lat || !center?.lon) return
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
    if (delay <= 0) {
      void fetchMapPreview(center, zoom)
      return
    }
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null
      const latest = mapViewRef.current
      const targetCenter = latest.center || center
      const targetZoom = latest.zoom ?? zoom
      void fetchMapPreview(targetCenter, targetZoom)
    }, delay)
  }

  function syncMapViewRef(center, zoom) {
    mapViewRef.current = {
      center: center ?? mapViewRef.current?.center ?? null,
      zoom: zoom ?? mapViewRef.current?.zoom ?? MAP_ZOOM_DEFAULT,
    }
  }

  function clampZoom(value) {
    const n = Math.round(Number(value))
    if (!Number.isFinite(n)) return MAP_ZOOM_DEFAULT
    return Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, n))
  }

  function updateMapZoom(nextZoom, { debounceMs = 400 } = {}) {
    const zoom = clampZoom(nextZoom)
    const center = mapCenter ?? mapViewRef.current?.center
    if (!center?.lat || !center?.lon) return

    setMapZoom(zoom)
    syncMapViewRef(center, zoom)
    scheduleMapPreview(center, zoom, { delay: debounceMs })
  }

  function syncItinMapViewRef(center, zoom) {
    itinMapViewRef.current = {
      center: center ?? itinMapViewRef.current?.center ?? null,
      zoom: zoom ?? itinMapViewRef.current?.zoom ?? MAP_ZOOM_DEFAULT,
    }
  }

  async function loadItinMapPreview(center, zoom, dimensions = itinDimensions) {
    if (!center?.lat || !center?.lon || !onCaptureSitePlan?.preview) {
      throw new Error('Capture carte indisponible.')
    }
    const preview = await onCaptureSitePlan.preview({
      lat: center.lat,
      lon: center.lon,
      zoom,
      width: dimensions.width,
      height: dimensions.height,
    })
    const blobUrl = preview.blobUrl || preview.previewPath || ''
    if (itinPreviewBlobRef.current && itinPreviewBlobRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(itinPreviewBlobRef.current)
    }
    if (blobUrl.startsWith('blob:')) {
      itinPreviewBlobRef.current = blobUrl
    }
    setItinPreviewPath(blobUrl)
    setItinPreviewKey((value) => value + 1)
  }

  async function fetchItinMapPreview(center, zoom) {
    const requestId = itinPreviewRequestRef.current + 1
    itinPreviewRequestRef.current = requestId
    setIsItinPreviewLoading(true)
    try {
      await loadItinMapPreview(center, zoom)
    } catch (err) {
      if (requestId === itinPreviewRequestRef.current) {
        setError(err?.message || 'Impossible de charger l’aperçu itinéraire.')
      }
    } finally {
      if (requestId === itinPreviewRequestRef.current) {
        setIsItinPreviewLoading(false)
      }
    }
  }

  function scheduleItinMapPreview(center, zoom, { delay = 0 } = {}) {
    if (!center?.lat || !center?.lon) return
    if (itinPreviewTimerRef.current) {
      clearTimeout(itinPreviewTimerRef.current)
      itinPreviewTimerRef.current = null
    }
    if (delay <= 0) {
      void fetchItinMapPreview(center, zoom)
      return
    }
    itinPreviewTimerRef.current = setTimeout(() => {
      itinPreviewTimerRef.current = null
      const latest = itinMapViewRef.current
      const targetCenter = latest.center || center
      const targetZoom = latest.zoom ?? zoom
      void fetchItinMapPreview(targetCenter, targetZoom)
    }, delay)
  }

  function updateItinMapZoom(nextZoom, { debounceMs = 400 } = {}) {
    const zoom = clampZoom(nextZoom)
    const center = itinMapCenter ?? itinMapViewRef.current?.center
    if (!center?.lat || !center?.lon) return
    setItinMapZoom(zoom)
    syncItinMapViewRef(center, zoom)
    scheduleItinMapPreview(center, zoom, { delay: debounceMs })
  }

  async function fitItineraryView(route, meta, sitePoint, dimensions = itinDimensions) {
    const points = [
      ...(route || []),
      meta?.labo_lat != null && meta?.labo_lon != null
        ? { lat: meta.labo_lat, lon: meta.labo_lon }
        : null,
      sitePoint,
    ].filter(Boolean)
    const view = computeViewForGeoPoints(
      points,
      dimensions.width,
      dimensions.height,
      10,
    )
    if (!view?.center) return
    setItinMapCenter(view.center)
    setItinMapZoom(view.zoom)
    syncItinMapViewRef(view.center, view.zoom)
    setItinDragOffset({ x: 0, y: 0 })
    await loadItinMapPreview(view.center, view.zoom)
  }

  async function applyResolvedLocation(location, zoom = mapZoom, { manual = false } = {}) {
    const center = { lat: location.lat, lon: location.lon }
    const point = { lat: location.lat, lon: location.lon }
    const nextZoom = clampZoom(zoom)
    setManualPlacementActive(manual)
    setResolvedLocation(location)
    setPointLocation(point)
    setMapCenter(center)
    setMapZoom(nextZoom)
    syncMapViewRef(center, nextZoom)
    setSuggestions([])
    setDragOffset({ x: 0, y: 0 })
    setPinDragOffset({ x: 0, y: 0 })
    setItineraryRoute([])
    setItineraryMeta(null)
    setItinPreviewPath('')
    itineraryFetchKeyRef.current = ''
    if (manual) {
      setInteractionMode(INTERACTION_PIN)
    }
    await loadMapPreview(center, nextZoom)
    if (!isZonageOnly) {
      await refreshItinerary(point)
    }
  }

  async function geocodeQuery(query) {
    if (!onCaptureSitePlan?.geocode) {
      throw new Error('Géocodage indisponible.')
    }
    return onCaptureSitePlan.geocode(String(query || '').trim())
  }

  async function resolveGeocodeResult(result, { onSuggestionsOnly = false } = {}) {
    if (result?.found && result?.location) {
      const location = {
        ...result.location,
        distance_to_lab: result.distance_to_lab || null,
      }
      if (!onSuggestionsOnly) {
        await applyResolvedLocation(location, mapZoom, { manual: false })
      }
      return { ok: true, location }
    }

    const nextSuggestions = Array.isArray(result?.suggestions) ? result.suggestions : []
    setSuggestions(nextSuggestions)
    return { ok: false, suggestions: nextSuggestions }
  }

  async function handleSearchAddress() {
    const query = buildGeocodeStreetQuery(streetQuery, localityQuery)
    if (!query.trim()) {
      setError('Indiquez au minimum la commune ou le code postal.')
      return
    }
    setError('')
    setIsBusy(true)
    setPreviewPath('')
    setResolvedLocation(null)
    setPointLocation(null)
    setMapCenter(null)
    setSuggestions([])
    setManualPlacementActive(false)
    try {
      const result = await geocodeQuery(query)
      const resolved = await resolveGeocodeResult(result)
      if (resolved.ok) return

      if (resolved.suggestions?.length) {
        setError('Adresse exacte introuvable — choisissez une suggestion ou centrez sur le code postal.')
      } else {
        setError('Rue introuvable — essayez « Centrer sur CP / commune » puis placez le pin manuellement.')
      }
    } catch (err) {
      setError(err?.message || 'Impossible de localiser cette adresse.')
      setPreviewPath('')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleCenterOnLocality({ manual = true } = {}) {
    const query = buildGeocodeLocalityQuery(localityQuery)
    if (!query.trim()) {
      setError('Indiquez la commune ou le code postal.')
      return
    }
    setError('')
    setIsBusy(true)
    setPreviewPath('')
    setSuggestions([])
    try {
      const result = await geocodeQuery(query)
      let location = result?.found ? result.location : null
      if (!location && Array.isArray(result?.suggestions) && result.suggestions.length) {
        location = result.suggestions[0]
      }
      if (!location?.lat) {
        setError('Commune ou code postal introuvable — vérifiez le site (identité affaire).')
        return
      }

      const streetLabel = String(streetQuery || '').trim()
      const localityLabel = String(localityQuery || '').trim()
      const label = streetLabel
        ? `${streetLabel}, ${localityLabel} (repère manuel)`
        : `${localityLabel} (repère manuel)`

      await applyResolvedLocation(
        {
          ...location,
          label,
          distance_to_lab: result?.distance_to_lab || location.distance_to_lab || null,
        },
        manual ? 14 : mapZoom,
        { manual },
      )
      setError('')
    } catch (err) {
      setError(err?.message || 'Impossible de centrer sur la commune.')
      setPreviewPath('')
    } finally {
      setIsBusy(false)
    }
  }

  function handleChantierPinPlace(percent) {
    if (!mapCenter?.lat || interactionMode !== INTERACTION_PIN) return
    const nextPoint = imagePercentToGeo(
      mapCenter.lat,
      mapCenter.lon,
      mapZoom,
      percent.x,
      percent.y,
      planDimensions.width,
      planDimensions.height,
    )
    setPointLocation(nextPoint)
    setManualPlacementActive(true)
    if (!replaceStoredPath) {
      itineraryFetchKeyRef.current = ''
    }
    if (!isZonageOnly) {
      void refreshItinerary(nextPoint)
    }
  }

  async function handleCadrageComplete(rect) {
    if (!mapCenter?.lat || isBusy) return
    const view = computeViewForImagePercentRect(
      mapCenter.lat,
      mapCenter.lon,
      mapZoom,
      rect,
      planDimensions.width,
      planDimensions.height,
      4,
    )
    if (!view?.center) return

    const oldCenter = mapCenter
    const oldZoom = mapZoom
    const newCenter = view.center
    const newZoom = clampZoom(view.zoom)

    setZones((current) => normalizeZones(current.map((zone) => ({
      ...zone,
      points: zone.points.map((point) => transformImagePercentAcrossView(
        point.x,
        point.y,
        oldCenter,
        oldZoom,
        newCenter,
        newZoom,
        planDimensions.width,
        planDimensions.height,
      )),
    }))))

    setPins((current) => normalizePins(current.map((pin) => {
      const next = transformImagePercentAcrossView(
        pin.x,
        pin.y,
        oldCenter,
        oldZoom,
        newCenter,
        newZoom,
        planDimensions.width,
        planDimensions.height,
      )
      return { ...pin, x: next.x, y: next.y }
    })))

    setMapCenter(newCenter)
    setMapZoom(newZoom)
    syncMapViewRef(newCenter, newZoom)
    setDragOffset({ x: 0, y: 0 })
    setPinDragOffset({ x: 0, y: 0 })
    setError('')
    setIsBusy(true)
    try {
      await loadMapPreview(newCenter, newZoom)
    } catch (err) {
      setError(err?.message || 'Impossible d’ajuster le cadrage.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleLoadPreview() {
    await handleSearchAddress()
  }

  async function handleSelectSuggestion(suggestion) {
    if (!suggestion) return
    const streetLabel = String(streetQuery || '').trim()
    const localityLabel = String(localityQuery || '').trim()
    if (streetLabel) {
      setStreetQuery(streetLabel)
    }
    if (!localityLabel && suggestion.label) {
      setLocalityQuery(String(suggestion.label).trim())
    }
    setError('')
    setManualPlacementActive(false)
    setIsBusy(true)
    try {
      await applyResolvedLocation(suggestion, mapZoom)
    } catch (err) {
      setError(err?.message || 'Impossible de charger l’aperçu carte.')
    } finally {
      setIsBusy(false)
    }
  }

  function resetMapCenter() {
    if (!resolvedLocation?.lat || !resolvedLocation?.lon) return
    const center = { lat: resolvedLocation.lat, lon: resolvedLocation.lon }
    setMapCenter(center)
    syncMapViewRef(center, mapZoom)
    setDragOffset({ x: 0, y: 0 })
    setPinDragOffset({ x: 0, y: 0 })
    setError('')
    scheduleMapPreview(center, mapZoom, { delay: 0 })
  }

  const pinImagePercent = useMemo(() => {
    const pan = panStateRef.current
    const center = pan && (dragOffset.x || dragOffset.y)
      ? offsetMapCenter(pan.originCenter.lat, pan.originCenter.lon, mapZoom, dragOffset.x, dragOffset.y)
      : mapCenter
    if (!center?.lat || !pointLocation?.lat) return null
    return geoToImagePercent(
      center.lat,
      center.lon,
      pointLocation.lat,
      pointLocation.lon,
      mapZoom,
      planDimensions.width,
      planDimensions.height,
    )
  }, [mapCenter, pointLocation, mapZoom, dragOffset.x, dragOffset.y, planDimensions])

  function resetItinMapCenter() {
    if (!itineraryRoute.length || !pointLocation) return
    void fitItineraryView(itineraryRoute, itineraryMeta, pointLocation)
  }

  const itinPinImagePercent = useMemo(() => {
    if (!pointLocation?.lat || !itinMapCenter?.lat) return null
    const pan = itinPanStateRef.current
    const center = pan && (itinDragOffset.x || itinDragOffset.y)
      ? offsetMapCenter(pan.originCenter.lat, pan.originCenter.lon, itinMapZoom, itinDragOffset.x, itinDragOffset.y)
      : itinMapCenter
    return geoToImagePercent(
      center.lat,
      center.lon,
      pointLocation.lat,
      pointLocation.lon,
      itinMapZoom,
      itinDimensions.width,
      itinDimensions.height,
    )
  }, [itinMapCenter, pointLocation, itinMapZoom, itinDragOffset.x, itinDragOffset.y, itinDimensions])

  const itinRoutePercents = useMemo(() => {
    if (!itineraryRoute.length || !itinMapCenter?.lat) return []
    const pan = itinPanStateRef.current
    const center = pan && (itinDragOffset.x || itinDragOffset.y)
      ? offsetMapCenter(pan.originCenter.lat, pan.originCenter.lon, itinMapZoom, itinDragOffset.x, itinDragOffset.y)
      : itinMapCenter
    return routeGeoToImagePercents(
      center.lat,
      center.lon,
      itineraryRoute,
      itinMapZoom,
      itinDimensions.width,
      itinDimensions.height,
    )
  }, [itineraryRoute, itinMapCenter, itinMapZoom, itinDragOffset.x, itinDragOffset.y, itinDimensions])

  async function refreshItinerary(sitePoint = pointLocation) {
    if (!sitePoint?.lat || !sitePoint?.lon || !onCaptureSitePlan?.fetchItinerary) return
    setIsItineraryLoading(true)
    try {
      const result = await onCaptureSitePlan.fetchItinerary({
        lat: sitePoint.lat,
        lon: sitePoint.lon,
      })
      const route = Array.isArray(result?.route) ? result.route : []
      setItineraryRoute(route)
      setItineraryMeta(result || null)
      itineraryFetchKeyRef.current = `${sitePoint.lat},${sitePoint.lon}`
      if (route.length >= 2) {
        await fitItineraryView(route, result, sitePoint)
      }
    } catch (err) {
      setItineraryRoute([])
      setItineraryMeta(null)
      setItinPreviewPath('')
      setError(err?.message || 'Impossible de calculer l’itinéraire routier.')
    } finally {
      setIsItineraryLoading(false)
    }
  }

  useEffect(() => {
    if (isZonageOnly || !pointLocation?.lat || !pointLocation?.lon || !onCaptureSitePlan?.fetchItinerary) return
    const key = `${pointLocation.lat},${pointLocation.lon}`
    if (itineraryFetchKeyRef.current === key) return
    const timer = setTimeout(() => {
      void refreshItinerary(pointLocation)
    }, 350)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointLocation?.lat, pointLocation?.lon, replaceStoredPath, onCaptureSitePlan?.fetchItinerary])

  useEffect(() => {
    if (!mapCenter?.lat || !mapCenter?.lon) return
    scheduleMapPreview(mapCenter, mapZoom, { delay: 150 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planOrientation])

  useEffect(() => {
    if (!itinMapCenter?.lat || !itinMapCenter?.lon) return
    scheduleItinMapPreview(itinMapCenter, itinMapZoom, { delay: 150 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinOrientation])

  function onMapPointerDown(event) {
    if (!mapCenter || isBusy || pinDragStateRef.current || interactionMode !== INTERACTION_MAP) return
    if (event.button !== 0) return
    panStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originCenter: { ...mapCenter },
    }
    setDragOffset({ x: 0, y: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onMapPointerMove(event) {
    const pan = panStateRef.current
    if (!pan) return
    setDragOffset({
      x: event.clientX - pan.startX,
      y: event.clientY - pan.startY,
    })
  }

  function onMapPointerUp(event) {
    const pan = panStateRef.current
    panStateRef.current = null
    if (!pan) return

    const dx = event.clientX - pan.startX
    const dy = event.clientY - pan.startY
    setDragOffset({ x: 0, y: 0 })

    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return

    const nextCenter = offsetMapCenter(pan.originCenter.lat, pan.originCenter.lon, mapZoom, dx, dy)
    setMapCenter(nextCenter)
    syncMapViewRef(nextCenter, mapZoom)
    setError('')
    scheduleMapPreview(nextCenter, mapZoom, { delay: 0 })
  }

  function onPinPointerDown(event) {
    if (!mapCenter || isBusy || interactionMode !== INTERACTION_PIN) return
    if (event.button !== 0) return
    event.stopPropagation()
    pinDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
    }
    setPinDragOffset({ x: 0, y: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPinPointerMove(event) {
    const drag = pinDragStateRef.current
    if (!drag) return
    event.stopPropagation()
    setPinDragOffset({
      x: event.clientX - drag.startX,
      y: event.clientY - drag.startY,
    })
  }

  function onPinPointerUp(event) {
    const drag = pinDragStateRef.current
    pinDragStateRef.current = null
    if (!drag || !mapCenter) return
    event.stopPropagation()

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    setPinDragOffset({ x: 0, y: 0 })

    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return

    const rect = mapContainerRef.current?.getBoundingClientRect()
    if (!rect) return
    const percent = clientPointToImagePercent(rect, event.clientX, event.clientY, planDimensions.aspect)
    const nextPoint = imagePercentToGeo(
      mapCenter.lat,
      mapCenter.lon,
      mapZoom,
      percent.x,
      percent.y,
      planDimensions.width,
      planDimensions.height,
    )
    setPointLocation(nextPoint)
    setManualPlacementActive(true)
    if (!replaceStoredPath) {
      itineraryFetchKeyRef.current = ''
    }
    if (!isZonageOnly) {
      void refreshItinerary(nextPoint)
    }
  }

  function handleAddMarker(point) {
    const nextPin = createPin(pins.length, point)
    if (!nextPin) return
    setPins((current) => [...current, nextPin])
    setSelectedPinId(nextPin.id)
    setSelectedZoneId(null)
    setDraftPoints([])
  }

  function onAnnotationPinPointerDown(event, pinId) {
    if (interactionMode !== INTERACTION_MARKER || isBusy) return
    event.stopPropagation()
    event.preventDefault()
    annotationPinDragRef.current = {
      pinId,
      startX: event.clientX,
      startY: event.clientY,
    }
    setSelectedPinId(pinId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onAnnotationPinPointerMove(event) {
    if (!annotationPinDragRef.current) return
    event.stopPropagation()
  }

  function onAnnotationPinPointerUp(event) {
    const drag = annotationPinDragRef.current
    annotationPinDragRef.current = null
    if (!drag) return
    event.stopPropagation()

    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY

    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      setSelectedPinId(drag.pinId)
      return
    }

    const rect = mapContainerRef.current?.getBoundingClientRect()
    if (!rect) return
    const percent = clientPointToImagePercent(rect, event.clientX, event.clientY, planDimensions.aspect)
    setPins((current) => updatePinPoint(current, drag.pinId, percent))
    setSelectedPinId(drag.pinId)
  }

  function onItinMapPointerDown(event) {
    if (!itinMapCenter || isBusy || itinPanStateRef.current) return
    if (event.button !== 0) return
    itinPanStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originCenter: { ...itinMapCenter },
    }
    setItinDragOffset({ x: 0, y: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onItinMapPointerMove(event) {
    const pan = itinPanStateRef.current
    if (!pan) return
    setItinDragOffset({
      x: event.clientX - pan.startX,
      y: event.clientY - pan.startY,
    })
  }

  function onItinMapPointerUp(event) {
    const pan = itinPanStateRef.current
    itinPanStateRef.current = null
    if (!pan) return

    const dx = event.clientX - pan.startX
    const dy = event.clientY - pan.startY
    setItinDragOffset({ x: 0, y: 0 })

    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return

    const nextCenter = offsetMapCenter(pan.originCenter.lat, pan.originCenter.lon, itinMapZoom, dx, dy)
    setItinMapCenter(nextCenter)
    syncItinMapViewRef(nextCenter, itinMapZoom)
    scheduleItinMapPreview(nextCenter, itinMapZoom, { delay: 0 })
  }

  const fileLabel = String(file?.name || '').trim()
  const acceptedPlanFile = isAcceptedPlanSituationFile(file)
  const planTypeSelected = isPlanSituationType(selectedType)
  const plansTypeSelected = isPlansType(selectedType)
  const planNeedsConversion = plansTypeSelected && needsPlanImageConversion(file)

  async function uploadSelectedFile(documentType) {
    if (!file || typeof onUploadFile !== 'function') {
      setError('Fichier ou envoi indisponible.')
      return
    }
    setIsBusy(true)
    setError('')
    try {
      await onUploadFile(file, { documentType, source: 'file' })
      onClose()
    } catch (err) {
      setError(err?.message || 'Échec de l’envoi du fichier.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleContinueFromType() {
    if (!selectedType) {
      setError('Choisissez un type de document.')
      return
    }
    setError('')

    if (planTypeSelected && file && !acceptedPlanFile) {
      setStep('plan-capture')
      return
    }

    if (planTypeSelected && !file) {
      setStep('plan-capture')
      return
    }

    if (plansTypeSelected && file && planNeedsConversion) {
      setStep('plan-convert')
      setIsBusy(true)
      setError('')
      try {
        await onUploadFile(file, { documentType: PLANS_TYPE, source: 'file' })
        onClose()
      } catch (err) {
        setError(err?.message || 'Échec de la conversion du plan.')
      } finally {
        setIsBusy(false)
      }
      return
    }

    if (!file || typeof onUploadFile !== 'function') {
      setError('Fichier ou envoi indisponible.')
      return
    }

    setIsBusy(true)
    try {
      await onUploadFile(file, { documentType: selectedType, source: 'file' })
      onClose()
    } catch (err) {
      setError(err?.message || 'Échec de l’envoi du fichier.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSaveCapture() {
    const label = combineAddressLabel(streetQuery, localityQuery)
    if (!label.trim()) {
      setError('Indiquez au minimum la commune ou le code postal.')
      return
    }
    const center = mapCenter
    const point = pointLocation || resolvedLocation
    if (!center?.lat || !center?.lon || !point?.lat || !point?.lon) {
      setError('Localisez le chantier (recherche rue, centrage CP ou pin manuel sur la carte).')
      return
    }
    if (!onCaptureSitePlan?.save) {
      setError('Capture carte indisponible.')
      return
    }
    if (!isZonageOnly && itineraryRoute.length < 2) {
      setError('Itinéraire en cours de calcul — réessayez dans un instant.')
      return
    }
    if (!isZonageOnly && (!itinMapCenter?.lat || !onCaptureSitePlan?.saveItinerary)) {
      setError('Capture itinéraire indisponible.')
      return
    }
    setIsBusy(true)
    setError('')
    try {
      const savedPlan = await onCaptureSitePlan.save({
        address: label.trim(),
        lat: point.lat,
        lon: point.lon,
        mapCenterLat: center.lat,
        mapCenterLon: center.lon,
        addressLabel: resolvedLocation?.label || label.trim(),
        zoom: mapZoom,
        zones,
        pins,
        replaceStoredPath: String(replaceStoredPath || '').trim(),
        orientation: planOrientation,
      })
      let savedItinerary = null
      if (!isZonageOnly) {
        savedItinerary = await onCaptureSitePlan.saveItinerary({
          address: label.trim(),
          lat: point.lat,
          lon: point.lon,
          mapCenterLat: itinMapCenter.lat,
          mapCenterLon: itinMapCenter.lon,
          addressLabel: resolvedLocation?.label || label.trim(),
          zoom: itinMapZoom,
          itineraryRoute,
          replaceStoredPath: String(replaceItineraryStoredPath || '').trim(),
          orientation: itinOrientation,
        })
      }
      await onUploadFile(null, {
        documentType: PLAN_SITUATION_TYPE,
        source: 'map_capture',
        uploadResult: savedPlan,
        secondaryCapture: savedItinerary
          ? { documentType: ITINERARY_TYPE, uploadResult: savedItinerary }
          : null,
        address: savedPlan?.capture?.address_label || resolvedLocation?.label || label.trim(),
      })
      onClose()
    } catch (err) {
      setError(err?.message || 'Échec de la capture carte.')
    } finally {
      setIsBusy(false)
    }
  }

  useEffect(() => {
    if (!open || step !== 'plan-capture' || autoPreviewStarted.current) return
    autoPreviewStarted.current = true
    if (initialSitePlanMeta?.lat && initialSitePlanMeta?.lon) {
      setIsBusy(true)
      hydrateFromSitePlanMeta(initialSitePlanMeta)
        .catch((err) => setError(err?.message || 'Impossible de charger le plan existant.'))
        .finally(() => setIsBusy(false))
      return
    }
    if (!String(address || '').trim() || !onCaptureSitePlan?.geocode) return
    handleLoadPreview()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, address, initialSitePlanMeta])

  async function handleUseFileAnyway() {
    if (!file || typeof onUploadFile !== 'function') return
    setIsBusy(true)
    setError('')
    try {
      await onUploadFile(file, { documentType: PLAN_SITUATION_TYPE, source: 'file' })
      onClose()
    } catch (err) {
      setError(err?.message || 'Échec de l’envoi du fichier.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        step === 'plan-capture'
          ? (isZonageOnly
            ? 'Plan de situation — zonage chantier'
            : 'Plan de situation et itinéraire — capture chantier')
          : step === 'plan-convert'
            ? 'Plans — conversion en image'
            : 'Type de document'
      }
      size={step === 'plan-capture' ? '4xl' : step === 'plan-convert' ? 'lg' : 'lg'}
    >
      <div className="flex flex-col gap-4">
        {fileLabel ? (
          <div className="flex items-start gap-3 rounded-xl border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3">
            <FileUp size={18} className="mt-0.5 shrink-0 text-[#3b5bdb]" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#69758a]">Fichier déposé</div>
              <div className="truncate text-sm font-medium text-[#172033]">{fileLabel}</div>
            </div>
          </div>
        ) : null}

        {step === 'type' ? (
          <>
            <div>
              <div className="mb-2 text-[12px] font-medium text-[#172033]">
                Quel type de document déposez-vous ?
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {types.map((type) => {
                  const active = selectedType === type
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedType(type)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-[12px] transition-colors ${
                        active
                          ? 'border-[#3b5bdb] bg-[#eef4ff] text-[#1e3a8a] font-semibold'
                          : 'border-[#dbe1ea] bg-white text-[#334155] hover:border-[#94a3b8]'
                      }`}
                    >
                      {type}
                    </button>
                  )
                })}
              </div>
            </div>

            {plansTypeSelected && file && !planNeedsConversion ? (
              <div className="rounded-xl border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[12px] leading-relaxed text-[#334155]">
                Ce plan image sera enregistré dans le dossier <strong>Plans</strong> de l’affaire, utilisable par le plan d’implantation.
              </div>
            ) : null}

            {plansTypeSelected && file && planNeedsConversion ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
                Ce fichier sera converti en image PNG pour le plan d’implantation, puis enregistré dans le dossier <strong>Plans</strong> de l’affaire.
              </div>
            ) : null}

            {planTypeSelected && file && !acceptedPlanFile ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
                Ce fichier n’est pas un plan image/PDF classique. Vous pourrez capturer une vue carte du chantier à l’étape suivante, ou forcer l’envoi du fichier tel quel.
              </div>
            ) : null}

            {planTypeSelected ? (
              <button
                type="button"
                onClick={() => setStep('plan-capture')}
                className="text-left text-[12px] text-[#3b5bdb] hover:underline"
              >
                {defaultSiteAddress.trim()
                  ? 'Générer le plan de situation depuis l’adresse ouvrage'
                  : 'Capturer un plan de situation depuis une adresse'}
              </button>
            ) : null}

            {error ? <div className="text-[12px] text-danger">{error}</div> : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={isBusy}>
                Annuler
              </Button>
              <Button size="sm" onClick={handleContinueFromType} disabled={isBusy || !selectedType}>
                {isBusy ? 'Envoi…' : 'Continuer'}
              </Button>
            </div>
          </>
        ) : null}

        {step === 'plan-convert' ? (
          <>
            <div className="rounded-2xl border border-[#dbe1ea] overflow-hidden bg-white">
              <div className="flex items-center gap-2 border-b border-[#dbe1ea] bg-[#f8fafc] px-4 py-3">
                <ImageIcon size={16} className="text-[#3b5bdb]" />
                <div className="text-[13px] font-semibold text-[#172033]">Conversion pour plan d’implantation</div>
              </div>
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                <Loader2 size={32} className="animate-spin text-[#3b5bdb]" />
                <div className="text-[13px] font-medium text-[#172033]">
                  Conversion du plan en image…
                </div>
                <div className="max-w-md text-[12px] leading-relaxed text-[#69758a]">
                  {fileLabel
                    ? `« ${fileLabel} » est en cours de conversion en PNG, puis sera déposé dans Plans/ pour le plan d’implantation.`
                    : 'Conversion en cours…'}
                </div>
              </div>
            </div>

            {error ? <div className="text-[12px] text-danger">{error}</div> : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={isBusy}>
                {error ? 'Fermer' : 'Annuler'}
              </Button>
              {error ? (
                <Button size="sm" onClick={() => uploadSelectedFile(PLANS_TYPE)} disabled={isBusy}>
                  Réessayer
                </Button>
              ) : null}
            </div>
          </>
        ) : null}

        {step === 'plan-capture' ? (
          <>
            <div className="rounded-2xl border border-[#dbe1ea] overflow-hidden bg-white">
              <div className="flex items-center gap-2 border-b border-[#dbe1ea] bg-[#f8fafc] px-4 py-3">
                <MapPin size={16} className="text-[#3b5bdb]" />
                <div className="text-[13px] font-semibold text-[#172033]">Localiser le chantier</div>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-[#69758a]">Rue (numéro optionnel)</span>
                    <input
                      value={streetQuery}
                      onChange={(event) => setStreetQuery(event.target.value)}
                      placeholder="Ex. avenue de la République"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-accent"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-[#69758a]">Commune / code postal</span>
                    <input
                      value={localityQuery}
                      onChange={(event) => setLocalityQuery(event.target.value)}
                      placeholder="Ex. Lyon (69002)"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-accent"
                    />
                  </label>
                </div>
                {(defaultStreet.trim() || defaultLocality.trim()) ? (
                  <div className="text-[11px] text-[#69758a] leading-relaxed">
                    Reprise depuis l’identité affaire : adresse ouvrage + site (commune / CP).
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={handleSearchAddress} disabled={isBusy}>
                    {isBusy ? 'Recherche…' : 'Rechercher la rue'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleCenterOnLocality()} disabled={isBusy}>
                    Centrer sur CP / commune
                  </Button>
                  {file ? (
                    <Button size="sm" variant="secondary" onClick={handleUseFileAnyway} disabled={isBusy}>
                      Utiliser le fichier quand même
                    </Button>
                  ) : null}
                </div>
                {manualPlacementActive && mapCenter ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
                    Repère manuel : « Centrer sur CP / commune » puis utilisez <strong>Cadrage</strong> pour zoomer sur la rue,
                    l’outil <strong>Pin chantier</strong> pour placer le point rouge, et <strong>Carte</strong> pour naviguer.
                  </div>
                ) : null}

                {suggestions.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-950">
                      Suggestions d’adresse
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {suggestions.map((item) => {
                        const caption = buildDistanceToLabCaption(item.distance_to_lab)
                        return (
                          <button
                            key={`${item.lat}-${item.lon}-${item.label}`}
                            type="button"
                            onClick={() => handleSelectSuggestion(item)}
                            disabled={isBusy}
                            className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-left text-[12px] leading-snug text-[#334155] hover:border-[#3b5bdb] hover:bg-[#eef4ff] disabled:opacity-50"
                          >
                            <div>{item.label}</div>
                            {caption ? (
                              <div className="mt-0.5 text-[11px] text-[#69758a]">{caption}</div>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[#dbe1ea] overflow-hidden bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-[#dbe1ea] bg-[#f8fafc] px-4 py-3">
                <MapPin size={16} className="text-[#3b5bdb]" />
                <div className="text-[13px] font-semibold text-[#172033]">Plan de situation</div>
                <span className="text-[10px] text-[#69758a]">Format A4 · molette = scroll du modal</span>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2">
                  <span className="text-[11px] font-medium text-[#69758a]">Format</span>
                  {renderOrientationToggle(planOrientation, setPlanOrientation, isBusy || !mapCenter)}
                  <span className="text-[11px] font-medium text-[#69758a] ml-2">Zoom</span>
                  <button
                    type="button"
                    onClick={() => updateMapZoom(Number(mapZoom) - 1, { debounceMs: 0 })}
                    disabled={mapZoom <= MAP_ZOOM_MIN || !mapCenter}
                    className="rounded border border-border bg-white p-1 hover:border-accent disabled:opacity-40"
                    title="Zoom arrière"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <input
                    type="range"
                    min={MAP_ZOOM_MIN}
                    max={MAP_ZOOM_MAX}
                    value={mapZoom}
                    disabled={!mapCenter}
                    onChange={(event) => updateMapZoom(Number(event.target.value), { debounceMs: 450 })}
                    className="min-w-[120px] flex-1 accent-accent disabled:opacity-40"
                  />
                  <button
                    type="button"
                    onClick={() => updateMapZoom(Number(mapZoom) + 1, { debounceMs: 0 })}
                    disabled={mapZoom >= MAP_ZOOM_MAX || !mapCenter}
                    className="rounded border border-border bg-white p-1 hover:border-accent disabled:opacity-40"
                    title="Zoom avant"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <span className="text-[11px] text-[#69758a]">{zoomLabel(mapZoom)}</span>
                  <button
                    type="button"
                    onClick={resetMapCenter}
                    disabled={!resolvedLocation?.lat}
                    className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-white px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
                    title="Recentrer sur l’adresse géocodée"
                  >
                    <RotateCcw size={12} />
                    Recentrer
                  </button>
                </div>

                <SitePlanZonePanel
                  interactionMode={interactionMode}
                  onInteractionModeChange={setInteractionMode}
                  zones={zones}
                  onZonesChange={setZones}
                  selectedZoneId={selectedZoneId}
                  onSelectedZoneIdChange={setSelectedZoneId}
                  draftPoints={draftPoints}
                  onDraftPointsChange={setDraftPoints}
                  pins={pins}
                  onPinsChange={setPins}
                  selectedPinId={selectedPinId}
                  onSelectedPinIdChange={setSelectedPinId}
                  disabled={isBusy || !mapCenter}
                />

                <SitePlanMapViewport
                  previewPath={previewPath}
                  previewKey={previewKey}
                  mapCenter={mapCenter}
                  pointLocation={pointLocation}
                  mapZoom={mapZoom}
                  dragOffset={dragOffset}
                  pinImagePercent={pinImagePercent}
                  pinDragOffset={pinDragOffset}
                  zones={zones}
                  pins={pins}
                  selectedPinId={selectedPinId}
                  draftPoints={draftPoints}
                  selectedZoneId={selectedZoneId}
                  interactionMode={interactionMode}
                  isBusy={isBusy}
                  isPreviewLoading={isPreviewLoading}
                  resolvedLabel={resolvedLabel}
                  distanceCaption={distanceCaption}
                  mapContainerRef={mapContainerRef}
                  onMapPointerDown={onMapPointerDown}
                  onMapPointerMove={onMapPointerMove}
                  onMapPointerUp={onMapPointerUp}
                  onPinPointerDown={onPinPointerDown}
                  onPinPointerMove={onPinPointerMove}
                  onPinPointerUp={onPinPointerUp}
                  onMapClick={(point) => setDraftPoints((current) => [...current, point])}
                  onChantierPinPlace={handleChantierPinPlace}
                  onCadrageComplete={handleCadrageComplete}
                  onMarkerClick={handleAddMarker}
                  onAnnotationPinPointerDown={onAnnotationPinPointerDown}
                  onAnnotationPinPointerMove={onAnnotationPinPointerMove}
                  onAnnotationPinPointerUp={onAnnotationPinPointerUp}
                  onVertexDrag={(zoneId, pointIndex, point) => {
                    setZones((current) => updateZonePoint(current, zoneId, pointIndex, point))
                  }}
                  viewportMaxHeight="min(56vh,780px)"
                  imageAspect={planDimensions.aspect}
                />
              </div>
            </div>

            {!isZonageOnly ? (
              <div className="rounded-2xl border border-[#dbe1ea] overflow-hidden bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b border-[#dbe1ea] bg-[#f8fafc] px-4 py-3">
                  <MapPin size={16} className="text-[#7c3aed]" />
                  <div className="text-[13px] font-semibold text-[#172033]">Itinéraire routier (labo → chantier)</div>
                  <span className="text-[10px] text-[#69758a]">Format A4 · molette = scroll du modal</span>
                  {isItineraryLoading ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#69758a]">
                      <Loader2 size={12} className="animate-spin" />
                      Calcul…
                    </span>
                  ) : null}
                  {itineraryMeta?.driving_distance_text ? (
                    <span className="text-[10px] text-[#69758a]">
                      {itineraryMeta.driving_distance_text}
                      {itineraryMeta.driving_duration_min != null
                        ? ` · ~${itineraryMeta.driving_duration_min} min`
                        : ''}
                    </span>
                  ) : null}
                </div>
                <div className="p-4 flex flex-col gap-3">
                  <div className="text-[11px] text-[#69758a] leading-relaxed">
                    Carré bleu = laboratoire · ligne violette = route · pin rouge = chantier
                  </div>
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2">
                    <span className="text-[11px] font-medium text-[#69758a]">Format</span>
                    {renderOrientationToggle(itinOrientation, setItinOrientation, isBusy || !itinMapCenter)}
                    <span className="text-[11px] font-medium text-[#69758a] ml-2">Zoom</span>
                    <button
                      type="button"
                      onClick={() => updateItinMapZoom(Number(itinMapZoom) - 1, { debounceMs: 0 })}
                      disabled={itinMapZoom <= MAP_ZOOM_MIN || !itinMapCenter}
                      className="rounded border border-border bg-white p-1 hover:border-accent disabled:opacity-40"
                      title="Zoom arrière"
                    >
                      <ZoomOut size={14} />
                    </button>
                    <input
                      type="range"
                      min={MAP_ZOOM_MIN}
                      max={MAP_ZOOM_MAX}
                      value={itinMapZoom}
                      disabled={!itinMapCenter}
                      onChange={(event) => updateItinMapZoom(Number(event.target.value), { debounceMs: 450 })}
                      className="min-w-[120px] flex-1 accent-accent disabled:opacity-40"
                    />
                    <button
                      type="button"
                      onClick={() => updateItinMapZoom(Number(itinMapZoom) + 1, { debounceMs: 0 })}
                      disabled={itinMapZoom >= MAP_ZOOM_MAX || !itinMapCenter}
                      className="rounded border border-border bg-white p-1 hover:border-accent disabled:opacity-40"
                      title="Zoom avant"
                    >
                      <ZoomIn size={14} />
                    </button>
                    <span className="text-[11px] text-[#69758a]">{zoomLabel(itinMapZoom)}</span>
                    <button
                      type="button"
                      onClick={resetItinMapCenter}
                      disabled={!itineraryRoute.length}
                      className="ml-auto inline-flex items-center gap-1 rounded border border-border bg-white px-2 py-1 text-[11px] hover:border-accent disabled:opacity-40"
                      title="Recadrer sur l’itinéraire complet"
                    >
                      <RotateCcw size={12} />
                      Recadrer route
                    </button>
                  </div>

                  <SitePlanMapViewport
                    previewPath={itinPreviewPath}
                    previewKey={itinPreviewKey}
                    mapCenter={itinMapCenter}
                    pointLocation={pointLocation}
                    mapZoom={itinMapZoom}
                    dragOffset={itinDragOffset}
                    pinImagePercent={itinPinImagePercent}
                    pinDragOffset={{ x: 0, y: 0 }}
                    zones={[]}
                    draftPoints={[]}
                    selectedZoneId={null}
                    interactionMode={INTERACTION_MAP}
                    isBusy={isBusy}
                    isPreviewLoading={isItinPreviewLoading || isItineraryLoading}
                    resolvedLabel={itineraryMeta?.labo_label || ''}
                    distanceCaption={itineraryMeta?.driving_distance_text || ''}
                    mapContainerRef={itinMapContainerRef}
                    onMapPointerDown={onItinMapPointerDown}
                    onMapPointerMove={onItinMapPointerMove}
                    onMapPointerUp={onItinMapPointerUp}
                    onPinPointerDown={() => {}}
                    onPinPointerMove={() => {}}
                    onPinPointerUp={() => {}}
                    itineraryRoutePercents={itinRoutePercents}
                    viewportMaxHeight="min(48vh,680px)"
                    imageAspect={itinDimensions.aspect}
                  />
                </div>
              </div>
            ) : null}

            {error ? <div className="text-[12px] text-danger">{error}</div> : null}

            <div className="flex justify-between gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStep('type')} disabled={isBusy}>
                Retour
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={onClose} disabled={isBusy}>
                  Annuler
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveCapture}
                  disabled={
                    isBusy
                    || isPreviewLoading
                    || isItinPreviewLoading
                    || isItineraryLoading
                    || !mapCenter?.lat
                    || !pointLocation?.lat
                    || (!isZonageOnly && itineraryRoute.length < 2)
                  }
                >
                  {isBusy
                    ? 'Capture…'
                    : isZonageOnly
                      ? 'Enregistrer le zonage'
                      : 'Enregistrer plan + itinéraire'}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
