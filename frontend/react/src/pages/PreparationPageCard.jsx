/**
 * PreparationPageCard.jsx
 * Alternative preparation page in the visual logic of EchantillonPage.
 *
 * Preview route proposal:
 * - /preparations-card/:uid
 * - /preparations-card/:uid?ref=2026-RA-D0001
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import InterventionTypeModal, { applyInterventionTypeToPath, buildInterventionTypeOptions } from '@/components/interventions/InterventionTypeModal'
import Input, { Select } from '@/components/ui/Input'

function Card({ title, children }) {
    return (
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
            {title && (
                <div className="px-4 py-2.5 border-b border-border bg-bg">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
                </div>
            )}
            <div className="p-4">{children}</div>
        </div>
    )
}

function FG({ label, children }) {
    return (
        <div className="flex flex-col gap-1">
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

function Badge({ text }) {
    return text ? (
        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f1efe8] text-[#5f5e5a]">{text}</span>
    ) : null
}

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

function buildInterventionUrl(demandeUid, form) {
    const params = new URLSearchParams()
    params.set('demande_id', String(demandeUid || ''))
    params.set('source', 'preparation-card')
    if (form.type_intervention_prevu) params.set('type_intervention', form.type_intervention_prevu)
    if (form.finalite) params.set('finalite', form.finalite)
    if (form.zone_localisation) params.set('zone', form.zone_localisation)
    if (form.materiau_objet) params.set('materiau', form.materiau_objet)
    if (form.objectif_mission) params.set('objectif', form.objectif_mission)
    if (form.responsable_referent) params.set('responsable', form.responsable_referent)
    if (form.attribue_a) params.set('attribue_a', form.attribue_a)
    return `/interventions-card/new?${params.toString()}`
}

export default function PreparationPageCard() {
    const { uid } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const qc = useQueryClient()

    const demandeUid = useMemo(() => String(uid || searchParams.get('uid') || ''), [uid, searchParams])
    const demandeReferenceFromQuery = useMemo(
        () => searchParams.get('ref') || searchParams.get('reference') || '',
        [searchParams]
    )
    const typeOptions = useMemo(() => buildInterventionTypeOptions(form.type_intervention_prevu), [form.type_intervention_prevu])

    const [editing, setEditing] = useState(false)
    const [interventionModalOpen, setInterventionModalOpen] = useState(false)
    const [form, setForm] = useState({
        type_intervention_prevu: '',
        finalite: '',
        zone_localisation: '',
        materiau_objet: '',
        objectif_mission: '',
        responsable_referent: '',
        attribue_a: '',
        priorite: 'Normale',
        remarques: '',
    })
    const [mods, setMods] = useState({})

    const { data: nav, isLoading, isError } = useQuery({
        queryKey: ['demande-nav-card', demandeUid],
        queryFn: () => api.get(`/demandes_rst/${demandeUid}/navigation`),
        enabled: !!demandeUid,
    })

    const { data: catalog } = useQuery({
        queryKey: ['demande-catalog-card'],
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

    const saveMut = useMutation({
        mutationFn: async ({ preparation, enabledModulesPayload }) => {
            await api.put(`/demandes_rst/${demandeUid}/preparation`, preparation)
            await api.put(`/demandes_rst/${demandeUid}/enabled-modules`, { modules: enabledModulesPayload })
        },
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['demande-nav-card', demandeUid] })
            setEditing(false)
        },
    })

    useEffect(() => {
        if (!nav || editing) return
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
        setMods(Object.fromEntries(modules.map((m) => [m.module_code, !!m.is_enabled])))
    }, [nav, editing, originalPrep, modules])

    function loadForEdit() {
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
        setMods(Object.fromEntries(modules.map((m) => [m.module_code, !!m.is_enabled])))
        setEditing(true)
    }

    function setF(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }))
    }

    function handleSave() {
        const sourceModules = catalog?.modules || modules
        const enabledModulesPayload = sourceModules.map((m) => ({
            module_code: m.module_code,
            is_enabled: !!mods[m.module_code],
        }))

        saveMut.mutate({
            preparation: {
                ...originalPrep,
                ...form,
            },
            enabledModulesPayload,
        })
    }

    if (isLoading) {
        return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
    }

    if (isError || !nav) {
        return (
            <div className="text-center py-16">
                <p className="text-text-muted text-sm mb-3">Préparation introuvable</p>
                <Button onClick={() => navigate(-1)}>← Retour</Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border shrink-0 flex-wrap bg-surface">
                <button
                    onClick={() => navigate(-1)}
                    className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
                >
                    ← Retour
                </button>
                <span className="text-[13px] text-text-muted">{demandeReference || demandeUid} › </span>
                <span className="text-[14px] font-semibold flex-1 font-mono">Préparation</span>
                <Badge text={form.priorite} />
                {editing ? (
                    <>
                        <Button onClick={() => setEditing(false)}>Annuler</Button>
                        <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending}>
                            {saveMut.isPending ? '…' : '✓ Enregistrer'}
                        </Button>
                    </>
                ) : (
                    <>
                        <Button size="sm" onClick={() => setInterventionModalOpen(true)}>
                            🛠️ Créer une intervention
                        </Button>
                        <Button size="sm" variant="primary" onClick={loadForEdit}>✏️ Modifier</Button>
                    </>
                )}
            </div>

            <div className="p-5 max-w-[860px] mx-auto w-full flex flex-col gap-4">
                <Card title={editing ? "Préparation de la mission" : "Préparation"}>
                    {editing ? (
                        <div className="grid grid-cols-2 gap-3">
                            <FG label="Type d’intervention prévu">
                                <Select value={form.type_intervention_prevu} onChange={(e) => setF('type_intervention_prevu', e.target.value)}>
                                    <option value="">—</option>
                                    {typeOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </FG>

                            <FG label="Finalité">
                                <Select value={form.finalite} onChange={(e) => setF('finalite', e.target.value)}>
                                    <option value="">—</option>
                                    {FINALITY_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </FG>

                            <FG label="Zone / localisation">
                                <Input value={form.zone_localisation} onChange={(e) => setF('zone_localisation', e.target.value)} />
                            </FG>

                            <FG label="Matériau / objet concerné">
                                <Select value={form.materiau_objet} onChange={(e) => setF('materiau_objet', e.target.value)}>
                                    <option value="">—</option>
                                    {MATERIAL_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </FG>

                            <FG label="Responsable / référent">
                                <Input value={form.responsable_referent} onChange={(e) => setF('responsable_referent', e.target.value)} />
                            </FG>

                            <FG label="Attribué à">
                                <Input value={form.attribue_a} onChange={(e) => setF('attribue_a', e.target.value)} />
                            </FG>

                            <FG label="Priorité">
                                <Select value={form.priorite} onChange={(e) => setF('priorite', e.target.value)}>
                                    {PRIORITY_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </FG>

                            <div className="col-span-2">
                                <FG label="Objectif de la mission">
                                    <textarea
                                        value={form.objectif_mission}
                                        onChange={(e) => setF('objectif_mission', e.target.value)}
                                        rows={3}
                                        className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
                                    />
                                </FG>
                            </div>

                            <div className="col-span-2">
                                <FG label="Remarques">
                                    <textarea
                                        value={form.remarques}
                                        onChange={(e) => setF('remarques', e.target.value)}
                                        rows={4}
                                        className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
                                    />
                                </FG>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-x-8">
                            <div>
                                <FR label="Demande liée" value={demandeReference || demandeUid} />
                                <FR label="Affaire" value={demandeAffaire} />
                                <FR label="Chantier / Site" value={demandeChantier} />
                                <FR label="Type prévu" value={form.type_intervention_prevu} />
                                <FR label="Finalité" value={form.finalite} />
                            </div>
                            <div>
                                <FR label="Zone / localisation" value={form.zone_localisation} />
                                <FR label="Matériau / objet concerné" value={form.materiau_objet} />
                                <FR label="Responsable / référent" value={form.responsable_referent} />
                                <FR label="Attribué à" value={form.attribue_a} />
                                <FR label="Priorité" value={form.priorite} />
                            </div>
                            <div className="col-span-2 mt-2">
                                <FR label="Objectif de la mission" value={form.objectif_mission} />
                                <FR label="Remarques" value={form.remarques} />
                            </div>
                        </div>
                    )}
                </Card>

                <Card title="Modules activés">
                    <div className="flex flex-wrap gap-2">
                        {enabledModules.length ? enabledModules.map((m) => (
                            <Badge key={m.module_code} text={m.label} />
                        )) : <span className="text-[13px] text-text-muted italic">Aucun module activé</span>}
                    </div>

                    {editing && (
                        <div className="grid grid-cols-2 gap-2 mt-4">
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
                    )}
                </Card>

                {saveMut.error && (
                    <p className="text-danger text-xs px-3 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded">
                        {saveMut.error.message}
                    </p>
                )}
            </div>

            <InterventionTypeModal
                open={interventionModalOpen}
                onClose={() => setInterventionModalOpen(false)}
                onSelect={(typeIntervention) => {
                    navigate(applyInterventionTypeToPath(buildInterventionUrl(demandeUid, form), typeIntervention))
                    setInterventionModalOpen(false)
                }}
                subtitle={demandeReference ? `Demande: ${demandeReference}` : ''}
            />
        </div>
    )
}
