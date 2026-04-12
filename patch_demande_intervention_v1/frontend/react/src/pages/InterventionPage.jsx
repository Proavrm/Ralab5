/**
 * InterventionPage.jsx
 * Simplified intervention page aligned with Preparation.
 */

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import { buildInterventionTypeOptions } from '@/components/interventions/InterventionTypeModal'
import Input, { Select } from '@/components/ui/Input'
import { api, demandesApi, echantillonsApi, essaisApi, interventionRequalificationApi, interventionsApi, prelevementsApi } from '@/services/api'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'

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

const HISTORICAL_CODE_LABELS = {
    CFE: 'Contrôle fabrication enrobés',
    DE: 'Contrôle densité enrobés',
    DF: 'Déflexion',
    PLD: 'Portances dynaplaque',
    PMT: 'Macrotexture PMT',
    SC: 'Coupe de sondage carotté',
    SO: 'Coupes de sondages',
}

const HISTORICAL_COLUMN_LABELS = {
    essai_no: 'Point',
    point_no: 'Point',
    hour: 'Heure',
    localisation: 'Localisation',
    ev2_mpa: 'EV2 (MPa)',
    density_g_cm3: 'Densité (g/cm3)',
    compacite_percent: 'Compacité (%)',
    vides_percent: 'Vides (%)',
    observation: 'Observation',
    temperature_c: 'Température (°C)',
    teneur_liant_percent: 'Teneur liant (%)',
    module_richesse: 'Module richesse',
    teneur_liant_ext_percent: 'Liant ext. (%)',
    surface_specifique: 'Surface spécifique',
    module_richesse_ext: 'Module richesse ext.',
    granulometrie_passants_percent: 'Granulométrie (%)',
}

const DIRECT_ESSAI_TEMPLATES = [
    { code: 'GEN', label: 'Essai générique', typeEssai: 'Essai générique', norme: '' },
    { code: 'DE', label: 'Densité enrobés', typeEssai: 'Densité enrobés in situ', norme: '' },
    { code: 'DF', label: 'Déflexions', typeEssai: 'Déflexions', norme: '' },
    { code: 'PMT', label: 'Macrotexture PMT', typeEssai: 'Macrotexture PMT', norme: '' },
    { code: 'PLD', label: 'Portances dynaplaque', typeEssai: 'Portances dynaplaque', norme: '' },
    { code: 'PL', label: 'Portances à la plaque', typeEssai: 'Portances à la plaque', norme: '' },
    { code: 'DS', label: 'Densité sols in situ', typeEssai: 'Densité sols in situ', norme: '' },
    { code: 'QS', label: 'Contrôle de compactage', typeEssai: 'Contrôle compactage GTR', norme: '' },
    { code: 'PA', label: 'Pénétromètre', typeEssai: 'Pénétromètre / PANDA', norme: '' },
    { code: 'SO', label: 'Coupe de sondage', typeEssai: 'Coupe de sondage', norme: '' },
    { code: 'SC', label: 'Coupe de sondage carotté', typeEssai: 'Coupe de sondage carotté', norme: '' },
    { code: 'EA', label: 'Étanchéité à l’eau', typeEssai: 'Étanchéité à l’eau', norme: '' },
    { code: 'PER', label: 'Percolation', typeEssai: 'Percolation', norme: '' },
    { code: 'INF', label: 'Infiltration', typeEssai: 'Infiltration', norme: '' },
]

const DIRECT_ESSAI_TEMPLATE_BY_CODE = DIRECT_ESSAI_TEMPLATES.reduce((accumulator, item) => {
    accumulator[item.code] = item
    return accumulator
}, {})

function guessDirectEssaiCode(source = null) {
    const typeIntervention = String(source?.type_intervention || '').toLowerCase()
    const finalite = String(source?.finalite_intervention || '').toLowerCase()
    const materiau = String(source?.nature_materiau || '').toLowerCase()

    if (typeIntervention.includes('enrob')) return 'DE'
    if (typeIntervention.includes('plateforme') || finalite.includes('portance')) return 'PLD'
    if (finalite.includes('compactage')) return 'QS'
    if (typeIntervention.includes('infiltration') || finalite.includes('percolation')) return 'PER'
    if (typeIntervention.includes('étanchéité') || finalite.includes('étanchéité') || materiau.includes('réseau')) return 'EA'
    if (typeIntervention.includes('reconnaissance')) return 'SO'
    return 'GEN'
}

