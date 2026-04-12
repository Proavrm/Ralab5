/**
 * InterventionsRequalificationWorkbench.jsx
 * Persistent requalification workbench.
 *
 * This version saves choices through the backend API.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { interventionRequalificationApi } from '@/services/api'

const NATURE_OPTIONS = [
    'Intervention',
    'Prélèvement',
    'Essai terrain',
    'Sondage',
]

const DIRECT_TO_INTERVENTION_NATURES = new Set(['Essai terrain', 'Sondage', 'Intervention'])

function compactText(value, max = 90) {
    const text = String(value || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function compareValues(a, b) {
    const av = a ?? ''
    const bv = b ?? ''
    return String(av).localeCompare(String(bv), 'fr', { numeric: true, sensitivity: 'base' })
}

function getYearFromRow(row) {
    const date = String(row.date_intervention || row.date || '')
    const ref = String(row.reference || '')
    const dateMatch = date.match(/(20\d{2})/)
    if (dateMatch) return dateMatch[1]
    const refMatch = ref.match(/(20\d{2})/)
    if (refMatch) return refMatch[1]
    return ''
}

function canGoDirectToIntervention(row) {
    return DIRECT_TO_INTERVENTION_NATURES.has(row.natureReelle)
}

function needsPrelevement(row) {
    return row.natureReelle === 'Prélèvement'
}

function normalizeRow(row, index) {
    return {
        uid: row.uid ?? row.id ?? `raw-${index}`,
        reference: row.reference || '',
        date: row.date_intervention || row.date || '',
        year: getYearFromRow(row),
        demandeReference: row.demande_reference || row.demande_ref || '',
        client: row.client || '',
        affaire: row.affaire_reference || row.affaire_ref || '',
        chantier: row.chantier || row.site || '',
        typeIntervention: row.type_intervention || '',
        code: row.code || row.essai_code || row.code_essai || '',
        subject: row.sujet || row.subject || '',
        zone: row.zone_intervention || row.zone || '',
        materiau: row.nature_materiau || row.materiau || '',
        technicien: row.technicien || row.operateur || '',
        finalite: row.finalite || '',
        statut: row.statut || '',
        notes: row.notes_terrain || row.notes || row.commentaires || '',
        natureReelle: row.nature_reelle || row.natureReelle || 'Intervention',
        prelevementId: row.prelevement_id ? String(row.prelevement_id) : '',
        prelevementReference: row.prelevement_reference || '',
        interventionReelleId: row.intervention_reelle_id ? String(row.intervention_reelle_id) : '',
        interventionReelleReference: row.intervention_reelle_reference || '',
        triComment: row.tri_comment || row.triComment || '',
    }
}

function FieldGroup({ label, children }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-text-muted">{label}</label>
            {children}
        </div>
    )
}

function SummaryCard({ title, value, hint = '' }) {
    return (
        <div className="border border-border rounded-lg px-3 py-2 bg-bg">
            <div className="text-[10px] uppercase tracking-wide text-text-muted">{title}</div>
            <div className="text-[13px] font-semibold mt-1">{value}</div>
            {hint ? <div className="text-[11px] text-text-muted mt-1">{hint}</div> : null}
        </div>
    )
}

export default function InterventionsRequalificationWorkbench() {
    const navigate = useNavigate()

    const [rowsState, setRowsState] = useState([])
    const [selectedIds, setSelectedIds] = useState([])
    const [bulkNature, setBulkNature] = useState('')
    const [bulkPrelevementId, setBulkPrelevementId] = useState('')
    const [bulkInterventionId, setBulkInterventionId] = useState('')
    const [actionError, setActionError] = useState('')
    const [actionBusy, setActionBusy] = useState('')
    const [filters, setFilters] = useState({
        q: '',
        nature: '',
        year: '2026',
        intervention: 'all',
    })
    const [sort, setSort] = useState({
        key: 'date',
        dir: 'desc',
    })

    const lastSourceSignatureRef = useRef('')

    const {
        data: rawRows = [],
        isLoading: rawLoading,
        error: rawError,
        refetch: refetchRaw,
    } = useQuery({
        queryKey: ['intervention-requalification-raw', filters.year],
        queryFn: async () => interventionRequalificationApi.listRaw({ year: filters.year || '' }),
    })

    const {
        data: prelevements = [],
        refetch: refetchPrelevements,
    } = useQuery({
        queryKey: ['intervention-requalification-prelevements', filters.year],
        queryFn: async () => interventionRequalificationApi.listPrelevements({ year: filters.year || '' }),
    })

    const {
        data: interventionsReelles = [],
        refetch: refetchInterventionsReelles,
    } = useQuery({
        queryKey: ['intervention-requalification-interventions-reelles', filters.year],
        queryFn: async () => interventionRequalificationApi.listInterventionsReelles({ year: filters.year || '' }),
    })

    async function refreshAll() {
        await Promise.all([refetchRaw(), refetchPrelevements(), refetchInterventionsReelles()])
    }

    useEffect(() => {
        const normalized = (rawRows || []).map(normalizeRow)
        const signature = JSON.stringify(
            normalized.map((row) => [
                row.uid,
                row.reference,
                row.date,
                row.natureReelle,
                row.prelevementId,
                row.interventionReelleId,
                row.triComment,
            ])
        )

        if (signature === lastSourceSignatureRef.current) {
            return
        }

        lastSourceSignatureRef.current = signature
        setRowsState(normalized)
        setSelectedIds([])
        setBulkNature('')
        setBulkPrelevementId('')
        setBulkInterventionId('')
    }, [rawRows])

    const yearOptions = useMemo(() => {
        return [...new Set((rawRows || []).map(getYearFromRow).filter(Boolean))].sort()
    }, [rawRows])

    const selectedRows = useMemo(() => {
        const ids = new Set(selectedIds)
        return rowsState.filter((row) => ids.has(String(row.uid)))
    }, [rowsState, selectedIds])

    const filteredRows = useMemo(() => {
        const q = filters.q.trim().toLowerCase()

        const result = rowsState.filter((row) => {
            if (filters.year && row.year !== filters.year) return false
            if (filters.nature && row.natureReelle !== filters.nature) return false
            if (filters.intervention === 'assigned' && !row.interventionReelleId) return false
            if (filters.intervention === 'unassigned' && row.interventionReelleId) return false

            if (!q) return true

            const haystack = [
                row.reference,
                row.demandeReference,
                row.client,
                row.affaire,
                row.chantier,
                row.typeIntervention,
                row.code,
                row.subject,
                row.zone,
                row.materiau,
                row.technicien,
                row.finalite,
                row.statut,
                row.natureReelle,
                row.prelevementReference,
                row.interventionReelleReference,
                row.notes,
                row.triComment,
            ].join(' ').toLowerCase()

            return haystack.includes(q)
        })

        result.sort((a, b) => {
            const left = a[sort.key]
            const right = b[sort.key]
            const cmp = compareValues(left, right)
            return sort.dir === 'asc' ? cmp : -cmp
        })

        return result
    }, [rowsState, filters, sort])

    const natureOptions = useMemo(() => {
        return [...new Set(rowsState.map((row) => row.natureReelle).filter(Boolean))]
    }, [rowsState])

    const selectedRowsNeedPrelevement = selectedRows.length > 0 && selectedRows.every((row) => needsPrelevement(row))
    const selectedRowsReadyForIntervention = selectedRows.length > 0 && selectedRows.every((row) => {
        if (needsPrelevement(row)) return !!row.prelevementId
        return canGoDirectToIntervention(row)
    })

    const selectionSummary = useMemo(() => {
        const natures = [...new Set(selectedRows.map((row) => row.natureReelle).filter(Boolean))]
        const dates = [...new Set(selectedRows.map((row) => row.date).filter(Boolean))]
        const demandes = [...new Set(selectedRows.map((row) => row.demandeReference).filter(Boolean))]
        const prelevementsValues = [...new Set(selectedRows.map((row) => row.prelevementReference).filter(Boolean))]
        const interventionsValues = [...new Set(selectedRows.map((row) => row.interventionReelleReference).filter(Boolean))]
        const directCount = selectedRows.filter((row) => canGoDirectToIntervention(row)).length
        const viaPrelevementCount = selectedRows.filter((row) => needsPrelevement(row)).length
        return {
            count: selectedRows.length,
            natures: natures.join(' | ') || '—',
            dates: dates.join(' | ') || '—',
            demandes: demandes.join(' | ') || '—',
            prelevements: prelevementsValues.join(' | ') || '—',
            interventions: interventionsValues.join(' | ') || '—',
            directCount,
            viaPrelevementCount,
        }
    }, [selectedRows])

    function toggleSelected(uid) {
        setSelectedIds((prev) => {
            const key = String(uid)
            return prev.includes(key)
                ? prev.filter((item) => item !== key)
                : [...prev, key]
        })
    }

    function toggleAllVisible() {
        const visibleIds = filteredRows.map((row) => String(row.uid))
        const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

        if (allSelected) {
            setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
            return
        }

        setSelectedIds((prev) => [...new Set([...prev, ...visibleIds])])
    }

    async function runAction(label, fn) {
        try {
            setActionBusy(label)
            setActionError('')
            await fn()
            await refreshAll()
        } catch (error) {
            setActionError(error.message || 'Erreur inconnue')
        } finally {
            setActionBusy('')
        }
    }

    async function setRowNature(uid, natureReelle) {
        setRowsState((prev) => prev.map((row) => {
            if (String(row.uid) !== String(uid)) return row
            const next = { ...row, natureReelle }
            if (!needsPrelevement(next)) {
                next.prelevementId = ''
                next.prelevementReference = ''
            }
            return next
        }))
        await runAction('row-nature', async () => {
            await interventionRequalificationApi.updateRaw(uid, { nature_reelle: natureReelle })
        })
    }

    async function setRowPrelevement(uid, prelevementId) {
        setRowsState((prev) => prev.map((row) => {
            if (String(row.uid) !== String(uid)) return row
            const selected = prelevements.find((item) => String(item.uid) === String(prelevementId))
            return {
                ...row,
                prelevementId: prelevementId || '',
                prelevementReference: selected?.reference || '',
                interventionReelleId: prelevementId ? row.interventionReelleId : '',
                interventionReelleReference: prelevementId ? row.interventionReelleReference : '',
            }
        }))
        await runAction('row-prelevement', async () => {
            await interventionRequalificationApi.updateRaw(uid, { prelevement_id: prelevementId ? Number(prelevementId) : 0 })
        })
    }

    async function setRowIntervention(uid, interventionReelleId) {
        setRowsState((prev) => prev.map((row) => {
            if (String(row.uid) !== String(uid)) return row
            const selected = interventionsReelles.find((item) => String(item.uid) === String(interventionReelleId))
            return {
                ...row,
                interventionReelleId: interventionReelleId || '',
                interventionReelleReference: selected?.reference || '',
            }
        }))
        await runAction('row-intervention', async () => {
            await interventionRequalificationApi.updateRaw(uid, { intervention_reelle_id: interventionReelleId ? Number(interventionReelleId) : 0 })
        })
    }

    function setRowTriCommentLocal(uid, triComment) {
        setRowsState((prev) => prev.map((row) => (
            String(row.uid) === String(uid)
                ? { ...row, triComment }
                : row
        )))
    }

    async function persistRowTriComment(uid, triComment) {
        await runAction('row-comment', async () => {
            await interventionRequalificationApi.updateRaw(uid, { tri_comment: triComment })
        })
    }

    function toggleSort(key) {
        setSort((prev) => {
            if (prev.key === key) {
                return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
            }
            return { key, dir: 'asc' }
        })
    }

    const selectedRawIds = selectedRows.map((row) => Number(row.uid))

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-[18px] font-bold">Workbench interventions 2026 → requalification</h1>
                    <p className="text-[13px] text-text-muted mt-1">
                        Persistent version. Essai terrain / sondage can go directly to an intervention. Prélèvement goes through prélèvement first.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
                        Retour
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => refreshAll()}>
                        Recharger
                    </Button>
                </div>
            </div>

            {actionError ? (
                <div className="text-danger text-sm border border-red-200 bg-red-50 rounded-lg px-3 py-2">
                    {actionError}
                </div>
            ) : null}

            <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border bg-bg">
                    <div className="grid grid-cols-[1.4fr_180px_180px_180px] gap-3 items-end">
                        <FieldGroup label="Recherche">
                            <Input
                                value={filters.q}
                                onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                                placeholder="date, demande, type, zone, matière, tech…"
                            />
                        </FieldGroup>

                        <FieldGroup label="Année">
                            <Select
                                value={filters.year}
                                onChange={(e) => setFilters((prev) => ({ ...prev, year: e.target.value }))}
                            >
                                <option value="">Toutes</option>
                                {yearOptions.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </Select>
                        </FieldGroup>

                        <FieldGroup label="Nature réelle">
                            <Select
                                value={filters.nature}
                                onChange={(e) => setFilters((prev) => ({ ...prev, nature: e.target.value }))}
                            >
                                <option value="">Toutes</option>
                                {natureOptions.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </Select>
                        </FieldGroup>

                        <FieldGroup label="Intervention">
                            <Select
                                value={filters.intervention}
                                onChange={(e) => setFilters((prev) => ({ ...prev, intervention: e.target.value }))}
                            >
                                <option value="all">Toutes</option>
                                <option value="assigned">Attribuées</option>
                                <option value="unassigned">Non attribuées</option>
                            </Select>
                        </FieldGroup>
                    </div>
                </div>

                <div className="px-4 py-3 border-b border-border bg-white">
                    <div className="text-[12px] text-text-muted">
                        Lignes chargées: <strong>{rowsState.length}</strong> · visibles: <strong>{filteredRows.length}</strong> · sélection: <strong>{selectedRows.length}</strong>
                        {actionBusy ? <span> · action: <strong>{actionBusy}</strong></span> : null}
                    </div>
                </div>

                <div className="px-4 py-3 border-b border-border bg-white flex flex-wrap items-end gap-3">
                    <div className="text-[12px] font-semibold text-text-muted">Étape 0 · Nature réelle</div>

                    <div className="min-w-[240px]">
                        <Select
                            value={bulkNature}
                            onChange={(e) => setBulkNature(e.target.value)}
                        >
                            <option value="">Classer en…</option>
                            {NATURE_OPTIONS.map((item) => (
                                <option key={item} value={item}>{item}</option>
                            ))}
                        </Select>
                    </div>

                    <Button
                        size="sm"
                        variant="primary"
                        onClick={() => runAction('bulk-nature', async () => {
                            await interventionRequalificationApi.bulkNature(selectedRawIds, bulkNature)
                        })}
                        disabled={!selectedRows.length || !bulkNature || !!actionBusy}
                    >
                        Appliquer à la sélection
                    </Button>
                </div>

                <div className="px-4 py-3 border-b border-border bg-white flex flex-wrap items-end gap-3">
                    <div className="text-[12px] font-semibold text-text-muted">Étape 1 · Prélèvement</div>

                    <Button
                        size="sm"
                        variant="primary"
                        onClick={() => runAction('create-prelevement', async () => {
                            await interventionRequalificationApi.createPrelevement({ raw_ids: selectedRawIds })
                        })}
                        disabled={!selectedRowsNeedPrelevement || !!actionBusy}
                    >
                        Créer un prélèvement
                    </Button>

                    <div className="min-w-[260px]">
                        <Select
                            value={bulkPrelevementId}
                            onChange={(e) => setBulkPrelevementId(e.target.value)}
                        >
                            <option value="">Attribuer à un prélèvement…</option>
                            {prelevements.map((item) => (
                                <option key={item.uid} value={item.uid}>
                                    {item.reference} · {item.raw_count} ligne(s)
                                </option>
                            ))}
                        </Select>
                    </div>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runAction('assign-prelevement', async () => {
                            await interventionRequalificationApi.assignPrelevement(selectedRawIds, Number(bulkPrelevementId))
                        })}
                        disabled={!selectedRowsNeedPrelevement || !bulkPrelevementId || !!actionBusy}
                    >
                        Attribuer
                    </Button>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runAction('clear-prelevement', async () => {
                            await interventionRequalificationApi.clearPrelevement(selectedRawIds)
                        })}
                        disabled={!selectedRowsNeedPrelevement || !!actionBusy}
                    >
                        Retirer du prélèvement
                    </Button>

                    <span className="text-[11px] text-text-muted">
                        Réservé aux lignes classées en <strong>Prélèvement</strong>.
                    </span>
                </div>

                <div className="px-4 py-3 border-b border-border bg-white flex flex-wrap items-end gap-3">
                    <div className="text-[12px] font-semibold text-text-muted">Étape 2 · Intervention</div>

                    <Button
                        size="sm"
                        variant="primary"
                        onClick={() => runAction('create-intervention', async () => {
                            await interventionRequalificationApi.createInterventionReelle({ raw_ids: selectedRawIds })
                        })}
                        disabled={!selectedRowsReadyForIntervention || !!actionBusy}
                    >
                        Créer une intervention
                    </Button>

                    <div className="min-w-[260px]">
                        <Select
                            value={bulkInterventionId}
                            onChange={(e) => setBulkInterventionId(e.target.value)}
                        >
                            <option value="">Attribuer à une intervention…</option>
                            {interventionsReelles.map((item) => (
                                <option key={item.uid} value={item.uid}>
                                    {item.reference} · {item.raw_count} ligne(s)
                                </option>
                            ))}
                        </Select>
                    </div>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runAction('assign-intervention', async () => {
                            await interventionRequalificationApi.assignInterventionReelle(selectedRawIds, Number(bulkInterventionId))
                        })}
                        disabled={!selectedRowsReadyForIntervention || !bulkInterventionId || !!actionBusy}
                    >
                        Attribuer
                    </Button>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runAction('clear-intervention', async () => {
                            await interventionRequalificationApi.clearInterventionReelle(selectedRawIds)
                        })}
                        disabled={!selectedRows.length || !!actionBusy}
                    >
                        Retirer de l’intervention
                    </Button>

                    <span className="text-[11px] text-text-muted">
                        Essai terrain / sondage peuvent y aller <strong>directement</strong>. Prélèvement seulement <strong>après</strong> attribution à un prélèvement.
                    </span>
                </div>

                <div className="px-4 py-3 border-b border-border bg-bg">
                    <div className="grid grid-cols-6 gap-3">
                        <SummaryCard title="Sélection" value={`${selectionSummary.count} ligne(s)`} />
                        <SummaryCard title="Demandes" value={selectionSummary.demandes} />
                        <SummaryCard title="Natures" value={selectionSummary.natures} />
                        <SummaryCard title="Dates" value={selectionSummary.dates} />
                        <SummaryCard title="Direct intervention" value={`${selectionSummary.directCount}`} />
                        <SummaryCard title="Via prélèvement" value={`${selectionSummary.viaPrelevementCount}`} />
                    </div>
                </div>

                <div className="overflow-auto max-h-[62vh]">
                    {rawLoading ? (
                        <div className="text-center py-12 text-[13px] text-text-muted">Chargement…</div>
                    ) : rawError ? (
                        <div className="text-center py-12 text-[13px] text-danger">
                            {rawError.message || 'Erreur de chargement'}
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 z-10 bg-bg border-b border-border">
                                <tr>
                                    <th className="px-3 py-2 text-left w-[40px]">
                                        <input
                                            type="checkbox"
                                            checked={
                                                filteredRows.length > 0 &&
                                                filteredRows.every((row) => selectedIds.includes(String(row.uid)))
                                            }
                                            onChange={toggleAllVisible}
                                        />
                                    </th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('date')}>Date</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('demandeReference')}>Demande / client</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('affaire')}>Affaire / chantier</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('typeIntervention')}>Type actuel</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('natureReelle')}>Nature réelle</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('zone')}>Zone / matériau</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('technicien')}>Technicien / finalité</th>
                                    <th className="px-3 py-2 text-left">Sujet / notes</th>
                                    <th className="px-3 py-2 text-left">Prélèvement</th>
                                    <th className="px-3 py-2 text-left">Intervention</th>
                                    <th className="px-3 py-2 text-left">Commentaire tri</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row) => {
                                    const direct = canGoDirectToIntervention(row)
                                    const needPrel = needsPrelevement(row)
                                    return (
                                        <tr key={row.uid} className="border-b border-border hover:bg-bg align-top">
                                            <td className="px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(String(row.uid))}
                                                    onChange={() => toggleSelected(row.uid)}
                                                />
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">{row.date || '—'}</td>
                                            <td className="px-3 py-2 min-w-[180px]">
                                                <div className="font-mono text-[12px]">{row.demandeReference || '—'}</div>
                                                <div className="text-[11px] text-text-muted">{compactText(row.client, 32) || ''}</div>
                                                <div className="text-[11px] text-text-muted">{row.reference || ''}</div>
                                            </td>
                                            <td className="px-3 py-2 min-w-[180px]">
                                                <div>{row.affaire || '—'}</div>
                                                <div className="text-[11px] text-text-muted">{compactText(row.chantier, 42) || ''}</div>
                                            </td>
                                            <td className="px-3 py-2 min-w-[160px]">
                                                <div>{row.typeIntervention || '—'}</div>
                                                <div className="text-[11px] text-text-muted">{row.code || ''}</div>
                                            </td>
                                            <td className="px-3 py-2 min-w-[170px]">
                                                <Select
                                                    value={row.natureReelle}
                                                    onChange={(e) => setRowNature(row.uid, e.target.value)}
                                                >
                                                    {NATURE_OPTIONS.map((item) => (
                                                        <option key={item} value={item}>{item}</option>
                                                    ))}
                                                </Select>
                                                <div className="text-[11px] text-text-muted mt-1">
                                                    {needPrel ? 'Via prélèvement' : direct ? 'Direct intervention' : 'À trier'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 min-w-[180px]">
                                                <div>{compactText(row.zone, 40) || '—'}</div>
                                                <div className="text-[11px] text-text-muted">{compactText(row.materiau, 40) || ''}</div>
                                            </td>
                                            <td className="px-3 py-2 min-w-[180px]">
                                                <div>{row.technicien || '—'}</div>
                                                <div className="text-[11px] text-text-muted">{compactText(row.finalite, 36) || ''}</div>
                                            </td>
                                            <td className="px-3 py-2 min-w-[260px]">
                                                <div>{compactText(row.subject, 90) || '—'}</div>
                                                <div className="text-[11px] text-text-muted mt-1">{compactText(row.notes, 90) || ''}</div>
                                                <div className="text-[11px] text-text-muted mt-1">{row.statut || ''}</div>
                                            </td>
                                            <td className="px-3 py-2 min-w-[220px]">
                                                <Select
                                                    value={needPrel ? row.prelevementId : ''}
                                                    onChange={(e) => setRowPrelevement(row.uid, e.target.value)}
                                                    disabled={!needPrel || !!actionBusy}
                                                >
                                                    <option value="">—</option>
                                                    {prelevements.map((item) => (
                                                        <option key={item.uid} value={item.uid}>
                                                            {item.reference}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </td>
                                            <td className="px-3 py-2 min-w-[220px]">
                                                <Select
                                                    value={row.interventionReelleId}
                                                    onChange={(e) => setRowIntervention(row.uid, e.target.value)}
                                                    disabled={needPrel ? !row.prelevementId || !!actionBusy : !direct || !!actionBusy}
                                                >
                                                    <option value="">—</option>
                                                    {interventionsReelles.map((item) => (
                                                        <option key={item.uid} value={item.uid}>
                                                            {item.reference}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </td>
                                            <td className="px-3 py-2 min-w-[220px]">
                                                <Input
                                                    value={row.triComment}
                                                    onChange={(e) => setRowTriCommentLocal(row.uid, e.target.value)}
                                                    onBlur={(e) => persistRowTriComment(row.uid, e.target.value)}
                                                    placeholder="Pourquoi ce tri ?"
                                                />
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-bg">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Prélèvements construits</span>
                    </div>

                    <div className="p-4">
                        {prelevements.length === 0 ? (
                            <p className="text-[13px] text-text-muted italic">
                                Aucun prélèvement construit pour l’instant.
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {prelevements.map((item) => (
                                    <div key={item.uid} className="border border-border rounded-lg px-3 py-2 bg-bg">
                                        <div className="text-[12px] font-bold text-accent font-mono">{item.reference}</div>
                                        <div className="text-[12px] text-text-muted mt-1">{item.raw_count} ligne(s)</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-bg">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Interventions construites</span>
                    </div>

                    <div className="p-4">
                        {interventionsReelles.length === 0 ? (
                            <p className="text-[13px] text-text-muted italic">
                                Aucune intervention construite pour l’instant.
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {interventionsReelles.map((item) => (
                                    <div key={item.uid} className="border border-border rounded-lg px-3 py-2 bg-bg">
                                        <div className="text-[12px] font-bold text-accent font-mono">{item.reference}</div>
                                        <div className="text-[12px] text-text-muted mt-1">
                                            {item.raw_count} ligne(s) · {item.prelevement_count} prélèvement(s)
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
