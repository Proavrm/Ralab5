/**
 * PassationPage.jsx
 * Chemin projet non confirmé : remplacer le fichier PassationPage.jsx existant à son emplacement réel.
 * Fiche de passation RST avec prestations structurées, documents et actions.
 */
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, authApi, affairesApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { FichePageShell, MetricCard, SectionCard } from '@/components/layout/FicheLayout'

const today = () => new Date().toISOString().split('T')[0]

function normalizeEtudeKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
}

function normalizeAffaireKey(value) {
    return String(value || '')
        .replaceAll('*', '')
        .toUpperCase()
        .replace(/[\s\-_/\.]+/g, '')
        .trim()
}

function getNgeFullCode(row) {
    return String(row?.numero_affaire_complet || row?.numero_affaire || '').trim()
}

function FG({ label, children, full }) {
    return (
        <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
            {label && <label className="text-[10px] font-medium text-text-muted">{label}</label>}
            {children}
        </div>
    )
}
function TA({ value, onChange, rows = 3, placeholder }) {
    return (
        <textarea
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full px-3 py-1.5 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
        />
    )
}

const EMPTY = {
    affaire_rst_id: '',
    date_passation: today(),
    source: '',
    operation_type: '',
    phase_operation: '',
    numero_etude: '',
    numero_affaire_nge: '',
    chantier: '',
    client: '',
    entreprise_responsable: '',
    agence: '',
    responsable: '',
    description_generale: '',
    contexte_marche: '',
    interlocuteurs_principaux: '',
    points_sensibles: '',
    besoins_laboratoire: '',
    besoins_terrain: '',
    besoins_etude: '',
    besoins_g3: '',
    besoins_essais_externes: '',
    besoins_equipements_specifiques: '',
    besoins_ressources_humaines: '',
    synthese: '',
    notes: '',
}

const RST_PRESTATION_TEMPLATES = [
    {
        key: 'intervention_terrain',
        need_code: 'INTERVENTION_TERRAIN',
        domain_code: 'TERRAIN',
        need_label: 'Intervention terrain',
        legacy_field: 'besoins_terrain',
        legacy_default: true,
    },
    {
        key: 'essais_terrain',
        need_code: 'ESSAIS_TERRAIN',
        domain_code: 'TERRAIN',
        need_label: 'Essais terrain',
        legacy_field: 'besoins_terrain',
    },
    {
        key: 'prelevements_echantillons',
        need_code: 'PRELEVEMENTS_ECHANTILLONS',
        domain_code: 'PRELEVEMENTS',
        need_label: 'Prélèvements / échantillons',
        legacy_field: 'besoins_laboratoire',
    },
    {
        key: 'essais_laboratoire',
        need_code: 'ESSAIS_LABO',
        domain_code: 'LABORATOIRE',
        need_label: 'Essais laboratoire',
        legacy_field: 'besoins_laboratoire',
        legacy_default: true,
    },
    {
        key: 'etude_technique',
        need_code: 'ETUDE_TECHNIQUE',
        domain_code: 'ETUDE',
        need_label: 'Étude technique',
        legacy_field: 'besoins_etude',
    },
    {
        key: 'mission_g3',
        need_code: 'MISSION_G3',
        domain_code: 'G3',
        need_label: 'Mission G3',
        legacy_field: 'besoins_g3',
    },
    {
        key: 'essais_externes',
        need_code: 'ESSAIS_EXTERNES',
        domain_code: 'EXTERNE',
        need_label: 'Essais externes',
        legacy_field: 'besoins_essais_externes',
    },
    {
        key: 'equipements_specifiques',
        need_code: 'EQUIPEMENTS_SPECIFIQUES',
        domain_code: 'MOYENS',
        need_label: 'Équipements spécifiques',
        legacy_field: 'besoins_equipements_specifiques',
    },
    {
        key: 'ressources_humaines',
        need_code: 'RESSOURCES_HUMAINES',
        domain_code: 'RESSOURCES',
        need_label: 'Ressources humaines',
        legacy_field: 'besoins_ressources_humaines',
    },
]

const RST_NEED_STATUS_OPTIONS = ['À confirmer', 'Requis', 'Optionnel', 'Hors périmètre', 'Annulé']

