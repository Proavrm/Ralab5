// FILE: ModeleBasePage.jsx
// Chemin confirme: frontend/react/src/pages/ModeleBasePage.jsx
// Modèles terrain / labo (DE + JSON générique). La feuille SC terrain vit dans ModeleSCPage + scStratigraphicWorksheet.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { essaisApi, feuillesTerrainApi, qualiteApi } from '@/services/api'
import {
    computeDeSummary,
    deleteModelDefinitionDE,
    deleteModelDefinitionDEById,
    getModelDefinitionDE,
    getRapportModelDefinitionDEById,
    listModelDefinitionsDE,
    listRapportModelDefinitionsDE,
    migrateLegacyDeDraftIfNeeded,
    upsertRapportModelDefinitionDE,
    upsertModelDefinitionDE,
} from '@/services/modelWorkLocalStore'
import Button from '@/components/ui/Button'
import PhotoCropModal from '@/components/ui/PhotoCropModal'
import Input from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar } from '@/components/layout/FicheLayout'
import { navigateWithReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import {
    TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS,
    TERRAIN_FABRICATION_SITE_SELECT_OPTIONS,
    TERRAIN_FORMULA_SELECT_OPTIONS,
    TERRAIN_OPERATOR_SELECT_OPTIONS,
    TERRAIN_PRODUCT_SELECT_OPTIONS,
    renderTerrainSelectOptionExtras,
} from '@/lib/terrainEssaiSelectOptions'
import { getFeuilleTypeConfig } from '@/pages/terrain/feuilleTypeRegistry'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

const TERRAIN_CODES = new Set(['DE', 'CFE', 'PLD', 'DF', 'SO', 'SP'])

const SOURCE_TONE_CLS = {
    manual: 'border-l-4 border-l-[#7fc998] bg-[#f7fcf9]',
    hierarchy: 'border-l-4 border-l-[#f0b35a] bg-[#fffaf2]',
    neutral: 'border-l-4 border-l-transparent bg-bg',
}

function normalizeCode(value) {
    return String(value || '').trim().toUpperCase()
}

function normalizeText(value) {
    return String(value || '').trim().toLowerCase()
}

function normalizeSearchText(value) {
    return normalizeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

function safeParseJson(value) {
    if (value && typeof value === 'object') return value
    if (typeof value !== 'string') return null

    try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? parsed : null
    } catch {
        return null
    }
}

function extractEssaiValues(source) {
    if (!source || typeof source !== 'object') return {}

    return (
        source.resultats ||
        safeParseJson(source.resultats_json) ||
        source.payload ||
        {}
    )
}

function formatResult(value, unit) {
    if (value == null || value === '') return ''

    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
        return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
    }

    return `${value}${unit ? ` ${unit}` : ''}`
}

function toDeDraft(values = {}) {
    return {
        meta: values?.meta && typeof values.meta === 'object' ? { ...values.meta } : {},
        points_rows: Array.isArray(values?.points_rows)
            ? values.points_rows.map((row, index) => ({ ...row, id: row?.id ?? index + 1 }))
            : [],
    }
}

function extractSheetPointCandidates(values = {}) {
    const payload = values && typeof values === 'object' ? values : {}
    const rawPoints = Array.isArray(payload.points)
        ? payload.points
        : Array.isArray(payload.sondages)
            ? payload.sondages
            : []
    return rawPoints
        .map((point, index) => {
            const uid = String(point?.uid || point?.id || '').trim()
            if (!uid) return null
            const pointCode = String(point?.point_code || point?.reference || `P${index + 1}`).trim()
            return { uid, pointCode, raw: point }
        })
        .filter(Boolean)
}

function buildSinglePointValues(values = {}, selectedCandidate) {
    const payload = values && typeof values === 'object' ? { ...values } : {}
    const selectedPoint = selectedCandidate?.raw && typeof selectedCandidate.raw === 'object'
        ? { ...selectedCandidate.raw }
        : null
    if (!selectedPoint) return payload
    payload.points = [selectedPoint]
    payload.sondages = [selectedPoint]
    payload.selected_item_uid = String(selectedCandidate.uid || '')
    payload.selected_item_code = String(selectedCandidate.pointCode || '')
    return payload
}

function getStatusLabel(status) {
    return status === 'approved' ? 'Approuvé' : 'Brouillon'
}

function getStatusClass(status) {
    return status === 'approved'
        ? 'border-[#9bc27d] bg-[#eef7e8] text-[#3f6f20]'
        : 'border-[#f0c36d] bg-[#fff7e5] text-[#8a5c11]'
}

function buildRapportBaseNameFromModelReference(reference, code = 'DE') {
    const raw = String(reference || '').trim().toUpperCase()
    const fallback = `MODELE-${code}-001`
    const normalized = (raw || fallback)
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
    return normalized || fallback
}

function nextRapportVersionForBase(baseName, rapportModels = []) {
    const escapedBase = String(baseName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const versionPattern = new RegExp(`^${escapedBase}-RAPPORT-v(\\d+)$`, 'i')
    let maxVersion = 0
    for (const model of rapportModels) {
        const ref = String(model?.reference || '').trim()
        const match = ref.match(versionPattern)
        if (!match) continue
        const num = Number(match[1])
        if (Number.isFinite(num) && num > maxVersion) maxVersion = num
    }
    return maxVersion + 1
}

function Card({ title, children, right, description, overflow = 'hidden', bodyClassName = 'p-4' }) {
    const overflowClass = overflow === 'visible' ? 'overflow-visible' : 'overflow-hidden'
    return (
        <div className={`${overflowClass} rounded-xl border border-border bg-surface shadow-sm`}>
            {title ? (
                <div className="flex items-start justify-between gap-3 border-b border-border bg-bg px-4 py-3">
                    <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</div>
                        {description ? <p className="mt-1 text-[11px] text-text-muted">{description}</p> : null}
                    </div>
                    {right ? <div className="shrink-0">{right}</div> : null}
                </div>
            ) : null}
            <div className={bodyClassName}>{children}</div>
        </div>
    )
}

function Badge({ children, className = '' }) {
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}>
            {children}
        </span>
    )
}

function Row({ label, value, tone = 'neutral' }) {
    const toneClass = SOURCE_TONE_CLS[tone] || SOURCE_TONE_CLS.neutral

    return (
        <div className={`rounded-lg px-3 py-2 ${toneClass}`}>
            <span className="block text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
            <span className={`mt-1 block text-[13px] font-medium ${value ? 'text-text' : 'font-normal italic text-text-muted'}`}>
                {value || '—'}
            </span>
        </div>
    )
}

function Field({ label, children, full = false, tone = 'neutral' }) {
    const toneClass = SOURCE_TONE_CLS[tone] || SOURCE_TONE_CLS.neutral

    return (
        <div className={`${full ? 'md:col-span-2' : ''} rounded-lg px-3 py-2 ${toneClass}`}>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</label>
            {children}
        </div>
    )
}

function Textarea({ value, onChange, rows = 3, readOnly = false }) {
    return (
        <textarea
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            rows={rows}
            readOnly={readOnly}
            className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge disabled:cursor-not-allowed disabled:opacity-70 read-only:cursor-default read-only:opacity-80"
        />
    )
}

