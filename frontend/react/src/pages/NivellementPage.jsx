import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { nivellementsApi } from '@/services/api'
import { formatDate } from '@/lib/utils'

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
        titre: searchParams.get('titre') || 'Nivellement',
        date_releve: searchParams.get('date_releve') || '',
        operateur: searchParams.get('operateur') || '',
        referentiel_altimetrique: searchParams.get('referentiel_altimetrique') || '',
        materiel: searchParams.get('materiel') || '',
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
        titre: source.titre || data?.titre || 'Nivellement',
        date_releve: source.date_releve || data?.date_releve || '',
        operateur: source.operateur || data?.operateur || '',
        referentiel_altimetrique: source.referentiel_altimetrique || data?.referentiel_altimetrique || data?.payload?.referentiel || '',
        materiel: source.materiel || data?.materiel || data?.payload?.materiel || '',
        observations: source.observations || data?.observations || '',
    }
}

export default function NivellementPage() {
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
        queryKey: ['nivellement', uid],
        queryFn: () => nivellementsApi.get(uid),
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
        mutationFn: (payload) => isNew ? nivellementsApi.create(payload) : nivellementsApi.update(uid, payload),
        onSuccess: (saved) => {
            if (isNew) {
                navigateWithReturnTo(navigate, `/nivellements/${saved.uid}`, fallbackReturnTo, { replace: true })
                return
            }
            queryClient.setQueryData(['nivellement', uid], saved)
            setForm(buildForm(saved))
            setEditing(false)
        },
    })

    const averageAltitude = useMemo(() => {
        const values = Array.isArray(data?.points) ? data.points.map((item) => item.altitude_terrain).filter((value) => value != null) : []
        if (!values.length) return null
        return values.reduce((sum, value) => sum + Number(value), 0) / values.length
    }, [data?.points])

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
            date_releve: form.date_releve || '',
            operateur: form.operateur || '',
            referentiel_altimetrique: form.referentiel_altimetrique || '',
            materiel: form.materiel || '',
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
        return <div className="py-12 text-center text-sm text-text-muted">Chargement du nivellement…</div>
    }

    if (!isNew && (error || !data)) {
        return (
            <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-sm text-red-700">
                    Impossible de charger cette fiche nivellement.
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

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Fiche support de campagne</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">{isNew ? 'Nouveau nivellement' : current.reference}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                        Nivellement initial et rattachement altimétrique des points de campagne avant exploitation terrain.
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
                    Ce nivellement n’est pas encore enregistré. Prépare la fiche puis enregistre-la seulement quand elle est prête.
                </div>
            ) : null}

            {saveError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {saveError}
                </div>
            ) : null}

            {editing ? (
                <Card title="Cadre du nivellement">
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
                        <Field label="Date relevé"><Input type="date" value={form.date_releve} onChange={(event) => setField('date_releve', event.target.value)} /></Field>
                        <Field label="Opérateur"><Input value={form.operateur} onChange={(event) => setField('operateur', event.target.value)} /></Field>
                        <Field label="Référentiel altimétrique"><Input value={form.referentiel_altimetrique} onChange={(event) => setField('referentiel_altimetrique', event.target.value)} /></Field>
                        <Field label="Matériel"><Input value={form.materiel} onChange={(event) => setField('materiel', event.target.value)} /></Field>
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
                        <Row label="Date relevé" value={formatDate(editing ? form.date_releve : current?.date_releve)} />
                        <Row label="Opérateur" value={editing ? form.operateur : current?.operateur} />
                        <Row label="Statut" value={current?.statut || (isNew ? 'Brouillon' : '')} />
                        <Row label="Référentiel altimétrique" value={editing ? form.referentiel_altimetrique : (current?.referentiel_altimetrique || current?.payload?.referentiel)} />
                        <Row label="Matériel" value={editing ? form.materiel : (current?.materiel || current?.payload?.materiel)} />
                        <Row label="Scope" value={editing ? form.scope : (current?.ownership_scope || form.scope)} />
                        <Row label="Origine" value={current?.ownership_origin_label || ''} />
                    </div>
                </Card>
                <Card title="Synthèse">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Points nivelés" value={Array.isArray(current?.points) ? String(current.points.length) : ''} />
                        <Row label="Altitude moyenne" value={averageAltitude != null ? `${averageAltitude.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m` : ''} />
                        <Row label="Intervention source" value={current?.intervention_subject || current?.type_intervention} />
                    </div>
                    <div className="mt-4 text-sm whitespace-pre-wrap text-text-muted">{editing ? (form.observations || '—') : (current?.observations || '—')}</div>
                </Card>
            </div>

            <Card title="Points nivelés">
                {Array.isArray(current?.points) && current.points.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="bg-bg border-b border-border">
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Point</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Repère</th>
                                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Altitude terrain</th>
                                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Cote projet</th>
                                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Écart</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Observation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {current.points.map((point) => (
                                    <tr key={point.uid} className="border-b border-border">
                                        <td className="px-2 py-1.5 text-[12px] font-semibold text-text">{point.point_code || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.repere || '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{point.altitude_terrain != null ? `${Number(point.altitude_terrain).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m` : '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{point.cote_projet != null ? `${Number(point.cote_projet).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m` : '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-right text-text-muted">{point.ecart != null ? `${Number(point.ecart).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m` : '—'}</td>
                                        <td className="px-2 py-1.5 text-[12px] text-text-muted">{point.observation || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="text-[13px] text-text-muted">{isNew ? 'Enregistre d’abord ce nivellement pour ajouter ensuite des points.' : 'Aucun point détaillé dans ce nivellement.'}</div>
                )}
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
