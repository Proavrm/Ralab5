/**
 * PassationPage.jsx
 * Chemin projet non confirmé : remplacer le fichier PassationPage.jsx existant à son emplacement réel.
 * Fiche de passation RST avec prestations structurées, documents et actions.
 */
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, authApi, affairesApi, passationsApi, adminApi } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { buildPathWithReturnTo } from '@/lib/detailNavigation'
import { RESPONSIBLE_LAB_PROFILES } from '@/lib/responsibleLaboProfiles'
import { partitionDestinataireUsers } from '@/lib/userOrgScope'
import { useLaboratoireCatalog } from '@/hooks/useLaboratoireCatalog'
import { FichePageShell, FicheTopbar, MetricCard, SectionCard } from '@/components/layout/FicheLayout'
import DocumentTrackingTable from '@/components/demande/DocumentTrackingTable'
import { validatePassationSitePlan, ensureSiteCaptureDocumentRows, hasPlanSituationFile } from '@/lib/sitePlanRequirements'
import { A4_ORIENTATION_LANDSCAPE, A4_ORIENTATION_PORTRAIT } from '@/lib/sitePlanImageCoords'

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
    date_debut_travaux_prevue: '',
    source: '',
    operation_type: '',
    phase_operation: '',
    numero_etude: '',
    numero_affaire_nge: '',
    chantier: '',
    client: '',
    maitre_ouvrage: '',
    maitre_oeuvre: '',
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
    types_essais_prevus: '',
    livrables_attendus: '',
    criteres_conformite: '',
    demande_destinataire_email: '',
    demande_destinataire_name: '',
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

const STAT_DEM = {
    'À qualifier': 'bg-[#f1efe8] text-[#5f5e5a]',
    Demande: 'bg-[#e6f1fb] text-[#185fa5]',
    'En Cours': 'bg-[#eaf3de] text-[#3b6d11]',
    Répondu: 'bg-[#eeedfe] text-[#534ab7]',
    Fini: 'bg-[#eaf3de] text-[#3b6d11]',
    'Envoyé - Perdu': 'bg-[#f1efe8] text-[#5f5e5a]',
}

function DemandeBadge({ statut }) {
    return (
        <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STAT_DEM[statut] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}
        >
            {statut || '—'}
        </span>
    )
}