function Select({ value, onChange, readOnly = false, children, className = '' }) {
    return (
        <select
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            disabled={readOnly}
            className={`w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
        >
            {children}
        </select>
    )
}


function toDateInputValue(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''

    const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`

    const frenchDate = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
    if (frenchDate) {
        const day = frenchDate[1].padStart(2, '0')
        const month = frenchDate[2].padStart(2, '0')
        return `${frenchDate[3]}-${month}-${day}`
    }

    return ''
}

function toFrenchDateDisplay(value) {
    const iso = toDateInputValue(value)
    if (iso) {
        const [year, month, day] = iso.split('-')
        return `${day}/${month}/${year}`
    }
    return String(value || '').trim()
}

function parseDeNumericValue(value) {
    if (value === null || value === undefined) return null
    const normalized = String(value).trim().replace(',', '.')
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

function computeDeConformiteValue(moyenneVides, critereMin, critereMax) {
    const avg = parseDeNumericValue(moyenneVides)
    const min = parseDeNumericValue(critereMin)
    const max = parseDeNumericValue(critereMax)
    if (avg === null || min === null || max === null) return 'pour_info'
    return avg >= min && avg <= max ? 'conforme' : 'non_conforme'
}

function applyDeComputedFields(row, mvreValue, changedKey = '') {
    const nextRow = { ...(row || {}) }
    const mv = parseDeNumericValue(nextRow.masse_volumique)
    const mvre = parseDeNumericValue(mvreValue)
    const compacite = parseDeNumericValue(nextRow.compacite_pct)
    const vides = parseDeNumericValue(nextRow.vides_pct)

    if (changedKey === 'compacite_pct' && compacite != null) {
        const nextVides = Number((100 - compacite).toFixed(2))
        nextRow.vides_pct = nextVides
        if (mvre != null && mvre > 0) {
            nextRow.masse_volumique = Number(((mvre * compacite) / 100).toFixed(3))
        }
        return nextRow
    }
    if (changedKey === 'vides_pct' && vides != null) {
        const nextCompacite = Number((100 - vides).toFixed(2))
        nextRow.compacite_pct = nextCompacite
        if (mvre != null && mvre > 0) {
            nextRow.masse_volumique = Number(((mvre * nextCompacite) / 100).toFixed(3))
        }
        return nextRow
    }

    if ((changedKey === 'masse_volumique' || changedKey === 'mvre') && mv != null && mvre != null && mvre > 0) {
        const computedCompacite = Number(((mv / mvre) * 100).toFixed(2))
        nextRow.compacite_pct = computedCompacite
        nextRow.vides_pct = Number((100 - computedCompacite).toFixed(2))
        return nextRow
    }

    if (changedKey === 'mvre' && mvre != null && mvre > 0) {
        if (compacite != null) {
            const nextVides = Number((100 - compacite).toFixed(2))
            nextRow.vides_pct = nextVides
            nextRow.masse_volumique = Number(((mvre * compacite) / 100).toFixed(3))
            return nextRow
        }
        if (vides != null) {
            const nextCompacite = Number((100 - vides).toFixed(2))
            nextRow.compacite_pct = nextCompacite
            nextRow.masse_volumique = Number(((mvre * nextCompacite) / 100).toFixed(3))
            return nextRow
        }
    }

    return nextRow
}

function isDeVidesNonConforme(videsPct, critereMin, critereMax) {
    const vides = parseDeNumericValue(videsPct)
    const min = parseDeNumericValue(critereMin)
    const max = parseDeNumericValue(critereMax)
    if (vides == null || min == null || max == null) return false
    return vides < min || vides > max
}

function NumericInput({ value, onChange, readOnly, className = '' }) {
    return (
        <Input
            value={value ?? ''}
            onChange={onChange}
            readOnly={readOnly}
            className={`min-w-[95px] text-right tabular-nums ${className}`}
        />
    )
}

function renderDeView({
    data,
    draft,
    isApproved = false,
    equipmentOptions = [],
    equipmentLoading = false,
    equipmentError = '',
    onMetaChange,
    onRowChange,
    onAddRow,
    onRemoveRow,
    }) 
    {
    // NOTE (2026-05-01):
    // This DE renderer is the visual reference for runtime parity.
    // Runtime DE should mirror this structure; future essai types should follow the same pattern.
    const meta = draft?.meta || {}
    const pointsRows = Array.isArray(draft?.points_rows) ? draft.points_rows : []
    const summary = computeDeSummary(pointsRows)
    const computedConformite = computeDeConformiteValue(
        summary?.moyenne_vides_pct,
        meta?.criteria_void_min,
        meta?.criteria_void_max
    )

    const handleMetaChange = (key, value) => {
        if (isApproved) return
        onMetaChange(key, value)
    }
    
    const handleGammadensimetreChange = (value) => {
        if (isApproved) return
    
        const selected = equipmentOptions.find((option) => String(option.value) === String(value))
    
        onMetaChange('gammadensimetre', value)
    
        if (selected?.calibration_date || selected?.last_metrology) {
            onMetaChange('date_dernier_calibrage', selected.calibration_date || selected.last_metrology)
        }
    }

    const handleRowChange = (index, key, value) => {
        if (isApproved) return
        onRowChange(index, key, value)
    }

    const handleAddRow = () => {
        if (isApproved) return
        onAddRow()
    }

    const handleRemoveRow = (index) => {
        if (isApproved) return
        onRemoveRow(index)
    }

    return (
        <div className="flex flex-col gap-4">
            <Card title="Identification" description="Données de réalisation de l’essai ou de l’intervention.">
                <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
                    <Badge className="border-[#b7e2c4] bg-[#f1fbf4] text-[#477d55]">Saisie manuelle / import</Badge>
                    <Badge className="border-[#f1d2a4] bg-[#fff8ec] text-[#8a5c11]">Donnée hiérarchique</Badge>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Row label="Norme" value={data.norme || 'NF P 98-241-1'} tone="manual" />
                    <Field label="Date essai" tone="manual">
                        <Input type="date" value={toDateInputValue(meta.date_essai)} onChange={(event) => handleMetaChange('date_essai', event.target.value)} readOnly={isApproved} />
                    </Field>
                    <Field label="Opérateur" tone="manual">
                        <Select value={meta.operateur || ''} onChange={(value) => handleMetaChange('operateur', value)} readOnly={isApproved}>
                            <option value="">Sélectionner un opérateur</option>
                            {renderTerrainSelectOptionExtras(TERRAIN_OPERATOR_SELECT_OPTIONS, meta.operateur)}
                        </Select>
                    </Field>
                    <Field label="Conditions météo" tone="manual">
                        <Input value={meta.conditions_meteo || ''} onChange={(event) => handleMetaChange('conditions_meteo', event.target.value)} readOnly={isApproved} />
                    </Field>
                    <Field label="Section contrôlée" tone="hierarchy" full>
                        <Input value={meta.section_controlee || ''} onChange={(event) => handleMetaChange('section_controlee', event.target.value)} readOnly={isApproved} />
                    </Field>
                </div>
            </Card>

            <Card title="Produit / chantier" description="Informations utiles pour relier l’essai au produit contrôlé et à la mise en œuvre.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Field label="Lieu de fabrication" tone="manual">
                        <Select value={meta.lieu_fabrication || ''} onChange={(value) => handleMetaChange('lieu_fabrication', value)} readOnly={isApproved}>
                            <option value="">Sélectionner une centrale</option>
                            {renderTerrainSelectOptionExtras(TERRAIN_FABRICATION_SITE_SELECT_OPTIONS, meta.lieu_fabrication)}
                        </Select>
                    </Field>
                    <Field label="Numéro formule" tone="manual">
                        <Select value={meta.numero_formule || ''} onChange={(value) => handleMetaChange('numero_formule', value)} readOnly={isApproved}>
                            <option value="">Sélectionner une formule</option>
                            {renderTerrainSelectOptionExtras(TERRAIN_FORMULA_SELECT_OPTIONS, meta.numero_formule)}
                        </Select>
                    </Field>
                    <Field label="Produit contrôlé" tone="manual">
                        <Select value={meta.produit_controle || ''} onChange={(value) => handleMetaChange('produit_controle', value)} readOnly={isApproved}>
                            <option value="">Sélectionner une FTP</option>
                            {renderTerrainSelectOptionExtras(TERRAIN_PRODUCT_SELECT_OPTIONS, meta.produit_controle)}
                        </Select>
                    </Field>
                    <Field label="Couche" tone="manual">
                        <Input value={meta.couche || ''} onChange={(event) => handleMetaChange('couche', event.target.value)} readOnly={isApproved} />
                    </Field>
                    <Field label="Épaisseur couche (cm)" tone="manual">
                        <Input value={meta.epaisseur_couche_cm || ''} onChange={(event) => handleMetaChange('epaisseur_couche_cm', event.target.value)} readOnly={isApproved} />
                    </Field>
                    <Field label="Date mise en œuvre" tone="manual">
                        <Input type="date" value={toDateInputValue(meta.date_mise_en_oeuvre)} onChange={(event) => handleMetaChange('date_mise_en_oeuvre', event.target.value)} readOnly={isApproved} />
                    </Field>
                </div>
            </Card>

            <Card title="Matériel" description="Données pratiques de mesure et matériel utilisé.">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Gammadensimètre" tone="manual">
                        <Select
                            value={meta.gammadensimetre || ''}
                            onChange={handleGammadensimetreChange}
                            readOnly={isApproved || equipmentLoading}
                        >
                            <option value="">
                                {equipmentLoading ? 'Chargement des équipements...' : 'Sélectionner un équipement'}
                            </option>
                            {renderTerrainSelectOptionExtras(equipmentOptions, meta.gammadensimetre)}
                        </Select>

                        {equipmentError ? (
                            <div className="mt-1 text-[11px] text-red-600">
                                {equipmentError}
                            </div>
                        ) : null}
                    </Field>
                    <Field label="Date dernier calibrage" tone="manual">
                        <Input
                            value={toFrenchDateDisplay(meta.date_dernier_calibrage)}
                            onChange={(event) => handleMetaChange('date_dernier_calibrage', event.target.value)}
                            readOnly={isApproved}
                            placeholder="jj/mm/aaaa"
                        />
                    </Field>
                    
                    <Field label="Profondeur mesure" tone="manual">
                        <Input value={meta.profondeur_mesure || ''} onChange={(event) => handleMetaChange('profondeur_mesure', event.target.value)} readOnly={isApproved} />
                    </Field>
                    <Field label="Atelier mise en œuvre" tone="manual">
                        <Input value={meta.atelier_mise_en_oeuvre || ''} onChange={(event) => handleMetaChange('atelier_mise_en_oeuvre', event.target.value)} readOnly={isApproved} />
                    </Field>
                </div>
            </Card>

            <Card title="Critères / conclusion" description="Synthèse calculée, objectifs et conclusion du contrôle.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                    <div className="md:col-span-3">
                        <Field label="MVRE" tone="manual">
                            <Input value={meta.mvre || ''} onChange={(event) => handleMetaChange('mvre', event.target.value)} readOnly={isApproved} placeholder="MVA ou saisie directe" />
                        </Field>
                    </div>
                    <div className="md:col-span-4">
                        <Field label="Source des critères :" tone="hierarchy">
                            <Select value={meta.criteria_source || ''} onChange={(value) => handleMetaChange('criteria_source', value)} readOnly={isApproved}>
                                <option value="">Sélectionner une source</option>
                                {renderTerrainSelectOptionExtras(TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS, meta.criteria_source)}
                            </Select>
                        </Field>
                    </div>
                    <div className="md:col-span-5">
                        <Field label="Définition des critères / objectifs :" tone="manual">
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                <Input value={meta.criteria_void_min || ''} onChange={(event) => handleMetaChange('criteria_void_min', event.target.value)} readOnly={isApproved} className="text-right tabular-nums" placeholder="Minimum" />
                                <span className="whitespace-nowrap text-xs font-semibold text-text-muted">≤ % de vide ≤</span>
                                <Input value={meta.criteria_void_max || ''} onChange={(event) => handleMetaChange('criteria_void_max', event.target.value)} readOnly={isApproved} className="text-right tabular-nums" placeholder="Maximum" />
                            </div>
                        </Field>
                    </div>
                    <div className="md:col-span-12">
                        <Field label="Conclusion" tone="manual" full>
                            <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                                <Select value={computedConformite} onChange={() => {}} readOnly>
                                    <option value="conforme">✓ Conforme</option>
                                    <option value="non_conforme">✕ Non conforme</option>
                                    <option value="pour_info">ℹ Pour info</option>
                                </Select>
                                <Input value={meta.conclusion_courte || ''} onChange={(event) => handleMetaChange('conclusion_courte', event.target.value)} readOnly={isApproved} placeholder="Complément éventuel" className="min-w-0 w-full" />
                            </div>
                        </Field>
                    </div>
                    <div className="md:col-span-12">
                        <Field label="Commentaires" tone="manual" full>
                        <Textarea value={meta.commentaires || ''} onChange={(value) => handleMetaChange('commentaires', value)} rows={3} readOnly={isApproved} />
                        </Field>
                    </div>
                </div>
            </Card>

            <Card
                title="Points de mesure DE"
                description={`${pointsRows.length} point${pointsRows.length > 1 ? 's' : ''} saisi${pointsRows.length > 1 ? 's' : ''}.`}
                right={<Button variant="secondary" size="sm" onClick={handleAddRow} disabled={isApproved}>+ Ajouter une ligne</Button>}
            >
                <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Row label="Moyenne compacité" value={formatResult(summary?.moyenne_compacite_pct, '%')} />
                    <Row label="Moyenne vides" value={formatResult(summary?.moyenne_vides_pct, '%')} />
                    <Row label="Moyenne masse volumique" value={formatResult(summary?.moyenne_mv, 'g/cm³')} />
                </div>
                {pointsRows.length ? (
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[1040px] text-[12px]">
                            <thead className="bg-bg">
                                <tr>
                                    <th className="border-b border-border px-2 py-2 text-left font-semibold text-text-muted">Point</th>
                                    <th className="border-b border-border px-2 py-2 text-left font-semibold text-text-muted">Profil</th>
                                    <th className="border-b border-border px-2 py-2 text-left font-semibold text-text-muted">Position</th>
                                    <th className="border-b border-border px-2 py-2 text-right font-semibold text-text-muted">MV (g/cm³)</th>
                                    <th className="border-b border-border px-2 py-2 text-right font-semibold text-text-muted">Compacité (%)</th>
                                    <th className="border-b border-border px-2 py-2 text-right font-semibold text-text-muted">Vides (%)</th>
                                    <th className="border-b border-border px-2 py-2 text-left font-semibold text-text-muted">Observation</th>
                                    <th className="border-b border-border px-2 py-2 text-center font-semibold text-text-muted">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pointsRows.map((row, index) => (
                                    (() => {
                                        const videsNonConforme = isDeVidesNonConforme(
                                            row?.vides_pct,
                                            meta?.criteria_void_min,
                                            meta?.criteria_void_max
                                        )
                                        return (
                                    <tr key={row?.id || row?.point || index} className="border-b border-border last:border-b-0 odd:bg-surface even:bg-bg/40">
                                        <td className="px-2 py-1.5">
                                            <Input value={row?.point ?? ''} onChange={(event) => handleRowChange(index, 'point', event.target.value)} className="min-w-[90px]" readOnly={isApproved} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <Input value={row?.profil ?? ''} onChange={(event) => handleRowChange(index, 'profil', event.target.value)} className="min-w-[90px]" readOnly={isApproved} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <Input value={row?.position ?? ''} onChange={(event) => handleRowChange(index, 'position', event.target.value)} className="min-w-[120px]" readOnly={isApproved} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <NumericInput value={row?.masse_volumique} onChange={(event) => handleRowChange(index, 'masse_volumique', event.target.value)} readOnly={isApproved} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <NumericInput value={row?.compacite_pct} onChange={(event) => handleRowChange(index, 'compacite_pct', event.target.value)} readOnly={isApproved} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <NumericInput
                                                value={row?.vides_pct}
                                                onChange={(event) => handleRowChange(index, 'vides_pct', event.target.value)}
                                                readOnly={isApproved}
                                                className={videsNonConforme ? 'border-[#e11d48] bg-[#fff1f2] text-[#9f1239] font-semibold' : ''}
                                            />
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <Input value={row?.observations || ''} onChange={(event) => handleRowChange(index, 'observations', event.target.value)} readOnly={isApproved} />
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                            <Button variant="danger" size="sm" onClick={() => handleRemoveRow(index)} disabled={isApproved}>Supprimer</Button>
                                        </td>
                                    </tr>
                                        )
                                    })()
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-8 text-center text-sm text-text-muted">
                        Aucun point saisi. Ajoute une ligne ou importe une feuille DE existante.
                    </div>
                )}
            </Card>
        </div>
    )
}


export default function ModeleBasePage() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const { code: codeParam } = useParams()
    const [searchParams] = useSearchParams()

    const code = normalizeCode(codeParam)
    const sourceFamily = String(searchParams.get('source_family') || '').trim().toLowerCase()
    const sourceUid = searchParams.get('source_uid')
    const family = TERRAIN_CODES.has(code) ? 'terrain' : 'labo'
    const storageKey = `ralab5_modele_base_${code}`

    const initialDraft = useMemo(() => {
        if (code === 'DE') {
            const migrated = migrateLegacyDeDraftIfNeeded()
            const modelDefinition = migrated.model || getModelDefinitionDE()
            if (modelDefinition) {
                return {
                    id: String(modelDefinition.id || ''),
                    reference: String(modelDefinition.reference || ''),
                    values: modelDefinition.values && typeof modelDefinition.values === 'object' ? modelDefinition.values : {},
                    source: modelDefinition.source && typeof modelDefinition.source === 'object' ? modelDefinition.source : null,
                    status: modelDefinition.status === 'approved' ? 'approved' : 'draft',
                    migrated: migrated.migrated,
                }
            }
        }

        try {
            const raw = localStorage.getItem(storageKey)
            if (!raw) return { id: '', reference: '', values: {}, source: null, status: 'draft', migrated: false }

            const parsed = JSON.parse(raw)
            if (!parsed || typeof parsed !== 'object') return { id: '', reference: '', values: {}, source: null, status: 'draft', migrated: false }

            return {
                id: String(parsed.id || ''),
                reference: String(parsed.reference || ''),
                values: parsed.values && typeof parsed.values === 'object' ? parsed.values : {},
                source: parsed.source && typeof parsed.source === 'object' ? parsed.source : null,
                status: parsed.status === 'approved' ? 'approved' : 'draft',
                migrated: false,
            }
        } catch {
            return { id: '', reference: '', values: {}, source: null, status: 'draft', migrated: false }
        }
    }, [code, storageKey])

    const initialModelDefinitions = useMemo(
        () => (code === 'DE' ? listModelDefinitionsDE() : []),
        [code]
    )
    const [modelDefinitions, setModelDefinitions] = useState(initialModelDefinitions)
    // NOTE:
    // Multi-model list/selection is DE-first implementation.
    // This model lifecycle pattern (draft -> approved -> selectable versions) should be reused per essai type.
    const [selectedModelId, setSelectedModelId] = useState(() => (
        code === 'DE'
            ? String(initialModelDefinitions[0]?.id || initialDraft?.id || '')
            : ''
    ))

    const [reference, setReference] = useState(initialDraft.reference)
    const [values, setValues] = useState(initialDraft.values)
    const [deDraft, setDeDraft] = useState(toDeDraft(initialDraft.values))
    const [source, setSource] = useState(initialDraft.source)
    const [modelStatus, setModelStatus] = useState(initialDraft.status)
    const [lookup, setLookup] = useState('')
    const [loading, setLoading] = useState(false)
    const [pointPickerOpen, setPointPickerOpen] = useState(false)
    const [pointPickerCandidates, setPointPickerCandidates] = useState([])
    const [pointPickerContext, setPointPickerContext] = useState(null) // { sourceValues, sourceInfo }
    const [rapportModels, setRapportModels] = useState(() => (code === 'DE' ? listRapportModelDefinitionsDE() : []))
    const [selectedRapportModelId, setSelectedRapportModelId] = useState(() => {
        if (code !== 'DE') return ''
        const first = listRapportModelDefinitionsDE()[0]
        return first?.id || ''
    })
    const [result, setResult] = useState(
        initialDraft.migrated
            ? { type: 'ok', msg: 'Ancien brouillon DE migré vers le contrat ModelDefinitionDE v1.' }
            : null
    )
    const [equipmentOptions, setEquipmentOptions] = useState([])
    const [equipmentLoading, setEquipmentLoading] = useState(false)
    const [equipmentError, setEquipmentError] = useState('')
    const deMeta = deDraft?.meta || {}
    const isStructuredModel = code === 'DE'
    const isModelLocked = isStructuredModel && modelStatus === 'approved'
    const modelMeta = code === 'DE'
    ? deMeta
    : (
        values?.meta && typeof values.meta === 'object'
            ? values.meta
            : values && typeof values === 'object'
                ? values
                : {}
    )

    const hasDraftContent = useMemo(() => {
        if (code !== 'DE') return false
        if (String(reference || '').trim()) return true
        if (source && typeof source === 'object') return true
        const rows = Array.isArray(deDraft?.points_rows) ? deDraft.points_rows : []
        if (rows.length > 0) return true
        const meta = deDraft?.meta && typeof deDraft.meta === 'object' ? deDraft.meta : {}
        return Object.keys(meta).length > 0
    }, [code, reference, source, deDraft])
    useEffect(() => {
        let cancelled = false
    
        async function loadEquipmentOptions() {
            if (code !== 'DE') {
                setEquipmentOptions([])
                setEquipmentError('')
                setEquipmentLoading(false)
                return
            }
    
            setEquipmentLoading(true)
            setEquipmentError('')
    
            try {
                const rows = await qualiteApi.equipmentOptions.list({
                    usage: 'gammadensimetre_de',
                })
                const usageRows = Array.isArray(rows) ? rows : []
                const gammaTerms = ['gamma', 'gammadens', 'densim', 'densimetre', 'pqi', 'troxler', 'nucleaire']
                const equipmentRows = await qualiteApi.equipment.list().catch(() => [])
                const terrainRows = (Array.isArray(equipmentRows) ? equipmentRows : [])
                    .filter((item) => String(item?.category || '').trim() === 'Terrain')
                    .filter((item) => String(item?.status || '').trim() === 'En service')
                    .filter((item) => {
                        const searchable = normalizeSearchText(
                            [
                                item?.code,
                                item?.label,
                                item?.domain,
                                item?.serial_number,
                                item?.notes,
                            ].filter(Boolean).join(' ')
                        )
                        return gammaTerms.some((term) => searchable.includes(term))
                    })
                    .map((item) => {
                        const code = String(item?.code || '').trim()
                        const label = String(item?.label || '').trim()
                        const serial = String(item?.serial_number || '').trim()
                        return {
                            value: code || label || String(item?.uid || ''),
                            label: code && label ? `${code} - ${label}${serial ? ` (${serial})` : ''}` : label || code || String(item?.uid || ''),
                            equipment_id: item?.uid || null,
                            calibration_date: item?.last_metrology || '',
                            last_metrology: item?.last_metrology || '',
                        }
                    })

                const mergedByValue = new Map()
                for (const item of [...usageRows, ...terrainRows]) {
                    const key = String(item?.value || '').trim().toUpperCase()
                    if (!key) continue
                    const current = mergedByValue.get(key)
                    if (!current) {
                        mergedByValue.set(key, item)
                        continue
                    }
                    const currentCalib = String(current?.calibration_date || current?.last_metrology || '').trim()
                    const nextCalib = String(item?.calibration_date || item?.last_metrology || '').trim()
                    // Keep the most complete duplicate (prefer one carrying metrology date).
                    if (!currentCalib && nextCalib) {
                        mergedByValue.set(key, { ...current, ...item })
                    }
                }
                const normalizedRows = Array.from(mergedByValue.values())

                if (!cancelled) {
                    setEquipmentOptions(normalizedRows)
                }
            } catch (error) {
                if (!cancelled) {
                    setEquipmentOptions([])
                    setEquipmentError(error?.message || 'Chargement des équipements impossible.')
                }
            } finally {
                if (!cancelled) {
                    setEquipmentLoading(false)
                }
            }
        }
    
        loadEquipmentOptions()
    
        return () => {
            cancelled = true
        }
    }, [code])
    const selectedRapportModel = useMemo(
        () => getRapportModelDefinitionDEById(selectedRapportModelId) || rapportModels[0] || null,
        [selectedRapportModelId, rapportModels]
    )
    const rapportStatus = selectedRapportModel?.status === 'approved' ? 'approved' : 'draft'

    function refreshModelDefinitions(nextSelectedId = selectedModelId) {
        if (code !== 'DE') return
        const nextModels = listModelDefinitionsDE()
        setModelDefinitions(nextModels)
        if (!nextModels.length) {
            setSelectedModelId('')
            return
        }
        const targetId = String(nextSelectedId || '')
        const exists = targetId ? nextModels.some((item) => String(item.id) === targetId) : false
        setSelectedModelId(exists ? targetId : String(nextModels[0].id))
    }

    useEffect(() => {
        if (code !== 'DE') return
        if (!hasDraftContent) return
        const existing = listModelDefinitionsDE()
        if (existing.length > 0) return

        const created = upsertModelDefinitionDE({
            id: String(selectedModelId || `DE-model-${Date.now()}`),
            reference: String(reference || ''),
            status: modelStatus === 'approved' ? 'approved' : 'draft',
            values: getNormalizedValues(),
            source: source && typeof source === 'object' ? source : null,
        })
        refreshModelDefinitions(created.id)
    }, [code, hasDraftContent])

    useEffect(() => {
        if (code !== 'DE') return
        if (!selectedModelId) return
        const current = modelDefinitions.find((item) => String(item.id) === String(selectedModelId))
        if (!current) return
        setReference(String(current.reference || ''))
        const currentValues = current.values && typeof current.values === 'object' ? current.values : {}
        setValues(currentValues)
        setDeDraft(toDeDraft(currentValues))
        setSource(current.source && typeof current.source === 'object' ? current.source : null)
        setModelStatus(current.status === 'approved' ? 'approved' : 'draft')
    }, [code, modelDefinitions, selectedModelId])

    function createNewModelDefinition() {
        if (code !== 'DE') return
        const nextId = `DE-model-${Date.now()}`
        setSelectedModelId(nextId)
        setReference('')
        setValues({})
        setDeDraft({ meta: {}, points_rows: [] })
        setSource(null)
        setModelStatus('draft')
        setResult({ type: 'ok', msg: 'Nouveau modèle DE prêt. Renseigne puis enregistre.' })
    }

    useEffect(() => {
        if (code !== 'DE') return
        refreshModelDefinitions(selectedModelId)
    }, [code])

    function refreshRapportModels(nextSelectedId = selectedRapportModelId) {
        if (code !== 'DE') return
        const nextModels = listRapportModelDefinitionsDE()
        setRapportModels(nextModels)
        if (!nextModels.length) {
            setSelectedRapportModelId('')
            return
        }
        const exists = nextModels.some((item) => String(item.id) === String(nextSelectedId))
        setSelectedRapportModelId(exists ? nextSelectedId : nextModels[0].id)
    }

    function persist(next) {
        if (code === 'DE') {
            const saved = upsertModelDefinitionDE({
                id: String(next.id || selectedModelId || `DE-model-${Date.now()}`),
                reference: next.reference,
                status: next.status,
                values: next.values,
                source: next.source,
            })
            refreshModelDefinitions(saved.id)
            return saved
        }

        localStorage.setItem(storageKey, JSON.stringify(next))
        return null
    }

    function getNormalizedValues() {
        if (code !== 'DE') return values

        const rows = Array.isArray(deDraft.points_rows) ? deDraft.points_rows : []
        const summary = computeDeSummary(rows)
        const computedConformite = computeDeConformiteValue(
            summary?.moyenne_vides_pct,
            deDraft?.meta?.criteria_void_min,
            deDraft?.meta?.criteria_void_max
        )
        return {
            ...values,
            meta: {
                ...(deDraft.meta || {}),
                conformite: computedConformite,
            },
            points_rows: rows,
            resume: summary,
        }
    }

    async function persistFeuilleTerrainDeIfNeeded(normalizedValues) {
        if (code !== 'DE') return
        const terrainUid = source?.family === 'terrain' ? String(source.uid || '').trim() : ''
        if (!terrainUid) return
        const fresh = await feuillesTerrainApi.get(terrainUid)
        const basePayload = fresh?.payload && typeof fresh.payload === 'object' ? fresh.payload : {}
        const rows = Array.isArray(normalizedValues?.points_rows) ? normalizedValues.points_rows : []
        const summary = normalizedValues?.resume && typeof normalizedValues.resume === 'object'
            ? normalizedValues.resume
            : computeDeSummary(rows)
        const nextPayload = {
            ...basePayload,
            meta: normalizedValues?.meta && typeof normalizedValues.meta === 'object' ? normalizedValues.meta : {},
            points_rows: rows,
            resume: summary,
        }
        await feuillesTerrainApi.update(terrainUid, {
            label: fresh?.label || '',
            date_feuille: fresh?.date_feuille || '',
            operateur: fresh?.operateur || '',
            observations: fresh?.observations || '',
            payload: nextPayload,
        })
    }

    function saveDraft() {
        const normalizedValues = getNormalizedValues()
        setValues(normalizedValues)
        const saved = persist({ id: selectedModelId, reference, status: modelStatus, values: normalizedValues, source })
        if (saved?.id) setSelectedModelId(String(saved.id))
        void (async () => {
            try {
                await persistFeuilleTerrainDeIfNeeded(normalizedValues)
                if (source?.family === 'terrain' && source?.uid) {
                    queryClient.invalidateQueries({ queryKey: ['feuille-terrain', String(source.uid)] })
                }
            } catch (e) {
                setResult({ type: 'err', msg: e?.message || 'Synchronisation feuille terrain impossible.' })
                return
            }
            setResult({
                type: 'ok',
                msg: source?.family === 'terrain'
                    ? 'Modèle enregistré (local) et feuille terrain synchronisée sur le serveur.'
                    : 'Modèle de base enregistré localement.',
            })
        })()
    }

    function applyModelStatus(nextStatus) {
        // NOTE:
        // Status transition currently controls DE model approval.
        // Work page later associates approved feuille + approved rapport and publishes runtime snapshots.
        const normalizedStatus = nextStatus === 'approved' ? 'approved' : 'draft'
        const normalizedValues = getNormalizedValues()
        const next = { id: selectedModelId, reference, status: normalizedStatus, values: normalizedValues, source }

        setValues(normalizedValues)
        setModelStatus(normalizedStatus)
        const saved = persist(next)
        if (saved?.id) setSelectedModelId(String(saved.id))
        void (async () => {
            try {
                await persistFeuilleTerrainDeIfNeeded(normalizedValues)
                if (source?.family === 'terrain' && source?.uid) {
                    queryClient.invalidateQueries({ queryKey: ['feuille-terrain', String(source.uid)] })
                }
            } catch (e) {
                setResult({ type: 'err', msg: e?.message || 'Synchronisation feuille terrain impossible.' })
                return
            }
            setResult({
                type: 'ok',
                msg: normalizedStatus === 'approved'
                    ? 'Modèle DE approuvé. Édition structurelle verrouillée.'
                    : 'Modèle DE repassé en brouillon. Édition réactivée.',
            })
        })()
    }

    function clearDraft() {
        if (code === 'DE' && selectedModelId) {
            const deleted = deleteModelDefinitionDEById(selectedModelId)
            if (deleted) {
                const remaining = listModelDefinitionsDE()
                const nextModel = remaining[0] || null
                setSelectedModelId(String(nextModel?.id || ''))
                setReference(String(nextModel?.reference || ''))
                setValues(nextModel?.values && typeof nextModel.values === 'object' ? nextModel.values : {})
                setDeDraft(toDeDraft(nextModel?.values && typeof nextModel.values === 'object' ? nextModel.values : {}))
                setSource(nextModel?.source && typeof nextModel.source === 'object' ? nextModel.source : null)
                setModelStatus(nextModel?.status === 'approved' ? 'approved' : 'draft')
                refreshModelDefinitions(String(nextModel?.id || ''))
                setResult({
                    type: 'ok',
                    msg: nextModel
                        ? 'Modèle actuel supprimé. Les autres modèles DE sont conservés.'
                        : 'Modèle actuel supprimé. Aucun autre modèle DE enregistré.',
                })
                return
            }
        }

        setReference('')
        setValues({})
        setDeDraft({ meta: {}, points_rows: [] })
        setSource(null)
        setModelStatus('draft')
        setLookup('')
        setSelectedModelId('')

        if (code === 'DE') deleteModelDefinitionDE()
        localStorage.removeItem(storageKey)
        refreshModelDefinitions('')
        refreshRapportModels('')
        setResult({ type: 'ok', msg: 'Modèle de base réinitialisé.' })
    }
     function openDeReport() {
        if (code !== 'DE') return

        const terrainUid = source?.family === 'terrain'
            ? source?.uid
            : sourceFamily === 'terrain'
                ? sourceUid
                : null
        const reportId = source?.reference || lookup || reference || terrainUid || 'modele'
        const query = terrainUid
            ? `?source_family=terrain&source_uid=${encodeURIComponent(String(terrainUid))}`
            : ''
        navigate(`/rapports/de/${encodeURIComponent(String(reportId))}${query}`)
    }
    function applyImportedSourceValues(sourceValues) {
        const nextValues = sourceValues && typeof sourceValues === 'object' ? sourceValues : {}
    
        setValues(nextValues)
    
        if (code === 'DE') {
            setDeDraft(toDeDraft(nextValues))
            return
        }
    }

    useEffect(() => {
        if (code !== 'DE') return
        if (sourceFamily !== 'terrain' || !String(sourceUid || '').trim()) return

        let cancelled = false
        ;(async () => {
            setLoading(true)
            setResult(null)
            try {
                const src = await feuillesTerrainApi.get(sourceUid)
                if (cancelled) return
                const payloadValues = src?.payload && typeof src.payload === 'object' ? src.payload : {}
                const feuillePoints = Array.isArray(src?.points) ? src.points : []
                const sourceValues = {
                    ...payloadValues,
                    points: feuillePoints,
                    sondages: feuillePoints,
                }
                const sourceInfo = { family: 'terrain', uid: src?.uid || sourceUid, reference: src?.reference || `#${sourceUid}` }
                setValues(sourceValues)
                setDeDraft(toDeDraft(sourceValues))
                setSource(sourceInfo)
                if (src?.reference) setReference(String(src.reference))
                setResult({
                    type: 'ok',
                    msg: `Feuille DE ${src?.reference || sourceUid} ouverte — enregistrez avec « Enregistrer le brouillon » pour synchroniser le serveur.`,
                })
            } catch (e) {
                if (!cancelled) {
                    setResult({ type: 'err', msg: e?.message || 'Impossible de charger la feuille terrain.' })
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [code, sourceFamily, sourceUid])

    function maybeOpenPointPickerForSheet(sourceValues, sourceInfo) {
        const needsPointSelection = code === 'SO'
        if (!needsPointSelection) return false
        const candidates = extractSheetPointCandidates(sourceValues)
        if (candidates.length <= 1) return false
        setPointPickerCandidates(candidates)
        setPointPickerContext({ sourceValues, sourceInfo })
        setPointPickerOpen(true)
        setSource(sourceInfo)
        setResult({ type: 'ok', msg: `Feuille chargée: sélectionne un point (${candidates.length} disponibles).` })
        return true
    }

    function handlePickSheetPoint(candidate) {
        if (!pointPickerContext) return
        const selectedValues = buildSinglePointValues(pointPickerContext.sourceValues, candidate)
        applyImportedSourceValues(selectedValues)
        setSource(pointPickerContext.sourceInfo || null)
        setPointPickerOpen(false)
        setPointPickerCandidates([])
        setPointPickerContext(null)
        setResult({ type: 'ok', msg: `Point ${candidate?.pointCode || candidate?.uid} chargé dans le modèle.` })
    }

    function closePointPicker() {
        setPointPickerOpen(false)
        setPointPickerCandidates([])
        setPointPickerContext(null)
    }
    async function importValuesFromSource() {
        const raw = String(lookup || '').trim()
        const sampleRefByCode = '2022-SP-DE0003'

        if (!raw && !(sourceUid && sourceFamily)) {
            setResult({ type: 'err', msg: `Indique une référence, par exemple ${sampleRefByCode}, ou un UID pour importer des valeurs.` })
            return
        }

        setLoading(true)
        setResult(null)

        try {
            if (!raw && sourceFamily === 'terrain' && sourceUid) {
                const src = await feuillesTerrainApi.get(sourceUid)
                const payloadValues = src?.payload && typeof src.payload === 'object' ? src.payload : {}
                const feuillePoints = Array.isArray(src?.points) ? src.points : []
                const sourceValues = {
                    ...payloadValues,
                    points: feuillePoints,
                    sondages: feuillePoints,
                }
                const sourceInfo = { family: 'terrain', uid: src?.uid || sourceUid, reference: src?.reference || `#${sourceUid}` }
                if (maybeOpenPointPickerForSheet(sourceValues, sourceInfo)) return
                applyImportedSourceValues(sourceValues)
                setSource(sourceInfo)
                setResult({ type: 'ok', msg: `Valeurs importées depuis la feuille terrain ${src?.reference || `#${sourceUid}`}.` })
                return
            }

            if (!raw && sourceFamily === 'essai' && sourceUid) {
                const src = await essaisApi.get(sourceUid)
                const sourceValues = extractEssaiValues(src)
                const sourceInfo = { family: 'essai', uid: src?.uid || sourceUid, reference: src?.reference || src?.essai_code || `#${sourceUid}` }
                if (maybeOpenPointPickerForSheet(sourceValues, sourceInfo)) return
                applyImportedSourceValues(sourceValues)
                setSource(sourceInfo)
                setResult({ type: 'ok', msg: `Valeurs importées depuis l’essai ${src?.reference || src?.essai_code || `#${sourceUid}`}.` })
                return
            }

            const [terrainRowsRaw, essaiRowsRaw] = await Promise.all([
                feuillesTerrainApi.list({ q: raw, limit: 20, code_feuille: code }).catch(() => []),
                essaisApi.list({ q: raw, limit: 30, essai_code: code }).catch(() => []),
            ])

            const terrainRows = Array.isArray(terrainRowsRaw) ? terrainRowsRaw : []
            const essaiRows = Array.isArray(essaiRowsRaw) ? essaiRowsRaw : []
            const rawUpper = raw.toUpperCase()

            const exactEssai = essaiRows.find((row) => String(row?.reference || '').toUpperCase() === rawUpper)
            const exactTerrain = terrainRows.find((row) => String(row?.reference || '').toUpperCase() === rawUpper)
            const exactByUid = [...essaiRows, ...terrainRows].find((row) => String(row?.uid || '') === raw)
            const exactMatch = exactByUid
                ? { kind: essaiRows.includes(exactByUid) ? 'essai' : 'terrain', uid: exactByUid.uid, row: exactByUid }
                : exactEssai
                    ? { kind: 'essai', uid: exactEssai.uid, row: exactEssai }
                    : exactTerrain
                        ? { kind: 'terrain', uid: exactTerrain.uid, row: exactTerrain }
                        : null

            if (!exactMatch?.uid) {
                setResult({ type: 'err', msg: `Aucune feuille ou aucun essai trouvé pour « ${raw} ».` })
                return
            }

            if (exactMatch.kind === 'terrain') {
                const src = await feuillesTerrainApi.get(exactMatch.uid)
                const payloadValues = src?.payload && typeof src.payload === 'object' ? src.payload : {}
                const feuillePoints = Array.isArray(src?.points) ? src.points : []
                const sourceValues = {
                    ...payloadValues,
                    points: feuillePoints,
                    sondages: feuillePoints,
                }
                const sourceInfo = { family: 'terrain', uid: src?.uid || exactMatch.uid, reference: src?.reference || exactMatch.row?.reference || `#${exactMatch.uid}` }
                if (maybeOpenPointPickerForSheet(sourceValues, sourceInfo)) return
                applyImportedSourceValues(sourceValues)
                setSource(sourceInfo)
                setResult({ type: 'ok', msg: `Valeurs chargées depuis la feuille terrain ${src?.reference || exactMatch.row?.reference || `#${exactMatch.uid}`}.` })
                return
            }

            const src = await essaisApi.get(exactMatch.uid)
            const sourceValues = extractEssaiValues(src)
            const sourceInfo = { family: 'essai', uid: src?.uid || exactMatch.uid, reference: src?.reference || src?.essai_code || `#${exactMatch.uid}` }
            if (maybeOpenPointPickerForSheet(sourceValues, sourceInfo)) return
            applyImportedSourceValues(sourceValues)
            setSource(sourceInfo)
            setResult({ type: 'ok', msg: `Valeurs chargées depuis l’essai ${src?.reference || src?.essai_code || `#${exactMatch.uid}`}.` })
        } catch (error) {
            setResult({ type: 'err', msg: `Erreur pendant l’import des valeurs : ${error?.message || 'échec inconnu'}` })
        } finally {
            setLoading(false)
        }
    }

    function applyRapportStatus(nextStatus) {
        if (code !== 'DE') return
        const targetModel = selectedRapportModel || upsertRapportModelDefinitionDE({
            reference: reference ? `${reference}-RAPPORT` : 'DE-RAPPORT',
            status: 'draft',
            template: {},
        })
        const normalizedStatus = nextStatus === 'approved' ? 'approved' : 'draft'
        const updated = upsertRapportModelDefinitionDE({
            ...targetModel,
            status: normalizedStatus,
        })
        refreshRapportModels(updated.id)
        setResult({
            type: 'ok',
            msg: normalizedStatus === 'approved'
                ? 'Modèle de rapport DE approuvé.'
                : 'Modèle de rapport DE repassé en brouillon.',
        })
    }

    function createRapportModel() {
        const baseName = buildRapportBaseNameFromModelReference(reference, code || 'DE')
        const nextVersion = nextRapportVersionForBase(baseName, rapportModels)
        const created = upsertRapportModelDefinitionDE({
            reference: `${baseName}-RAPPORT-v${nextVersion}`,
            status: 'draft',
            template: {},
        })
        refreshRapportModels(created.id)
        setResult({ type: 'ok', msg: `Nouveau modèle de rapport créé (${created.reference}).` })
    }

    function updateSelectedRapportReference(value) {
        const targetModel = selectedRapportModel
        if (!targetModel) return
        const updated = upsertRapportModelDefinitionDE({
            ...targetModel,
            reference: value,
        })
        refreshRapportModels(updated.id)
    }

    return (
        <FichePageShell>
            <FicheTopbar
                eyebrow="Modèle de base"
                title={`Modèle de base — ${code || 'SANS-CODE'}`}
                subtitle="Paramétrage et contrôle du formulaire d’essai."
            >
                <Badge className="border-border bg-bg text-text-muted">Famille : {family}</Badge>
                {isStructuredModel ? (
                    <Badge className={getStatusClass(modelStatus)}>{getStatusLabel(modelStatus)}</Badge>
                ) : null}
                {isStructuredModel ? (
                    <Badge className={getStatusClass(rapportStatus)}>Rapport {getStatusLabel(rapportStatus)}</Badge>
                ) : null}
                {isStructuredModel && modelStatus === 'approved' ? (
                    <Badge className="border-[#abc3e8] bg-[#eef5ff] text-[#315b97]">Lecture seule</Badge>
                ) : null}
            </FicheTopbar>

            <FicheMain className="max-w-[1280px] gap-4">
            <>
                    {isModelLocked ? (
                        <div className="rounded-xl border border-[#abc3e8] bg-[#f3f8ff] px-4 py-3 text-sm text-[#315b97]">
                            Modèle approuvé : l’édition est verrouillée. Utilise « Repasser en brouillon » pour modifier la structure.
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_430px]">
                <Card title="En-tête du modèle" description="Référence interne et statut de validation du modèle.">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-xs text-text-muted">
                            <span className="font-medium uppercase tracking-wide">Référence du modèle</span>
                            <input
                                value={reference}
                                onChange={(event) => setReference(event.target.value)}
                                placeholder={`Ex. : MODELE-${code || 'XX'}-001`}
                                readOnly={isModelLocked}
                                className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge read-only:cursor-default read-only:opacity-80"
                            />
                        </label>
                        {isStructuredModel ? (
                            <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-muted">
                                <span>
                                    Statut du modèle {code} :{' '}
                                    <span className={`font-semibold ${modelStatus === 'approved' ? 'text-[#3b6d11]' : 'text-[#8a5c11]'}`}>
                                        {getStatusLabel(modelStatus)}
                                    </span>
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="primary" size="sm" onClick={() => applyModelStatus('approved')} disabled={modelStatus === 'approved'}>
                                        Approuver le modèle
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={() => applyModelStatus('draft')} disabled={modelStatus === 'draft'}>
                                        Repasser en brouillon
                                    </Button>
                                </div>
                                <div className="rounded-lg border border-dashed border-border bg-surface px-2 py-2">
                                    Gestion du modèle {code}. La feuille métier commence dans le bloc “Structure du modèle”.
                                </div>
                            </div>
                        ) : null}
                        {code === 'DE' ? (
                            <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-text-muted md:col-span-2">
                                <span className="font-medium uppercase tracking-wide">Modèles DE existants</span>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <select
                                        value={selectedModelId || ''}
                                        onChange={(event) => setSelectedModelId(String(event.target.value || ''))}
                                        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-nge"
                                    >
                                        <option value="">Sélectionner un modèle…</option>
                                        {modelDefinitions.map((item) => (
                                            <option key={item.id} value={String(item.id)}>
                                                {item.reference || item.id} · {item.status === 'approved' ? 'Approuvé' : 'Brouillon'}
                                            </option>
                                        ))}
                                    </select>
                                    <Button variant="secondary" onClick={createNewModelDefinition}>Nouveau modèle</Button>
                                </div>
                                <div className="text-[11px]">
                                    {modelDefinitions.length} modèle(s) enregistré(s) pour DE.
                                </div>
                            </div>
                        ) : null}
                    </div>
                </Card>

                <Card title="Import de valeurs de référence" description="Import d’aide, sans modification de la structure UI.">
                    <div className="flex flex-col gap-3">
                        <p className="text-[12px] text-text-muted">
                            Utilise une référence d’essai ou de feuille, par exemple 2022-SP-XX0001, pour charger des valeurs de test dans le modèle vierge.
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
                            <input
                                value={lookup}
                                onChange={(event) => setLookup(event.target.value)}
                                placeholder={`Ex. : 2022-SP-${code || 'XX'}0003`}
                                readOnly={isModelLocked}
                                className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge read-only:cursor-default read-only:opacity-80"
                            />
                            <Button variant="primary" onClick={importValuesFromSource} disabled={loading || isModelLocked}>
                                {loading ? 'Import en cours...' : 'Importer'}
                            </Button>
                        </div>
                        {source ? (
                            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-[11px] text-text-muted">
                                Source actuelle : {source.family} — {source.reference} (uid {source.uid})
                            </div>
                        ) : null}
                        {isStructuredModel ? (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                <label className="flex flex-col gap-1 text-xs text-text-muted">
                                    <span className="font-medium uppercase tracking-wide">Affaire NGE</span>
                                    <Input
                                        value={modelMeta.affaire_nge_raw || modelMeta.affaire_nge || modelMeta.affaire || ''}
                                        placeholder="Ex. : RAP00A"
                                        readOnly
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-text-muted">
                                    <span className="font-medium uppercase tracking-wide">Chrono</span>
                                    <Input
                                        value={modelMeta.chrono || modelMeta.numero_chrono || modelMeta.reference_feuille || ''}
                                        placeholder="Chrono terrain / feuille"
                                        readOnly
                                    />
                                </label>
                            </div>
                        ) : null}
                    </div>
                </Card>
            </div>
                </>

            {/*
                REPORT MANAGEMENT BLOCK MOVED OUT OF ModeleBasePage

                The report reference, report status, report approval and report list
                must be handled inside the report pages, not inside the base model page.

                Target pages:
                - RapportDEPage.jsx
                - RapportSCPage.jsx
                - future report pages

                RapportToolbar.jsx remains separate and belongs to the report page actions:
                print, PDF export, email sending, validation, archiving, etc.
            */}

                <Card
                    title="Structure du modèle"
                    overflow="hidden"
                    bodyClassName="p-4"
                    description={
                        code === 'DE'
                            ? 'Structure métier dédiée au contrôle de densité enrobés.'
                            : 'Structure JSON provisoire pour les autres codes.'
                    }
                >
                {code === 'DE' ? (
                    renderDeView({
                        data: { code_feuille: 'DE', norme: 'NF P 98-241-1', statut: 'MODELE BASE' },
                        draft: deDraft,
                        isApproved: modelStatus === 'approved',
                        equipmentOptions,
                        equipmentLoading,
                        equipmentError,

                        onMetaChange: (key, value) => setDeDraft((prev) => {
                            const prevMeta = { ...(prev?.meta || {}) }
                            const nextMeta = { ...prevMeta, [key]: value }
                            if (key !== 'mvre') {
                                return { ...prev, meta: nextMeta }
                            }
                            const rows = Array.isArray(prev?.points_rows) ? prev.points_rows : []
                            const nextRows = rows.map((row) => applyDeComputedFields(row, value, 'mvre'))
                            return { ...prev, meta: nextMeta, points_rows: nextRows }
                        }),
                        onRowChange: (index, key, value) => setDeDraft((prev) => {
                            const rows = Array.isArray(prev?.points_rows) ? [...prev.points_rows] : []
                            const nextRow = { ...(rows[index] || {}), [key]: value }
                            rows[index] = applyDeComputedFields(nextRow, prev?.meta?.mvre, key)
                            return { ...prev, points_rows: rows }
                        }),
                        onAddRow: () => setDeDraft((prev) => ({
                            ...prev,
                            points_rows: [
                                ...(Array.isArray(prev?.points_rows) ? prev.points_rows : []),
                                { id: Date.now(), point: '', profil: '', position: '', masse_volumique: '', compacite_pct: '', vides_pct: '', observations: '' },
                            ],
                        })),
                        onRemoveRow: (index) => setDeDraft((prev) => ({
                            ...prev,
                            points_rows: (Array.isArray(prev?.points_rows) ? prev.points_rows : []).filter((_, idx) => idx !== index),
                        })),
                    })
                ) : (
                    <textarea
                        value={JSON.stringify(values || {}, null, 4)}
                        onChange={(event) => {
                            const parsed = safeParseJson(event.target.value)
                            if (parsed) setValues(parsed)
                        }}
                        className="h-[320px] w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-nge"
                    />
                )}
            </Card>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm">
                    <Button variant="primary" onClick={saveDraft} disabled={isModelLocked}>
                        Enregistrer le brouillon
                    </Button>

                    {code === 'DE' ? (
                        <Button variant="secondary" onClick={openDeReport}>
                            Ouvrir le rapport DE
                        </Button>
                    ) : null}

                    <Button variant="ghost" onClick={clearDraft}>
                        Réinitialiser le modèle
                    </Button>
                </div>

            {result ? (
                <div className={`rounded-lg border px-3 py-2 text-xs ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
                    {result.msg}
                </div>
            ) : null}

            {pointPickerOpen ? (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-[560px] rounded-xl border border-border bg-surface shadow-xl">
                        <div className="border-b border-border px-4 py-3">
                            <div className="text-sm font-semibold text-text">Selecionar ponto da folha</div>
                            <div className="mt-1 text-xs text-text-muted">
                                Escolhe o ponto a carregar no modelo ({pointPickerCandidates.length} disponíveis).
                            </div>
                        </div>
                        <div className="max-h-[320px] overflow-auto p-4">
                            <div className="flex flex-col gap-2">
                                {pointPickerCandidates.map((item) => (
                                    <button
                                        key={item.uid}
                                        type="button"
                                        onClick={() => handlePickSheetPoint(item)}
                                        className="rounded-lg border border-border bg-bg px-3 py-2 text-left text-sm hover:border-nge"
                                    >
                                        <div className="font-semibold text-text">{item.pointCode}</div>
                                        <div className="text-[11px] text-text-muted">item_uid: {item.uid}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                            <Button variant="ghost" onClick={closePointPicker}>Cancelar</Button>
                        </div>
                    </div>
                </div>
            ) : null}
            </FicheMain>
        </FichePageShell>
    )
}
