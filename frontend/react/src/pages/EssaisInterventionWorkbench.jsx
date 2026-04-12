/**
 * EssaisInterventionWorkbench.jsx
 * Preview workbench to build:
 * essais -> prélèvements -> interventions
 *
 * Intent:
 * - use the essais table as the source of truth for unit acts
 * - first group essais into prélèvements
 * - then group prélèvements into interventions
 *
 * Preview only:
 * - local state
 * - no backend write yet
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { api } from '@/services/api'

function parseObservations(raw) {
    if (!raw || typeof raw !== 'string') return {}
    const trimmed = raw.trim()
    if (!trimmed.startsWith('{')) return {}
    try {
        return JSON.parse(trimmed)
    } catch {
        return {}
    }
}

function classifyNature(row) {
    const explicit =
        row.nature_acte
        || row.acte_type
        || row.category
        || row.kind
        || ''

    if (explicit) return explicit

    const code = String(
        row.essai_code
        || row.code_essai
        || row.code
        || ''
    ).toUpperCase().trim()

    const terrainCodes = new Set(['PL', 'PLD', 'PDL', 'PA', 'INF', 'EA', 'EE', 'PER PO', 'PMT', 'DF', 'DS'])
    if (terrainCodes.has(code)) return 'Essai terrain'

    const label = String(
        row.type_essai
        || row.libelle
        || row.designation
        || ''
    ).toLowerCase()

    if (label.includes('sondage')) return 'Sondage'
    if (label.includes('prélèvement') || label.includes('prelevement')) return 'Prélèvement'
    if (label.includes('terrain') || label.includes('in situ')) return 'Essai terrain'

    return 'Essai'
}

function textOrEmpty(value) {
    return value == null ? '' : String(value)
}

function compactText(value, max = 90) {
    const text = textOrEmpty(value).replace(/\s+/g, ' ').trim()
    if (!text) return ''
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function normalizeRow(row, index) {
    const observations = parseObservations(row.observations || '')
    return {
        uid: row.uid ?? row.id ?? row.essai_id ?? `essai-${index}`,
        reference: row.reference ?? row.numero ?? '',
        date:
            row.date
            || row.date_intervention
            || row.date_debut
            || row.date_prelevement
            || row.created_at
            || '',
        demandeReference:
            row.demande_reference
            || row.demande_ref
            || '',
        echantillonReference:
            row.echantillon_reference
            || row.echantillon_ref
            || row.sample_reference
            || '',
        echantillonId:
            row.echantillon_id
            || row.sample_id
            || '',
        prelevementKey:
            row.prelevement_reference
            || row.prelevement_ref
            || row.prelevement_id
            || '',
        interventionKey:
            row.intervention_key
            || row.intervention_reference
            || row.intervention_ref
            || row.intervention_id
            || '',
        affaire:
            row.affaire_reference
            || row.affaire_ref
            || '',
        chantier:
            row.chantier
            || row.site
            || '',
        client:
            row.client
            || '',
        code:
            row.essai_code
            || row.code_essai
            || row.code
            || '',
        libelle:
            row.type_essai
            || row.libelle
            || row.designation
            || '',
        zone:
            row.zone_intervention
            || observations.zone_intervention
            || row.localisation
            || '',
        technicien:
            row.technicien
            || row.operateur
            || '',
        statut:
            row.statut
            || '',
        nature: classifyNature(row),
        laboratoire:
            row.laboratoire
            || row.labo_code
            || row.labo
            || '',
        finalite:
            observations.finalite_intervention
            || row.finalite
            || '',
        materiau:
            observations.nature_materiau
            || row.materiau
            || row.nature_materiau
            || '',
        objectif:
            observations.objectif_intervention
            || row.sujet
            || row.objectif
            || '',
        notes:
            observations.notes_terrain
            || row.commentaires
            || row.notes
            || '',
    }
}

function compareValues(a, b) {
    const av = a ?? ''
    const bv = b ?? ''
    return String(av).localeCompare(String(bv), 'fr', { numeric: true, sensitivity: 'base' })
}

function inferPrelevementLabel(rows) {
    if (!rows.length) return 'Prélèvement'
    const date = rows.find((row) => row.date)?.date || ''
    const zone = rows.find((row) => row.zone)?.zone || ''
    const materiau = rows.find((row) => row.materiau)?.materiau || ''
    return ['PRL', date, zone || materiau].filter(Boolean).join(' · ')
}

function inferInterventionLabel(rows) {
    if (!rows.length) return 'Intervention'
    const natures = [...new Set(rows.map((row) => row.nature).filter(Boolean))]
    const date = rows.find((row) => row.date)?.date || ''
    const zone = rows.find((row) => row.zone)?.zone || ''
    const naturePart = natures.join(' + ') || 'Intervention'
    return [naturePart, date, zone].filter(Boolean).join(' · ')
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

export default function EssaisInterventionWorkbench() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()

    const demandeId = searchParams.get('demande_id') || ''

    const [rowsState, setRowsState] = useState([])
    const [prelevements, setPrelevements] = useState([])
    const [interventions, setInterventions] = useState([])
    const [selectedIds, setSelectedIds] = useState([])
    const [bulkPrelevementKey, setBulkPrelevementKey] = useState('')
    const [bulkInterventionKey, setBulkInterventionKey] = useState('')
    const [filters, setFilters] = useState({
        q: '',
        demande: '',
        nature: '',
        intervention: 'all',
    })
    const [sort, setSort] = useState({
        key: 'date',
        dir: 'desc',
    })

    const { data: rows = [], isLoading, error, refetch } = useQuery({
        queryKey: ['essais-workbench', demandeId],
        queryFn: async () => {
            const suffix = demandeId ? `?demande_id=${demandeId}` : ''
            return await api.get(`/essais${suffix}`)
        },
    })

    useEffect(() => {
        const normalized = (rows || []).map(normalizeRow)

        const nextPrelevements = buildPrelevements(normalized)
        const nextInterventions = buildInterventions(normalized)

        setRowsState(normalized)
        setPrelevements(nextPrelevements)
        setInterventions(nextInterventions)
        setSelectedIds([])
        setBulkPrelevementKey('')
        setBulkInterventionKey('')
    }, [rows])

    const selectedRows = useMemo(() => {
        const ids = new Set(selectedIds)
        return rowsState.filter((row) => ids.has(String(row.uid)))
    }, [rowsState, selectedIds])

    const filteredRows = useMemo(() => {
        const q = filters.q.trim().toLowerCase()

        let result = rowsState.filter((row) => {
            if (filters.demande && row.demandeReference !== filters.demande) return false
            if (filters.nature && row.nature !== filters.nature) return false
            if (filters.intervention === 'assigned' && !row.interventionKey) return false
            if (filters.intervention === 'unassigned' && row.interventionKey) return false

            if (!q) return true

            const haystack = [
                row.reference,
                row.demandeReference,
                row.echantillonReference,
                row.prelevementKey,
                row.interventionKey,
                row.affaire,
                row.chantier,
                row.client,
                row.code,
                row.libelle,
                row.zone,
                row.technicien,
                row.nature,
                row.finalite,
                row.materiau,
                row.objectif,
                row.notes,
                row.laboratoire,
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

    const demandeOptions = useMemo(() => {
        return [...new Set(rowsState.map((row) => row.demandeReference).filter(Boolean))]
    }, [rowsState])

    const natureOptions = useMemo(() => {
        return [...new Set(rowsState.map((row) => row.nature).filter(Boolean))]
    }, [rowsState])

    const selectedRowsAllHavePrelevement = selectedRows.length > 0 && selectedRows.every((row) => !!row.prelevementKey)

    const selectionSummary = useMemo(() => {
        const natures = [...new Set(selectedRows.map((row) => row.nature).filter(Boolean))]
        const dates = [...new Set(selectedRows.map((row) => row.date).filter(Boolean))]
        const zones = [...new Set(selectedRows.map((row) => row.zone).filter(Boolean))]
        const techs = [...new Set(selectedRows.map((row) => row.technicien).filter(Boolean))]
        const demandes = [...new Set(selectedRows.map((row) => row.demandeReference).filter(Boolean))]
        const echantillons = [...new Set(selectedRows.map((row) => row.echantillonReference).filter(Boolean))]
        const prelevementsKeys = [...new Set(selectedRows.map((row) => row.prelevementKey).filter(Boolean))]

        return {
            count: selectedRows.length,
            natures: natures.join(' + ') || '—',
            dates: dates.join(' | ') || '—',
            zones: zones.join(' | ') || '—',
            techniciens: techs.join(' | ') || '—',
            demandes: demandes.join(' | ') || '—',
            echantillons: echantillons.join(' | ') || '—',
            prelevements: prelevementsKeys.join(' | ') || '—',
        }
    }, [selectedRows])

    function buildPrelevements(nextRows) {
        const byKey = new Map()
        nextRows.forEach((row) => {
            if (!row.prelevementKey) return
            const key = String(row.prelevementKey)
            if (!byKey.has(key)) {
                byKey.set(key, {
                    key,
                    reference: key,
                    rowCount: 0,
                    interventionCount: 0,
                })
            }
            byKey.get(key).rowCount += 1
        })
        const arr = [...byKey.values()]
        arr.forEach((item) => {
            const linkedInterventions = new Set(
                nextRows
                    .filter((row) => String(row.prelevementKey) === String(item.key) && row.interventionKey)
                    .map((row) => row.interventionKey)
            )
            item.interventionCount = linkedInterventions.size
        })
        return arr
    }

    function buildInterventions(nextRows) {
        const byKey = new Map()
        nextRows.forEach((row) => {
            if (!row.interventionKey) return
            const key = String(row.interventionKey)
            if (!byKey.has(key)) {
                byKey.set(key, {
                    key,
                    reference: key,
                    rowCount: 0,
                    prelevementCount: 0,
                })
            }
            byKey.get(key).rowCount += 1
        })
        const arr = [...byKey.values()]
        arr.forEach((item) => {
            const linkedPrelevements = new Set(
                nextRows
                    .filter((row) => String(row.interventionKey) === String(item.key) && row.prelevementKey)
                    .map((row) => row.prelevementKey)
            )
            item.prelevementCount = linkedPrelevements.size
        })
        return arr
    }

    function refreshDerived(nextRows) {
        setPrelevements(buildPrelevements(nextRows))
        setInterventions(buildInterventions(nextRows))
    }

    function setRowPrelevement(uid, prelevementKey) {
        setRowsState((prev) => {
            const next = prev.map((row) => {
                if (String(row.uid) !== String(uid)) return row
                return {
                    ...row,
                    prelevementKey: prelevementKey || '',
                    interventionKey: prelevementKey ? row.interventionKey : '',
                }
            })
            refreshDerived(next)
            return next
        })
    }

    function setRowIntervention(uid, interventionKey) {
        setRowsState((prev) => {
            const next = prev.map((row) => {
                if (String(row.uid) !== String(uid)) return row
                if (!row.prelevementKey) return row
                return {
                    ...row,
                    interventionKey: interventionKey || '',
                }
            })
            refreshDerived(next)
            return next
        })
    }

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

    function createPrelevementFromSelection() {
        if (!selectedRows.length) return

        const nextIndex = prelevements.length + 1
        const reference = `PRL-PREV-${String(nextIndex).padStart(3, '0')}`

        setRowsState((prev) => {
            const ids = new Set(selectedIds)
            const next = prev.map((row) => (
                ids.has(String(row.uid))
                    ? { ...row, prelevementKey: reference, interventionKey: '' }
                    : row
            ))
            refreshDerived(next)
            return next
        })

        setBulkPrelevementKey(reference)
        setBulkInterventionKey('')
    }

    function assignSelectionToExistingPrelevement() {
        if (!selectedRows.length || !bulkPrelevementKey) return

        setRowsState((prev) => {
            const ids = new Set(selectedIds)
            const next = prev.map((row) => (
                ids.has(String(row.uid))
                    ? { ...row, prelevementKey: bulkPrelevementKey, interventionKey: '' }
                    : row
            ))
            refreshDerived(next)
            return next
        })
    }

    function clearSelectionPrelevement() {
        if (!selectedRows.length) return

        setRowsState((prev) => {
            const ids = new Set(selectedIds)
            const next = prev.map((row) => (
                ids.has(String(row.uid))
                    ? { ...row, prelevementKey: '', interventionKey: '' }
                    : row
            ))
            refreshDerived(next)
            return next
        })
    }

    function createInterventionFromSelection() {
        if (!selectedRowsAllHavePrelevement) return

        const nextIndex = interventions.length + 1
        const reference = `INT-PREV-${String(nextIndex).padStart(3, '0')}`

        setRowsState((prev) => {
            const ids = new Set(selectedIds)
            const next = prev.map((row) => (
                ids.has(String(row.uid))
                    ? { ...row, interventionKey: reference }
                    : row
            ))
            refreshDerived(next)
            return next
        })

        setBulkInterventionKey(reference)
    }

    function assignSelectionToExistingIntervention() {
        if (!selectedRowsAllHavePrelevement || !bulkInterventionKey) return

        setRowsState((prev) => {
            const ids = new Set(selectedIds)
            const next = prev.map((row) => (
                ids.has(String(row.uid))
                    ? { ...row, interventionKey: bulkInterventionKey }
                    : row
            ))
            refreshDerived(next)
            return next
        })
    }

    function clearSelectionIntervention() {
        if (!selectedRows.length) return

        setRowsState((prev) => {
            const ids = new Set(selectedIds)
            const next = prev.map((row) => (
                ids.has(String(row.uid))
                    ? { ...row, interventionKey: '' }
                    : row
            ))
            refreshDerived(next)
            return next
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

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-[18px] font-bold">Workbench essais → prélèvements → interventions</h1>
                    <p className="text-[13px] text-text-muted mt-1">
                        Preview pour trier les actes unitaires, les regrouper d’abord en prélèvements, puis seulement après en interventions.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
                        Retour
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => refetch()}>
                        Recharger
                    </Button>
                </div>
            </div>

            <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border bg-bg">
                    <div className="grid grid-cols-[1.4fr_180px_180px_180px] gap-3 items-end">
                        <FieldGroup label="Recherche">
                            <Input
                                value={filters.q}
                                onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                                placeholder="date, demande, code, zone, technicien, matériau…"
                            />
                        </FieldGroup>

                        <FieldGroup label="Demande">
                            <Select
                                value={filters.demande}
                                onChange={(e) => setFilters((prev) => ({ ...prev, demande: e.target.value }))}
                            >
                                <option value="">Toutes</option>
                                {demandeOptions.map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </Select>
                        </FieldGroup>

                        <FieldGroup label="Nature">
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

                <div className="px-4 py-3 border-b border-border bg-white flex flex-wrap items-center gap-3">
                    <span className="text-[12px] text-text-muted">
                        {selectedRows.length} ligne(s) sélectionnée(s)
                    </span>
                </div>

                <div className="px-4 py-3 border-b border-border bg-white flex flex-wrap items-end gap-3">
                    <div className="text-[12px] font-semibold text-text-muted">Étape 1 · Prélèvement</div>

                    <Button
                        size="sm"
                        variant="primary"
                        onClick={createPrelevementFromSelection}
                        disabled={!selectedRows.length}
                    >
                        Créer un prélèvement
                    </Button>

                    <div className="min-w-[240px]">
                        <Select
                            value={bulkPrelevementKey}
                            onChange={(e) => setBulkPrelevementKey(e.target.value)}
                        >
                            <option value="">Attribuer à un prélèvement…</option>
                            {prelevements.map((item) => (
                                <option key={item.key} value={item.key}>
                                    {item.reference} · {item.rowCount} essai(s)
                                </option>
                            ))}
                        </Select>
                    </div>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={assignSelectionToExistingPrelevement}
                        disabled={!selectedRows.length || !bulkPrelevementKey}
                    >
                        Attribuer
                    </Button>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearSelectionPrelevement}
                        disabled={!selectedRows.length}
                    >
                        Retirer du prélèvement
                    </Button>
                </div>

                <div className="px-4 py-3 border-b border-border bg-white flex flex-wrap items-end gap-3">
                    <div className="text-[12px] font-semibold text-text-muted">Étape 2 · Intervention</div>

                    <Button
                        size="sm"
                        variant="primary"
                        onClick={createInterventionFromSelection}
                        disabled={!selectedRowsAllHavePrelevement}
                    >
                        Créer une intervention
                    </Button>

                    <div className="min-w-[240px]">
                        <Select
                            value={bulkInterventionKey}
                            onChange={(e) => setBulkInterventionKey(e.target.value)}
                        >
                            <option value="">Attribuer à une intervention…</option>
                            {interventions.map((item) => (
                                <option key={item.key} value={item.key}>
                                    {item.reference} · {item.prelevementCount} prélèvement(s)
                                </option>
                            ))}
                        </Select>
                    </div>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={assignSelectionToExistingIntervention}
                        disabled={!selectedRowsAllHavePrelevement || !bulkInterventionKey}
                    >
                        Attribuer
                    </Button>

                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={clearSelectionIntervention}
                        disabled={!selectedRows.length}
                    >
                        Retirer de l’intervention
                    </Button>
                </div>

                <div className="px-4 py-3 border-b border-border bg-bg">
                    <div className="grid grid-cols-6 gap-3">
                        <SummaryCard title="Sélection" value={`${selectionSummary.count} ligne(s)`} />
                        <SummaryCard title="Demandes" value={selectionSummary.demandes} />
                        <SummaryCard title="Échantillons" value={selectionSummary.echantillons} />
                        <SummaryCard title="Prélèvements" value={selectionSummary.prelevements} />
                        <SummaryCard title="Natures" value={selectionSummary.natures} />
                        <SummaryCard title="Dates / zones / techs" value={`${selectionSummary.dates} · ${selectionSummary.zones} · ${selectionSummary.techniciens}`} />
                    </div>
                </div>

                <div className="overflow-auto max-h-[62vh]">
                    {isLoading ? (
                        <div className="text-center py-12 text-[13px] text-text-muted">Chargement…</div>
                    ) : error ? (
                        <div className="text-center py-12 text-[13px] text-danger">
                            {error.message || 'Erreur de chargement'}
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
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('echantillonReference')}>Échantillon</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('prelevementKey')}>Prélèvement</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('affaire')}>Affaire / chantier</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('nature')}>Nature</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('code')}>Code / libellé</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('zone')}>Zone / matériau</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('technicien')}>Technicien / finalité</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('laboratoire')}>Labo / statut</th>
                                    <th className="px-3 py-2 text-left">Objectif / notes</th>
                                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => toggleSort('interventionKey')}>Intervention</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row) => (
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
                                        <td className="px-3 py-2 min-w-[150px]">
                                            <div className="font-mono text-[12px]">{row.echantillonReference || '—'}</div>
                                            <div className="text-[11px] text-text-muted">{row.echantillonId ? `id ${row.echantillonId}` : ''}</div>
                                        </td>
                                        <td className="px-3 py-2 min-w-[220px]">
                                            <Select
                                                value={row.prelevementKey}
                                                onChange={(e) => setRowPrelevement(row.uid, e.target.value)}
                                            >
                                                <option value="">—</option>
                                                {prelevements.map((item) => (
                                                    <option key={item.key} value={item.key}>
                                                        {item.reference}
                                                    </option>
                                                ))}
                                            </Select>
                                        </td>
                                        <td className="px-3 py-2 min-w-[180px]">
                                            <div>{row.affaire || '—'}</div>
                                            <div className="text-[11px] text-text-muted">{compactText(row.chantier, 42) || ''}</div>
                                        </td>
                                        <td className="px-3 py-2 min-w-[120px]">{row.nature || '—'}</td>
                                        <td className="px-3 py-2 min-w-[180px]">
                                            <div className="font-mono text-[12px]">{row.code || '—'}</div>
                                            <div className="text-[11px] text-text-muted">{compactText(row.libelle, 48) || ''}</div>
                                        </td>
                                        <td className="px-3 py-2 min-w-[180px]">
                                            <div>{compactText(row.zone, 40) || '—'}</div>
                                            <div className="text-[11px] text-text-muted">{compactText(row.materiau, 40) || ''}</div>
                                        </td>
                                        <td className="px-3 py-2 min-w-[180px]">
                                            <div>{row.technicien || '—'}</div>
                                            <div className="text-[11px] text-text-muted">{compactText(row.finalite, 36) || ''}</div>
                                        </td>
                                        <td className="px-3 py-2 min-w-[140px]">
                                            <div>{row.laboratoire || '—'}</div>
                                            <div className="text-[11px] text-text-muted">{row.statut || ''}</div>
                                        </td>
                                        <td className="px-3 py-2 min-w-[280px]">
                                            <div>{compactText(row.objectif, 90) || '—'}</div>
                                            <div className="text-[11px] text-text-muted mt-1">{compactText(row.notes, 90) || ''}</div>
                                        </td>
                                        <td className="px-3 py-2 min-w-[220px]">
                                            <Select
                                                value={row.interventionKey}
                                                onChange={(e) => setRowIntervention(row.uid, e.target.value)}
                                                disabled={!row.prelevementKey}
                                            >
                                                <option value="">—</option>
                                                {interventions.map((item) => (
                                                    <option key={item.key} value={item.key}>
                                                        {item.reference}
                                                    </option>
                                                ))}
                                            </Select>
                                        </td>
                                    </tr>
                                ))}
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
                                    <div key={item.key} className="border border-border rounded-lg px-3 py-2 bg-bg">
                                        <div className="text-[12px] font-bold text-accent font-mono">{item.reference}</div>
                                        <div className="text-[12px] text-text-muted mt-1">
                                            {item.rowCount} essai(s) · {item.interventionCount} intervention(s)
                                        </div>
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
                        {interventions.length === 0 ? (
                            <p className="text-[13px] text-text-muted italic">
                                Aucune intervention construite pour l’instant.
                            </p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {interventions.map((item) => (
                                    <div key={item.key} className="border border-border rounded-lg px-3 py-2 bg-bg">
                                        <div className="text-[12px] font-bold text-accent font-mono">{item.reference}</div>
                                        <div className="text-[12px] text-text-muted mt-1">
                                            {item.rowCount} essai(s) · {item.prelevementCount} prélèvement(s)
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
