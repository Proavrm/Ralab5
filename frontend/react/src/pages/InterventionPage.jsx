/**
 * InterventionPage.jsx
 * Fiche intervention terrain — layout aligné sur AffairePage (hero, métriques, SectionCard).
 */

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import InterventionTypeModal, { buildInterventionTypeOptions } from '@/components/interventions/InterventionTypeModal'
import Input, { Select } from '@/components/ui/Input'
import { api, demandesApi, echantillonsApi, essaisApi, feuillesTerrainApi, interventionRequalificationApi, interventionsApi } from '@/services/api'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import {
    buildTerrainFeuilleOpenPath,
    createTerrainFeuilleForIntervention,
    isFeuilleTerrainEssaiCode,
} from '@/lib/terrainFeuilleFromIntervention'
import { formatDate } from '@/lib/utils'
import {
  DEMANDE_STAT_CLS,
  FieldCard,
  FicheBadge,
  MetricCard,
  PAGE_BG,
  SectionCard,
} from '@/components/layout/FicheLayout'

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
    { code: 'PLD', label: 'Portances dynaplaque', typeEssai: 'Portances dynaplaque', norme: '' },
    { code: 'PL', label: 'Portances à la plaque', typeEssai: 'Portances à la plaque', norme: '' },
    { code: 'DS', label: 'Densité sols in situ', typeEssai: 'Densité sols in situ', norme: '' },
    { code: 'QS', label: 'Contrôle de compactage', typeEssai: 'Contrôle compactage GTR', norme: '' },
    { code: 'PA', label: 'Pénétromètre', typeEssai: 'Pénétromètre / PANDA', norme: '' },
    { code: 'SO', label: 'Coupe de sondage', typeEssai: 'Coupe de sondage', norme: '' },
    { code: 'SC', label: 'Coupe de sondage carotté', typeEssai: 'Coupe de sondage carotté', norme: '' },
    { code: 'EAU', label: 'Essai d’eau ou d’infiltration', typeEssai: 'Essai d’eau / infiltration', norme: '' },
    { code: 'PER', label: 'Percolation', typeEssai: 'Percolation', norme: '' },
    { code: 'INF', label: 'Infiltration / perméabilité', typeEssai: 'Infiltration / perméabilité', norme: '' },
    { code: 'EE', label: 'Étanchéité à l’eau', typeEssai: 'Étanchéité à l’eau', norme: '' },
    { code: 'EA', label: 'Étanchéité à l’air', typeEssai: 'Étanchéité à l’air', norme: '' },
]

const DIRECT_ESSAI_TEMPLATE_BY_CODE = DIRECT_ESSAI_TEMPLATES.reduce((accumulator, item) => {
    accumulator[item.code] = item
    return accumulator
}, {})

const INTERVENTION_TYPE_SUGGESTED_FINALITY = {
    'Visite chantier': 'Suivi d\'exécution',
    'Visite de constat': 'Diagnostic d\'anomalie',
    'Recontrôle': 'Réception technique',
    'Contre-visite': 'Réception technique',
    'Visite G3': 'Suivi d\'exécution',
    'Réunion technique sur site': 'Suivi d\'exécution',
    'Essai de plaque': 'Contrôle de plateforme / portance',
    'Prélèvement': 'Prélèvement pour laboratoire',
    'Sondage': 'Identification / classification',
    'Carottage': 'Prélèvement pour laboratoire',
    'Campagne de description géotechnique': 'Identification / classification',
    'Contrôle béton frais': 'Contrôle de matériaux',
    'Pose de matériel': 'Réception technique',
    'Relevé de matériel': 'Réception technique',
}

const DIRECT_ESSAIS_BY_INTERVENTION_TYPE = {
    'Essai de plaque': ['PL', 'PLD'],
    'Sondage': ['SO', 'SC', 'PA'],
    'Sondage carotté': ['SC'],
    'Sondage carotte': ['SC'],
    'Carottage': ['SC', 'SO'],
    'Campagne de description géotechnique': ['SO', 'SC', 'PA'],
    'Prélèvement': [],
    'Contrôle béton frais': ['GEN'],
    'Visite chantier': [],
    'Visite de constat': [],
    'Recontrôle': [],
    'Contre-visite': [],
    'Visite G3': [],
    'Réunion technique sur site': [],
    'Pose de matériel': [],
    'Relevé de matériel': [],
    'Autre': ['GEN'],
}

const DIRECT_ESSAIS_BY_HISTORICAL_CODE = {
    DF: ['DF'],
    PLD: ['PLD'],
    DE: ['DE'],
    SO: ['SO'],
    SC: ['SC'],
}

function getInterventionEssaiMismatchWarning(interventionType, essaiCode) {
    const type = String(interventionType || '').toLowerCase()
    const code = String(essaiCode || '').trim().toUpperCase()
    const waterish = (
        type.includes('eau')
        || type.includes('infiltration')
        || type.includes('percolation')
        || type.includes('perméabilité')
        || type.includes('permeabilite')
    )
    const enrobeish = type.includes('enrob') || type.includes('chaussée') || type.includes('chaussee')
    const sondageish = type.includes('sondage') || type.includes('carottage') || type.includes('reconnaissance')

    if (waterish && ['DE', 'DF', 'CFE', 'PLD', 'PL', 'PDL', 'SC', 'SO'].includes(code)) {
        return `Cette intervention concerne l’eau ou l’infiltration. Un essai ${code} n’y est en principe pas attendu.`
    }
    if (enrobeish && ['EAU', 'INF', 'PER', 'PA'].includes(code)) {
        return `Cette intervention concerne les enrobés / chaussées. Un essai ${code} n’y est en principe pas attendu.`
    }
    if (sondageish && ['DE', 'DF', 'EAU', 'PER'].includes(code)) {
        return `Cette intervention concerne un sondage / une reconnaissance. Un essai ${code} n’y est en principe pas attendu.`
    }
    return ''
}

function inferDirectEssaiCodes(source = {}) {
    const normalizedType = String(source?.type_intervention || '').trim()
    const normalizedTypeLookup = normalizeHistoricalLookup(normalizedType)
    const historicalCode = String(source?.historicalCode || '').trim().toUpperCase()
    const explicitLabel = String(source?.historicalLabel || '').toLowerCase()

    const byType = DIRECT_ESSAIS_BY_INTERVENTION_TYPE[normalizedType]
    if (Array.isArray(byType) && byType.length) return byType

    const byHistoricalCode = DIRECT_ESSAIS_BY_HISTORICAL_CODE[historicalCode]
    if (Array.isArray(byHistoricalCode) && byHistoricalCode.length) return byHistoricalCode

    if (normalizedTypeLookup.includes('sondage carotte') || normalizedTypeLookup.includes('carottage')) {
        return ['SC']
    }
    if (normalizedTypeLookup.includes('sondage')) {
        return ['SO', 'SC', 'PA']
    }

    if (explicitLabel.includes('déflex') || explicitLabel.includes('deflex')) return ['DF']
    if (explicitLabel.includes('dynaplaque')) return ['PLD']
    if (explicitLabel.includes('densité enrobés') || explicitLabel.includes('densite enrobes')) return ['DE']

    return []
}

function getDirectEssaiTemplatesForIntervention(_source = {}) {
    return DIRECT_ESSAI_TEMPLATES
}

function guessDirectEssaiCode(source = null) {
    const typeIntervention = String(source?.type_intervention || '').toLowerCase()
    const finalite = String(source?.finalite_intervention || '').toLowerCase()
    const materiau = String(source?.nature_materiau || '').toLowerCase()

    if (typeIntervention.includes('enrob')) return 'DE'
    if (typeIntervention.includes('plateforme') || finalite.includes('portance')) return 'PLD'
    if (finalite.includes('compactage')) return 'QS'
    if (finalite.includes('percolation') || typeIntervention.includes('percolation')) return 'PER'
    if (typeIntervention.includes('infiltration') || finalite.includes('infiltration') || finalite.includes('perméabilité') || finalite.includes('permeabilite')) return 'INF'
    if (typeIntervention.includes('essai d') && typeIntervention.includes('eau')) return 'EAU'
    if (typeIntervention.includes('étanchéité') || finalite.includes('étanchéité') || materiau.includes('réseau')) return 'EE'
    if (typeIntervention.includes('reconnaissance')) return 'SO'
    return 'GEN'
}

function normalizeEssaiFollowupItem(source) {
    if (!source) return null

    if (typeof source === 'string') {
        const trimmed = source.trim()
        if (!trimmed) return null
        const byCode = DIRECT_ESSAI_TEMPLATE_BY_CODE[trimmed.toUpperCase()]
        const byLabel = DIRECT_ESSAI_TEMPLATES.find((item) => item.label.toLowerCase() === trimmed.toLowerCase())
        const template = byCode || byLabel || null
        return {
            code: template?.code || '',
            label: template?.label || trimmed,
            norme: template?.norme || '',
        }
    }

    if (typeof source !== 'object') return null

    const rawCode = String(source.code || source.essai_code || '').trim().toUpperCase()
    const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[rawCode] || null
    const label = String(source.label || source.type_essai || template?.label || rawCode || '').trim()
    const norme = String(source.norme || template?.norme || '').trim()

    if (!label && !rawCode) return null

    return {
        code: template?.code || rawCode || '',
        label: label || template?.label || rawCode,
        norme,
    }
}

