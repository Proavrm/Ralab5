import { Children, isValidElement, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { qualiteApi } from '@/services/api'
import './TabQSSE.css'
import QsseAnalysisDashboard from './QsseAnalysisDashboard'

const WORKFLOW_STEPS = ['Remontée info', 'Qualification', 'FNC / FAE / BP', 'Action', 'Validation', 'REX']

const SHEET_TAB_ORDER = [
  'Registe AT',
  "Remontées d'infos",
  'Registre PASD',
  'Registre BP',
  'Registre FAE',
  'Casses réseaux',
  'FNC',
  'Registre FNC',
  "Plan d'actions",
  'Tests Alcool et Stup',
  'Non-respect RV',
  'Non-respect EPI',
  'Arrêt de chantier',
  'Suggestions - Mesures',
  'Quart heure CC - CE',
  'Quart heure Encadrant',
  '5 PM',
  'Eveil Musculaire',
  'Visites QSSE - 5PM_Eveils',
]

const SHEET_LABELS = {
  'Registe AT': 'AT',
  "Remontées d'infos": 'Infos',
  'Registre PASD': 'PASD',
  'Registre BP': 'BP',
  'Registre FAE': 'FAE',
  'Casses réseaux': 'Casses réseaux',
  FNC: 'FNC',
  'Registre FNC': 'Registre FNC',
  "Plan d'actions": "Plan d'actions",
  'Tests Alcool et Stup': 'Tests',
  'Non-respect RV': 'Non-respect RV',
  'Non-respect EPI': 'EPI',
  'Arrêt de chantier': 'Arrêt',
  'Suggestions - Mesures': 'Sug.',
  'Quart heure CC - CE': 'QH CC',
  'Quart heure Encadrant': 'QH Enc.',
  '5 PM': '5 PM',
  'Eveil Musculaire': 'Eveil',
  'Visites QSSE - 5PM_Eveils': 'Visites QSSE',
}

const SHEET_GROUPS = [
  { id: 'registers', label: 'Registres' },
  { id: 'actions', label: 'Actions' },
  { id: 'indicators', label: 'Indicateurs' },
  { id: 'other', label: 'Autres' },
]

const MONTH_COLUMNS = [
  ['janvier', 'Jan'],
  ['fevrier', 'Fev'],
  ['mars', 'Mar'],
  ['avril', 'Avr'],
  ['mai', 'Mai'],
  ['juin', 'Jun'],
  ['juillet', 'Jul'],
  ['aout', 'Aou'],
  ['septembre', 'Sep'],
  ['octobre', 'Oct'],
  ['novembre', 'Nov'],
  ['decembre', 'Dec'],
]

const QUARTER_COLUMNS = [
  ['trimestre 1', 'T1'],
  ['trimestre 2', 'T2'],
  ['trimestre 3', 'T3'],
  ['trimestre 4', 'T4'],
]

const TYPE_NC_KEYS = [
  'type de nc',
  'type de nc (processus service materiaux environ )',
  'type de nc (organisationnel technique degration )',
  'type de nc (organisationnel technique degradation )',
]

const INTERNAL_EXTERNAL_KEYS = ['interne externe', 'interne / externe']
const ATTACHMENT_REGISTER_CODES = new Set(['FNC', 'PASD', 'BP', 'FAE'])

function normalizeLooseText(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeSheetName(value) {
  return String(value || '').trim()
}

function sheetLabel(value) {
  const normalized = normalizeSheetName(value)
  return SHEET_LABELS[normalized] || normalized || 'Sans feuille'
}

function sheetMode(sheetName, fallbackRecordKind = 'event') {
  const normalized = normalizeLooseText(sheetName)
  if (/regis(?:tre|te)(?: des)? at\b/.test(normalized)) return 'at'
  if (normalized.includes('registre fnc') || normalized.includes('fnc 2025')) return 'fnc-register'
  if (normalized.includes('registre fae')) return 'fae-register'
  if (normalized.includes('registre bp')) return 'bp-register'
  if (normalized.includes('casses reseaux')) return 'network-register'
  if (normalized.includes('registre pasd') || normalized.includes('pasd details')) return 'pasd-register'
  if (normalized.includes("plan d'actions") || normalized.includes('plan d actions')) return 'action-plan'
  if (normalized.includes('tests alcool')) return 'tests-register'
  if (normalized.includes('non-respect rv') || normalized.includes('non respect rv') || normalized.includes('regles vitales')) return 'rv-register'
  if (normalized.includes('non-respect epi') || normalized.includes('non respect epi')) return 'epi-register'
  if (normalized.includes('arret de chantier')) return 'work-stop-register'
  if (normalized.includes('suggestions')) return 'suggestion-register'
  if (normalized.includes('quart heure encadrant')) return 'indicator-quarterly'
  if (normalized.includes('quart heure')) return 'indicator-monthly'
  if (normalized.includes('remontees d infos')) return 'indicator-monthly'
  if (normalized === 'fnc') return 'indicator-monthly'
  if (normalized.includes('visites qsse')) return 'indicator-monthly'
  if (normalized.includes('5 pm') || normalized === '5 pm') return 'indicator-daily'
  if (normalized.includes('eveil musculaire')) return 'indicator-daily'
  return fallbackRecordKind === 'indicator' ? 'indicator-monthly' : 'event-generic'
}

function sheetGroupIdFromMode(mode) {
  if (!mode) return 'other'
  if (mode.startsWith('indicator')) return 'indicators'
  if (['action-plan', 'suggestion-register'].includes(mode)) return 'actions'
  if (mode === 'event-generic') return 'other'
  return 'registers'
}

function parseJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isEmptyMetricValue(value) {
  return value == null || value === '' || value === '/' || value === '#DIV/0!'
}

function metricNumber(value) {
  if (isEmptyMetricValue(value)) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(String(value).replace(',', '.').replace(/\s+/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function metricDisplay(value) {
  if (isEmptyMetricValue(value)) return '—'
  const numeric = metricNumber(value)
  if (numeric != null) {
    return new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    }).format(numeric)
  }
  return String(value)
}

function metricValue(metrics, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(metrics, key)) continue
    if (!isEmptyMetricValue(metrics[key])) return metrics[key]
  }
  return ''
}

function metricTotal(metrics, keys) {
  let total = 0
  let hasValue = false
  keys.forEach((key) => {
    const numeric = metricNumber(metrics[key])
    if (numeric == null) return
    total += numeric
    hasValue = true
  })
  return hasValue ? total : null
}

function activeMetricDays(metrics) {
  let count = 0
  Object.entries(metrics).forEach(([key, value]) => {
    if (!/^\d{4}\s\d{2}\s\d{2}t/i.test(key)) return
    if (isEmptyMetricValue(value)) return
    count += 1
  })
  return count || null
}

function distinctCount(values) {
  return new Set(values.filter(Boolean)).size
}

function matchesStatusFilter(row, statusFilter) {
  if (statusFilter === 'ALL') return true
  if (statusFilter === 'BACKLOG') return Boolean(row.is_backlog)
  if (statusFilter === 'REX') return Boolean(row.rex)
  if (statusFilter === 'LATE') return Boolean(row.is_late)
  if (statusFilter === 'OPEN') {
    const status = String(row.status || '').toLowerCase()
    return ['ouverte', 'en analyse', 'en cours', 'action en cours', 'à analyser', 'a analyser'].some((value) => status.includes(value))
  }
  return true
}

function buildCountSeries(rows, getLabel, limit = 6) {
  const counts = {}
  rows.forEach((row) => {
    const label = String(getLabel(row) || '').trim() || 'Sans donnée'
    counts[label] = (counts[label] || 0) + 1
  })
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'fr', { sensitivity: 'base' }))
    .slice(0, limit)
}

function sheetDescription(mode) {
  switch (mode) {
    case 'at':
      return 'Registre détaillé des accidents de travail et de trajet.'
    case 'fnc-register':
      return 'Registre détaillé des non-conformités, avec causes, traitement et clôture.'
    case 'fae-register':
      return 'Registre détaillé des faits environnementaux avec thème, cause, traitement et clôture.'
    case 'bp-register':
      return 'Registre détaillé des bonnes pratiques.'
    case 'pasd-register':
      return 'Registre détaillé des presqu’accidents et situations dangereuses.'
    case 'action-plan':
      return 'Plan d’actions de suivi avec origine, pilote, échéance et statut.'
    case 'tests-register':
      return 'Registre des campagnes de tests alcool et stupéfiants.'
    case 'rv-register':
    case 'epi-register':
      return 'Registre de non-respect avec action, pilote et état de réalisation.'
    case 'work-stop-register':
      return 'Registre des arrêts de chantier et de leur suivi.'
    case 'suggestion-register':
      return 'Registre de suggestions et de mesures d’amélioration.'
    case 'indicator-quarterly':
      return 'Matrice de suivi trimestriel et objectif annuel par personne.'
    case 'indicator-daily':
      return 'Matrice quotidienne de pratique terrain, avec synthèse par personne.'
    case 'indicator-monthly':
      return 'Matrice mensuelle de suivi par personne ou responsable.'
    default:
      return 'Feuille QSSE traitée dans une vue de registre générique.'
  }
}

function sortSheetNames(names) {
  return [...names].sort((left, right) => {
    const leftIndex = SHEET_TAB_ORDER.indexOf(left)
    const rightIndex = SHEET_TAB_ORDER.indexOf(right)
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex
    if (leftIndex !== -1) return -1
    if (rightIndex !== -1) return 1
    return left.localeCompare(right, 'fr', { sensitivity: 'base' })
  })
}

function formatMoney(value) {
  if (!value) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

function formatDateShort(value) {
  if (!value) return '—'
  const raw = String(value).trim()
  if (!raw || raw === '/') return '—'

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('fr-FR')
  }

  const d = new Date(raw)
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('fr-FR')
  return raw
}

function extractDateYear(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw || raw === '/') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return Number(raw.slice(0, 4)) || null
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return Number(raw.slice(6, 10)) || null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return null
  return d.getFullYear()
}

