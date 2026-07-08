/**
 * Types de points canvas PI — dérivés du catalogue RST (essaiCodesCatalog), pas de listes inventées.
 */
import { TERRAIN_ESSAI_PICKER_CODES } from '@/lib/essaiCodesCatalog'

/** Codes terrain du catalogue exclus du picker PI (documents mission, générique). */
export const CANVAS_EXCLUDED_TERRAIN_CODES = new Set(['VC', 'GEN'])

export const CANVAS_GENERIC_POINT_TYPES = [
    { code: 'REPERE', value: 'Repère', label: 'Repère', family: 'REPERE', domain: 'terrain' },
    { code: 'OBSERVATION', value: 'Observation', label: 'Observation', family: 'OBSERVATION', domain: 'terrain' },
]

/** Préfixes reconnus pour déduire la famille depuis le code point (ordre: plus long d'abord). */
export const POINT_CODE_FAMILY_PREFIXES = [
    'PLD', 'FWD', 'SCB', 'ITSR', 'SC', 'SO', 'DE', 'HAP', 'AMI', 'DF', 'PMT', 'ADH', 'ACO',
    'PL', 'PA', 'CFE', 'GPR', 'ORN', 'ARR', 'EXT', 'PCG', 'DS', 'QS', 'EAU', 'PER', 'INF', 'EE', 'EA',
]

const TYPE_TOKEN_FAMILIES = [
    ['SC', ['CAROT', 'SONDAGE_CAROTTE']],
    ['SO', ['PELLE', 'SONDAGE_PELLE']],
    ['DE', ['DENSITE', 'ENROBE']],
    ['HAP', ['HAP']],
    ['AMI', ['AMI', 'AMIANTE']],
    ['DF', ['DEFLEX', 'FLEXION']],
    ['FWD', ['FWD']],
    ['PMT', ['PMT', 'MACROTEXTURE']],
    ['ADH', ['ADH', 'ADHER']],
    ['ACO', ['ACO', 'ACOUST']],
    ['PLD', ['PLD', 'DYNAPLAQUE']],
    ['PL', ['PLAQUE', 'PORTANCE']],
    ['REPERE', ['REPERE', 'REPÈRE']],
    ['OBSERVATION', ['OBSERVATION']],
]

function normalizeToken(value) {
    return String(value || '')
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

export function normalizePointFamily(pointType, pointCode = '') {
    const code = normalizeToken(pointCode)
    for (const prefix of POINT_CODE_FAMILY_PREFIXES) {
        if (code.startsWith(prefix)) return prefix
    }

    const type = normalizeToken(pointType)
    if (!type) return ''

    for (const [family, tokens] of TYPE_TOKEN_FAMILIES) {
        if (tokens.some((token) => type.includes(token)) || type === family) {
            return family
        }
    }

    return type.length <= 6 ? type : ''
}

function normalizeCatalogEntry(entry) {
    if (!entry) return null
    const code = normalizeToken(entry.code)
    if (!code || CANVAS_EXCLUDED_TERRAIN_CODES.has(code)) return null
    if (String(entry.domain || 'terrain') !== 'terrain') return null
    const label = String(entry.label || code).trim()
    return {
        code,
        label,
        domain: 'terrain',
        value: label,
        family: code,
    }
}

export function defaultTerrainCatalogOptions() {
    return TERRAIN_ESSAI_PICKER_CODES
        .map(normalizeCatalogEntry)
        .filter(Boolean)
}

function feuilleCodesForSelection(feuilleOptions, selectedFeuilleId) {
    const codes = new Set()
    for (const item of feuilleOptions || []) {
        if (selectedFeuilleId != null && Number(item.id) !== Number(selectedFeuilleId)) continue
        const code = normalizeToken(item.code_feuille)
        if (code) codes.add(code)
    }
    return codes
}

/** Options pour le sélecteur « type du nouveau point » sur le canvas PI. */
export function resolveCanvasPointTypeOptions({ feuilleOptions, selectedFeuilleId, allowedTypeOptions }) {
    const catalogSource = (Array.isArray(allowedTypeOptions) && allowedTypeOptions.length
        ? allowedTypeOptions
        : defaultTerrainCatalogOptions()
    ).map(normalizeCatalogEntry).filter(Boolean)

    const feuilleCodes = feuilleCodesForSelection(feuilleOptions, selectedFeuilleId)
    const filtered = feuilleCodes.size
        ? catalogSource.filter((entry) => feuilleCodes.has(entry.code))
        : catalogSource

    const options = []
    const seenValues = new Set()
    for (const entry of filtered) {
        if (seenValues.has(entry.value)) continue
        seenValues.add(entry.value)
        options.push({
            ...entry,
            label: `${entry.code} — ${entry.label}`,
        })
    }

    for (const generic of CANVAS_GENERIC_POINT_TYPES) {
        if (seenValues.has(generic.value)) continue
        seenValues.add(generic.value)
        options.push(generic)
    }

    return options
}

export function buildAllowedPointFamilies(allowedTypeOptions, feuilleOptions, selectedFeuilleId) {
    const families = new Set()

    for (const item of feuilleOptions || []) {
        const fam = normalizePointFamily(item.code_feuille || '')
        if (fam) families.add(fam)
    }
    if (selectedFeuilleId != null) {
        const selected = (feuilleOptions || []).find((item) => Number(item.id) === Number(selectedFeuilleId))
        const fam = normalizePointFamily(selected?.code_feuille || '')
        if (fam) families.add(fam)
    }

    const catalogSource = (Array.isArray(allowedTypeOptions) && allowedTypeOptions.length
        ? allowedTypeOptions
        : defaultTerrainCatalogOptions()
    )
    for (const entry of catalogSource) {
        const normalized = normalizeCatalogEntry(entry)
        if (normalized?.code) families.add(normalized.code)
    }

    families.add('REPERE')
    families.add('OBSERVATION')
    return families
}
