import { useRef, useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { plansImplantationApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { WorksheetPageShell, WorksheetSubbar, WorksheetTopbar } from '@/components/layout/FicheLayout'
import { resolveReturnTo } from '@/lib/detailNavigation'
import {
    buildAllowedPointFamilies,
    normalizePointFamily,
    resolveCanvasPointTypeOptions,
} from '@/lib/planImplantationPointTypes'

// ── Constants ──────────────────────────────────────────────────────────────────
const POINT_TYPES = ['Battage', 'Sondage', 'Puits', 'CPT', 'Piézomètre', 'Nivellement', 'Forage', 'Autre']
const PALETTE = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

// Maps canonical backend types → French readable labels for display.
const CANONICAL_TYPE_LABELS = {
    SONDAGE_CAROTTE: 'Sondage carotté',
    SONDAGE_PELLE: 'Sondage à la pelle',
    DENSITE_ENROBES: 'Densité enrobés',
    REPERE: 'Repère',
    OBSERVATION: 'Observation',
}

function displayPointType(type) {
    const key = String(type || '').trim().toUpperCase().replace(/\s+/g, '_')
    return CANONICAL_TYPE_LABELS[key] || String(type || '').trim()
}

// Normalise to canonical key so all variants of the same type share one colour.
function canonicalTypeKey(type) {
    const text = String(type || '').trim().toUpperCase()
    if (text === 'SONDAGE_CAROTTE' || text.includes('CAROT')) return 'SONDAGE_CAROTTE'
    if (text === 'SONDAGE_PELLE' || text.includes('PELLE')) return 'SONDAGE_PELLE'
    if (text === 'DENSITE_ENROBES' || text.includes('DENSITE') || text.includes('ENROBE')) return 'DENSITE_ENROBES'
    if (text === 'REPERE' || text === 'REPÈRE') return 'REPERE'
    if (text === 'OBSERVATION') return 'OBSERVATION'
    return text
}

const _typeColorCache = {}
let _colorIdx = 0
function typeColor(type) {
    if (!type) return '#6b7280'
    const key = canonicalTypeKey(type)
    if (!_typeColorCache[key]) _typeColorCache[key] = PALETTE[_colorIdx++ % PALETTE.length]
    return _typeColorCache[key]
}
function mkId() { return `pt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

function normalizePlanImagePath(rawPath) {
    let path = String(rawPath || '').trim()
    if (!path) return ''

    path = path.replaceAll('\\', '/')

    const storageIdx = path.toLowerCase().lastIndexOf('/storage/')
    if (storageIdx >= 0) {
        path = path.slice(storageIdx + '/storage/'.length)
    }
    if (/^[a-zA-Z]:\//.test(path) && path.includes('/storage/')) {
        const idx = path.toLowerCase().indexOf('/storage/')
        path = path.slice(idx + '/storage/'.length)
    }

    path = path.replace(/^\/+/, '')
    path = path.replace(/^storage\//i, '')
    return path
}

function buildStorageImageUrl(path) {
    if (!path) return null
    // Encode spaces and accents safely while preserving path separators.
    const encoded = encodeURI(path).replace(/#/g, '%23')
    return `/api/storage/${encoded}`
}

function normalizeRect(rect) {
    if (!rect) return null
    const x1 = Math.min(Number(rect.x1), Number(rect.x2))
    const y1 = Math.min(Number(rect.y1), Number(rect.y2))
    const x2 = Math.max(Number(rect.x1), Number(rect.x2))
    const y2 = Math.max(Number(rect.y1), Number(rect.y2))
    return { x1, y1, x2, y2 }
}

function clampPercent(value) {
    return Math.max(0, Math.min(100, Number(value)))
}

function normalizePointCode(value) {
    return String(value || '').trim().toUpperCase()
}

function pointFamilyFromCodeAndType(pointCode, pointType) {
    return normalizePointFamily(pointType, pointCode)
}

function resolvePlanImagePath(plan, canvasEntry) {
    return canvasEntry?.image_path || plan?.fond_plan || plan?.payload?.fond_plan || ''
}

function resolveCanvasForFeuille(plan, selectedFeuilleId) {
    const payload = plan?.payload || {}
    const legacyCanvas = (payload.canvas && typeof payload.canvas === 'object') ? payload.canvas : {}
    const map = (payload.canvas_by_feuille && typeof payload.canvas_by_feuille === 'object') ? payload.canvas_by_feuille : {}

    if (selectedFeuilleId != null) {
        const keyed = map[String(selectedFeuilleId)]
        if (keyed && typeof keyed === 'object') {
            return keyed
        }
        // No cross-feuille fallback.
        return {}
    }
    // With no feuille selected, keep canvas neutral to avoid cross-feuille leakage.
    return {}
}

function filterCanvasPointsForFeuille(points, selectedFeuilleId) {
    const list = Array.isArray(points) ? points : []
    if (selectedFeuilleId == null) return list
    const selected = Number(selectedFeuilleId)
    return list.filter((item) => Number(item?.feuille_id || 0) === selected)
}

function enrichCanvasPointsFromIntervention(canvasPoints, interventionPoints) {
    const byUid = new Map(
        (Array.isArray(interventionPoints) ? interventionPoints : [])
            .filter((item) => item?.uid != null)
            .map((item) => [Number(item.uid), item]),
    )
    return (Array.isArray(canvasPoints) ? canvasPoints : []).map((point) => {
        const db = point?.linked_uid != null ? byUid.get(Number(point.linked_uid)) : null
        if (!db) return point
        return {
            ...point,
            x: point.x ?? db.plan_canvas_x ?? null,
            y: point.y ?? db.plan_canvas_y ?? null,
            geo_x: point.geo_x ?? db.x ?? null,
            geo_y: point.geo_y ?? db.y ?? null,
            z: point.z ?? db.z ?? null,
        }
    })
}

function buildMigratedLegacyCanvasForFeuille(plan, selectedFeuilleId, feuilleReference, interventionPoints) {
    const payload = plan?.payload || {}
    if (selectedFeuilleId == null) return null

    const map = (payload.canvas_by_feuille && typeof payload.canvas_by_feuille === 'object') ? payload.canvas_by_feuille : {}
    const selectedKey = String(selectedFeuilleId)
    if (map[selectedKey] && typeof map[selectedKey] === 'object') return null

    const sourceCanvas = (map.default && typeof map.default === 'object')
        ? map.default
        : ((payload.canvas && typeof payload.canvas === 'object') ? payload.canvas : null)
    if (!sourceCanvas) return null

    const selected = Number(selectedFeuilleId)
    const selectedCodes = new Set(
        (Array.isArray(interventionPoints) ? interventionPoints : [])
            .filter((item) => !item?.is_virtual && Number(item?.feuille_id || 0) === selected)
            .map((item) => normalizePointCode(item?.point_code || ''))
            .filter(Boolean),
    )

    const migrated = { ...sourceCanvas }
    const migratedPoints = Array.isArray(sourceCanvas.points)
        ? sourceCanvas.points
            .map((item) => {
            const point = { ...(item || {}) }
            const compactCode = normalizePointCode(point.code)
            const alreadyAssigned = Number(point.feuille_id || 0) === selected
            const belongsToSelected = point.is_virtual || alreadyAssigned || (compactCode && selectedCodes.has(compactCode))
            if (!belongsToSelected) return null
            if (!point.is_virtual) {
                point.feuille_id = Number(selectedFeuilleId)
                point.feuille_reference = feuilleReference || point.feuille_reference || null
            }
            return point
        })
            .filter(Boolean)
        : []
    migrated.points = migratedPoints
    return migrated
}

function pickMostRecentFeuilleId(feuilles) {
    const list = Array.isArray(feuilles) ? feuilles : []
    if (!list.length) return null
    const latest = [...list].sort((left, right) => {
        const leftDate = String(left?.date_feuille || '')
        const rightDate = String(right?.date_feuille || '')
        if (leftDate !== rightDate) return rightDate.localeCompare(leftDate)
        return Number(right?.id || 0) - Number(left?.id || 0)
    })[0]
    return latest ? Number(latest.id) : null
}

function extractApiErrorDetail(err, fallback = 'Erro ao criar ponto') {
    const direct = err?.response?.data?.detail || err?.detail || err?.message
    if (typeof direct !== 'string' || !direct.trim()) return fallback

    const trimmed = direct.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const parsed = JSON.parse(trimmed)
            if (parsed && typeof parsed.detail === 'string' && parsed.detail.trim()) {
                return parsed.detail.trim()
            }
        } catch {
            // Ignore malformed JSON string and keep original message.
        }
    }
    return trimmed
}

// ── Modal component ────────────────────────────────────────────────────────────
function Modal({ title, children, onConfirm, onCancel, confirmLabel = 'OK', confirmDisabled = false }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
            <div
                className="bg-surface rounded-2xl shadow-2xl w-[380px] p-6 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-[15px] font-semibold text-text">{title}</h3>
                {children}
                <div className="flex gap-2 justify-end">
                    <Button variant="secondary" onClick={onCancel}>Annuler</Button>
                    <Button variant="primary" onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</Button>
                </div>
            </div>
        </div>
    )
}

// ── Toolbar button ─────────────────────────────────────────────────────────────
function ToolBtn({ active, onClick, title, children }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`flex items-center justify-center w-9 h-9 rounded-lg text-[13px] font-medium transition-colors ${
                active
                    ? 'bg-nge text-white shadow-sm'
                    : 'bg-bg border border-border text-text-muted hover:bg-surface hover:text-text'
            }`}
        >
            {children}
        </button>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function PlanImplantationCanvasPage() {
    const { uid: planUid } = useParams()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [searchParams] = useSearchParams()
    const initialFeuilleId = (() => {
        const raw = String(searchParams.get('feuille_id') || '').trim()
        if (!raw) return null
        const parsed = Number(raw)
        return Number.isFinite(parsed) ? parsed : null
    })()
    const fallbackReturnTo = resolveReturnTo(searchParams, `/plans-implantation/${planUid}`)

    function handleTrueBack() {
        if (window.history.length > 1) {
            navigate(-1)
            return
        }
        navigate(fallbackReturnTo || `/plans-implantation/${planUid}`)
    }

    // ── Data ──────────────────────────────────────────────────────────────────
    const { data: plan, isLoading, error } = useQuery({
        queryKey: ['plan-implantation', planUid],
        queryFn: () => plansImplantationApi.get(planUid),
        enabled: Boolean(planUid),
    })

    const {
        data: imageFilesData,
        refetch: refetchImageFiles,
        isFetching: isFetchingImageFiles,
    } = useQuery({
        queryKey: ['plan-implantation-image-files', planUid],
        queryFn: () => plansImplantationApi.listImageFiles(planUid),
        enabled: Boolean(planUid),
    })

    // ── Canvas data ───────────────────────────────────────────────────────────
    const [imagePath, setImagePath] = useState('')
    const [calibration, setCalibration] = useState(null) // { x1, y1, x2, y2, real_meters }
    const [zoneRect, setZoneRect] = useState(null)       // { x1, y1, x2, y2 } in %
    const [points, setPoints] = useState([])             // [{ id, code, type, x, y }]
    const [dirty, setDirty] = useState(false)

    // ── Interaction ───────────────────────────────────────────────────────────
    const [mode, setMode] = useState('select')   // pan | calibrate | zone | point | select
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [tempLine, setTempLine] = useState(null)   // { x1,y1,x2,y2 } preview
    const [tempRect, setTempRect] = useState(null)   // { x1,y1,x2,y2 } preview
    const [selectedId, setSelectedId] = useState(null)
    const [isPanning, setIsPanning] = useState(false)
    const [isDraggingPoint, setIsDraggingPoint] = useState(false)
    const [imageLoadError, setImageLoadError] = useState('')
    const [fittedImagePath, setFittedImagePath] = useState('')

    // ── Dialogs ───────────────────────────────────────────────────────────────
    const [dialog, setDialog] = useState(null) // 'calibrate'|'image'|'edit_point'|'dummy_point'
    const [dlgValues, setDlgValues] = useState({})

    // ── Point picker (inline list + create) ──────────────────────────────────
    const [interventionPoints, setInterventionPoints] = useState([])
    const [allowedTypeOptions, setAllowedTypeOptions] = useState([])
    const [feuilleOptions, setFeuilleOptions] = useState([])
    const [selectedFeuilleId, setSelectedFeuilleId] = useState(initialFeuilleId)
    const [pendingPlacement, setPendingPlacement] = useState(null) // { source: 'existing'|'new', uid?, code, type, isVirtual? }
    const [newPointDraft, setNewPointDraft] = useState({ code: '', type: '' })
    const [pointPickerError, setPointPickerError] = useState('')

    // ── Refs ──────────────────────────────────────────────────────────────────
    const containerRef = useRef(null)
    const imageRef = useRef(null)
    const zoomRef = useRef(1)
    const panRef = useRef({ x: 0, y: 0 })
    const dragRef = useRef(null)          // { startMouseX, startMouseY, startPanX, startPanY }
    const rectStartRef = useRef(null)     // norm start of rect drag
    const calibFirstRef = useRef(null)   // first point of calibration line
    const wheelHandlerRef = useRef(null)
    const pointDragRef = useRef(null)     // { pointId, dx, dy }
    const pendingZoneZoomRef = useRef(null)
    const pendingViewportModeRef = useRef(null)
    const legacyMigrationKeyRef = useRef('')

    // Keep refs in sync with state
    useEffect(() => { zoomRef.current = zoom }, [zoom])
    useEffect(() => { panRef.current = pan }, [pan])

    useEffect(() => {
        if (!interventionPoints.length) return
        setPoints((prev) => enrichCanvasPointsFromIntervention(prev, interventionPoints))
    }, [interventionPoints])

    // Load canvas data from plan
    useEffect(() => {
        if (!plan) return
        const c = resolveCanvasForFeuille(plan, selectedFeuilleId)
        const fallbackPath = resolvePlanImagePath(plan, c)
        pendingZoneZoomRef.current = c.zone_rect ? normalizeRect(c.zone_rect) : null
        pendingViewportModeRef.current = c.zone_rect ? 'zone' : 'fit'
        setImagePath(normalizePlanImagePath(fallbackPath))
        setFittedImagePath('')
        setCalibration(c.calibration || null)
        setZoneRect(c.zone_rect || null)
        setPoints(filterCanvasPointsForFeuille(c.points || [], selectedFeuilleId))
        setDirty(false)
    }, [plan, selectedFeuilleId])

    useEffect(() => {
        if (!imagePath) return
        if (!pendingViewportModeRef.current) return
        if (!imageRef.current?.complete) return

        const mode = pendingViewportModeRef.current
        if (mode === 'zone' && pendingZoneZoomRef.current) {
            zoomToZoneRect(pendingZoneZoomRef.current)
        } else {
            fitImageToViewport(true)
        }
        pendingZoneZoomRef.current = null
        pendingViewportModeRef.current = null
    }, [imagePath, selectedFeuilleId])

    function applyInterventionPointsPayload(data) {
        const pointsData = Array.isArray(data?.points) ? data.points : []
        const typeOptions = Array.isArray(data?.allowed_type_options) ? data.allowed_type_options : []
        const feuilles = Array.isArray(data?.feuilles) ? data.feuilles : []
        setInterventionPoints(pointsData)
        setAllowedTypeOptions(typeOptions)
        setFeuilleOptions(feuilles)

        setSelectedFeuilleId((current) => {
            if (current != null && feuilles.some((item) => Number(item.id) === Number(current))) return Number(current)
            const selectedFromApi = Number.isInteger(data?.selected_feuille_id) ? Number(data.selected_feuille_id) : null
            if (selectedFromApi != null) return selectedFromApi
            if (feuilles.length === 1) return Number(feuilles[0].id)
            return pickMostRecentFeuilleId(feuilles)
        })

        setNewPointDraft((prev) => ({
            code: prev.code || '',
            type: prev.type || '',
        }))
    }

    function refreshInterventionPoints(feuilleId = selectedFeuilleId) {
        const params = feuilleId != null ? { feuille_id: Number(feuilleId) } : {}
        return plansImplantationApi.listInterventionPoints(planUid, params)
            .then((data) => applyInterventionPointsPayload(data))
            .catch(() => {})
    }

    // Load intervention points usable in this plan picker
    useEffect(() => {
        if (!planUid) return
        refreshInterventionPoints(selectedFeuilleId)
    }, [planUid, selectedFeuilleId])

    const selectedFeuilleReference = useMemo(
        () => feuilleOptions.find((item) => Number(item.id) === Number(selectedFeuilleId))?.reference || null,
        [feuilleOptions, selectedFeuilleId],
    )

    const pointTypeOptions = useMemo(
        () => resolveCanvasPointTypeOptions({
            feuilleOptions,
            selectedFeuilleId,
            allowedTypeOptions,
        }),
        [feuilleOptions, selectedFeuilleId, allowedTypeOptions],
    )

    useEffect(() => {
        if (!pointTypeOptions.length) return
        setNewPointDraft((prev) => {
            if (prev.type && pointTypeOptions.some((item) => item.value === prev.type)) return prev
            const selectedFeuille = feuilleOptions.find((item) => Number(item.id) === Number(selectedFeuilleId))
            const feuilleFamily = normalizePointFamily(selectedFeuille?.code_feuille || '')
            const preferred = feuilleFamily
                ? pointTypeOptions.find((item) => item.family === feuilleFamily)
                : null
            return { ...prev, type: preferred?.value || pointTypeOptions[0].value }
        })
    }, [pointTypeOptions, feuilleOptions, selectedFeuilleId])

    // One-shot migration: convert legacy canvas to feuille-scoped canvas when needed.
    useEffect(() => {
        if (!plan || selectedFeuilleId == null) return

        const migrationKey = `${planUid}:${selectedFeuilleId}`
        if (legacyMigrationKeyRef.current === migrationKey) return

        const migratedCanvas = buildMigratedLegacyCanvasForFeuille(plan, selectedFeuilleId, selectedFeuilleReference, interventionPoints)
        if (!migratedCanvas) return

        legacyMigrationKeyRef.current = migrationKey
        plansImplantationApi.updateCanvas(planUid, {
            image_path: migratedCanvas.image_path || imagePath || '',
            calibration: migratedCanvas.calibration || null,
            zone_rect: migratedCanvas.zone_rect || null,
            points: migratedCanvas.points || [],
            selected_feuille_id: Number(selectedFeuilleId),
        })
            .then((saved) => {
                queryClient.setQueryData(['plan-implantation', planUid], saved)
                const c = resolveCanvasForFeuille(saved, selectedFeuilleId)
                setImagePath(normalizePlanImagePath(resolvePlanImagePath(plan, c)))
                setCalibration(c.calibration || null)
                setZoneRect(c.zone_rect || null)
                setPoints(filterCanvasPointsForFeuille(c.points || [], selectedFeuilleId))
                setDirty(false)
                refreshInterventionPoints(selectedFeuilleId)
            })
            .catch(() => {
                legacyMigrationKeyRef.current = ''
            })
    }, [plan, selectedFeuilleId, selectedFeuilleReference, interventionPoints, planUid, queryClient, imagePath])

    // ── Save mutation ─────────────────────────────────────────────────────────
    const saveMutation = useMutation({
        mutationFn: () => plansImplantationApi.updateCanvas(planUid, {
            image_path: imagePath,
            calibration,
            zone_rect: zoneRect,
            points,
            selected_feuille_id: selectedFeuilleId,
        }),
        onSuccess: (saved) => {
            queryClient.setQueryData(['plan-implantation', planUid], saved)
            queryClient.invalidateQueries({ queryKey: ['plan-implantation-intervention-points', planUid] })
            const canvas = resolveCanvasForFeuille(saved, selectedFeuilleId)
            setPoints(filterCanvasPointsForFeuille(canvas?.points || [], selectedFeuilleId))
            setDirty(false)
            refreshInterventionPoints(selectedFeuilleId)
        },
    })

    function isPointCodeTaken(rawCode, excludePointId = null) {
        const compact = normalizePointCode(rawCode)
        if (!compact) return false

        const inCanvas = points.some((p) => p.id !== excludePointId && normalizePointCode(p.code) === compact)
        if (inCanvas) return true

        const inIntervention = interventionPoints.some((p) => !p.is_virtual && normalizePointCode(p.point_code) === compact)
        return inIntervention
    }

    function clearPendingPlacement() {
        setPendingPlacement(null)
        setPointPickerError('')
        if (mode === 'point') {
            setMode('select')
        }
    }

    // ── Stable wheel handler via ref (avoids re-attaching on every zoom/pan change) ──
    wheelHandlerRef.current = (e) => {
        if (mode !== 'pan') return
        e.preventDefault()
        const factor = e.deltaY > 0 ? 0.9 : 1.1
        const z0 = zoomRef.current
        const newZoom = Math.max(0.15, Math.min(12, z0 * factor))
        const rect = containerRef.current.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const p0 = panRef.current
        setPan({
            x: mx - (mx - p0.x) * (newZoom / z0),
            y: my - (my - p0.y) * (newZoom / z0),
        })
        setZoom(newZoom)
    }

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const h = (e) => wheelHandlerRef.current(e)
        el.addEventListener('wheel', h, { passive: false })
        return () => el.removeEventListener('wheel', h)
    }, [])

    // ── Coordinate conversion: client pixels → normalized % ──────────────────
    function clientToNorm(clientX, clientY) {
        if (!imageRef.current) return { x: 0, y: 0 }
        const r = imageRef.current.getBoundingClientRect()
        return {
            x: ((clientX - r.left) / r.width) * 100,
            y: ((clientY - r.top) / r.height) * 100,
        }
    }

    // ── Pointer events ────────────────────────────────────────────────────────
    function handlePointerDown(e) {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const norm = clientToNorm(e.clientX, e.clientY)

        if (mode === 'pan') {
            dragRef.current = {
                startMouseX: e.clientX, startMouseY: e.clientY,
                startPanX: panRef.current.x, startPanY: panRef.current.y,
            }
            setIsPanning(true)
        } else if (mode === 'calibrate') {
            if (!calibFirstRef.current) {
                calibFirstRef.current = norm
                setTempLine({ x1: norm.x, y1: norm.y, x2: norm.x, y2: norm.y })
            } else {
                const first = calibFirstRef.current
                calibFirstRef.current = null
                const line = { x1: first.x, y1: first.y, x2: norm.x, y2: norm.y }
                setTempLine(null)
                setDialog('calibrate')
                setDlgValues({ meters: '', _line: line })
            }
        } else if (mode === 'zone') {
            rectStartRef.current = norm
            setTempRect({ x1: norm.x, y1: norm.y, x2: norm.x, y2: norm.y })
        } else if (mode === 'point') {
            if (!pendingPlacement?.code?.trim()) {
                setPointPickerError('Seleciona um ponto existente na lista ou cria um novo antes de clicar no plano.')
                return
            }
            const isVirtual = Boolean(pendingPlacement.isVirtual)
            let codeToPlace = pendingPlacement.code.trim()
            const compactCodeToPlace = normalizePointCode(codeToPlace)
            if (!isVirtual && (Boolean(pendingPlacement.already_in_plan) || points.some((p) => normalizePointCode(p.code) === compactCodeToPlace))) {
                setPointPickerError(`O ponto ${codeToPlace} já está implantado neste plano.`)
                clearPendingPlacement()
                return
            }
            if (isVirtual) {
                const prefix = pendingPlacement.type?.toLowerCase().includes('rep') ? 'REP' : 'OBS'
                const used = new Set(points.map((p) => String(p.code || '').trim().toUpperCase()))
                let idx = 1
                while (used.has(`${prefix}-${idx}`)) idx += 1
                codeToPlace = `${prefix}-${idx}`
            }
            setPoints((ps) => [
                ...ps,
                {
                    id: mkId(),
                    linked_uid: pendingPlacement.uid || null,
                    code: codeToPlace,
                    type: pendingPlacement.type || POINT_TYPES[0],
                    is_virtual: isVirtual,
                    feuille_id: isVirtual ? null : (pendingPlacement.feuille_id || null),
                    feuille_reference: isVirtual ? null : (pendingPlacement.feuille_reference || null),
                    geo_x: pendingPlacement.geo_x ?? null,
                    geo_y: pendingPlacement.geo_y ?? null,
                    z: pendingPlacement.z ?? null,
                    x: norm.x,
                    y: norm.y,
                },
            ])
            setDirty(true)
            setPointPickerError('')
            setPendingPlacement(null)
            setMode('select')
        } else if (mode === 'select') {
            const hitRadius = 3 / zoomRef.current
            const hit = points.find((p) => {
                const dx = p.x - norm.x
                const dy = p.y - norm.y
                return Math.sqrt(dx * dx + dy * dy) < hitRadius
            })
            setSelectedId(hit?.id || null)
            if (hit) {
                if (hit.is_virtual || ['repere', 'repère', 'observation', 'obs'].includes(String(hit.type || '').trim().toLowerCase())) {
                    setDialog('edit_point')
                    setDlgValues({
                        _id: hit.id,
                        code: hit.code,
                        type: hit.type,
                        geo_x: hit.geo_x ?? '',
                        geo_y: hit.geo_y ?? '',
                        z: hit.z ?? '',
                    })
                }
                pointDragRef.current = {
                    pointId: hit.id,
                    dx: norm.x - Number(hit.x),
                    dy: norm.y - Number(hit.y),
                }
                setIsDraggingPoint(true)
            }
        }
    }

    function handlePointerMove(e) {
        if (!e.buttons) return
        const norm = clientToNorm(e.clientX, e.clientY)

        if (mode === 'pan' && dragRef.current) {
            const { startMouseX, startMouseY, startPanX, startPanY } = dragRef.current
            setPan({
                x: startPanX + (e.clientX - startMouseX),
                y: startPanY + (e.clientY - startMouseY),
            })
        } else if (mode === 'calibrate' && tempLine) {
            setTempLine((t) => ({ ...t, x2: norm.x, y2: norm.y }))
        } else if (mode === 'zone' && rectStartRef.current) {
            setTempRect({ x1: rectStartRef.current.x, y1: rectStartRef.current.y, x2: norm.x, y2: norm.y })
        } else if (mode === 'select' && pointDragRef.current) {
            const { pointId, dx, dy } = pointDragRef.current
            const nextX = clampPercent(norm.x - dx)
            const nextY = clampPercent(norm.y - dy)
            setPoints((ps) => ps.map((p) => (p.id === pointId ? { ...p, x: nextX, y: nextY } : p)))
            setDirty(true)
        }
    }

    function handlePointerUp() {
        if (mode === 'pan') {
            dragRef.current = null
            setIsPanning(false)
        } else if (mode === 'zone' && rectStartRef.current && tempRect) {
            const r = {
                x1: Math.min(tempRect.x1, tempRect.x2),
                y1: Math.min(tempRect.y1, tempRect.y2),
                x2: Math.max(tempRect.x1, tempRect.x2),
                y2: Math.max(tempRect.y1, tempRect.y2),
            }
            rectStartRef.current = null
            setTempRect(null)
            if (r.x2 - r.x1 > 0.5 && r.y2 - r.y1 > 0.5) {
                setZoneRect(r)
                setDirty(true)
                if (imageRef.current) {
                    zoomToZoneRect(r)
                } else {
                    pendingZoneZoomRef.current = r
                }
            }
        }
        if (mode === 'select') {
            pointDragRef.current = null
            setIsDraggingPoint(false)
        }
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────
    useEffect(() => {
        function onKey(e) {
            // Don't interfere with dialog inputs
            if (dialog) return
            if (e.key === 'Escape') {
                calibFirstRef.current = null
                setTempLine(null)
                setTempRect(null)
                rectStartRef.current = null
                clearPendingPlacement()
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && mode === 'select') {
                setPoints((ps) => ps.filter((p) => p.id !== selectedId))
                setSelectedId(null)
                setDirty(true)
            }

            if (selectedId && mode === 'select' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                e.preventDefault()
                const step = e.shiftKey ? 0.5 : 0.15
                const deltaX = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
                const deltaY = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
                setPoints((ps) =>
                    ps.map((p) =>
                        p.id === selectedId
                            ? { ...p, x: clampPercent(Number(p.x) + deltaX), y: clampPercent(Number(p.y) + deltaY) }
                            : p
                    )
                )
                setDirty(true)
            }

            // Mode shortcuts
            const shortcuts = { v: 'pan', c: 'calibrate', p: 'point', s: 'select' }
            const pressedKey = e.key.toLowerCase()
            if (pressedKey === 'z' && !e.ctrlKey && !e.metaKey) {
                enterZoneMode()
            } else if (shortcuts[pressedKey] && !e.ctrlKey && !e.metaKey) {
                setMode(shortcuts[pressedKey])
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [selectedId, mode, dialog])

    // ── Dialog confirm ────────────────────────────────────────────────────────
    function handleDialogConfirm() {
        if (dialog === 'calibrate') {
            const meters = parseFloat(dlgValues.meters)
            if (!meters || meters <= 0) return
            setCalibration({ ...dlgValues._line, real_meters: meters })
            setDirty(true)
        } else if (dialog === 'edit_point') {
            if (!dlgValues.code?.trim()) return
            if (isPointCodeTaken(dlgValues.code, dlgValues._id)) {
                setPointPickerError(`O código ${dlgValues.code.trim()} já existe no plano/intervenção.`)
                setDialog(null)
                return
            }
            setPoints((ps) =>
                ps.map((p) => p.id === dlgValues._id ? {
                    ...p,
                    code: dlgValues.code.trim(),
                    type: dlgValues.type,
                    geo_x: dlgValues.geo_x === '' || dlgValues.geo_x == null ? null : Number(dlgValues.geo_x),
                    geo_y: dlgValues.geo_y === '' || dlgValues.geo_y == null ? null : Number(dlgValues.geo_y),
                    z: dlgValues.z === '' || dlgValues.z == null ? null : Number(dlgValues.z),
                } : p)
            )
            setDirty(true)
        }
        setDialog(null)
    }

    // ── Cursor per mode ───────────────────────────────────────────────────────
    const cursorMap = { pan: isPanning ? 'grabbing' : 'grab', calibrate: 'crosshair', zone: 'crosshair', point: 'cell', select: isDraggingPoint ? 'grabbing' : 'default' }
    const cursor = cursorMap[mode] || 'default'

    // ── Image URL ─────────────────────────────────────────────────────────────
    const imageUrl = buildStorageImageUrl(imagePath)
    const imageFiles = Array.isArray(imageFilesData?.files) ? imageFilesData.files : []
    const hasCurrentImageInList = imageFiles.some((item) => item.path === imagePath)

    function fitImageToViewport(force = false) {
        if (!imageRef.current || !containerRef.current || !imagePath) return
        if (!force && fittedImagePath === imagePath) return

        const containerRect = containerRef.current.getBoundingClientRect()
        const imageWidth = imageRef.current.naturalWidth || imageRef.current.width || 1
        const imageHeight = imageRef.current.naturalHeight || imageRef.current.height || 1
        const scaleX = containerRect.width / imageWidth
        const scaleY = containerRect.height / imageHeight
        const fitZoom = Math.max(0.15, Math.min(12, Math.min(scaleX, scaleY) * 0.96))
        const offsetX = (containerRect.width - imageWidth * fitZoom) / 2
        const offsetY = (containerRect.height - imageHeight * fitZoom) / 2

        setZoom(fitZoom)
        setPan({ x: offsetX, y: offsetY })
        setFittedImagePath(imagePath)
    }

    function zoomToZoneRect(rect) {
        const r = normalizeRect(rect)
        if (!r || !imageRef.current || !containerRef.current) return

        const containerRect = containerRef.current.getBoundingClientRect()
        const imageWidth = imageRef.current.naturalWidth || imageRef.current.width || 1
        const imageHeight = imageRef.current.naturalHeight || imageRef.current.height || 1

        const zoneWidth = Math.max(1, imageWidth * ((r.x2 - r.x1) / 100))
        const zoneHeight = Math.max(1, imageHeight * ((r.y2 - r.y1) / 100))
        const scaleX = containerRect.width / zoneWidth
        const scaleY = containerRect.height / zoneHeight
        const nextZoom = Math.max(0.15, Math.min(12, Math.min(scaleX, scaleY) * 0.9))

        const cx = ((r.x1 + r.x2) / 2 / 100) * imageWidth
        const cy = ((r.y1 + r.y2) / 2 / 100) * imageHeight
        const panX = containerRect.width / 2 - cx * nextZoom
        const panY = containerRect.height / 2 - cy * nextZoom

        setZoom(nextZoom)
        setPan({ x: panX, y: panY })
    }

    function enterZoneMode() {
        setMode('zone')
        pendingViewportModeRef.current = 'fit'
        pendingZoneZoomRef.current = null
        if (imageRef.current?.complete) {
            fitImageToViewport(true)
            pendingViewportModeRef.current = null
        }
    }

    function chooseExistingInterventionPoint(item) {
        if (!item?.point_code) return
        const compactCode = normalizePointCode(item.point_code)
        if (!item.is_virtual && (Boolean(item.already_in_plan) || placedCodes.has(compactCode))) {
            setPointPickerError(`O ponto ${item.point_code} já está implantado neste plano.`)
            return
        }
        if (item.feuille_id != null) {
            setSelectedFeuilleId(Number(item.feuille_id))
        }
        setPendingPlacement({
            source: 'existing',
            uid: item.uid,
            code: item.point_code,
            type: item.point_type || POINT_TYPES[0],
            isVirtual: Boolean(item.is_virtual),
            already_in_plan: Boolean(item.already_in_plan),
            feuille_id: item.feuille_id || null,
            feuille_reference: item.feuille_reference || null,
            geo_x: item.x ?? null,
            geo_y: item.y ?? null,
            z: item.z ?? null,
        })
        setPointPickerError('')
        setMode('point')
    }

    async function createAndChooseNewPoint() {
        const code = String(newPointDraft.code || '').trim()
        const type = String(newPointDraft.type || '').trim()
        if (feuilleOptions.length > 1 && selectedFeuilleId == null) {
            setPointPickerError('Seleciona primeiro a feuille de trabalho para criar o ponto.')
            return
        }
        if (!code || !type) {
            setPointPickerError('Preenche o código e o tipo para criar um novo ponto.')
            return
        }
        if (isPointCodeTaken(code)) {
            setPointPickerError(`O código ${code} já existe no plano/intervenção.`)
            return
        }

        setPendingPlacement({
            source: 'new-draft',
            uid: null,
            code,
            type,
            isVirtual: false,
            feuille_id: selectedFeuilleId != null ? Number(selectedFeuilleId) : null,
            feuille_reference: feuilleOptions.find((item) => Number(item.id) === Number(selectedFeuilleId))?.reference || null,
        })
        setPointPickerError('')
        setMode('point')
        setNewPointDraft((prev) => ({ ...prev, code: '' }))
    }

    // ── Mode hints ────────────────────────────────────────────────────────────
    const modeHints = {
        pan: 'Déplacer (glisser) · Molette = zoom · [V]',
        calibrate: calibFirstRef.current ? '2e point: cliquer sur la fin de la ligne de référence' : '1er point: cliquer le début de la ligne de référence · [C]',
        zone: 'Glisser pour délimiter la zone d\'intervention · [Z]',
        point: pendingPlacement?.code ? `Clique no plano para posicionar ${pendingPlacement.code} · [P]` : 'Escolhe um ponto na lista e depois clica no plano · [P]',
        select: 'Cliquer/drag un point · Flèches = déplacer · Shift+Flèches = pas large · Suppr = effacer · [S]',
    }

    // ── Calibration label ─────────────────────────────────────────────────────
    const calibLabel = calibration
        ? `Étalonnage: ${calibration.real_meters} m`
        : 'Non étalonné'

    // ── Unique point types for legend ─────────────────────────────────────────
    // Deduplicate by canonical key so SONDAGE_CAROTTE and "Sondage carotté" appear once.
    const legendTypes = [...new Map(points.map((p) => p.type).filter(Boolean).map((t) => [canonicalTypeKey(t), t])).values()]

    // ── SVG stroke/size scaling (keeps UI elements readable at any zoom) ──────
    const sw = (base) => base / zoom   // stroke width
    const fs = (base) => base / zoom   // font size
    const rd = (base) => base / zoom   // radius
    const zoneFocusRect = normalizeRect(tempRect || zoneRect)
    const placedCodes = new Set(points.map((p) => String(p.code || '').trim().toUpperCase()).filter(Boolean))

    const allowedPointFamilies = buildAllowedPointFamilies(allowedTypeOptions, feuilleOptions, selectedFeuilleId)
    const availableExistingPoints = interventionPoints
        .filter((p) => {
            if (p.is_virtual) return true
            if (selectedFeuilleId != null && Number(p.feuille_id || 0) !== Number(selectedFeuilleId)) return false
            // Points already on the active feuille are always implantable (family filter is for cross-feuille only).
            if (selectedFeuilleId != null && Number(p.feuille_id || 0) === Number(selectedFeuilleId)) return true
            const family = pointFamilyFromCodeAndType(p.point_code, p.point_type)
            if (!allowedPointFamilies.size) return true
            return allowedPointFamilies.has(family)
        })
        .sort((a, b) => String(a.point_code || '').localeCompare(String(b.point_code || ''), 'fr', { numeric: true, sensitivity: 'base' }))

    if (isLoading) {
        return (
            <WorksheetPageShell>
                <div className="py-10 text-center text-sm text-text-muted">Chargement…</div>
            </WorksheetPageShell>
        )
    }
    if (error) {
        return (
            <WorksheetPageShell>
                <div className="mx-auto max-w-[1280px] px-6 py-6">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">Impossible de charger ce plan.</div>
                </div>
            </WorksheetPageShell>
        )
    }

    return (
        <WorksheetPageShell className="overflow-hidden">
            <WorksheetTopbar
                backLabel="← Retour"
                onBack={handleTrueBack}
                eyebrow="Canevas d'implantation"
                title={plan?.reference || `Plan #${planUid}`}
            >
                <div className="flex flex-wrap items-center gap-1.5">
                    <ToolBtn active={mode === 'pan'} onClick={() => setMode('pan')} title="Déplacer / zoomer [V]">✋</ToolBtn>
                    <ToolBtn active={mode === 'calibrate'} onClick={() => setMode('calibrate')} title="Étalonnage: tracer une ligne de référence [C]">📏</ToolBtn>
                    <ToolBtn active={mode === 'zone'} onClick={enterZoneMode} title="Zone d'intervention: délimiter un rectangle [Z]">⬜</ToolBtn>
                    <ToolBtn
                        active={mode === 'point'}
                        onClick={() => {
                            if (pendingPlacement?.code) {
                                clearPendingPlacement()
                                return
                            }
                            setMode('point')
                        }}
                        title="Mode placement de point [P]"
                    >
                        ⊕
                    </ToolBtn>

                    {feuilleOptions.length > 0 ? (
                        <select
                            value={selectedFeuilleId ?? ''}
                            onChange={(e) => {
                                const next = String(e.target.value || '').trim()
                                setSelectedFeuilleId(next ? Number(next) : null)
                                setPendingPlacement(null)
                                setPointPickerError('')
                            }}
                            className="h-9 min-w-[210px] rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-nge"
                            title="Feuille active du canvas"
                        >
                            {feuilleOptions.length > 1 ? <option value="">Selecionar feuille...</option> : null}
                            {feuilleOptions.map((item) => (
                                <option key={item.id} value={item.id}>{item.reference || `Feuille #${item.id}`}</option>
                            ))}
                        </select>
                    ) : null}

                    <select
                        value=""
                        onChange={(e) => {
                            const selectedUid = String(e.target.value || '').trim()
                            if (!selectedUid) return
                            const item = availableExistingPoints.find((p) => String(p.uid ?? p.point_code) === selectedUid)
                            if (item) chooseExistingInterventionPoint(item)
                        }}
                        className="h-9 min-w-[250px] rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-nge"
                        title="Selecionar ponto existente da intervenção"
                        disabled={feuilleOptions.length > 1 && selectedFeuilleId == null}
                    >
                        <option value="">{feuilleOptions.length > 1 && selectedFeuilleId == null ? 'Seleciona primeiro a feuille...' : 'Selecionar ponto existente...'}</option>
                        {availableExistingPoints.map((item) => {
                            const isAlreadyPlaced = !item.is_virtual && placedCodes.has(String(item.point_code || '').trim().toUpperCase())
                            const valueKey = String(item.uid ?? item.point_code)
                            const label = `${item.point_code} · ${item.point_type || 'Point'}${isAlreadyPlaced ? ' (já no plano)' : ''}`
                            return (
                                <option key={valueKey} value={valueKey} disabled={isAlreadyPlaced || Boolean(item.already_in_plan)}>{label}</option>
                            )
                        })}
                    </select>

                    <Input
                        placeholder="Novo código (ex: SC1)"
                        value={newPointDraft.code}
                        onChange={(e) => setNewPointDraft((v) => ({ ...v, code: e.target.value }))}
                        className="h-9 w-[170px]"
                    />
                    <select
                        value={newPointDraft.type}
                        onChange={(e) => setNewPointDraft((v) => ({ ...v, type: e.target.value }))}
                        className="h-9 min-w-[220px] rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-nge"
                        title="Tipo do novo ponto"
                    >
                        {pointTypeOptions.map((item) => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                    <Button
                        variant="secondary"
                        onClick={createAndChooseNewPoint}
                        title="Criar novo ponto e posicionar no plano"
                        disabled={feuilleOptions.length > 1 && selectedFeuilleId == null}
                    >
                        + Novo ponto
                    </Button>
                    <ToolBtn active={mode === 'select'} onClick={() => setMode('select')} title="Sélectionner / éditer un point [S]">↖</ToolBtn>

                    <div className="w-px h-6 bg-border mx-1" />

                    <Button
                        variant="secondary"
                        onClick={() => refetchImageFiles()}
                        title="Atualizar lista de ficheiros da affaire"
                    >
                        {isFetchingImageFiles ? '…' : '↻ Lista'}
                    </Button>
                    <select
                        value={imagePath || ''}
                        onChange={(e) => {
                            const path = normalizePlanImagePath(e.target.value)
                            setImagePath(path)
                            setDirty(true)
                            setImageLoadError('')
                            setFittedImagePath('')
                        }}
                        className="h-9 min-w-[320px] rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-nge"
                        title="Selecionar imagem de fundo a partir dos ficheiros do dossier da affaire"
                    >
                        <option value="">Selecionar ficheiro em {imageFilesData?.directory || 'Plans/...'}...</option>
                        {imagePath && !hasCurrentImageInList ? (
                            <option value={imagePath}>Atual: {imagePath.split('/').pop()}</option>
                        ) : null}
                        {imageFiles.map((file) => (
                            <option key={file.path} value={file.path}>
                                {file.relative_path}
                            </option>
                        ))}
                    </select>
                    <Button variant="secondary" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Réinitialiser la vue">
                        ⌖ Vue
                    </Button>

                    {calibration && (
                        <Button variant="secondary" onClick={() => { setCalibration(null); setDirty(true) }} title="Supprimer l'étalonnage">
                            ✕ Étalo
                        </Button>
                    )}
                    {zoneRect && (
                        <Button variant="secondary" onClick={() => { setZoneRect(null); setDirty(true) }} title="Supprimer la zone">
                            ✕ Zone
                        </Button>
                    )}
                    {selectedId && mode === 'select' && (() => {
                        const selPt = points.find((p) => p.id === selectedId)
                        if (!selPt) return null
                        return (
                            <>
                                <Button variant="secondary" onClick={() => {
                                    setDialog('edit_point')
                                    setDlgValues({
                                        _id: selPt.id,
                                        code: selPt.code,
                                        type: selPt.type,
                                        geo_x: selPt.geo_x ?? '',
                                        geo_y: selPt.geo_y ?? '',
                                        z: selPt.z ?? '',
                                    })
                                }}>✏️</Button>
                                <Button variant="secondary" onClick={() => {
                                    setPoints((ps) => ps.filter((p) => p.id !== selectedId))
                                    setSelectedId(null)
                                    setDirty(true)
                                }}>🗑</Button>
                            </>
                        )
                    })()}

                    <div className="w-px h-6 bg-border mx-1" />

                    <Button
                        variant="primary"
                        onClick={() => saveMutation.mutate()}
                        disabled={!dirty || saveMutation.isPending}
                    >
                        {saveMutation.isPending ? '…' : dirty ? '💾 Enregistrer' : '✓ Sauvegardé'}
                    </Button>
                </div>
            </WorksheetTopbar>

            <WorksheetSubbar className="no-print text-[11px] text-text-muted">
                <span className="font-medium text-nge">{modeHints[mode]}</span>
                <span className="text-border">·</span>
                <span>{calibLabel}</span>
                <span className="text-border">·</span>
                <span>{points.length} point{points.length !== 1 ? 's' : ''}</span>
                <span className="text-border">·</span>
                <span>Zoom {Math.round(zoom * 100)}%</span>
                {pendingPlacement?.code ? (
                    <>
                        <span className="text-border">·</span>
                        <span className="text-amber-600 font-medium">Pronto para posicionar: {pendingPlacement.code}</span>
                        <Button variant="secondary" onClick={clearPendingPlacement}>Anular seleção</Button>
                    </>
                ) : null}
                {saveMutation.isError && (
                    <span className="ml-auto text-red-500">Erreur: {saveMutation.error?.message}</span>
                )}
                {pointPickerError ? (
                    <span className="ml-auto text-red-500">{pointPickerError}</span>
                ) : null}
            </WorksheetSubbar>

            {/* ── Canvas wrapper ── */}
            <div className="relative min-h-0 flex-1 overflow-hidden">

                {/* ── Dark canvas area ── */}
                <div
                    ref={containerRef}
                    className="absolute inset-0 select-none overflow-hidden"
                    style={{ background: '#1e1e1e', cursor }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    {!imageUrl ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-zinc-400">
                            <p className="text-lg">Aucune image de fond</p>
                            <p className="text-sm text-zinc-500">Seleciona um ficheiro na lista "Lista" para definir o plan de fond.</p>
                            <Button variant="primary" onClick={() => refetchImageFiles()}>
                                Atualizar lista de ficheiros
                            </Button>
                        </div>
                    ) : (
                        <div
                            style={{
                                position: 'absolute',
                                top: 0, left: 0,
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                transformOrigin: '0 0',
                            }}
                        >
                            {/* Image + SVG overlay in a relative container */}
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <img
                                    ref={imageRef}
                                    src={imageUrl}
                                    alt="Plan de fond"
                                    draggable={false}
                                    style={{ display: 'block', maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }}
                                    onLoad={() => {
                                        setImageLoadError('')
                                        // Prefer pending ref (first load from plan), fall back to state (manual switch)
                                        const queuedRect = pendingZoneZoomRef.current || zoneRect
                                        if (queuedRect) {
                                            // If there's a zone rect, zoom to it
                                            zoomToZoneRect(queuedRect)
                                        } else {
                                            // Otherwise fit the whole image
                                            fitImageToViewport(true)
                                        }
                                        pendingZoneZoomRef.current = null
                                        pendingViewportModeRef.current = null
                                    }}
                                    onError={(e) => {
                                        e.currentTarget.style.border = '2px dashed #ef4444'
                                        setImageLoadError(`Image introuvable: ${imagePath}`)
                                    }}
                                />
                                <svg
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
                                >
                                    {/* ── Focus mask: dim everything outside selected zone ── */}
                                    {zoneFocusRect && (
                                        <g>
                                            <rect x="0%" y="0%" width="100%" height={`${zoneFocusRect.y1}%`} fill="rgba(15, 23, 42, 0.34)" />
                                            <rect x="0%" y={`${zoneFocusRect.y1}%`} width={`${zoneFocusRect.x1}%`} height={`${zoneFocusRect.y2 - zoneFocusRect.y1}%`} fill="rgba(15, 23, 42, 0.34)" />
                                            <rect x={`${zoneFocusRect.x2}%`} y={`${zoneFocusRect.y1}%`} width={`${100 - zoneFocusRect.x2}%`} height={`${zoneFocusRect.y2 - zoneFocusRect.y1}%`} fill="rgba(15, 23, 42, 0.34)" />
                                            <rect x="0%" y={`${zoneFocusRect.y2}%`} width="100%" height={`${100 - zoneFocusRect.y2}%`} fill="rgba(15, 23, 42, 0.34)" />
                                        </g>
                                    )}

                                    {/* ── Calibration line (hidden in print) ── */}
                                    <g className="calibration-line">
                                        {calibration && (
                                            <>
                                                <line
                                                    x1={`${calibration.x1}%`} y1={`${calibration.y1}%`}
                                                    x2={`${calibration.x2}%`} y2={`${calibration.y2}%`}
                                                    stroke="#fbbf24" strokeWidth={sw(2)} strokeDasharray={`${sw(6)},${sw(3)}`}
                                                />
                                                <circle cx={`${calibration.x1}%`} cy={`${calibration.y1}%`} r={rd(5)} fill="#fbbf24" />
                                                <circle cx={`${calibration.x2}%`} cy={`${calibration.y2}%`} r={rd(5)} fill="#fbbf24" />
                                                <text
                                                    x={`${(calibration.x1 + calibration.x2) / 2}%`}
                                                    y={`${(calibration.y1 + calibration.y2) / 2}%`}
                                                    dy={-rd(8)}
                                                    fontSize={fs(12)} fill="#fbbf24" textAnchor="middle"
                                                    fontFamily="sans-serif" fontWeight="600"
                                                >
                                                    {calibration.real_meters} m
                                                </text>
                                            </>
                                        )}
                                        {/* Temp calibration line (drawing in progress) */}
                                        {tempLine && (
                                            <>
                                                <line
                                                    x1={`${tempLine.x1}%`} y1={`${tempLine.y1}%`}
                                                    x2={`${tempLine.x2}%`} y2={`${tempLine.y2}%`}
                                                    stroke="#fbbf24" strokeWidth={sw(2)} strokeDasharray={`${sw(4)},${sw(2)}`}
                                                />
                                                <circle cx={`${tempLine.x1}%`} cy={`${tempLine.y1}%`} r={rd(5)} fill="#fbbf24" />
                                                <circle cx={`${tempLine.x2}%`} cy={`${tempLine.y2}%`} r={rd(4)} fill="#fbbf24" stroke="white" strokeWidth={sw(1.5)} />
                                            </>
                                        )}
                                    </g>

                                    {/* ── Zone rectangle ── */}
                                    {zoneRect && (
                                        <rect
                                            x={`${zoneRect.x1}%`} y={`${zoneRect.y1}%`}
                                            width={`${zoneRect.x2 - zoneRect.x1}%`} height={`${zoneRect.y2 - zoneRect.y1}%`}
                                            fill="rgba(59,130,246,0.07)"
                                            stroke="#3b82f6" strokeWidth={sw(2)} strokeDasharray={`${sw(8)},${sw(4)}`}
                                        />
                                    )}

                                    {/* Temp rect preview */}
                                    {tempRect && (() => {
                                        const x1 = Math.min(tempRect.x1, tempRect.x2)
                                        const y1 = Math.min(tempRect.y1, tempRect.y2)
                                        const w = Math.abs(tempRect.x2 - tempRect.x1)
                                        const h = Math.abs(tempRect.y2 - tempRect.y1)
                                        return (
                                            <rect
                                                x={`${x1}%`} y={`${y1}%`} width={`${w}%`} height={`${h}%`}
                                                fill="rgba(59,130,246,0.05)"
                                                stroke="#3b82f6" strokeWidth={sw(1.5)} strokeDasharray={`${sw(5)},${sw(2.5)}`}
                                            />
                                        )
                                    })()}

                                    {/* ── Implantation points ── */}
                                    {points.map((pt) => {
                                        const color = typeColor(pt.type)
                                        const isSel = pt.id === selectedId
                                        return (
                                            <g key={pt.id}>
                                                {/* Halo ring for selected point */}
                                                {isSel && (
                                                    <circle
                                                        cx={`${pt.x}%`} cy={`${pt.y}%`}
                                                        r={rd(18)}
                                                        fill="none"
                                                        stroke="#facc15"
                                                        strokeWidth={sw(3)}
                                                        opacity={0.9}
                                                    />
                                                )}
                                                <circle
                                                    cx={`${pt.x}%`} cy={`${pt.y}%`}
                                                    r={isSel ? rd(9) : rd(7)}
                                                    fill={isSel ? 'white' : color}
                                                    stroke={isSel ? color : 'white'}
                                                    strokeWidth={isSel ? sw(2.5) : sw(1.5)}
                                                    opacity={0.95}
                                                />
                                                <text
                                                    x={`${pt.x}%`} y={`${pt.y}%`}
                                                    dx={rd(13)} dy={rd(4)}
                                                    fontSize={fs(11)} fill={isSel ? '#facc15' : color}
                                                    fontFamily="sans-serif" fontWeight="700"
                                                    style={{ userSelect: 'none' }}
                                                >
                                                    {pt.code}
                                                </text>
                                            </g>
                                        )
                                    })}
                                </svg>
                            </div>
                        </div>
                    )}
                </div>

                {imageLoadError ? (
                    <div className="absolute left-4 bottom-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 no-print">
                        {imageLoadError}
                    </div>
                ) : null}

                {/* ── Legend (bottom-right, visible in print) ── */}
                {legendTypes.length > 0 && (
                    <div
                        className="absolute bottom-4 right-4 rounded-xl border border-border p-3 text-[11px] flex flex-col gap-1.5"
                        style={{ background: 'rgba(var(--color-surface-rgb, 255,255,255), 0.92)', backdropFilter: 'blur(6px)' }}
                    >
                        {legendTypes.map((t) => (
                            <div key={canonicalTypeKey(t)} className="flex items-center gap-2">
                                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: typeColor(t), flexShrink: 0 }} />
                                <span className="text-text-muted">{displayPointType(t)}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── Point count badge (top-left) ── */}
                {points.length > 0 && (
                    <div className="absolute top-3 left-3 rounded-lg border border-border px-2.5 py-1 text-[11px] text-text-muted no-print"
                        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)' }}>
                        {points.length} pt{points.length !== 1 ? 's' : ''}
                    </div>
                )}

                {/* ── Selected point info panel ── */}
                {selectedId && mode === 'select' && (() => {
                    const selPt = points.find((p) => p.id === selectedId)
                    if (!selPt) return null
                    return (
                        <div
                            className="absolute bottom-16 left-4 rounded-xl border border-border px-4 py-3 flex flex-col gap-2 no-print"
                            style={{ background: 'rgba(var(--color-surface-rgb,255,255,255),0.96)', backdropFilter: 'blur(8px)', minWidth: 200 }}
                        >
                            <div className="flex items-center gap-2">
                                <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background: typeColor(selPt.type), flexShrink:0 }} />
                                <span className="text-[14px] font-bold text-text">{selPt.code}</span>
                                <span className="text-[11px] text-text-muted ml-1">{displayPointType(selPt.type)}</span>
                            </div>
                            {(() => {
                                // Resolve feuille_id: from canvas point, or from interventionPoints lookup
                                const feuilleId = selPt.feuille_id
                                    || interventionPoints.find((p) => p.uid === selPt.linked_uid)?.feuille_id
                                    || null
                                const feuilleRef = selPt.feuille_reference
                                    || interventionPoints.find((p) => p.uid === selPt.linked_uid)?.feuille_reference
                                    || null
                                if (feuilleId) {
                                    const pointUid = selPt.linked_uid
                                    const dest = pointUid
                                        ? `/feuilles-terrain/${feuilleId}?point=${pointUid}`
                                        : `/feuilles-terrain/${feuilleId}`
                                    const label = `${feuilleRef || `Feuille #${feuilleId}`} ${selPt.code || ''}`.trim()
                                    return (
                                        <button
                                            className="text-left text-[12px] text-nge hover:underline font-medium"
                                            onClick={() => navigate(dest)}
                                        >
                                            → {label}
                                        </button>
                                    )
                                }
                                if (plan?.intervention_id) {
                                    return (
                                        <button
                                            className="text-left text-[12px] text-nge hover:underline font-medium"
                                            onClick={() => navigate(`/interventions/${plan.intervention_id}`)}
                                        >
                                            → {plan?.intervention_reference || `Intervention #${plan.intervention_id}`}
                                        </button>
                                    )
                                }
                                return null
                            })()}
                        </div>
                    )
                })()}
            </div>

            {/* ── Dialogs ── */}
            {dialog === 'calibrate' && (
                <Modal
                    title="Étalonnage — distance réelle"
                    onConfirm={handleDialogConfirm}
                    onCancel={() => setDialog(null)}
                    confirmDisabled={!dlgValues.meters || isNaN(parseFloat(dlgValues.meters)) || parseFloat(dlgValues.meters) <= 0}
                    confirmLabel="Appliquer"
                >
                    <p className="text-[12px] text-text-muted leading-relaxed">
                        Quelle est la distance réelle (en mètres) entre les deux points de la ligne tracée?
                    </p>
                    <Input
                        type="number" min="0.01" step="0.01"
                        placeholder="ex: 5.00"
                        value={dlgValues.meters || ''}
                        onChange={(e) => setDlgValues((v) => ({ ...v, meters: e.target.value }))}
                        autoFocus
                    />
                </Modal>
            )}

            {dialog === 'edit_point' && (
                <Modal
                    title="Modifier le point"
                    onConfirm={handleDialogConfirm}
                    onCancel={() => setDialog(null)}
                    confirmDisabled={!dlgValues.code?.trim()}
                    confirmLabel="Enregistrer"
                >
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="text-[11px] font-medium text-text-muted mb-1 block">Code du point *</label>
                            <Input
                                value={dlgValues.code || ''}
                                onChange={(e) => setDlgValues((v) => ({ ...v, code: e.target.value }))}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-[11px] font-medium text-text-muted mb-1 block">Type</label>
                            <select
                                value={dlgValues.type || POINT_TYPES[0]}
                                onChange={(e) => setDlgValues((v) => ({ ...v, type: e.target.value }))}
                                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge"
                            >
                                {POINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="text-[11px] font-medium text-text-muted mb-1 block">X</label>
                                <Input
                                    type="number"
                                    step="any"
                                    value={dlgValues.geo_x ?? ''}
                                    onChange={(e) => setDlgValues((v) => ({ ...v, geo_x: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-text-muted mb-1 block">Y</label>
                                <Input
                                    type="number"
                                    step="any"
                                    value={dlgValues.geo_y ?? ''}
                                    onChange={(e) => setDlgValues((v) => ({ ...v, geo_y: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-medium text-text-muted mb-1 block">Z</label>
                                <Input
                                    type="number"
                                    step="any"
                                    value={dlgValues.z ?? ''}
                                    onChange={(e) => setDlgValues((v) => ({ ...v, z: e.target.value }))}
                                />
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Print CSS — calibration line and UI chrome hidden in print */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .calibration-line { display: none !important; }
                }
            `}</style>
        </WorksheetPageShell>
    )
}
