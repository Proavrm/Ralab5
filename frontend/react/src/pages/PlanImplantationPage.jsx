import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { plansImplantationApi } from '@/services/api'
import { formatDate } from '@/lib/utils'

function normalizePlanImagePath(rawPath) {
    let path = String(rawPath || '').trim()
    if (!path) return ''

    path = path.replaceAll('\\', '/')
    const storageIdx = path.toLowerCase().lastIndexOf('/storage/')
    if (storageIdx >= 0) {
        path = path.slice(storageIdx + '/storage/'.length)
    }
    path = path.replace(/^\/+/, '')
    path = path.replace(/^storage\//i, '')
    return path
}

function buildStorageImageUrl(path) {
    if (!path) return null
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

function isStorageImagePath(rawPath) {
    const path = normalizePlanImagePath(rawPath)
    if (!path) return false
    if (/\.(jpg|jpeg|png|webp|gif|bmp|tif|tiff)$/i.test(path)) return true
    return path.toLowerCase().startsWith('plans/')
}

const CROQUIS_PALETTE = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']

function buildTypeColors(points) {
    const typeColors = {}
    let colorIdx = 0
    points.forEach((point) => {
        const pointType = point.type || point.point_type
        if (pointType && !typeColors[pointType]) {
            typeColors[pointType] = CROQUIS_PALETTE[colorIdx++ % CROQUIS_PALETTE.length]
        }
    })
    return typeColors
}

function buildInterventionCroquisFrames(payload, feuilles = []) {
    const frames = []
    const seenImagePaths = new Set()
    const feuilleLabelById = new Map(
        feuilles.map((item) => [String(item.id), String(item.reference || '').trim() || `Feuille #${item.id}`]),
    )

    const canvasByFeuille = payload?.canvas_by_feuille && typeof payload.canvas_by_feuille === 'object'
        ? payload.canvas_by_feuille
        : {}

    Object.entries(canvasByFeuille).forEach(([feuilleId, entry]) => {
        if (!entry || typeof entry !== 'object') return
        const imagePath = normalizePlanImagePath(entry.image_path || '')
        if (!imagePath || !isStorageImagePath(imagePath)) return

        const points = (Array.isArray(entry.points) ? entry.points : []).filter((point) => point?.x != null && point?.y != null)
        const zoneRect = normalizeRect(entry.zone_rect)
        frames.push({
            key: `feuille-${feuilleId}`,
            label: feuilleId === 'default'
                ? "Plan d'intervention"
                : (feuilleLabelById.get(feuilleId) || `Plan d'intervention · feuille #${feuilleId}`),
            imagePath,
            points,
            zoneRects: zoneRect ? [zoneRect] : [],
        })
        seenImagePaths.add(imagePath)
    })

    const legacyCanvas = payload?.canvas && typeof payload.canvas === 'object' ? payload.canvas : null
    if (legacyCanvas) {
        const imagePath = normalizePlanImagePath(legacyCanvas.image_path || '')
        if (imagePath && isStorageImagePath(imagePath) && !seenImagePaths.has(imagePath)) {
            const points = (Array.isArray(legacyCanvas.points) ? legacyCanvas.points : []).filter((point) => point?.x != null && point?.y != null)
            const zoneRect = normalizeRect(legacyCanvas.zone_rect)
            frames.unshift({
                key: 'legacy-canvas',
                label: "Plan d'intervention",
                imagePath,
                points,
                zoneRects: zoneRect ? [zoneRect] : [],
            })
        }
    }

    return frames
}

function CroquisFrame({ frame, maskId }) {
    const imageUrl = buildStorageImageUrl(frame.imagePath)
    if (!imageUrl) return null

    const points = Array.isArray(frame.points) ? frame.points : []
    const zoneRects = Array.isArray(frame.zoneRects) ? frame.zoneRects : []
    const typeColors = buildTypeColors(points)

    return (
        <div className="flex flex-col gap-2">
            {frame.label ? (
                <div className="text-[12px] font-semibold text-text">{frame.label}</div>
            ) : null}
            <div className="relative w-full overflow-hidden border border-border rounded-lg bg-bg">
                <img
                    src={imageUrl}
                    alt={frame.label || "Croquis d'implantation"}
                    className="block w-full h-auto select-none pointer-events-none"
                    draggable={false}
                />
                {points.length > 0 || zoneRects.length > 0 ? (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                        {zoneRects.length > 0 ? (
                            <defs>
                                <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                                    <rect x="0" y="0" width="100" height="100" fill="white" />
                                    {zoneRects.map((rect, idx) => (
                                        <rect
                                            key={`zone-mask-${idx}`}
                                            x={rect.x1}
                                            y={rect.y1}
                                            width={rect.x2 - rect.x1}
                                            height={rect.y2 - rect.y1}
                                            fill="black"
                                        />
                                    ))}
                                </mask>
                            </defs>
                        ) : null}
                        {zoneRects.length > 0 ? (
                            <rect x="0" y="0" width="100" height="100" fill="rgba(15, 23, 42, 0.22)" mask={`url(#${maskId})`} />
                        ) : null}
                        {zoneRects.map((rect, idx) => {
                            const zoneColor = CROQUIS_PALETTE[idx % CROQUIS_PALETTE.length]
                            return (
                                <rect
                                    key={`zone-${idx}`}
                                    x={rect.x1}
                                    y={rect.y1}
                                    width={rect.x2 - rect.x1}
                                    height={rect.y2 - rect.y1}
                                    fill="rgba(59,130,246,0.03)"
                                    stroke={zoneColor}
                                    strokeWidth="0.35"
                                    strokeDasharray="1.1 0.7"
                                />
                            )
                        })}
                        {points.map((point) => {
                            const color = typeColors[point.type || point.point_type] || '#6b7280'
                            return (
                                <g key={point.id || point.linked_uid || point.code}>
                                    <circle cx={Number(point.x)} cy={Number(point.y)} r="0.85" fill={color} stroke="white" strokeWidth="0.3" opacity="0.95" />
                                    <text x={Number(point.x) + 1.1} y={Number(point.y) + 0.45} fontSize="1.7" fill={color} fontFamily="sans-serif" fontWeight="700">{point.code}</text>
                                </g>
                            )
                        })}
                    </svg>
                ) : null}
            </div>
            {points.length === 0 ? (
                <p className="text-[11px] text-text-muted">Plan d&apos;intervention — aucun point implanté sur ce plan.</p>
            ) : null}
            {Object.keys(typeColors).length > 0 ? (
                <div className="flex flex-wrap gap-3">
                    {Object.entries(typeColors).map(([type, color]) => (
                        <div key={type} className="flex items-center gap-1.5">
                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
                            <span className="text-[11px] text-text-muted">{type}</span>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    )
}

function resolvePointCoordinates(item, canvasPoint) {
    return {
        x: item?.x ?? item?.plan_canvas_x ?? canvasPoint?.geo_x ?? canvasPoint?.x ?? null,
        y: item?.y ?? item?.plan_canvas_y ?? canvasPoint?.geo_y ?? canvasPoint?.y ?? null,
        z: item?.z ?? canvasPoint?.z ?? null,
    }
}

function Card({ title, children }) {
    return (
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
            {title ? (
                <div className="px-4 py-2.5 border-b border-border bg-bg">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
                </div>
            ) : null}
            <div className="p-4">{children}</div>
        </div>
    )
}

function Row({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={`text-[13px] font-medium ${value ? 'text-text' : 'text-text-muted italic font-normal'}`}>{value || '—'}</span>
        </div>
    )
}

function Field({ label, children, full = false }) {
    return (
        <div className={full ? 'md:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
            <label className="text-[11px] font-medium text-text-muted">{label}</label>
            {children}
        </div>
    )
}

function Textarea({ value, onChange, rows = 3, placeholder = '' }) {
    return (
        <textarea
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
        />
    )
}

function buildDraftPrefill(searchParams) {
    const interventionId = searchParams.get('intervention_id') || ''
    const campagneId = searchParams.get('campagne_id') || ''
    const defaultScope = searchParams.get('scope')
        || (interventionId ? 'intervention' : (campagneId ? 'campagne' : 'demande'))
    return {
        scope: defaultScope,
        intervention_id: interventionId,
        campagne_id: campagneId,
        demande_id: searchParams.get('demande_id') || '',
        campagne_reference: searchParams.get('campagne_reference') || '',
        intervention_reference: searchParams.get('intervention_reference') || '',
        demande_reference: searchParams.get('demande_reference') || '',
        titre: searchParams.get('titre') || "Plan d'implantation",
        date_plan: searchParams.get('date_plan') || '',
        operateur: searchParams.get('operateur') || '',
        zone: searchParams.get('zone') || '',
        fond_plan: searchParams.get('fond_plan') || '',
        systeme_reperage: searchParams.get('systeme_reperage') || '',
        repere_base: searchParams.get('repere_base') || '',
        observations: searchParams.get('observations') || '',
    }
}

function buildForm(data = null, prefill = null) {
    const source = prefill && typeof prefill === 'object' ? prefill : {}
    return {
        scope: source.scope || data?.ownership_scope || data?.payload?.scope || (source.campagne_id || data?.campagne_id ? 'campagne' : (source.intervention_id || data?.intervention_id ? 'intervention' : 'demande')),
        intervention_id: source.intervention_id || data?.intervention_id || '',
        campagne_id: source.campagne_id || data?.campagne_id || '',
        demande_id: source.demande_id || data?.demande_id || '',
        campagne_reference: source.campagne_reference || data?.campagne_reference || '',
        intervention_reference: source.intervention_reference || data?.intervention_reference || '',
        demande_reference: source.demande_reference || data?.demande_reference || '',
        titre: source.titre || data?.titre || "Plan d'implantation",
        date_plan: source.date_plan || data?.date_plan || '',
        operateur: source.operateur || data?.operateur || '',
        zone: source.zone || data?.zone || '',
        fond_plan: source.fond_plan || data?.fond_plan || data?.payload?.fond_plan || '',
        systeme_reperage: source.systeme_reperage || data?.systeme_reperage || '',
        repere_base: source.repere_base || data?.repere_base || data?.payload?.repere_base || '',
        observations: source.observations || data?.observations || '',
    }
}

export default function PlanImplantationPage() {
    const { uid } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()
    const queryClient = useQueryClient()
    const isNew = String(uid || '').trim().toLowerCase() === 'new'
    const isConsultationMode = !isNew && String(searchParams.get('mode') || '').trim().toLowerCase() === 'consultation'
    const draftPrefill = useMemo(() => buildDraftPrefill(searchParams), [searchParams])
    const [editing, setEditing] = useState(isNew && !isConsultationMode)
    const [form, setForm] = useState(() => buildForm(null, draftPrefill))
    const childReturnTo = buildLocationTarget(location)
    const parentInterventionId = Number.parseInt(String(isNew ? form.intervention_id : ''), 10)
    const fallbackReturnTo = resolveReturnTo(searchParams, Number.isInteger(parentInterventionId) && parentInterventionId > 0 ? `/interventions/${parentInterventionId}` : '/demandes')

    const { data, isLoading, error } = useQuery({
        queryKey: ['plan-implantation', uid],
        queryFn: () => plansImplantationApi.get(uid),
        enabled: !isNew && Boolean(uid),
    })

    const { data: interventionPointsData } = useQuery({
        queryKey: ['plan-implantation-intervention-points', uid],
        queryFn: () => plansImplantationApi.listInterventionPoints(uid),
        enabled: !isNew && Boolean(uid),
    })

    useEffect(() => {
        if (isNew) {
            setEditing(true)
            setForm(buildForm(null, draftPrefill))
            return
        }
        if (isConsultationMode) {
            setEditing(false)
        }
        if (data) {
            setForm(buildForm(data))
        }
    }, [isNew, isConsultationMode, draftPrefill, data])

    const saveMutation = useMutation({
        mutationFn: (payload) => isNew ? plansImplantationApi.create(payload) : plansImplantationApi.update(uid, payload),
        onSuccess: (saved) => {
            if (isNew) {
                navigateWithReturnTo(navigate, `/plans-implantation/${saved.uid}`, fallbackReturnTo, { replace: true })
                return
            }
            queryClient.setQueryData(['plan-implantation', uid], saved)
            setForm(buildForm(saved))
            setEditing(false)
        },
    })

    const deleteMutation = useMutation({
        mutationFn: () => plansImplantationApi.delete(uid),
        onSuccess: () => {
            navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)
        },
    })

    const canvasEntries = useMemo(() => {
        const payload = data?.payload || {}
        const entries = []
        if (payload.canvas && typeof payload.canvas === 'object') {
            entries.push(payload.canvas)
        }
        if (payload.canvas_by_feuille && typeof payload.canvas_by_feuille === 'object') {
            Object.values(payload.canvas_by_feuille).forEach((item) => {
                if (item && typeof item === 'object') {
                    entries.push(item)
                }
            })
        }
        return entries
    }, [data?.payload])

    const canvasPoints = useMemo(() => {
        const byCode = new Map()
        canvasEntries.forEach((entry) => {
            const points = Array.isArray(entry?.points) ? entry.points : []
            points.forEach((point) => {
                const code = String(point?.code || '').trim()
                if (!code) return
                const key = code.toUpperCase()
                const prev = byCode.get(key)
                if (!prev) {
                    byCode.set(key, point)
                    return
                }
                const prevPlaced = prev?.x != null && prev?.y != null
                const nextPlaced = point?.x != null && point?.y != null
                if (!prevPlaced && nextPlaced) {
                    byCode.set(key, point)
                    return
                }
                if (!prev?.feuille_reference && point?.feuille_reference) {
                    byCode.set(key, { ...prev, feuille_reference: point.feuille_reference })
                }
            })
        })
        return Array.from(byCode.values())
    }, [canvasEntries])

    const mergedPoints = useMemo(() => {
        const interventionPoints = Array.isArray(interventionPointsData?.points)
            ? interventionPointsData.points.filter((item) => !item.is_virtual)
            : []

        const byCode = new Map()
        const canvasByCode = new Map(
            canvasPoints
                .filter((p) => String(p?.code || '').trim())
                .map((p) => [String(p.code).trim().toUpperCase(), p]),
        )

        interventionPoints.forEach((item) => {
            const code = String(item.point_code || '').trim()
            if (!code) return
            const key = code.toUpperCase()
            const canvasPoint = canvasByCode.get(key)
            const implanted = Boolean(
                item.already_in_plan
                || (item.plan_canvas_x != null && item.plan_canvas_y != null)
                || (canvasPoint?.x != null && canvasPoint?.y != null),
            )
            const coords = resolvePointCoordinates(item, canvasPoint)
            byCode.set(key, {
                uid: item.uid,
                point_code: code,
                point_type: item.point_type || canvasPoint?.type || '',
                feuille_reference: item.feuille_reference || canvasPoint?.feuille_reference || '',
                feuille_date_essai: item.feuille_date_essai || '',
                axe: canvasPoint?.axe || '',
                pk: canvasPoint?.pk || '',
                x: coords.x,
                y: coords.y,
                z: coords.z,
                statut_implantation: implanted ? 'Implanté' : 'À implanter',
                already_in_plan: implanted,
            })
        })

        canvasPoints.forEach((point) => {
            const code = String(point?.code || '').trim()
            if (!code) return
            const key = code.toUpperCase()
            if (byCode.has(key)) return
            const implanted = point.x != null && point.y != null
            const coords = resolvePointCoordinates(null, point)
            byCode.set(key, {
                uid: point.linked_uid || point.id || key,
                point_code: code,
                point_type: point.type || '',
                feuille_reference: point.feuille_reference || '',
                feuille_date_essai: point.feuille_date_essai || '',
                axe: point.axe || '',
                pk: point.pk || '',
                x: coords.x,
                y: coords.y,
                z: coords.z,
                statut_implantation: implanted ? 'Implanté' : 'À implanter',
                already_in_plan: implanted,
            })
        })

        return Array.from(byCode.values()).sort((a, b) =>
            String(a.point_code || '').localeCompare(String(b.point_code || ''), 'fr', { numeric: true, sensitivity: 'base' }),
        )
    }, [interventionPointsData?.points, canvasPoints])

    const croquisFrames = useMemo(() => {
        const payload = isNew ? {} : (data?.payload || {})
        const feuilles = Array.isArray(interventionPointsData?.feuilles) ? interventionPointsData.feuilles : []
        const frames = buildInterventionCroquisFrames(payload, feuilles)

        if (frames.length > 0) return frames

        const fondPath = normalizePlanImagePath(
            data?.fond_plan
            || data?.payload?.fond_plan
            || form.fond_plan
            || '',
        )
        if (isStorageImagePath(fondPath)) {
            return [{
                key: 'fond-plan',
                label: 'Plan sélectionné',
                imagePath: fondPath,
                points: [],
                zoneRects: [],
            }]
        }

        return []
    }, [isNew, data, interventionPointsData, form.fond_plan])

    const saveError = saveMutation.error?.message || deleteMutation.error?.message || ''

    function setField(key, value) {
        setForm((current) => ({ ...current, [key]: value }))
    }

    function handleDelete() {
        const label = data?.reference || `PI #${uid}`
        if (!window.confirm(
            `Supprimer le plan d'implantation ${label} ?\n\nLe canevas et les implantations planimétriques seront supprimés. Les points terrain restent inchangés.`,
        )) return
        deleteMutation.mutate()
    }

    function handleSave() {
        saveMutation.mutate({
            scope: form.scope,
            demande_id: Number(form.demande_id),
            campagne_id: form.scope === 'campagne' || form.scope === 'intervention' ? (form.campagne_id ? Number(form.campagne_id) : null) : null,
            intervention_id: form.scope === 'intervention' ? Number(form.intervention_id) : null,
            titre: form.titre || '',
            date_plan: form.date_plan || '',
            operateur: form.operateur || '',
            zone: form.zone || '',
            fond_plan: form.fond_plan || '',
            systeme_reperage: form.systeme_reperage || '',
            repere_base: form.repere_base || '',
            observations: form.observations || '',
        })
    }

    function handleCancel() {
        if (isNew) {
            navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)
            return
        }
        setForm(buildForm(data))
        setEditing(false)
    }

    if (!isNew && isLoading) {
        return <div className="py-12 text-center text-sm text-text-muted">Chargement du plan d’implantation…</div>
    }

    if (!isNew && (error || !data)) {
        return (
            <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
                    Impossible de charger cette fiche plan d’implantation.
                </div>
                <div>
                    <Button variant="secondary" onClick={() => navigateBackWithFallback(navigate, searchParams, '/demandes')}>Retour</Button>
                </div>
            </div>
        )
    }

    const current = isNew ? null : data
    const currentInterventionId = Number.parseInt(String(current?.intervention_id || form.intervention_id || ''), 10)
    const currentDemandeId = Number.parseInt(String(current?.demande_id || form.demande_id || ''), 10)
    const preferredCanvasFeuilleId = (() => {
        const feuilles = Array.isArray(interventionPointsData?.feuilles) ? interventionPointsData.feuilles : []
        if (!feuilles.length) return null
        const latest = [...feuilles].sort((left, right) => {
            const leftDate = String(left?.date_feuille || '')
            const rightDate = String(right?.date_feuille || '')
            if (leftDate !== rightDate) return rightDate.localeCompare(leftDate)
            return Number(right?.id || 0) - Number(left?.id || 0)
        })[0]
        return latest ? Number(latest.id) : null
    })()

    const canvasPath = `/plans-implantation/${uid}/canvas${preferredCanvasFeuilleId != null ? `?feuille_id=${preferredCanvasFeuilleId}` : ''}`
    const openCanvas = () => navigateWithReturnTo(navigate, canvasPath, childReturnTo)

    const showEditForm = editing && !isConsultationMode
    const implantedCount = mergedPoints.filter((item) => item.already_in_plan).length

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Plan d&apos;implantation</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">{isNew ? "Nouveau plan d'implantation" : current.reference}</h1>
                    {!isNew && current?.titre ? (
                        <p className="mt-2 text-sm text-text-muted">{current.titre}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-muted">
                        {(current?.demande_reference || form.demande_reference) ? <span className="rounded-full border border-border bg-bg px-3 py-1">Demande {current?.demande_reference || form.demande_reference}</span> : null}
                        {(current?.campagne_reference || form.campagne_reference) ? <span className="rounded-full border border-border bg-bg px-3 py-1">Campagne {current?.campagne_reference || form.campagne_reference}</span> : null}
                        {(current?.intervention_reference || form.intervention_reference) ? <span className="rounded-full border border-border bg-bg px-3 py-1">Intervention {current?.intervention_reference || form.intervention_reference}</span> : null}
                        {!isNew ? <span className="rounded-full border border-border bg-bg px-3 py-1">{implantedCount} point{implantedCount > 1 ? 's' : ''} implanté{implantedCount > 1 ? 's' : ''}</span> : null}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}>Retour</Button>
                    {Number.isInteger(currentDemandeId) && currentDemandeId > 0 ? <Button variant="secondary" onClick={() => navigate(`/demandes/${currentDemandeId}`)}>Ouvrir la demande</Button> : null}
                    {Number.isInteger(currentInterventionId) && currentInterventionId > 0 ? <Button variant="secondary" onClick={() => navigate(`/interventions/${currentInterventionId}`)}>Ouvrir l’intervention</Button> : null}
                    {!isNew ? (
                        <Button
                            variant={isConsultationMode ? 'primary' : 'secondary'}
                            onClick={openCanvas}
                        >
                            🖼 Canevas
                        </Button>
                    ) : null}
                    {editing ? (
                        <>
                            <Button variant="secondary" onClick={handleCancel}>Annuler</Button>
                            <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending || !form.demande_id}>{saveMutation.isPending ? '…' : 'Enregistrer'}</Button>
                        </>
                    ) : !isConsultationMode ? (
                        <>
                            <Button variant="primary" onClick={() => setEditing(true)}>Modifier</Button>
                            <Button variant="danger" onClick={handleDelete} disabled={deleteMutation.isPending}>
                                {deleteMutation.isPending ? '…' : 'Supprimer'}
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>

            {isConsultationMode ? (
                <div className="rounded-lg border border-[#cfe4f6] bg-[#eef6fd] px-4 py-3 text-sm text-[#185fa5]">
                    Consultation seule du cadre — choisissez le fond de plan et implantez les points via le canevas.
                </div>
            ) : null}

            {isNew ? (
                <div className="rounded-lg border border-[#cfe4f6] bg-[#eef6fd] px-4 py-3 text-sm text-[#185fa5]">
                    Ce plan d’implantation n’est pas encore enregistré. Prépare la fiche puis enregistre-la seulement quand elle est prête.
                </div>
            ) : null}

            {saveError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {saveError}
                </div>
            ) : null}

            {showEditForm ? (
                <Card title="Cadre du plan d’implantation">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Titre"><Input value={form.titre} onChange={(event) => setField('titre', event.target.value)} /></Field>
                        <Field label="Date plan"><Input type="date" value={form.date_plan} onChange={(event) => setField('date_plan', event.target.value)} /></Field>
                        <Field label="Opérateur"><Input value={form.operateur} onChange={(event) => setField('operateur', event.target.value)} /></Field>
                        <Field label="Zone"><Input value={form.zone} onChange={(event) => setField('zone', event.target.value)} /></Field>
                        <Field label="Système de repérage"><Input value={form.systeme_reperage} onChange={(event) => setField('systeme_reperage', event.target.value)} /></Field>
                        <Field label="Repère de base"><Input value={form.repere_base} onChange={(event) => setField('repere_base', event.target.value)} /></Field>
                        <Field label="Intervention"><Input value={form.intervention_reference || (form.intervention_id ? `#${form.intervention_id}` : '')} readOnly /></Field>
                        <Field label="Campagne"><Input value={form.campagne_reference || (form.campagne_id ? `#${form.campagne_id}` : '')} readOnly /></Field>
                        <Field label="Observations" full><Textarea value={form.observations} onChange={(value) => setField('observations', value)} rows={4} /></Field>
                    </div>
                </Card>
            ) : !isNew ? (
                <Card title="Cadre">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Titre" value={current?.titre} />
                        <Row label="Date plan" value={formatDate(current?.date_plan)} />
                        <Row label="Opérateur" value={current?.operateur} />
                        <Row label="Statut" value={current?.statut || ''} />
                        <Row label="Zone" value={current?.zone} />
                        <Row label="Système de repérage" value={current?.systeme_reperage} />
                        <Row label="Repère de base" value={current?.repere_base || current?.payload?.repere_base} />
                        <Row label="Intervention" value={current?.intervention_reference} />
                        {current?.observations ? (
                            <div className="md:col-span-2 flex flex-col gap-0.5">
                                <span className="text-[10px] text-text-muted">Observations</span>
                                <span className="text-[13px] whitespace-pre-wrap text-text">{current.observations}</span>
                            </div>
                        ) : null}
                    </div>
                </Card>
            ) : null}

            {!isNew ? (
            <Card title="Points implantés">
                {mergedPoints.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-bg border-b border-border">
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Point</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Feuille</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Date essai</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Type</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Axe</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">PK</th>
                                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">X</th>
                                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Y</th>
                                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Z</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {mergedPoints.map((point) => (
                                    <tr key={point.uid ?? point.point_code} className="border-b border-border">
                                        <td className="px-2 py-1.5 text-[12px] font-semibold text-text">{point.point_code || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.feuille_reference || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{formatDate(point.feuille_date_essai) || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.point_type || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.axe || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.pk || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{point.x != null ? Number(point.x).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{point.y != null ? Number(point.y).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{point.z != null ? Number(point.z).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.statut_implantation || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-[13px] text-text-muted">Aucun point dans ce plan d’implantation. Utilisez le canevas pour implanter les points.</div>
                )}
            </Card>
            ) : null}

            {!isNew ? (
            <Card title="Plans sélectionnés">
                {croquisFrames.length > 0 ? (
                    <div className="flex flex-col gap-5">
                        {croquisFrames.map((frame) => (
                            <CroquisFrame
                                key={frame.key}
                                frame={frame}
                                maskId={`pi-zones-mask-${uid || 'new'}-${frame.key}`}
                            />
                        ))}
                        <p className="text-[11px] text-text-muted">
                            Uniquement les plans image choisis dans le canevas pour ce dossier PI.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <div className="text-[13px] text-text-muted">
                            Aucun plan image sélectionné. Ouvrez le canevas pour choisir le fond de plan à utiliser.
                        </div>
                        <div>
                            <Button variant="primary" onClick={openCanvas}>
                                Ouvrir le canevas
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
            ) : null}

            {!isNew && Array.isArray(current?.rapports) && current.rapports.length > 0 ? (
            <Card title="Rapports liés">
                    <div className="flex flex-col gap-2">
                        {current.rapports.map((rapport) => (
                            <div key={rapport.uid} className="rounded-lg border border-border bg-bg px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-[12px] font-semibold text-text">{rapport.reference}</div>
                                    <div className="text-[11px] text-text-muted">{formatDate(rapport.date_rapport) || '—'}</div>
                                </div>
                                <div className="mt-1 text-[12px] text-text-muted">{rapport.titre || rapport.type_rapport || 'Rapport'}</div>
                            </div>
                        ))}
                    </div>
            </Card>
            ) : null}
        </div>
    )
}


