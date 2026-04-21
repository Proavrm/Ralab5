/**
 * PrelevementPage.jsx
 * Simplified prélèvement page aligned with ÉchantillonPage workflow.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import { echantillonsApi, essaisApi, prelevementsApi } from '@/services/api'

const DEFAULT_STATUSES = ['À trier', 'Reçu', 'En attente', 'En cours', 'Prêt labo', 'Clôturé']
const DEFAULT_ECHANTILLON_STATUS = 'Reçu'

const ECHANTILLON_STAT_CLS = {
    'Reçu': 'bg-[#e6f1fb] text-[#185fa5]',
    'En attente': 'bg-[#faeeda] text-[#854f0b]',
    'En cours': 'bg-[#faeeda] text-[#854f0b]',
    'Terminé': 'bg-[#eaf3de] text-[#3b6d11]',
    'Rejeté': 'bg-[#fcebeb] text-[#a32d2d]',
}

const TYPES_ESSAI = [
    { code: 'WE', label: 'Teneur en eau naturelle', norme: 'Détermination de la Teneur en Eau (NF P 94 049 et NF P 94 050)' },
    { code: 'GR', label: 'Granulométrie', norme: 'NF P 94-056' },
    { code: 'EL', label: 'Extraction de liant', norme: 'NF EN 12697-1' },
    { code: 'CFE', label: 'Contrôle de fabrication enrobés', norme: '' },
    { code: 'LCP', label: "Limites d'Atterberg", norme: 'NF P 94-051' },
    { code: 'VBS', label: "Prise d'essai au bleu (sols)", norme: 'NF P 94-068', init_resultats: '{"type_materiau":"sols"}' },
    { code: 'MB', label: 'Valeur au bleu 0/2mm', norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mb_0_2"}' },
    { code: 'MBF', label: 'Valeur au bleu 0/0.125mm', norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mbf_0_0125"}' },
    { code: 'ES', label: 'Équivalent de sable', norme: 'NF P 94-055' },
    { code: 'PN', label: 'Proctor Normal', norme: 'NF P 94-093' },
    { code: 'IPI', label: 'IPI — Indice Portant Immédiat', norme: 'NF P 94-078' },
    { code: 'CBRI', label: 'CBRi — CBR immédiat', norme: 'NF P 94-090-1' },
    { code: 'CBR', label: 'CBR — après immersion 4 jours', norme: 'NF P 94-090-1' },
    { code: 'ID', label: 'Identification GTR', norme: 'NF P 11-300' },
    { code: 'MVA', label: 'Masse volumique des enrobés', norme: 'NF EN 12697-6' },
]

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

function Badge({ s }) {
    return s ? <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${ECHANTILLON_STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span> : null
}

function buildForm(prelevement) {
    return {
        date_prelevement: prelevement?.date_prelevement || '',
        date_reception_labo: prelevement?.date_reception_labo || '',
        description: prelevement?.description || '',
        quantite: prelevement?.quantite || '',
        receptionnaire: prelevement?.receptionnaire || '',
        zone: prelevement?.zone || '',
        materiau: prelevement?.materiau || '',
        technicien: prelevement?.technicien || '',
        finalite: prelevement?.finalite || '',
        notes: prelevement?.notes || '',
        statut: prelevement?.statut || 'À trier',
    }
}

function buildTransitionForm(prelevement) {
    return {
        designation: prelevement?.description || prelevement?.materiau || '',
        localisation: prelevement?.zone || '',
        statut: DEFAULT_ECHANTILLON_STATUS,
        essai_codes: [],
    }
}

function extractIsoDate(value) {
    const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : null
}

function getEssaiType(code) {
    return TYPES_ESSAI.find((item) => item.code === code)
}

export default function PrelevementPage() {
    const { uid } = useParams()
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()
    const queryClient = useQueryClient()
    const childReturnTo = buildLocationTarget(location)

    const [editing, setEditing] = useState(false)
    const [deleteMode, setDeleteMode] = useState(false)
    const [form, setForm] = useState(buildForm(null))
    const [transitionForm, setTransitionForm] = useState(buildTransitionForm(null))

    const prelevementQuery = useQuery({
        queryKey: ['prelevement', uid],
        queryFn: () => prelevementsApi.get(uid),
    })

    const prelevement = prelevementQuery.data

    useEffect(() => {
        if (!prelevement) return
        setForm(buildForm(prelevement))
        setTransitionForm((current) => ({
            ...buildTransitionForm(prelevement),
            essai_codes: current.essai_codes || [],
        }))
    }, [prelevement])

    const saveMutation = useMutation({
        mutationFn: () => prelevementsApi.update(uid, form),
        onSuccess: (saved) => {
            queryClient.setQueryData(['prelevement', uid], saved)
            queryClient.invalidateQueries({ queryKey: ['prelevements'] })
            queryClient.invalidateQueries({ queryKey: ['labo-home'] })
            setForm(buildForm(saved))
            setEditing(false)
        },
    })

    const createEchantillonMutation = useMutation({
        mutationFn: async () => {
            const savedEchantillon = await echantillonsApi.create({
                demande_id: prelevement.demande_id,
                prelevement_id: prelevement.uid,
                designation: transitionForm.designation,
                date_prelevement: extractIsoDate(prelevement.date_prelevement),
                localisation: transitionForm.localisation || prelevement.zone || '',
                statut: transitionForm.statut || DEFAULT_ECHANTILLON_STATUS,
            })

            for (const code of transitionForm.essai_codes) {
                const essaiType = getEssaiType(code)
                await essaisApi.create({
                    echantillon_id: savedEchantillon.uid,
                    essai_code: code,
                    type_essai: essaiType?.label || code,
                    norme: essaiType?.norme || '',
                    statut: 'Programmé',
                    resultats: essaiType?.init_resultats || '{}',
                    source_label: prelevement.reference || '',
                    source_signature: `prelevement:${prelevement.uid}`,
                })
            }

            return savedEchantillon
        },
        onSuccess: async (savedEchantillon) => {
            setTransitionForm(buildTransitionForm(prelevement))
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['prelevement', uid] }),
                queryClient.invalidateQueries({ queryKey: ['prelevements'] }),
                queryClient.invalidateQueries({ queryKey: ['labo-home'] }),
            ])
            navigateWithReturnTo(navigate, `/echantillons/${savedEchantillon.uid}`, childReturnTo)
        },
    })

    const deleteEchantillonMutation = useMutation({
        mutationFn: (echantillonUid) => echantillonsApi.delete(echantillonUid),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['prelevement', uid] }),
                queryClient.invalidateQueries({ queryKey: ['prelevements'] }),
                queryClient.invalidateQueries({ queryKey: ['labo-home'] }),
            ])
        },
    })

    const statusOptions = useMemo(
        () => [...new Set([...DEFAULT_STATUSES, prelevement?.statut].filter(Boolean))],
        [prelevement?.statut]
    )

    const selectedEssais = useMemo(
        () => TYPES_ESSAI.filter((item) => transitionForm.essai_codes.includes(item.code)),
        [transitionForm.essai_codes]
    )

    function setField(key, value) {
        setForm((current) => ({ ...current, [key]: value }))
    }

    function setTransitionField(key, value) {
        setTransitionForm((current) => ({ ...current, [key]: value }))
    }

    function toggleEssai(code) {
        setTransitionForm((current) => {
            const exists = current.essai_codes.includes(code)
            return {
                ...current,
                essai_codes: exists
                    ? current.essai_codes.filter((item) => item !== code)
                    : [...current.essai_codes, code],
            }
        })
    }

    async function handleDeleteEchantillon(item) {
        const ok = window.confirm(`Supprimer l'échantillon "${item.reference || item.uid}" ? Cette action est irréversible.`)
        if (!ok) return
        deleteEchantillonMutation.mutate(item.uid)
    }

    if (prelevementQuery.isLoading) {
        return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
    }

    if (prelevementQuery.error || !prelevement) {
        return (
            <div className="text-center py-16">
                <p className="text-text-muted text-sm mb-3">Prélèvement introuvable</p>
                <Button onClick={() => navigateBackWithFallback(navigate, searchParams, '/prelevements')}>← Retour</Button>
            </div>
        )
    }

    return (
        <div className={`flex flex-col h-full overflow-y-auto ${deleteMode ? 'bg-red-50' : ''}`}>
            <div className={`flex items-center gap-3 px-6 py-3 border-b border-border shrink-0 flex-wrap ${deleteMode ? 'bg-red-100' : 'bg-surface'}`}>
                <button
                    onClick={() => navigateBackWithFallback(navigate, searchParams, '/prelevements')}
                    className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
                >
                    ← Retour
                </button>
                {prelevement.demande_reference ? <span className="text-[13px] text-text-muted">{prelevement.demande_reference} › </span> : null}
                <span className="text-[14px] font-semibold flex-1 font-mono">{prelevement.reference}</span>
                <Badge s={prelevement.statut} />
                {!editing ? (
                    <>
                        <Button size="sm" variant={deleteMode ? 'danger' : 'secondary'} onClick={() => setDeleteMode((value) => !value)}>
                            {deleteMode ? '✗ Annuler suppression' : '🗑️ Supprimer échantillons'}
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => {
                            setEditing(true)
                            setDeleteMode(false)
                        }}>
                            ✏️ Modifier
                        </Button>
                    </>
                ) : (
                    <>
                        <Button onClick={() => {
                            setForm(buildForm(prelevement))
                            setTransitionForm(buildTransitionForm(prelevement))
                            setEditing(false)
                        }}>
                            Annuler
                        </Button>
                        <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                            {saveMutation.isPending ? '…' : '✓ Enregistrer'}
                        </Button>
                    </>
                )}
            </div>

            <div className={`p-5 max-w-[860px] mx-auto w-full flex flex-col gap-4 ${deleteMode ? 'bg-red-50' : ''}`}>
                {deleteMode ? (
                    <div className="bg-red-100 border border-red-300 rounded-lg p-4">
                        <div className="flex items-center gap-2 text-red-800">
                            <span className="text-lg">⚠️</span>
                            <span className="font-semibold">Mode suppression activé</span>
                        </div>
                        <p className="text-red-700 text-sm mt-1">
                            Cliquez sur supprimer pour retirer un échantillon lié. Une confirmation vous sera demandée.
                        </p>
                    </div>
                ) : null}

                <Card title="Prélèvement">
                    {editing ? (
                        <div className="grid grid-cols-2 gap-3">
                            <FG label="Date prélèvement">
                                <Input type="date" value={form.date_prelevement} onChange={(event) => setField('date_prelevement', event.target.value)} />
                            </FG>
                            <FG label="Date réception labo">
                                <Input type="date" value={form.date_reception_labo} onChange={(event) => setField('date_reception_labo', event.target.value)} />
                            </FG>
                            <FG label="Description">
                                <Input value={form.description} onChange={(event) => setField('description', event.target.value)} />
                            </FG>
                            <FG label="Quantité">
                                <Input value={form.quantite} onChange={(event) => setField('quantite', event.target.value)} />
                            </FG>
                            <FG label="Réceptionnaire">
                                <Input value={form.receptionnaire} onChange={(event) => setField('receptionnaire', event.target.value)} />
                            </FG>
                            <FG label="Statut">
                                <Select value={form.statut} onChange={(event) => setField('statut', event.target.value)} className="w-full">
                                    {statusOptions.map((status) => <option key={status}>{status}</option>)}
                                </Select>
                            </FG>
                            <FG label="Zone">
                                <Input value={form.zone} onChange={(event) => setField('zone', event.target.value)} />
                            </FG>
                            <FG label="Matériau">
                                <Input value={form.materiau} onChange={(event) => setField('materiau', event.target.value)} />
                            </FG>
                            <FG label="Technicien terrain">
                                <Input value={form.technicien} onChange={(event) => setField('technicien', event.target.value)} />
                            </FG>
                            <FG label="Finalité">
                                <Input value={form.finalite} onChange={(event) => setField('finalite', event.target.value)} />
                            </FG>
                            <div className="col-span-2">
                                <FG label="Notes">
                                    <textarea
                                        value={form.notes}
                                        onChange={(event) => setField('notes', event.target.value)}
                                        rows={4}
                                        className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y"
                                    />
                                </FG>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-x-8">
                            <div>
                                <FR label="Référence" value={prelevement.reference} />
                                <FR label="Date prélèvement" value={prelevement.date_prelevement ? formatDate(prelevement.date_prelevement) : ''} />
                                <FR label="Date réception labo" value={prelevement.date_reception_labo ? formatDate(prelevement.date_reception_labo) : ''} />
                                <FR label="Description" value={prelevement.description || prelevement.materiau} />
                                <FR label="Quantité" value={prelevement.quantite} />
                                <FR label="Statut" value={prelevement.statut} />
                            </div>
                            <div>
                                <FR label="Demande" value={prelevement.demande_reference} />
                                <FR label="Affaire" value={prelevement.affaire_reference} />
                                <FR label="Zone" value={prelevement.zone} />
                                <FR label="Matériau" value={prelevement.materiau} />
                                <FR label="Réceptionnaire" value={prelevement.receptionnaire || prelevement.technicien} />
                                <FR label="Notes" value={prelevement.notes} />
                            </div>
                        </div>
                    )}
                </Card>

                {editing ? (
                    <Card title="Passage vers le groupe d'essais">
                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-3">
                                <FG label="Désignation du futur échantillon">
                                    <Input
                                        value={transitionForm.designation}
                                        onChange={(event) => setTransitionField('designation', event.target.value)}
                                        placeholder="ex: Grave 0/31,5 - plateforme"
                                    />
                                </FG>
                                <FG label="Localisation">
                                    <Input
                                        value={transitionForm.localisation}
                                        onChange={(event) => setTransitionField('localisation', event.target.value)}
                                        placeholder="ex: Zone A / poste 2"
                                    />
                                </FG>
                                <FG label="Statut initial du groupe">
                                    <Select
                                        value={transitionForm.statut}
                                        onChange={(event) => setTransitionField('statut', event.target.value)}
                                        className="w-full"
                                    >
                                        {['Reçu', 'En attente', 'En cours', 'Terminé', 'Rejeté'].map((status) => <option key={status}>{status}</option>)}
                                    </Select>
                                </FG>
                                <div className="flex items-end">
                                    <div className="text-[12px] text-text-muted">
                                        Choisis les essais voulus, puis crée le groupe directement depuis ce prélèvement.
                                    </div>
                                </div>
                            </div>

                            <div className="border border-border rounded-lg p-3 bg-bg">
                                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-3">Essais souhaités</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {TYPES_ESSAI.map((essai) => {
                                        const checked = transitionForm.essai_codes.includes(essai.code)
                                        return (
                                            <label
                                                key={essai.code}
                                                className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${checked ? 'border-accent bg-white' : 'border-border bg-white hover:border-accent/40'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleEssai(essai.code)}
                                                    className="mt-0.5 accent-accent"
                                                />
                                                <div className="min-w-0">
                                                    <div className="text-[12px] font-semibold text-text">{essai.code} — {essai.label}</div>
                                                    <div className="text-[11px] text-text-muted">{essai.norme || 'Norme à préciser'}</div>
                                                </div>
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 justify-between rounded-lg border border-[#cfe4f6] bg-[#eef6fd] px-4 py-3">
                                <div>
                                    <div className="text-[12px] font-semibold text-[#185fa5]">Création du groupe</div>
                                    <div className="text-[11px] text-[#185fa5]">
                                        {selectedEssais.length
                                            ? `${selectedEssais.length} essai(s) seront créés avec le groupe.`
                                            : 'Aucun essai précréé. Le groupe sera créé vide.'}
                                    </div>
                                </div>
                                <Button
                                    variant="primary"
                                    onClick={() => createEchantillonMutation.mutate()}
                                    disabled={createEchantillonMutation.isPending || !transitionForm.designation.trim()}
                                >
                                    {createEchantillonMutation.isPending ? '…' : "Créer l'échantillon"}
                                </Button>
                            </div>

                            {selectedEssais.length ? (
                                <div className="text-[12px] text-text-muted">
                                    {selectedEssais.map((essai) => essai.code).join(' · ')}
                                </div>
                            ) : null}

                            {createEchantillonMutation.error ? (
                                <p className="text-danger text-xs px-3 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded">
                                    {createEchantillonMutation.error.message || "Impossible de créer l'échantillon."}
                                </p>
                            ) : null}
                        </div>
                    </Card>
                ) : null}

                <Card title={`Échantillons liés (${prelevement.echantillons?.length || 0})`}>
                    {!prelevement.echantillons?.length ? (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <p className="text-[13px] text-text-muted italic">Aucun échantillon lié à ce prélèvement.</p>
                            {!editing ? (
                                <Button variant="secondary" onClick={() => setEditing(true)}>
                                    Préparer un groupe d'essais
                                </Button>
                            ) : null}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {prelevement.echantillons.map((item) => (
                                <div
                                    key={item.uid}
                                    className={`flex items-center justify-between gap-3 px-4 py-3 border rounded-lg transition-colors ${deleteMode ? 'border-red-300 bg-red-50' : 'border-border hover:border-accent hover:bg-bg cursor-pointer'}`}
                                    onClick={deleteMode ? undefined : () => navigateWithReturnTo(navigate, `/echantillons/${item.uid}`, childReturnTo)}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[12px] font-bold font-mono text-accent">{item.reference}</span>
                                            <Badge s={item.statut} />
                                        </div>
                                        <div className="text-[12px] text-text-muted mt-0.5">{item.designation || 'Sans désignation'}</div>
                                        <div className="text-[11px] text-text-muted mt-1">{item.essai_count || 0} essai(s)</div>
                                    </div>
                                    {deleteMode ? (
                                        <Button
                                            size="sm"
                                            variant="danger"
                                            onClick={() => handleDeleteEchantillon(item)}
                                            disabled={deleteEchantillonMutation.isPending}
                                        >
                                            🗑️ Supprimer
                                        </Button>
                                    ) : (
                                        <span className="text-text-muted text-[12px]">→</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {deleteEchantillonMutation.error ? (
                        <p className="mt-3 text-danger text-xs px-3 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded">
                            {deleteEchantillonMutation.error.message || "Impossible de supprimer l'échantillon."}
                        </p>
                    ) : null}
                </Card>
            </div>
        </div>
    )
}
