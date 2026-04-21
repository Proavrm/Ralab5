import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import { navigateBackWithFallback } from '@/lib/detailNavigation'
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

export default function NivellementPage() {
    const { uid } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    const { data, isLoading, error } = useQuery({
        queryKey: ['nivellement', uid],
        queryFn: () => nivellementsApi.get(uid),
        enabled: Boolean(uid),
    })

    const averageAltitude = useMemo(() => {
        const values = Array.isArray(data?.points) ? data.points.map((item) => item.altitude_terrain).filter((value) => value != null) : []
        if (!values.length) return null
        return values.reduce((sum, value) => sum + Number(value), 0) / values.length
    }, [data?.points])

    if (isLoading) {
        return <div className="py-12 text-center text-sm text-text-muted">Chargement du nivellement…</div>
    }

    if (error || !data) {
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

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Fiche support de campagne</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">{data.reference}</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
                        Nivellement initial et rattachement altimétrique des points de campagne avant exploitation terrain.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
                        {data.demande_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Demande {data.demande_reference}</span> : null}
                        {data.campagne_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Campagne {data.campagne_reference}</span> : null}
                        {data.intervention_reference ? <span className="rounded-full border border-border bg-bg px-3 py-1">Intervention {data.intervention_reference}</span> : null}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => navigateBackWithFallback(navigate, searchParams, '/demandes')}>Retour</Button>
                    {data.demande_id ? <Button variant="secondary" onClick={() => navigate(`/demandes/${data.demande_id}`)}>Ouvrir la demande</Button> : null}
                    {data.intervention_id ? <Button variant="secondary" onClick={() => navigate(`/interventions/${data.intervention_id}`)}>Ouvrir l’intervention</Button> : null}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title="Cadre">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Titre" value={data.titre} />
                        <Row label="Date relevé" value={formatDate(data.date_releve)} />
                        <Row label="Opérateur" value={data.operateur} />
                        <Row label="Statut" value={data.statut} />
                        <Row label="Référentiel altimétrique" value={data.referentiel_altimetrique || data.payload?.referentiel} />
                        <Row label="Matériel" value={data.materiel || data.payload?.materiel} />
                    </div>
                </Card>
                <Card title="Synthèse">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Row label="Points nivelés" value={Array.isArray(data.points) ? String(data.points.length) : ''} />
                        <Row label="Altitude moyenne" value={averageAltitude != null ? `${averageAltitude.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m` : ''} />
                        <Row label="Intervention source" value={data.intervention_subject || data.type_intervention} />
                    </div>
                    <div className="mt-4 text-sm whitespace-pre-wrap text-text-muted">{data.observations || '—'}</div>
                </Card>
            </div>

            <Card title="Points nivelés">
                {Array.isArray(data.points) && data.points.length > 0 ? (
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
                                {data.points.map((point) => (
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
                    <div className="text-[13px] text-text-muted">Aucun point détaillé dans ce nivellement.</div>
                )}
            </Card>

            <Card title="Rapports liés">
                {Array.isArray(data.rapports) && data.rapports.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {data.rapports.map((rapport) => (
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
