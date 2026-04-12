/**
 * PreparationPage.jsx
 * Simple standalone preparation page.
 *
 * Goals:
 * - keep preparation simple
 * - prepare the future intervention
 * - stay linked to the demande
 * - preserve hidden legacy preparation fields when saving
 * - keep module activation available
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import InterventionTypeModal, { applyInterventionTypeToPath, buildInterventionTypeOptions } from '@/components/interventions/InterventionTypeModal'
import Input, { Select } from '@/components/ui/Input'
import { ArrowLeft, ClipboardList, RefreshCw, Save, Wrench } from 'lucide-react'

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

const PRIORITY_OPTIONS = ['Basse', 'Normale', 'Haute', 'Urgente']

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

const DEFAULT_FORM = {
    type_intervention_prevu: '',
    finalite: '',
    zone_localisation: '',
    materiau_objet: '',
    objectif_mission: '',
    responsable_referent: '',
    attribue_a: '',
    priorite: 'Normale',
    remarques: '',
}

function Section({ title, children, right }) {
    return (
        <section className="bg-surface border border-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
                <div className="text-[12px] font-bold uppercase tracking-[.06em] text-text-muted">
                    {title}
                </div>
                {right}
            </div>
            {children}
        </section>
    )
}

function Field({ label, children, full = false }) {
    return (
        <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
            <label className="text-[11px] font-medium text-text-muted">{label}</label>
            {children}
        </div>
    )
}

function Textarea({ value, onChange, rows = 3, placeholder = '' }) {
    return (
        <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
        />
    )
}

function InfoLine({ label, value }) {
    return (
        <div className="flex flex-col gap-0.5">
            <div className="text-[10px] text-text-muted uppercase tracking-[.04em]">{label}</div>
            <div className={`text-[13px] ${value ? '' : 'text-text-muted italic'}`}>
                {value || '—'}
            </div>
        </div>
    )
}

function Badge({ children }) {
    return (
        <span className="inline-flex items-center px-2.5 py-1 border border-border rounded-full bg-bg text-[12px] font-medium">
            {children}
        </span>
    )
}

function buildInterventionUrl(demandeUid, form) {
    const params = new URLSearchParams()
    params.set('demande_id', String(demandeUid || ''))
    params.set('source', 'preparation')

    if (form.type_intervention_prevu) params.set('type_intervention', form.type_intervention_prevu)
    if (form.finalite) params.set('finalite', form.finalite)
    if (form.zone_localisation) params.set('zone', form.zone_localisation)
    if (form.materiau_objet) params.set('materiau', form.materiau_objet)
    if (form.objectif_mission) params.set('objectif', form.objectif_mission)
    if (form.responsable_referent) params.set('responsable', form.responsable_referent)
    if (form.attribue_a) params.set('attribue_a', form.attribue_a)

    return `/interventions/new?${params.toString()}`
}

export default function PreparationPage() {
    const qc = useQueryClient()
    const navigate = useNavigate()
    const { uid } = useParams()
    const [searchParams] = useSearchParams()

    const demandeUid = useMemo(() => String(uid || searchParams.get('uid') || ''), [uid, searchParams])
    const demandeReferenceFromQuery = useMemo(
        () => searchParams.get('ref') || searchParams.get('reference') || '',
        [searchParams]
    )
    const typeOptions = useMemo(() => buildInterventionTypeOptions(form.type_intervention_prevu), [form.type_intervention_prevu])

    const [form, setForm] = useState(DEFAULT_FORM)
    const [mods, setMods] = useState({})
    const [interventionModalOpen, setInterventionModalOpen] = useState(false)

    const { data: nav, isLoading: navLoading } = useQuery({
        queryKey: ['demande-nav', demandeUid],
        queryFn: () => api.get(`/demandes_rst/${demandeUid}/navigation`),
        enabled: !!demandeUid,
    })

    const { data: catalog, isLoading: catalogLoading } = useQuery({
        queryKey: ['demande-catalog'],
        queryFn: () => api.get('/demandes_rst/configuration/catalog'),
        enabled: !!demandeUid,
    })

    const originalPrep = nav?.preparation || {}
    const modules = nav?.modules || []
    const enabledModules = modules.filter((m) => m.is_enabled)

    const demandeReference =
        nav?.demande?.reference
        || nav?.reference
        || demandeReferenceFromQuery
        || ''

    const demandeAffaire =
        nav?.demande?.affaire_reference
        || nav?.demande?.affaire_ref
        || nav?.affaire_reference
        || nav?.affaire_ref
        || ''

    const demandeChantier =
        nav?.demande?.chantier
        || nav?.chantier
        || nav?.demande?.site
        || nav?.site
        || ''

    useEffect(() => {
        setForm({
            type_intervention_prevu: originalPrep.type_intervention_prevu || '',
            finalite: originalPrep.finalite || '',
            zone_localisation: originalPrep.zone_localisation || '',
            materiau_objet: originalPrep.materiau_objet || '',
            objectif_mission: originalPrep.objectif_mission || '',
            responsable_referent: originalPrep.responsable_referent || '',
            attribue_a: originalPrep.attribue_a || '',
            priorite: originalPrep.priorite || 'Normale',
            remarques: originalPrep.remarques || '',
        })
    }, [
        originalPrep.type_intervention_prevu,
        originalPrep.finalite,
        originalPrep.zone_localisation,
        originalPrep.materiau_objet,
        originalPrep.objectif_mission,
        originalPrep.responsable_referent,
        originalPrep.attribue_a,
        originalPrep.priorite,
        originalPrep.remarques,
    ])

    useEffect(() => {
        setMods(Object.fromEntries(modules.map((m) => [m.module_code, !!m.is_enabled])))
    }, [modules])

    const saveMutation = useMutation({
        mutationFn: async ({ preparation, enabledModulesPayload }) => {
            await api.put(`/demandes_rst/${demandeUid}/preparation`, preparation)
            await api.put(`/demandes_rst/${demandeUid}/enabled-modules`, { modules: enabledModulesPayload })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })
        },
    })

    function setField(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }))
    }

    function handleSave() {
        const sourceModules = catalog?.modules || modules
        const enabledModulesPayload = sourceModules.map((m) => ({
            module_code: m.module_code,
            is_enabled: !!mods[m.module_code],
        }))

        const payload = {
            ...originalPrep,
            ...form,
        }

        saveMutation.mutate({
            preparation: payload,
            enabledModulesPayload,
        })
    }

    function handleCreateIntervention() {
        setInterventionModalOpen(true)
    }

    function handleSelectInterventionType(typeIntervention) {
        navigate(applyInterventionTypeToPath(buildInterventionUrl(demandeUid, form), typeIntervention))
        setInterventionModalOpen(false)
    }

    if (!demandeUid) {
        return (
            <div className="flex flex-col h-full -m-6">
                <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                        <ArrowLeft size={14} />
                    </Button>
                    <span className="text-[15px] font-semibold flex-1">Préparation</span>
                </div>

                <div className="flex-1 flex items-center justify-center p-6 bg-bg">
                    <div className="bg-surface border border-border rounded-xl px-5 py-4 max-w-[520px]">
                        <div className="text-sm font-semibold text-text">Préparation introuvable</div>
                        <div className="text-xs text-text-muted mt-2">
                            Aucun identifiant de demande n’a été transmis à la page de préparation.
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const isLoading = navLoading || catalogLoading

    return (
        <div className="flex flex-col h-full -m-6">
            <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
                <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                    <ArrowLeft size={14} />
                </Button>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[15px] font-semibold leading-tight">Préparation</span>
                    <span className="text-[11px] text-text-muted truncate">
                        {demandeReference ? `Demande liée: ${demandeReference}` : `Demande UID: ${demandeUid}`}
                    </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['demande-nav', demandeUid] })}>
                    <RefreshCw size={13} />
                </Button>
            </div>

            <div className="px-6 py-4 bg-bg border-b border-border">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="text-lg font-bold text-text">Préparation de la mission</div>
                        <div className="text-xs text-text-muted mt-1 max-w-[900px]">
                            Préparer la future intervention sans entrer encore dans l’exécution terrain.
                        </div>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {enabledModules.length ? enabledModules.map((m) => (
                                <Badge key={m.module_code}>{m.label}</Badge>
                            )) : <Badge>Aucun module activé</Badge>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => navigate(`/demandes/${demandeUid}`)}>
                            <ClipboardList size={13} />
                            <span className="ml-1">Demande</span>
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
                            <Save size={13} />
                            <span className="ml-1">{saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}</span>
                        </Button>
                        <Button size="sm" onClick={handleCreateIntervention} disabled={isLoading}>
                            <Wrench size={13} />
                            <span className="ml-1">Créer une intervention</span>
                        </Button>
                    </div>
                </div>

                {saveMutation.error ? (
                    <div className="mt-3 text-sm text-danger bg-[#fcebeb] border border-[#f0a0a0] rounded-lg px-3 py-2">
                        {saveMutation.error.message}
                    </div>
                ) : null}

                {saveMutation.isSuccess ? (
                    <div className="mt-3 text-sm text-[#0f6e56] bg-[#e0f5ef] border border-[#bfe5db] rounded-lg px-3 py-2">
                        Préparation enregistrée.
                    </div>
                ) : null}
            </div>

            <div className="flex-1 overflow-auto p-6 bg-bg">
                {isLoading ? (
                    <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted text-center">
                        Chargement…
                    </div>
                ) : (
                    <div className="grid grid-cols-[minmax(0,1.55fr)_360px] gap-4">
                        <div className="flex flex-col gap-4 min-w-0">
                            <Section title="Contexte">
                                <div className="grid grid-cols-2 gap-3">
                                    <InfoLine label="Demande liée" value={demandeReference || demandeUid} />
                                    <InfoLine label="Affaire" value={demandeAffaire} />
                                    <div className="col-span-2">
                                        <InfoLine label="Chantier / Site" value={demandeChantier} />
                                    </div>
                                </div>
                            </Section>

                            <Section title="Préparation de la mission">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Type d’intervention prévu">
                                        <Select
                                            value={form.type_intervention_prevu}
                                            onChange={(e) => setField('type_intervention_prevu', e.target.value)}
                                        >
                                            <option value="">—</option>
                                            {typeOptions.map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Finalité">
                                        <Select
                                            value={form.finalite}
                                            onChange={(e) => setField('finalite', e.target.value)}
                                        >
                                            <option value="">—</option>
                                            {FINALITY_OPTIONS.map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Zone / localisation">
                                        <Input
                                            value={form.zone_localisation}
                                            onChange={(e) => setField('zone_localisation', e.target.value)}
                                        />
                                    </Field>

                                    <Field label="Matériau / objet concerné">
                                        <Select
                                            value={form.materiau_objet}
                                            onChange={(e) => setField('materiau_objet', e.target.value)}
                                        >
                                            <option value="">—</option>
                                            {MATERIAL_OPTIONS.map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Objectif de la mission" full>
                                        <Textarea
                                            value={form.objectif_mission}
                                            onChange={(value) => setField('objectif_mission', value)}
                                            rows={3}
                                            placeholder="Décrire simplement ce qui doit être fait."
                                        />
                                    </Field>
                                </div>
                            </Section>

                            <Section title="Organisation">
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Responsable / référent">
                                        <Input
                                            value={form.responsable_referent}
                                            onChange={(e) => setField('responsable_referent', e.target.value)}
                                        />
                                    </Field>

                                    <Field label="Attribué à">
                                        <Input
                                            value={form.attribue_a}
                                            onChange={(e) => setField('attribue_a', e.target.value)}
                                        />
                                    </Field>

                                    <Field label="Priorité">
                                        <Select
                                            value={form.priorite}
                                            onChange={(e) => setField('priorite', e.target.value)}
                                        >
                                            {PRIORITY_OPTIONS.map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </Select>
                                    </Field>
                                </div>
                            </Section>

                            <Section title="Contraintes / remarques">
                                <Field label="Remarques" full>
                                    <Textarea
                                        value={form.remarques}
                                        onChange={(value) => setField('remarques', value)}
                                        rows={4}
                                        placeholder="Accès, sécurité, vigilance, points utiles…"
                                    />
                                </Field>
                            </Section>

                            <Section title="Modules activés">
                                <div className="grid grid-cols-2 gap-2">
                                    {(catalog?.modules || modules).map((m) => (
                                        <label
                                            key={m.module_code}
                                            className="flex items-start gap-2.5 p-2.5 border border-border rounded bg-bg cursor-pointer hover:border-accent transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={mods[m.module_code] || false}
                                                onChange={(e) => setMods((prev) => ({ ...prev, [m.module_code]: e.target.checked }))}
                                                className="mt-0.5 accent-accent"
                                            />
                                            <div>
                                                <div className="text-[13px] font-semibold">{m.label}</div>
                                                {m.group ? <div className="text-[11px] text-text-muted mt-0.5">{m.group}</div> : null}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </Section>
                        </div>

                        <div className="flex flex-col gap-4">
                            <Section title="Résumé">
                                <InfoLine label="Type prévu" value={form.type_intervention_prevu} />
                                <InfoLine label="Finalité" value={form.finalite} />
                                <InfoLine label="Zone" value={form.zone_localisation} />
                                <InfoLine label="Matériau / objet" value={form.materiau_objet} />
                                <InfoLine label="Responsable" value={form.responsable_referent} />
                                <InfoLine label="Attribué à" value={form.attribue_a} />
                                <InfoLine label="Priorité" value={form.priorite} />
                            </Section>

                            <Section title="Suite logique">
                                <div className="text-[13px] leading-6 text-text-muted">
                                    La préparation sert à organiser la mission.
                                    L’intervention décrira ensuite l’exécution réelle sur le terrain.
                                </div>
                            </Section>
                        </div>
                    </div>
                )}
            </div>

            <InterventionTypeModal
                open={interventionModalOpen}
                onClose={() => setInterventionModalOpen(false)}
                onSelect={handleSelectInterventionType}
                subtitle={demandeReference ? `Demande: ${demandeReference}` : ''}
            />
        </div>
    )
}
