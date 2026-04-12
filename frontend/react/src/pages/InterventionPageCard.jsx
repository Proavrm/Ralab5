/**
 * InterventionPageCard.jsx
 * Simplified intervention preview aligned with the EchantillonPage spirit.
 *
 * Key idea:
 * - one main fiche
 * - one combobox-driven block to choose what can be added to the intervention
 * - not many separate cards
 *
 * This replaces the previous preview file.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, demandesApi, interventionsApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'

function Card({ title, children, right }) {
    return (
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
            {title && (
                <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
                    {right}
                </div>
            )}
            <div className="p-4">{children}</div>
        </div>
    )
}

function FG({ label, children, full = false }) {
    return (
        <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
            <label className="text-[11px] font-medium text-text-muted">{label}</label>
            {children}
        </div>
    )
}

function FR({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5 mb-2">
            <span className="text-[10px] text-text-muted">{label}</span>
            <span className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}>{value || '—'}</span>
        </div>
    )
}

const STAT_CLS = {
    'Planifiée': 'bg-[#e6f1fb] text-[#185fa5]',
    'En cours': 'bg-[#faeeda] text-[#854f0b]',
    'Réalisée': 'bg-[#eaf3de] text-[#3b6d11]',
    'Annulée': 'bg-[#f1efe8] text-[#5f5e5a]',
    'Importée': 'bg-[#f1efe8] text-[#5f5e5a]',
}

function Badge({ s }) {
    return s ? (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
    ) : null
}

const TYPE_OPTIONS = [
    'Visite technique',
    'Prélèvement',
    'Reconnaissance géotechnique',
    'Contrôle de plateforme',
    'Contrôle de compactage',
    'Suivi de terrassements',
    'Suivi de traitement des sols',
    'Suivi d’enrobés',
    'Contrôle de réseaux / étanchéité',
    'Infiltration / perméabilité',
    'Suivi béton / GC',
    'Diagnostic / constat',
    'Assistance technique de chantier',
    'Autre',
]

const FINALITY_OPTIONS = [
    'Identification / classification',
    'Étude GTR',
    'Étude de traitement',
    'Aptitude au remblai',
    'Aptitude à la couche de forme',
    'Contrôle de compactage',
    'Contrôle de plateforme / portance',
    'Contrôle de matériaux',
    'Suivi d’exécution',
    'Diagnostic d’anomalie',
    'Étanchéité',
    'Percolation',
    'Infiltration / perméabilité',
    'Prélèvement pour laboratoire',
    'Réception technique',
    'Autre',
]

const MATERIAL_OPTIONS = [
    'Sol',
    'Matériau de terrassement',
    'GNT / matériau granulaire',
    'Enrobé',
    'Béton / GC',
    'Réseau / canalisation',
    'Plateforme',
    'Tranchée',
    'Talus',
    'Ouvrage',
    'Autre',
]

const STATUTS = ['Planifiée', 'En cours', 'Réalisée', 'Annulée', 'Importée']

const LINK_KIND_OPTIONS = [
    { value: 'sondage', label: 'Sondage' },
    { value: 'prelevement', label: 'Prélèvement' },
    { value: 'essai_terrain', label: 'Essai terrain' },
]

const LINK_TYPE_OPTIONS = {
    sondage: [
        'Sondage à la pelle',
        'Sondage carotté',
        'Reconnaissance visuelle',
        'Autre',
    ],
    prelevement: [
        'Prélèvement sol',
        'Prélèvement GNT',
        'Prélèvement enrobé',
        'Prélèvement béton',
        'Autre',
    ],
    essai_terrain: [
        'Plaque / dynaplaque',
        'Densité in situ',
        'Pénétromètre',
        'Infiltration',
        'Étanchéité',
        'Macrotexture',
        'Déflexion',
        'Autre',
    ],
}

function parseObservations(raw) {
    if (!raw || typeof raw !== 'string') return {}
    const trimmed = raw.trim()
    if (!trimmed.startsWith('{')) return { notes_terrain: raw }
    try {
        return JSON.parse(trimmed)
    } catch {
        return { notes_terrain: raw }
    }
}

function buildObservationsPayload(form, baseObservations = {}) {
    return JSON.stringify({
        ...baseObservations,
        finalite_intervention: form.finalite_intervention || '',
        zone_intervention: form.zone_intervention || '',
        nature_materiau: form.nature_materiau || '',
        objectif_intervention: form.objectif_intervention || '',
        notes_terrain: form.notes_terrain || '',
        responsable_referent: form.responsable_referent || '',
        attribue_a: form.attribue_a || '',
    })
}

function mergeFormFromIntervention(data) {
    const observations = parseObservations(data?.observations || '')
    return {
        demande_id: String(data?.demande_id || ''),
        type_intervention: data?.type_intervention || '',
        finalite_intervention: observations.finalite_intervention || '',
        date_intervention: data?.date_intervention || '',
        technicien: data?.technicien || '',
        zone_intervention: observations.zone_intervention || '',
        nature_materiau: observations.nature_materiau || '',
        objectif_intervention: observations.objectif_intervention || '',
        notes_terrain: observations.notes_terrain || '',
        statut: data?.statut || 'Planifiée',
        responsable_referent: observations.responsable_referent || '',
        attribue_a: observations.attribue_a || '',
    }
}

function prefillFromQuery(searchParams) {
    return {
        demande_id: searchParams.get('demande_id') || '',
        type_intervention: searchParams.get('type_intervention') || '',
        finalite_intervention: searchParams.get('finalite') || '',
        date_intervention: new Date().toISOString().slice(0, 10),
        technicien: '',
        zone_intervention: searchParams.get('zone') || '',
        nature_materiau: searchParams.get('materiau') || '',
        objectif_intervention: searchParams.get('objectif') || '',
        notes_terrain: '',
        statut: 'Planifiée',
        responsable_referent: searchParams.get('responsable') || '',
        attribue_a: searchParams.get('attribue_a') || '',
    }
}

export default function InterventionPageCard() {
    const navigate = useNavigate()
    const { uid } = useParams()
    const [searchParams] = useSearchParams()

    const isNew = uid === 'new'
    const [form, setForm] = useState({
        demande_id: '',
        type_intervention: '',
        finalite_intervention: '',
        date_intervention: '',
        technicien: '',
        zone_intervention: '',
        nature_materiau: '',
        objectif_intervention: '',
        notes_terrain: '',
        statut: 'Planifiée',
        responsable_referent: '',
        attribue_a: '',
    })
    const [originalObservations, setOriginalObservations] = useState({})
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState(isNew)
    const [error, setError] = useState('')
    const [linkKind, setLinkKind] = useState('prelevement')
    const [linkType, setLinkType] = useState('')

    const { data: intervention, isLoading } = useQuery({
        queryKey: ['intervention-card', uid],
        queryFn: () => interventionsApi.get(uid),
        enabled: !isNew,
    })

    useEffect(() => {
        if (isNew) {
            setForm(prefillFromQuery(searchParams))
            setOriginalObservations({})
            setEditing(true)
            return
        }
        if (intervention) {
            setForm(mergeFormFromIntervention(intervention))
            setOriginalObservations(parseObservations(intervention?.observations || ''))
        }
    }, [isNew, intervention, searchParams])

    useEffect(() => {
        const options = LINK_TYPE_OPTIONS[linkKind] || []
        setLinkType(options[0] || '')
    }, [linkKind])

    const demandeId = form.demande_id || ''

    const { data: demande } = useQuery({
        queryKey: ['intervention-card-demande', demandeId],
        queryFn: () => demandesApi.get(demandeId),
        enabled: !!demandeId,
    })

    const { data: laboContext = [], isLoading: laboLoading } = useQuery({
        queryKey: ['intervention-card-labo', demandeId],
        queryFn: async () => {
            const echantillons = await api.get(`/essais/echantillons?demande_id=${demandeId}`)
            const rows = await Promise.all(
                (echantillons || []).map(async (ech) => {
                    const essais = await api.get(`/essais?echantillon_id=${ech.uid}`)
                    return { echantillon: ech, essais: essais || [] }
                })
            )
            return rows
        },
        enabled: !!demandeId,
    })

    async function handleSave() {
        if (!demandeId) {
            setError('Aucune demande liée à cette intervention.')
            return
        }
        try {
            setSaving(true)
            setError('')
            const payload = {
                demande_id: Number(demandeId),
                type_intervention: form.type_intervention,
                sujet: form.objectif_intervention || form.type_intervention || '',
                date_intervention: form.date_intervention,
                duree_heures: null,
                geotechnicien: '',
                technicien: form.technicien,
                observations: buildObservationsPayload(form, originalObservations),
                anomalie_detectee: false,
                niveau_alerte: 'Aucun',
                pv_ref: '',
                rapport_ref: '',
                photos_dossier: '',
                statut: form.statut,
            }
            if (isNew) {
                const saved = await interventionsApi.create(payload)
                navigate(`/interventions-card/${saved.uid}`, { replace: true })
                return
            }
            const saved = await api.put(`/interventions/${uid}`, payload)
            setForm(mergeFormFromIntervention(saved))
            setOriginalObservations(parseObservations(saved?.observations || ''))
            setEditing(false)
        } catch (err) {
            setError(err.message || "Impossible d'enregistrer l'intervention.")
        } finally {
            setSaving(false)
        }
    }

    const title = isNew ? 'Nouvelle intervention' : (intervention?.reference || 'Intervention')

    if (!isNew && isLoading) {
        return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
    }

    if (!isNew && !intervention) {
        return (
            <div className="text-center py-16">
                <p className="text-text-muted text-sm mb-3">Intervention introuvable</p>
                <Button onClick={() => navigate(-1)}>← Retour</Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-[18px] font-bold">{title}</h1>
                        <Badge s={form.statut} />
                        {form.type_intervention ? <Badge s={form.type_intervention} map={{ [form.type_intervention]: 'bg-[#f1efe8] text-[#5f5e5a]' }} /> : null}
                    </div>
                    <p className="text-[13px] text-text-muted mt-1">
                        Même esprit que la fiche échantillon, mais pour l’intervention.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {demandeId ? (
                        <Button size="sm" variant="ghost" onClick={() => navigate(`/demandes/${demandeId}`)}>
                            Demande
                        </Button>
                    ) : null}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                            if (editing && !isNew) {
                                setEditing(false)
                                setError('')
                                return
                            }
                            navigate(-1)
                        }}
                    >
                        Retour
                    </Button>
                    {editing ? (
                        <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
                            {saving ? '…' : 'Enregistrer'}
                        </Button>
                    ) : (
                        <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
                            Modifier
                        </Button>
                    )}
                </div>
            </div>

            {error ? (
                <div className="text-danger text-sm border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                    {error}
                </div>
            ) : null}

            <Card title="Intervention">
                {editing ? (
                    <div className="grid grid-cols-2 gap-4">
                        <FG label="Demande liée">
                            <Input value={demande?.reference || demandeId} readOnly />
                        </FG>
                        <FG label="Affaire">
                            <Input value={demande?.affaire_ref || demande?.affaire_reference || ''} readOnly />
                        </FG>

                        <FG label="Type d’intervention">
                            <Select value={form.type_intervention} onChange={(e) => setForm(f => ({ ...f, type_intervention: e.target.value }))}>
                                <option value="">—</option>
                                {TYPE_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                            </Select>
                        </FG>
                        <FG label="Finalité">
                            <Select value={form.finalite_intervention} onChange={(e) => setForm(f => ({ ...f, finalite_intervention: e.target.value }))}>
                                <option value="">—</option>
                                {FINALITY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                            </Select>
                        </FG>

                        <FG label="Date d’intervention">
                            <Input type="date" value={form.date_intervention} onChange={(e) => setForm(f => ({ ...f, date_intervention: e.target.value }))} />
                        </FG>
                        <FG label="Technicien / opérateur">
                            <Input value={form.technicien} onChange={(e) => setForm(f => ({ ...f, technicien: e.target.value }))} />
                        </FG>

                        <FG label="Zone / localisation">
                            <Input value={form.zone_intervention} onChange={(e) => setForm(f => ({ ...f, zone_intervention: e.target.value }))} />
                        </FG>
                        <FG label="Matériau / objet concerné">
                            <Select value={form.nature_materiau} onChange={(e) => setForm(f => ({ ...f, nature_materiau: e.target.value }))}>
                                <option value="">—</option>
                                {MATERIAL_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                            </Select>
                        </FG>

                        <FG label="Statut">
                            <Select value={form.statut} onChange={(e) => setForm(f => ({ ...f, statut: e.target.value }))}>
                                {STATUTS.map(item => <option key={item} value={item}>{item}</option>)}
                            </Select>
                        </FG>

                        <FG label="Objectif / remarque">
                            <textarea
                                value={form.objectif_intervention || ''}
                                onChange={(e) => setForm(f => ({ ...f, objectif_intervention: e.target.value }))}
                                rows={3}
                                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
                            />
                        </FG>

                        <FG label="Notes terrain">
                            <textarea
                                value={form.notes_terrain || ''}
                                onChange={(e) => setForm(f => ({ ...f, notes_terrain: e.target.value }))}
                                rows={4}
                                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
                            />
                        </FG>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-x-6">
                        <FR label="Demande liée" value={demande?.reference || demandeId} />
                        <FR label="Affaire" value={demande?.affaire_ref || demande?.affaire_reference} />
                        <FR label="Type d’intervention" value={form.type_intervention} />
                        <FR label="Finalité" value={form.finalite_intervention} />
                        <FR label="Date d’intervention" value={form.date_intervention} />
                        <FR label="Technicien / opérateur" value={form.technicien} />
                        <FR label="Zone / localisation" value={form.zone_intervention} />
                        <FR label="Matériau / objet concerné" value={form.nature_materiau} />
                        <FR label="Responsable / référent" value={form.responsable_referent} />
                        <FR label="Attribué à" value={form.attribue_a} />
                        <FR label="Objectif / remarque" value={form.objectif_intervention} />
                        <FR label="Notes terrain" value={form.notes_terrain} />
                    </div>
                )}
            </Card>

            <Card title="Ajouter à l’intervention">
                <div className="grid grid-cols-[220px_1fr_auto] gap-3 items-end">
                    <FG label="Élément">
                        <Select value={linkKind} onChange={(e) => setLinkKind(e.target.value)}>
                            {LINK_KIND_OPTIONS.map((item) => (
                                <option key={item.value} value={item.value}>{item.label}</option>
                            ))}
                        </Select>
                    </FG>

                    <FG label="Type">
                        <Select value={linkType} onChange={(e) => setLinkType(e.target.value)}>
                            {(LINK_TYPE_OPTIONS[linkKind] || []).map((item) => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </Select>
                    </FG>

                    <Button size="sm" variant="primary" disabled>
                        Ajouter
                    </Button>
                </div>
                <div className="mt-3 text-[12px] text-text-muted">
                    Ici on choisira simplement ce qu’on veut rattacher à l’intervention:
                    <strong> sondage</strong>, <strong>prélèvement</strong> ou <strong>essai terrain</strong>.
                </div>
            </Card>

            <Card title={`Suites labo (${laboContext.length} échantillons)`}>
                {laboLoading ? (
                    <p className="text-[13px] text-text-muted italic text-center py-4">Chargement…</p>
                ) : laboContext.length === 0 ? (
                    <p className="text-[13px] text-text-muted italic text-center py-4">
                        Aucun échantillon labo visible pour la demande.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {laboContext.map(({ echantillon, essais }) => (
                            <div key={echantillon.uid} className="border border-border rounded-lg overflow-hidden">
                                <div className="px-4 py-3 bg-bg border-b border-border flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/echantillons/${echantillon.uid}`)}
                                            className="text-left text-[12px] font-bold text-accent font-mono hover:underline"
                                        >
                                            {echantillon.reference || `ECH-${echantillon.uid}`}
                                        </button>
                                        <div className="text-[12px] text-text-muted mt-0.5">
                                            {echantillon.designation || echantillon.localisation || 'Échantillon'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge s={echantillon.statut} map={ECH_STAT_CLS} />
                                        <Button size="sm" variant="ghost" onClick={() => navigate(`/echantillons/${echantillon.uid}`)}>
                                            Fiche échantillon
                                        </Button>
                                    </div>
                                </div>

                                <div className="p-3">
                                    {essais.length === 0 ? (
                                        <p className="text-[12px] text-text-muted italic">Aucun essai labo</p>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {essais.map((e) => (
                                                <div
                                                    key={e.uid}
                                                    className="flex items-center justify-between gap-3 px-3 py-2 border border-border rounded-lg cursor-pointer hover:border-accent hover:bg-bg transition-colors"
                                                    onClick={() => navigate(`/essais/${e.uid}`)}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[12px] font-bold text-accent font-mono">
                                                                {e.essai_code || e.type_essai || `ESSAI-${e.uid}`}
                                                            </span>
                                                            {e.reference ? (
                                                                <span className="text-[11px] text-text-muted font-mono">{e.reference}</span>
                                                            ) : null}
                                                        </div>
                                                        <div className="text-[12px] text-text-muted mt-0.5 truncate">
                                                            {e.type_essai || e.libelle || 'Essai labo'}
                                                        </div>
                                                    </div>
                                                    <Badge s={e.statut} map={ESSAI_STAT_CLS} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    )
}