function toDateInputValue(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw || raw === '/') return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return `${raw.slice(6, 10)}-${raw.slice(3, 5)}-${raw.slice(0, 2)}`
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function formatFileSize(value) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '0 Ko'
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} Mo`
  return `${Math.max(1, Math.round(size / 1024))} Ko`
}

function isPdfFile(file) {
  if (!file) return false
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  return name.endsWith('.pdf') || type === 'application/pdf'
}

function isPptxFile(file) {
  if (!file) return false
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  return name.endsWith('.pptx') || type.includes('presentationml.presentation')
}

function cellText(value) {
  if (value == null || value === false) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(cellText).join(' ')
  if (isValidElement(value)) return cellText(value.props?.children)
  return Children.toArray(value).map(cellText).join(' ')
}

function normalizedSortValue(value) {
  const raw = String(value || '').trim()
  if (!raw || raw === '—') return null

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/')
    return Number(`${year}${month}${day}`)
  }

  const compact = raw.replace(/\s+/g, '').replace(/[€%]/g, '').replace(',', '.')
  if (/^-?\d+(?:\.\d+)?$/.test(compact)) return Number(compact)

  return raw.toLocaleLowerCase('fr-FR')
}

function compareSortValues(left, right) {
  const leftValue = normalizedSortValue(left)
  const rightValue = normalizedSortValue(right)

  if (leftValue == null && rightValue == null) return 0
  if (leftValue == null) return 1
  if (rightValue == null) return -1

  if (typeof leftValue === 'number' && typeof rightValue === 'number') return leftValue - rightValue
  return String(leftValue).localeCompare(String(rightValue), 'fr', { sensitivity: 'base', numeric: true })
}

function sortValueForColumn(column, row) {
  if (typeof column.sortValue === 'function') return column.sortValue(row)
  return cellText(column.render(row))
}

function deriveSubjectFromDocumentReference(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  if (raw.includes(' - ')) {
    const candidate = raw.split(' - ').pop()?.trim() || ''
    if (candidate && candidate !== raw) return candidate
  }

  if (raw.includes('_')) {
    const candidate = raw.split('_').pop()?.trim() || ''
    if (candidate && candidate !== raw) return candidate
  }

  return ''
}

function resolveShortSubject(raw) {
  const explicitTitle = String(raw.title || '').trim()
  const description = String(raw.description || '').trim()
  const documentSubject = deriveSubjectFromDocumentReference(raw.document_reference)
  const titleLooksNarrative = !explicitTitle || explicitTitle === description || explicitTitle.includes('\n') || explicitTitle.length > 140

  if (documentSubject && titleLooksNarrative) return documentSubject
  return explicitTitle || description || 'Événement QSSE'
}

function badgeClass(value, kind) {
  const key = String(value || '').toLowerCase()
  if (kind === 'register') {
    if (key === 'fnc') return 'fnc'
    if (key === 'fae') return 'fae'
    if (key === 'bp') return 'bp'
    return 'info'
  }

  if (key.includes('backlog')) return 'backlog'
  if (key.includes('ouverte')) return 'ouverte'
  if (key.includes('analyse') || key.includes('cours') || key.includes('diffuser')) return key.includes('diffuser') ? 'diffuser' : 'en-cours'
  if (key.includes('mesure') || key.includes('cloturee') || key.includes('clôturée') || key.includes('valid')) return 'validee'
  if (key.includes('majeure') || key.includes('critique')) return 'majeure'
  if (key.includes('significative')) return 'significative'
  if (key.includes('mineure')) return 'mineure'
  if (key.includes('positive')) return 'positive'
  if (key.includes('signal')) return 'signal'
  if (key.includes('env')) return 'env'
  if (key.includes('bonne')) return 'bonne'
  if (key.includes('methode') || key.includes('méthode')) return 'methode'
  if (key.includes('absence') || key.includes('technique')) return 'absence'
  return 'neutral'
}

function monthIndex(value) {
  if (!value) return -1
  const raw = String(value)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return Number(raw.slice(3, 5)) - 1
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return -1
  return d.getMonth()
}

function toRow(raw, backlogReferenceYear) {
  const type = raw.register_code || 'INFO'
  const recordKind = raw.record_kind || 'event'
  const sourceSheet = normalizeSheetName(raw.sheet_name)
  const metrics = parseJsonObject(raw.metrics_json)
  const status = raw.status?.trim() || (recordKind === 'event' ? 'À analyser' : '')
  const sourceYear = Number(raw.source_year || 2026)
  const referenceYear = Number(backlogReferenceYear || new Date().getFullYear())
  const closedYear = extractDateYear(raw.date_closed)
  const backlogYear = type === 'FNC' && sourceYear === referenceYear && closedYear === referenceYear - 1 ? closedYear : null
  const isBacklog = backlogYear !== null
  const narrative = raw.description?.trim() || raw.title?.trim() || 'Événement QSSE'
  const title = resolveShortSubject(raw)
  const severity = raw.severity?.trim() || (recordKind === 'event'
    ? (type === 'FNC' ? 'Majeure' : type === 'FAE' ? 'Significative' : type === 'BP' ? 'Positive' : 'Signal faible')
    : '')
  const person = raw.person?.trim() || ''
  const pilot = raw.pilot?.trim() || ''

  return {
    uid: String(raw.id),
    reference: `${type}-${raw.id}`,
    type,
    record_kind: recordKind,
    sheet_name: sourceSheet,
    site: raw.site?.trim() || '',
    chantier: raw.site?.trim() || raw.agency?.trim() || '—',
    title,
    family: raw.sheet_kind?.replaceAll('_', ' ') || 'Remontée d\'info / prévention',
    severity,
    status,
    event_date: raw.date_event || '',
    saisie_date: raw.date_saisie || '',
    closed_date: raw.date_closed || '',
    registered_date: raw.updated_at || '',
    owner: pilot || person || raw.agency?.trim() || 'Qualité RA',
    source_year: sourceYear,
    registered_year: sourceYear,
    agency: raw.agency?.trim() || '',
    attachment_count: Number(raw.attachment_count || 0),
    entity: raw.entity?.trim() || '',
    person,
    theme: raw.theme?.trim() || '',
    pilot,
    action_label: raw.action_label?.trim() || '',
    treatment: raw.treatment?.trim() || '',
    document_reference: raw.document_reference?.trim() || '',
    metrics,
    cost: Number(raw.amount_value || 0),
    backlog_year: backlogYear,
    is_backlog: isBacklog,
    is_late: Boolean(isBacklog && type === 'FNC'),
    description: narrative,
    cause: raw.cause?.trim() || '',
    action_immediate: raw.treatment?.trim() || '',
    corrective_action: raw.corrective_action?.trim() || raw.action_label?.trim() || '',
    rex: type === 'BP' ? 'Bonne pratique diffusable en 1/4h qualité.' : '',
  }
}

function matchesSearch(row, query) {
  if (!query) return true
  const q = query.toLowerCase()
  return [
    row.reference,
    row.type,
    row.chantier,
    row.title,
    row.family,
    row.status,
    row.owner,
    row.agency,
    row.document_reference,
    row.description,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q)
}

function DataField({ label, value }) {
  return (
    <div className="df">
      <label>{label}</label>
      <span>{value || '—'}</span>
    </div>
  )
}

function hasDisplayValue(value) {
  if (value == null) return false
  if (typeof value === 'number') return Number.isFinite(value)
  return String(value).trim() !== '' && String(value).trim() !== '/'
}

function detailField(label, value) {
  return { label, value }
}

function metricDetailField(label, metrics, keys) {
  const raw = metricValue(metrics, keys)
  return detailField(label, raw === '' ? '' : metricDisplay(raw))
}

function metricHalfFields(metrics, defs) {
  return defs
    .map(([key, label]) => {
      const raw = metricValue(metrics, [key])
      return detailField(label, raw === '' ? '' : metricDisplay(raw))
    })
    .filter((field) => hasDisplayValue(field.value))
}

function DetailFieldSection({ title, fields, className = 'detail-card' }) {
  const visibleFields = fields.filter((field) => hasDisplayValue(field.value))
  if (!visibleFields.length) return null

  return (
    <section className={className}>
      <div className="detail-card-title">{title}</div>
      {visibleFields.map((field) => (
        <DataField key={`${title}-${field.label}`} label={field.label} value={field.value} />
      ))}
    </section>
  )
}

function DetailTextSection({ label, value }) {
  if (!hasDisplayValue(value)) return null
  return (
    <div className="text-block">
      <label>{label}</label>
      <p>{value}</p>
    </div>
  )
}

function indicatorTotal(row) {
  return metricValue(row.metrics, ['nbr fiches d\'evenements', 'nbr de 1 4 heure', 'nbr de 1 4 h', 'visite qsse', '5pm', 'eveil musculaire', 'eveil'])
    || metricTotal(row.metrics, MONTH_COLUMNS.map(([key]) => key))
    || metricTotal(row.metrics, QUARTER_COLUMNS.map(([key]) => key))
    || activeMetricDays(row.metrics)
    || ''
}

function buildDetailPreset(row) {
  const mode = sheetMode(row.sheet_name, row.record_kind)
  const summaryMetaDefault = [
    { label: 'Chantier', value: row.chantier },
    { label: 'Responsable', value: row.owner },
    { label: 'Coût', value: formatMoney(row.cost) },
  ]
  const commonIdentity = [
    detailField('Registre', row.type),
    detailField('Onglet source', sheetLabel(row.sheet_name)),
    detailField('Agence', row.agency),
    detailField('Entité', row.entity),
    detailField('Personne / rédacteur', row.person),
  ]
  const commonTemporal = [
    detailField('Date du fait', formatDateShort(row.event_date)),
    detailField('Date de saisie', formatDateShort(row.saisie_date)),
    detailField('Date de clôture', formatDateShort(row.closed_date)),
    detailField('Année opérationnelle', String(row.source_year)),
  ]

  const preset = {
    mode,
    summaryMeta: summaryMetaDefault,
    identityFields: commonIdentity,
    temporalFields: commonTemporal,
    contextSections: [],
    textSections: [],
    chips: [],
    showConvert: false,
  }

  if (row.is_backlog) preset.chips.push('Backlog historique')
  if (!row.saisie_date && !mode.startsWith('indicator')) preset.chips.push('date de saisie absente')
  if (!row.closed_date && ['action-plan', 'fnc-register', 'fae-register'].includes(mode)) preset.chips.push('clôture à renseigner')

  switch (mode) {
    case 'at':
      preset.summaryMeta = [
        { label: 'Salarié', value: row.person },
        { label: 'Agence', value: row.agency },
        { label: 'Chantier', value: row.chantier },
      ]
      preset.identityFields = [
        ...commonIdentity,
        detailField('Société', row.entity),
        metricDetailField('Type AT / trajet', row.metrics, ['type d\'accident (at ou trajet)']),
        metricDetailField('Lésion', row.metrics, ['lesion']),
      ]
      preset.temporalFields = [
        detailField('Date accident', formatDateShort(row.event_date)),
        metricDetailField('Début arrêt', row.metrics, ['date debut arret']),
        detailField('Dernier jour arrêt', formatDateShort(row.closed_date)),
        metricDetailField('Délai communication (h)', row.metrics, ['delai de communication au qse (en heure)']),
      ]
      preset.contextSections = [
        {
          title: 'Accident',
          fields: [
            metricDetailField('HPG', row.metrics, ['hpg']),
            metricDetailField('Arrêt', row.metrics, ['arret']),
            metricDetailField('Ambulance', row.metrics, ['ambulance']),
            metricDetailField('Pompier', row.metrics, ['pompier']),
            metricDetailField('SAMU', row.metrics, ['samu']),
            metricDetailField('Règle vitale', row.metrics, ['concerne une regle vitale (oui ou non)']),
            metricDetailField('Analyse sous 7j', row.metrics, ['analyse avec encadrement sous 7j']),
            metricDetailField('Entretien retour', row.metrics, ['entretien de retour']),
          ],
        },
      ]
      preset.textSections = [
        { label: 'Circonstances', value: row.description },
      ]
      break
    case 'fnc-register':
      preset.summaryMeta = [
        { label: 'Agence', value: row.agency },
        { label: 'Chantier', value: row.chantier },
        { label: 'Clôture', value: formatDateShort(row.closed_date) },
      ]
      preset.identityFields = [...commonIdentity]
      preset.contextSections = [
        {
          title: 'Qualification',
          fields: [
            metricDetailField('Type de NC', row.metrics, TYPE_NC_KEYS),
            metricDetailField('Interne / externe', row.metrics, INTERNAL_EXTERNAL_KEYS),
            detailField('Action corrective', row.corrective_action),
            detailField('Coût', formatMoney(row.cost)),
          ],
        },
      ]
      preset.textSections = [
        { label: 'Récit de l’événement', value: row.description },
        { label: 'Causes identifiées', value: row.cause },
        { label: 'Traitement', value: row.treatment },
      ]
      preset.showConvert = true
      break
    case 'fae-register':
      preset.summaryMeta = [
        { label: 'Agence', value: row.agency },
        { label: 'Thème', value: row.theme },
        { label: 'Clôture', value: formatDateShort(row.closed_date) },
      ]
      preset.identityFields = [...commonIdentity, detailField('Thème', row.theme)]
      preset.contextSections = [
        {
          title: 'Environnement',
          fields: [
            detailField('Cause', row.cause),
            detailField('Traitement', row.treatment),
            detailField('Coût', formatMoney(row.cost)),
          ],
        },
      ]
      preset.textSections = [{ label: 'Événement', value: row.description }]
      preset.showConvert = true
      break
    case 'bp-register':
      preset.summaryMeta = [
        { label: 'Agence', value: row.agency },
        { label: 'Chantier', value: row.chantier },
        { label: 'Rédacteur', value: row.person },
      ]
      preset.contextSections = [
        {
          title: 'Bonne pratique',
          fields: [
            metricDetailField('Détails', row.metrics, ['details']),
            detailField('Coût', formatMoney(row.cost)),
          ],
        },
      ]
      preset.textSections = [{ label: 'Description', value: row.description }]
      preset.showConvert = true
      break
    case 'network-register':
      preset.summaryMeta = [
        { label: 'Agence', value: row.agency },
        { label: 'Type réseau', value: metricDisplay(metricValue(row.metrics, ['type de reseau'])) },
        { label: 'Coût', value: formatMoney(row.cost) },
      ]
      preset.contextSections = [
        {
          title: 'Casse réseau',
          fields: [
            metricDetailField('Type de réseau', row.metrics, ['type de reseau']),
            detailField('Traitement', row.treatment),
            metricDetailField('Matériel impliqué', row.metrics, ['materiel entrainant la casse (pelle aspiratrice fiche cutter )']),
            metricDetailField('Mesures avant casse', row.metrics, ['mesures en place avant casse reseau (marquage dict sondages )']),
            metricDetailField('Responsable', row.metrics, ['responsable de la casse (nge resp. projet exploitant reseau)']),
          ],
        },
      ]
      preset.textSections = [{ label: 'Événement', value: row.description }]
      preset.showConvert = true
      break
    case 'pasd-register':
      preset.summaryMeta = [
        { label: 'Agence', value: row.agency },
        { label: 'PA / SD', value: metricDisplay(metricValue(row.metrics, ['pa sd'])) },
        { label: 'Score', value: metricDisplay(metricValue(row.metrics, ['total'])) },
      ]
      preset.contextSections = [
        {
          title: 'Qualification',
          fields: [
            metricDetailField('PA / SD', row.metrics, ['pa sd']),
            metricDetailField('HPG', row.metrics, ['hpg']),
            metricDetailField('Enregistrement', row.metrics, ['enegistrement']),
            metricDetailField('Règle vitale', row.metrics, ['concerne une regle vitale (oui ou non)']),
            metricDetailField('Score total', row.metrics, ['total']),
          ],
        },
      ]
      preset.textSections = [{ label: 'Récit', value: row.description }]
      preset.showConvert = true
      break
    case 'action-plan':
      preset.summaryMeta = [
        { label: 'Pilote', value: row.pilot },
        { label: 'Statut', value: row.status },
        { label: 'Échéance', value: formatDateShort(row.closed_date) },
      ]
      preset.identityFields = [...commonIdentity, detailField('Thématique', row.theme)]
      preset.contextSections = [
        {
          title: 'Pilotage',
          fields: [
            detailField('Origine', row.cause),
            detailField('Action définie', row.action_label || row.corrective_action),
            detailField('Pilote', row.pilot),
            metricDetailField('Alerte', row.metrics, ['alerte']),
          ],
        },
      ]
      preset.textSections = [
        { label: 'Constat', value: row.description },
        { label: 'Action définie', value: row.action_label || row.corrective_action },
      ]
      break
    case 'tests-register':
      preset.summaryMeta = [
        { label: 'Date', value: formatDateShort(row.event_date) },
        { label: 'Agence', value: row.agency },
        { label: 'Préventeur', value: row.person },
      ]
      preset.contextSections = [
        {
          title: 'Campagne de tests',
          fields: [
            metricDetailField('Négatifs', row.metrics, ['nombre de tests negatifs']),
            metricDetailField('Positifs', row.metrics, ['nombre de tests positifs']),
            metricDetailField('Commentaire', row.metrics, ['commentaire']),
            metricDetailField('Détail actions', row.metrics, ['detail noms et actions']),
          ],
        },
      ]
      break
    case 'rv-register':
    case 'epi-register':
      preset.summaryMeta = [
        { label: 'Personnel', value: row.person },
        { label: 'Statut', value: row.status },
        { label: 'Pilote', value: row.pilot },
      ]
      preset.contextSections = [
        {
          title: mode === 'rv-register' ? 'Règle vitale' : 'EPI',
          fields: [
            metricDetailField(mode === 'rv-register' ? 'RV concernée' : 'EPI', row.metrics, [mode === 'rv-register' ? 'rv concernee' : 'epi']),
            detailField('Action', row.action_label || row.corrective_action),
            detailField('Pilote', row.pilot),
            detailField('Réalisée', row.status),
            metricDetailField('Date de suivi', row.metrics, ['le']),
            metricDetailField('Remarque', row.metrics, ['remarque']),
          ],
        },
      ]
      preset.textSections = [{ label: 'Constat', value: row.description }]
      break
    case 'work-stop-register':
      preset.summaryMeta = [
        { label: 'Agence', value: row.agency },
        { label: 'Pilote', value: row.pilot },
        { label: 'Réalisée', value: row.status },
      ]
      preset.contextSections = [
        {
          title: 'Arrêt de chantier',
          fields: [
            detailField('Cause', row.cause),
            detailField('Pilote', row.pilot),
            detailField('Réalisée', row.status),
            metricDetailField('Date de suivi', row.metrics, ['le']),
            metricDetailField('Remarque', row.metrics, ['remarque']),
          ],
        },
      ]
      break
    case 'suggestion-register':
      preset.summaryMeta = [
        { label: 'Auteur', value: row.person },
        { label: 'Date', value: formatDateShort(row.event_date) },
        { label: 'Échéance', value: formatDateShort(row.closed_date) },
      ]
      preset.contextSections = [
        {
          title: 'Suggestion',
          fields: [
            detailField('Proposition', row.title),
            detailField('Action', row.action_label || row.corrective_action),
            detailField('Échéance', formatDateShort(row.closed_date)),
          ],
        },
      ]
      preset.textSections = [{ label: 'Observations', value: row.description }]
      preset.showConvert = true
      break
    case 'indicator-quarterly':
      preset.summaryMeta = [
        { label: 'Responsable', value: row.person || row.title },
        { label: 'Agence', value: row.agency },
        { label: 'Total', value: metricDisplay(indicatorTotal(row)) },
      ]
      preset.identityFields = [
        detailField('Onglet source', sheetLabel(row.sheet_name)),
        detailField('Agence', row.agency),
        detailField('Entité', row.entity),
        metricDetailField('Fonction', row.metrics, ['fonction', 'poste']),
        detailField('Responsable', row.person || row.title),
      ]
      preset.temporalFields = [detailField('Année', String(row.source_year))]
      preset.contextSections = [
        {
          title: 'Synthèse',
          fields: [
            detailField('Total', metricDisplay(indicatorTotal(row))),
            metricDetailField('Objectif année', row.metrics, ['objectif annee']),
            metricDetailField('Ratio', row.metrics, ['1 4h']),
          ],
        },
        {
          title: 'Trimestres',
          fields: metricHalfFields(row.metrics, QUARTER_COLUMNS),
        },
      ]
      break
    case 'indicator-daily':
      preset.summaryMeta = [
        { label: 'Responsable', value: row.person || row.title },
        { label: 'Agence', value: row.agency },
        { label: 'Jours actifs', value: metricDisplay(activeMetricDays(row.metrics)) },
      ]
      preset.identityFields = [
        detailField('Onglet source', sheetLabel(row.sheet_name)),
        detailField('Agence', row.agency),
        detailField('Entité', row.entity),
        metricDetailField('Fonction', row.metrics, ['fonction', 'poste']),
        detailField('Responsable', row.person || row.title),
      ]
      preset.temporalFields = [detailField('Année', String(row.source_year))]
      preset.contextSections = [
        {
          title: 'Synthèse',
          fields: [
            detailField('Jours actifs', metricDisplay(activeMetricDays(row.metrics))),
            metricDetailField('Jours travaillés', row.metrics, ['nb jours travailles']),
            metricDetailField('Indicateur', row.metrics, ['5pm', 'eveil musculaire', 'eveil', 'visite qsse']),
            metricDetailField('%', row.metrics, ['%']),
          ],
        },
      ]
      break
    case 'indicator-monthly':
      preset.summaryMeta = [
        { label: 'Responsable', value: row.person || row.title },
        { label: 'Agence', value: row.agency },
        { label: 'Total', value: metricDisplay(indicatorTotal(row)) },
      ]
      preset.identityFields = [
        detailField('Onglet source', sheetLabel(row.sheet_name)),
        detailField('Agence', row.agency),
        detailField('Entité', row.entity),
        metricDetailField('Fonction', row.metrics, ['fonction', 'poste']),
        detailField('Responsable', row.person || row.title),
      ]
      preset.temporalFields = [detailField('Année', String(row.source_year))]
      preset.contextSections = [
        {
          title: 'Synthèse',
          fields: [
            detailField('Total', metricDisplay(indicatorTotal(row))),
            metricDetailField('Objectif année', row.metrics, ['objectif annee']),
            metricDetailField('Ratio / volume', row.metrics, ['remontees d\'informations', '1 4h', 'visite qsse']),
          ],
        },
        {
          title: 'Janvier → Juin',
          fields: metricHalfFields(row.metrics, MONTH_COLUMNS.slice(0, 6)),
        },
        {
          title: 'Juillet → Décembre',
          fields: metricHalfFields(row.metrics, MONTH_COLUMNS.slice(6)),
        },
      ]
      break
    default:
      preset.contextSections = [
        {
          title: 'Qualification',
          fields: [
            detailField('Statut', row.status),
            detailField('Sévérité', row.severity),
            detailField('Coût', formatMoney(row.cost)),
          ],
        },
      ]
      preset.textSections = [
        { label: 'Description', value: row.description },
        { label: 'Cause', value: row.cause },
        { label: 'Action', value: row.corrective_action || row.action_label },
      ]
      preset.showConvert = true
      break
  }

  return preset
}

function makeRefCell(row) {
  return <span className={`ref ${row.type === 'FNC' ? 'fnc' : ''}`}>{row.reference}</span>
}

function makeDocumentCell(row) {
  return <span className="truncate" title={row.document_reference || ''}>{row.document_reference || '—'}</span>
}

function buildDocumentPreviewHref(doc) {
  const params = new URLSearchParams({
    src: doc.url || '',
    name: doc.original_name || doc.stored_name || 'Document QSSE',
    embed: '1',
  })
  return `/qualite/qsse/documents/view?${params.toString()}`
}

function makeTextCell(value) {
  return <span className="truncate" title={value || ''}>{value || '—'}</span>
}

function makeAttachmentCell(row) {
  const count = Number(row.attachment_count || 0)
  return <span className={`attach-indicator ${count > 0 ? 'has' : ''}`}>{count > 0 ? count : '—'}</span>
}

function editableColumn(column, edit) {
  return { ...column, edit }
}

function columnEdit(field, options = {}) {
  return {
    mode: 'column',
    field,
    input: options.input || 'text',
    aliases: [],
    getValue: options.getValue || ((row) => row[field] ?? ''),
  }
}

function metricEdit(field, options = {}) {
  const aliases = options.aliases || [field]
  return {
    mode: 'metric',
    field,
    input: options.input || 'text',
    aliases,
    getValue: options.getValue || ((row) => metricValue(row.metrics, aliases)),
  }
}

function comparableEditValue(edit, value) {
  if (edit.input === 'date') return toDateInputValue(value)
  if (edit.input === 'number') {
    if (value == null || String(value).trim() === '') return ''
    const numeric = Number(String(value).replace(',', '.').replace(/\s+/g, ''))
    return Number.isFinite(numeric) ? String(numeric) : String(value).trim()
  }
  return String(value ?? '').trim()
}

function editableValueFromRow(row, column) {
  if (!column?.edit) return ''
  const currentValue = typeof column.edit.getValue === 'function' ? column.edit.getValue(row) : ''
  return column.edit.input === 'date' ? toDateInputValue(currentValue) : (currentValue == null ? '' : String(currentValue))
}

function parseEditedCellValue(edit, value) {
  if (edit.input === 'number') {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    const numeric = Number(raw.replace(',', '.').replace(/\s+/g, ''))
    if (!Number.isFinite(numeric)) throw new Error('Valeur numérique invalide.')
    return numeric
  }
  if (edit.input === 'date') return String(value ?? '').trim()
  return String(value ?? '').trim()
}

function rowSupportsAttachments(row) {
  return Boolean(row && row.record_kind === 'event' && ATTACHMENT_REGISTER_CODES.has(String(row.type || '').toUpperCase()))
}

function rowSupportsRexDraft(row) {
  return Boolean(row && row.record_kind === 'event' && ATTACHMENT_REGISTER_CODES.has(String(row.type || '').toUpperCase()))
}

function buildTableConfig(mode) {
  const monthlyColumns = MONTH_COLUMNS.map(([key, label]) => ({
    label,
    render: (row) => metricDisplay(row.metrics[key]),
  }))
  const quarterlyColumns = QUARTER_COLUMNS.map(([key, label]) => ({
    label,
    render: (row) => metricDisplay(row.metrics[key]),
  }))

  switch (mode) {
    case 'at':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          { label: 'Date accident', render: (row) => formatDateShort(row.event_date) },
          { label: 'Salarié', render: (row) => row.person || '—' },
          { label: 'Société', render: (row) => row.entity || '—' },
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Chantier', render: (row) => row.chantier || '—' },
          { label: 'Type', render: (row) => metricDisplay(metricValue(row.metrics, ['type d\'accident (at ou trajet)'])) },
          { label: 'Lésion', render: (row) => metricDisplay(metricValue(row.metrics, ['lesion'])) },
          { label: 'Statut', render: (row) => row.status || '—' },
          { label: 'Fin arrêt', render: (row) => formatDateShort(row.closed_date) },
        ],
      }
    case 'fnc-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          editableColumn({ label: 'Document', render: makeDocumentCell, className: 'col-document' }, columnEdit('document_reference')),
          { label: 'PJ', render: makeAttachmentCell, className: 'col-attachments' },
          editableColumn({ label: 'Agence', render: (row) => row.agency || '—' }, columnEdit('agency')),
          editableColumn({ label: 'Chantier', render: (row) => row.chantier || '—' }, columnEdit('site', { getValue: (row) => row.site || '' })),
          editableColumn({ label: 'Date saisie', render: (row) => formatDateShort(row.saisie_date) }, columnEdit('date_saisie', { input: 'date', getValue: (row) => row.saisie_date })),
          editableColumn({ label: 'Clôture', render: (row) => formatDateShort(row.closed_date) }, columnEdit('date_closed', { input: 'date', getValue: (row) => row.closed_date })),
          editableColumn({ label: 'Type NC', render: (row) => metricDisplay(metricValue(row.metrics, TYPE_NC_KEYS)) }, metricEdit('type de nc', { aliases: TYPE_NC_KEYS })),
          editableColumn({ label: 'Sujet', render: (row) => makeTextCell(row.title), className: 'col-subject' }, columnEdit('title')),
          editableColumn({ label: 'Interne / externe', render: (row) => metricDisplay(metricValue(row.metrics, INTERNAL_EXTERNAL_KEYS)) }, metricEdit('interne externe', { aliases: INTERNAL_EXTERNAL_KEYS })),
          editableColumn({ label: 'Rédacteur', render: (row) => row.person || '—' }, columnEdit('person')),
          editableColumn({ label: 'Coût', render: (row) => formatMoney(row.cost), className: 'num-right' }, columnEdit('amount_value', { input: 'number', getValue: (row) => row.cost })),
        ],
      }
    case 'fae-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          editableColumn({ label: 'Document', render: makeDocumentCell, className: 'col-document' }, columnEdit('document_reference')),
          { label: 'PJ', render: makeAttachmentCell, className: 'col-attachments' },
          editableColumn({ label: 'Agence', render: (row) => row.agency || '—' }, columnEdit('agency')),
          editableColumn({ label: 'Chantier', render: (row) => row.chantier || '—' }, columnEdit('site', { getValue: (row) => row.site || '' })),
          editableColumn({ label: 'Date saisie', render: (row) => formatDateShort(row.saisie_date) }, columnEdit('date_saisie', { input: 'date', getValue: (row) => row.saisie_date })),
          editableColumn({ label: 'Clôture', render: (row) => formatDateShort(row.closed_date) }, columnEdit('date_closed', { input: 'date', getValue: (row) => row.closed_date })),
          editableColumn({ label: 'Thème', render: (row) => row.theme || '—' }, columnEdit('theme')),
          editableColumn({ label: 'Sujet', render: (row) => makeTextCell(row.title), className: 'col-subject' }, columnEdit('title')),
          editableColumn({ label: 'Cause', render: (row) => row.cause || '—' }, columnEdit('cause')),
          editableColumn({ label: 'Traitement', render: (row) => row.treatment || '—' }, columnEdit('treatment')),
          editableColumn({ label: 'Rédacteur', render: (row) => row.person || '—' }, columnEdit('person')),
          editableColumn({ label: 'Coût', render: (row) => formatMoney(row.cost), className: 'num-right' }, columnEdit('amount_value', { input: 'number', getValue: (row) => row.cost })),
        ],
      }
    case 'bp-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          editableColumn({ label: 'Document', render: makeDocumentCell, className: 'col-document' }, columnEdit('document_reference')),
          { label: 'PJ', render: makeAttachmentCell, className: 'col-attachments' },
          editableColumn({ label: 'Agence', render: (row) => row.agency || '—' }, columnEdit('agency')),
          editableColumn({ label: 'Chantier', render: (row) => row.chantier || '—' }, columnEdit('site', { getValue: (row) => row.site || '' })),
          editableColumn({ label: 'Date saisie', render: (row) => formatDateShort(row.saisie_date) }, columnEdit('date_saisie', { input: 'date', getValue: (row) => row.saisie_date })),
          editableColumn({ label: 'Sujet', render: (row) => makeTextCell(row.title), className: 'col-subject' }, columnEdit('title')),
          editableColumn({ label: 'Détails', render: (row) => metricDisplay(metricValue(row.metrics, ['details'])) }, metricEdit('details')),
          editableColumn({ label: 'Rédacteur', render: (row) => row.person || '—' }, columnEdit('person')),
          editableColumn({ label: 'Coût', render: (row) => formatMoney(row.cost), className: 'num-right' }, columnEdit('amount_value', { input: 'number', getValue: (row) => row.cost })),
        ],
      }
    case 'network-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          { label: 'Date', render: (row) => formatDateShort(row.event_date) },
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Chantier', render: (row) => row.chantier || '—' },
          { label: 'Type réseau', render: (row) => metricDisplay(metricValue(row.metrics, ['type de reseau'])) },
          { label: 'Sujet', render: (row) => row.title || '—' },
          { label: 'Traitement', render: (row) => row.treatment || '—' },
          { label: 'Responsable', render: (row) => metricDisplay(metricValue(row.metrics, ['responsable de la casse (nge resp. projet exploitant reseau)'])) },
          { label: 'Coût', render: (row) => formatMoney(row.cost), className: 'num-right' },
        ],
      }
    case 'pasd-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          editableColumn({ label: 'Document', render: makeDocumentCell, className: 'col-document' }, columnEdit('document_reference')),
          { label: 'PJ', render: makeAttachmentCell, className: 'col-attachments' },
          editableColumn({ label: 'Date', render: (row) => formatDateShort(row.event_date) }, columnEdit('date_event', { input: 'date', getValue: (row) => row.event_date })),
          editableColumn({ label: 'Agence', render: (row) => row.agency || '—' }, columnEdit('agency')),
          editableColumn({ label: 'Chantier', render: (row) => row.chantier || '—' }, columnEdit('site', { getValue: (row) => row.site || '' })),
          editableColumn({ label: 'PA / SD', render: (row) => metricDisplay(metricValue(row.metrics, ['pa sd'])) }, metricEdit('pa sd')),
          editableColumn({ label: 'HPG', render: (row) => metricDisplay(metricValue(row.metrics, ['hpg'])) }, metricEdit('hpg')),
          editableColumn({ label: 'Sujet', render: (row) => makeTextCell(row.title), className: 'col-subject' }, columnEdit('title')),
          editableColumn({ label: 'Rédacteur', render: (row) => row.person || '—' }, columnEdit('person')),
          editableColumn({ label: 'Score', render: (row) => metricDisplay(metricValue(row.metrics, ['total'])) }, metricEdit('total')),
        ],
      }
    case 'action-plan':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          { label: 'Date', render: (row) => formatDateShort(row.event_date) },
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Chantier', render: (row) => row.chantier || '—' },
          { label: 'Origine', render: (row) => row.cause || '—' },
          { label: 'Thème', render: (row) => row.theme || '—' },
          { label: 'Constat', render: (row) => row.title || '—' },
          { label: 'Action définie', render: (row) => row.action_label || row.corrective_action || '—' },
          { label: 'Pilote', render: (row) => row.pilot || '—' },
          { label: 'Échéance', render: (row) => formatDateShort(row.closed_date) },
          { label: 'Statut', render: (row) => row.status || '—' },
        ],
      }
    case 'tests-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          { label: 'Date', render: (row) => formatDateShort(row.event_date) },
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Chantier', render: (row) => row.chantier || '—' },
          { label: 'Préventeur', render: (row) => row.person || '—' },
          { label: 'Tests négatifs', render: (row) => metricDisplay(metricValue(row.metrics, ['nombre de tests negatifs'])) },
          { label: 'Tests positifs', render: (row) => metricDisplay(metricValue(row.metrics, ['nombre de tests positifs'])) },
          { label: 'Commentaire', render: (row) => metricDisplay(metricValue(row.metrics, ['commentaire'])) },
          { label: 'Détail actions', render: (row) => metricDisplay(metricValue(row.metrics, ['detail noms et actions'])) },
        ],
      }
    case 'rv-register':
    case 'epi-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          { label: 'Date', render: (row) => formatDateShort(row.event_date) },
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Chantier', render: (row) => row.chantier || '—' },
          { label: 'Personnel', render: (row) => row.person || '—' },
          { label: 'Constat', render: (row) => row.title || '—' },
          { label: 'Action', render: (row) => row.action_label || row.corrective_action || '—' },
          { label: 'Pilote', render: (row) => row.pilot || '—' },
          { label: 'Réalisée', render: (row) => row.status || '—' },
          { label: 'Remarque', render: (row) => metricDisplay(metricValue(row.metrics, ['remarque'])) },
        ],
      }
    case 'work-stop-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          { label: 'Date', render: (row) => formatDateShort(row.event_date) },
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Chantier', render: (row) => row.chantier || '—' },
          { label: 'Cause', render: (row) => row.cause || '—' },
          { label: 'Pilote', render: (row) => row.pilot || '—' },
          { label: 'Réalisée', render: (row) => row.status || '—' },
          { label: 'Remarque', render: (row) => metricDisplay(metricValue(row.metrics, ['remarque'])) },
        ],
      }
    case 'suggestion-register':
      return {
        columns: [
          { label: 'Référence', render: makeRefCell },
          { label: 'Date', render: (row) => formatDateShort(row.event_date) },
          { label: 'Auteur', render: (row) => row.person || '—' },
          { label: 'Proposition', render: (row) => row.title || '—' },
          { label: 'Action', render: (row) => row.action_label || row.corrective_action || row.treatment || '—' },
          { label: 'Délais', render: (row) => formatDateShort(row.closed_date) },
          { label: 'Observations', render: (row) => row.description || '—' },
        ],
      }
    case 'indicator-quarterly':
      return {
        columns: [
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Entité', render: (row) => row.entity || '—' },
          { label: 'Fonction', render: (row) => metricDisplay(metricValue(row.metrics, ['fonction', 'poste'])) },
          { label: 'Responsable', render: (row) => row.person || row.title || '—' },
          ...quarterlyColumns,
          { label: 'Total', render: (row) => metricDisplay(metricValue(row.metrics, ['nbr de 1 4 heure']) || metricTotal(row.metrics, QUARTER_COLUMNS.map(([key]) => key))) },
          { label: 'Objectif', render: (row) => metricDisplay(metricValue(row.metrics, ['objectif annee'])) },
          { label: 'Ratio', render: (row) => metricDisplay(metricValue(row.metrics, ['1 4h'])) },
        ],
      }
    case 'indicator-daily':
      return {
        columns: [
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Entité', render: (row) => row.entity || '—' },
          { label: 'Fonction', render: (row) => metricDisplay(metricValue(row.metrics, ['fonction', 'poste'])) },
          { label: 'Responsable', render: (row) => row.person || row.title || '—' },
          { label: 'Jours actifs', render: (row) => metricDisplay(activeMetricDays(row.metrics)) },
          { label: 'Jours travaillés', render: (row) => metricDisplay(metricValue(row.metrics, ['nb jours travailles'])) },
          { label: 'Indicateur', render: (row) => metricDisplay(metricValue(row.metrics, ['5pm', 'eveil musculaire', 'eveil', 'visite qsse'])) },
          { label: '%', render: (row) => metricDisplay(metricValue(row.metrics, ['%'])) },
        ],
      }
    case 'indicator-monthly':
      return {
        columns: [
          { label: 'Agence', render: (row) => row.agency || '—' },
          { label: 'Entité', render: (row) => row.entity || '—' },
          { label: 'Fonction', render: (row) => metricDisplay(metricValue(row.metrics, ['fonction', 'poste'])) },
          { label: 'Responsable', render: (row) => row.person || row.title || '—' },
          ...monthlyColumns,
          {
            label: 'Total',
            render: (row) => metricDisplay(
              metricValue(row.metrics, ['nbr fiches d\'evenements', 'nbr de 1 4 heure', 'nbr de 1 4 h', 'visite qsse', 'nombre']) ||
              metricTotal(row.metrics, MONTH_COLUMNS.map(([key]) => key))
            ),
          },
          { label: 'Objectif', render: (row) => metricDisplay(metricValue(row.metrics, ['objectif annee'])) },
        ],
      }
    default:
      return {
        columns: [
          { label: 'Type', render: (row) => <span className={`badge ${badgeClass(row.type, 'register')}`}>{row.type}</span> },
          { label: 'Référence', render: makeRefCell },
          { label: 'Chantier', render: (row) => row.chantier || '—' },
          { label: 'Sujet', render: (row) => row.title || '—' },
          { label: 'Statut', render: (row) => row.status || '—' },
          { label: 'Date fait', render: (row) => formatDateShort(row.event_date) },
          { label: 'Saisie', render: (row) => formatDateShort(row.saisie_date) },
          { label: 'Clôture', render: (row) => formatDateShort(row.closed_date) },
          { label: 'Responsable', render: (row) => row.owner || '—' },
          { label: 'Coût', render: (row) => formatMoney(row.cost), className: 'num-right' },
        ],
      }
  }
}

export default function TabQSSE({
  forcedWorkspaceMode = '',
  analysisHref = '/qualite/qsse/analyse',
  registerHref = '/qualite?tab=qsse',
}) {
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const attachmentInputRef = useRef(null)
  const analysisPptInputRef = useRef(null)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()))
  const [sheetFilter, setSheetFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [workspaceMode, setWorkspaceMode] = useState(forcedWorkspaceMode || 'register')
  const [view, setView] = useState('table')
  const [hideBacklog, setHideBacklog] = useState(false)
  const [selectedUid, setSelectedUid] = useState('')
  const [detailOpen, setDetailOpen] = useState(true)
  const [detailWidth, setDetailWidth] = useState(500)
  const [sortState, setSortState] = useState(null)
  const [analysisTypeFilter, setAnalysisTypeFilter] = useState('ALL')
  const [attachmentDrag, setAttachmentDrag] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const [rexDraftError, setRexDraftError] = useState('')
  const [refreshLiveNotice, setRefreshLiveNotice] = useState(null)
  const [analysisPptDrag, setAnalysisPptDrag] = useState(false)
  const [analysisPptError, setAnalysisPptError] = useState('')
  const [editingCell, setEditingCell] = useState(null)
  const [editingCellValue, setEditingCellValue] = useState('')
  const [tableEditError, setTableEditError] = useState('')
  const detailWidthRef = useRef(500)
  const resizerRef = useRef(null)
  const detailRef = useRef(null)
  const effectiveWorkspaceMode = forcedWorkspaceMode || workspaceMode
  const includeHistoricalBacklog = !hideBacklog

  const { data: recordsResp = {} } = useQuery({
    queryKey: ['qsse-records', yearFilter, search],
    queryFn: () => {
      const params = { limit: 5000 }
      if (yearFilter !== 'ALL') params.year = Number(yearFilter)
      if (search.trim()) params.search = search.trim()
      return qualiteApi.qsse.records(params)
    },
  })

  const backlogReferenceYear = useMemo(() => {
    if (yearFilter !== 'ALL') return Number(yearFilter)
    const sourceYears = (recordsResp.items || []).map((item) => Number(item?.source_year || 0))
    const maxSourceYear = sourceYears.length ? Math.max(...sourceYears) : 0
    return Math.max(new Date().getFullYear(), maxSourceYear || 0)
  }, [recordsResp.items, yearFilter])

  const records = useMemo(
    () => (recordsResp.items || []).map((item) => toRow(item, backlogReferenceYear)),
    [recordsResp.items, backlogReferenceYear],
  )
  const sheetMeta = useMemo(() => {
    const meta = {}
    records.forEach((row) => {
      const normalized = normalizeSheetName(row.sheet_name)
      if (!normalized || meta[normalized]) return
      const mode = sheetMode(normalized, row.record_kind)
      meta[normalized] = {
        mode,
        group: sheetGroupIdFromMode(mode),
      }
    })
    return meta
  }, [records])
  const availableSheets = useMemo(() => {
    const names = new Set()
    records.forEach((row) => {
      const normalized = normalizeSheetName(row.sheet_name)
      if (normalized) names.add(normalized)
    })
    return sortSheetNames([...names])
  }, [records])
  const activeSheet = availableSheets.includes(sheetFilter) ? sheetFilter : availableSheets[0] || ''
  const availableGroups = useMemo(() => {
    return SHEET_GROUPS.filter((group) => availableSheets.some((sheet) => (sheetMeta[sheet]?.group || 'other') === group.id))
  }, [availableSheets, sheetMeta])
  const activeSheetGroup = sheetMeta[activeSheet]?.group || availableGroups[0]?.id || ''
  const activeGroupLabel = availableGroups.find((group) => group.id === activeSheetGroup)?.label || ''
  const visibleSheets = useMemo(() => {
    return availableSheets.filter((sheet) => (sheetMeta[sheet]?.group || 'other') === activeSheetGroup)
  }, [availableSheets, activeSheetGroup, sheetMeta])
  const activeMode = useMemo(() => sheetMeta[activeSheet]?.mode || sheetMode(activeSheet), [activeSheet, sheetMeta])
  const tableConfig = useMemo(() => buildTableConfig(activeMode), [activeMode])
  const tableOnlyMode = activeMode.startsWith('indicator')
  const sheetCounts = useMemo(() => {
    const counts = {}
    records.forEach((row) => {
      const normalized = normalizeSheetName(row.sheet_name)
      if (!normalized) return
      counts[normalized] = (counts[normalized] || 0) + 1
    })
    return counts
  }, [records])
  const groupCounts = useMemo(() => {
    const counts = {}
    availableSheets.forEach((sheet) => {
      const group = sheetMeta[sheet]?.group || 'other'
      counts[group] = (counts[group] || 0) + 1
    })
    return counts
  }, [availableSheets, sheetMeta])
  const analysisTypes = useMemo(() => {
    return [...new Set(records.map((row) => String(row.type || '').trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' }))
  }, [records])

  useEffect(() => {
    if (tableOnlyMode && view !== 'table') setView('table')
  }, [tableOnlyMode, view])

  useEffect(() => {
    if (effectiveWorkspaceMode !== 'register' && view !== 'table') setView('table')
  }, [effectiveWorkspaceMode, view])

  useEffect(() => {
    if (forcedWorkspaceMode && workspaceMode !== forcedWorkspaceMode) {
      setWorkspaceMode(forcedWorkspaceMode)
    }
  }, [forcedWorkspaceMode, workspaceMode])

  useEffect(() => {
    setSortState(null)
  }, [activeSheet, activeMode])

  useEffect(() => {
    if (analysisTypeFilter !== 'ALL' && !analysisTypes.includes(analysisTypeFilter)) {
      setAnalysisTypeFilter('ALL')
    }
  }, [analysisTypeFilter, analysisTypes])

  const searchTerm = search.trim()

  const rows = useMemo(() => {
    return records.filter((row) => {
      if (activeSheet && normalizeSheetName(row.sheet_name) !== activeSheet) return false
      if (hideBacklog && row.is_backlog) return false

      if (!matchesStatusFilter(row, statusFilter)) return false

      return matchesSearch(row, searchTerm)
    })
  }, [records, yearFilter, activeSheet, hideBacklog, statusFilter, searchTerm])

  const analysisRows = useMemo(() => {
    return records.filter((row) => {
      if (hideBacklog && row.is_backlog) return false
      if (analysisTypeFilter !== 'ALL' && String(row.type || '').trim() !== analysisTypeFilter) return false
      if (!matchesStatusFilter(row, statusFilter)) return false

      return matchesSearch(row, searchTerm)
    })
  }, [records, yearFilter, hideBacklog, analysisTypeFilter, statusFilter, searchTerm])

  const displayRows = useMemo(() => {
    if (!sortState?.column) return rows
    const column = tableConfig.columns.find((entry) => entry.label === sortState.column)
    if (!column) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(sortValueForColumn(column, left), sortValueForColumn(column, right))
      return sortState.direction === 'desc' ? -result : result
    })
  }, [rows, sortState, tableConfig])

  useEffect(() => {
    if (!displayRows.length) {
      setSelectedUid('')
      return
    }
    if (!selectedUid || !displayRows.some((r) => r.uid === selectedUid)) {
      setSelectedUid(displayRows[0].uid)
      setDetailOpen(true)
    }
  }, [displayRows, selectedUid])

  const selected = useMemo(() => displayRows.find((r) => r.uid === selectedUid) || null, [displayRows, selectedUid])
  const selectedDetail = useMemo(() => (selected ? buildDetailPreset(selected) : null), [selected])
  const selectedSupportsAttachments = rowSupportsAttachments(selected)
  const selectedSupportsRexDraft = rowSupportsRexDraft(selected)
  const analysisYear = yearFilter !== 'ALL' ? Number(yearFilter) : undefined
  const selectedRecordId = selected ? Number(selected.uid) : 0
  const selectedAttachmentLabel = String(selected?.type || 'QSSE').trim() || 'QSSE'
  const attachmentQuery = useQuery({
    queryKey: ['qsse-documents', selectedRecordId],
    enabled: Boolean(selectedSupportsAttachments && selectedRecordId),
    queryFn: () => qualiteApi.qsse.documents(selectedRecordId),
  })
  const rexDraftQuery = useQuery({
    queryKey: ['qsse-rex-draft', selectedRecordId],
    enabled: Boolean(selectedSupportsRexDraft && selectedRecordId),
    queryFn: () => qualiteApi.qsse.rexDraft(selectedRecordId),
  })
  const fncAnalysisPresentationQuery = useQuery({
    queryKey: ['qsse-fnc-analysis-presentations', analysisYear ?? 'ALL'],
    enabled: effectiveWorkspaceMode === 'analysis',
    queryFn: () => qualiteApi.qsse.fncAnalysisPresentations(analysisYear ? { year: analysisYear } : {}),
  })
  const attachmentDocs = selectedSupportsAttachments ? (attachmentQuery.data?.documents || []) : []
  const selectedAttachmentCount = selectedSupportsAttachments
    ? (attachmentQuery.data ? attachmentDocs.length : Number(selected?.attachment_count || 0))
    : Number(selected?.attachment_count || 0)
  const rexDraftEntry = selectedSupportsRexDraft ? (rexDraftQuery.data?.draft || null) : null
  const rexDraftData = rexDraftEntry?.draft || null
  const fncAnalysisPresentations = fncAnalysisPresentationQuery.data?.documents || []

  const uploadAttachmentMutation = useMutation({
    mutationFn: ({ recordId, file }) => qualiteApi.qsse.uploadDocument(recordId, file),
    onSuccess: (_data, variables) => {
      setAttachmentError('')
      queryClient.invalidateQueries({ queryKey: ['qsse-documents', variables.recordId] })
      queryClient.invalidateQueries({ queryKey: ['qsse-records'] })
    },
    onError: (error) => {
      setAttachmentError(error.message || 'Impossible de charger ce fichier.')
    },
  })

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({ documentId }) => qualiteApi.qsse.deleteDocument(documentId),
    onSuccess: (_data, variables) => {
      setAttachmentError('')
      queryClient.invalidateQueries({ queryKey: ['qsse-documents', variables.recordId] })
      queryClient.invalidateQueries({ queryKey: ['qsse-records'] })
    },
    onError: (error) => {
      setAttachmentError(error.message || 'Suppression impossible.')
    },
  })

  const generateRexDraftMutation = useMutation({
    mutationFn: ({ recordId }) => qualiteApi.qsse.generateRexDraft(recordId),
    onSuccess: (_data, variables) => {
      setRexDraftError('')
      queryClient.invalidateQueries({ queryKey: ['qsse-rex-draft', variables.recordId] })
    },
    onError: (error) => {
      setRexDraftError(error.message || 'Generation du draft REX impossible.')
    },
  })

  const uploadFncAnalysisPresentationMutation = useMutation({
    mutationFn: ({ file, year }) => {
      const params = year ? { year } : {}
      return qualiteApi.qsse.uploadFncAnalysisPresentation(file, params)
    },
    onSuccess: (_data, variables) => {
      setAnalysisPptError('')
      queryClient.invalidateQueries({ queryKey: ['qsse-fnc-analysis-presentations', variables.year || 'ALL'] })
    },
    onError: (error) => {
      setAnalysisPptError(error.message || 'Import PPTX impossible.')
    },
  })

  const deleteFncAnalysisPresentationMutation = useMutation({
    mutationFn: ({ documentId }) => qualiteApi.qsse.deleteFncAnalysisPresentation(documentId),
    onSuccess: () => {
      setAnalysisPptError('')
      queryClient.invalidateQueries({ queryKey: ['qsse-fnc-analysis-presentations', analysisYear || 'ALL'] })
    },
    onError: (error) => {
      setAnalysisPptError(error.message || 'Suppression PPTX impossible.')
    },
  })

  const generateFncAnalysisPresentationMutation = useMutation({
    mutationFn: ({ year }) => {
      const params = year ? { year } : {}
      return qualiteApi.qsse.generateFncAnalysisPresentation(params)
    },
    onSuccess: (_data, variables) => {
      setAnalysisPptError('')
      queryClient.invalidateQueries({ queryKey: ['qsse-fnc-analysis-presentations', variables.year || 'ALL'] })
    },
    onError: (error) => {
      setAnalysisPptError(error.message || 'Génération PPTX impossible.')
    },
  })

  const updateCellMutation = useMutation({
    mutationFn: ({ recordId, payload }) => qualiteApi.qsse.updateCell(recordId, payload),
    onSuccess: (_data, variables) => {
      setTableEditError('')
      queryClient.invalidateQueries({ queryKey: ['qsse-records'] })
      queryClient.invalidateQueries({ queryKey: ['qsse-rex-draft', variables.recordId] })
    },
    onError: (error) => {
      setTableEditError(error.message || 'Mise a jour de la cellule impossible.')
    },
  })

  const refreshLiveMutation = useMutation({
    mutationFn: () => qualiteApi.qsse.refreshLive(true),
    onSuccess: (payload) => {
      const inserted = Number(payload?.result?.inserted_count || 0)
      setRefreshLiveNotice({
        type: 'success',
        text: `Actualisation 2026 terminée: ${inserted} ligne${inserted > 1 ? 's' : ''} reimportée${inserted > 1 ? 's' : ''}.`,
      })
      queryClient.invalidateQueries({ queryKey: ['qsse-records'] })
      queryClient.invalidateQueries({ queryKey: ['qsse-analysis-stats'] })
    },
    onError: (error) => {
      setRefreshLiveNotice({
        type: 'error',
        text: error?.message || 'Impossible d\'actualiser la source 2026.',
      })
    },
  })

  const handleAttachmentFile = (file) => {
    if (!file || !selectedRecordId || !selectedSupportsAttachments) return
    if (!isPdfFile(file)) {
      setAttachmentError('Seuls les fichiers PDF sont acceptés. Convertissez le document avant le glisser-déposer.')
      setAttachmentDrag(false)
      return
    }
    setAttachmentError('')
    setAttachmentDrag(false)
    uploadAttachmentMutation.mutate({ recordId: selectedRecordId, file })
  }

  const handleAnalysisPptFile = (file) => {
    if (!file) return
    if (!isPptxFile(file)) {
      setAnalysisPptError('Seuls les fichiers PPTX sont acceptés pour l\'analyse globale FNC.')
      setAnalysisPptDrag(false)
      return
    }
    setAnalysisPptError('')
    setAnalysisPptDrag(false)
    uploadFncAnalysisPresentationMutation.mutate({ file, year: analysisYear })
  }

  const cancelCellEdit = () => {
    setEditingCell(null)
    setEditingCellValue('')
  }

  const startEditCell = (row, column) => {
    if (!column?.edit || updateCellMutation.isPending) return
    setTableEditError('')
    setEditingCell({ uid: row.uid, column: column.label })
    setEditingCellValue(editableValueFromRow(row, column))
  }

  const saveCellEdit = () => {
    if (!editingCell) return

    const row = displayRows.find((entry) => entry.uid === editingCell.uid)
    const column = tableConfig.columns.find((entry) => entry.label === editingCell.column)
    if (!row || !column?.edit) {
      cancelCellEdit()
      return
    }

    let nextValue
    try {
      nextValue = parseEditedCellValue(column.edit, editingCellValue)
    } catch (error) {
      setTableEditError(error.message || 'Valeur invalide.')
      return
    }

    const currentValue = typeof column.edit.getValue === 'function' ? column.edit.getValue(row) : ''
    if (comparableEditValue(column.edit, currentValue) === comparableEditValue(column.edit, nextValue)) {
      cancelCellEdit()
      return
    }

    cancelCellEdit()
    updateCellMutation.mutate({
      recordId: Number(row.uid),
      payload: {
        mode: column.edit.mode,
        field: column.edit.field,
        aliases: column.edit.aliases || [],
        value: nextValue,
      },
    })
  }

  useEffect(() => {
    setAttachmentError('')
    setAttachmentDrag(false)
    setRexDraftError('')
    cancelCellEdit()
    setTableEditError('')
  }, [selectedUid])

  useEffect(() => {
    setAnalysisPptError('')
    setAnalysisPptDrag(false)
  }, [analysisYear, effectiveWorkspaceMode])

  const analysisKpis = useMemo(() => {
    const cost = analysisRows.reduce((sum, row) => sum + (row.cost || 0), 0)
    return [
      { label: 'LIGNES', value: analysisRows.length },
      { label: 'TYPES', value: distinctCount(analysisRows.map((row) => row.type)) },
      { label: 'FEUILLES', value: distinctCount(analysisRows.map((row) => normalizeSheetName(row.sheet_name))) },
      { label: 'OUVERTS', value: analysisRows.filter((row) => !row.closed_date).length },
      { label: 'CLÔTURÉS', value: analysisRows.filter((row) => row.closed_date).length },
      { label: 'AVEC COÛT', value: analysisRows.filter((row) => row.cost > 0).length },
      { label: 'COÛT DÉCLARÉ', value: formatMoney(cost) },
    ]
  }, [analysisRows])

  const analysisTypeData = useMemo(() => buildCountSeries(analysisRows, (row) => row.type || 'Sans type'), [analysisRows])
  const analysisStatusData = useMemo(() => buildCountSeries(analysisRows, (row) => row.status || 'Sans statut'), [analysisRows])
  const analysisRegisterData = useMemo(() => buildCountSeries(analysisRows, (row) => sheetLabel(row.sheet_name), 8), [analysisRows])
  const analysisOwnerData = useMemo(() => buildCountSeries(analysisRows, (row) => row.owner || 'Sans pilote'), [analysisRows])
  const analysisFamilyData = useMemo(() => buildCountSeries(analysisRows, (row) => row.family || 'Sans famille'), [analysisRows])

  const monthData = useMemo(() => {
    const arr = MONTH_COLUMNS.map(([, label], index) => ({ label, opened: 0, closed: 0, index }))
    analysisRows.forEach((row) => {
      const openedMonth = monthIndex(row.event_date)
      if (openedMonth >= 0 && openedMonth < arr.length) arr[openedMonth].opened += 1
      const closedMonth = monthIndex(row.closed_date)
      if (closedMonth >= 0 && closedMonth < arr.length) arr[closedMonth].closed += 1
    })
    return arr
  }, [analysisRows])

  const maxMonthValue = useMemo(() => {
    return Math.max(1, ...monthData.map((m) => Math.max(m.opened, m.closed)))
  }, [monthData])

  useEffect(() => {
    const resizer = resizerRef.current
    if (!resizer) return undefined

    let dragging = false
    let startX = 0
    let startWidth = 0

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

    const setVar = (px) => {
      if (rootRef.current) rootRef.current.style.setProperty('--qsse-detail-w', `${px}px`)
    }

    const onMove = (event) => {
      if (!dragging) return
      const delta = startX - event.clientX
      const maxWidth = Math.min(760, window.innerWidth - 420)
      const next = clamp(startWidth + delta, 260, maxWidth)
      detailWidthRef.current = next
      setVar(next)
    }

    const onUp = () => {
      if (!dragging) return
      dragging = false
      document.body.classList.remove('resizing-detail')
      setDetailWidth(detailWidthRef.current)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    const onDown = (event) => {
      if (!detailOpen || view !== 'table') return
      dragging = true
      startX = event.clientX
      startWidth = detailWidthRef.current
      document.body.classList.add('resizing-detail')
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      event.preventDefault()
    }

    const onDblClick = () => {
      detailWidthRef.current = 500
      setVar(500)
      setDetailWidth(500)
    }

    resizer.addEventListener('mousedown', onDown)
    resizer.addEventListener('dblclick', onDblClick)

    return () => {
      resizer.removeEventListener('mousedown', onDown)
      resizer.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [detailOpen, view])

  return (
    <div ref={rootRef} className="qsse-page">
      <section className="qsse-left">
        <div className="qsse-toolbar">
          <input
            className="field search"
            placeholder="Référence, chantier, titre, responsable..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select className="select" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="ALL">Toutes années</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Tous statuts</option>
            <option value="OPEN">Ouverts / en cours</option>
            <option value="BACKLOG">Backlog</option>
            <option value="REX">A valoriser REX</option>
            <option value="LATE">En retard</option>
          </select>

          {!forcedWorkspaceMode && (
            <div className="segmented">
              <button className={effectiveWorkspaceMode === 'register' ? 'active' : ''} onClick={() => setWorkspaceMode('register')}>Registre</button>
              <button className={effectiveWorkspaceMode === 'analysis' ? 'active' : ''} onClick={() => setWorkspaceMode('analysis')}>Analyse QSSE</button>
            </div>
          )}

          {effectiveWorkspaceMode === 'register' && (
            <div className="segmented">
            <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>Registre</button>
            <button className={view === 'actions' ? 'active' : ''} onClick={() => setView('actions')} disabled={tableOnlyMode}>Actions</button>
            <button className={view === 'rex' ? 'active' : ''} onClick={() => setView('rex')} disabled={tableOnlyMode}>REX</button>
            </div>
          )}

          <button
            className={`btn ${includeHistoricalBacklog ? 'amber' : 'green'}`}
            onClick={() => setHideBacklog((v) => !v)}
          >
            {includeHistoricalBacklog ? 'Masquer backlog historique' : 'Afficher backlog historique'}
          </button>

          {effectiveWorkspaceMode === 'analysis' && (
            <select className="select" value={analysisTypeFilter} onChange={(e) => setAnalysisTypeFilter(e.target.value)}>
              <option value="ALL">Tous types</option>
              {analysisTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          )}

          {forcedWorkspaceMode === 'register' && (
            <button type="button" className="btn" onClick={() => navigate(analysisHref)}>
              Ouvrir analyse QSSE
            </button>
          )}

          {forcedWorkspaceMode === 'analysis' && (
            <button type="button" className="btn" onClick={() => navigate(registerHref)}>
              Retour registre QSSE
            </button>
          )}

          <button
            type="button"
            className="btn"
            onClick={() => {
              setRefreshLiveNotice(null)
              refreshLiveMutation.mutate()
            }}
            disabled={refreshLiveMutation.isPending}
          >
            {refreshLiveMutation.isPending ? 'Actualisation…' : 'Actualiser source 2026'}
          </button>

          <div className="toolbar-right">
            <span className="toolbar-count">
              {effectiveWorkspaceMode === 'analysis'
                ? `${analysisRows.length} ligne${analysisRows.length > 1 ? 's' : ''} analysée${analysisRows.length > 1 ? 's' : ''}`
                : `${rows.length} événement${rows.length > 1 ? 's' : ''}`}
            </span>
            {effectiveWorkspaceMode === 'register' && <button className="btn primary">+ Nouvelle remontée</button>}
          </div>
        </div>

        {refreshLiveNotice && (
          <div className={`qsse-refresh-notice ${refreshLiveNotice.type === 'error' ? 'error' : 'success'}`}>
            {refreshLiveNotice.text}
          </div>
        )}

        {effectiveWorkspaceMode === 'register' ? (
          <>
        <div className="sheet-groups" role="tablist" aria-label="Familles QSSE">
          {availableGroups.map((group) => (
            <button
              key={group.id}
              role="tab"
              className={`sheet-group ${group.id === activeSheetGroup ? 'active' : ''}`}
              aria-selected={group.id === activeSheetGroup}
              onClick={() => {
                const nextSheet = availableSheets.find((sheet) => (sheetMeta[sheet]?.group || 'other') === group.id)
                if (nextSheet) setSheetFilter(nextSheet)
              }}
            >
              <span>{group.label}</span>
              <span className="sheet-group-count">{groupCounts[group.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="sheet-tabs" role="tablist" aria-label={`Feuilles ${activeGroupLabel || 'QSSE'}`}>
          {visibleSheets.map((sheet) => (
            <button
              key={sheet}
              role="tab"
              className={`sheet-tab ${sheet === activeSheet ? 'active' : ''}`}
              aria-selected={sheet === activeSheet}
              onClick={() => setSheetFilter(sheet)}
            >
              <span>{sheetLabel(sheet)}</span>
              <span className="sheet-tab-count">{sheetCounts[sheet] || 0}</span>
            </button>
          ))}
        </div>

        <div className="sheet-note">
          <div className="sheet-note-text">
            <strong>{sheetLabel(activeSheet) || 'Feuille QSSE'}</strong>
            <span>{activeGroupLabel ? `${activeGroupLabel} - ${sheetDescription(activeMode)}` : sheetDescription(activeMode)}</span>
            {!tableOnlyMode && view === 'table' && <span>Double-cliquer une cellule pour corriger une valeur.</span>}
          </div>
        </div>

        {tableEditError && <div className="fnc-upload-error table-edit-error">{tableEditError}</div>}

        <div className={`table-wrap ${view !== 'table' ? 'hidden' : ''}`}>
          <table>
            <thead>
              <tr>
                {tableConfig.columns.map((column) => (
                  <th key={column.label} className={column.className || ''}>
                    <button
                      type="button"
                      className={`table-sort ${sortState?.column === column.label ? 'active' : ''}`}
                      onClick={() => {
                        setSortState((current) => {
                          if (!current || current.column !== column.label) {
                            return { column: column.label, direction: 'asc' }
                          }
                          if (current.direction === 'asc') {
                            return { column: column.label, direction: 'desc' }
                          }
                          return null
                        })
                      }}
                    >
                      <span>{column.label}</span>
                      <span className="table-sort-indicator">
                        {sortState?.column === column.label
                          ? (sortState.direction === 'asc' ? '▲' : '▼')
                          : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!displayRows.length && (
                <tr>
                  <td colSpan={tableConfig.columns.length} className="empty">Aucune ligne exploitable pour cette feuille</td>
                </tr>
              )}
              {displayRows.map((row) => (
                <tr
                  key={row.uid}
                  onClick={() => {
                    setSelectedUid(row.uid)
                    setDetailOpen(true)
                  }}
                  className={`${row.uid === selectedUid ? 'selected' : ''} ${row.is_late ? 'late' : ''}`}
                >
                  {tableConfig.columns.map((column) => {
                    const isEditable = Boolean(column.edit)
                    const isEditing = editingCell?.uid === row.uid && editingCell?.column === column.label

                    return (
                      <td
                        key={`${row.uid}-${column.label}`}
                        className={`${column.className || ''} ${isEditable ? 'editable-cell' : ''} ${isEditing ? 'is-editing' : ''}`.trim()}
                        onDoubleClick={(event) => {
                          if (!isEditable) return
                          event.stopPropagation()
                          startEditCell(row, column)
                        }}
                        title={isEditable ? 'Double-cliquer pour modifier' : undefined}
                      >
                        {isEditing ? (
                          <input
                            className="table-edit-input"
                            type={column.edit.input === 'date' ? 'date' : column.edit.input === 'number' ? 'number' : 'text'}
                            step={column.edit.input === 'number' ? 'any' : undefined}
                            value={editingCellValue}
                            onChange={(event) => setEditingCellValue(event.target.value)}
                            onClick={(event) => event.stopPropagation()}
                            onBlur={saveCellEdit}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') saveCellEdit()
                              if (event.key === 'Escape') {
                                event.preventDefault()
                                cancelCellEdit()
                              }
                            }}
                            autoFocus
                          />
                        ) : column.render(row)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`cards-view ${view === 'actions' && !tableOnlyMode ? '' : 'hidden'}`}>
          <div className="cards-grid">
            {rows.slice(0, 8).map((row) => (
              <article className="action-card" key={`act-${row.uid}`}>
                <div className="card-head">
                  <div>
                    <h3>{row.title}</h3>
                    <div className="card-muted">{row.reference} • {row.chantier}</div>
                  </div>
                  <span className={`badge ${badgeClass(row.type, 'register')}`}>{row.type}</span>
                </div>
                <div className="mini-grid">
                  <div className="mini-box"><span>Pilote</span>{row.owner}</div>
                  <div className="mini-box"><span>Statut</span>{row.status}</div>
                  <div className="mini-box"><span>Coût</span>{formatMoney(row.cost)}</div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className={`cards-view ${view === 'rex' && !tableOnlyMode ? '' : 'hidden'}`}>
          <div className="cards-grid">
            {rows.filter((r) => r.rex).slice(0, 8).map((row) => (
              <article className="rex-card" key={`rex-${row.uid}`}>
                <div className="card-head">
                  <div>
                    <h3>{row.reference}</h3>
                    <div className="card-muted">{row.title}</div>
                  </div>
                  <span className={`badge ${badgeClass(row.type, 'register')}`}>{row.type}</span>
                </div>
                <div className="rex-body">{row.rex}</div>
              </article>
            ))}
            {!rows.some((r) => r.rex) && <div className="empty">Aucun REX dans la sélection.</div>}
          </div>
        </div>
          </>
        ) : (
          <div className="analysis-scroll">
            <div className="sheet-note analysis-note">
              <div className="sheet-note-text">
                <strong>Analyse QSSE globale</strong>
                <span>Lecture transversale par type, statut, feuille, famille, mois et pilotes. Les tableaux détaillés restent dans la vue registre.</span>
              </div>
            </div>

            <div className="analysis-pptx-card hidden">
              <div className="mini-head">
                <span>Présentation FNC (PPTX)</span>
                <span>{analysisYear ? `année ${analysisYear}` : 'toutes années'}</span>
              </div>
              <div className="analysis-pptx-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => generateFncAnalysisPresentationMutation.mutate({ year: analysisYear, template_mode: 'codir' })}
                  disabled={generateFncAnalysisPresentationMutation.isPending}
                >
                  {generateFncAnalysisPresentationMutation.isPending ? 'Génération…' : 'Générer PPTX CODIR'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => generateFncAnalysisPresentationMutation.mutate({ year: analysisYear, template_mode: 'exploitation' })}
                  disabled={generateFncAnalysisPresentationMutation.isPending}
                >
                  {generateFncAnalysisPresentationMutation.isPending ? 'Génération…' : 'Générer PPTX exploitation'}
                </button>
              </div>
              <div
                className={`fnc-dropzone ${analysisPptDrag ? 'active' : ''} ${uploadFncAnalysisPresentationMutation.isPending ? 'busy' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setAnalysisPptDrag(true)
                }}
                onDragLeave={() => setAnalysisPptDrag(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setAnalysisPptDrag(false)
                  const file = event.dataTransfer?.files?.[0]
                  handleAnalysisPptFile(file)
                }}
                onClick={() => {
                  if (!uploadFncAnalysisPresentationMutation.isPending) analysisPptInputRef.current?.click()
                }}
              >
                <strong>Glisser votre PPTX d'analyse FNC ici</strong>
                <span>ou cliquer pour sélectionner un fichier .pptx (max 25 Mo)</span>
                <input
                  ref={analysisPptInputRef}
                  type="file"
                  accept=".pptx"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    handleAnalysisPptFile(file)
                  }}
                  hidden
                />
              </div>

              {analysisPptError && <div className="fnc-upload-error">{analysisPptError}</div>}

              <div className="fnc-doc-list">
                {!fncAnalysisPresentations.length && !fncAnalysisPresentationQuery.isLoading && (
                  <div className="empty">Aucune présentation PPTX enregistrée.</div>
                )}
                {fncAnalysisPresentations.map((doc) => (
                  <div key={doc.id} className="fnc-doc-row">
                    <div className="fnc-doc-main">
                      <strong>{doc.original_name || 'Présentation FNC'}</strong>
                      <span>{formatFileSize(doc.file_size)} • {formatDateShort(doc.created_at)}</span>
                    </div>
                    <div className="fnc-doc-actions">
                      <a className="btn" href={doc.url} target="_blank" rel="noreferrer">Ouvrir</a>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => deleteFncAnalysisPresentationMutation.mutate({ documentId: doc.id })}
                        disabled={deleteFncAnalysisPresentationMutation.isPending}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <QsseAnalysisDashboard year={analysisYear} includeBacklog={includeHistoricalBacklog} backlogYear={backlogReferenceYear} />
          </div>
        )}
      </section>

      <div ref={resizerRef} className={`detail-resizer ${effectiveWorkspaceMode === 'register' && view === 'table' && detailOpen ? '' : 'hidden'}`} title="Glisser pour redimensionner" />

      <aside ref={detailRef} className={`detail ${effectiveWorkspaceMode === 'register' && view === 'table' && detailOpen ? '' : 'hidden'}`}>
        <div className="detail-head">
          <span>Détail QSSE<small>glisser la barre à gauche pour élargir</small></span>
          <button title="Fermer" onClick={() => setDetailOpen(false)}>×</button>
        </div>

        {!selected && <div className="detail-body"><div className="empty">Aucun événement sélectionné.</div></div>}

        {selected && (
          <div className="detail-body">
            <div className="detail-summary-card">
              <div className="detail-title">
                <span className={`ref ${selected.type === 'FNC' ? 'fnc' : ''}`}>{selected.reference}</span>
                <h3>{selected.title}</h3>
              </div>
              <div className="badge-row">
                <span className={`badge ${badgeClass(selected.type, 'register')}`}>{selected.type}</span>
                {selected.is_backlog && <span className="badge backlog">{`Backlog ${selected.backlog_year}`}</span>}
                {hasDisplayValue(selected.severity) && <span className={`badge ${badgeClass(selected.severity, 'severity')}`}>{selected.severity}</span>}
                {hasDisplayValue(selected.status) && <span className={`badge ${badgeClass(selected.status, 'status')}`}>{selected.status}</span>}
                <span className="badge neutral">{sheetLabel(selected.sheet_name)}</span>
              </div>
              <div className="detail-meta-row">
                {(selectedDetail?.summaryMeta || []).map((item) => (
                  <div key={item.label} className="detail-meta"><label>{item.label}</label><span>{item.value || '—'}</span></div>
                ))}
              </div>
            </div>

            <div className="detail-grid">
              <DetailFieldSection title="Identification" fields={selectedDetail?.identityFields || []} />
              <DetailFieldSection title="Temporalité" fields={selectedDetail?.temporalFields || []} className={`detail-card ${selected.is_backlog ? 'highlight' : ''}`} />
            </div>

            {(hasDisplayValue(selected.document_reference) || selectedSupportsAttachments) && (
              <section className="detail-card">
                <div className="detail-card-title">Document / annexes</div>
                {hasDisplayValue(selected.document_reference) && <DataField label="Document / enregistrement" value={selected.document_reference} />}

                {selectedSupportsAttachments && (
                  <>
                    {!hasDisplayValue(selected.document_reference) && <DataField label="Document / enregistrement" value="—" />}
                    <div className="detail-card-title">Annexes {selectedAttachmentLabel}</div>
                  </>
                )}

                {selectedSupportsAttachments && (
                  <>
                <div
                  className={`fnc-dropzone ${attachmentDrag ? 'active' : ''} ${uploadAttachmentMutation.isPending ? 'busy' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setAttachmentDrag(true)
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setAttachmentDrag(true)
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    setAttachmentDrag(false)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const file = event.dataTransfer?.files?.[0] || null
                    handleAttachmentFile(file)
                  }}
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  <strong>{uploadAttachmentMutation.isPending ? 'Chargement en cours...' : 'Glisser un PDF ici'}</strong>
                  <span>{`Ou cliquer pour choisir un PDF a associer a cet enregistrement ${selectedAttachmentLabel}.`}</span>
                  <input
                    ref={attachmentInputRef}
                    hidden
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null
                      handleAttachmentFile(file)
                      event.target.value = ''
                    }}
                  />
                </div>

                {attachmentError && <div className="fnc-upload-error">{attachmentError}</div>}

                <div className="fnc-doc-list">
                  {attachmentQuery.isLoading && <div className="empty">Chargement des annexes...</div>}
                  {!attachmentQuery.isLoading && !attachmentDocs.length && <div className="empty">Aucune annexe associee.</div>}
                  {attachmentDocs.map((doc) => (
                    <div key={doc.id} className="fnc-doc-row">
                      <div className="fnc-doc-main">
                        <strong>{doc.original_name}</strong>
                        <span>{(doc.extension || '').replace('.', '').toUpperCase() || 'DOC'} - {formatFileSize(doc.file_size)}</span>
                      </div>
                      <div className="fnc-doc-actions">
                        <a className="btn" href={buildDocumentPreviewHref(doc)} target="_blank" rel="noreferrer">Prévisualiser</a>
                        <button
                          className="btn"
                          type="button"
                          onClick={() => deleteAttachmentMutation.mutate({ documentId: doc.id, recordId: selectedRecordId })}
                          disabled={deleteAttachmentMutation.isPending}
                        >
                          Suppr.
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                  </>
                )}
              </section>
            )}

            {(selectedDetail?.chips || []).length > 0 && (
              <section className="detail-card warning">
                <div className="detail-card-title">Contexte de la feuille</div>
                <div className="chips">
                  {selectedDetail.chips.map((chip) => <span key={chip} className="chip">{chip}</span>)}
                </div>
              </section>
            )}

            {(selectedDetail?.contextSections || []).map((section) => (
              <DetailFieldSection key={section.title} title={section.title} fields={section.fields} className={section.className || 'detail-card'} />
            ))}

            {(selectedDetail?.textSections || []).map((section) => (
              <DetailTextSection key={section.label} label={section.label} value={section.value} />
            ))}

            {selectedSupportsRexDraft && (
              <section className="detail-card">
                <div className="rex-assist-toolbar">
                  <div>
                    <div className="detail-card-title">REX assiste</div>
                    <div className="rex-assist-note">Brouillon structure a partir des champs QSSE et des documents associes.</div>
                  </div>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => generateRexDraftMutation.mutate({ recordId: selectedRecordId })}
                    disabled={generateRexDraftMutation.isPending}
                  >
                    {generateRexDraftMutation.isPending ? 'Generation...' : rexDraftEntry ? 'Regenerer draft' : 'Generer draft'}
                  </button>
                </div>

                {rexDraftEntry && (
                  <div className="rex-draft-meta">
                    <DataField label="Confiance" value={`${Number(rexDraftEntry.confidence_score || 0)}%`} />
                    <DataField label="Genere le" value={formatDateShort(rexDraftEntry.generated_at)} />
                    <DataField label="Statut" value={rexDraftEntry.status || 'draft'} />
                  </div>
                )}

                {rexDraftError && <div className="fnc-upload-error">{rexDraftError}</div>}

                {rexDraftQuery.isLoading && !rexDraftEntry && <div className="empty">Chargement du draft REX...</div>}
                {!rexDraftQuery.isLoading && !rexDraftEntry && !rexDraftError && <div className="empty">Aucun draft REX genere pour cet enregistrement.</div>}

                {rexDraftData && (
                  <>
                    <DataField label="Titre propose" value={rexDraftData.headline} />
                    <DetailTextSection label="Resume" value={rexDraftData.summary} />
                    <DetailTextSection label="Synthese cause racine" value={rexDraftData.root_cause_synthesis} />
                    <DetailTextSection label="Lecon apprise" value={rexDraftData.lesson_learned} />
                    <DetailTextSection label="Action preventive" value={rexDraftData.preventive_action} />
                    <DetailTextSection label="Message de diffusion" value={rexDraftData.diffusion_message} />

                    {Array.isArray(rexDraftData.target_audience) && rexDraftData.target_audience.length > 0 && (
                      <div className="rex-list-block">
                        <label>Public cible</label>
                        <div className="chips">
                          {rexDraftData.target_audience.map((item) => <span key={item} className="chip">{item}</span>)}
                        </div>
                      </div>
                    )}

                    {Array.isArray(rexDraftData.missing_information) && rexDraftData.missing_information.length > 0 && (
                      <div className="rex-list-block">
                        <label>Informations a completer</label>
                        <div className="chips">
                          {rexDraftData.missing_information.map((item) => <span key={item} className="chip">{item}</span>)}
                        </div>
                      </div>
                    )}

                    {Array.isArray(rexDraftData.evidence) && rexDraftData.evidence.length > 0 && (
                      <div className="rex-list-block">
                        <label>Elements pris en compte</label>
                        <div className="rex-evidence-list">
                          {rexDraftData.evidence.map((item) => <div key={item} className="rex-evidence-item">{item}</div>)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            {selected.rex && !rexDraftEntry && <DetailTextSection label="REX potentiel" value={selected.rex} />}

            {selectedDetail?.showConvert && (
              <section className="detail-card">
                <div className="detail-card-title">Conversion / qualification</div>
                <div className="convert-grid">
                  <button className="btn">FNC</button>
                  <button className="btn">FAE</button>
                  <button className="btn">BP</button>
                  <button className="btn">INFO</button>
                </div>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

