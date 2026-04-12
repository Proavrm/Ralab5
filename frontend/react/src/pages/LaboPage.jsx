/**
 * LaboPage.jsx
 * Global laboratory search page for interventions, echantillons and essais.
 * This page is a transverse search/consultation page, not the detailed métier page.
 */

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Input, { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { RefreshCw, Search, FlaskConical, Package, Truck, TestTube2, X } from 'lucide-react'
import { buildLocationTarget, navigateWithReturnTo } from '@/lib/detailNavigation'
import { getPrelevementReferenceDate, normalizePrelevement, prelevementHasArrival, prelevementIsReadyForLab, prelevementIsUnexpectedArrival, prelevementNeedsReceptionCompletion } from '@/lib/prelevements'
import { interventionsApi, echantillonsApi, essaisApi, prelevementsApi } from '@/services/api'

const TABS = [
    { key: 'interventions', label: 'Interventions', icon: Truck },
    { key: 'prelevements', label: 'Prélèvements', icon: Package },
    { key: 'echantillons', label: 'Échantillons', icon: FlaskConical },
    { key: 'essais', label: 'Essais', icon: TestTube2 },
]

const DEFAULT_SORT = {
    interventions: { key: 'date', dir: 'desc' },
    prelevements: { key: 'date', dir: 'desc' },
    echantillons: { key: 'date', dir: 'desc' },
    essais: { key: 'reference', dir: 'asc' },
}

const LABO_OPTIONS = ['AUV', 'SP', 'PT', 'CLM', 'CHB']
const LABO_ESSAI_ACTIVE_STATUS = '__active__'

function normalizeFilterText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function normalizeCode(value) {
    return String(value || '').trim().toUpperCase()
}

function hasCodeMarker(value, code) {
    const upper = String(value || '').trim().toUpperCase()
    if (!upper || !code) return false
    return upper === code
        || upper.includes(`-${code}-`)
        || upper.startsWith(`${code}-`)
        || upper.endsWith(`-${code}`)
}

function matchesLaboCode(code, ...values) {
    const normalizedCode = normalizeCode(code)
    if (!normalizedCode) return true

    return values.some((value) => {
        if (!value) return false
        if (hasCodeMarker(value, normalizedCode)) return true
        return normalizeFilterText(value).includes(normalizeFilterText(normalizedCode))
    })
}

function StatCard({ label, value, hint }) {
    return (
        <div className="bg-surface border border-border rounded-xl px-4 py-3 min-w-[180px]">
            <div className="text-[11px] uppercase tracking-[.06em] text-text-muted font-semibold">
                {label}
            </div>
            <div className="mt-1 text-2xl font-bold text-text">
                {value}
            </div>
            <div className="mt-1 text-xs text-text-muted">
                {hint}
            </div>
        </div>
    )
}

function TabButton({ active, icon: Icon, label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm transition-colors ${
                active
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-text border-border hover:bg-bg'
            }`}
        >
            <Icon size={15} />
            <span>{label}</span>
        </button>
    )
}

function EmptyState({ title, message }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-surface border border-border rounded-xl">
            <div className="text-4xl mb-3">🧪</div>
            <div className="text-sm font-semibold text-text">{title}</div>
            <div className="text-xs text-text-muted mt-1 max-w-[520px]">
                {message}
            </div>
        </div>
    )
}

function SortHeader({ col, sortKey, sortDir, onSort }) {
    const active = sortKey === col.key
    const arrow = !active ? '↕' : sortDir === 'asc' ? '↑' : '↓'

    return (
        <button
            type="button"
            onClick={() => onSort(col.key)}
            className="inline-flex items-center gap-1 hover:text-text transition-colors"
            title={col.sortable === false ? '' : 'Trier'}
            disabled={col.sortable === false}
        >
            <span>{col.label}</span>
            {col.sortable === false ? null : (
                <span className={`text-[10px] ${active ? 'text-accent' : 'text-text-muted'}`}>
                    {arrow}
                </span>
            )}
        </button>
    )
}

function TableShell({ columns, rows, renderRow, sortKey, sortDir, onSort }) {
    if (!rows.length) {
        return null
    }

    return (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-[calc(100vh-340px)]">
                <table className="w-full border-collapse text-sm min-w-[980px]">
                    <thead className="sticky top-0 z-10">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className="bg-bg px-3.5 py-2.5 text-left text-[11px] font-medium text-text-muted border-b border-border whitespace-nowrap"
                                >
                                    <SortHeader
                                        col={col}
                                        sortKey={sortKey}
                                        sortDir={sortDir}
                                        onSort={onSort}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(renderRow)}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function DetailField({ label, value, mono = false }) {
    const empty = value === null || value === undefined || value === ''
    return (
        <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-text-muted uppercase tracking-[.04em]">{label}</label>
            {empty ? (
                <span className="text-[13px] text-text-muted italic">—</span>
            ) : (
                <span className={`text-[13px] ${mono ? 'font-mono' : ''}`}>{value}</span>
            )}
        </div>
    )
}

function DetailSection({ title, children }) {
    return (
        <div className="flex flex-col gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted border-b border-border pb-1">
                {title}
            </div>
            {children}
        </div>
    )
}

function ActionFooterButton({ label, onClick, disabled = false, tone = 'secondary' }) {
    const base = 'inline-flex items-center justify-center px-3 py-2 rounded-lg text-xs font-medium border transition-colors'
    const tones = {
        primary: 'bg-accent text-white border-accent hover:brightness-95',
        secondary: 'bg-white text-text border-border hover:bg-bg',
        muted: 'bg-bg text-text-muted border-border hover:bg-white',
    }
    const disabledClasses = 'bg-bg text-text-muted/60 border-border cursor-not-allowed'
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`${base} ${disabled ? disabledClasses : (tones[tone] || tones.secondary)}`}
        >
            {label}
        </button>
    )
}


function LaboDetailPanel({
    tab,
    item,
    onClose,
    onOpenFiche,
    onOpenEchantillonFiche,
    onOpenDemande,
    onCreateIntervention,
    onCreateEssai,
    onOpenPreparationPreview,
    onOpenInterventionPreview,
}) {
    if (!item) return null

    const showCreateIntervention = !!item.demande_id && (tab === 'interventions' || tab === 'essais')
    const showCreateEssai = !!item.echantillon_id
    const showPreparationPreview = !!item.demande_id
    const showInterventionPreview = tab === 'interventions'

    return (
        <div className="w-[360px] min-w-[320px] bg-surface border-l border-border flex flex-col overflow-y-auto shrink-0">
            <div className="flex items-start justify-between gap-3 px-[18px] py-4 border-b border-border shrink-0">
                <div>
                    <div className="text-[15px] font-semibold text-text">
                        {tab === 'interventions' ? 'Intervention' : tab === 'prelevements' ? 'Prélèvement' : tab === 'echantillons' ? 'Échantillon' : 'Essai'}
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                        {tab === 'essais'
                            ? (item.reference || item.display_code || '—')
                            : (item.reference || '—')}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#f1efe8] text-[#5f5e5a]">
                        {item.statut || '—'}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1 rounded text-text-muted hover:bg-bg"
                        title="Fermer"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div className="px-[18px] py-4 flex-1 flex flex-col gap-4">
                {tab === 'interventions' ? (
                    <>
                        <DetailSection title="Identification">
                            <DetailField label="Référence" value={item.reference} mono />
                            <DetailField label="Code essai" value={item.essai_code} />
                            <DetailField label="Date" value={item.date} />
                        </DetailSection>
                        <DetailSection title="Contexte">
                            <DetailField label="Demande" value={item.demande_reference} mono />
                            <DetailField label="Affaire" value={item.affaire_reference} mono />
                            <DetailField label="Chantier" value={item.chantier} />
                            <DetailField label="Site" value={item.site} />
                        </DetailSection>
                        <DetailSection title="Organisation">
                            <DetailField label="Labo" value={item.labo_code} />
                            <DetailField label="Année" value={item.year} />
                        </DetailSection>
                    </>
                ) : tab === 'prelevements' ? (
                    <>
                        <DetailSection title="Identification">
                            <DetailField label="Référence" value={item.reference} mono />
                            <DetailField label="Réception / prélèvement" value={item.date_display || item.date} />
                            <DetailField label="Quantité" value={item.quantite} />
                            <DetailField label="Réceptionnaire" value={item.receptionnaire} />
                        </DetailSection>
                        <DetailSection title="Contexte">
                            <DetailField label="Demande" value={item.demande_reference} mono />
                            <DetailField label="Affaire" value={item.affaire_reference} mono />
                            <DetailField label="Intervention liée" value={item.intervention_reference} mono />
                            <DetailField label="Chantier" value={item.chantier} />
                            <DetailField label="Description" value={item.description} />
                        </DetailSection>
                        <DetailSection title="Organisation">
                            <DetailField label="Labo" value={item.labo_code} />
                            <DetailField label="Zone" value={item.zone} />
                            <DetailField label="Matériau" value={item.materiau} />
                            <DetailField label="Groupes essais" value={item.echantillon_count} />
                            <DetailField label="Essais" value={item.essai_count} />
                            <DetailField label="Statut source" value={item.statut_source} />
                        </DetailSection>
                    </>
                ) : tab === 'echantillons' ? (
                    <>
                        <DetailSection title="Identification">
                            <DetailField label="Référence" value={item.reference} mono />
                            <DetailField label="Code" value={item.essai_code} />
                            <DetailField label="Réception / Prélèvement" value={item.date_display || item.date} />
                            <DetailField label="Date de prélèvement" value={item.date_prelevement} />
                            <DetailField label="Date de réception labo" value={item.date_reception_labo} />
                        </DetailSection>
                        <DetailSection title="Contexte">
                            <DetailField label="Demande" value={item.demande_reference} mono />
                            <DetailField label="Affaire" value={item.affaire_reference} mono />
                            <DetailField label="Nature / matériau" value={item.nature} />
                            <DetailField label="Chantier" value={item.chantier} />
                            <DetailField label="Site" value={item.site} />
                        </DetailSection>
                        <DetailSection title="Organisation">
                            <DetailField label="Labo" value={item.labo_code} />
                            <DetailField label="Année" value={item.year} />
                        </DetailSection>
                    </>
                ) : (
                    <>
                        <DetailSection title="Identification">
                            <DetailField label="Référence" value={item.reference} mono />
                            <DetailField label="Code" value={item.display_code || item.essai_code} />
                            <DetailField label="Libellé" value={item.display_label} />
                            <DetailField label="Date" value={item.date} />
                        </DetailSection>
                        <DetailSection title="Rattachement">
                            <DetailField label="Échantillon lié" value={item.echantillon_reference} mono />
                            <DetailField label="Demande liée" value={item.demande_reference} mono />
                            <DetailField label="Affaire" value={item.affaire_reference} mono />
                            <DetailField label="Chantier" value={item.chantier} />
                            <DetailField label="Site" value={item.site} />
                        </DetailSection>
                        <DetailSection title="Organisation">
                            <DetailField label="Labo" value={item.labo_code} />
                            <DetailField label="Type essai" value={item.type_essai} />
                            <DetailField label="Année" value={item.year} />
                        </DetailSection>
                    </>
                )}
            </div>

            <div className="px-[18px] py-3.5 border-t border-border flex flex-col gap-2 shrink-0 bg-bg/40">
                <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">
                    Actions
                </div>
                <div className="flex flex-wrap gap-2">
                    {tab !== 'echantillons' && (
                        <ActionFooterButton label={tab === 'prelevements' ? '📦 Fiche prélèvement' : '📄 Fiche'} onClick={onOpenFiche} tone="primary" />
                    )}
                    {tab === 'echantillons' && (
                        <ActionFooterButton label="🧪 Fiche échantillon" onClick={onOpenEchantillonFiche} tone="primary" />
                    )}
                    <ActionFooterButton
                        label="📁 Demande"
                        onClick={onOpenDemande}
                        disabled={!item.demande_id}
                        tone="secondary"
                    />
                    {showPreparationPreview && (
                        <ActionFooterButton
                            label="🧰 Préparation preview"
                            onClick={onOpenPreparationPreview}
                            tone="muted"
                        />
                    )}
                    {showInterventionPreview && (
                        <ActionFooterButton
                            label="🛠️ Intervention preview"
                            onClick={onOpenInterventionPreview}
                            tone="muted"
                        />
                    )}
                    {showCreateIntervention && (
                        <ActionFooterButton
                            label="➕ Nouvelle intervention"
                            onClick={onCreateIntervention}
                            tone="secondary"
                        />
                    )}
                    {showCreateEssai && (
                        <ActionFooterButton
                            label="🧪 Nouvel essai"
                            onClick={onCreateEssai}
                            tone="secondary"
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

function InterventionsView({ rows, sortKey, sortDir, onSort, selectedUid, onSelect, onOpen }) {
    const columns = [
        { key: 'reference', label: 'Référence' },
        { key: 'essai_code', label: 'Code essai' },
        { key: 'date', label: 'Date' },
        { key: 'demande_reference', label: 'Demande liée' },
        { key: 'affaire_reference', label: 'Affaire' },
        { key: 'chantier', label: 'Chantier / Site' },
        { key: 'statut', label: 'Statut' },
    ]

    if (!rows.length) {
        return (
            <EmptyState
                title="Interventions"
                message="Aucune intervention trouvée pour les filtres actuels."
            />
        )
    }

    return (
        <TableShell
            columns={columns}
            rows={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            renderRow={(row) => {
                const isSelected = row.uid === selectedUid
                return (
                    <tr
                        key={row.uid}
                        className={`border-b border-border cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#eef5ff]' : 'hover:bg-[#f8f8fc]'
                        }`}
                        onClick={() => onSelect(row.uid)}
                        onDoubleClick={() => onOpen(row.uid)}
                    >
                        <td className="px-3.5 py-2.5 text-xs font-semibold text-accent">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onOpen(row.uid)
                                }}
                                className="hover:underline"
                            >
                                {row.reference || '—'}
                            </button>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">{row.essai_code || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.date || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.demande_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.affaire_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.chantier || row.site || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.statut || '—'}</td>
                    </tr>
                )
            }}
        />
    )
}

function EchantillonsView({ rows, sortKey, sortDir, onSort, selectedUid, onSelect, onOpen }) {
    const columns = [
        { key: 'reference', label: 'Référence' },
        { key: 'essai_code', label: 'Code' },
        { key: 'date', label: 'Réception / Prélèvement' },
        { key: 'demande_reference', label: 'Demande liée' },
        { key: 'affaire_reference', label: 'Affaire' },
        { key: 'nature', label: 'Nature / Matériau' },
        { key: 'statut', label: 'Statut' },
    ]

    if (!rows.length) {
        return (
            <EmptyState
                title="Échantillons"
                message="Aucun échantillon trouvé pour les filtres actuels."
            />
        )
    }

    return (
        <TableShell
            columns={columns}
            rows={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            renderRow={(row) => {
                const isSelected = row.uid === selectedUid
                return (
                    <tr
                        key={row.uid}
                        className={`border-b border-border cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#eef5ff]' : 'hover:bg-[#f8f8fc]'
                        }`}
                        onClick={() => onSelect(row.uid)}
                        onDoubleClick={() => onOpen(row.uid)}
                    >
                        <td className="px-3.5 py-2.5 text-xs font-semibold text-accent">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onOpen(row.uid)
                                }}
                                className="hover:underline"
                            >
                                {row.reference || '—'}
                            </button>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">{row.essai_code || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.date_display || row.date || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.demande_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.affaire_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.nature || row.material || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.statut || '—'}</td>
                    </tr>
                )
            }}
        />
    )
}

function PrelevementsView({ rows, sortKey, sortDir, onSort, selectedUid, onSelect, onOpen }) {
    const columns = [
        { key: 'reference', label: 'Référence' },
        { key: 'date', label: 'Réception / Prélèvement' },
        { key: 'demande_reference', label: 'Demande liée' },
        { key: 'intervention_reference', label: 'Intervention liée' },
        { key: 'chantier', label: 'Chantier / Site' },
        { key: 'description', label: 'Description' },
        { key: 'echantillon_count', label: 'Groupes essais' },
        { key: 'essai_count', label: 'Essais' },
        { key: 'statut', label: 'Statut' },
    ]

    if (!rows.length) {
        return (
            <EmptyState
                title="Prélèvements"
                message="Aucun prélèvement trouvé pour les filtres actuels."
            />
        )
    }

    return (
        <TableShell
            columns={columns}
            rows={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            renderRow={(row) => {
                const isSelected = row.uid === selectedUid
                return (
                    <tr
                        key={row.uid}
                        className={`border-b border-border cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#eef5ff]' : 'hover:bg-[#f8f8fc]'
                        }`}
                        onClick={() => onSelect(row.uid)}
                        onDoubleClick={() => onOpen(row.uid)}
                    >
                        <td className="px-3.5 py-2.5 text-xs font-semibold text-accent">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onOpen(row.uid)
                                }}
                                className="hover:underline"
                            >
                                {row.reference || '—'}
                            </button>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">{row.date_display || row.date || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.demande_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.intervention_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.chantier || row.site || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.description || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.echantillon_count ?? 0}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.essai_count ?? 0}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.statut || '—'}</td>
                    </tr>
                )
            }}
        />
    )
}

function EssaisView({ rows, sortKey, sortDir, onSort, selectedUid, onSelect, onOpen }) {
    const columns = [
        { key: 'reference', label: 'Référence' },
        { key: 'display_code', label: 'Code' },
        { key: 'display_label', label: 'Libellé' },
        { key: 'echantillon_reference', label: 'Échantillon lié' },
        { key: 'demande_reference', label: 'Demande liée' },
        { key: 'affaire_reference', label: 'Affaire' },
        { key: 'chantier', label: 'Chantier / Site' },
        { key: 'statut', label: 'Statut' },
        { key: 'date', label: 'Date' },
    ]

    if (!rows.length) {
        return (
            <EmptyState
                title="Essais"
                message="Aucun essai trouvé pour les filtres actuels."
            />
        )
    }

    return (
        <TableShell
            columns={columns}
            rows={rows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            renderRow={(row) => {
                const isSelected = row.uid === selectedUid
                return (
                    <tr
                        key={row.uid}
                        className={`border-b border-border cursor-pointer transition-colors ${
                            isSelected ? 'bg-[#eef5ff]' : 'hover:bg-[#f8f8fc]'
                        }`}
                        onClick={() => onSelect(row.uid)}
                        onDoubleClick={() => onOpen(row.uid)}
                    >
                        <td className="px-3.5 py-2.5 text-xs font-semibold text-accent">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation()
                                    onOpen(row.uid)
                                }}
                                className="hover:underline"
                            >
                                {row.reference || '—'}
                            </button>
                        </td>
                        <td className="px-3.5 py-2.5 text-xs">{row.display_code || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.display_label || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.echantillon_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.demande_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.affaire_reference || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.chantier || row.site || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.statut || '—'}</td>
                        <td className="px-3.5 py-2.5 text-xs">{row.date || '—'}</td>
                    </tr>
                )
            }}
        />
    )
}

function normalizeInterventions(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
        const rawDate = row.date ?? row.date_intervention ?? row.date_prevue ?? row.created_at ?? ''
        return {
            uid: row.uid ?? row.id ?? row.intervention_id ?? `intervention-${index}`,
            reference: row.reference ?? row.numero ?? row.code ?? row.libelle ?? '—',
            date: rawDate,
            demande_id: row.demande_id ?? null,
            affaire_rst_id: row.affaire_rst_id ?? null,
            demande_reference: row.demande_reference ?? row.demande_ref ?? row.reference_demande ?? '—',
            affaire_reference: row.affaire_reference ?? row.affaire_ref ?? row.reference_affaire ?? '—',
            essai_code: row.essai_code ?? row.code_essai ?? row.essaiCode ?? '',
            chantier: row.chantier ?? row.affaire_chantier ?? '',
            site: row.site ?? row.affaire_site ?? '',
            client: row.client ?? row.affaire_client ?? '',
            responsable_affaire: row.responsable_affaire ?? row.affaire_responsable ?? '',
            statut: row.statut ?? row.status ?? '—',
            labo_code: row.labo_code ?? row.labo ?? '',
            year: row.year ?? row.annee ?? (rawDate ? String(rawDate).slice(0, 4) : ''),
        }
    })
}

function normalizeEchantillons(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
        const datePrelevement = row.date_prelevement ?? ''
        const dateReceptionLabo = row.date_reception_labo ?? row.date_reception ?? ''
        const rawDate = datePrelevement || (row.date ?? dateReceptionLabo ?? row.created_at ?? '')
        const dateDisplay =
            row.date_display
            ?? (
                dateReceptionLabo && datePrelevement
                    ? `${dateReceptionLabo} / ${datePrelevement}`
                    : (dateReceptionLabo || datePrelevement || row.date || '')
            )

        return {
            uid: row.uid ?? row.id ?? row.echantillon_id ?? `echantillon-${index}`,
            reference: row.reference ?? row.numero ?? row.code ?? row.libelle ?? '—',
            date: rawDate,
            date_display: dateDisplay,
            date_prelevement: datePrelevement,
            date_reception_labo: dateReceptionLabo,
            demande_id: row.demande_id ?? null,
            affaire_rst_id: row.affaire_rst_id ?? null,
            demande_reference: row.demande_reference ?? row.demande_ref ?? row.reference_demande ?? '—',
            affaire_reference: row.affaire_reference ?? row.affaire_ref ?? row.reference_affaire ?? '—',
            essai_code: row.essai_code ?? row.code_essai ?? row.source_essai_code ?? row.essaiCode ?? '',
            chantier: row.chantier ?? row.affaire_chantier ?? '',
            site: row.site ?? row.affaire_site ?? '',
            nature: row.nature ?? row.nature_materiau ?? row.materiau ?? row.material ?? row.type_materiau ?? '',
            statut: row.statut ?? row.status ?? '—',
            labo_code: row.labo_code ?? row.labo ?? '',
            year: row.year ?? row.annee ?? (datePrelevement ? String(datePrelevement).slice(0, 4) : (rawDate ? String(rawDate).slice(0, 4) : '')),
        }
    })
}

function getPrelevementWorkflowStatus(row) {
    if (prelevementIsUnexpectedArrival(row)) return 'Arbitrage'
    if (prelevementNeedsReceptionCompletion(row)) return 'À compléter'
    if (prelevementIsReadyForLab(row)) return 'Prêt labo'
    if (prelevementHasArrival(row)) return 'Arrivage'
    return row.status || 'À trier'
}

function normalizePrelevements(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
        const normalized = normalizePrelevement(row, index)
        const referenceDate = getPrelevementReferenceDate(normalized)
        const dateDisplay = normalized.storedReceptionDate && normalized.samplingDate
            ? `${normalized.storedReceptionDate} / ${normalized.samplingDate}`
            : (normalized.receptionDate || normalized.samplingDate || '')

        return {
            uid: normalized.uid,
            reference: normalized.reference,
            date: referenceDate,
            date_display: dateDisplay,
            demande_id: normalized.demandeId ?? null,
            demande_reference: normalized.demandeReference || '—',
            affaire_reference: normalized.affaireReference || '—',
            intervention_reference: normalized.interventionReference || '—',
            chantier: normalized.chantier || normalized.site || '',
            site: normalized.site || '',
            description: normalized.description || normalized.materiau || '',
            quantite: normalized.quantite || '',
            receptionnaire: normalized.receptionnaire || normalized.receptionOwner || '',
            zone: normalized.zone || '',
            materiau: normalized.materiau || '',
            technicien: normalized.technicien || '',
            finalite: normalized.finalite || '',
            notes: normalized.notes || '',
            raw_count: normalized.rawCount,
            echantillon_count: normalized.echantillonCount,
            essai_count: normalized.essaiCount,
            statut: getPrelevementWorkflowStatus(normalized),
            statut_source: normalized.status || '',
            labo_code: normalized.laboCode || '',
            year: referenceDate ? String(referenceDate).slice(0, 4) : '',
        }
    })
}

function normalizeEssais(rows) {
    return (Array.isArray(rows) ? rows : []).map((row, index) => {
        const rawDate = row.date ?? row.date_essai ?? row.date_debut ?? row.date_realisation ?? row.created_at ?? ''
        const displayCode =
            row.essai_code
            ?? row.code_essai
            ?? row.source_essai_code
            ?? row.code
            ?? ''
        const displayLabel =
            row.essai_label
            ?? row.libelle
            ?? row.designation
            ?? row.intitule
            ?? row.type_essai
            ?? row.type
            ?? ''
        const uid = row.uid ?? row.id ?? row.essai_id ?? `essai-${index}`
        return {
            uid,
            reference: row.reference ?? row.numero ?? (typeof uid === 'number' ? `ESSAI-${String(uid).padStart(4, '0')}` : ''),
            display_code: displayCode,
            display_label: displayLabel,
            type_essai: row.type_essai ?? row.type ?? '',
            date: rawDate,
            echantillon_id: row.echantillon_id ?? null,
            demande_id: row.demande_id ?? null,
            affaire_rst_id: row.affaire_rst_id ?? null,
            echantillon_reference: row.echantillon_reference ?? row.echantillon_ref ?? row.reference_echantillon ?? '—',
            demande_reference: row.demande_reference ?? row.demande_ref ?? row.reference_demande ?? '—',
            affaire_reference: row.affaire_reference ?? row.affaire_ref ?? row.reference_affaire ?? '—',
            essai_code: row.essai_code ?? row.code_essai ?? row.essaiCode ?? '',
            chantier: row.chantier ?? row.affaire_chantier ?? '',
            site: row.site ?? row.affaire_site ?? '',
            statut: row.statut ?? row.status ?? '—',
            labo_code: row.labo_code ?? row.labo ?? '',
            year: row.year ?? row.annee ?? (rawDate ? String(rawDate).slice(0, 4) : ''),
        }
    })
}

function compareValues(a, b, dir) {
    const av = a ?? ''
    const bv = b ?? ''
    const an = Number(av)
    const bn = Number(bv)

    if (!Number.isNaN(an) && !Number.isNaN(bn) && String(av).trim() !== '' && String(bv).trim() !== '') {
        return dir === 'asc' ? an - bn : bn - an
    }

    const as = String(av).toLowerCase()
    const bs = String(bv).toLowerCase()
    if (as < bs) return dir === 'asc' ? -1 : 1
    if (as > bs) return dir === 'asc' ? 1 : -1
    return 0
}

export default function LaboPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const detailReturnTo = buildLocationTarget(location)
    const queryLabo = searchParams.get('labo') || ''
    const queryTab = TABS.some((tab) => tab.key === searchParams.get('tab')) ? searchParams.get('tab') : 'interventions'
    const queryStatus = searchParams.get('status') || ''
    const [activeTab, setActiveTab] = useState(queryTab)
    const [search, setSearch] = useState('')
    const [year, setYear] = useState('')
    const [labo, setLabo] = useState(queryLabo)
    const [status, setStatus] = useState(queryStatus)

    const [sortByTab, setSortByTab] = useState(DEFAULT_SORT)

    const [interventions, setInterventions] = useState([])
    const [prelevements, setPrelevements] = useState([])
    const [echantillons, setEchantillons] = useState([])
    const [essais, setEssais] = useState([])

    const [selectedByTab, setSelectedByTab] = useState({
        interventions: null,
        prelevements: null,
        echantillons: null,
        essais: null,
    })
    const [detailOpenByTab, setDetailOpenByTab] = useState({
        interventions: false,
        prelevements: false,
        echantillons: false,
        essais: false,
    })

    const [loadingInterventions, setLoadingInterventions] = useState(false)
    const [loadingPrelevements, setLoadingPrelevements] = useState(false)
    const [loadingEchantillons, setLoadingEchantillons] = useState(false)
    const [loadingEssais, setLoadingEssais] = useState(false)

    const [interventionsError, setInterventionsError] = useState('')
    const [prelevementsError, setPrelevementsError] = useState('')
    const [echantillonsError, setEchantillonsError] = useState('')
    const [essaisError, setEssaisError] = useState('')

    useEffect(() => {
        if (queryLabo !== labo) {
            setLabo(queryLabo)
        }
    }, [queryLabo, labo])

    function updateRouteFilters(updates) {
        const nextParams = new URLSearchParams(searchParams)

        Object.entries(updates).forEach(([key, value]) => {
            if (value) nextParams.set(key, value)
            else nextParams.delete(key)
        })

        setSearchParams(nextParams, { replace: true })
    }

    function updateLaboFilter(value) {
        setLabo(value)
        updateRouteFilters({ labo: value })
    }

    function updateActiveTab(value) {
        const nextStatus = value !== 'essais' && status === LABO_ESSAI_ACTIVE_STATUS ? '' : status
        setActiveTab(value)
        setStatus(nextStatus)
        updateRouteFilters({
            tab: value !== 'interventions' ? value : '',
            status: nextStatus,
        })
    }

    function updateStatusFilter(value) {
        setStatus(value)
        updateRouteFilters({
            tab: activeTab !== 'interventions' ? activeTab : '',
            status: value,
        })
    }

    async function loadInterventions() {
        try {
            setLoadingInterventions(true)
            setInterventionsError('')
            const data = await interventionsApi.list({
                ...(year ? { annee: year } : {}),
                ...(labo ? { labo_code: labo } : {}),
            })
            setInterventions(normalizeInterventions(data))
        } catch (err) {
            console.error('Failed to load interventions', err)
            setInterventionsError('Impossible de charger les interventions.')
            setInterventions([])
        } finally {
            setLoadingInterventions(false)
        }
    }

    async function loadEchantillons() {
        try {
            setLoadingEchantillons(true)
            setEchantillonsError('')
            const data = await echantillonsApi.list({
                ...(year ? { annee: year } : {}),
                ...(labo ? { labo_code: labo } : {}),
                ...(status && status !== LABO_ESSAI_ACTIVE_STATUS ? { statut: status } : {}),
            })
            setEchantillons(normalizeEchantillons(data))
        } catch (err) {
            console.error('Failed to load echantillons', err)
            setEchantillonsError('Impossible de charger les échantillons.')
            setEchantillons([])
        } finally {
            setLoadingEchantillons(false)
        }
    }

    async function loadPrelevements() {
        try {
            setLoadingPrelevements(true)
            setPrelevementsError('')
            const data = await prelevementsApi.list({
                ...(year ? { year } : {}),
            })
            const rows = normalizePrelevements(data).filter((row) => (
                !labo || matchesLaboCode(labo, row.labo_code, row.reference, row.demande_reference, row.chantier, row.intervention_reference)
            ))
            setPrelevements(rows)
        } catch (err) {
            console.error('Failed to load prelevements', err)
            setPrelevementsError('Impossible de charger les prélèvements.')
            setPrelevements([])
        } finally {
            setLoadingPrelevements(false)
        }
    }

    async function loadEssais() {
        try {
            setLoadingEssais(true)
            setEssaisError('')
            const data = await essaisApi.list({
                ...(year ? { annee: year } : {}),
                ...(labo ? { labo_code: labo } : {}),
                ...(status && status !== LABO_ESSAI_ACTIVE_STATUS ? { statut: status } : {}),
            })
            setEssais(normalizeEssais(data))
        } catch (err) {
            console.error('Failed to load essais', err)
            setEssaisError('Impossible de charger les essais.')
            setEssais([])
        } finally {
            setLoadingEssais(false)
        }
    }

    useEffect(() => {
        loadInterventions()
    }, [year, labo])

    useEffect(() => {
        loadPrelevements()
    }, [year, labo])

    useEffect(() => {
        loadEchantillons()
    }, [year, labo, status])

    useEffect(() => {
        loadEssais()
    }, [year, labo, status])

    function handleSort(tabKey, columnKey) {
        setSortByTab((prev) => {
            const current = prev[tabKey] ?? { key: columnKey, dir: 'asc' }
            const nextDir =
                current.key === columnKey
                    ? (current.dir === 'asc' ? 'desc' : 'asc')
                    : 'asc'

            return {
                ...prev,
                [tabKey]: { key: columnKey, dir: nextDir },
            }
        })
    }

    const currentRows = useMemo(() => {
        if (activeTab === 'interventions') return interventions
        if (activeTab === 'prelevements') return prelevements
        if (activeTab === 'echantillons') return echantillons
        return essais
    }, [activeTab, interventions, prelevements, echantillons, essais])

    const filteredRows = useMemo(() => {
        const q = search.trim().toLowerCase()
        const rows = currentRows.filter((row) => {
            const matchesSearch = !q || [
                row.reference,
                row.demande_reference,
                row.affaire_reference,
                row.chantier,
                row.site,
                row.nature,
                row.type_essai,
                row.essai_code,
                row.display_code,
                row.display_label,
                row.echantillon_reference,
                row.intervention_reference,
                row.description,
                row.receptionnaire,
                row.zone,
                row.materiau,
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(q))

            if (activeTab === 'interventions') {
                return matchesSearch
            }

            if (activeTab === 'essais' && status === LABO_ESSAI_ACTIVE_STATUS) {
                return matchesSearch && ['programme', 'planifie', 'en cours'].includes(normalizeFilterText(row.statut))
            }

            const matchesStatus = !status || String(row.statut || '') === String(status)
            return matchesSearch && matchesStatus
        })

        const { key, dir } = sortByTab[activeTab] ?? DEFAULT_SORT[activeTab]
        return [...rows].sort((a, b) => compareValues(a[key], b[key], dir))
    }, [currentRows, search, status, activeTab, sortByTab])

    const availableStatuses = useMemo(() => {
        if (activeTab === 'interventions') return []
        return [...new Set(currentRows.map((row) => String(row.statut || '').trim()).filter(Boolean))]
            .sort((left, right) => compareValues(left, right, 'asc'))
    }, [activeTab, currentRows])

    useEffect(() => {
        setSelectedByTab((prev) => {
            const currentSelectedUid = prev[activeTab]
            const exists = filteredRows.some((row) => row.uid === currentSelectedUid)
            return {
                ...prev,
                [activeTab]: exists ? currentSelectedUid : (filteredRows[0]?.uid ?? null),
            }
        })
    }, [activeTab, filteredRows])

    const selectedItem = useMemo(() => {
        const selectedUid = selectedByTab[activeTab]
        return filteredRows.find((row) => row.uid === selectedUid) || null
    }, [activeTab, filteredRows, selectedByTab])

    const stats = {
        interventions: interventions.length,
        prelevements: prelevements.length,
        echantillons: echantillons.length,
        essais: essais.length,
    }

    function closeDetailPanel() {
        setDetailOpenByTab((prev) => ({ ...prev, [activeTab]: false }))
    }

    function openSelectedFiche() {
        if (!selectedItem) return
        if (activeTab === 'interventions') {
            navigateWithReturnTo(navigate, `/interventions/${selectedItem.uid}`, detailReturnTo)
            return
        }
        if (activeTab === 'prelevements') {
            navigateWithReturnTo(navigate, `/prelevements/${selectedItem.uid}`, detailReturnTo)
            return
        }
        if (activeTab === 'essais') {
            navigate(`/essais/${selectedItem.uid}`)
        }
    }

    function openSelectedDemande() {
        if (!selectedItem?.demande_id) return
        navigate(`/demandes/${selectedItem.demande_id}`)
    }

    function openSelectedEchantillonFiche() {
        if (!selectedItem) return
        navigateWithReturnTo(navigate, `/echantillons/${selectedItem.uid}`, detailReturnTo)
    }

    function openPreparationPreview() {
        if (!selectedItem?.demande_id) return
        const ref = encodeURIComponent(selectedItem.demande_reference || '')
        navigate(`/preparations-card/${selectedItem.demande_id}?ref=${ref}`)
    }

    function openInterventionPreview() {
        if (!selectedItem || activeTab !== 'interventions') return
        navigateWithReturnTo(navigate, `/interventions-card/${selectedItem.uid}`, detailReturnTo)
    }

    function createInterventionFromContext() {
        if (!selectedItem?.demande_id) return
        navigateWithReturnTo(navigate, `/interventions/new?demande_id=${selectedItem.demande_id}`, detailReturnTo)
    }

    function createEssaiFromContext() {
        if (!selectedItem?.echantillon_id) return
        navigate(`/essais/new?echantillon_id=${selectedItem.echantillon_id}`)
    }

    const activeSort = sortByTab[activeTab] ?? DEFAULT_SORT[activeTab]

    function renderCurrentView() {
        if (activeTab === 'interventions') {
            if (loadingInterventions) {
                return (
                    <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">
                        Chargement des interventions…
                    </div>
                )
            }
            if (interventionsError) {
                return (
                    <div className="bg-surface border border-danger/30 rounded-xl p-6 text-sm text-danger">
                        {interventionsError}
                    </div>
                )
            }
            return (
                <InterventionsView
                    rows={filteredRows}
                    sortKey={activeSort.key}
                    sortDir={activeSort.dir}
                    onSort={(key) => handleSort('interventions', key)}
                    selectedUid={selectedByTab.interventions}
                    onOpen={(selectedUid) => navigateWithReturnTo(navigate, `/interventions/${selectedUid}`, detailReturnTo)}
                    onSelect={(uid) => {
                        setSelectedByTab((prev) => ({ ...prev, interventions: uid }))
                        setDetailOpenByTab((prev) => ({ ...prev, interventions: true }))
                    }}
                />
            )
        }

        if (activeTab === 'echantillons') {
            if (loadingEchantillons) {
                return (
                    <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">
                        Chargement des échantillons…
                    </div>
                )
            }
            if (echantillonsError) {
                return (
                    <div className="bg-surface border border-danger/30 rounded-xl p-6 text-sm text-danger">
                        {echantillonsError}
                    </div>
                )
            }
            return (
                <EchantillonsView
                    rows={filteredRows}
                    sortKey={activeSort.key}
                    sortDir={activeSort.dir}
                    onSort={(key) => handleSort('echantillons', key)}
                    selectedUid={selectedByTab.echantillons}
                    onOpen={(selectedUid) => navigateWithReturnTo(navigate, `/echantillons/${selectedUid}`, detailReturnTo)}
                    onSelect={(uid) => {
                        setSelectedByTab((prev) => ({ ...prev, echantillons: uid }))
                        setDetailOpenByTab((prev) => ({ ...prev, echantillons: true }))
                    }}
                />
            )
        }

        if (activeTab === 'prelevements') {
            if (loadingPrelevements) {
                return (
                    <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">
                        Chargement des prélèvements…
                    </div>
                )
            }
            if (prelevementsError) {
                return (
                    <div className="bg-surface border border-danger/30 rounded-xl p-6 text-sm text-danger">
                        {prelevementsError}
                    </div>
                )
            }
            return (
                <PrelevementsView
                    rows={filteredRows}
                    sortKey={activeSort.key}
                    sortDir={activeSort.dir}
                    onSort={(key) => handleSort('prelevements', key)}
                    selectedUid={selectedByTab.prelevements}
                    onOpen={(selectedUid) => navigateWithReturnTo(navigate, `/prelevements/${selectedUid}`, detailReturnTo)}
                    onSelect={(uid) => {
                        setSelectedByTab((prev) => ({ ...prev, prelevements: uid }))
                        setDetailOpenByTab((prev) => ({ ...prev, prelevements: true }))
                    }}
                />
            )
        }

        if (loadingEssais) {
            return (
                <div className="bg-surface border border-border rounded-xl p-6 text-sm text-text-muted">
                    Chargement des essais…
                </div>
            )
        }
        if (essaisError) {
            return (
                <div className="bg-surface border border-danger/30 rounded-xl p-6 text-sm text-danger">
                    {essaisError}
                </div>
            )
        }
        return (
            <EssaisView
                rows={filteredRows}
                sortKey={activeSort.key}
                sortDir={activeSort.dir}
                onSort={(key) => handleSort('essais', key)}
                selectedUid={selectedByTab.essais}
                onOpen={(selectedUid) => navigate(`/essais/${selectedUid}`)}
                onSelect={(uid) => {
                    setSelectedByTab((prev) => ({ ...prev, essais: uid }))
                    setDetailOpenByTab((prev) => ({ ...prev, essais: true }))
                }}
            />
        )
    }

    return (
        <div className="flex flex-col h-full -m-6">
            <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
                <span className="text-[15px] font-semibold flex-1">Laboratoire</span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        loadInterventions()
                        loadPrelevements()
                        loadEchantillons()
                        loadEssais()
                    }}
                >
                    <RefreshCw size={13} />
                </Button>
            </div>

            <div className="px-6 py-4 bg-bg border-b border-border">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="text-lg font-bold text-text">Vue opérationnelle laboratoire</div>
                        <div className="text-xs text-text-muted mt-1">
                            Page transverse de recherche et consultation pour retrouver une intervention, un prélèvement, un échantillon ou un essai dans l’ensemble du laboratoire.
                        </div>
                    </div>

                    <div className="flex gap-3 flex-wrap">
                        <StatCard
                            label="Interventions"
                            value={loadingInterventions ? '…' : String(stats.interventions)}
                            hint="Préparation / organisation"
                        />
                        <StatCard
                            label="Prélèvements"
                            value={loadingPrelevements ? '…' : String(stats.prelevements)}
                            hint="Réception / arrivages"
                        />
                        <StatCard
                            label="Échantillons"
                            value={loadingEchantillons ? '…' : String(stats.echantillons)}
                            hint="Réception / préparation"
                        />
                        <StatCard
                            label="Essais"
                            value={loadingEssais ? '…' : String(stats.essais)}
                            hint="Recherche transverse"
                        />
                    </div>
                </div>
            </div>

            <div className="px-6 py-3 bg-surface border-b border-border flex items-center gap-2 flex-wrap">
                {TABS.map((tab) => (
                    <TabButton
                        key={tab.key}
                        active={activeTab === tab.key}
                        icon={tab.icon}
                        label={tab.label}
                        onClick={() => updateActiveTab(tab.key)}
                    />
                ))}
            </div>

            <div className="px-6 py-3 bg-surface border-b border-border flex items-center gap-3 flex-wrap">
                <div className="relative min-w-[240px] flex-1 max-w-[320px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Référence, demande, affaire, chantier…"
                        className="pl-9 text-xs py-1.5"
                    />
                </div>

                <Select value={year} onChange={(e) => setYear(e.target.value)} className="text-xs py-1.5 min-w-[120px]">
                    <option value="">Toutes années</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                </Select>

                <Select value={labo} onChange={(e) => updateLaboFilter(e.target.value)} className="text-xs py-1.5 min-w-[120px]">
                    <option value="">Tous labos</option>
                    {LABO_OPTIONS.map((code) => (
                        <option key={code} value={code}>{code}</option>
                    ))}
                </Select>

                {activeTab !== 'interventions' && (
                    <Select value={status} onChange={(e) => updateStatusFilter(e.target.value)} className="text-xs py-1.5 min-w-[160px]">
                        <option value="">Tous statuts</option>
                        {activeTab === 'essais' ? <option value={LABO_ESSAI_ACTIVE_STATUS}>Essais actifs</option> : null}
                        {availableStatuses.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>{statusValue}</option>
                        ))}
                    </Select>
                )}

                {(search || year || labo || status) && (
                    <button
                        type="button"
                        onClick={() => {
                            setSearch('')
                            setYear('')
                            setLabo('')
                            setStatus('')
                            updateRouteFilters({ labo: '', status: '' })
                        }}
                        className="text-xs text-text-muted hover:text-danger transition-colors"
                    >
                        Effacer filtres
                    </button>
                )}

                <span className="ml-auto text-xs text-text-muted">
                    {filteredRows.length} / {currentRows.length}
                </span>
            </div>

            <div className="flex-1 overflow-hidden p-6 bg-bg">
                <div className="flex h-full overflow-hidden">
                    <div className="flex-1 min-w-0 overflow-hidden">
                        {renderCurrentView()}
                    </div>
                    {detailOpenByTab[activeTab] && selectedItem && (
                        <LaboDetailPanel
                            tab={activeTab}
                            item={selectedItem}
                            onClose={closeDetailPanel}
                            onOpenFiche={openSelectedFiche}
                            onOpenEchantillonFiche={openSelectedEchantillonFiche}
                            onOpenDemande={openSelectedDemande}
                            onCreateIntervention={createInterventionFromContext}
                            onCreateEssai={createEssaiFromContext}
                            onOpenPreparationPreview={openPreparationPreview}
                            onOpenInterventionPreview={openInterventionPreview}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