function Section({ title, children, right }) {
    return (
        <section className="bg-surface border border-border rounded-[10px] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    {title}
                </div>
                {right}
            </div>
            <div className="p-4 flex flex-col gap-3">
                {children}
            </div>
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
        <div className="flex flex-col gap-0.5 mb-2">
            <div className="text-[10px] text-text-muted">{label}</div>
            <div className={`text-[13px] font-medium ${value ? '' : 'text-text-muted italic font-normal'}`}>
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

function ResultMetric({ label, value, tone = 'default' }) {
    const toneClass = tone === 'accent' ? 'text-accent' : 'text-text'

    return (
        <div className="rounded-lg border border-border bg-bg px-3 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">{label}</div>
            <div className={`mt-1 text-lg font-semibold ${toneClass}`}>{value || '—'}</div>
        </div>
    )
}

function LinkedPrelevementsContent({ items, loading, error, onOpen, emptyMessage }) {
    if (loading) {
        return <div className="text-[13px] text-text-muted">Chargement des prélèvements liés…</div>
    }

    if (error) {
        return (
            <div className="text-[13px] text-danger bg-[#fcebeb] border border-[#f2d1d1] rounded-lg px-3 py-2">
                {error}
            </div>
        )
    }

    if (!items.length) {
        return <div className="text-[13px] leading-6 text-text-muted">{emptyMessage}</div>
    }

    return (
        <div className="flex flex-col gap-2">
            {items.map((item) => (
                <button
                    key={item.uid}
                    type="button"
                    onClick={() => onOpen(item.uid)}
                    className="rounded-lg border border-border bg-bg px-3 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-text">{item.reference || `#${item.uid}`}</div>
                            <div className="mt-1 text-[12px] text-text-muted">
                                {item.description || item.materiau || item.zone || 'Ouvrir ce prélèvement pour poursuivre la chaîne labo.'}
                            </div>
                        </div>
                        <div className="shrink-0 text-[11px] text-text-muted">{item.statut || '—'}</div>
                    </div>
                    <div className="mt-2 text-[11px] text-text-muted">
                        {item.echantillon_count ?? 0} groupe(s) d’essais · {item.essai_count ?? 0} essai(s)
                    </div>
                </button>
            ))}
        </div>
    )
}

function LinkedEchantillonsContent({ items, loading, error, onOpen, emptyMessage }) {
    if (loading) {
        return <div className="text-[13px] text-text-muted">Chargement des groupes d’essais…</div>
    }

    if (error) {
        return (
            <div className="text-[13px] text-danger bg-[#fcebeb] border border-[#f2d1d1] rounded-lg px-3 py-2">
                {error}
            </div>
        )
    }

    if (!items.length) {
        return <div className="text-[13px] leading-6 text-text-muted">{emptyMessage}</div>
    }

    return (
        <div className="flex flex-col gap-2">
            {items.map((item) => (
                <button
                    key={item.uid}
                    type="button"
                    onClick={() => onOpen(item.uid)}
                    className="rounded-lg border border-border bg-bg px-3 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-text">{item.reference || `#${item.uid}`}</div>
                            <div className="mt-1 text-[12px] text-text-muted">
                                {item.designation || item.localisation || 'Ouvrir ce groupe pour poursuivre la chaîne des essais.'}
                            </div>
                        </div>
                        <div className="shrink-0 text-[11px] text-text-muted">{item.statut || '—'}</div>
                    </div>
                    <div className="mt-2 text-[11px] text-text-muted">
                        {item.essai_count ?? 0} essai(s)
                    </div>
                </button>
            ))}
        </div>
    )
}

function LinkedEssaisContent({ items, loading, error, onOpen, emptyMessage }) {
    if (loading) {
        return <div className="text-[13px] text-text-muted">Chargement des essais liés…</div>
    }

    if (error) {
        return (
            <div className="text-[13px] text-danger bg-[#fcebeb] border border-[#f2d1d1] rounded-lg px-3 py-2">
                {error}
            </div>
        )
    }

    if (!items.length) {
        return <div className="text-[13px] leading-6 text-text-muted">{emptyMessage}</div>
    }

    return (
        <div className="flex flex-col gap-2">
            {items.map((item) => {
                const resultText = item.resultat_principal != null && item.resultat_principal !== ''
                    ? `${item.resultat_label || 'Résultat'}: ${item.resultat_principal}${item.resultat_unite ? ` ${item.resultat_unite}` : ''}`
                    : ''

                return (
                    <button
                        key={item.uid}
                        type="button"
                        onClick={() => onOpen(item.uid)}
                        className="rounded-lg border border-border bg-bg px-3 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-text">{item.reference || `#${item.uid}`}</div>
                                <div className="mt-1 text-[12px] text-text-muted">
                                    {[
                                        item.type_essai || item.code_essai || item.essai_code || '',
                                        item.source_label || '',
                                        item.intervention_subject || '',
                                        resultText,
                                    ].filter(Boolean).join(' · ') || 'Ouvrir cette fiche d’essai terrain.'}
                                </div>
                            </div>
                            <div className="shrink-0 text-[11px] text-text-muted">{item.statut || '—'}</div>
                        </div>
                    </button>
                )
            })}
        </div>
    )
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

function extractHistoricalCode(raw) {
    const observations = parseObservations(raw)
    return String(observations.essai_code || observations.source_essai_code || '').trim().toUpperCase()
}

function extractHistoricalPayload(raw) {
    const observations = parseObservations(raw)
    return observations.payload && typeof observations.payload === 'object' ? observations.payload : {}
}

function normalizeHistoricalCell(value) {
    return String(value || '').replace(/\s+/g, ' ').trim()
}

function getHistoricalSnapshotRows(snapshot) {
    if (!Array.isArray(snapshot)) return []
    return snapshot
        .filter((row) => Array.isArray(row))
        .map((row) => row.map(normalizeHistoricalCell).filter(Boolean))
        .filter((row) => row.length > 0)
}

function findHistoricalSnapshotValue(snapshot, fragments) {
    const rows = getHistoricalSnapshotRows(snapshot)
    const targets = fragments.map((fragment) => normalizeHistoricalCell(fragment).toLowerCase())
    for (const row of rows) {
        const lowered = row.map((cell) => cell.toLowerCase())
        for (const target of targets) {
            const index = lowered.findIndex((cell) => cell.includes(target))
            if (index === -1) continue
            const value = row.slice(index + 1).find((cell) => Boolean(cell))
            if (value) return value
        }
    }
    return ''
}

function findHistoricalSnapshotHeading(snapshot, code) {
    const rows = getHistoricalSnapshotRows(snapshot)
    for (const row of rows) {
        const heading = row.find((cell) => cell.toLowerCase().includes('coupe de sondage'))
        if (heading) return heading
    }
    if (code === 'SC') return 'Coupe de sondage carottée'
    if (code === 'SO') return 'Coupe de sondage'
    return ''
}

function buildHistoricalSnapshotPreview(snapshot, limit = 6) {
    return getHistoricalSnapshotRows(snapshot)
        .slice(0, limit)
        .map((row) => row.join(' · '))
}

function buildSondageSetSummary(payload, code) {
    const snapshot = payload?.header_snapshot
    return {
        heading: findHistoricalSnapshotHeading(snapshot, code),
        ouvrage: findHistoricalSnapshotValue(snapshot, ['type et nom', 'ouvrage']),
        partieOuvrage: findHistoricalSnapshotValue(snapshot, ['partie de l\'ouvrage', 'partie de l’ouvrage']),
        procede: findHistoricalSnapshotValue(snapshot, ['proc', 'sondage']),
        diametre: findHistoricalSnapshotValue(snapshot, ['diam', 'couronne']),
        dateSondage: findHistoricalSnapshotValue(snapshot, ['date de sondage']),
        meteo: findHistoricalSnapshotValue(snapshot, ['conditions', 'météo', 'meteo']),
        arret: findHistoricalSnapshotValue(snapshot, ['arrêt de sondage', 'arret de sondage']),
        preview: buildHistoricalSnapshotPreview(snapshot),
    }
}

function hasHistoricalValue(value) {
    if (value == null) return false
    if (typeof value === 'string') return value.trim() !== ''
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value === 'boolean') return true
    if (Array.isArray(value)) return value.some(hasHistoricalValue)
    if (typeof value === 'object') return Object.values(value).some(hasHistoricalValue)
    return Boolean(value)
}

function formatHistoricalMetric(value, unit = '', maximumFractionDigits = 2) {
    if (!hasHistoricalValue(value)) return ''
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric) && String(value).trim() !== '') {
        return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits })}${unit ? ` ${unit}` : ''}`
    }
    return `${String(value).trim()}${unit ? ` ${unit}` : ''}`
}

function humanizeHistoricalKey(key) {
    if (!key) return ''
    if (HISTORICAL_COLUMN_LABELS[key]) return HISTORICAL_COLUMN_LABELS[key]
    return String(key)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatHistoricalValue(value) {
    if (!hasHistoricalValue(value)) return ''
    if (typeof value === 'number') {
        return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
    }
    if (Array.isArray(value)) {
        return value.map(formatHistoricalValue).filter(Boolean).slice(0, 4).join(' · ')
    }
    if (typeof value === 'object') {
        return Object.entries(value)
            .filter(([, nestedValue]) => hasHistoricalValue(nestedValue))
            .slice(0, 4)
            .map(([nestedKey, nestedValue]) => `${humanizeHistoricalKey(nestedKey)}: ${formatHistoricalValue(nestedValue)}`)
            .join(' · ')
    }
    return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeHistoricalLookup(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/œ/g, 'oe')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
}

function parseHistoricalNumber(value) {
    if (value == null || value === '') return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null

    const cleaned = String(value)
        .replace(/\u00a0/g, ' ')
        .replace(',', '.')
        .trim()

    if (!cleaned) return null

    const match = cleaned.match(/-?\d+(?:\.\d+)?/)
    if (!match) return null

    const parsed = Number(match[0])
    return Number.isFinite(parsed) ? parsed : null
}

function averageHistoricalNumbers(values) {
    const cleaned = values.filter((value) => value != null)
    if (!cleaned.length) return null
    return cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length
}

function collectHistoricalRowText(row) {
    return Object.entries(row || {})
        .map(([key, value]) => `${key} ${formatHistoricalValue(value)}`)
        .join(' ')
}

function findHistoricalRowKey(row, fragments) {
    if (!row || !Array.isArray(fragments) || !fragments.length) return null
    const targets = fragments.map((fragment) => normalizeHistoricalLookup(fragment))

    return Object.keys(row).find((key) => {
        const normalizedKey = normalizeHistoricalLookup(key)
        return targets.some((target) => normalizedKey.includes(target))
    }) || null
}

function findHistoricalSummaryNumber(rows, rowFragments, valueFragments = []) {
    if (!Array.isArray(rows) || !rows.length) return null
    const targets = rowFragments.map((fragment) => normalizeHistoricalLookup(fragment))

    for (const row of rows) {
        const rowText = normalizeHistoricalLookup(collectHistoricalRowText(row))
        if (!targets.some((target) => rowText.includes(target))) continue

        if (valueFragments.length > 0) {
            const valueKey = findHistoricalRowKey(row, valueFragments)
            const keyedValue = valueKey ? parseHistoricalNumber(row[valueKey]) : null
            if (keyedValue != null) return keyedValue
        }

        const fallbackValues = Object.values(row)
            .map(parseHistoricalNumber)
            .filter((value) => value != null)

        if (fallbackValues.length > 0) {
            return fallbackValues[fallbackValues.length - 1]
        }
    }

    return null
}

function buildImportedResultRows(code, rows) {
    if (!Array.isArray(rows) || !rows.length) return []

    if (code === 'PMT') {
        return rows
            .map((row) => {
                const rowText = normalizeHistoricalLookup(collectHistoricalRowText(row))
                if (
                    rowText.includes('pourcentage de valeurs conformes')
                    || rowText.includes('profondeur de macrotexture generale')
                    || rowText.includes('nb d essais')
                    || rowText.includes('conclusions')
                    || rowText.includes('commentaires')
                    || rowText.includes('visa')
                ) {
                    return null
                }

                const pointKey = findHistoricalRowKey(row, ['essai', 'point'])
                const diametreKey = findHistoricalRowKey(row, ['diametre'])
                const macrotextureKey = findHistoricalRowKey(row, ['macrotexture', 'profondeur'])
                const positionKey = findHistoricalRowKey(row, ['position', 'localisation'])

                const point = pointKey ? parseHistoricalNumber(row[pointKey]) : null
                const macrotexture = macrotextureKey ? parseHistoricalNumber(row[macrotextureKey]) : null
                if (point == null || macrotexture == null) return null

                return {
                    point,
                    position: positionKey ? formatHistoricalValue(row[positionKey]) : '',
                    diametre_mm: diametreKey ? parseHistoricalNumber(row[diametreKey]) : null,
                    macrotexture_mm: macrotexture,
                }
            })
            .filter(Boolean)
    }

    if (code === 'PLD') {
        return rows
            .map((row) => {
                const pointKey = findHistoricalRowKey(row, ['point', 'essai'])
                const localisationKey = findHistoricalRowKey(row, ['localisation', 'position'])
                const ev2Key = findHistoricalRowKey(row, ['ev2'])
                const observationKey = findHistoricalRowKey(row, ['observation'])

                const point = pointKey ? parseHistoricalNumber(row[pointKey]) : null
                const ev2 = ev2Key ? parseHistoricalNumber(row[ev2Key]) : null
                if (point == null || ev2 == null) return null

                return {
                    point,
                    localisation: localisationKey ? formatHistoricalValue(row[localisationKey]) : '',
                    ev2_mpa: ev2,
                    observation: observationKey ? formatHistoricalValue(row[observationKey]) : '',
                }
            })
            .filter(Boolean)
    }

    if (code === 'DE') {
        return rows
            .map((row) => {
                const pointKey = findHistoricalRowKey(row, ['point', 'essai'])
                const densityKey = findHistoricalRowKey(row, ['densite'])
                const compaciteKey = findHistoricalRowKey(row, ['compacite'])
                const videsKey = findHistoricalRowKey(row, ['vides'])
                const observationKey = findHistoricalRowKey(row, ['observation'])

                const point = pointKey ? parseHistoricalNumber(row[pointKey]) : null
                const density = densityKey ? parseHistoricalNumber(row[densityKey]) : null
                if (point == null || density == null) return null

                return {
                    point,
                    density_g_cm3: density,
                    compacite_percent: compaciteKey ? parseHistoricalNumber(row[compaciteKey]) : null,
                    vides_percent: videsKey ? parseHistoricalNumber(row[videsKey]) : null,
                    observation: observationKey ? formatHistoricalValue(row[observationKey]) : '',
                }
            })
            .filter(Boolean)
    }

    return []
}

function buildImportedResultMetrics(code, payload, rows, normalizedRows) {
    if (code === 'PMT' && normalizedRows.length > 0) {
        const macrotextureValues = normalizedRows.map((row) => row.macrotexture_mm).filter((value) => value != null)
        const diametreValues = normalizedRows.map((row) => row.diametre_mm).filter((value) => value != null)
        const macrotextureAverage = findHistoricalSummaryNumber(rows, ['profondeur de macrotexture generale'], ['macrotexture'])
            ?? averageHistoricalNumbers(macrotextureValues)
        const conformite = findHistoricalSummaryNumber(rows, ['pourcentage de valeurs conformes'], ['macrotexture'])

        return [
            { label: 'Mesures', value: `${normalizedRows.length}` },
            { label: 'Macrotexture moy.', value: formatHistoricalMetric(macrotextureAverage, 'mm'), tone: 'accent' },
            { label: 'Mini', value: formatHistoricalMetric(Math.min(...macrotextureValues), 'mm') },
            { label: 'Maxi', value: formatHistoricalMetric(Math.max(...macrotextureValues), 'mm') },
            { label: 'Diamètre moy.', value: formatHistoricalMetric(averageHistoricalNumbers(diametreValues), 'mm') },
            { label: 'Conformes', value: formatHistoricalMetric(conformite, '%') },
        ].filter((item) => hasHistoricalValue(item.value))
    }

    if (code === 'PLD' && normalizedRows.length > 0) {
        const values = normalizedRows.map((row) => row.ev2_mpa).filter((value) => value != null)
        return [
            { label: 'Points', value: `${normalizedRows.length}` },
            { label: 'EV2 moy.', value: formatHistoricalMetric(payload?.moyenne_ev2_mpa ?? averageHistoricalNumbers(values), 'MPa'), tone: 'accent' },
            { label: 'Mini', value: formatHistoricalMetric(payload?.valeur_min_mpa ?? Math.min(...values), 'MPa') },
            { label: 'Maxi', value: formatHistoricalMetric(payload?.valeur_max_mpa ?? Math.max(...values), 'MPa') },
            { label: 'Conformes', value: formatHistoricalMetric(payload?.taux_conformes_percent, '%') },
        ].filter((item) => hasHistoricalValue(item.value))
    }

    if (code === 'DE' && normalizedRows.length > 0) {
        return [
            { label: 'Points', value: `${normalizedRows.length}` },
            { label: 'Densité moy.', value: formatHistoricalMetric(payload?.moyenne_density_g_cm3 ?? averageHistoricalNumbers(normalizedRows.map((row) => row.density_g_cm3).filter((value) => value != null)), 'g/cm3'), tone: 'accent' },
            { label: 'Compacité moy.', value: formatHistoricalMetric(payload?.moyenne_compacite_percent ?? averageHistoricalNumbers(normalizedRows.map((row) => row.compacite_percent).filter((value) => value != null)), '%') },
            { label: 'Vides moy.', value: formatHistoricalMetric(payload?.moyenne_vides_percent ?? averageHistoricalNumbers(normalizedRows.map((row) => row.vides_percent).filter((value) => value != null)), '%') },
            { label: 'Conformes', value: formatHistoricalMetric(payload?.taux_conformes_percent, '%') },
        ].filter((item) => hasHistoricalValue(item.value))
    }

    return []
}

function buildImportedResultTable(code, normalizedRows) {
    if (!normalizedRows.length) return null

    if (code === 'PMT') {
        return {
            title: 'Mesures relevées',
            columns: [
                { key: 'point', label: 'Point' },
                { key: 'position', label: 'Position' },
                { key: 'diametre_mm', label: 'Diamètre (mm)', unit: 'mm' },
                { key: 'macrotexture_mm', label: 'Macrotexture (mm)', unit: 'mm' },
            ],
        }
    }

    if (code === 'PLD') {
        return {
            title: 'Points mesurés',
            columns: [
                { key: 'point', label: 'Point' },
                { key: 'localisation', label: 'Localisation' },
                { key: 'ev2_mpa', label: 'EV2 (MPa)', unit: 'MPa' },
                { key: 'observation', label: 'Observation' },
            ],
        }
    }

    if (code === 'DE') {
        return {
            title: 'Mesures relevées',
            columns: [
                { key: 'point', label: 'Point' },
                { key: 'density_g_cm3', label: 'Densité (g/cm3)', unit: 'g/cm3' },
                { key: 'compacite_percent', label: 'Compacité (%)', unit: '%' },
                { key: 'vides_percent', label: 'Vides (%)', unit: '%' },
                { key: 'observation', label: 'Observation' },
            ],
        }
    }

    return null
}

function formatImportedResultCell(value, unit = '') {
    if (!hasHistoricalValue(value)) return '—'
    if (typeof value === 'number') {
        return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
    }
    return String(value).replace(/\s+/g, ' ').trim() || '—'
}

function pickHistoricalColumns(rows, code, preferredByCode = {}) {
    if (!Array.isArray(rows) || !rows.length) return []
    const available = Array.from(
        new Set(
            rows.flatMap((row) => Object.keys(row).filter((key) => hasHistoricalValue(row[key])))
        )
    )
    const preferred = preferredByCode[code] || []
    const ordered = preferred.filter((key) => available.includes(key))
    const extra = available.filter((key) => !ordered.includes(key))
    return [...ordered, ...extra].slice(0, 6)
}

function buildHistoricalSummaryItems(code, payload, observations, interventionInfo) {
    const items = [
        {
            label: 'Libellé importé',
            value:
                observations?.essai_label
                || interventionInfo?.essai_label
                || interventionInfo?.type_intervention
                || HISTORICAL_CODE_LABELS[code]
                || '',
        },
        { label: 'Fichier source', value: observations?.source_file || '' },
        { label: 'Feuille', value: observations?.sheet_name || '' },
        { label: 'Repère feuille', value: observations?.sample_local_ref || '' },
        { label: 'Opérateur', value: observations?.operator || interventionInfo?.technicien || '' },
        { label: 'Partie d’ouvrage', value: payload?.partie_ouvrage || '' },
        { label: 'Section contrôlée', value: payload?.section_controlee || '' },
        { label: 'Destination', value: payload?.destination || '' },
        { label: 'Nature matériau', value: payload?.nature_materiau || payload?.nature_produit || '' },
        { label: 'Couche', value: payload?.couche || '' },
    ]

    if (code === 'PLD') {
        items.push(
            { label: 'Diamètre plaque', value: formatHistoricalMetric(payload?.diametre_plaque_mm, 'mm') },
            { label: 'Moyenne EV2', value: formatHistoricalMetric(payload?.moyenne_ev2_mpa, 'MPa') },
            { label: 'Valeur mini', value: formatHistoricalMetric(payload?.valeur_min_mpa, 'MPa') },
            { label: 'Valeur maxi', value: formatHistoricalMetric(payload?.valeur_max_mpa, 'MPa') },
            { label: 'Taux conformes', value: formatHistoricalMetric(payload?.taux_conformes_percent, '%') },
            { label: 'Conclusion', value: payload?.conclusion || '' },
        )
    }

    if (code === 'DE') {
        items.push(
            { label: 'MVR', value: formatHistoricalMetric(payload?.mvre_g_cm3, 'g/cm3') },
            { label: 'Densité moyenne', value: formatHistoricalMetric(payload?.moyenne_density_g_cm3, 'g/cm3') },
            { label: 'Compacité moyenne', value: formatHistoricalMetric(payload?.moyenne_compacite_percent, '%') },
            { label: 'Vides moyens', value: formatHistoricalMetric(payload?.moyenne_vides_percent, '%') },
            { label: 'Taux conformes', value: formatHistoricalMetric(payload?.taux_conformes_percent, '%') },
            { label: 'Code formule', value: payload?.formula_code || '' },
        )
    }

    if (code === 'CFE') {
        items.push(
            { label: 'Code formule', value: payload?.formula_code || '' },
            { label: 'Appellation européenne', value: payload?.appellation_europeenne || '' },
            { label: 'Appellation française', value: payload?.appellation_francaise || '' },
            { label: 'Liant théorique', value: formatHistoricalMetric(payload?.theorique?.teneur_liant_percent, '%') },
            { label: 'Température moyenne', value: formatHistoricalMetric(payload?.moyenne?.temperature_c, '°C') },
            { label: 'Module richesse', value: formatHistoricalMetric(payload?.moyenne?.module_richesse) },
        )
    }

    if (code === 'PMT' || code === 'DF') {
        items.push(
            { label: 'En-tête extrait', value: hasHistoricalValue(payload?.header_snapshot) ? 'Oui' : '' },
            { label: 'Tableau importé', value: Array.isArray(payload?.rows) ? `${payload.rows.length} ligne(s)` : '' },
        )
    }

    return items.filter((item) => hasHistoricalValue(item.value))
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
        heure_debut: form.heure_debut || '',
        heure_fin: form.heure_fin || '',
        // Préparation
        prep_points_a_realiser:      form.prep_points_a_realiser || '',
        prep_essais_a_effectuer:     form.prep_essais_a_effectuer || '',
        prep_prelevements_prevus:    form.prep_prelevements_prevus || '',
        prep_materiels_requis:       form.prep_materiels_requis || '',
        prep_metrologie_ok:          form.prep_metrologie_ok || '',
        prep_consommables_epi:       form.prep_consommables_epi || '',
        prep_contact_chantier:       form.prep_contact_chantier || '',
        prep_plan_prevention:        form.prep_plan_prevention || '',
        prep_contraintes_acces:      form.prep_contraintes_acces || '',
        prep_preparation_complete:   form.prep_preparation_complete || '',
        prep_point_bloquant:         form.prep_point_bloquant || '',
        prep_point_bloquant_desc:    form.prep_point_bloquant_desc || '',
        // Conditions
        cond_meteo:            form.cond_meteo || '',
        cond_etat_site:        form.cond_etat_site || '',
        cond_ecarts:           form.cond_ecarts || '',
        cond_materiel_utilise: form.cond_materiel_utilise || '',
        // Réalisation
        real_nb_points_prevus:           form.real_nb_points_prevus || '',
        real_nb_points_realises:         form.real_nb_points_realises || '',
        real_points_non_realises_motif:  form.real_points_non_realises_motif || '',
        real_incidents:                  form.real_incidents || '',
        real_non_conformites:            form.real_non_conformites || '',
        real_adaptations:                form.real_adaptations || '',
        real_decision_immediate:         form.real_decision_immediate || '',
        // Sortie
        sortie_nb_echantillons:  form.sortie_nb_echantillons || '',
        sortie_destination_labo: form.sortie_destination_labo || '',
        sortie_alerte:           form.sortie_alerte || '',
        sortie_alerte_desc:      form.sortie_alerte_desc || '',
        sortie_info_demandeur:   form.sortie_info_demandeur || '',
        sortie_synthese:         form.sortie_synthese || '',
    })
}

function mergeFormFromIntervention(data) {
    const observations = parseObservations(data?.observations || '')
    return {
        demande_id: String(data?.demande_id || ''),
        type_intervention: data?.type_intervention || '',
        finalite_intervention: observations.finalite_intervention || '',
        date_intervention: data?.date_intervention || '',
        heure_debut: observations.heure_debut || '',
        heure_fin: observations.heure_fin || '',
        technicien: data?.technicien || '',
        zone_intervention: observations.zone_intervention || '',
        nature_materiau: observations.nature_materiau || '',
        objectif_intervention: observations.objectif_intervention || '',
        notes_terrain: observations.notes_terrain || '',
        statut: data?.statut || 'Planifiée',
        responsable_referent: observations.responsable_referent || '',
        attribue_a: observations.attribue_a || '',
        // Préparation
        prep_points_a_realiser:      observations.prep_points_a_realiser || '',
        prep_essais_a_effectuer:     observations.prep_essais_a_effectuer || '',
        prep_prelevements_prevus:    observations.prep_prelevements_prevus || '',
        prep_materiels_requis:       observations.prep_materiels_requis || '',
        prep_metrologie_ok:          observations.prep_metrologie_ok || '',
        prep_consommables_epi:       observations.prep_consommables_epi || '',
        prep_contact_chantier:       observations.prep_contact_chantier || '',
        prep_plan_prevention:        observations.prep_plan_prevention || '',
        prep_contraintes_acces:      observations.prep_contraintes_acces || '',
        prep_preparation_complete:   observations.prep_preparation_complete || '',
        prep_point_bloquant:         observations.prep_point_bloquant || '',
        prep_point_bloquant_desc:    observations.prep_point_bloquant_desc || '',
        // Conditions
        cond_meteo:           observations.cond_meteo || '',
        cond_etat_site:       observations.cond_etat_site || '',
        cond_ecarts:          observations.cond_ecarts || '',
        cond_materiel_utilise:observations.cond_materiel_utilise || '',
        // Réalisation
        real_nb_points_prevus:          observations.real_nb_points_prevus || '',
        real_nb_points_realises:        observations.real_nb_points_realises || '',
        real_points_non_realises_motif: observations.real_points_non_realises_motif || '',
        real_incidents:                 observations.real_incidents || '',
        real_non_conformites:           observations.real_non_conformites || '',
        real_adaptations:               observations.real_adaptations || '',
        real_decision_immediate:        observations.real_decision_immediate || '',
        // Sortie
        sortie_nb_echantillons: observations.sortie_nb_echantillons || '',
        sortie_destination_labo:observations.sortie_destination_labo || '',
        sortie_alerte:          observations.sortie_alerte || '',
        sortie_alerte_desc:     observations.sortie_alerte_desc || '',
        sortie_info_demandeur:  observations.sortie_info_demandeur || '',
        sortie_synthese:        observations.sortie_synthese || '',
    }
}

function prefillFromQuery(searchParams) {
    return {
        demande_id: searchParams.get('demande_id') || '',
        type_intervention: searchParams.get('type_intervention') || '',
        finalite_intervention: searchParams.get('finalite') || '',
        date_intervention: new Date().toISOString().slice(0, 10),
        heure_debut: '',
        heure_fin: '',
        technicien: '',
        zone_intervention: searchParams.get('zone') || '',
        nature_materiau: searchParams.get('materiau') || '',
        objectif_intervention: searchParams.get('objectif') || '',
        notes_terrain: '',
        statut: 'Planifiée',
        responsable_referent: searchParams.get('responsable') || '',
        attribue_a: searchParams.get('attribue_a') || '',
        prep_points_a_realiser: '', prep_essais_a_effectuer: '', prep_prelevements_prevus: '',
        prep_materiels_requis: '', prep_metrologie_ok: '', prep_consommables_epi: '',
        prep_contact_chantier: '', prep_plan_prevention: '', prep_contraintes_acces: '',
        prep_preparation_complete: '', prep_point_bloquant: '', prep_point_bloquant_desc: '',
        cond_meteo: '', cond_etat_site: '', cond_ecarts: '', cond_materiel_utilise: '',
        real_nb_points_prevus: '', real_nb_points_realises: '', real_points_non_realises_motif: '',
        real_incidents: '', real_non_conformites: '', real_adaptations: '', real_decision_immediate: '',
        sortie_nb_echantillons: '', sortie_destination_labo: '', sortie_alerte: '',
        sortie_alerte_desc: '', sortie_info_demandeur: '', sortie_synthese: '',
    }
}

function buildQuickEchantillonForm(source = null) {
    return {
        designation_lines: '',
        localisation: source?.zone_intervention || '',
        statut: 'Reçu',
    }
}

function buildQuickEssaiForm(source = null) {
    const essaiCode = guessDirectEssaiCode(source)
    const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[essaiCode] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN
    return {
        essai_code: template.code,
        norme: template.norme || '',
    }
}

function parseDesignationLines(rawValue) {
    return String(rawValue || '')
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
}

function extractIsoDate(value) {
    const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
    return match ? match[1] : ''
}

export default function InterventionPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const { uid } = useParams()
    const [searchParams] = useSearchParams()

    const isCreate = uid === 'new'
    const [editing, setEditing] = useState(isCreate)
    const [form, setForm] = useState({
        demande_id: '',
        type_intervention: '',
        finalite_intervention: '',
        date_intervention: '',
        heure_debut: '',
        heure_fin: '',
        technicien: '',
        zone_intervention: '',
        nature_materiau: '',
        objectif_intervention: '',
        notes_terrain: '',
        statut: 'Planifiée',
        responsable_referent: '',
        attribue_a: '',
        // Préparation (avant terrain)
        prep_points_a_realiser: '',
        prep_essais_a_effectuer: '',
        prep_prelevements_prevus: '',
        prep_materiels_requis: '',
        prep_metrologie_ok: '',
        prep_consommables_epi: '',
        prep_contact_chantier: '',
        prep_plan_prevention: '',
        prep_contraintes_acces: '',
        prep_preparation_complete: '',
        prep_point_bloquant: '',
        prep_point_bloquant_desc: '',
        // Conditions réelles (terrain)
        cond_meteo: '',
        cond_etat_site: '',
        cond_ecarts: '',
        cond_materiel_utilise: '',
        // Réalisation
        real_nb_points_prevus: '',
        real_nb_points_realises: '',
        real_points_non_realises_motif: '',
        real_incidents: '',
        real_non_conformites: '',
        real_adaptations: '',
        real_decision_immediate: '',
        // Sortie
        sortie_nb_echantillons: '',
        sortie_destination_labo: '',
        sortie_alerte: '',
        sortie_alerte_desc: '',
        sortie_info_demandeur: '',
        sortie_synthese: '',
    })
    const [originalObservations, setOriginalObservations] = useState({})
    const [loading, setLoading] = useState(!isCreate)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [demandeInfo, setDemandeInfo] = useState(null)
    const [interventionInfo, setInterventionInfo] = useState(null)
    const [linkedPrelevements, setLinkedPrelevements] = useState([])
    const [linkedPrelevementsLoading, setLinkedPrelevementsLoading] = useState(false)
    const [linkedPrelevementsError, setLinkedPrelevementsError] = useState('')
    const [linkedEchantillons, setLinkedEchantillons] = useState([])
    const [linkedEchantillonsLoading, setLinkedEchantillonsLoading] = useState(false)
    const [linkedEchantillonsError, setLinkedEchantillonsError] = useState('')
    const [linkedEssais, setLinkedEssais] = useState([])
    const [linkedEssaisLoading, setLinkedEssaisLoading] = useState(false)
    const [linkedEssaisError, setLinkedEssaisError] = useState('')
    const [quickEchantillonForm, setQuickEchantillonForm] = useState(buildQuickEchantillonForm())
    const [quickEssaiForm, setQuickEssaiForm] = useState(buildQuickEssaiForm())
    const [creatingPrelevement, setCreatingPrelevement] = useState(false)
    const [creatingEchantillons, setCreatingEchantillons] = useState(false)

    const demandeId = form.demande_id || ''
    const campaignInfo = useMemo(() => ({
        uid: searchParams.get('campaign_uid') || String(interventionInfo?.campaign_id || ''),
        reference: searchParams.get('campaign_ref') || interventionInfo?.campaign_ref || '',
        code: searchParams.get('campaign_code') || interventionInfo?.campaign_code || '',
        label: searchParams.get('campaign_label') || interventionInfo?.campaign_label || '',
        designation: searchParams.get('campaign_designation') || interventionInfo?.campaign_designation || '',
    }), [searchParams, interventionInfo])
    const childReturnTo = buildLocationTarget(location)
    const fallbackReturnTo = resolveReturnTo(
        searchParams,
        demandeId ? `/demandes/${demandeId}` : '/labo/workbench?tab=interventions'
    )
    const quickEchantillonLines = useMemo(
        () => parseDesignationLines(quickEchantillonForm.designation_lines),
        [quickEchantillonForm.designation_lines]
    )
    const directCreateButtonLabel = quickEchantillonLines.length
        ? `Créer ${quickEchantillonLines.length} groupe(s)`
        : 'Créer groupe(s)'
    const canCreateDirectEchantillons = Boolean(!isCreate && demandeId && interventionInfo?.intervention_reelle_id)
    const selectedDirectEssaiTemplate = useMemo(
        () => DIRECT_ESSAI_TEMPLATE_BY_CODE[quickEssaiForm.essai_code] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN,
        [quickEssaiForm.essai_code]
    )
    const typeOptions = useMemo(() => buildInterventionTypeOptions(form.type_intervention), [form.type_intervention])

    async function fetchDirectLinkedEchantillons(interventionReelleId) {
        if (!interventionReelleId) return []
        const rows = await echantillonsApi.list({ intervention_reelle_id: interventionReelleId })
        return Array.isArray(rows) ? rows.filter((item) => !item.prelevement_id) : []
    }

    useEffect(() => {
        let active = true

        async function loadPage() {
            if (isCreate) {
                const prefill = prefillFromQuery(searchParams)
                if (!active) return
                setForm(prefill)
                setQuickEchantillonForm(buildQuickEchantillonForm(prefill))
                setQuickEssaiForm(buildQuickEssaiForm(prefill))
                setOriginalObservations({})
                setEditing(true)
                setLoading(false)
                return
            }

            try {
                setLoading(true)
                setError('')
                const data = await interventionsApi.get(uid)
                if (!active) return
                const mergedForm = mergeFormFromIntervention(data)
                setInterventionInfo(data)
                setForm(mergedForm)
                setQuickEchantillonForm(buildQuickEchantillonForm(mergedForm))
                setQuickEssaiForm(buildQuickEssaiForm(mergedForm))
                setOriginalObservations(parseObservations(data?.observations || ''))
                setEditing(false)
            } catch (err) {
                if (!active) return
                setError(err.message || "Impossible de charger l'intervention.")
            } finally {
                if (active) setLoading(false)
            }
        }

        loadPage()
        return () => { active = false }
    }, [uid, isCreate, searchParams])

    useEffect(() => {
        let active = true

        async function loadDemande() {
            if (!demandeId) {
                setDemandeInfo(null)
                return
            }
            try {
                const data = await demandesApi.get(demandeId)
                if (active) setDemandeInfo(data)
            } catch {
                if (active) setDemandeInfo(null)
            }
        }

        loadDemande()
        return () => { active = false }
    }, [demandeId])

    useEffect(() => {
        let active = true

        async function loadLinkedPrelevements() {
            if (isCreate) {
                setLinkedPrelevements([])
                setLinkedPrelevementsError('')
                setLinkedPrelevementsLoading(false)
                return
            }

            const interventionReelleId = interventionInfo?.intervention_reelle_id
            const directPrelevementId = interventionInfo?.prelevement_id

            if (!interventionReelleId && !directPrelevementId) {
                setLinkedPrelevements([])
                setLinkedPrelevementsError('')
                setLinkedPrelevementsLoading(false)
                return
            }

            try {
                setLinkedPrelevementsLoading(true)
                setLinkedPrelevementsError('')

                let rows = []
                if (interventionReelleId) {
                    rows = await prelevementsApi.list({ intervention_reelle_id: interventionReelleId })
                } else if (directPrelevementId) {
                    rows = [await prelevementsApi.get(directPrelevementId)]
                }

                if (!active) return
                setLinkedPrelevements(Array.isArray(rows) ? rows : [])
            } catch (err) {
                if (!active) return
                setLinkedPrelevements([])
                setLinkedPrelevementsError(err.message || 'Impossible de charger les prélèvements liés.')
            } finally {
                if (active) setLinkedPrelevementsLoading(false)
            }
        }

        loadLinkedPrelevements()
        return () => { active = false }
    }, [isCreate, interventionInfo?.intervention_reelle_id, interventionInfo?.prelevement_id])

    useEffect(() => {
        let active = true

        async function loadLinkedEchantillons() {
            const interventionReelleId = interventionInfo?.intervention_reelle_id

            if (isCreate || !interventionReelleId) {
                setLinkedEchantillons([])
                setLinkedEchantillonsError('')
                setLinkedEchantillonsLoading(false)
                return
            }

            try {
                setLinkedEchantillonsLoading(true)
                setLinkedEchantillonsError('')
                const rows = await fetchDirectLinkedEchantillons(interventionReelleId)
                if (!active) return
                setLinkedEchantillons(rows)
            } catch (err) {
                if (!active) return
                setLinkedEchantillons([])
                setLinkedEchantillonsError(err.message || 'Impossible de charger les groupes liés.')
            } finally {
                if (active) setLinkedEchantillonsLoading(false)
            }
        }

        loadLinkedEchantillons()
        return () => { active = false }
    }, [isCreate, interventionInfo?.intervention_reelle_id])

    const title = useMemo(() => {
        if (isCreate) return 'Nouvelle intervention'
        return interventionInfo?.reference || 'Intervention'
    }, [isCreate, interventionInfo])
    const historicalObservations = useMemo(() => parseObservations(interventionInfo?.observations || ''), [interventionInfo])
    const historicalCode = useMemo(() => extractHistoricalCode(interventionInfo?.observations || ''), [interventionInfo])
    const historicalPayload = useMemo(() => extractHistoricalPayload(interventionInfo?.observations || ''), [interventionInfo])
    const isSondageComposite = historicalCode === 'SC' || historicalCode === 'SO'
    const sondageSetSummary = useMemo(() => buildSondageSetSummary(historicalPayload, historicalCode), [historicalPayload, historicalCode])
    const historicalPoints = Array.isArray(historicalPayload?.points)
        ? historicalPayload.points.filter((row) => row && typeof row === 'object' && Object.values(row).some(hasHistoricalValue))
        : []
    const historicalRows = Array.isArray(historicalPayload?.rows)
        ? historicalPayload.rows.filter((row) => row && typeof row === 'object' && Object.values(row).some(hasHistoricalValue))
        : []
    const historicalPointColumns = historicalPoints.length > 0
        ? pickHistoricalColumns(historicalPoints, historicalCode, {
            DE: ['essai_no', 'density_g_cm3', 'compacite_percent', 'vides_percent', 'observation'],
            PLD: ['point_no', 'localisation', 'ev2_mpa', 'observation'],
        })
        : []
    const historicalColumns = historicalRows.length > 0
        ? pickHistoricalColumns(historicalRows, historicalCode, {
            CFE: ['essai_no', 'hour', 'temperature_c', 'teneur_liant_percent', 'module_richesse', 'granulometrie_passants_percent'],
        })
        : []
    const historicalSummaryItems = useMemo(
        () => buildHistoricalSummaryItems(historicalCode, historicalPayload, historicalObservations, interventionInfo),
        [historicalCode, historicalPayload, historicalObservations, interventionInfo]
    )
    const importedBaseRows = historicalRows.length > 0 ? historicalRows : historicalPoints
    const importedResultRows = useMemo(
        () => buildImportedResultRows(historicalCode, importedBaseRows),
        [historicalCode, importedBaseRows]
    )
    const importedResultMetrics = useMemo(
        () => buildImportedResultMetrics(historicalCode, historicalPayload, importedBaseRows, importedResultRows),
        [historicalCode, historicalPayload, importedBaseRows, importedResultRows]
    )
    const importedResultTable = useMemo(
        () => buildImportedResultTable(historicalCode, importedResultRows),
        [historicalCode, importedResultRows]
    )
    const importedResultColumns = useMemo(() => {
        if (!importedResultTable) return []

        return importedResultTable.columns.filter((column) => {
            if (column.key === 'point') return true
            return importedResultRows.some((row) => hasHistoricalValue(row[column.key]))
        })
    }, [importedResultTable, importedResultRows])
    const historicalFiches = useMemo(() => {
        const sourceCandidates = Array.isArray(historicalObservations?.source_candidates)
            ? historicalObservations.source_candidates
            : []

        if (sourceCandidates.length > 0) {
            return sourceCandidates.map((item, index) => ({
                key: `${item.file_hash || item.sheet_name || historicalCode || 'hist'}-${index}`,
                label: item.sheet_name || item.sample_local_ref || `Fiche ${index + 1}`,
                ref: item.sample_local_ref || '',
                date: item.date_prelevement || item.date_essai || item.date_mise_en_oeuvre || '',
                fileName: item.file_name || '',
            }))
        }

        const sourceSheets = Array.isArray(historicalPayload?.source_sheets) ? historicalPayload.source_sheets : []
        if (sourceSheets.length > 0) {
            return sourceSheets.map((sheetName, index) => ({
                key: `${sheetName || historicalCode || 'hist'}-${index}`,
                label: String(sheetName || `Fiche ${index + 1}`),
                ref: '',
                date: '',
                fileName: Array.isArray(historicalPayload?.source_files) ? String(historicalPayload.source_files[index] || '') : '',
            }))
        }

        if (historicalObservations?.sheet_name || historicalObservations?.source_file) {
            return [
                {
                    key: `${historicalObservations.sheet_name || historicalCode || 'hist'}-single`,
                    label: historicalObservations.sheet_name || 'Fiche importée',
                    ref: historicalObservations.sample_local_ref || '',
                    date: interventionInfo?.date_intervention || '',
                    fileName: historicalObservations.source_file || '',
                },
            ]
        }

        return []
    }, [historicalCode, historicalObservations, historicalPayload, interventionInfo])
    const showHistoricalImportedResult = useMemo(() => {
        if (!historicalCode || isSondageComposite) return false
        if (historicalPoints.length > 0 || historicalRows.length > 0) return true
        if (historicalSummaryItems.length > 0) return true
        return Object.keys(historicalPayload || {}).length > 0
    }, [historicalCode, isSondageComposite, historicalPoints.length, historicalRows.length, historicalSummaryItems.length, historicalPayload])
    const linkedEssaiActionLabel = linkedEssais.length > 0 ? 'Rafraîchir les essais liés' : 'Générer les essais liés'
    const showLinkedEssaisSection = showHistoricalImportedResult || linkedEssaisLoading || Boolean(linkedEssaisError) || linkedEssais.length > 0

    useEffect(() => {
        let active = true

        async function loadLinkedEssais() {
            if (isCreate || !uid) {
                setLinkedEssais([])
                setLinkedEssaisError('')
                setLinkedEssaisLoading(false)
                return
            }

            try {
                setLinkedEssaisLoading(true)
                setLinkedEssaisError('')

                if (showHistoricalImportedResult) {
                    await essaisApi.syncInterventionEssais(uid)
                }

                const rows = await essaisApi.list({ intervention_id: uid })
                if (!active) return
                setLinkedEssais(Array.isArray(rows) ? rows : [])
            } catch (err) {
                if (!active) return
                setLinkedEssais([])
                setLinkedEssaisError(err.message || 'Impossible de charger les essais liés.')
            } finally {
                if (active) setLinkedEssaisLoading(false)
            }
        }

        loadLinkedEssais()
        return () => { active = false }
    }, [isCreate, uid, showHistoricalImportedResult])
    const importedResultMeta = useMemo(() => {
        const sourceSheet = historicalObservations?.sheet_name
            || (Array.isArray(historicalPayload?.source_sheets) ? historicalPayload.source_sheets[0] : '')
            || ''

        return [
            { label: 'Sujet terrain', value: interventionInfo?.sujet || '' },
            { label: 'Date / feuille', value: [form.date_intervention || interventionInfo?.date_intervention || '', sourceSheet].filter(Boolean).join(' · ') },
            { label: 'Section contrôlée', value: historicalPayload?.section_controlee || '' },
            { label: 'Couche', value: historicalPayload?.couche || '' },
            { label: 'Nature matériau', value: historicalPayload?.nature_materiau || historicalPayload?.nature_produit || '' },
            { label: 'Opérateur', value: historicalObservations?.operator || interventionInfo?.technicien || '' },
        ].filter((item) => hasHistoricalValue(item.value))
    }, [historicalObservations, historicalPayload, interventionInfo, form.date_intervention])
    const interventionDisplayItems = useMemo(() => {
        return [
            { label: 'Type d’intervention', value: form.type_intervention },
            { label: 'Finalité', value: form.finalite_intervention },
            { label: 'Date d’intervention', value: form.date_intervention },
            { label: 'Technicien / opérateur', value: form.technicien },
            { label: 'Zone / localisation', value: form.zone_intervention },
            { label: 'Matériau / objet concerné', value: form.nature_materiau },
            { label: 'Statut', value: form.statut },
            { label: 'Responsable / référent', value: form.responsable_referent },
            { label: 'Attribué à', value: form.attribue_a },
            { label: 'Objectif / remarque', value: form.objectif_intervention },
            { label: 'Notes terrain', value: form.notes_terrain },
        ].filter((item) => hasHistoricalValue(item.value))
    }, [form])

    function setField(key, value) {
        setForm((prev) => ({ ...prev, [key]: value }))
        setSuccess('')
    }

    function setQuickEchantillonField(key, value) {
        setQuickEchantillonForm((prev) => ({ ...prev, [key]: value }))
        setSuccess('')
    }

    function setQuickEssaiField(key, value) {
        setQuickEssaiForm((prev) => ({ ...prev, [key]: value }))
        setSuccess('')
    }

    function setQuickEssaiCode(value) {
        const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[value] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN
        setQuickEssaiForm({
            essai_code: template.code,
            norme: template.norme || '',
        })
        setSuccess('')
    }

    function buildSavePayload(sourceForm = form) {
        return {
            demande_id: Number(demandeId),
            campaign_id: campaignInfo.uid ? Number(campaignInfo.uid) : null,
            type_intervention: sourceForm.type_intervention,
            sujet: sourceForm.objectif_intervention || sourceForm.type_intervention || '',
            date_intervention: sourceForm.date_intervention,
            duree_heures: null,
            geotechnicien: '',
            technicien: sourceForm.technicien,
            observations: buildObservationsPayload(sourceForm, originalObservations),
            anomalie_detectee: false,
            niveau_alerte: 'Aucun',
            pv_ref: '',
            rapport_ref: '',
            photos_dossier: '',
            statut: sourceForm.statut,
        }
    }

    function buildDirectEssaiDraftPath(interventionUid, options = {}) {
        const essaiCode = options.essaiCode || quickEssaiForm.essai_code
        const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[essaiCode] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN
        const params = new URLSearchParams({
            intervention_id: String(interventionUid),
            essai_code: template.code,
            type_essai: template.typeEssai,
        })

        const norme = options.norme ?? quickEssaiForm.norme
        if (norme) params.set('norme', norme)

        const reference = options.interventionReference || interventionInfo?.reference || ''
        if (reference) params.set('intervention_ref', reference)

        const demandeReference = options.demandeReference || demandeInfo?.reference || ''
        if (demandeReference) params.set('demande_ref', demandeReference)

        const interventionSubject = options.interventionSubject
            || options.interventionType
            || interventionInfo?.sujet
            || form.objectif_intervention
            || form.type_intervention
            || ''
        if (interventionSubject) params.set('intervention_subject', interventionSubject)

        return `/essais/new?${params.toString()}`
    }

    function openDirectEssaiDraft(options = {}) {
        if (isCreate || !uid) return
        navigateWithReturnTo(navigate, buildDirectEssaiDraftPath(uid, options), childReturnTo)
    }

    async function handleCreatePrelevement() {
        if (isCreate || !uid) return

        try {
            setCreatingPrelevement(true)
            setError('')
            setSuccess('')
            const created = await interventionRequalificationApi.createPrelevement({ raw_ids: [Number(uid)] })
            navigateWithReturnTo(navigate, `/prelevements/${created.uid}`, childReturnTo)
        } catch (err) {
            setError(err.message || 'Impossible de créer le prélèvement.')
        } finally {
            setCreatingPrelevement(false)
        }
    }

    async function handleCreateDirectEchantillons(openAfterCreate = false) {
        if (!canCreateDirectEchantillons || !quickEchantillonLines.length) return

        try {
            setCreatingEchantillons(true)
            setError('')
            setSuccess('')

            const created = []
            for (const designation of quickEchantillonLines) {
                const saved = await echantillonsApi.create({
                    demande_id: Number(demandeId),
                    intervention_reelle_id: Number(interventionInfo.intervention_reelle_id),
                    designation,
                    date_prelevement: extractIsoDate(form.date_intervention || interventionInfo?.date_intervention),
                    localisation: quickEchantillonForm.localisation || form.zone_intervention || '',
                    statut: quickEchantillonForm.statut || 'Reçu',
                })
                created.push(saved)
            }

            setQuickEchantillonForm(buildQuickEchantillonForm(form))

            if (openAfterCreate && created.length === 1) {
                const params = new URLSearchParams({
                    demande_id: String(demandeId),
                    intervention_reelle_id: String(interventionInfo.intervention_reelle_id),
                    intervention_reference: interventionInfo?.reference || '',
                    date_intervention: form.date_intervention || interventionInfo?.date_intervention || '',
                    zone: quickEchantillonForm.localisation || form.zone_intervention || '',
                })
                navigateWithReturnTo(navigate, `/echantillons/${created[0].uid}?${params.toString()}`, childReturnTo)
                return
            }

            const rows = await fetchDirectLinkedEchantillons(interventionInfo.intervention_reelle_id)
            setLinkedEchantillons(rows)
            setSuccess(created.length > 1 ? `${created.length} groupes d’essais créés.` : 'Groupe d’essais créé.')
        } catch (err) {
            setError(err.message || 'Impossible de créer les groupes d’essais.')
        } finally {
            setCreatingEchantillons(false)
        }
    }

    function handleOpenDirectEssaiDraft() {
        openDirectEssaiDraft()
    }

    async function handleArchive() {
        if (isCreate || !uid) return
        if (!window.confirm('Archiver cette intervention ? Elle restera consultable avec le statut Annulée.')) return

        try {
            setSaving(true)
            setError('')
            setSuccess('')

            const archived = await api.put(`/interventions/${uid}`, buildSavePayload({ ...form, statut: 'Annulée' }))
            const mergedArchived = mergeFormFromIntervention(archived)
            setInterventionInfo(archived)
            setForm(mergedArchived)
            setQuickEchantillonForm(buildQuickEchantillonForm(mergedArchived))
            setQuickEssaiForm(buildQuickEssaiForm(mergedArchived))
            setOriginalObservations(parseObservations(archived?.observations || ''))
            setEditing(false)
            setSuccess('Intervention archivée.')
        } catch (err) {
            setError(err.message || "Impossible d'archiver l'intervention.")
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (isCreate || !uid) return
        if (!window.confirm('Supprimer définitivement cette intervention ? Cette action est irréversible.')) return

        try {
            setSaving(true)
            setError('')
            setSuccess('')
            await interventionsApi.delete(uid)
            navigate(fallbackReturnTo, { replace: true })
        } catch (err) {
            setError(err.message || "Impossible de supprimer l'intervention.")
            setSaving(false)
        }
    }

    async function handleRefreshLinkedEssais() {
        if (isCreate || !uid) return

        try {
            setLinkedEssaisLoading(true)
            setLinkedEssaisError('')
            setError('')
            if (showHistoricalImportedResult) {
                await essaisApi.syncInterventionEssais(uid)
            }
            const rows = await essaisApi.list({ intervention_id: uid })
            setLinkedEssais(Array.isArray(rows) ? rows : [])
        } catch (err) {
            setLinkedEssais([])
            setLinkedEssaisError(err.message || 'Impossible de synchroniser les essais liés.')
        } finally {
            setLinkedEssaisLoading(false)
        }
    }

    async function handleSave() {
        if (!demandeId) {
            setError('Aucune demande liée à cette intervention.')
            return
        }

        try {
            setSaving(true)
            setError('')
            setSuccess('')
            const payload = buildSavePayload()

            if (isCreate) {
                const saved = await interventionsApi.create(payload)
                setSuccess('Intervention créée avec succès.')
                const createdParams = new URLSearchParams()
                if (campaignInfo.uid) createdParams.set('campaign_uid', String(campaignInfo.uid))
                if (campaignInfo.reference) createdParams.set('campaign_ref', campaignInfo.reference)
                if (campaignInfo.code) createdParams.set('campaign_code', campaignInfo.code)
                if (campaignInfo.label) createdParams.set('campaign_label', campaignInfo.label)
                if (campaignInfo.designation) createdParams.set('campaign_designation', campaignInfo.designation)
                const createdPath = createdParams.toString()
                    ? `/interventions/${saved.uid}?${createdParams.toString()}`
                    : `/interventions/${saved.uid}`
                navigateWithReturnTo(navigate, createdPath, fallbackReturnTo, { replace: true })
                return
            }

            const saved = await api.put(`/interventions/${uid}`, payload)
            const mergedSaved = mergeFormFromIntervention(saved)
            setInterventionInfo(saved)
            setForm(mergedSaved)
            setQuickEchantillonForm(buildQuickEchantillonForm(mergedSaved))
            setQuickEssaiForm(buildQuickEssaiForm(mergedSaved))
            setOriginalObservations(parseObservations(saved?.observations || ''))
            setEditing(false)
            setSuccess('Intervention enregistrée.')
        } catch (err) {
            setError(err.message || "Impossible d'enregistrer l'intervention.")
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 text-text-muted text-sm">
                Chargement intervention…
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface shrink-0 flex-wrap">
                <button
                    onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}
                    className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
                >
                    Retour
                </button>
                {demandeInfo?.reference ? <span className="text-[13px] text-text-muted">{demandeInfo.reference} › </span> : null}
                <span className="text-[14px] font-semibold flex-1 font-mono">{title}</span>
                {!isCreate && form.statut ? <Badge>{form.statut}</Badge> : null}
                {historicalCode ? <Badge>{`Import ${historicalCode}`}</Badge> : null}
                {demandeId ? (
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/demandes/${demandeId}`)}>
                        Demande
                    </Button>
                ) : null}
                {!isCreate && !editing ? (
                    <>
                        {form.statut !== 'Annulée' ? (
                            <Button size="sm" variant="secondary" onClick={handleArchive} disabled={saving}>
                                Archiver
                            </Button>
                        ) : null}
                        <Button size="sm" variant="danger" onClick={handleDelete} disabled={saving}>
                            Supprimer
                        </Button>
                    </>
                ) : null}
                {editing ? (
                    <>
                        {!isCreate ? (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    const resetForm = mergeFormFromIntervention(interventionInfo)
                                    setForm(resetForm)
                                    setQuickEchantillonForm(buildQuickEchantillonForm(resetForm))
                                    setQuickEssaiForm(buildQuickEssaiForm(resetForm))
                                    setEditing(false)
                                    setError('')
                                    setSuccess('')
                                }}
                            >
                                Annuler
                            </Button>
                        ) : null}
                        <Button size="sm" variant="primary" onClick={handleSave} disabled={saving}>
                            {saving ? (isCreate ? 'Création…' : 'Enregistrement…') : (isCreate ? 'Créer l’intervention' : 'Enregistrer')}
                        </Button>
                    </>
                ) : (
                    <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
                        Modifier
                    </Button>
                )}
            </div>

            <div className="p-5 max-w-[860px] mx-auto w-full flex flex-col gap-4">
                {error ? (
                    <div className="text-sm text-danger bg-[#fcebeb] border border-[#f2d1d1] rounded-lg px-3 py-2">
                        {error}
                    </div>
                ) : null}

                {success ? (
                    <div className="text-sm text-[#0f6e56] bg-[#e0f5ef] border border-[#bfe5db] rounded-lg px-3 py-2">
                        {success}
                    </div>
                ) : null}

                {showLinkedEssaisSection ? (
                    <Section title="Essais terrain liés" right={<Badge>{linkedEssais.length}</Badge>}>
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="max-w-3xl">
                                    <div className="text-[16px] font-semibold text-text">
                                        {historicalObservations?.essai_label || interventionInfo?.essai_label || interventionInfo?.type_intervention || HISTORICAL_CODE_LABELS[historicalCode] || 'Essais liés à l’intervention'}
                                    </div>
                                    <div className="mt-1 text-[13px] leading-6 text-text-muted">
                                        {showHistoricalImportedResult
                                            ? (interventionInfo?.sujet || 'Chaque fiche source importée devient ici une fiche d’essai liée, à ouvrir ensuite dans EssaiPage.')
                                            : (interventionInfo?.sujet || 'Cette intervention porte déjà des fiches d’essais liées à reprendre dans EssaiPage.')}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="primary" onClick={handleRefreshLinkedEssais} disabled={linkedEssaisLoading || saving}>
                                        {linkedEssaisLoading ? 'Synchronisation…' : linkedEssaiActionLabel}
                                    </Button>
                                    {linkedEssais[0] ? (
                                        <Button variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/essais/${linkedEssais[0].uid}`, childReturnTo)}>
                                            Ouvrir le premier essai
                                        </Button>
                                    ) : null}
                                </div>
                            </div>

                            {importedResultMeta.length > 0 ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                    {importedResultMeta.map((item) => (
                                        <InfoLine key={item.label} label={item.label} value={item.value} />
                                    ))}
                                </div>
                            ) : null}

                            <LinkedEssaisContent
                                items={linkedEssais}
                                loading={linkedEssaisLoading}
                                error={linkedEssaisError}
                                onOpen={(essaiUid) => navigateWithReturnTo(navigate, `/essais/${essaiUid}`, childReturnTo)}
                                emptyMessage={showHistoricalImportedResult
                                    ? 'Aucune fiche d’essai n’a encore été matérialisée pour cette intervention importée.'
                                    : 'Aucune fiche d’essai n’est encore liée directement à cette intervention.'}
                            />

                            {(historicalFiches.length > 0 || historicalSummaryItems.length > 0) ? (
                                <details className="rounded-lg border border-border bg-bg px-3 py-3">
                                    <summary className="cursor-pointer text-[12px] font-semibold text-text">
                                        Source import et métadonnées
                                    </summary>
                                    <div className="mt-3 flex flex-col gap-3">
                                        {historicalFiches.length > 0 ? (
                                            <div className="grid gap-3 md:grid-cols-2">
                                                {historicalFiches.map((item) => (
                                                    <div key={item.key} className="rounded-lg border border-border bg-surface px-3 py-3">
                                                        <div className="text-[13px] font-semibold text-text">{item.label}</div>
                                                        <div className="mt-1 text-[12px] text-text-muted">
                                                            {[item.ref, item.date, item.fileName].filter(Boolean).join(' · ') || 'Fiche historique importée'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}

                                        {historicalSummaryItems.length > 0 ? (
                                            <div className="grid gap-3 md:grid-cols-2">
                                                {historicalSummaryItems.map((item, index) => (
                                                    <InfoLine key={`${item.label}-${index}`} label={item.label} value={item.value} />
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </details>
                            ) : null}
                        </div>
                    </Section>
                ) : null}

                <Section title={editing || isCreate ? 'Intervention' : 'Fiche intervention'}>
                    {editing ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Type d’intervention">
                                <Select value={form.type_intervention} onChange={(e) => setField('type_intervention', e.target.value)}>
                                    <option value="">—</option>
                                    {typeOptions.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Finalité">
                                <Select value={form.finalite_intervention} onChange={(e) => setField('finalite_intervention', e.target.value)}>
                                    <option value="">—</option>
                                    {FINALITY_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Date d’intervention">
                                <Input type="date" value={form.date_intervention} onChange={(e) => setField('date_intervention', e.target.value)} />
                            </Field>

                            <Field label="Technicien / opérateur">
                                <Input value={form.technicien} onChange={(e) => setField('technicien', e.target.value)} />
                            </Field>

                            <Field label="Zone / localisation">
                                <Input value={form.zone_intervention} onChange={(e) => setField('zone_intervention', e.target.value)} />
                            </Field>

                            <Field label="Matériau / objet concerné">
                                <Select value={form.nature_materiau} onChange={(e) => setField('nature_materiau', e.target.value)}>
                                    <option value="">—</option>
                                    {MATERIAL_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Statut">
                                <Select value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
                                    {STATUTS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Responsable / référent">
                                <Input value={form.responsable_referent} onChange={(e) => setField('responsable_referent', e.target.value)} />
                            </Field>

                            <Field label="Attribué à">
                                <Input value={form.attribue_a} onChange={(e) => setField('attribue_a', e.target.value)} />
                            </Field>

                            <Field label="Objectif / remarque" full>
                                <Textarea
                                    value={form.objectif_intervention}
                                    onChange={(value) => setField('objectif_intervention', value)}
                                    rows={3}
                                    placeholder="Décrire simplement ce qui a été fait ou ce qui doit être constaté."
                                />
                            </Field>

                            <Field label="Notes terrain" full>
                                <Textarea
                                    value={form.notes_terrain}
                                    onChange={(value) => setField('notes_terrain', value)}
                                    rows={4}
                                    placeholder="Remarques terrain, constats, suites à donner…"
                                />
                            </Field>
                        </div>
                    ) : interventionDisplayItems.length > 0 ? (
                        <div className="grid gap-x-8 md:grid-cols-2">
                            <div>
                                {interventionDisplayItems.slice(0, Math.ceil(interventionDisplayItems.length / 2)).map((item) => (
                                    <InfoLine key={item.label} label={item.label} value={item.value} />
                                ))}
                            </div>
                            <div>
                                {interventionDisplayItems.slice(Math.ceil(interventionDisplayItems.length / 2)).map((item) => (
                                    <InfoLine key={item.label} label={item.label} value={item.value} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-[13px] text-text-muted">
                            Cette fiche ne porte pas encore de repères saisis au-delà du résultat importé.
                        </div>
                    )}
                </Section>

                <Section title="Préparation (avant intervention)">
                    {editing ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Points à réaliser" full>
                                <Textarea value={form.prep_points_a_realiser} onChange={v => setField('prep_points_a_realiser', v)} rows={2} placeholder="Localisation, nature, quantité…" />
                            </Field>
                            <Field label="Essais à effectuer" full>
                                <Textarea value={form.prep_essais_a_effectuer} onChange={v => setField('prep_essais_a_effectuer', v)} rows={2} placeholder="PL, CBR, prélèvements…" />
                            </Field>
                            <Field label="Matériels requis" full>
                                <Textarea value={form.prep_materiels_requis} onChange={v => setField('prep_materiels_requis', v)} rows={2} placeholder="Appareils, vérifié métrologie oui/non, EPI, contenants…" />
                            </Field>
                            <Field label="Contact chantier / accès">
                                <Input value={form.prep_contact_chantier} onChange={e => setField('prep_contact_chantier', e.target.value)} placeholder="Nom, tél, horaires…" />
                            </Field>
                            <Field label="Plan de prévention requis">
                                <Select value={form.prep_plan_prevention} onChange={e => setField('prep_plan_prevention', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                                    <option value="">—</option>
                                    <option>Non requis</option>
                                    <option>Requis — en cours</option>
                                    <option>Requis — validé</option>
                                </Select>
                            </Field>
                            <Field label="Contraintes accès / coactivité" full>
                                <Textarea value={form.prep_contraintes_acces} onChange={v => setField('prep_contraintes_acces', v)} rows={2} placeholder="Balisage, circulation, coactivité…" />
                            </Field>
                            <Field label="Préparation complète">
                                <Select value={form.prep_preparation_complete} onChange={e => setField('prep_preparation_complete', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                                    <option value="">—</option>
                                    <option>Oui</option>
                                    <option>Non</option>
                                </Select>
                            </Field>
                            <Field label="Point bloquant">
                                <Select value={form.prep_point_bloquant} onChange={e => setField('prep_point_bloquant', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                                    <option value="">—</option>
                                    <option>Non</option>
                                    <option>Oui</option>
                                </Select>
                            </Field>
                            {form.prep_point_bloquant === 'Oui' && (
                                <Field label="Description point bloquant" full>
                                    <Textarea value={form.prep_point_bloquant_desc} onChange={v => setField('prep_point_bloquant_desc', v)} rows={2} />
                                </Field>
                            )}
                        </div>
                    ) : (
                        <div className="grid gap-x-8 md:grid-cols-2">
                            <div>
                                <InfoLine label="Points à réaliser" value={form.prep_points_a_realiser} />
                                <InfoLine label="Essais prévus" value={form.prep_essais_a_effectuer} />
                                <InfoLine label="Matériels" value={form.prep_materiels_requis} />
                            </div>
                            <div>
                                <InfoLine label="Contact chantier" value={form.prep_contact_chantier} />
                                <InfoLine label="Plan prévent." value={form.prep_plan_prevention} />
                                <InfoLine label="Préparation complète" value={form.prep_preparation_complete} />
                                <InfoLine label="Point bloquant" value={form.prep_point_bloquant + (form.prep_point_bloquant_desc ? ' — ' + form.prep_point_bloquant_desc : '')} />
                            </div>
                        </div>
                    )}
                </Section>

                <Section title="Conditions et réalisation">
                    {editing ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Météo">
                                <Input value={form.cond_meteo} onChange={e => setField('cond_meteo', e.target.value)} placeholder="Beau, nuageux, pluie, T°…" />
                            </Field>
                            <Field label="État du site">
                                <Input value={form.cond_etat_site} onChange={e => setField('cond_etat_site', e.target.value)} placeholder="Humide, bon état, saturé…" />
                            </Field>
                            <Field label="Écarts prévu / réel" full>
                                <Textarea value={form.cond_ecarts} onChange={v => setField('cond_ecarts', v)} rows={2} placeholder="Points non réalisés, changements de programme…" />
                            </Field>
                            <Field label="Nb points prévus">
                                <Input type="number" value={form.real_nb_points_prevus} onChange={e => setField('real_nb_points_prevus', e.target.value)} />
                            </Field>
                            <Field label="Nb points réalisés">
                                <Input type="number" value={form.real_nb_points_realises} onChange={e => setField('real_nb_points_realises', e.target.value)} />
                            </Field>
                            <Field label="Motif points non réalisés" full>
                                <Textarea value={form.real_points_non_realises_motif} onChange={v => setField('real_points_non_realises_motif', v)} rows={2} />
                            </Field>
                            <Field label="Incidents / anomalies" full>
                                <Textarea value={form.real_incidents} onChange={v => setField('real_incidents', v)} rows={2} />
                            </Field>
                            <Field label="Non-conformités" full>
                                <Textarea value={form.real_non_conformites} onChange={v => setField('real_non_conformites', v)} rows={2} />
                            </Field>
                            <Field label="Adaptations sur site" full>
                                <Textarea value={form.real_adaptations} onChange={v => setField('real_adaptations', v)} rows={2} />
                            </Field>
                        </div>
                    ) : (
                        <div className="grid gap-x-8 md:grid-cols-2">
                            <div>
                                <InfoLine label="Météo" value={form.cond_meteo} />
                                <InfoLine label="État site" value={form.cond_etat_site} />
                                <InfoLine label="Pts prévus / réalisés" value={form.real_nb_points_prevus || form.real_nb_points_realises ? `${form.real_nb_points_prevus || '?'} / ${form.real_nb_points_realises || '?'}` : ''} />
                            </div>
                            <div>
                                <InfoLine label="Incidents" value={form.real_incidents} />
                                <InfoLine label="Non-conformités" value={form.real_non_conformites} />
                                <InfoLine label="Écarts" value={form.cond_ecarts} />
                            </div>
                        </div>
                    )}
                </Section>

                <Section title="Sortie d'intervention">
                    {editing ? (
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Nb échantillons ramenés">
                                <Input type="number" value={form.sortie_nb_echantillons} onChange={e => setField('sortie_nb_echantillons', e.target.value)} />
                            </Field>
                            <Field label="Destination labo">
                                <Input value={form.sortie_destination_labo} onChange={e => setField('sortie_destination_labo', e.target.value)} placeholder="SP, AUV, CHB, CLM…" />
                            </Field>
                            <Field label="Alerte émise">
                                <Select value={form.sortie_alerte} onChange={e => setField('sortie_alerte', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                                    <option value="">—</option>
                                    <option>Non</option>
                                    <option>Oui</option>
                                </Select>
                            </Field>
                            <Field label="Information demandeur">
                                <Select value={form.sortie_info_demandeur} onChange={e => setField('sortie_info_demandeur', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent">
                                    <option value="">—</option>
                                    <option>Non</option>
                                    <option>Oui</option>
                                </Select>
                            </Field>
                            {form.sortie_alerte === 'Oui' && (
                                <Field label="Description alerte" full>
                                    <Textarea value={form.sortie_alerte_desc} onChange={v => setField('sortie_alerte_desc', v)} rows={2} />
                                </Field>
                            )}
                            <Field label="Synthèse de l'intervention" full>
                                <Textarea value={form.sortie_synthese} onChange={v => setField('sortie_synthese', v)} rows={3} placeholder="Bilan rapide, constats principaux, suites à donner…" />
                            </Field>
                        </div>
                    ) : (
                        <div className="grid gap-x-8 md:grid-cols-2">
                            <div>
                                <InfoLine label="Échantillons ramenés" value={form.sortie_nb_echantillons} />
                                <InfoLine label="Destination labo" value={form.sortie_destination_labo} />
                                <InfoLine label="Alerte" value={form.sortie_alerte + (form.sortie_alerte_desc ? ' — ' + form.sortie_alerte_desc : '')} />
                            </div>
                            <div>
                                <InfoLine label="Info demandeur" value={form.sortie_info_demandeur} />
                                <InfoLine label="Synthèse" value={form.sortie_synthese} />
                            </div>
                        </div>
                    )}
                </Section>

                <Section title="Demande liée">
                    <div className="grid gap-x-8 md:grid-cols-2">
                        <div>
                            <InfoLine label="Demande" value={demandeInfo?.reference || demandeId} />
                            <InfoLine label="Campagne" value={campaignInfo.reference || campaignInfo.code} />
                            <InfoLine label="Affaire" value={demandeInfo?.affaire_ref || demandeInfo?.affaire_reference || ''} />
                        </div>
                        <div>
                            <InfoLine label="Contexte campagne" value={[campaignInfo.label, campaignInfo.designation].filter(Boolean).join(' · ')} />
                            <InfoLine label="Chantier / Site" value={demandeInfo?.chantier || demandeInfo?.site || ''} />
                        </div>
                    </div>
                </Section>

                {historicalFiches.length > 0 && isSondageComposite ? (
                    <Section title="Fiches de sondage importées" right={<Badge>{historicalFiches.length}</Badge>}>
                        <div className="grid gap-3 md:grid-cols-2">
                            {historicalFiches.map((item) => (
                                <div key={item.key} className="rounded-lg border border-border bg-bg px-3 py-3">
                                    <div className="text-[13px] font-semibold text-text">{item.label}</div>
                                    <div className="mt-1 text-[12px] text-text-muted">
                                        {[item.ref, item.date, item.fileName].filter(Boolean).join(' · ') || 'Fiche historique importée'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3 pt-2 border-t border-border">
                            <div className="text-[11px] font-bold uppercase tracking-[.05em] text-text-muted">Prélèvements issus des coupes</div>
                            <LinkedPrelevementsContent
                                items={linkedPrelevements}
                                loading={linkedPrelevementsLoading}
                                error={linkedPrelevementsError}
                                onOpen={(prelevementUid) => navigateWithReturnTo(navigate, `/prelevements/${prelevementUid}`, childReturnTo)}
                                emptyMessage="Aucun prélèvement n’est encore visible dans cette fiche SO."
                            />
                        </div>
                    </Section>
                ) : null}

                {isSondageComposite ? (
                    <Section title="Fiche sondage composite" right={<Badge>{historicalCode}</Badge>}>
                        <div className="grid gap-3 md:grid-cols-2">
                            <InfoLine label="Bloc historique" value={sondageSetSummary.heading || ''} />
                            <InfoLine label="Tableau extrait" value={historicalRows.length ? `${historicalRows.length} ligne(s)` : 'Pas encore'} />
                            <InfoLine label="Ouvrage" value={sondageSetSummary.ouvrage || ''} />
                            <InfoLine label="Partie d'ouvrage" value={sondageSetSummary.partieOuvrage || ''} />
                            <InfoLine label="Procédé de sondage" value={sondageSetSummary.procede || ''} />
                            <InfoLine label="Diamètre / outil" value={sondageSetSummary.diametre || ''} />
                            <InfoLine label="Date de sondage" value={sondageSetSummary.dateSondage || ''} />
                            <InfoLine label="Conditions" value={sondageSetSummary.meteo || ''} />
                            <InfoLine label="Arrêt de sondage" value={sondageSetSummary.arret || ''} />
                            <InfoLine label="Section contrôlée" value={historicalPayload?.section_controlee || ''} />
                            <InfoLine label="Destination" value={historicalPayload?.destination || ''} />
                            <InfoLine label="Nature matériau" value={historicalPayload?.nature_materiau || ''} />
                        </div>

                        {sondageSetSummary.preview.length > 0 && (
                            <div className="border border-border rounded-lg bg-bg px-3 py-3 flex flex-col gap-1">
                                <div className="text-[11px] font-bold uppercase tracking-[.05em] text-text-muted">En-tête historique</div>
                                {sondageSetSummary.preview.map((line, index) => (
                                    <div key={`${historicalCode}-preview-${index}`} className="text-[12px] leading-5 text-text-muted">{line}</div>
                                ))}
                            </div>
                        )}
                    </Section>
                ) : null}

                {!isCreate ? (
                    <Section title={showHistoricalImportedResult ? 'Chaîne suivante' : 'Suite opérationnelle'}>
                        {showLinkedEssaisSection ? (
                            <>
                                <div className="text-[13px] leading-6 text-text-muted">
                                    {showHistoricalImportedResult
                                        ? 'Cette intervention importée débouche directement sur des fiches d’essais terrain. La suite métier se fait depuis ces fiches, pas depuis un tableau de résultats affiché dans l’intervention.'
                                        : 'La suite métier se fait depuis les fiches d’essais liées à cette intervention.'}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {linkedEssais[0] ? (
                                        <Button variant="primary" onClick={() => navigateWithReturnTo(navigate, `/essais/${linkedEssais[0].uid}`, childReturnTo)}>
                                            Ouvrir le premier essai
                                        </Button>
                                    ) : null}
                                    <Button variant="secondary" onClick={handleRefreshLinkedEssais} disabled={linkedEssaisLoading || saving}>
                                        {linkedEssaisLoading ? 'Synchronisation…' : linkedEssaiActionLabel}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-[13px] leading-6 text-text-muted">
                                    {showHistoricalImportedResult
                                        ? 'Même logique de fiche que sur EchantillonPage: on lit d’abord, puis on crée la suite seulement si elle est utile.'
                                        : 'Depuis ici, on ouvre la suite utile: prélèvement s’il y a une prise physique, ou groupe d’essais direct quand la chaîne existe déjà.'}
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <Field label="Essai direct à préparer">
                                        <Select value={quickEssaiForm.essai_code} onChange={(e) => setQuickEssaiCode(e.target.value)}>
                                            {DIRECT_ESSAI_TEMPLATES.map((item) => (
                                                <option key={item.code} value={item.code}>{item.label}</option>
                                            ))}
                                        </Select>
                                    </Field>

                                    <Field label="Norme / méthode">
                                        <Input
                                            value={quickEssaiForm.norme}
                                            onChange={(e) => setQuickEssaiField('norme', e.target.value)}
                                            placeholder="Optionnel"
                                        />
                                    </Field>

                                    <div className="col-span-2 rounded-lg border border-border bg-bg px-3 py-3 text-[12px] text-text-muted">
                                        Ouvre un brouillon EssaiPage rattaché directement à cette intervention pour {selectedDirectEssaiTemplate.label.toLowerCase()}. L’essai n’est créé en base qu’au premier enregistrement.
                                    </div>

                                    <div className="col-span-2 flex flex-wrap gap-2">
                                        <Button variant="primary" onClick={handleOpenDirectEssaiDraft}>
                                            Créer un essai direct
                                        </Button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" onClick={handleCreatePrelevement} disabled={creatingPrelevement || saving}>
                                        {creatingPrelevement ? 'Création…' : 'Créer un prélèvement'}
                                    </Button>
                                    {linkedPrelevements[0] ? (
                                        <Button variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/prelevements/${linkedPrelevements[0].uid}`, childReturnTo)}>
                                            Ouvrir le prélèvement principal
                                        </Button>
                                    ) : null}
                                </div>

                                {canCreateDirectEchantillons ? (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        <Field label="Groupes directs à créer" full>
                                            <Textarea
                                                value={quickEchantillonForm.designation_lines}
                                                onChange={(value) => setQuickEchantillonField('designation_lines', value)}
                                                rows={4}
                                                placeholder={"Ex: Contrôle plateforme zone A\nEssai compactage piste nord"}
                                            />
                                        </Field>

                                        <Field label="Localisation initiale">
                                            <Input
                                                value={quickEchantillonForm.localisation}
                                                onChange={(e) => setQuickEchantillonField('localisation', e.target.value)}
                                                placeholder="Zone ou localisation du groupe"
                                            />
                                        </Field>

                                        <Field label="Statut initial">
                                            <Select value={quickEchantillonForm.statut} onChange={(e) => setQuickEchantillonField('statut', e.target.value)}>
                                                {['Reçu', 'En attente', 'En cours', 'Terminé', 'Rejeté'].map((item) => (
                                                    <option key={item} value={item}>{item}</option>
                                                ))}
                                            </Select>
                                        </Field>

                                        <div className="col-span-2 rounded-lg border border-border bg-bg px-3 py-3 text-[12px] text-text-muted">
                                            {quickEchantillonLines.length
                                                ? `${quickEchantillonLines.length} groupe(s) prêt(s) à créer depuis ${interventionInfo?.reference || 'cette intervention'}.`
                                                : 'Ajoute au moins une ligne pour créer un groupe d’essais direct.'}
                                        </div>

                                        <div className="col-span-2 flex flex-wrap gap-2">
                                            <Button
                                                variant="secondary"
                                                onClick={() => handleCreateDirectEchantillons(false)}
                                                disabled={!quickEchantillonLines.length || creatingEchantillons}
                                            >
                                                {creatingEchantillons ? 'Création…' : directCreateButtonLabel}
                                            </Button>

                                            {quickEchantillonLines.length === 1 ? (
                                                <Button variant="primary" onClick={() => handleCreateDirectEchantillons(true)} disabled={creatingEchantillons}>
                                                    Ouvrir après création
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[13px] leading-6 text-text-muted">
                                        {showHistoricalImportedResult
                                            ? 'Aucun rattachement direct n’est encore consolidé pour cette intervention. La fiche reste donc en lecture tant qu’un prélèvement ou un groupe n’est pas créé.'
                                            : 'Ici, la suite la plus sûre passe par le prélèvement. Les groupes d’essais directs apparaissent seulement quand l’intervention parent est déjà consolidée dans la chaîne.'}
                                    </div>
                                )}

                                {!isSondageComposite ? (
                                    <div className="flex flex-col gap-3 pt-2 border-t border-border">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[11px] font-bold uppercase tracking-[.05em] text-text-muted">Prélèvements liés</div>
                                            <Badge>{linkedPrelevements.length}</Badge>
                                        </div>
                                        <LinkedPrelevementsContent
                                            items={linkedPrelevements}
                                            loading={linkedPrelevementsLoading}
                                            error={linkedPrelevementsError}
                                            onOpen={(prelevementUid) => navigateWithReturnTo(navigate, `/prelevements/${prelevementUid}`, childReturnTo)}
                                            emptyMessage="Aucun prélèvement n’est encore rattaché à cette intervention."
                                        />
                                    </div>
                                ) : null}

                                <div className="flex flex-col gap-3 pt-2 border-t border-border">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-[11px] font-bold uppercase tracking-[.05em] text-text-muted">Groupes d’essais directs</div>
                                        <Badge>{linkedEchantillons.length}</Badge>
                                    </div>
                                    <LinkedEchantillonsContent
                                        items={linkedEchantillons}
                                        loading={linkedEchantillonsLoading}
                                        error={linkedEchantillonsError}
                                        onOpen={(echantillonUid) => navigateWithReturnTo(navigate, `/echantillons/${echantillonUid}`, childReturnTo)}
                                        emptyMessage="Aucun groupe d’essais direct n’est encore rattaché à cette intervention."
                                    />
                                </div>
                            </>
                        )}
                    </Section>
                ) : null}
            </div>
        </div>
    )
}
