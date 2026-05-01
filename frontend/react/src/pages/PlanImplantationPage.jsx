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
    return {
        scope: searchParams.get('scope') || 'campagne',
        intervention_id: searchParams.get('intervention_id') || '',
        campagne_id: searchParams.get('campagne_id') || '',
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
    const draftPrefill = useMemo(() => buildDraftPrefill(searchParams), [searchParams])
    const [editing, setEditing] = useState(isNew)
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
        if (data) {
            setForm(buildForm(data))
        }
    }, [isNew, draftPrefill, data])

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
            byCode.set(key, {
                uid: item.uid,
                point_code: code,
                point_type: item.point_type || canvasPoint?.type || '',
                feuille_reference: item.feuille_reference || canvasPoint?.feuille_reference || '',
                feuille_date_essai: item.feuille_date_essai || '',
                axe: canvasPoint?.axe || '',
                pk: canvasPoint?.pk || '',
                x: canvasPoint?.x ?? null,
                y: canvasPoint?.y ?? null,
                z: canvasPoint?.z ?? null,
                statut_implantation: item.already_in_plan || (canvasPoint?.x != null && canvasPoint?.y != null) ? 'Implanté' : 'À implanter',
                already_in_plan: Boolean(item.already_in_plan || (canvasPoint?.x != null && canvasPoint?.y != null)),
            })
        })

        canvasPoints.forEach((point) => {
            const code = String(point?.code || '').trim()
            if (!code) return
            const key = code.toUpperCase()
            if (byCode.has(key)) return
            byCode.set(key, {
                uid: point.linked_uid || point.id || key,
                point_code: code,
                point_type: point.type || '',
                feuille_reference: point.feuille_reference || '',
                feuille_date_essai: point.feuille_date_essai || '',
                axe: point.axe || '',
                pk: point.pk || '',
                x: point.x ?? null,
                y: point.y ?? null,
                z: point.z ?? null,
                statut_implantation: point.x != null && point.y != null ? 'Implanté' : 'À implanter',
                already_in_plan: point.x != null && point.y != null,
            })
        })

        return Array.from(byCode.values()).sort((a, b) =>
            String(a.point_code || '').localeCompare(String(b.point_code || ''), 'fr', { numeric: true, sensitivity: 'base' }),
        )
    }, [interventionPointsData?.points, canvasPoints])

    const pointTypes = useMemo(() => {
        const values = mergedPoints.map((item) => item.point_type).filter(Boolean)
        return [...new Set(values)]
    }, [mergedPoints])

    const saveError = saveMutation.error?.message || ''

    function setField(key, value) {
        setForm((current) => ({ ...current, [key]: value }))
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
    const imagePath = normalizePlanImagePath(
        current?.payload?.canvas?.image_path
        || canvasEntries.find((entry) => String(entry?.image_path || '').trim())?.image_path
        || current?.fond_plan
        || current?.payload?.fond_plan
        || '',
    )
    const imageUrl = buildStorageImageUrl(imagePath)
    const zoneRects = Array.from(
        new Map(
            canvasEntries
                .map((entry) => normalizeRect(entry?.zone_rect))
                .filter(Boolean)
                .map((rect) => {
                    const key = `${rect.x1.toFixed(4)}:${rect.y1.toFixed(4)}:${rect.x2.toFixed(4)}:${rect.y2.toFixed(4)}`
                    return [key, rect]
                }),
        ).values(),
    )
    const croquisPoints = canvasPoints.filter((p) => p?.x != null && p?.y != null)
    const outsideZonesMaskId = `pi-zones-mask-${uid || 'new'}`

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Fiche support de campagne</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">{isNew ? "Nouveau plan d'implantation" : current.reference}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                        Plan d’implantation des points terrain, repères et axes utilisés avant lancement des investigations.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                        {(current?.demande_reference || form.demande_reference) ? <span className="rounded-full border border-border bg-bg px-3 py-1">Demande {current?.demande_reference || form.demande_reference}</span> : null}
                        {(current?.campagne_reference || form.campagne_reference) ? <span className="rounded-full border border-border bg-bg px-3 py-1">Campagne {current?.campagne_reference || form.campagne_reference}</span> : null}
                        {(current?.intervention_reference || form.intervention_reference) ? <span className="rounded-full border border-border bg-bg px-3 py-1">Intervention {current?.intervention_reference || form.intervention_reference}</span> : null}
                        <span className="rounded-full border border-border bg-bg px-3 py-1">Scope {editing ? form.scope : (current?.ownership_scope || form.scope)}</span>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}>Retour</Button>
                    {Number.isInteger(currentDemandeId) && currentDemandeId > 0 ? <Button variant="secondary" onClick={() => navigate(`/demandes/${currentDemandeId}`)}>Ouvrir la demande</Button> : null}
                    {Number.isInteger(currentInterventionId) && currentInterventionId > 0 ? <Button variant="secondary" onClick={() => navigate(`/interventions/${currentInterventionId}`)}>Ouvrir l’intervention</Button> : null}
                    {!isNew ? (
                        <Button
                            variant="secondary"
                            onClick={() => navigate(`/plans-implantation/${uid}/canvas${preferredCanvasFeuilleId != null ? `?feuille_id=${preferredCanvasFeuilleId}` : ''}`)}
                        >
                            🖼 Canevas
                        </Button>
                    ) : null}
                    {editing ? (
                        <>
                            <Button variant="secondary" onClick={handleCancel}>Annuler</Button>
                            <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending || !form.demande_id}>{saveMutation.isPending ? '…' : 'Enregistrer'}</Button>
                        </>
                    ) : (
                        <Button variant="primary" onClick={() => setEditing(true)}>Modifier</Button>
                    )}
                </div>
            </div>

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

            {editing ? (
                <Card title="Cadre du plan d’implantation">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Scope">
                            <select
                                value={form.scope}
                                onChange={(event) => setField('scope', event.target.value)}
                                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
                            >
                                <option value="demande">Demande</option>
                                <option value="campagne">Campagne</option>
                                <option value="intervention">Intervention</option>
                            </select>
                        </Field>
                        <Field label="Titre"><Input value={form.titre} onChange={(event) => setField('titre', event.target.value)} /></Field>
                        <Field label="Date plan"><Input type="date" value={form.date_plan} onChange={(event) => setField('date_plan', event.target.value)} /></Field>
                        <Field label="Opérateur"><Input value={form.operateur} onChange={(event) => setField('operateur', event.target.value)} /></Field>
                        <Field label="Zone"><Input value={form.zone} onChange={(event) => setField('zone', event.target.value)} /></Field>
                        <Field label="Fond de plan"><Input value={form.fond_plan} onChange={(event) => setField('fond_plan', event.target.value)} /></Field>
                        <Field label="Système de repérage"><Input value={form.systeme_reperage} onChange={(event) => setField('systeme_reperage', event.target.value)} /></Field>
                        <Field label="Repère de base"><Input value={form.repere_base} onChange={(event) => setField('repere_base', event.target.value)} /></Field>
                        <Field label="Campagne"><Input value={form.campagne_reference || (form.campagne_id ? `#${form.campagne_id}` : '')} readOnly /></Field>
                        <Field label="Intervention"><Input value={form.intervention_reference || (form.intervention_id ? `#${form.intervention_id}` : '')} readOnly /></Field>
                        <Field label="Observations" full><Textarea value={form.observations} onChange={(value) => setField('observations', value)} rows={4} /></Field>
                    </div>
                </Card>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Cadre">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Titre" value={editing ? form.titre : current?.titre} />
                        <Row label="Date plan" value={formatDate(editing ? form.date_plan : current?.date_plan)} />
                        <Row label="Opérateur" value={editing ? form.operateur : current?.operateur} />
                        <Row label="Statut" value={current?.statut || (isNew ? 'Brouillon' : '')} />
                        <Row label="Zone" value={editing ? form.zone : current?.zone} />
                        <Row label="Fond de plan" value={editing ? form.fond_plan : (current?.fond_plan || current?.payload?.fond_plan)} />
                        <Row label="Système de repérage" value={editing ? form.systeme_reperage : current?.systeme_reperage} />
                        <Row label="Repère de base" value={editing ? form.repere_base : (current?.repere_base || current?.payload?.repere_base)} />
                        <Row label="Scope" value={editing ? form.scope : (current?.ownership_scope || form.scope)} />
                        <Row label="Origine" value={current?.ownership_origin_label || ''} />
                    </div>
                </Card>
                <Card title="Synthèse">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Points implantés" value={String(mergedPoints.filter((item) => item.already_in_plan).length)} />
                        <Row label="Familles de points" value={pointTypes.join(', ')} />
                        <Row label="Intervention source" value={current?.intervention_subject || current?.type_intervention} />
                        <Row label="Description" value={current?.payload?.description} />
                    </div>
                    <div className="mt-4 text-sm whitespace-pre-wrap text-text-muted">{editing ? (form.observations || '—') : (current?.observations || '—')}</div>
                </Card>
            </div>

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
                    <div className="text-[13px] text-text-muted">{isNew ? 'Enregistre d’abord ce plan d’implantation pour ajouter ensuite des points.' : 'Aucun point détaillé dans ce plan d’implantation.'}</div>
                )}
            </Card>

            <Card title="Croquis d'implantation">
                {(() => {
                    if (!imageUrl) {
                        return <div className="text-[13px] text-text-muted">Croquis non disponible (aucune image de plan liée).</div>
                    }
                    if (croquisPoints.length === 0) {
                        return <div className="text-[13px] text-text-muted">Croquis non disponible (aucun point géoréférencé).</div>
                    }
                    const palette = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']
                    const typeColors = {}
                    let colorIdx = 0
                    croquisPoints.forEach((p) => {
                        const pType = p.type || p.point_type
                        if (pType && !typeColors[pType]) typeColors[pType] = palette[colorIdx++ % palette.length]
                    })

                    return (
                        <div className="flex flex-col gap-3">
                            <div className="relative w-full overflow-hidden border border-border rounded-lg bg-bg">
                                <img src={imageUrl} alt="Croquis d'implantation" className="block w-full h-auto select-none pointer-events-none" draggable={false} />
                                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                                    {zoneRects.length > 0 ? (
                                        <defs>
                                            <mask id={outsideZonesMaskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
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
                                        <rect x="0" y="0" width="100" height="100" fill="rgba(15, 23, 42, 0.22)" mask={`url(#${outsideZonesMaskId})`} />
                                    ) : null}
                                    {zoneRects.map((rect, idx) => {
                                        const zoneColor = palette[idx % palette.length]
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
                                    {croquisPoints.map((p) => {
                                        const color = typeColors[p.type || p.point_type] || '#6b7280'
                                        return (
                                            <g key={p.id || p.linked_uid || p.code}>
                                                <circle cx={Number(p.x)} cy={Number(p.y)} r="0.85" fill={color} stroke="white" strokeWidth="0.3" opacity="0.95" />
                                                <text x={Number(p.x) + 1.1} y={Number(p.y) + 0.45} fontSize="1.7" fill={color} fontFamily="sans-serif" fontWeight="700">{p.code}</text>
                                            </g>
                                        )
                                    })}
                                </svg>
                            </div>
                            <p className="text-[11px] text-text-muted">Mode lecture seule: aperçu du canevas sur toutes les zones d’intervention disponibles.</p>
                            {Object.keys(typeColors).length > 0 && (
                                <div className="flex flex-wrap gap-3">
                                    {Object.entries(typeColors).map(([type, color]) => (
                                        <div key={type} className="flex items-center gap-1.5">
                                            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
                                            <span className="text-[11px] text-text-muted">{type}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })()}
            </Card>

            <Card title="Rapports liés">
                {Array.isArray(current?.rapports) && current.rapports.length > 0 ? (
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
                ) : (
                    <div className="text-[13px] text-text-muted">Aucun rapport lié.</div>
                )}
            </Card>
        </div>
    )
}