function createClientKey() {
    return `rst-need-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createStructuredNeed(template = {}) {
    return {
        client_key: createClientKey(),
        need_code: template.need_code || '',
        domain_code: template.domain_code || '',
        need_label: template.need_label || '',
        description: '',
        quantity: '',
        request_status: 'À confirmer',
        create_demande: true,
        notes: '',
    }
}

function normalizeStructuredNeed(item = {}) {
    return {
        ...createStructuredNeed(),
        ...item,
        client_key: item.client_key || createClientKey(),
        create_demande: item.create_demande !== false,
    }
}

function structuredNeedsFromLegacy(formValue) {
    const legacyFields = [...new Set(RST_PRESTATION_TEMPLATES.map((template) => template.legacy_field))]

    return legacyFields.flatMap((legacyField) => {
        const value = String(formValue?.[legacyField] || '').trim()
        if (!value) return []

        const matchingTemplates = RST_PRESTATION_TEMPLATES.filter((template) => template.legacy_field === legacyField)
        const template = matchingTemplates.find((entry) => entry.legacy_default) || matchingTemplates[0]
        if (!template) return []

        return [
            {
                ...createStructuredNeed(template),
                legacy_field: legacyField,
                description: value,
                request_status: 'À confirmer',
            },
        ]
    })
}

function summarizeStructuredNeed(item) {
    const parts = []
    const label = String(item.need_label || '').trim()
    const description = String(item.description || '').trim()
    const quantity = String(item.quantity || '').trim()

    if (label) parts.push(label)
    if (description) parts.push(description)
    if (quantity) parts.push(`Volume estimé : ${quantity}`)

    return parts.join(' — ')
}

function buildLegacyNeedsPatch(items) {
    const patch = {
        besoins_laboratoire: '',
        besoins_terrain: '',
        besoins_etude: '',
        besoins_g3: '',
        besoins_essais_externes: '',
        besoins_equipements_specifiques: '',
        besoins_ressources_humaines: '',
    }

    const grouped = Object.fromEntries(Object.keys(patch).map((key) => [key, []]))

    items.forEach((item) => {
        const template = RST_PRESTATION_TEMPLATES.find((entry) => entry.need_code === item.need_code)
        const legacyField = item.legacy_field || template?.legacy_field
        if (!legacyField || !grouped[legacyField]) return

        const summary = summarizeStructuredNeed(item)
        if (summary) grouped[legacyField].push(summary)
    })

    Object.keys(patch).forEach((key) => {
        patch[key] = grouped[key].join('\n')
    })

    return patch
}

function serializeStructuredNeeds(items) {
    return items
        .filter(
            (item) =>
                String(item.need_code || '').trim() ||
                String(item.need_label || '').trim() ||
                String(item.description || '').trim()
        )
        .map(({ client_key, ...item }) => ({ ...item }))
}

function RstPrestationCard({ item, onChange, onRemove }) {
    function set(k, v) {
        onChange({ ...item, [k]: v })
    }

    return (
        <div className="rounded-2xl border border-[#dbe1ea] bg-white overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#e5eaf1] bg-[#f8fafc] px-4 py-3">
                <span className="inline-flex rounded-full bg-[#003170] px-2.5 py-1 text-[10px] font-black tracking-[.08em] text-white">
                    {item.domain_code || 'RST'}
                </span>
                <input
                    value={item.need_label ?? ''}
                    onChange={(e) => set('need_label', e.target.value)}
                    placeholder="Prestation / objectif"
                    className="min-w-[220px] flex-1 border-0 bg-transparent px-1 py-1 text-[13px] font-black text-[#172033] outline-none"
                />
                <select
                    value={item.request_status ?? 'À confirmer'}
                    onChange={(e) => set('request_status', e.target.value)}
                    className="rounded-xl border border-[#cfd7e4] bg-white px-2.5 py-1.5 text-xs font-bold text-[#334155] outline-none focus:border-accent"
                >
                    {RST_NEED_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                            {status}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={onRemove}
                    className="rounded-lg px-2 py-1 text-xs font-black text-danger hover:bg-[#fcebeb]"
                    title="Supprimer la prestation"
                >
                    ✕
                </button>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-4">
                <div className="lg:col-span-4">
                    <label className="mb-1 block text-[10px] font-medium text-text-muted">
                        Description / résultat attendu (haut niveau)
                    </label>
                    <TA
                        value={item.description}
                        onChange={(v) => set('description', v)}
                        rows={2}
                        placeholder="Décrire le besoin global. Les détails techniques et l'affectation seront traités en Préparation."
                    />
                </div>

                <FG label="Volume estimé">
                    <Input value={item.quantity ?? ''} onChange={(e) => set('quantity', e.target.value)} />
                </FG>
                <div className="lg:col-span-3 flex items-end">
                    <label className="flex w-full items-center gap-2 rounded-xl border border-[#dbe1ea] bg-[#f8fafc] px-3 py-2.5 text-xs font-bold text-[#334155]">
                        <input
                            type="checkbox"
                            checked={item.create_demande !== false}
                            onChange={(e) => set('create_demande', e.target.checked)}
                            className="h-4 w-4 accent-accent"
                        />
                        Préparer une demande
                    </label>
                </div>

                <div className="lg:col-span-4">
                    <label className="mb-1 block text-[10px] font-medium text-text-muted">
                        Notes passation
                    </label>
                    <TA value={item.notes} onChange={(v) => set('notes', v)} rows={2} />
                </div>
            </div>
        </div>
    )
}

function DocRow({ doc, onChange, onRemove }) {
    function set(k, v) {
        onChange({ ...doc, [k]: v })
    }
    return (
        <tr className="border-b border-border">
            <td className="px-2 py-1.5">
                <input
                    value={doc.document_type ?? ''}
                    onChange={(e) => set('document_type', e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5 text-center">
                <input
                    type="checkbox"
                    checked={!!doc.is_received}
                    onChange={(e) => set('is_received', e.target.checked)}
                    className="w-4 h-4 accent-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <input
                    value={doc.version ?? ''}
                    onChange={(e) => set('version', e.target.value)}
                    className="w-20 px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <input
                    type="date"
                    value={doc.document_date ?? ''}
                    onChange={(e) => set('document_date', e.target.value || null)}
                    className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <input
                    value={doc.comment ?? ''}
                    onChange={(e) => set('comment', e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <button onClick={onRemove} className="text-danger text-xs hover:opacity-70">
                    ✕
                </button>
            </td>
        </tr>
    )
}

function ActionRow({ action, onChange, onRemove, priorites, statuts }) {
    function set(k, v) {
        onChange({ ...action, [k]: v })
    }
    return (
        <tr className="border-b border-border">
            <td className="px-2 py-1.5">
                <input
                    value={action.action_label ?? ''}
                    onChange={(e) => set('action_label', e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <input
                    value={action.responsable ?? ''}
                    onChange={(e) => set('responsable', e.target.value)}
                    className="w-28 px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <input
                    type="date"
                    value={action.echeance ?? ''}
                    onChange={(e) => set('echeance', e.target.value || null)}
                    className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <select
                    value={action.priorite ?? 'Normale'}
                    onChange={(e) => set('priorite', e.target.value)}
                    className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                >
                    {(priorites || ['Basse', 'Normale', 'Haute', 'Critique']).map((p) => (
                        <option key={p}>{p}</option>
                    ))}
                </select>
            </td>
            <td className="px-2 py-1.5">
                <select
                    value={action.statut ?? 'À lancer'}
                    onChange={(e) => set('statut', e.target.value)}
                    className="px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                >
                    {(statuts || ['À lancer', 'En cours', 'Fait', 'Annulé']).map((s) => (
                        <option key={s}>{s}</option>
                    ))}
                </select>
            </td>
            <td className="px-2 py-1.5">
                <input
                    value={action.commentaire ?? ''}
                    onChange={(e) => set('commentaire', e.target.value)}
                    className="w-full px-2 py-1 border border-border rounded text-xs bg-bg outline-none focus:border-accent"
                />
            </td>
            <td className="px-2 py-1.5">
                <button onClick={onRemove} className="text-danger text-xs hover:opacity-70">
                    ✕
                </button>
            </td>
        </tr>
    )
}

export default function PassationPage() {
    const { uid } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const qc = useQueryClient()
    const isNew = !uid || uid === 'new'

    const [form, setForm] = useState(EMPTY)
    const [documents, setDocuments] = useState([])
    const [actions, setActions] = useState([])
    const [structuredNeeds, setStructuredNeeds] = useState([])
    const [isEditing, setIsEditing] = useState(isNew)

    function set(k, v) {
        setForm((f) => ({ ...f, [k]: v }))
    }

    // Load existing passation
    const { data: passation, isLoading } = useQuery({
        queryKey: ['passation', uid],
        queryFn: () => api.get(`/passations/${uid}`),
        enabled: !isNew,
    })

    // Load affaires for select
    const { data: affaires = [] } = useQuery({
        queryKey: ['affaires'],
        queryFn: () => affairesApi.list(),
    })

    // Load filters (sources, types, phases)
    const { data: filters = {} } = useQuery({
        queryKey: ['passations-filters'],
        queryFn: () => api.get('/passations/filters'),
    })

    const { data: etudesRows = [] } = useQuery({
        queryKey: ['reference-etudes-passation'],
        queryFn: () => api.get('/reference-etudes/rows?limit=2000'),
    })

    const { data: affairesNgeRows = [] } = useQuery({
        queryKey: ['reference-affaires-passation'],
        queryFn: () => api.get('/reference-affaires/rows?limit=2000'),
    })

    const { data: authUsers = [] } = useQuery({
        queryKey: ['auth-active-users-passation'],
        queryFn: async () => {
            try {
                return await authApi.users()
            } catch {
                return []
            }
        },
        retry: false,
    })

    // Bootstrap from affaire if ?affaire_id=X
    const bootstrapAffaireId = searchParams.get('affaire_id')
    const { data: bootstrap } = useQuery({
        queryKey: ['passation-bootstrap', bootstrapAffaireId],
        queryFn: () => api.get(`/passations/bootstrap/${bootstrapAffaireId}`),
        enabled: isNew && !!bootstrapAffaireId,
    })

    // Init form
    useEffect(() => {
        if (!isNew && passation) {
            const { documents: docs, actions: acts, structured_needs: needs, ...rest } = passation
            const nextForm = { ...EMPTY, ...rest, affaire_rst_id: String(rest.affaire_rst_id || '') }
            setForm(nextForm)
            setDocuments(docs || [])
            setActions(acts || [])
            setStructuredNeeds(
                Array.isArray(needs) && needs.length > 0
                    ? needs.map(normalizeStructuredNeed)
                    : structuredNeedsFromLegacy(nextForm)
            )
        }
    }, [passation, isNew])

    useEffect(() => {
        if (isNew && bootstrap) {
            const nextForm = { ...EMPTY, ...bootstrap, affaire_rst_id: String(bootstrapAffaireId) }
            setForm(nextForm)
            if (bootstrap.documents?.length) setDocuments(bootstrap.documents)
            if (bootstrap.structured_needs?.length) {
                setStructuredNeeds(bootstrap.structured_needs.map(normalizeStructuredNeed))
            } else {
                setStructuredNeeds(structuredNeedsFromLegacy(nextForm))
            }
        }
    }, [bootstrap])

    useEffect(() => {
        if (isNew && bootstrapAffaireId) {
            setForm((f) => ({ ...f, affaire_rst_id: String(bootstrapAffaireId) }))
        }
    }, [bootstrapAffaireId, isNew])

    // Seed default docs from filters
    useEffect(() => {
        if (isNew && documents.length === 0 && filters.document_type_options?.length) {
            setDocuments(
                filters.document_type_options.map((t) => ({
                    document_type: t,
                    is_received: false,
                    version: '',
                    document_date: null,
                    comment: '',
                }))
            )
        }
    }, [filters, isNew])

    const mutation = useMutation({
        mutationFn: (payload) => (isNew ? api.post('/passations', payload) : api.put(`/passations/${uid}`, payload)),
        onSuccess: (saved) => {
            qc.invalidateQueries({ queryKey: ['passations'] })
            if (isNew) navigate(`/passations/${saved.uid}`, { replace: true })
            else {
                qc.setQueryData(['passation', uid], saved)
                setIsEditing(false)
            }
        },
    })

    useEffect(() => {
        setIsEditing(isNew)
    }, [isNew, uid])

    function handleSave() {
        if (!form.affaire_rst_id) return

        const legacyNeedsPatch = buildLegacyNeedsPatch(structuredNeeds)

        mutation.mutate({
            ...form,
            ...legacyNeedsPatch,
            affaire_rst_id: parseInt(form.affaire_rst_id),
            documents: documents.filter((d) => d.document_type || d.comment || d.is_received),
            actions: actions.filter((a) => a.action_label || a.responsable),
            structured_needs: serializeStructuredNeeds(structuredNeeds),
        })
    }

    function handleStartEdit() {
        if (isNew) return
        setIsEditing(true)
    }

    function handleCancelEdit() {
        if (isNew) return
        if (passation) {
            const { documents: docs, actions: acts, structured_needs: needs, ...rest } = passation
            const nextForm = { ...EMPTY, ...rest, affaire_rst_id: String(rest.affaire_rst_id || '') }
            setForm(nextForm)
            setDocuments(docs || [])
            setActions(acts || [])
            setStructuredNeeds(
                Array.isArray(needs) && needs.length > 0
                    ? needs.map(normalizeStructuredNeed)
                    : structuredNeedsFromLegacy(nextForm)
            )
        }
        setIsEditing(false)
    }

    function addDoc() {
        setDocuments((d) => [
            ...d,
            { document_type: '', is_received: false, version: '', document_date: null, comment: '' },
        ])
    }
    function updateDoc(i, doc) {
        setDocuments((d) => d.map((x, j) => (j === i ? doc : x)))
    }
    function removeDoc(i) {
        setDocuments((d) => d.filter((_, j) => j !== i))
    }

    function addAction() {
        setActions((a) => [
            ...a,
            {
                action_label: '',
                responsable: '',
                echeance: '',
                priorite: 'Normale',
                statut: 'À lancer',
                commentaire: '',
            },
        ])
    }
    function updateAction(i, act) {
        setActions((a) => a.map((x, j) => (j === i ? act : x)))
    }
    function removeAction(i) {
        setActions((a) => a.filter((_, j) => j !== i))
    }

    function addStructuredNeed(template) {
        setStructuredNeeds((items) => [...items, createStructuredNeed(template)])
    }

    function updateStructuredNeed(index, item) {
        setStructuredNeeds((items) => items.map((current, currentIndex) => (currentIndex === index ? item : current)))
    }

    function removeStructuredNeed(index) {
        setStructuredNeeds((items) => items.filter((_, currentIndex) => currentIndex !== index))
    }

    const etudeRowsByNumero = useMemo(() => {
        const map = new Map()
        etudesRows.forEach((row) => {
            const key = normalizeEtudeKey(row?.numero_etude)
            if (!key || map.has(key)) return
            map.set(key, row)
        })
        return map
    }, [etudesRows])

    const ngeRowsByCode = useMemo(() => {
        const map = new Map()
        affairesNgeRows.forEach((row) => {
            const key = normalizeAffaireKey(getNgeFullCode(row))
            if (!key || map.has(key)) return
            map.set(key, row)
        })
        return map
    }, [affairesNgeRows])

    const etudeNumberOptions = useMemo(() => {
        const values = new Set()
        etudesRows.forEach((row) => {
            const value = String(row?.numero_etude || '').trim()
            if (value) values.add(value)
        })
        return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
    }, [etudesRows])

    const ngeCodeOptions = useMemo(() => {
        const values = new Set()
        affairesNgeRows.forEach((row) => {
            const value = getNgeFullCode(row)
            if (value) values.add(value)
        })
        return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
    }, [affairesNgeRows])

    function handleNumeroEtudeInput(nextValue) {
        set('numero_etude', nextValue)
        const match = etudeRowsByNumero.get(normalizeEtudeKey(nextValue))
        if (!match) return
        const chantier = String(match?.nom_affaire || '').trim()
        const client = String(match?.maitre_ouvrage || '').trim()
        const entreprise = String(match?.filiale || '').trim()
        const responsable = String(match?.responsable_etude || '').trim()
        setForm((f) => ({
            ...f,
            numero_etude: String(match?.numero_etude || nextValue || '').trim(),
            chantier: chantier || f.chantier,
            client: client || f.client,
            entreprise_responsable: entreprise || f.entreprise_responsable,
            responsable: responsable || f.responsable,
        }))
    }

    function handleNumeroAffaireNgeInput(nextValue) {
        set('numero_affaire_nge', nextValue)
        const match = ngeRowsByCode.get(normalizeAffaireKey(nextValue))
        if (!match) return
        const fullCode = getNgeFullCode(match)
        const chantier = String(match?.libelle || '').trim()
        const entreprise = String(
            match?.filiales_toutes || match?.filiale_principale || match?.filiales_resume || ''
        ).trim()
        const responsable = String(match?.responsable || '').trim()
        const numeroEtude = String(match?.numero_etude || '').trim()
        setForm((f) => ({
            ...f,
            numero_affaire_nge: fullCode || nextValue,
            numero_etude: numeroEtude || f.numero_etude,
            chantier: chantier || f.chantier,
            entreprise_responsable: entreprise || f.entreprise_responsable,
            responsable: responsable || f.responsable,
        }))
    }

    const title = isNew ? 'Nouvelle passation' : passation?.reference || `Passation #${uid}`
    const sources = filters.source_options || filters.sources || []
    const opTypes = filters.operation_type_options || filters.operation_types || []
    const phases = filters.phase_operation_options || filters.phase_operations || []
    const responsableOptions = useMemo(() => {
        const values = new Set()

        ;(filters.responsable_passation_options || []).forEach((value) => {
            const text = String(value || '').trim()
            if (text) values.add(text)
        })

        ;(authUsers || []).forEach((row) => {
            const name = String(row?.display_name || '').trim()
            const email = String(row?.email || '').trim()
            if (name) values.add(name)
            if (email) values.add(email)
        })

        const selected = String(form.responsable || '').trim()
        if (selected) values.add(selected)

        return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
    }, [filters.responsable_passation_options, authUsers, form.responsable])
    const priorites = filters.action_priorite_options || ['Basse', 'Normale', 'Haute', 'Critique']
    const actStatuts = filters.action_statut_options || ['À lancer', 'En cours', 'Fait', 'Annulé']
    const linkedAffaire = form.affaire_rst_id
        ? affaires.find((a) => String(a.uid) === String(form.affaire_rst_id))
        : null
    const backTarget = linkedAffaire ? `/affaires/${linkedAffaire.uid}` : '/passations'
    const canEdit = isNew || isEditing

    const metrics = {
        docs: documents.filter((d) => d.document_type).length,
        actions: actions.filter((a) => a.action_label).length,
        source: form.source || '—',
        phase: form.phase_operation || '—',
    }

    const rstNeedsSummary = useMemo(
        () => ({
            total: structuredNeeds.length,
            demandes: structuredNeeds.filter(
                (item) =>
                    item.create_demande !== false &&
                    item.request_status !== 'Annulé' &&
                    item.request_status !== 'Hors périmètre'
            ).length,
            toConfirm: structuredNeeds.filter((item) => item.request_status === 'À confirmer').length,
        }),
        [structuredNeeds]
    )

    if (!isNew && isLoading) {
        return (
            <FichePageShell>
                <div
                    className="sticky top-0 z-10 border-b border-[#dbe1ea]"
                    style={{
                        background: 'rgba(255,255,255,0.96)',
                        boxShadow: '0 6px 24px rgba(0,49,112,0.08)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    <div
                        style={{
                            height: '4px',
                            background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)',
                        }}
                    />
                    <div className="w-full max-w-full mx-auto px-7 flex flex-wrap items-center gap-2.5 py-3">
                        <button
                            type="button"
                            onClick={() => navigate('/passations')}
                            className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0"
                        >
                            ← Affaires RST
                        </button>
                        <div className="flex-1 min-w-[220px]">
                            <div className="text-[#8a95a8] text-[11px] font-bold tracking-[.14em] uppercase">
                                Fiche passation
                            </div>
                            <div className="text-[15px] font-black">{title}</div>
                        </div>
                    </div>
                </div>
                <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
                    <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
                </div>
            </FichePageShell>
        )
    }

    return (
        <FichePageShell>
            <div
                className="sticky top-0 z-10 border-b border-[#dbe1ea]"
                style={{
                    background: 'rgba(255,255,255,0.96)',
                    boxShadow: '0 6px 24px rgba(0,49,112,0.08)',
                    backdropFilter: 'blur(12px)',
                }}
            >
                <div
                    style={{
                        height: '4px',
                        background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)',
                    }}
                />
                <div className="w-full max-w-full mx-auto px-7 flex flex-wrap items-center gap-2.5 py-3">
                    <button
                        type="button"
                        onClick={() => navigate(backTarget)}
                        className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0"
                    >
                        ← Affaires RST
                    </button>
                    <div className="flex-1 min-w-[220px]">
                        <div className="text-[#8a95a8] text-[11px] font-bold tracking-[.14em] uppercase">
                            Fiche passation
                        </div>
                        <div className="text-[15px] font-black">{title}</div>
                    </div>

                    {linkedAffaire ? (
                        <Button size="sm" onClick={() => navigate(`/affaires/${linkedAffaire.uid}`)}>
                            Affaire
                        </Button>
                    ) : null}
                    {linkedAffaire ? (
                        <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${linkedAffaire.uid}`)}>
                            Demandes
                        </Button>
                    ) : null}
                    {!isNew && !isEditing ? (
                        <Button size="sm" variant="primary" onClick={handleStartEdit}>
                            Modifier
                        </Button>
                    ) : (
                        <>
                            <Button size="sm" onClick={isNew ? () => navigate('/passations') : handleCancelEdit}>
                                Annuler
                            </Button>
                            <Button
                                size="sm"
                                variant="primary"
                                onClick={handleSave}
                                disabled={!form.affaire_rst_id || mutation.isPending}
                            >
                                {mutation.isPending ? 'Enregistrement…' : isNew ? '✓ Créer' : '✓ Enregistrer'}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
                {linkedAffaire ? (
                    <section
                        className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white"
                        style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
                    >
                        <div
                            className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
                            style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
                        >
                            <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />

                            <div>
                                <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
                                    <span
                                        className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]"
                                        style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }}
                                    />
                                    RaLab 5 · Passation RST
                                </div>
                                <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{title}</h1>
                                <div className="mt-3 text-[20px] font-black">{linkedAffaire.chantier || '—'}</div>
                                <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
                                    {linkedAffaire.client ? (
                                        <span>
                                            Client : <strong className="text-white">{linkedAffaire.client}</strong>
                                        </span>
                                    ) : null}
                                    {linkedAffaire.site ? (
                                        <span>
                                            Site : <strong className="text-white">{linkedAffaire.site}</strong>
                                        </span>
                                    ) : null}
                                    {linkedAffaire.responsable ? (
                                        <span>
                                            Responsable :{' '}
                                            <strong className="text-white">{linkedAffaire.responsable}</strong>
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                    <span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                        {linkedAffaire.statut === 'En cours'
                                            ? 'Affaire active'
                                            : linkedAffaire.statut || '—'}
                                    </span>
                                    {linkedAffaire.titulaire ? (
                                        <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                            {linkedAffaire.titulaire}
                                        </span>
                                    ) : null}
                                    {linkedAffaire.filiale ? (
                                        <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                            {linkedAffaire.filiale}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">
                                    Demandes
                                </div>
                                <div className="mt-1.5 text-[13px] font-black">
                                    {linkedAffaire.nb_demandes_actives ?? 0} active
                                    {(linkedAffaire.nb_demandes_actives ?? 0) !== 1 ? 's' : ''} /{' '}
                                    {linkedAffaire.nb_demandes ?? 0}
                                </div>
                                {linkedAffaire.date_ouverture ? (
                                    <div className="mt-2 text-[12px] font-black text-white/70">
                                        Ouverture {formatDate(linkedAffaire.date_ouverture)}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
                            <MetricCard label="Documents" value={metrics.docs} detail="Pièces renseignées" />
                            <MetricCard label="Actions" value={metrics.actions} detail="Actions renseignées" />
                            <MetricCard label="Contexte" value={metrics.source} detail="Origine" />
                            <MetricCard label="Phase" value={metrics.phase} detail="Chantier" />
                        </div>
                    </section>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <MetricCard label="Documents" value={metrics.docs} detail="Pièces renseignées" />
                        <MetricCard label="Actions" value={metrics.actions} detail="Actions renseignées" />
                        <MetricCard label="Contexte" value={metrics.source} detail="Origine" />
                        <MetricCard label="Phase" value={metrics.phase} detail="Chantier" />
                    </div>
                )}

                {mutation.error && (
                    <div className="px-4 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded text-xs text-danger">
                        {mutation.error.message}
                    </div>
                )}

                <fieldset disabled={!canEdit} className="contents">
                    <SectionCard title="A - Identité" subtitle="Rattachement affaire et informations de cadrage">
                        <div className="grid grid-cols-2 gap-3.5">
                            <FG label="Affaire liée *" full>
                                <Select
                                    value={form.affaire_rst_id}
                                    onChange={(e) => set('affaire_rst_id', e.target.value)}
                                    className="w-full"
                                >
                                    <option value="">— Sélectionner —</option>
                                    {affaires.map((a) => (
                                        <option key={a.uid} value={a.uid}>
                                            {a.reference} — {a.chantier || a.client}
                                        </option>
                                    ))}
                                </Select>
                            </FG>
                            <FG label="Date de passation">
                                <Input
                                    type="date"
                                    value={form.date_passation ?? ''}
                                    onChange={(e) => set('date_passation', e.target.value)}
                                />
                            </FG>
                            <FG label="N° étude">
                                <Input
                                    value={form.numero_etude}
                                    onChange={(e) => handleNumeroEtudeInput(e.target.value)}
                                    list="passation-etudes-options"
                                />
                            </FG>
                            <FG label="N° affaire NGE">
                                <Input
                                    value={form.numero_affaire_nge}
                                    onChange={(e) => handleNumeroAffaireNgeInput(e.target.value)}
                                    list="passation-nge-options"
                                />
                            </FG>
                            <FG label="Chantier">
                                <Input value={form.chantier} onChange={(e) => set('chantier', e.target.value)} />
                            </FG>
                            <FG label="Client">
                                <Input value={form.client} onChange={(e) => set('client', e.target.value)} />
                            </FG>
                            <FG label="Entreprise responsable">
                                <Input
                                    value={form.entreprise_responsable}
                                    onChange={(e) => set('entreprise_responsable', e.target.value)}
                                />
                            </FG>
                            <FG label="Agence">
                                <Input value={form.agence} onChange={(e) => set('agence', e.target.value)} />
                            </FG>
                            <FG label="Responsable / pilote" full>
                                <Input
                                    value={form.responsable}
                                    onChange={(e) => set('responsable', e.target.value)}
                                    list="passation-responsable-options"
                                />
                            </FG>
                        </div>
                    </SectionCard>

                    <SectionCard title="B - Contexte & origine" subtitle="Source, type d'opération et contexte marché">
                        <div className="grid grid-cols-2 gap-3.5">
                            <FG label="Origine de la passation">
                                <Select
                                    value={form.source ?? ''}
                                    onChange={(e) => set('source', e.target.value)}
                                    className="w-full"
                                >
                                    <option value="">—</option>
                                    {sources.map((s) => (
                                        <option key={s}>{s}</option>
                                    ))}
                                </Select>
                            </FG>
                            <FG label="Type d'opération">
                                <Select
                                    value={form.operation_type ?? ''}
                                    onChange={(e) => set('operation_type', e.target.value)}
                                    className="w-full"
                                >
                                    <option value="">—</option>
                                    {opTypes.map((t) => (
                                        <option key={t}>{t}</option>
                                    ))}
                                </Select>
                            </FG>
                            <FG label="Phase chantier">
                                <Select
                                    value={form.phase_operation ?? ''}
                                    onChange={(e) => set('phase_operation', e.target.value)}
                                    className="w-full"
                                >
                                    <option value="">—</option>
                                    {phases.map((p) => (
                                        <option key={p}>{p}</option>
                                    ))}
                                </Select>
                            </FG>
                            <div />
                            <FG label="Interlocuteurs principaux" full>
                                <TA
                                    value={form.interlocuteurs_principaux}
                                    onChange={(v) => set('interlocuteurs_principaux', v)}
                                    rows={3}
                                />
                            </FG>
                            <FG label="Description générale" full>
                                <TA
                                    value={form.description_generale}
                                    onChange={(v) => set('description_generale', v)}
                                    rows={4}
                                />
                            </FG>
                            <FG label="Contexte marché" full>
                                <TA value={form.contexte_marche} onChange={(v) => set('contexte_marche', v)} rows={3} />
                            </FG>
                        </div>
                    </SectionCard>

                    <datalist id="passation-etudes-options">
                        {etudeNumberOptions.map((value) => (
                            <option key={value} value={value} />
                        ))}
                    </datalist>
                    <datalist id="passation-nge-options">
                        {ngeCodeOptions.map((value) => (
                            <option key={value} value={value} />
                        ))}
                    </datalist>
                    <datalist id="passation-responsable-options">
                        {responsableOptions.map((value) => (
                            <option key={value} value={value} />
                        ))}
                    </datalist>

                    <SectionCard title="C - Documents reçus / attendus" subtitle="Pièces nécessaires pour le lancement">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-xs mb-3">
                                <thead>
                                    <tr className="border-b border-border">
                                        {['Document', 'Reçu', 'Version', 'Date', 'Commentaire', ''].map((h) => (
                                            <th key={h} className="px-2 py-1.5 text-left font-medium text-text-muted">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {documents.map((doc, i) => (
                                        <DocRow
                                            key={i}
                                            doc={doc}
                                            onChange={(d) => updateDoc(i, d)}
                                            onRemove={() => removeDoc(i)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Button size="sm" onClick={addDoc}>
                            + Ajouter document
                        </Button>
                    </SectionCard>

                    <SectionCard title="D - Points de vigilance / contraintes" subtitle="Risques et points de suivi">
                        <TA value={form.points_sensibles} onChange={(v) => set('points_sensibles', v)} rows={5} />
                    </SectionCard>

                    <SectionCard
                        title="E - Prestations RST à prévoir"
                        subtitle="Identifier le travail nécessaire. Les responsabilités sont désignées séparément dans l’organisation de l’affaire."
                    >
                        <div className="flex flex-col gap-4">
                            <div className="rounded-2xl border border-[#dbe1ea] bg-[#f8fafc] p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[12px] font-black text-[#172033]">
                                            Ajouter une famille de prestation
                                        </div>
                                        <div className="mt-0.5 text-[11px] text-text-muted">
                                            Ici: cadrage passation uniquement. Le détail technique et l'affectation sont gérés dans Préparation.
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                                        <span className="rounded-full border border-[#dbe1ea] bg-white px-2.5 py-1">
                                            {rstNeedsSummary.total} prestation{rstNeedsSummary.total !== 1 ? 's' : ''}
                                        </span>
                                        <span className="rounded-full border border-[#dbe1ea] bg-white px-2.5 py-1">
                                            {rstNeedsSummary.demandes} demande
                                            {rstNeedsSummary.demandes !== 1 ? 's' : ''} à préparer
                                        </span>
                                        <span className="rounded-full border border-[#f1d77a] bg-[#fff9df] px-2.5 py-1 text-[#6f5700]">
                                            {rstNeedsSummary.toConfirm} à confirmer
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {RST_PRESTATION_TEMPLATES.map((template) => (
                                        <button
                                            key={template.key}
                                            type="button"
                                            onClick={() => addStructuredNeed(template)}
                                            className="rounded-xl border border-[#cfd7e4] bg-white px-3 py-2 text-xs font-black text-[#003170] transition-colors hover:border-[#003170] hover:bg-[#eef4fb]"
                                        >
                                            + {template.need_label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {structuredNeeds.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-[#cfd7e4] bg-white px-5 py-8 text-center">
                                    <div className="text-[13px] font-black text-[#334155]">
                                        Aucune prestation RST identifiée
                                    </div>
                                    <div className="mt-1 text-xs text-text-muted">
                                        Ajoute uniquement les prestations réellement nécessaires. Le choix des
                                        responsables se fera dans la section d’organisation.
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {structuredNeeds.map((item, index) => (
                                        <RstPrestationCard
                                            key={item.uid || item.id || item.client_key || index}
                                            item={item}
                                            onChange={(nextItem) => updateStructuredNeed(index, nextItem)}
                                            onRemove={() => removeStructuredNeed(index)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    <SectionCard title="F - Actions à lancer" subtitle="Plan d'actions opérationnel">
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-xs mb-3">
                                <thead>
                                    <tr className="border-b border-border">
                                        {[
                                            'Action',
                                            'Responsable',
                                            'Échéance',
                                            'Priorité',
                                            'Statut',
                                            'Commentaire',
                                            '',
                                        ].map((h) => (
                                            <th key={h} className="px-2 py-1.5 text-left font-medium text-text-muted">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {actions.map((act, i) => (
                                        <ActionRow
                                            key={i}
                                            action={act}
                                            onChange={(a) => updateAction(i, a)}
                                            onRemove={() => removeAction(i)}
                                            priorites={priorites}
                                            statuts={actStatuts}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Button size="sm" onClick={addAction}>
                            + Ajouter action
                        </Button>
                    </SectionCard>

                    <SectionCard title="G - Synthèse & notes" subtitle="Conclusion et éléments complémentaires">
                        <div className="flex flex-col gap-4">
                            <FG label="Synthèse">
                                <TA value={form.synthese} onChange={(v) => set('synthese', v)} rows={4} />
                            </FG>
                            <FG label="Notes complémentaires">
                                <TA value={form.notes} onChange={(v) => set('notes', v)} rows={4} />
                            </FG>
                        </div>
                    </SectionCard>
                </fieldset>
            </div>
        </FichePageShell>
    )
}