function normalizeEssaiFollowupList(rawValue, fallbackText = '') {
    const directItems = Array.isArray(rawValue)
        ? rawValue
        : []

    const fallbackItems = !directItems.length && typeof fallbackText === 'string' && fallbackText.trim()
        ? fallbackText
            .split(/\r?\n|,/)
            .map((item) => item.trim())
            .filter(Boolean)
        : []

    return [...directItems, ...fallbackItems]
        .map((item) => normalizeEssaiFollowupItem(item))
        .filter(Boolean)
}

function buildEssaiFollowupKey(item) {
    return [
        String(item?.code || '').trim().toUpperCase(),
        String(item?.label || '').trim().toLowerCase(),
        String(item?.norme || '').trim().toLowerCase(),
    ].join('::')
}

function Card({ title, children }) {
    return (
        <SectionCard title={title || 'Section'}>
            {children}
        </SectionCard>
    )
}

function FG({ label, children, full = false }) {
    return (
        <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
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

function Section({ title, children, right }) {
    const hiddenTitleFragments = ['Sortie d', 'Fiche d', 'Détails enregistr', 'DÃ©tails enregistr', 'Fiches de sondage', 'Fiche sondage composite']
    if (hiddenTitleFragments.some((fragment) => String(title || '').includes(fragment))) {
        return null
    }

    return (
        <SectionCard title={title || 'Section'} chip={right}>
            <div className="flex flex-col gap-3">
                {children}
            </div>
        </SectionCard>
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

function PlanningCheckpoint({ label, detail, done }) {
    return (
        <div className={`rounded-lg border px-3 py-3 ${done ? 'border-[#bfe5db] bg-[#eaf6f1]' : 'border-border bg-surface'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-text">{label}</div>
                    <div className="mt-1 text-[12px] leading-5 text-text-muted">
                        {detail || 'À préciser'}
                    </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.05em] ${done ? 'border-[#9fd8c8] bg-white text-[#0f6e56]' : 'border-border bg-bg text-text-muted'}`}>
                    {done ? 'OK' : 'À faire'}
                </span>
            </div>
        </div>
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

    if (code === 'DF') {
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
        suite_nb_essais_prevus:      form.suite_nb_essais_prevus || '',
        suite_essais_prevus:         [],
        suite_essais_realises:       normalizeEssaiFollowupList(form.suite_essais_realises),
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
        suite_nb_essais_prevus:      String(
            observations.suite_nb_essais_prevus
            ?? normalizeEssaiFollowupList(observations.suite_essais_prevus, observations.prep_essais_a_effectuer).length
            ?? ''
        ),
        suite_essais_prevus:         [],
        suite_essais_realises:       normalizeEssaiFollowupList(observations.suite_essais_realises),
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
        suite_nb_essais_prevus: '',
        suite_essais_prevus: [],
        suite_essais_realises: [],
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
        option_value: template.code,
        essai_code: template.code,
        norme: template.norme || '',
        source_label: '',
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
        suite_nb_essais_prevus: '',
        suite_essais_prevus: [],
        suite_essais_realises: [],
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
    const [linkedFeuillesTerrain, setLinkedFeuillesTerrain] = useState([])
    const [linkedPointsTerrain, setLinkedPointsTerrain] = useState([])
    const [linkedCouchesTerrain, setLinkedCouchesTerrain] = useState([])
    const [quickEchantillonForm, setQuickEchantillonForm] = useState(buildQuickEchantillonForm())
    const [quickEssaiForm, setQuickEssaiForm] = useState(buildQuickEssaiForm())
    const [creatingPrelevement, setCreatingPrelevement] = useState(false)
    const [creatingEchantillons, setCreatingEchantillons] = useState(false)
    const [creatingDirectFeuille, setCreatingDirectFeuille] = useState(false)
    const [removingFeuilleUid, setRemovingFeuilleUid] = useState(null)
    const [typePickerOpen, setTypePickerOpen] = useState(false)

    const demandeId = form.demande_id || ''
    const campaignInfo = useMemo(() => ({
        source: searchParams.get('source') || '',
        uid: searchParams.get('campaign_uid') || String(interventionInfo?.campaign_id || ''),
        reference: searchParams.get('campaign_ref') || interventionInfo?.campaign_ref || '',
        code: searchParams.get('campaign_code') || interventionInfo?.campaign_code || '',
        label: searchParams.get('campaign_label') || interventionInfo?.campaign_label || '',
        designation: searchParams.get('campaign_designation') || interventionInfo?.campaign_designation || '',
        programme: searchParams.get('campaign_programme') || '',
        zone_scope: searchParams.get('campaign_zone') || '',
        temporalite: searchParams.get('campaign_temporalite') || '',
        nb_points_prevus: searchParams.get('campaign_nb_points') || '',
        types_essais_prevus: searchParams.get('campaign_essais') || '',
        responsable_technique: searchParams.get('campaign_responsable') || '',
        attribue_a: searchParams.get('campaign_attribue_a') || '',
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
    const missionWindow = useMemo(() => {
        const hours = [form.heure_debut, form.heure_fin].filter(Boolean).join(' - ')
        return [form.date_intervention, hours].filter(Boolean).join(' · ')
    }, [form.date_intervention, form.heure_debut, form.heure_fin])
    const interventionSourceLabel = useMemo(() => {
        if (campaignInfo.source === 'preparation') return 'Issue de la préparation de la demande'
        if (campaignInfo.reference || campaignInfo.code || campaignInfo.label || campaignInfo.designation) return 'Issue d\'une campagne'
        return ''
    }, [campaignInfo])
    const demandeContextItems = useMemo(() => {
        return [
            { label: 'Demande', value: demandeInfo?.reference || demandeId || '' },
            { label: 'Affaire', value: demandeInfo?.affaire_ref || demandeInfo?.affaire_reference || '' },
            { label: 'Client', value: demandeInfo?.client || '' },
            { label: 'Chantier / site', value: [demandeInfo?.chantier, demandeInfo?.site].filter(Boolean).join(' · ') },
        ].filter((item) => hasHistoricalValue(item.value))
    }, [demandeInfo, demandeId])
    const campaignContextItems = useMemo(() => {
        return [
            { label: 'Source', value: interventionSourceLabel },
            { label: 'Campagne', value: campaignInfo.reference || campaignInfo.code || '' },
            { label: 'Contexte', value: [campaignInfo.label, campaignInfo.designation].filter(Boolean).join(' · ') },
            { label: 'Programme', value: campaignInfo.programme || '' },
            { label: 'Zone / temporalité', value: [campaignInfo.zone_scope, campaignInfo.temporalite].filter(Boolean).join(' · ') },
            {
                label: 'Points / essais',
                value: [
                    campaignInfo.nb_points_prevus ? `${campaignInfo.nb_points_prevus} point(s) prévus` : '',
                    campaignInfo.types_essais_prevus || '',
                ].filter(Boolean).join(' · '),
            },
            {
                label: 'Responsable campagne',
                value: [campaignInfo.responsable_technique, campaignInfo.attribue_a].filter(Boolean).join(' · '),
            },
        ].filter((item) => hasHistoricalValue(item.value))
    }, [campaignInfo, interventionSourceLabel])
    const planningChecklistItems = useMemo(() => {
        return [
            {
                label: 'Action terrain choisie',
                detail: form.type_intervention || 'Choisir le type d\'intervention',
                done: Boolean(form.type_intervention),
            },
            {
                label: 'But de la mission',
                detail: form.objectif_intervention || form.finalite_intervention || 'Préciser la finalité ou l\'objectif concret',
                done: Boolean(form.objectif_intervention || form.finalite_intervention),
            },
            {
                label: 'Zone et matériau',
                detail: [form.zone_intervention, form.nature_materiau].filter(Boolean).join(' · ') || 'Localiser la zone et l\'objet concerné',
                done: Boolean(form.zone_intervention || form.nature_materiau),
            },
            {
                label: 'Créneau',
                detail: missionWindow || 'Fixer une date et si possible un créneau',
                done: Boolean(form.date_intervention),
            },
            {
                label: 'Pilote',
                detail: [form.technicien, form.responsable_referent, form.attribue_a].filter(Boolean).join(' · ') || 'Désigner l\'opérateur ou le référent',
                done: Boolean(form.technicien || form.responsable_referent || form.attribue_a),
            },
            {
                label: 'Programme terrain',
                detail: [
                    form.prep_points_a_realiser,
                    form.prep_essais_a_effectuer,
                ].filter(Boolean).join(' · ') || 'Lister points, essais ou prélèvements prévus',
                done: Boolean(form.prep_points_a_realiser || form.prep_essais_a_effectuer),
            },
            {
                label: 'Accès / blocages',
                detail: [
                    form.prep_contraintes_acces,
                    form.prep_plan_prevention,
                    form.prep_point_bloquant === 'Oui' ? form.prep_point_bloquant_desc || 'Point bloquant signalé' : '',
                ].filter(Boolean).join(' · ') || 'Renseigner les contraintes d\'accès et les risques de blocage',
                done: Boolean(form.prep_contraintes_acces || form.prep_plan_prevention || form.prep_point_bloquant),
            },
        ]
    }, [form, missionWindow])
    const planningChecklistDoneCount = useMemo(
        () => planningChecklistItems.filter((item) => item.done).length,
        [planningChecklistItems]
    )

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

        async function loadLinkedObjects() {
            if (isCreate || !uid) {
                setLinkedPrelevements([])
                setLinkedPrelevementsError('')
                setLinkedPrelevementsLoading(false)
                setLinkedEchantillons([])
                setLinkedEchantillonsError('')
                setLinkedEchantillonsLoading(false)
                setLinkedEssais([])
                setLinkedEssaisError('')
                setLinkedEssaisLoading(false)
                setLinkedFeuillesTerrain([])
                setLinkedPointsTerrain([])
                setLinkedCouchesTerrain([])
                return
            }

            try {
                setLinkedPrelevementsLoading(true)
                setLinkedPrelevementsError('')
                setLinkedEchantillonsLoading(true)
                setLinkedEchantillonsError('')
                setLinkedEssaisLoading(true)
                setLinkedEssaisError('')

                if (showHistoricalImportedResult) {
                    await essaisApi.syncInterventionEssais(uid)
                }

                const chain = await api.get(`/interventions/${uid}/linked-chain`)
                if (!active) return

                setLinkedPrelevements(Array.isArray(chain?.prelevements) ? chain.prelevements : [])
                setLinkedEchantillons(Array.isArray(chain?.echantillons) ? chain.echantillons : [])
                setLinkedEssais(Array.isArray(chain?.essais) ? chain.essais : [])
                setLinkedFeuillesTerrain(Array.isArray(chain?.feuilles_terrain) ? chain.feuilles_terrain : [])
                setLinkedPointsTerrain(Array.isArray(chain?.points_terrain) ? chain.points_terrain : [])
                setLinkedCouchesTerrain(Array.isArray(chain?.couches_terrain) ? chain.couches_terrain : [])
            } catch (err) {
                if (!active) return
                const message = err.message || 'Impossible de charger les objets liés.'
                setLinkedPrelevements([])
                setLinkedPrelevementsError(message)
                setLinkedEchantillons([])
                setLinkedEchantillonsError(message)
                setLinkedEssais([])
                setLinkedEssaisError(message)
                setLinkedFeuillesTerrain([])
                setLinkedPointsTerrain([])
                setLinkedCouchesTerrain([])
            } finally {
                if (active) {
                    setLinkedPrelevementsLoading(false)
                    setLinkedEchantillonsLoading(false)
                    setLinkedEssaisLoading(false)
                }
            }
        }

        loadLinkedObjects()
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

    const interventionSummaryItems = useMemo(() => {
        return [
            { label: 'Type d’intervention', value: form.type_intervention },
            { label: 'Finalité', value: form.finalite_intervention },
            { label: 'Date / créneau', value: missionWindow },
            { label: 'Technicien / opérateur', value: form.technicien },
            { label: 'Zone / localisation', value: form.zone_intervention },
            { label: 'Matériau / objet concerné', value: form.nature_materiau },
            { label: 'Statut', value: form.statut },
            { label: 'Responsable / référent', value: form.responsable_referent },
            { label: 'Attribué à', value: form.attribue_a },
            { label: 'Objectif / remarque', value: form.objectif_intervention },
            { label: 'Notes terrain', value: form.notes_terrain },
        ].filter((item) => hasHistoricalValue(item.value))
    }, [form, missionWindow])
    const allowedDirectEssaiTemplates = useMemo(
        () => getDirectEssaiTemplatesForIntervention({
            type_intervention: form.type_intervention,
            historicalCode,
            historicalLabel: historicalObservations?.essai_label || interventionInfo?.essai_label || interventionInfo?.type_intervention || '',
        }),
        [form.type_intervention, historicalCode, historicalObservations, interventionInfo]
    )
    const directEssaiSelectOptions = useMemo(
        () => allowedDirectEssaiTemplates.map((template) => ({
            value: template.code,
            essai_code: template.code,
            type_essai: template.typeEssai,
            norme: template.norme || '',
            source_label: '',
            label: template.label,
        })),
        [allowedDirectEssaiTemplates]
    )

    const directEssaiOptionMap = useMemo(
        () => Object.fromEntries(directEssaiSelectOptions.map((item) => [item.value, item])),
        [directEssaiSelectOptions]
    )

    const selectedDirectEssaiOption = useMemo(
        () => directEssaiOptionMap[quickEssaiForm.option_value] || directEssaiSelectOptions[0] || null,
        [directEssaiOptionMap, directEssaiSelectOptions, quickEssaiForm.option_value]
    )
    const canCreateDirectEssai = !isCreate && Boolean(uid)
    const contextDemandeLabel = demandeInfo?.reference || (demandeId ? `#${demandeId}` : '')
    const contextCampaignLabel = campaignInfo.reference || campaignInfo.code || campaignInfo.label || campaignInfo.designation || ''
    const hasContextBanner = Boolean(contextDemandeLabel || contextCampaignLabel)
    const hasDirectObjectsCard = Boolean(!isCreate && (!isSondageComposite || linkedEchantillons.length || linkedPrelevements.length || canCreateDirectEchantillons))
    const parentDemandeId = Number.parseInt(String(demandeId || interventionInfo?.demande_id || ''), 10)
    const hasParentDemande = Number.isInteger(parentDemandeId) && parentDemandeId > 0
    const parentAffaireId = Number.parseInt(String(demandeInfo?.affaire_rst_id || interventionInfo?.affaire_rst_id || ''), 10)
    const hasParentAffaire = Number.isInteger(parentAffaireId) && parentAffaireId > 0
    const parentCampaignId = Number.parseInt(String(campaignInfo?.uid || interventionInfo?.campaign_id || ''), 10)
    const hasParentCampaign = Number.isInteger(parentCampaignId) && parentCampaignId > 0
    const parentDemandePath = hasParentDemande
        ? (() => {
            const params = new URLSearchParams()
            if (hasParentCampaign) params.set('campaign_uid', String(parentCampaignId))
            return params.toString() ? `/demandes/${parentDemandeId}?${params.toString()}` : `/demandes/${parentDemandeId}`
        })()
        : ''

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
        const selected = directEssaiOptionMap[value]
        const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[selected?.essai_code || value] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN
        setQuickEssaiForm((prev) => ({
            option_value: value,
            essai_code: template.code,
            norme: selected?.norme || template.norme || '',
            source_label: selected?.source_label || '',
            target_status: prev?.target_status || 'realise',
        }))
        setSuccess('')
    }

    useEffect(() => {
        if (!directEssaiSelectOptions.length) return

        const fallback = selectedDirectEssaiOption || directEssaiSelectOptions[0]
        if (!fallback) return

        const isCurrentValid = directEssaiSelectOptions.some((item) => item.value === quickEssaiForm.option_value)
        if (isCurrentValid && quickEssaiForm.essai_code === fallback.essai_code) return

        setQuickEssaiForm((prev) => ({
            ...prev,
            option_value: fallback.value,
            essai_code: fallback.essai_code,
            norme: fallback.norme || '',
            source_label: fallback.source_label || '',
        }))
    }, [directEssaiSelectOptions, selectedDirectEssaiOption, quickEssaiForm.option_value, quickEssaiForm.essai_code])

    async function persistInlineForm(nextForm, successMessage = 'Intervention mise à jour.') {
        if (isCreate || !uid) {
            setForm(nextForm)
            return
        }

        try {
            setSaving(true)
            setError('')
            setSuccess('')
            const saved = await api.put(`/interventions/${uid}`, buildSavePayload(nextForm))
            const mergedSaved = mergeFormFromIntervention(saved)
            setInterventionInfo(saved)
            setForm(mergedSaved)
            setOriginalObservations(parseObservations(saved?.observations || ''))
            setSuccess(successMessage)
        } catch (err) {
            setError(err.message || "Impossible d'enregistrer l'intervention.")
        } finally {
            setSaving(false)
        }
    }

    async function addRealizedEssai() {
        const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[quickEssaiForm.essai_code] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN
        const nextItem = normalizeEssaiFollowupItem({
            code: template.code,
            label: template.label,
            norme: quickEssaiForm.norme || template.norme || '',
        })

        if (!nextItem) return

        const currentItems = normalizeEssaiFollowupList(form.suite_essais_realises)
        const nextKey = buildEssaiFollowupKey(nextItem)
        const alreadyExists = currentItems.some((item) => buildEssaiFollowupKey(item) === nextKey)
        if (alreadyExists) return

        const nextForm = {
            ...form,
            suite_essais_realises: [...currentItems, nextItem],
        }

        if (!editing && !isCreate) {
            await persistInlineForm(nextForm, 'Essai réalisé ajouté.')
            return
        }

        setForm(nextForm)
        setSuccess('')
    }

    async function removeRealizedEssai(indexToRemove) {
        const currentItems = normalizeEssaiFollowupList(form.suite_essais_realises)
        const nextForm = {
            ...form,
            suite_essais_realises: currentItems.filter((_, index) => index !== indexToRemove),
        }

        if (!editing && !isCreate) {
            await persistInlineForm(nextForm, 'Essai réalisé retiré.')
            return
        }

        setForm(nextForm)
        setSuccess('')
    }

    function handleSelectInterventionType(value) {
        const suggestedFinality = INTERVENTION_TYPE_SUGGESTED_FINALITY[value] || ''
        setForm((prev) => ({
            ...prev,
            type_intervention: value,
            finalite_intervention: prev.finalite_intervention || suggestedFinality,
        }))
        setSuccess('')
        setTypePickerOpen(false)
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
        const selected = selectedDirectEssaiOption || {
            essai_code: options.essaiCode || quickEssaiForm.essai_code,
            type_essai: undefined,
            norme: quickEssaiForm.norme,
            source_label: quickEssaiForm.source_label || '',
        }
        const essaiCode = selected.essai_code || options.essaiCode || quickEssaiForm.essai_code
        const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[essaiCode] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN
        const params = new URLSearchParams({
            intervention_id: String(interventionUid),
            essai_code: template.code,
            type_essai: selected.type_essai || template.typeEssai,
        })

        const norme = options.norme ?? selected.norme ?? quickEssaiForm.norme
        if (norme) params.set('norme', norme)

        const sourceLabel = options.sourceLabel ?? selected.source_label ?? quickEssaiForm.source_label
        if (sourceLabel) params.set('source_label', sourceLabel)

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

    async function openDirectEssaiDraft(options = {}) {
        if (isCreate || !uid) return

        const selected = selectedDirectEssaiOption || {
            essai_code: options.essaiCode || quickEssaiForm.essai_code,
            type_essai: options.typeEssai,
            norme: quickEssaiForm.norme,
            source_label: quickEssaiForm.source_label || '',
        }
        const essaiCode = String(selected.essai_code || options.essaiCode || quickEssaiForm.essai_code || '').trim().toUpperCase()
        const template = DIRECT_ESSAI_TEMPLATE_BY_CODE[essaiCode] || DIRECT_ESSAI_TEMPLATE_BY_CODE.GEN
        const mismatchWarning = getInterventionEssaiMismatchWarning(
            form.type_intervention || interventionInfo?.type_intervention || interventionInfo?.sujet,
            essaiCode
        )
        if (mismatchWarning && !window.confirm(`${mismatchWarning}\n\nCréer quand même cet essai sur cette intervention ?`)) {
            return
        }

        if (isFeuilleTerrainEssaiCode(essaiCode)) {
            try {
                setCreatingDirectFeuille(true)
                setError('')
                setSuccess('')
                const { openPath } = await createTerrainFeuilleForIntervention({
                    interventionId: Number(uid),
                    code: essaiCode,
                    label: selected.type_essai || template.typeEssai || template.label,
                    dateFeuille: extractIsoDate(form.date_intervention || interventionInfo?.date_intervention),
                    operateur: form.technicien || interventionInfo?.technicien || '',
                })
                navigateWithReturnTo(navigate, openPath, childReturnTo)
            } catch (err) {
                setError(err.message || 'Impossible de créer la feuille terrain.')
            } finally {
                setCreatingDirectFeuille(false)
            }
            return
        }

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

    async function handleOpenDirectEssaiDraft() {
        await openDirectEssaiDraft()
    }

    function openLinkedFeuilleTerrain(item) {
        if (!item?.uid) return
        const code = String(item?.code_feuille || '').trim().toUpperCase()
        navigateWithReturnTo(navigate, buildTerrainFeuilleOpenPath(item.uid, code), childReturnTo)
    }

    async function refreshLinkedChain() {
        if (isCreate || !uid) return
        const chain = await api.get(`/interventions/${uid}/linked-chain`)
        setLinkedPrelevements(Array.isArray(chain?.prelevements) ? chain.prelevements : [])
        setLinkedEchantillons(Array.isArray(chain?.echantillons) ? chain.echantillons : [])
        setLinkedEssais(Array.isArray(chain?.essais) ? chain.essais : [])
        setLinkedFeuillesTerrain(Array.isArray(chain?.feuilles_terrain) ? chain.feuilles_terrain : [])
        setLinkedPointsTerrain(Array.isArray(chain?.points_terrain) ? chain.points_terrain : [])
        setLinkedCouchesTerrain(Array.isArray(chain?.couches_terrain) ? chain.couches_terrain : [])
    }

    async function handleRemoveLinkedFeuille(item) {
        if (!item?.uid || isCreate || !uid) return
        const label = item.reference || DIRECT_ESSAI_TEMPLATE_BY_CODE[String(item.code_feuille || '').toUpperCase()]?.label || 'cette feuille'
        if (!window.confirm(`Retirer ${label} de cette intervention ?\n\nLa feuille terrain sera supprimée.`)) return

        try {
            setRemovingFeuilleUid(item.uid)
            setError('')
            setSuccess('')
            await feuillesTerrainApi.delete(item.uid)
            await refreshLinkedChain()
            setSuccess(`${label} retirée de l’intervention.`)
        } catch (err) {
            setError(err.message || 'Impossible de retirer cette feuille terrain.')
        } finally {
            setRemovingFeuilleUid(null)
        }
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
                if (campaignInfo.source) createdParams.set('source', campaignInfo.source)
                if (campaignInfo.programme) createdParams.set('campaign_programme', campaignInfo.programme)
                if (campaignInfo.zone_scope) createdParams.set('campaign_zone', campaignInfo.zone_scope)
                if (campaignInfo.temporalite) createdParams.set('campaign_temporalite', campaignInfo.temporalite)
                if (campaignInfo.nb_points_prevus) createdParams.set('campaign_nb_points', campaignInfo.nb_points_prevus)
                if (campaignInfo.types_essais_prevus) createdParams.set('campaign_essais', campaignInfo.types_essais_prevus)
                if (campaignInfo.responsable_technique) createdParams.set('campaign_responsable', campaignInfo.responsable_technique)
                if (campaignInfo.attribue_a) createdParams.set('campaign_attribue_a', campaignInfo.attribue_a)
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

    const heroSubtitle = [
        demandeInfo?.chantier,
        demandeInfo?.client ? `Client : ${demandeInfo.client}` : '',
    ].filter(Boolean).join(' · ')

    if (loading) {
        return (
            <div
                className="flex flex-col h-full -m-6 overflow-y-auto"
                style={{ background: PAGE_BG }}
            >
                <div className="text-xs text-text-muted text-center py-16">Chargement intervention…</div>
            </div>
        )
    }

    return (
        <div
            className="flex flex-col h-full -m-6 overflow-y-auto"
            style={{ background: PAGE_BG }}
        >
            <div
                className="sticky top-0 z-10 border-b border-[#dbe1ea]"
                style={{ background: 'rgba(255,255,255,0.96)', boxShadow: '0 6px 24px rgba(0,49,112,0.08)', backdropFilter: 'blur(12px)' }}
            >
                <div style={{ height: '4px', background: 'linear-gradient(90deg, #003170 0%, #003170 70%, #ffcc00 70%, #ffcc00 100%)' }} />
                <div className="w-full max-w-full mx-auto px-7 flex flex-wrap items-center gap-2.5 py-3">
                    <button
                        type="button"
                        onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}
                        className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb] hover:text-[#172033] transition-colors shrink-0"
                    >
                        ← Retour
                    </button>
                    <div className="flex-1 min-w-[220px]">
                        <div className="text-[#8a95a8] text-[11px] font-bold tracking-[.14em] uppercase">Fiche intervention</div>
                        <div className="text-[15px] font-black font-mono">{title}</div>
                    </div>
                    {hasParentDemande ? (
                        <Button size="sm" onClick={() => navigateWithReturnTo(navigate, parentDemandePath, childReturnTo)}>
                            Demande
                        </Button>
                    ) : null}
                    {hasParentAffaire ? (
                        <Button size="sm" onClick={() => navigateWithReturnTo(navigate, `/affaires/${parentAffaireId}`, childReturnTo)}>
                            Affaire
                        </Button>
                    ) : null}
                    {hasParentCampaign && hasParentDemande ? (
                        <Button
                            size="sm"
                            onClick={() => navigateWithReturnTo(navigate, `/campagnes/${parentCampaignId}`, childReturnTo)}
                        >
                            Campagne
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
                            <Button size="sm" variant="primary" onClick={() => setEditing(true)}>
                                Modifier
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
                    ) : null}
                </div>
            </div>

            <div className="w-full max-w-full mx-auto px-7 py-7 flex flex-col gap-5">
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
                                <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
                                RaLab 5 · Intervention terrain
                            </div>
                            <h1 className="text-[32px] font-black leading-none tracking-tight m-0 font-mono">{title}</h1>
                            <div className="mt-3 text-[20px] font-black">{form.type_intervention || 'Type à qualifier'}</div>
                            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
                                {contextDemandeLabel ? (
                                    <span>Demande : <strong className="text-white">{contextDemandeLabel}</strong></span>
                                ) : null}
                                {contextCampaignLabel ? (
                                    <span>Campagne : <strong className="text-white">{contextCampaignLabel}</strong></span>
                                ) : null}
                                {form.technicien ? (
                                    <span>Technicien : <strong className="text-white">{form.technicien}</strong></span>
                                ) : null}
                                {heroSubtitle ? (
                                    <span>{heroSubtitle}</span>
                                ) : null}
                            </div>
                        </div>

                        <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                                {form.statut ? (
                                    <FicheBadge s={form.statut} map={DEMANDE_STAT_CLS} />
                                ) : null}
                                {historicalCode ? (
                                    <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                        Import {historicalCode}
                                    </span>
                                ) : null}
                                {form.finalite_intervention ? (
                                    <span className="inline-flex items-center rounded-full border border-white/20 bg-white text-[#003170] px-2.5 py-1.5 text-[11px] font-black leading-none">
                                        {form.finalite_intervention}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Créneau</div>
                            <div className="mt-1.5 text-[13px] font-black">{missionWindow || 'À planifier'}</div>
                            {form.date_intervention ? (
                                <div className="mt-2 text-[12px] font-black text-white/70">
                                    {formatDate(form.date_intervention)}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
                        <MetricCard
                            label="Cadrage"
                            value={`${planningChecklistDoneCount}/${planningChecklistItems.length}`}
                            detail="Repères minimums"
                        />
                        <MetricCard
                            label="Essais liés"
                            value={linkedEssais.length}
                            detail="Fiches rattachées"
                        />
                        <MetricCard
                            label="Échantillons"
                            value={linkedEchantillons.length}
                            detail="Groupes directs"
                        />
                        <MetricCard
                            label="Prélèvements"
                            value={linkedPrelevements.length}
                            detail="Objets terrain"
                        />
                    </div>
                </section>

                <div className="flex flex-col gap-5">
                {error ? (
                    <div className="px-4 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded-[18px] text-xs text-danger">
                        {error}
                    </div>
                ) : null}

                {success ? (
                    <div className="px-4 py-2 rounded-[18px] border border-[#b8e3c7] bg-[#eaf8ef] text-[#1b6f43] text-xs font-medium">
                        {success}
                    </div>
                ) : null}

                {false && hasContextBanner ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#cfe4f6] bg-[#eef6fd] px-4 py-3 text-sm text-[#185fa5]">
                        <div>
                            Cette intervention est rattachée
                            {contextDemandeLabel ? ` à la demande ${contextDemandeLabel}` : ''}
                            {contextDemandeLabel && contextCampaignLabel ? ' et ' : ''}
                            {contextCampaignLabel ? `à la campagne ${contextCampaignLabel}` : ''}.
                        </div>
                        {demandeId ? (
                            <Button size="sm" variant="secondary" onClick={() => navigate(`/demandes/${demandeId}`)}>
                                Ouvrir la demande
                            </Button>
                        ) : null}
                    </div>
                ) : null}

                {false && !editing && (showHistoricalImportedResult || historicalFiches.length > 0 || historicalSummaryItems.length > 0) ? (
                    <Card title="Source importée">
                        <div className="flex flex-col gap-3">
                            {historicalFiches.length > 0 ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                    {historicalFiches.map((item) => (
                                        <div key={item.key} className="rounded-lg border border-border bg-bg px-3 py-3">
                                            <div className="text-[13px] font-semibold text-text">{item.label}</div>
                                            <div className="mt-1 text-[12px] text-text-muted">
                                                {[item.ref, item.date, item.fileName].filter(Boolean).join(' · ') || 'Fiche importée'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {importedResultMeta.length > 0 || historicalSummaryItems.length > 0 ? (
                                <div className="grid grid-cols-2 gap-x-8">
                                    <div>
                                        {importedResultMeta.map((item, index) => (
                                            <FR key={`meta-${item.label}-${index}`} label={item.label} value={item.value} />
                                        ))}
                                    </div>
                                    <div>
                                        {historicalSummaryItems.map((item, index) => (
                                            <FR key={`summary-${item.label}-${index}`} label={item.label} value={item.value} />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </Card>
                ) : null}

                <SectionCard
                    title={editing || isCreate ? 'Intervention' : 'Intervention / mission terrain'}
                    subtitle="Type, finalité, planning et personnes affectées"
                    chip={form.statut ? <FicheBadge s={form.statut} map={DEMANDE_STAT_CLS} /> : null}
                >
                    {editing || isCreate ? (
                        <div className="grid grid-cols-2 gap-3">
                            <FG label="Type d'intervention" full>
                                <div className="flex flex-wrap gap-2">
                                    <Select
                                        value={form.type_intervention}
                                        onChange={(e) => setField('type_intervention', e.target.value)}
                                        className="min-w-[220px] flex-1"
                                    >
                                        <option value="">—</option>
                                        {typeOptions.map((item) => (
                                            <option key={item} value={item}>{item}</option>
                                        ))}
                                    </Select>
                                    <Button variant="secondary" onClick={() => setTypePickerOpen(true)}>
                                        Choix guidé
                                    </Button>
                                </div>
                            </FG>

                            <FG label="Finalité">
                                <Select value={form.finalite_intervention} onChange={(e) => setField('finalite_intervention', e.target.value)}>
                                    <option value="">—</option>
                                    {FINALITY_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </FG>

                            <FG label="Statut">
                                <Select value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
                                    {STATUTS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </FG>

                            <FG label="Date / créneau" full>
                                <div className="grid gap-2 md:grid-cols-3">
                                    <Input type="date" value={form.date_intervention} onChange={(e) => setField('date_intervention', e.target.value)} />
                                    <Input type="time" value={form.heure_debut} onChange={(e) => setField('heure_debut', e.target.value)} />
                                    <Input type="time" value={form.heure_fin} onChange={(e) => setField('heure_fin', e.target.value)} />
                                </div>
                            </FG>

                            <FG label="Technicien / opérateur">
                                <Input value={form.technicien} onChange={(e) => setField('technicien', e.target.value)} />
                            </FG>

                            <FG label="Responsable / référent">
                                <Input value={form.responsable_referent} onChange={(e) => setField('responsable_referent', e.target.value)} />
                            </FG>

                            <FG label="Attribué à">
                                <Input value={form.attribue_a} onChange={(e) => setField('attribue_a', e.target.value)} />
                            </FG>

                            <FG label="Zone / localisation">
                                <Input value={form.zone_intervention} onChange={(e) => setField('zone_intervention', e.target.value)} />
                            </FG>

                            <FG label="Matériau / objet concerné">
                                <Select value={form.nature_materiau} onChange={(e) => setField('nature_materiau', e.target.value)}>
                                    <option value="">—</option>
                                    {MATERIAL_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </FG>

                            <FG label="Objectif terrain" full>
                                <Textarea
                                    value={form.objectif_intervention}
                                    onChange={(value) => setField('objectif_intervention', value)}
                                    rows={3}
                                    placeholder="Décrire simplement ce qui sera fait ou constaté."
                                />
                            </FG>

                            <FG label="Notes terrain" full>
                                <Textarea
                                    value={form.notes_terrain}
                                    onChange={(value) => setField('notes_terrain', value)}
                                    rows={4}
                                    placeholder="Consignes, remarques, suites à suivre…"
                                />
                            </FG>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <FieldCard label="Référence" value={interventionInfo?.reference} highlight />
                            <FieldCard label="Demande" value={contextDemandeLabel} />
                            <FieldCard label="Campagne" value={contextCampaignLabel} />
                            <FieldCard label="Type d'intervention" value={form.type_intervention} />
                            <FieldCard label="Finalité" value={form.finalite_intervention} />
                            <FieldCard label="Date / créneau" value={missionWindow} />
                            <FieldCard label="Technicien / opérateur" value={form.technicien} />
                            <FieldCard label="Zone / localisation" value={form.zone_intervention} />
                            <FieldCard label="Matériau / objet" value={form.nature_materiau} />
                            <FieldCard label="Statut" value={form.statut} />
                            <FieldCard label="Responsable / référent" value={form.responsable_referent} />
                            <FieldCard label="Attribué à" value={form.attribue_a} />
                            <FieldCard label="Objectif terrain" value={form.objectif_intervention} className="sm:col-span-2" />
                            <FieldCard label="Notes terrain" value={form.notes_terrain} className="sm:col-span-3" />
                        </div>
                    )}
                </SectionCard>

                {false ? (
                <Card title="Préparation / réalisation">
                    {editing ? (
                        <div className="grid grid-cols-2 gap-3">
                            <FG label="Points à réaliser" full>
                                <Textarea value={form.prep_points_a_realiser} onChange={(value) => setField('prep_points_a_realiser', value)} rows={2} placeholder="Localisation, nature, quantité…" />
                            </FG>

                            <FG label="Essais à effectuer" full>
                                <Textarea value={form.prep_essais_a_effectuer} onChange={(value) => setField('prep_essais_a_effectuer', value)} rows={2} placeholder="PL, CBR, prélèvements…" />
                            </FG>

                            <FG label="Matériels requis" full>
                                <Textarea value={form.prep_materiels_requis} onChange={(value) => setField('prep_materiels_requis', value)} rows={2} placeholder="Appareils, EPI, contenants…" />
                            </FG>

                            <FG label="Contact chantier / accès">
                                <Input value={form.prep_contact_chantier} onChange={(e) => setField('prep_contact_chantier', e.target.value)} placeholder="Nom, téléphone, horaires…" />
                            </FG>

                            <FG label="Plan de prévention requis">
                                <Select value={form.prep_plan_prevention} onChange={(e) => setField('prep_plan_prevention', e.target.value)}>
                                    <option value="">—</option>
                                    <option>Non requis</option>
                                    <option>Requis — en cours</option>
                                    <option>Requis — validé</option>
                                </Select>
                            </FG>

                            <FG label="Contraintes accès / coactivité" full>
                                <Textarea value={form.prep_contraintes_acces} onChange={(value) => setField('prep_contraintes_acces', value)} rows={2} placeholder="Balisage, circulation, coactivité…" />
                            </FG>

                            <FG label="Préparation complète">
                                <Select value={form.prep_preparation_complete} onChange={(e) => setField('prep_preparation_complete', e.target.value)}>
                                    <option value="">—</option>
                                    <option>Oui</option>
                                    <option>Non</option>
                                </Select>
                            </FG>

                            <FG label="Point bloquant">
                                <Select value={form.prep_point_bloquant} onChange={(e) => setField('prep_point_bloquant', e.target.value)}>
                                    <option value="">—</option>
                                    <option>Non</option>
                                    <option>Oui</option>
                                </Select>
                            </FG>

                            {form.prep_point_bloquant === 'Oui' ? (
                                <FG label="Description point bloquant" full>
                                    <Textarea value={form.prep_point_bloquant_desc} onChange={(value) => setField('prep_point_bloquant_desc', value)} rows={2} />
                                </FG>
                            ) : null}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-x-8">
                            <div>
                                <FR label="Points à réaliser" value={form.prep_points_a_realiser} />
                                <FR label="Essais à effectuer" value={form.prep_essais_a_effectuer} />
                                <FR label="Matériels requis" value={form.prep_materiels_requis} />
                                <FR label="Contact chantier / accès" value={form.prep_contact_chantier} />
                            </div>
                            <div>
                                <FR label="Plan de prévention" value={form.prep_plan_prevention} />
                                <FR label="Contraintes accès / coactivité" value={form.prep_contraintes_acces} />
                                <FR label="Préparation complète" value={form.prep_preparation_complete} />
                                <FR label="Point bloquant" value={form.prep_point_bloquant ? `${form.prep_point_bloquant}${form.prep_point_bloquant_desc ? ` — ${form.prep_point_bloquant_desc}` : ''}` : ''} />
                            </div>
                        </div>
                    )}

                    <div className="border-t border-border mt-4 pt-4">
                        <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">Réalisation / bilan</div>
                    {editing ? (
                        <div className="grid grid-cols-2 gap-3">
                            <FG label="Météo">
                                <Input value={form.cond_meteo} onChange={(e) => setField('cond_meteo', e.target.value)} placeholder="Beau, pluie, température…" />
                            </FG>

                            <FG label="État du site">
                                <Input value={form.cond_etat_site} onChange={(e) => setField('cond_etat_site', e.target.value)} placeholder="Humide, saturé, accessible…" />
                            </FG>

                            <FG label="Nb points prévus">
                                <Input type="number" value={form.real_nb_points_prevus} onChange={(e) => setField('real_nb_points_prevus', e.target.value)} />
                            </FG>

                            <FG label="Nb points réalisés">
                                <Input type="number" value={form.real_nb_points_realises} onChange={(e) => setField('real_nb_points_realises', e.target.value)} />
                            </FG>

                            <FG label="Écarts prévu / réel" full>
                                <Textarea value={form.cond_ecarts} onChange={(value) => setField('cond_ecarts', value)} rows={2} placeholder="Points non réalisés, changements de programme…" />
                            </FG>

                            <FG label="Motif points non réalisés" full>
                                <Textarea value={form.real_points_non_realises_motif} onChange={(value) => setField('real_points_non_realises_motif', value)} rows={2} />
                            </FG>

                            <FG label="Incidents / anomalies" full>
                                <Textarea value={form.real_incidents} onChange={(value) => setField('real_incidents', value)} rows={2} />
                            </FG>

                            <FG label="Non-conformités" full>
                                <Textarea value={form.real_non_conformites} onChange={(value) => setField('real_non_conformites', value)} rows={2} />
                            </FG>

                            <FG label="Adaptations sur site" full>
                                <Textarea value={form.real_adaptations} onChange={(value) => setField('real_adaptations', value)} rows={2} />
                            </FG>

                            <FG label="Nb échantillons ramenés">
                                <Input type="number" value={form.sortie_nb_echantillons} onChange={(e) => setField('sortie_nb_echantillons', e.target.value)} />
                            </FG>

                            <FG label="Destination labo">
                                <Input value={form.sortie_destination_labo} onChange={(e) => setField('sortie_destination_labo', e.target.value)} placeholder="SP, AUV, CHB…" />
                            </FG>

                            <FG label="Alerte émise">
                                <Select value={form.sortie_alerte} onChange={(e) => setField('sortie_alerte', e.target.value)}>
                                    <option value="">—</option>
                                    <option>Non</option>
                                    <option>Oui</option>
                                </Select>
                            </FG>

                            <FG label="Information demandeur">
                                <Select value={form.sortie_info_demandeur} onChange={(e) => setField('sortie_info_demandeur', e.target.value)}>
                                    <option value="">—</option>
                                    <option>Non</option>
                                    <option>Oui</option>
                                </Select>
                            </FG>

                            {form.sortie_alerte === 'Oui' ? (
                                <FG label="Description alerte" full>
                                    <Textarea value={form.sortie_alerte_desc} onChange={(value) => setField('sortie_alerte_desc', value)} rows={2} />
                                </FG>
                            ) : null}

                            <FG label="Synthèse de l'intervention" full>
                                <Textarea value={form.sortie_synthese} onChange={(value) => setField('sortie_synthese', value)} rows={3} placeholder="Bilan rapide, constats, suites à donner…" />
                            </FG>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-x-8">
                            <div>
                                <FR label="Météo" value={form.cond_meteo} />
                                <FR label="État du site" value={form.cond_etat_site} />
                                <FR label="Pts prévus / réalisés" value={form.real_nb_points_prevus || form.real_nb_points_realises ? `${form.real_nb_points_prevus || '?'} / ${form.real_nb_points_realises || '?'}` : ''} />
                                <FR label="Écarts prévu / réel" value={form.cond_ecarts} />
                                <FR label="Motif points non réalisés" value={form.real_points_non_realises_motif} />
                                <FR label="Incidents / anomalies" value={form.real_incidents} />
                                <FR label="Non-conformités" value={form.real_non_conformites} />
                            </div>
                            <div>
                                <FR label="Adaptations sur site" value={form.real_adaptations} />
                                <FR label="Échantillons ramenés" value={form.sortie_nb_echantillons} />
                                <FR label="Destination labo" value={form.sortie_destination_labo} />
                                <FR label="Alerte" value={form.sortie_alerte ? `${form.sortie_alerte}${form.sortie_alerte_desc ? ` — ${form.sortie_alerte_desc}` : ''}` : ''} />
                                <FR label="Information demandeur" value={form.sortie_info_demandeur} />
                                <FR label="Synthèse de l'intervention" value={form.sortie_synthese} />
                            </div>
                        </div>
                    )}
                    </div>
                </Card>
                ) : null}

                {!isCreate ? (
                    <Card title={`Essais (${linkedEssais.length})`}>
                        <div className="mb-4 pb-4 border-b border-border flex flex-wrap gap-2">
                            <span className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1 text-[11px] text-text-muted">
                                {linkedFeuillesTerrain.length} coupe(s)
                            </span>
                            <span className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1 text-[11px] text-text-muted">
                                {linkedPointsTerrain.length} point(s)
                            </span>
                            <span className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1 text-[11px] text-text-muted">
                                {linkedCouchesTerrain.length} couche(s)
                            </span>
                            <span className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1 text-[11px] text-text-muted">
                                {linkedPrelevements.length} prélèvement(s)
                            </span>
                            <span className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1 text-[11px] text-text-muted">
                                {linkedEchantillons.length} échantillon(s)
                            </span>
                            <span className="inline-flex items-center rounded-full border border-border bg-bg px-3 py-1 text-[11px] text-text-muted">
                                {linkedEssais.length} essai(s)
                            </span>
                        </div>

                        {linkedFeuillesTerrain.length > 0 ? (
                            <div className="mb-4 pb-4 border-b border-border flex flex-col gap-2">
                                <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Sondages / feuilles terrain liées</div>
                                <div className="flex flex-col gap-2">
                                    {linkedFeuillesTerrain.map((item) => (
                                        <div
                                            key={item.uid}
                                            className="rounded-lg border border-border bg-bg px-3 py-3 flex items-start justify-between gap-3"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => openLinkedFeuilleTerrain(item)}
                                                className="min-w-0 flex-1 text-left transition hover:opacity-80"
                                            >
                                                <div className="text-[13px] font-semibold text-text">
                                                    {DIRECT_ESSAI_TEMPLATE_BY_CODE[String(item.code_feuille || '').toUpperCase()]?.label
                                                        || item.label
                                                        || item.code_feuille
                                                        || 'Feuille terrain'}
                                                </div>
                                                <div className="mt-1 text-[12px] text-text-muted">
                                                    {[item.reference, item.code_feuille, item.date_feuille].filter(Boolean).join(' · ') || 'Feuille terrain liée'}
                                                </div>
                                                <div className="mt-1 text-[11px] text-text-muted">
                                                    {item.points_count ?? 0} point(s)
                                                </div>
                                            </button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleRemoveLinkedFeuille(item)}
                                                disabled={removingFeuilleUid === item.uid}
                                            >
                                                {removingFeuilleUid === item.uid ? '…' : 'Retirer'}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        {(linkedPrelevements.length > 0 || linkedEchantillons.length > 0) ? (
                            <div className="mb-4 pb-4 border-b border-border grid gap-3 md:grid-cols-2">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">Prélèvements liés</div>
                                    <LinkedPrelevementsContent
                                        items={linkedPrelevements.slice(0, 3)}
                                        loading={linkedPrelevementsLoading}
                                        error={linkedPrelevementsError}
                                        onOpen={(prelevementUid) => navigateWithReturnTo(navigate, `/prelevements/${prelevementUid}`, childReturnTo)}
                                        emptyMessage="Aucun prélèvement lié"
                                    />
                                </div>
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">Échantillons liés</div>
                                    <LinkedEchantillonsContent
                                        items={linkedEchantillons.slice(0, 3)}
                                        loading={linkedEchantillonsLoading}
                                        error={linkedEchantillonsError}
                                        onOpen={(echantillonUid) => navigateWithReturnTo(navigate, `/echantillons/${echantillonUid}`, childReturnTo)}
                                        emptyMessage="Aucun échantillon lié"
                                    />
                                </div>
                            </div>
                        ) : null}

                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border flex-wrap">
                            <Select
                                value={canCreateDirectEssai ? (quickEssaiForm.option_value || selectedDirectEssaiOption?.value || '') : ''}
                                onChange={(e) => setQuickEssaiCode(e.target.value)}
                                className="text-sm"
                                disabled={!canCreateDirectEssai}
                            >
                                {canCreateDirectEssai ? (
                                    directEssaiSelectOptions.map((item) => (
                                        <option key={item.value} value={item.value}>{item.label}</option>
                                    ))
                                ) : (
                                    <option value="">Sélectionner un essai</option>
                                )}
                            </Select>
                            <Button variant="primary" size="sm" onClick={handleOpenDirectEssaiDraft} disabled={saving || creatingDirectFeuille || !canCreateDirectEssai}>
                                {creatingDirectFeuille ? 'Création…' : '+ Créer cet essai'}
                            </Button>
                        </div>

                        <LinkedEssaisContent
                            items={linkedEssais}
                            loading={linkedEssaisLoading}
                            error={linkedEssaisError}
                            onOpen={(essaiUid) => navigateWithReturnTo(navigate, `/essais/${essaiUid}`, childReturnTo)}
                            emptyMessage={showHistoricalImportedResult
                                ? 'Aucune fiche d’essai n’a encore été matérialisée pour cette intervention importée.'
                                : 'Aucun essai'}
                        />
                    </Card>
                ) : null}

                {false ? (
                    <Card title="Objets liés">
                        <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border flex-wrap">
                            {!isSondageComposite ? (
                                <Button variant="secondary" onClick={handleCreatePrelevement} disabled={creatingPrelevement || saving}>
                                    {creatingPrelevement ? 'Création…' : 'Créer un prélèvement'}
                                </Button>
                            ) : null}
                            <Button variant="primary" onClick={handleOpenDirectEssaiDraft}>
                                Créer un essai direct
                            </Button>
                            {linkedPrelevements[0] ? (
                                <Button variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/prelevements/${linkedPrelevements[0].uid}`, childReturnTo)}>
                                    Ouvrir le prélèvement
                                </Button>
                            ) : null}
                        </div>

                        {canCreateDirectEchantillons ? (
                            <details className="rounded-lg border border-border bg-bg px-3 py-3 mb-4">
                                <summary className="cursor-pointer text-[12px] font-semibold text-text">
                                    Créer des groupes d'essais directs
                                </summary>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <FG label="Groupes à créer" full>
                                        <Textarea
                                            value={quickEchantillonForm.designation_lines}
                                            onChange={(value) => setQuickEchantillonField('designation_lines', value)}
                                            rows={4}
                                            placeholder={"Ex: Contrôle plateforme zone A\nEssai compactage piste nord"}
                                        />
                                    </FG>

                                    <FG label="Localisation initiale">
                                        <Input
                                            value={quickEchantillonForm.localisation}
                                            onChange={(e) => setQuickEchantillonField('localisation', e.target.value)}
                                            placeholder="Zone ou localisation du groupe"
                                        />
                                    </FG>

                                    <FG label="Statut initial">
                                        <Select value={quickEchantillonForm.statut} onChange={(e) => setQuickEchantillonField('statut', e.target.value)}>
                                            {['Reçu', 'En attente', 'En cours', 'Terminé', 'Rejeté'].map((item) => (
                                                <option key={item} value={item}>{item}</option>
                                            ))}
                                        </Select>
                                    </FG>

                                    <div className="md:col-span-2 rounded-lg border border-border bg-surface px-3 py-3 text-[12px] text-text-muted">
                                        {quickEchantillonLines.length
                                            ? `${quickEchantillonLines.length} groupe(s) prêt(s) à créer depuis ${interventionInfo?.reference || 'cette intervention'}.`
                                            : 'Ajoute au moins une ligne pour créer un groupe d’essais direct.'}
                                    </div>

                                    <div className="md:col-span-2 flex flex-wrap gap-2">
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
                            </details>
                        ) : null}

                        <div className="grid gap-4 lg:grid-cols-2">
                            {!isSondageComposite ? (
                                <div>
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Prélèvements liés</span>
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

                            <div>
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Groupes d'essais directs</span>
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
                        </div>
                    </Card>
                ) : null}

                {false ? (<>
                <Section title="Essais">
                    <div className="flex flex-col gap-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                            <Field label="Essai réalisé">
                                <Select value={quickEssaiForm.essai_code} onChange={(e) => setQuickEssaiCode(e.target.value)}>
                                    {DIRECT_ESSAI_TEMPLATES.map((item) => (
                                        <option key={item.code} value={item.code}>{item.label}</option>
                                    ))}
                                </Select>
                            </Field>

                            <div className="flex">
                                <Button className="w-full justify-center" variant="primary" onClick={() => addRealizedEssai()} disabled={saving}>
                                    Ajouter
                                </Button>
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-bg px-4 py-4 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-bold uppercase tracking-[.05em] text-text-muted">Essais réalisés</div>
                                <Badge>{form.suite_essais_realises.length}</Badge>
                            </div>

                            {form.suite_essais_realises.length ? (
                                <div className="flex flex-col gap-2">
                                    {form.suite_essais_realises.map((item, index) => (
                                        <div key={`realise-${item.code || item.label}-${index}`} className="rounded-lg border border-border bg-surface px-3 py-3 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-[13px] font-semibold text-text">{item.label || item.code || 'Essai'}</div>
                                                <div className="mt-1 text-[12px] text-text-muted">
                                                    {[item.code || '', item.norme || ''].filter(Boolean).join(' · ') || 'Essai réalisé'}
                                                </div>
                                            </div>
                                            <Button size="sm" variant="ghost" onClick={() => removeRealizedEssai(index)} disabled={saving}>
                                                Retirer
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-[13px] leading-6 text-text-muted">
                                    Aucun essai n’est encore marqué comme réalisé sur cette intervention.
                                </div>
                            )}
                        </div>
                    </div>
                </Section>

                {false ? (
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

                <Section title="Cadre de départ" right={<Badge>{`${planningChecklistDoneCount}/${planningChecklistItems.length}`}</Badge>}>
                    <div className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
                        <div className="flex flex-col gap-3">
                            <div className="rounded-lg border border-[#d8e6e1] bg-[#f6fbf9] px-4 py-4">
                                <div className="text-[16px] font-semibold text-text">
                                    {form.type_intervention || 'Qualifier l’action concrète à exécuter'}
                                </div>
                                <div className="mt-1 text-[13px] leading-6 text-text-muted">
                                    Cette page sert d’abord à cadrer l’action terrain: type d’intervention, but, zone, créneau,
                                    personnes et contraintes. Les points terrain, prélèvements, groupes et essais viennent ensuite.
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg border border-border bg-bg px-4 py-4">
                                    <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">Demande / affaire</div>
                                    <div className="mt-3">
                                        {demandeContextItems.length > 0 ? (
                                            demandeContextItems.map((item) => (
                                                <InfoLine key={item.label} label={item.label} value={item.value} />
                                            ))
                                        ) : (
                                            <div className="text-[13px] leading-6 text-text-muted">
                                                Aucune demande de contexte n’est encore disponible pour cette intervention.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-lg border border-border bg-bg px-4 py-4">
                                    <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">Campagne / cadre source</div>
                                    <div className="mt-3">
                                        {campaignContextItems.length > 0 ? (
                                            campaignContextItems.map((item) => (
                                                <InfoLine key={item.label} label={item.label} value={item.value} />
                                            ))
                                        ) : (
                                            <div className="text-[13px] leading-6 text-text-muted">
                                                Cette intervention n’est pas encore documentée par un cadre de campagne explicite.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-bg px-4 py-4 flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">Repères de cadrage</div>
                                    <div className="mt-1 text-[13px] leading-6 text-text-muted">
                                        Les informations minimales pour que l’intervention soit claire avant exécution.
                                    </div>
                                </div>
                                <div className="text-[20px] font-semibold text-text">{planningChecklistDoneCount}/{planningChecklistItems.length}</div>
                            </div>

                            <div className="flex flex-col gap-2">
                                {planningChecklistItems.map((item) => (
                                    <PlanningCheckpoint
                                        key={item.label}
                                        label={item.label}
                                        detail={item.detail}
                                        done={item.done}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>

                <Section title="Ce qui sera fait">
                    {editing ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            <Field label="Action terrain">
                                <div className="flex flex-wrap gap-2">
                                    <Select
                                        value={form.type_intervention}
                                        onChange={(e) => setField('type_intervention', e.target.value)}
                                        className="min-w-[220px] flex-1"
                                    >
                                        <option value="">—</option>
                                        {typeOptions.map((item) => (
                                            <option key={item} value={item}>{item}</option>
                                        ))}
                                    </Select>
                                    <Button variant="secondary" onClick={() => setTypePickerOpen(true)}>
                                        Choix guidé
                                    </Button>
                                </div>
                            </Field>

                            <Field label="Finalité">
                                <Select value={form.finalite_intervention} onChange={(e) => setField('finalite_intervention', e.target.value)}>
                                    <option value="">—</option>
                                    {FINALITY_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Objectif concret" full>
                                <Textarea
                                    value={form.objectif_intervention}
                                    onChange={(value) => setField('objectif_intervention', value)}
                                    rows={3}
                                    placeholder="Décrire simplement ce qui sera fait ou constaté pendant cette intervention."
                                />
                            </Field>

                            <Field label="Zone / localisation">
                                <Input
                                    value={form.zone_intervention}
                                    onChange={(e) => setField('zone_intervention', e.target.value)}
                                    placeholder="Zone nord, plateforme A, regard 12..."
                                />
                            </Field>

                            <Field label="Matériau / objet concerné">
                                <Select value={form.nature_materiau} onChange={(e) => setField('nature_materiau', e.target.value)}>
                                    <option value="">—</option>
                                    {MATERIAL_OPTIONS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Date et créneau" full>
                                <div className="grid gap-2 md:grid-cols-3">
                                    <Input type="date" value={form.date_intervention} onChange={(e) => setField('date_intervention', e.target.value)} />
                                    <Input type="time" value={form.heure_debut} onChange={(e) => setField('heure_debut', e.target.value)} />
                                    <Input type="time" value={form.heure_fin} onChange={(e) => setField('heure_fin', e.target.value)} />
                                </div>
                            </Field>

                            <Field label="Technicien / opÃ©rateur">
                                <Input value={form.technicien} onChange={(e) => setField('technicien', e.target.value)} />
                            </Field>

                            <Field label="Statut">
                                <Select value={form.statut} onChange={(e) => setField('statut', e.target.value)}>
                                    {STATUTS.map((item) => (
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </Select>
                            </Field>

                            <Field label="Responsable / rÃ©fÃ©rent">
                                <Input value={form.responsable_referent} onChange={(e) => setField('responsable_referent', e.target.value)} />
                            </Field>

                            <Field label="AttribuÃ© Ã ">
                                <Input value={form.attribue_a} onChange={(e) => setField('attribue_a', e.target.value)} />
                            </Field>

                            <Field label="Notes terrain" full>
                                <Textarea
                                    value={form.notes_terrain}
                                    onChange={(value) => setField('notes_terrain', value)}
                                    rows={3}
                                    placeholder="Consignes terrain, points dâ€™attention, suites Ã  suivreâ€¦"
                                />
                            </Field>
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <div className="rounded-lg border border-border bg-bg px-4 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">Action</div>
                                <div className="mt-1 text-[14px] font-semibold text-text">{form.type_intervention || '—'}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-bg px-4 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">Finalité</div>
                                <div className="mt-1 text-[14px] font-semibold text-text">{form.finalite_intervention || '—'}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-bg px-4 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">Créneau</div>
                                <div className="mt-1 text-[14px] font-semibold text-text">{missionWindow || '—'}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-bg px-4 py-3 md:col-span-2 xl:col-span-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">Objectif</div>
                                <div className="mt-1 text-[13px] leading-6 text-text">{form.objectif_intervention || '—'}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-bg px-4 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">Zone</div>
                                <div className="mt-1 text-[13px] font-medium text-text">{form.zone_intervention || '—'}</div>
                            </div>
                            <div className="rounded-lg border border-border bg-bg px-4 py-3">
                                <div className="text-[10px] font-semibold uppercase tracking-[.05em] text-text-muted">Matériau / objet</div>
                                <div className="mt-1 text-[13px] font-medium text-text">{form.nature_materiau || '—'}</div>
                            </div>
                        </div>
                    )}
                </Section>

                <Section title={editing || isCreate ? 'Fiche détaillée' : 'Détails enregistrés'}>
                    {editing ? (
                        <div className="flex flex-col gap-4">
                            <div className="rounded-lg border border-[#d8e6e1] bg-[#f6fbf9] px-4 py-3 text-[13px] leading-6 text-text-muted">
                                Ici, on précise ce qui sera réellement fait pendant cette intervention.
                                Commencer par le type d’action, puis le but concret, la zone, le créneau et les personnes.
                            </div>

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
                        </div>
                    ) : interventionSummaryItems.length > 0 ? (
                        <div className="grid gap-x-8 md:grid-cols-2">
                            <div>
                                {interventionSummaryItems.slice(0, Math.ceil(interventionSummaryItems.length / 2)).map((item) => (
                                    <InfoLine key={item.label} label={item.label} value={item.value} />
                                ))}
                            </div>
                            <div>
                                {interventionSummaryItems.slice(Math.ceil(interventionSummaryItems.length / 2)).map((item) => (
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
                                        {linkedEssaisLoading ? 'Synchronisation...' : linkedEssaiActionLabel}
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

                {false ? (
                    <Section title="Actions suivantes">
                        <div className="flex flex-col gap-4">
                            <div className="rounded-lg border border-[#d8e6e1] bg-[#f6fbf9] px-4 py-3 text-[13px] leading-6 text-text-muted">
                                La demande et la campagne sont déjà rappelées en haut. Ici, on ne garde que la suite utile à partir de cette intervention.
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={handleCreatePrelevement} disabled={creatingPrelevement || saving}>
                                    {creatingPrelevement ? 'Création…' : 'Créer un prélèvement'}
                                </Button>
                                <Button variant="primary" onClick={handleOpenDirectEssaiDraft}>
                                    Créer un essai direct
                                </Button>
                                {linkedPrelevements[0] ? (
                                    <Button variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/prelevements/${linkedPrelevements[0].uid}`, childReturnTo)}>
                                        Ouvrir le prélèvement principal
                                    </Button>
                                ) : null}
                            </div>

                            <details className="rounded-lg border border-border bg-bg px-3 py-3">
                                <summary className="cursor-pointer text-[12px] font-semibold text-text">
                                    Préparer un essai direct
                                </summary>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
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

                                    <div className="md:col-span-2 rounded-lg border border-border bg-surface px-3 py-3 text-[12px] text-text-muted">
                                        Ouvre un brouillon EssaiPage rattaché directement à cette intervention pour {selectedDirectEssaiTemplate.label.toLowerCase()}.
                                        L’essai n’est créé en base qu’au premier enregistrement.
                                    </div>
                                </div>
                            </details>

                            {canCreateDirectEchantillons ? (
                                <details className="rounded-lg border border-border bg-bg px-3 py-3">
                                    <summary className="cursor-pointer text-[12px] font-semibold text-text">
                                        Créer des groupes d’essais directs
                                    </summary>
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
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

                                        <div className="md:col-span-2 rounded-lg border border-border bg-surface px-3 py-3 text-[12px] text-text-muted">
                                            {quickEchantillonLines.length
                                                ? `${quickEchantillonLines.length} groupe(s) prêt(s) à créer depuis ${interventionInfo?.reference || 'cette intervention'}.`
                                                : 'Ajoute au moins une ligne pour créer un groupe d’essais direct.'}
                                        </div>

                                        <div className="md:col-span-2 flex flex-wrap gap-2">
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
                                </details>
                            ) : null}

                            <div className="grid gap-4 lg:grid-cols-2">
                                {!isSondageComposite ? (
                                    <div className="rounded-lg border border-border bg-bg px-3 py-3 flex flex-col gap-3">
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

                                <div className="rounded-lg border border-border bg-bg px-3 py-3 flex flex-col gap-3">
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
                            </div>
                        </div>
                    </Section>
                ) : null}

                </>) : null}

                <InterventionTypeModal
                    open={typePickerOpen}
                    onClose={() => setTypePickerOpen(false)}
                    onSelect={handleSelectInterventionType}
                    title="Choisir l’action terrain"
                    subtitle={campaignInfo.reference || campaignInfo.label || demandeInfo?.reference || ''}
                />
                </div>
            </div>
        </div>
    )
}