function buildTerrainFamiliesSummary(demande) {
    const items = []
    if ((demande?.nb_feuilles_sc || 0) > 0) items.push(`SC: ${demande.nb_feuilles_sc}`)
    if ((demande?.nb_feuilles_so || 0) > 0) items.push(`SO: ${demande.nb_feuilles_so}`)
    if ((demande?.nb_feuilles_de || 0) > 0) items.push(`DE: ${demande.nb_feuilles_de}`)
    return items.join(' · ')
}

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
    const { orgRegions } = useLaboratoireCatalog()
    const isNew = !uid || uid === 'new'

    const [form, setForm] = useState(EMPTY)
    const [documents, setDocuments] = useState([])
    const [adresseOuvrage, setAdresseOuvrage] = useState('')
    const [actions, setActions] = useState([])
    const [structuredNeeds, setStructuredNeeds] = useState([])
    const [isEditing, setIsEditing] = useState(isNew)
    const [linkDemandeUid, setLinkDemandeUid] = useState('')

    function set(k, v) {
        setForm((f) => ({ ...f, [k]: v }))
    }

    // Load existing passation
    const { data: passation, isLoading, isError, error: passationError } = useQuery({
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
                const users = await authApi.users()
                if (Array.isArray(users) && users.length > 0) return users
            } catch {
                /* auth directory unavailable */
            }
            try {
                const adminUsers = await adminApi.users.list()
                if (Array.isArray(adminUsers) && adminUsers.length > 0) {
                    return adminUsers
                        .filter((entry) => entry.is_active !== false)
                        .map((entry) => ({
                            email: entry.email,
                            display_name: entry.display_name || entry.email,
                            service_code: entry.service_code || '',
                        }))
                }
            } catch {
                /* admin directory unavailable */
            }
            return RESPONSIBLE_LAB_PROFILES.flatMap((profile) =>
                (profile.emails || []).map((email) => ({
                    email,
                    display_name: profile.displayName,
                }))
            )
        },
        retry: false,
    })

    const destinataireOptions = useMemo(() => {
        const byEmail = new Map()
        for (const user of authUsers) {
            const email = String(user?.email || '').trim().toLowerCase()
            if (!email || byEmail.has(email)) continue
            byEmail.set(email, {
                email,
                display_name: String(user?.display_name || email).trim(),
                service_code: String(user?.service_code || '').trim().toUpperCase(),
            })
        }
        return [...byEmail.values()].sort((a, b) =>
            a.display_name.localeCompare(b.display_name, 'fr')
        )
    }, [authUsers])

    const destinataireGroups = useMemo(
        () => partitionDestinataireUsers(destinataireOptions, orgRegions),
        [destinataireOptions, orgRegions],
    )

    const selectedAffaire = useMemo(
        () => affaires.find((a) => String(a.uid) === String(form.affaire_rst_id)),
        [affaires, form.affaire_rst_id],
    )

    const uploadAffaireDocument = useCallback(
        (file, options = {}) => {
            const affaireUid = form.affaire_rst_id
            if (!affaireUid) {
                return Promise.reject(new Error('Sélectionnez d’abord une affaire'))
            }
            return affairesApi.uploadDocument(affaireUid, file, options)
        },
        [form.affaire_rst_id],
    )

    const deleteAffaireDocument = useCallback(
        (storedPath) => {
            const affaireUid = form.affaire_rst_id
            if (!affaireUid) {
                return Promise.reject(new Error('Sélectionnez d’abord une affaire'))
            }
            return affairesApi.deleteDocument(affaireUid, storedPath)
        },
        [form.affaire_rst_id],
    )

    const debutTravauxLocked = Boolean(
        passation?.date_debut_travaux_locked
        || passation?.affaire_date_debut_travaux_prevue
        || selectedAffaire?.date_debut_travaux_prevue,
    )

    const debutTravauxDisplay = (() => {
        const affaireDate = passation?.affaire_date_debut_travaux_prevue
            || selectedAffaire?.date_debut_travaux_prevue
            || ''
        if (affaireDate) return String(affaireDate).slice(0, 10)
        return form.date_debut_travaux_prevue ?? ''
    })()

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
            setDocuments(ensureSiteCaptureDocumentRows(docs || []))
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

    useEffect(() => {
        setAdresseOuvrage(String(selectedAffaire?.adresse_ouvrage || '').trim())
    }, [selectedAffaire?.uid, selectedAffaire?.adresse_ouvrage])

    useEffect(() => {
        if (isNew) setDocuments([])
    }, [isNew])

    // Seed default docs after passation is created (not while drafting a new one)
    useEffect(() => {
        if (isNew || !passation) return
        if ((passation.documents || []).length > 0) return
        if (documents.length > 0) return
        if (!filters.document_type_options?.length) return
        setDocuments(
            ensureSiteCaptureDocumentRows(
                filters.document_type_options.map((t) => ({
                    document_type: t,
                    is_received: false,
                    version: '',
                    document_date: null,
                    uploaded_at: null,
                    comment: '',
                })),
            ),
        )
    }, [filters, isNew, passation, documents.length])

    const demandesPreviewQuery = useQuery({
        queryKey: ['passation-demandes', uid],
        queryFn: () => passationsApi.demandes(uid),
        enabled: !isNew && !!uid,
    })

    const linkableDemandesQuery = useQuery({
        queryKey: ['passation-demandes-linkable', uid],
        queryFn: () => passationsApi.linkableDemandes(uid),
        enabled: !isNew && !!uid,
    })

    const passationDemandes = demandesPreviewQuery.data || []
    const linkableDemandes = linkableDemandesQuery.data || []
    const hasLinkedDemande = passationDemandes.length > 0
    const detailReturnTo = `/passations/${uid}`

    const passationLaboCode = useMemo(() => {
        for (const row of [...passationDemandes, ...linkableDemandes]) {
            const code = String(row?.labo_code || '').trim().toUpperCase()
            if (code) return code
        }
        return 'SP'
    }, [passationDemandes, linkableDemandes])

    const captureSitePlan = useMemo(() => {
        const affaireUid = form.affaire_rst_id
        if (!affaireUid || isNew) return null
        return {
            laboCode: passationLaboCode,
            geocode: (address) => affairesApi.geocodeSitePlan(affaireUid, address, passationLaboCode),
            preview: ({ lat, lon, address, zoom, width, height }) => affairesApi.previewSitePlan(affaireUid, {
                lat, lon, address, zoom, width, height,
            }),
            fetchItinerary: ({ lat, lon }) => affairesApi.getSitePlanItinerary(affaireUid, { lat, lon, laboCode: passationLaboCode }),
            save: ({ address, lat, lon, mapCenterLat, mapCenterLon, addressLabel, zoom, zones, pins, replaceStoredPath, orientation }) => affairesApi.captureSitePlan(affaireUid, {
                address,
                lat,
                lon,
                map_center_lat: mapCenterLat,
                map_center_lon: mapCenterLon,
                address_label: addressLabel,
                labo_code: passationLaboCode,
                zoom: zoom ?? 16,
                zones: zones || [],
                pins: pins || [],
                replace_stored_path: replaceStoredPath || undefined,
                capture_kind: 'plan',
                orientation: orientation || A4_ORIENTATION_PORTRAIT,
            }),
            saveItinerary: ({ address, lat, lon, mapCenterLat, mapCenterLon, addressLabel, zoom, itineraryRoute, replaceStoredPath, orientation }) => affairesApi.captureSitePlan(affaireUid, {
                address,
                lat,
                lon,
                map_center_lat: mapCenterLat,
                map_center_lon: mapCenterLon,
                address_label: addressLabel,
                labo_code: passationLaboCode,
                zoom: zoom ?? 13,
                itinerary_route: itineraryRoute || [],
                replace_stored_path: replaceStoredPath || undefined,
                capture_kind: 'itinerary',
                orientation: orientation || A4_ORIENTATION_LANDSCAPE,
            }),
            loadMeta: (storedPath) => affairesApi.getSitePlanMeta(affaireUid, storedPath),
        }
    }, [form.affaire_rst_id, isNew, passationLaboCode])

    const { data: linkedAffaireDetail } = useQuery({
        queryKey: ['affaire', String(form.affaire_rst_id), passationLaboCode],
        queryFn: () => affairesApi.get(form.affaire_rst_id, { labo_code: passationLaboCode }),
        enabled: Boolean(form.affaire_rst_id) && !isNew,
    })

    const mutation = useMutation({
        mutationFn: (payload) => (isNew ? api.post('/passations', payload) : api.put(`/passations/${uid}`, payload)),
        onSuccess: (saved) => {
            qc.invalidateQueries({ queryKey: ['passations'] })
            qc.invalidateQueries({ queryKey: ['affaires'] })
            if (saved?.affaire_rst_id) {
                qc.invalidateQueries({ queryKey: ['affaire', String(saved.affaire_rst_id)] })
            }
            if (isNew) navigate(`/passations/${saved.uid}`, { replace: true })
            else {
                qc.setQueryData(['passation', uid], saved)
                setIsEditing(false)
            }
        },
    })

    function buildPassationPayload() {
        const legacyNeedsPatch = buildLegacyNeedsPatch(structuredNeeds)
        return {
            ...form,
            ...legacyNeedsPatch,
            affaire_rst_id: parseInt(form.affaire_rst_id, 10),
            ...(debutTravauxLocked
                ? {}
                : { date_debut_travaux_prevue: form.date_debut_travaux_prevue || null }),
            documents: documents.filter(
                (d) => d.document_type || d.comment || d.is_received || d.version || d.stored_path || d.uploaded_at,
            ),
            actions: actions.filter((a) => a.action_label || a.responsable),
            structured_needs: serializeStructuredNeeds(structuredNeeds),
        }
    }

    async function persistPassationAdresseOuvrage() {
        const affaireUid = parseInt(form.affaire_rst_id, 10)
        const previousAdresse = String(selectedAffaire?.adresse_ouvrage || '').trim()
        const nextAdresse = String(adresseOuvrage || '').trim()
        if (!affaireUid || nextAdresse === previousAdresse) return
        await affairesApi.update(affaireUid, { adresse_ouvrage: nextAdresse })
        qc.invalidateQueries({ queryKey: ['affaires'] })
        qc.invalidateQueries({ queryKey: ['affaire', String(affaireUid)] })
    }

    const documentsMutation = useMutation({
        mutationFn: (payload) => api.put(`/passations/${uid}`, payload),
        onSuccess: (saved) => {
            qc.setQueryData(['passation', uid], saved)
            setDocuments(ensureSiteCaptureDocumentRows(saved.documents || []))
            qc.invalidateQueries({ queryKey: ['passations'] })
            if (saved?.affaire_rst_id) {
                qc.invalidateQueries({ queryKey: ['affaire', String(saved.affaire_rst_id)] })
            }
        },
    })

    async function handleSaveDocuments(overrideDocuments) {
        if (isNew || !form.affaire_rst_id) return
        const docsToSave = Array.isArray(overrideDocuments) ? overrideDocuments : documents
        const err = validatePassationSitePlan({ adresseOuvrage, documents: docsToSave })
        if (err) {
            window.alert(err)
            return
        }
        try {
            await persistPassationAdresseOuvrage()
        } catch (saveErr) {
            window.alert(saveErr?.message || 'Impossible d’enregistrer l’adresse de l’ouvrage.')
            return
        }
        await documentsMutation.mutateAsync({
            ...buildPassationPayload(),
            documents: docsToSave.filter(
                (d) => d.document_type || d.comment || d.is_received || d.version || d.stored_path || d.uploaded_at,
            ),
        })
    }

    const [generateNotice, setGenerateNotice] = useState('')

    const generateDemandesMutation = useMutation({
        mutationFn: () => passationsApi.generateDemandes(uid),
        onSuccess: (data) => {
            const notif = data?.notification
            if (notif?.notified) {
                setGenerateNotice(
                    `Demande créée — notification envoyée à ${notif.recipient_display_name || notif.recipient_email}` +
                        (notif.email_mock_uid ? ` (e-mail mock #${notif.email_mock_uid})` : '')
                )
            } else {
                setGenerateNotice('Demande créée.')
            }
            qc.invalidateQueries({ queryKey: ['passation-demandes', uid] })
            qc.invalidateQueries({ queryKey: ['passation-demandes-linkable', uid] })
            qc.invalidateQueries({ queryKey: ['passation', uid] })
            qc.invalidateQueries({ queryKey: ['demandes'] })
            qc.invalidateQueries({ queryKey: ['work-inbox-summary'] })
            qc.invalidateQueries({ queryKey: ['work-inbox-mine'] })
        },
    })

    async function handleGenerateDemande() {
        setGenerateNotice('')
        if (!String(form.demande_destinataire_email || '').trim()) {
            setGenerateNotice('Choisissez le destinataire de la demande RST avant de générer.')
            return
        }
        const sitePlanErr = validatePassationSitePlan({ adresseOuvrage, documents })
        if (sitePlanErr) {
            setGenerateNotice(sitePlanErr)
            return
        }
        try {
            const affaireUid = parseInt(form.affaire_rst_id, 10)
            const previousAdresse = String(selectedAffaire?.adresse_ouvrage || '').trim()
            const nextAdresse = String(adresseOuvrage || '').trim()
            if (affaireUid && nextAdresse !== previousAdresse) {
                await affairesApi.update(affaireUid, { adresse_ouvrage: nextAdresse })
                qc.invalidateQueries({ queryKey: ['affaires'] })
                qc.invalidateQueries({ queryKey: ['affaire', String(affaireUid)] })
            }
            await api.put(`/passations/${uid}`, {
                demande_destinataire_email: form.demande_destinataire_email,
                demande_destinataire_name: form.demande_destinataire_name,
            })
            generateDemandesMutation.mutate()
        } catch (error) {
            setGenerateNotice(error?.message || 'Impossible de préparer la génération.')
        }
    }

    const linkDemandeMutation = useMutation({
        mutationFn: (demandeUid) => passationsApi.linkDemande(uid, { demande_uid: demandeUid }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['passation-demandes', uid] })
            qc.invalidateQueries({ queryKey: ['passation-demandes-linkable', uid] })
            qc.invalidateQueries({ queryKey: ['passation', uid] })
            qc.invalidateQueries({ queryKey: ['demandes'] })
            setLinkDemandeUid('')
        },
    })

    useEffect(() => {
        if (!isNew && passation?.is_editable === false) {
            setIsEditing(false)
        }
    }, [isNew, passation?.is_editable])

    useEffect(() => {
        setIsEditing(isNew)
    }, [isNew, uid])

    async function handleSave() {
        if (!form.affaire_rst_id) return

        if (!isNew) {
            const err = validatePassationSitePlan({ adresseOuvrage, documents })
            if (err) {
                window.alert(err)
                return
            }
        }

        try {
            await persistPassationAdresseOuvrage()
        } catch (err) {
            window.alert(err?.message || 'Impossible d’enregistrer l’adresse de l’ouvrage.')
            return
        }

        mutation.mutate(buildPassationPayload())
    }

    function handleStartEdit() {
        if (isNew || passation?.is_editable === false) return
        setIsEditing(true)
    }

    function handleCancelEdit() {
        if (isNew) return
        if (passation) {
            const { documents: docs, actions: acts, structured_needs: needs, ...rest } = passation
            const nextForm = { ...EMPTY, ...rest, affaire_rst_id: String(rest.affaire_rst_id || '') }
            setForm(nextForm)
            setDocuments(ensureSiteCaptureDocumentRows(docs || []))
            setActions(acts || [])
            setStructuredNeeds(
                Array.isArray(needs) && needs.length > 0
                    ? needs.map(normalizeStructuredNeed)
                    : structuredNeedsFromLegacy(nextForm)
            )
        }
        setIsEditing(false)
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
        const maitreOuvrage = String(match?.maitre_ouvrage || '').trim()
        const maitreOeuvre = String(match?.maitre_oeuvre || '').trim()
        const client = String(match?.maitre_ouvrage || '').trim()
        const entreprise = String(match?.filiale || '').trim()
        const responsable = String(match?.responsable_etude || '').trim()
        setForm((f) => ({
            ...f,
            numero_etude: String(match?.numero_etude || nextValue || '').trim(),
            chantier: chantier || f.chantier,
            maitre_ouvrage: maitreOuvrage || f.maitre_ouvrage,
            maitre_oeuvre: maitreOeuvre || f.maitre_oeuvre,
            client: f.client || client,
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
    const affaireRef = String(linkedAffaire?.reference || passation?.affaire_ref || '').trim()
    const affaireUid = linkedAffaire?.uid || form.affaire_rst_id || passation?.affaire_rst_id || ''
    const heroAffaire = useMemo(() => {
        if (linkedAffaire) return linkedAffaire
        if (!affaireRef && !form.chantier && !form.client && !passation?.chantier && !passation?.client) {
            return null
        }
        return {
            uid: affaireUid,
            reference: affaireRef,
            chantier: form.chantier || passation?.chantier || '',
            client: form.client || passation?.client || '',
            site: '',
            responsable: form.responsable || passation?.responsable || '',
            statut: '',
            titulaire: '',
            filiale: form.agence || passation?.agence || '',
            nb_demandes_actives: null,
            nb_demandes: null,
            date_ouverture: null,
        }
    }, [linkedAffaire, affaireRef, affaireUid, form, passation])
    const backTarget = affaireUid ? `/affaires/${affaireUid}` : '/passations'
    const passationIsEditable = isNew || passation?.is_editable !== false
    const canEdit = isNew || (isEditing && passationIsEditable)

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

    if (!isNew && isError) {
        return (
            <FichePageShell>
                <FicheTopbar
                    backLabel="← Affaires RST"
                    onBack={() => navigate('/passations')}
                    eyebrow="Passation"
                    title={`Passation #${uid}`}
                />
                <FicheMain>
                    <SectionCard title="Passation introuvable">
                        <p className="text-[13px] text-[#a32d2d] font-bold">
                            {passationError?.message || 'Impossible de charger cette passation.'}
                        </p>
                    </SectionCard>
                </FicheMain>
            </FichePageShell>
        )
    }

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
                        {affaireRef ? (
                            <div className="text-[12px] font-bold text-[#003170] mt-0.5">
                                Affaire {affaireRef}
                            </div>
                        ) : null}
                    </div>

                    {affaireUid ? (
                        <Button size="sm" onClick={() => navigate(`/affaires/${affaireUid}`)}>
                            Affaire
                        </Button>
                    ) : null}
                    {affaireUid ? (
                        <Button size="sm" onClick={() => navigate(`/demandes?affaire_id=${affaireUid}`)}>
                            Demandes
                        </Button>
                    ) : null}
                    {!isNew && !isEditing && passationIsEditable ? (
                        <Button size="sm" variant="primary" onClick={handleStartEdit}>
                            Modifier
                        </Button>
                    ) : null}
                    {!isNew && !passationIsEditable && !isEditing ? (
                        <span className="px-3 py-2 rounded-xl border border-[#dbe1ea] bg-[#f8fafc] text-[12px] font-bold text-[#69758a]">
                            Lecture seule
                        </span>
                    ) : null}
                    {canEdit ? (
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
                    ) : null}
                </div>
            </div>

            <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
                {heroAffaire ? (
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
                                {affaireRef ? (
                                    <div className="mt-2 text-[18px] font-black text-[#ffcc00]">
                                        Affaire {affaireRef}
                                    </div>
                                ) : null}
                                <div className="mt-3 text-[20px] font-black">{heroAffaire.chantier || '—'}</div>
                                <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
                                    {heroAffaire.client ? (
                                        <span>
                                            Client : <strong className="text-white">{heroAffaire.client}</strong>
                                        </span>
                                    ) : null}
                                    {heroAffaire.site ? (
                                        <span>
                                            Site : <strong className="text-white">{heroAffaire.site}</strong>
                                        </span>
                                    ) : null}
                                    {heroAffaire.responsable ? (
                                        <span>
                                            Responsable :{' '}
                                            <strong className="text-white">{heroAffaire.responsable}</strong>
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
                                <div className="flex flex-wrap justify-end gap-2">
                                    <span className="inline-flex items-center rounded-full border border-[#e6b900] bg-[#ffcc00] text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                        {heroAffaire.statut === 'En cours'
                                            ? 'Affaire active'
                                            : heroAffaire.statut || 'Affaire liée'}
                                    </span>
                                    {heroAffaire.titulaire ? (
                                        <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                            {heroAffaire.titulaire}
                                        </span>
                                    ) : null}
                                    {heroAffaire.filiale ? (
                                        <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                            {heroAffaire.filiale}
                                        </span>
                                    ) : null}
                                </div>
                                {heroAffaire.nb_demandes != null ? (
                                    <>
                                        <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">
                                            Demandes
                                        </div>
                                        <div className="mt-1.5 text-[13px] font-black">
                                            {heroAffaire.nb_demandes_actives ?? 0} active
                                            {(heroAffaire.nb_demandes_actives ?? 0) !== 1 ? 's' : ''} /{' '}
                                            {heroAffaire.nb_demandes ?? 0}
                                        </div>
                                    </>
                                ) : null}
                                {heroAffaire.date_ouverture ? (
                                    <div className="mt-2 text-[12px] font-black text-white/70">
                                        Ouverture {formatDate(heroAffaire.date_ouverture)}
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

                {!isNew && passation?.is_editable === false && passation?.edit_lock_reason ? (
                    <div className="rounded-[14px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[12px] text-[#69758a]">
                        {passation.edit_lock_reason}
                    </div>
                ) : null}

                {!isNew ? (
                    <SectionCard
                        title="Demandes associées"
                        subtitle="Demande générée depuis cette passation"
                        actions={
                            !hasLinkedDemande ? (
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={handleGenerateDemande}
                                    disabled={generateDemandesMutation.isPending}
                                >
                                    {generateDemandesMutation.isPending ? 'Génération…' : 'Générer demande'}
                                </Button>
                            ) : null
                        }
                    >
                        {!hasLinkedDemande ? (
                            <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                <FG label="Destinataire demande *">
                                    <Select
                                        value={form.demande_destinataire_email ?? ''}
                                        onChange={(e) => {
                                            const email = e.target.value
                                            const user = destinataireOptions.find((entry) => entry.email === email)
                                            setForm((current) => ({
                                                ...current,
                                                demande_destinataire_email: email,
                                                demande_destinataire_name: user?.display_name || '',
                                            }))
                                        }}
                                        className="w-full"
                                        disabled={!passationIsEditable}
                                    >
                                        <option value="">— Choisir le destinataire —</option>
                                        {destinataireGroups.regionalRst.length > 0 ? (
                                            <optgroup label="RST · région ARS">
                                                {destinataireGroups.regionalRst.map((user) => (
                                                    <option key={user.email} value={user.email}>
                                                        {user.display_name} — RST ARS
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ) : null}
                                        {destinataireGroups.laboLocal.length > 0 ? (
                                            <optgroup label="Responsables labo locaux">
                                                {destinataireGroups.laboLocal.map((user) => (
                                                    <option key={user.email} value={user.email}>
                                                        {user.display_name} ({user.service_code || 'labo'})
                                                    </option>
                                                ))}
                                            </optgroup>
                                        ) : null}
                                        {destinataireGroups.other.map((user) => (
                                            <option key={user.email} value={user.email}>
                                                {user.display_name} ({user.email})
                                            </option>
                                        ))}
                                    </Select>
                                </FG>
                                <div className="flex items-end pb-1 text-xs leading-relaxed text-[#69758a]">
                                    RST région ARS ou responsable labo local (SP / PDC).
                                    À la génération : attribution dashboard + e-mail (mock).
                                </div>
                            </div>
                        ) : null}
                        {passationDemandes.length === 0 ? (
                            <div className="text-xs text-[#69758a] text-center py-8">
                                Aucune demande associée à cette passation
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-[#dbe1ea]">
                                <table className="w-full min-w-[1080px] border-collapse">
                                    <thead>
                                        <tr>
                                            {[
                                                'Référence',
                                                'Nature / mission',
                                                'Statut',
                                                'Priorité',
                                                'Éch.',
                                                'Interv.',
                                                'N° DST',
                                                'Date demande',
                                                'Échéance',
                                                'Demandeur',
                                                'MàJ',
                                            ].map((h) => (
                                                <th
                                                    key={h}
                                                    className="border-b border-[#dbe1ea] bg-[#f1f5f9] text-[#69758a] px-3.5 py-2.5 text-left text-[11px] font-black uppercase tracking-[.08em] whitespace-nowrap"
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {passationDemandes.map((d) => (
                                            <tr
                                                key={d.uid}
                                                onClick={() =>
                                                    navigate(buildPathWithReturnTo(`/demandes/${d.uid}`, detailReturnTo))
                                                }
                                                className="border-b border-[#edf1f6] cursor-pointer hover:bg-[#f8f8fc] transition-colors"
                                            >
                                                <td className="px-3.5 py-3 bg-white">
                                                    <strong className="text-[#003170] text-xs font-black">
                                                        {d.reference}
                                                    </strong>
                                                </td>
                                                <td className="px-3.5 py-3 bg-white text-xs">
                                                    <div className="font-medium">{d.nature || d.type_mission || '—'}</div>
                                                    {d.type_mission && d.nature && d.type_mission !== d.nature ? (
                                                        <div className="text-[10px] text-[#69758a]">{d.type_mission}</div>
                                                    ) : null}
                                                </td>
                                                <td className="px-3.5 py-3 bg-white">
                                                    <DemandeBadge statut={d.statut} />
                                                </td>
                                                <td className="px-3.5 py-3 bg-white text-xs">{d.priorite || '—'}</td>
                                                <td className="px-3.5 py-3 bg-white text-xs text-center">
                                                    {d.nb_echantillons || 0}
                                                </td>
                                                <td className="px-3.5 py-3 bg-white text-xs text-center">
                                                    <div>{d.nb_interventions || 0}</div>
                                                    {(() => {
                                                        const summary = buildTerrainFamiliesSummary(d)
                                                        return summary ? (
                                                            <div className="text-[10px] text-[#69758a]">{summary}</div>
                                                        ) : null
                                                    })()}
                                                </td>
                                                <td className="px-3.5 py-3 bg-white text-xs">{d.numero_dst || '—'}</td>
                                                <td className="px-3.5 py-3 bg-white text-xs">
                                                    {d.date_reception ? formatDate(d.date_reception) : '—'}
                                                </td>
                                                <td className="px-3.5 py-3 bg-white text-xs">
                                                    {d.date_echeance ? formatDate(d.date_echeance) : '—'}
                                                </td>
                                                <td className="px-3.5 py-3 bg-white text-xs">{d.demandeur || '—'}</td>
                                                <td className="px-3.5 py-3 bg-white text-xs">
                                                    {d.updated_at ? formatDate(d.updated_at) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {generateNotice ? (
                            <div className="mt-4 rounded-xl border border-[#cfe0f5] bg-[#eef5fc] p-3 text-[13px] text-[#185fa5]">
                                {generateNotice}
                            </div>
                        ) : null}

                        {generateDemandesMutation.error ? (
                            <div className="mt-4 rounded-xl border border-[#f0a0a0] bg-[#fcebeb] p-3 text-[13px] text-[#8c2626]">
                                {generateDemandesMutation.error.message}
                            </div>
                        ) : null}
                    </SectionCard>
                ) : null}

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
                            <FG label="Date prévue début travaux">
                                <Input
                                    type="date"
                                    value={debutTravauxDisplay}
                                    disabled={debutTravauxLocked || !isEditing}
                                    readOnly={debutTravauxLocked}
                                    onChange={(e) => set('date_debut_travaux_prevue', e.target.value)}
                                />
                                {debutTravauxLocked ? (
                                    <p className="text-[11px] text-text-muted mt-1">
                                        Définie sur l&apos;affaire — lecture seule ici.
                                    </p>
                                ) : null}
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
                            <FG label="Adresse ouvrage" full>
                                <textarea
                                    value={adresseOuvrage}
                                    onChange={(e) => setAdresseOuvrage(e.target.value)}
                                    placeholder="Rue et numéro — le site (commune / CP) complète la localisation carte"
                                    rows={2}
                                    disabled={!form.affaire_rst_id}
                                    className="w-full px-2.5 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-accent disabled:opacity-60"
                                />
                                <div className="mt-1 text-[11px] text-text-muted">
                                    Partagée sur l’affaire. Avec le site de l’affaire (commune / CP), sert au plan de situation.
                                </div>
                            </FG>
                            <FG label="Client">
                                <Input value={form.client} onChange={(e) => set('client', e.target.value)} />
                                <div className="mt-1 text-[11px] text-text-muted">
                                    Peut différer du maître d’ouvrage (facturation, contact opérationnel…).
                                </div>
                            </FG>
                            <FG label="Maître d'ouvrage">
                                <Input value={form.maitre_ouvrage} onChange={(e) => set('maitre_ouvrage', e.target.value)} />
                            </FG>
                            <FG label="Maître d'œuvre">
                                <Input value={form.maitre_oeuvre} onChange={(e) => set('maitre_oeuvre', e.target.value)} />
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
                        {!isNew && !hasPlanSituationFile(documents) ? (
                            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-950">
                                Plan de situation obligatoire — déposez le fichier ou capturez la carte sur la ligne ci-dessous.
                            </div>
                        ) : null}
                        <DocumentTrackingTable
                            documents={documents}
                            onChange={(next) => setDocuments(ensureSiteCaptureDocumentRows(next))}
                            onSave={!isNew ? handleSaveDocuments : undefined}
                            isSaving={documentsMutation.isPending}
                            readOnly={isNew}
                            enableFileDrop={!isNew}
                            uploadDocument={!isNew ? uploadAffaireDocument : undefined}
                            deleteStoredFile={!isNew ? deleteAffaireDocument : undefined}
                            captureSitePlan={captureSitePlan}
                            documentTypeOptions={filters.document_type_options || []}
                            siteGeocodeParts={{
                              adresseOuvrage: adresseOuvrage,
                              site: selectedAffaire?.site || '',
                            }}
                            distanceToLab={linkedAffaireDetail?.site_geo?.distance_to_lab}
                            fileDropDisabledMessage={
                                isNew
                                    ? 'Quadro C indisponible : enregistrez d’abord cette passation (choisir l’affaire, puis Enregistrer).'
                                    : !form.affaire_rst_id
                                        ? 'Sélectionnez une affaire pour déposer des fichiers.'
                                        : ''
                            }
                            subtitle={
                                isNew
                                    ? 'Enregistrez la passation pour accéder au quadro C.'
                                    : 'Le plan de situation est obligatoire. Glisser un fichier sur Version pour l’envoyer sur le serveur.'
                            }
                        />
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
                                <TA value={form.synthese} onChange={(v) => set('synthese', v)} rows={18} />
                            </FG>
                            <FG label="Notes complémentaires">
                                <TA value={form.notes} onChange={(v) => set('notes', v)} rows={6} />
                            </FG>
                        </div>
                    </SectionCard>
                </fieldset>

                {!isNew && !hasLinkedDemande && linkableDemandes.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-[#edf1f6] pt-4 text-[11px] text-[#69758a]">
                        <span>Lier demande existante</span>
                        <Select
                            value={linkDemandeUid}
                            onChange={(e) => setLinkDemandeUid(e.target.value)}
                            className="min-w-[180px] text-xs"
                        >
                            <option value="">—</option>
                            {linkableDemandes.map((item) => (
                                <option key={item.demande_uid} value={item.demande_uid}>
                                    {item.reference || `#${item.demande_uid}`}
                                </option>
                            ))}
                        </Select>
                        <button
                            type="button"
                            onClick={() => {
                                if (!linkDemandeUid) return
                                linkDemandeMutation.mutate(parseInt(linkDemandeUid, 10))
                            }}
                            disabled={!linkDemandeUid || linkDemandeMutation.isPending}
                            className="font-bold text-[#003170] hover:underline disabled:opacity-40"
                        >
                            {linkDemandeMutation.isPending ? 'Liaison…' : 'Lier'}
                        </button>
                        {linkDemandeMutation.error ? (
                            <span className="text-[#8c2626]">{linkDemandeMutation.error.message}</span>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </FichePageShell>
    )
}
