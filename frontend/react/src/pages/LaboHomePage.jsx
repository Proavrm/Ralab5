import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Card, { CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import Input, { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { buildLocationTarget, navigateWithReturnTo } from '@/lib/detailNavigation'
import { hasRole } from '@/lib/permissions'
import { findResponsibleLaboProfileByUser } from '@/lib/responsibleLaboProfiles'
import { findTechnicianProfileByUser, matchesTechnicianProfile } from '@/lib/technicianProfiles'
import { getPrelevementReferenceDate, normalizePrelevement, prelevementHasArrival, prelevementIsReadyForLab, prelevementIsUnexpectedArrival, prelevementNeedsReceptionCompletion } from '@/lib/prelevements'
import { cn, formatDate } from '@/lib/utils'
import { essaisApi, interventionsApi, planningApi, prelevementsApi } from '@/services/api'
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  Package,
  RefreshCw,
  Search,
  TestTube2,
  TriangleAlert,
  Truck,
  UserRound,
  Workflow,
} from 'lucide-react'

const KNOWN_LABOS = ['AUV', 'SP', 'PT', 'CLM', 'CHB']
const FINISHED_ESSAI_STATUSES = new Set(['fini', 'termine'])
const CLOSED_INTERVENTION_STATUSES = new Set(['realisee', 'annulee'])
const DAY_MS = 24 * 60 * 60 * 1000

const TONES = {
  sky: 'border-[#cfe4f6] bg-[#eef6fd] text-[#185fa5]',
  teal: 'border-[#c7e2de] bg-[#e8f4f2] text-[#14655d]',
  amber: 'border-[#ecd1a2] bg-[#fbf1e2] text-[#854f0b]',
  green: 'border-[#d4e4c1] bg-[#eef5e6] text-[#3b6d11]',
  slate: 'border-[#e4ddd3] bg-[#f4f1eb] text-[#5f5e5a]',
  red: 'border-[#efc2bf] bg-[#fdf0ef] text-[#a32d2d]',
}

const TONE_DOTS = {
  sky: 'bg-[#185fa5]',
  teal: 'bg-[#14655d]',
  amber: 'bg-[#854f0b]',
  green: 'bg-[#3b6d11]',
  slate: 'bg-[#5f5e5a]',
  red: 'bg-[#a32d2d]',
}

function toneClass(tone) {
  return TONES[tone] || TONES.slate
}

function toneDotClass(tone) {
  return TONE_DOTS[tone] || TONE_DOTS.slate
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    return normalizeText(value).includes(normalizeText(normalizedCode))
  })
}

function toDateMs(value) {
  const ms = new Date(value || '').getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function startOfDay(value = new Date()) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function dayDiffFromToday(value) {
  const target = toDateMs(value)
  if (!target) return null
  const today = startOfDay().getTime()
  const normalizedTarget = startOfDay(target).getTime()
  return Math.round((normalizedTarget - today) / DAY_MS)
}

function isSameDay(value) {
  return dayDiffFromToday(value) === 0
}

function describeSchedule(value) {
  const diff = dayDiffFromToday(value)
  if (diff === null) return 'Date a confirmer'
  if (diff === 0) return 'Aujourd hui'
  if (diff === 1) return 'Demain'
  if (diff > 1) return `Dans ${diff} j`
  if (diff === -1) return '1 j de retard'
  return `${Math.abs(diff)} j de retard`
}

function describeOpenAge(value) {
  const diff = dayDiffFromToday(value)
  if (diff === null) return 'Sans date'
  if (diff === 0) return 'Demarre aujourd hui'
  if (diff > 0) return `Demarre dans ${diff} j`
  if (diff === -1) return 'Ouvert depuis 1 j'
  return `Ouvert depuis ${Math.abs(diff)} j`
}

function pluralize(count, singular, plural) {
  return `${count} ${count > 1 ? plural : singular}`
}

function buildMeta(parts) {
  return parts.filter(Boolean).join(' - ')
}

function normalizeIntervention(row, index) {
  return {
    uid: row.uid ?? row.id ?? `intervention-${index}`,
    reference: row.reference || `Intervention #${row.uid ?? index}`,
    date: row.date_intervention || row.date || row.created_at || '',
    type: row.type_intervention || 'Intervention terrain',
    subject: row.sujet || '',
    status: row.statut || row.status || 'Planifiee',
    technicien: row.technicien || '',
    geotechnicien: row.geotechnicien || '',
    laboCode: row.labo_code || row.labo || '',
    chantier: row.chantier || row.site || '',
    demandeReference: row.demande_reference || row.demande_ref || '',
    niveauAlerte: row.niveau_alerte || '',
  }
}

function normalizeEssai(row, index) {
  return {
    uid: row.uid ?? row.id ?? `essai-${index}`,
    reference: row.reference || `Essai #${row.uid ?? index}`,
    code: row.essai_code || row.code_essai || row.type_essai || '',
    label: row.resultat_label || row.type_essai || row.designation || '',
    operator: row.operateur || '',
    status: row.statut || row.status || 'Programme',
    dateStart: row.date_debut || row.date || row.created_at || '',
    dateEnd: row.date_fin || '',
    laboCode: row.labo_code || row.labo || '',
    echantillonReference: row.echantillon_reference || row.echantillon_ref || '',
    demandeReference: row.demande_reference || row.demande_ref || '',
    chantier: row.chantier || row.site || '',
    resultLabel: row.resultat_label || '',
  }
}

function normalizePlanning(row, index) {
  return {
    uid: row.uid ?? row.id ?? `planning-${index}`,
    reference: row.ref || row.reference || `Planning #${row.uid ?? index}`,
    title: row.tit || row.title || '',
    status: row.stat || row.statut || '',
    start: row.start || row.date_debut || '',
    deadline: row.ech || row.deadline || row.echeance || '',
    urgency: String(row.urg || row.urgence || 'ok').trim().toLowerCase(),
    laboLabel: row.labo || row.labo_code || '',
  }
}

function isInterventionClosed(row) {
  return CLOSED_INTERVENTION_STATUSES.has(normalizeText(row.status))
}

function isEssaiFinished(row) {
  return !!row.dateEnd || FINISHED_ESSAI_STATUSES.has(normalizeText(row.status))
}

function planningTone(urgency) {
  if (urgency === 'late') return 'red'
  if (urgency === 'soon') return 'amber'
  if (urgency === 'done') return 'green'
  return 'sky'
}

function statusTone(status) {
  const normalized = normalizeText(status)
  if (normalized === 'en cours') return 'amber'
  if (['fini', 'termine', 'realisee'].includes(normalized)) return 'green'
  if (['planifiee', 'programme', 'recu', 'importe', 'importee'].includes(normalized)) return 'sky'
  if (['annulee', 'archivee'].includes(normalized)) return 'slate'
  return 'slate'
}

function buildWorkbenchPath(laboCode, extra = {}) {
  const params = new URLSearchParams()
  if (laboCode) params.set('labo', laboCode)
  Object.entries(extra).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const query = params.toString()
  return query ? `/labo/workbench?${query}` : '/labo/workbench'
}

function buildInterventionEntry(row, options = {}) {
  return {
    key: `intervention-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.type, row.chantier || row.subject || 'Sans contexte']),
    meta: buildMeta([
      row.date ? `${formatDate(row.date)} - ${describeSchedule(row.date)}` : 'Date a confirmer',
      row.demandeReference || row.laboCode || '',
      options.extraMeta,
    ]),
    tone: options.tone || statusTone(row.status),
    badge: options.badge || row.status,
    badgeTone: options.badgeTone || options.tone || statusTone(row.status),
    to: `/interventions/${row.uid}`,
  }
}

function buildPrelevementsPath(laboCode, extra = {}) {
  const params = new URLSearchParams()
  if (laboCode) params.set('labo', laboCode)
  Object.entries(extra).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  const query = params.toString()
  return query ? `/prelevements?${query}` : '/prelevements'
}

function buildPrelevementEntry(row, options = {}) {
  const referenceDate = getPrelevementReferenceDate(row)
  return {
    key: `prelevement-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.description || row.materiau || 'Description a preciser', row.chantier || row.demandeReference || 'Sans contexte']),
    meta: buildMeta([
      referenceDate ? `${formatDate(referenceDate)} - ${describeSchedule(referenceDate)}` : 'Sans date',
      row.demandeReference || '',
      options.extraMeta,
    ]),
    tone: options.tone || (prelevementNeedsReceptionCompletion(row) ? 'amber' : 'teal'),
    badge: options.badge || row.status,
    badgeTone: options.badgeTone || options.tone || (prelevementNeedsReceptionCompletion(row) ? 'amber' : 'teal'),
    to: `/prelevements/${row.uid}`,
  }
}

function buildEssaiEntry(row, options = {}) {
  return {
    key: `essai-${row.uid}`,
    title: row.code || row.reference,
    subtitle: buildMeta([row.echantillonReference || 'Echantillon non renseigne', row.chantier || row.demandeReference || row.label]),
    meta: buildMeta([
      row.dateStart ? `${formatDate(row.dateStart)} - ${describeOpenAge(row.dateStart)}` : 'Sans date',
      row.operator ? `Operateur ${row.operator}` : 'Operateur a confirmer',
      options.extraMeta,
    ]),
    tone: options.tone || statusTone(row.status),
    badge: options.badge || row.status,
    badgeTone: options.badgeTone || options.tone || statusTone(row.status),
    to: `/essais/${row.uid}`,
  }
}

function buildPlanningEntry(row, options = {}) {
  const referenceDate = row.deadline || row.start || ''
  return {
    key: `planning-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.title || 'Planning', row.laboLabel || row.status || '']),
    meta: buildMeta([
      referenceDate ? `${formatDate(referenceDate)} - ${describeSchedule(referenceDate)}` : 'Sans date',
      options.extraMeta,
    ]),
    tone: options.tone || planningTone(row.urgency),
    badge: options.badge || (row.urgency === 'late' ? 'Retard' : row.urgency === 'soon' ? 'Sous 7 j' : row.status || 'Planning'),
    badgeTone: options.badgeTone || options.tone || planningTone(row.urgency),
    to: '/planning',
  }
}

function buildUserMatchTerms(user) {
  const displayName = normalizeText(user?.display_name || '')
  const emailPrefix = normalizeText(String(user?.email || '').split('@')[0])
  const parts = [...new Set([displayName, emailPrefix].filter(Boolean))]

  return [...new Set(parts.flatMap((value) => [
    value,
    ...value.split(' ').filter((part) => part.length >= 3),
  ]).filter(Boolean))]
}

function matchesUserAssignment(user, values = []) {
  const haystack = normalizeText(values.filter(Boolean).join(' '))
  if (!haystack) return false

  return buildUserMatchTerms(user).some((term) => term.length >= 3 && haystack.includes(term))
}

function MetricTile({ label, value, hint, tone = 'slate', icon: Icon }) {
  return (
    <Card className="overflow-hidden">
      <CardBody className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-text">{value}</p>
          {hint ? <p className="mt-2 text-xs text-text-muted">{hint}</p> : null}
        </div>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border', toneClass(tone))}>
          <Icon size={18} />
        </div>
      </CardBody>
    </Card>
  )
}

function Badge({ text, tone = 'slate' }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', toneClass(tone))}>
      {text}
    </span>
  )
}

function EntryRow({ title, subtitle, meta, tone = 'slate', trailing, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
    >
      <div className={cn('mt-0.5 h-2.5 w-2.5 rounded-full', toneDotClass(tone))} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text">{title}</p>
        {subtitle ? <p className="mt-1 text-xs text-text-muted">{subtitle}</p> : null}
        {meta ? <p className="mt-2 text-[11px] text-text-muted">{meta}</p> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </button>
  )
}

function EmptyBlock({ label, loading }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-xs text-text-muted">
      {loading ? 'Chargement...' : label}
    </div>
  )
}

function ActionButton({ label, onClick, variant = 'secondary' }) {
  return (
    <Button variant={variant} onClick={onClick} className="justify-center">
      {label}
      <ArrowRight size={14} />
    </Button>
  )
}

function WorkstreamCard({
  title,
  description,
  countLabel,
  tone = 'slate',
  icon: Icon,
  rows,
  loading,
  emptyLabel,
  actionLabel,
  onAction,
  onRowClick,
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-bg/60">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border', toneClass(tone))}>
              <Icon size={18} />
            </div>
            <div>
              <CardTitle>{title}</CardTitle>
              <p className="mt-1 text-xs text-text-muted">{description}</p>
            </div>
          </div>
          {countLabel ? <Badge text={countLabel} tone={tone} /> : null}
        </div>
      </CardHeader>
      <CardBody className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <EmptyBlock loading={loading} label={emptyLabel} />
        ) : (
          rows.map((row) => (
            <EntryRow
              key={row.key}
              title={row.title}
              subtitle={row.subtitle}
              meta={row.meta}
              tone={row.tone || tone}
              trailing={row.badge ? <Badge text={row.badge} tone={row.badgeTone || row.tone || tone} /> : null}
              onClick={() => onRowClick(row)}
            />
          ))
        )}
        {actionLabel ? <ActionButton label={actionLabel} onClick={onAction} /> : null}
      </CardBody>
    </Card>
  )
}

function MemoCard({ title, items, actionLabel, onAction }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-bg/60">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-sm text-text-muted">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#14655d]" />
            <span>{item}</span>
          </div>
        ))}
        {actionLabel ? <ActionButton label={actionLabel} onClick={onAction} /> : null}
      </CardBody>
    </Card>
  )
}

export default function LaboHomePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const detailReturnTo = buildLocationTarget(location)

  const requestedLaboCode = normalizeCode(searchParams.get('labo') || '')
  const isAdmin = hasRole(user, ['admin'])
  const responsibleProfile = findResponsibleLaboProfileByUser(user)
  const technicianProfile = responsibleProfile ? null : findTechnicianProfileByUser(user)
  const serviceCode = normalizeCode(user?.service_code || user?.service || '')
  const defaultLaboCode = normalizeCode(
    responsibleProfile?.laboCode
      || technicianProfile?.defaultLaboCodes?.[0]
      || (KNOWN_LABOS.includes(serviceCode) ? serviceCode : '')
  )
  const effectiveLaboCode = isAdmin ? requestedLaboCode : defaultLaboCode
  const showResponsibleBlocks = isAdmin || !!responsibleProfile
  const showTechnicianBlocks = isAdmin || !responsibleProfile

  const interventionsQuery = useQuery({
    queryKey: ['labo-home', 'interventions'],
    queryFn: () => interventionsApi.list(),
  })

  const prelevementsQuery = useQuery({
    queryKey: ['labo-home', 'prelevements'],
    queryFn: () => prelevementsApi.list(),
  })

  const essaisQuery = useQuery({
    queryKey: ['labo-home', 'essais'],
    queryFn: () => essaisApi.list(),
  })

  const planningQuery = useQuery({
    queryKey: ['labo-home', 'planning'],
    queryFn: () => planningApi.list(),
  })

  const allInterventions = useMemo(
    () => (Array.isArray(interventionsQuery.data) ? interventionsQuery.data : []).map(normalizeIntervention),
    [interventionsQuery.data]
  )

  const allPrelevements = useMemo(
    () => (Array.isArray(prelevementsQuery.data) ? prelevementsQuery.data : []).map(normalizePrelevement),
    [prelevementsQuery.data]
  )

  const allEssais = useMemo(
    () => (Array.isArray(essaisQuery.data) ? essaisQuery.data : []).map(normalizeEssai),
    [essaisQuery.data]
  )

  const allPlanning = useMemo(
    () => (Array.isArray(planningQuery.data) ? planningQuery.data : []).map(normalizePlanning),
    [planningQuery.data]
  )

  const availableLabos = useMemo(() => {
    const discovered = [
      ...allInterventions.map((row) => row.laboCode),
      ...allPrelevements.map((row) => row.laboCode),
      ...allEssais.map((row) => row.laboCode),
      ...allPlanning.map((row) => row.laboLabel),
      defaultLaboCode,
      requestedLaboCode,
    ]
      .map(normalizeCode)
      .filter(Boolean)

    return [...new Set([...KNOWN_LABOS, ...discovered])].filter(Boolean)
  }, [allEssais, allInterventions, allPlanning, allPrelevements, defaultLaboCode, requestedLaboCode])

  function openRowDestination(row) {
    if (!row?.to) return
    if (/^\/(interventions|prelevements|echantillons|essais)\//.test(row.to)) {
      navigateWithReturnTo(navigate, row.to, detailReturnTo)
      return
    }
    navigate(row.to)
  }

  function withinScope(row, values = []) {
    if (!effectiveLaboCode) return true
    return matchesLaboCode(effectiveLaboCode, row.laboCode, ...values)
  }

  const scopedInterventions = useMemo(
    () => allInterventions.filter((row) => withinScope(row, [row.reference, row.demandeReference, row.chantier])),
    [allInterventions, effectiveLaboCode]
  )

  const scopedPrelevements = useMemo(
    () => allPrelevements.filter((row) => withinScope(row, [row.reference, row.demandeReference, row.chantier, row.description, row.materiau])),
    [allPrelevements, effectiveLaboCode]
  )

  const scopedEssais = useMemo(
    () => allEssais.filter((row) => withinScope(row, [row.reference, row.code, row.demandeReference, row.echantillonReference, row.chantier])),
    [allEssais, effectiveLaboCode]
  )

  const scopedPlanning = useMemo(
    () => allPlanning.filter((row) => withinScope(row, [row.reference, row.title, row.laboLabel])),
    [allPlanning, effectiveLaboCode]
  )

  const openInterventions = useMemo(
    () => scopedInterventions.filter((row) => !isInterventionClosed(row)).sort((a, b) => toDateMs(a.date) - toDateMs(b.date)),
    [scopedInterventions]
  )

  const arrivals = useMemo(
    () => scopedPrelevements.filter(prelevementHasArrival).sort((a, b) => toDateMs(getPrelevementReferenceDate(b)) - toDateMs(getPrelevementReferenceDate(a))),
    [scopedPrelevements]
  )

  const receptionsToComplete = useMemo(
    () => arrivals.filter(prelevementNeedsReceptionCompletion),
    [arrivals]
  )

  const readyForLab = useMemo(
    () => arrivals.filter(prelevementIsReadyForLab),
    [arrivals]
  )

  const unexpectedArrivals = useMemo(
    () => arrivals.filter(prelevementIsUnexpectedArrival),
    [arrivals]
  )

  const openEssais = useMemo(
    () => scopedEssais.filter((row) => !isEssaiFinished(row)),
    [scopedEssais]
  )

  const essaisToLaunch = useMemo(
    () => openEssais
      .filter((row) => normalizeText(row.status) !== 'en cours' && row.dateStart && (dayDiffFromToday(row.dateStart) ?? 999) <= 0)
      .sort((a, b) => toDateMs(a.dateStart) - toDateMs(b.dateStart)),
    [openEssais]
  )

  const essaisInProgress = useMemo(
    () => openEssais.filter((row) => normalizeText(row.status) === 'en cours').sort((a, b) => toDateMs(a.dateStart) - toDateMs(b.dateStart)),
    [openEssais]
  )

  const essaisToReview = useMemo(
    () => openEssais.filter((row) => !!row.resultLabel && normalizeText(row.status) !== 'en cours').sort((a, b) => toDateMs(b.dateStart) - toDateMs(a.dateStart)),
    [openEssais]
  )

  const planningUnderTension = useMemo(
    () => scopedPlanning.filter((row) => ['late', 'soon'].includes(row.urgency)).sort((a, b) => {
      const urgencyDiff = ['late', 'soon', 'ok', 'done'].indexOf(a.urgency) - ['late', 'soon', 'ok', 'done'].indexOf(b.urgency)
      return urgencyDiff !== 0 ? urgencyDiff : toDateMs(a.deadline || a.start) - toDateMs(b.deadline || b.start)
    }),
    [scopedPlanning]
  )

  const expectedTerrainRows = useMemo(
    () => openInterventions.slice(0, 6).map((row) => buildInterventionEntry(row, {
      tone: dayDiffFromToday(row.date) != null && dayDiffFromToday(row.date) < 0 ? 'red' : 'sky',
      badge: describeSchedule(row.date),
      badgeTone: dayDiffFromToday(row.date) != null && dayDiffFromToday(row.date) < 0 ? 'red' : 'sky',
      extraMeta: 'Arrivage terrain attendu',
    })),
    [openInterventions]
  )

  const recentArrivalRows = useMemo(
    () => arrivals.slice(0, 6).map((row) => buildPrelevementEntry(row, {
      tone: isSameDay(getPrelevementReferenceDate(row)) ? 'teal' : 'sky',
      badge: row.storedReceptionDate ? 'Recu labo' : row.linkedReceptionDate ? 'Reception liee' : 'Prelevement',
      badgeTone: isSameDay(getPrelevementReferenceDate(row)) ? 'teal' : 'sky',
      extraMeta: row.storedReceptionDate
        ? `Reception ${formatDate(row.storedReceptionDate)}`
        : row.linkedReceptionDate
          ? `Reception liee ${formatDate(row.linkedReceptionDate)}`
          : row.samplingDate
            ? `Prelevement ${formatDate(row.samplingDate)}`
            : '',
    })),
    [arrivals]
  )

  const completionRows = useMemo(
    () => receptionsToComplete.slice(0, 6).map((row) => buildPrelevementEntry(row, {
      tone: 'amber',
      badge: 'A completer',
      badgeTone: 'amber',
      extraMeta: !row.description ? 'Description a preciser' : !row.receptionOwner ? 'Receptionnaire a preciser' : 'Rattachement a verifier',
    })),
    [receptionsToComplete]
  )

  const readyRows = useMemo(
    () => readyForLab.slice(0, 6).map((row) => buildPrelevementEntry(row, {
      tone: 'green',
      badge: 'Pret labo',
      badgeTone: 'green',
      extraMeta: `${row.echantillonCount} echantillon(s) · ${row.essaiCount} essai(s)`,
    })),
    [readyForLab]
  )

  const essaiLaunchRows = useMemo(
    () => essaisToLaunch.slice(0, 6).map((row) => buildEssaiEntry(row, {
      tone: 'amber',
      badge: 'A lancer',
      badgeTone: 'amber',
      extraMeta: row.resultLabel ? 'Valeurs deja presentes' : 'Date posee au calendrier',
    })),
    [essaisToLaunch]
  )

  const essaiRunningRows = useMemo(() => {
    const source = essaisInProgress.length > 0 ? essaisInProgress : essaisToReview
    return source.slice(0, 6).map((row) => buildEssaiEntry(row, {
      tone: essaisInProgress.includes(row) ? 'teal' : 'red',
      badge: essaisInProgress.includes(row) ? 'En cours' : 'A relire',
      badgeTone: essaisInProgress.includes(row) ? 'teal' : 'red',
      extraMeta: row.resultLabel ? 'Saisie terminee / relecture' : 'Execution en cours',
    }))
  }, [essaisInProgress, essaisToReview])

  const organisationRows = useMemo(() => {
    const planningRows = planningUnderTension.slice(0, 3).map((row) => buildPlanningEntry(row, {
      extraMeta: 'Organisation responsable',
    }))
    const interventionRows = openInterventions.slice(0, 3).map((row) => buildInterventionEntry(row, {
      tone: dayDiffFromToday(row.date) != null && dayDiffFromToday(row.date) < 0 ? 'red' : 'sky',
      badge: row.technicien || row.geotechnicien ? 'Affecte' : 'A affecter',
      badgeTone: row.technicien || row.geotechnicien ? 'sky' : 'amber',
      extraMeta: row.technicien || row.geotechnicien || 'Qui fait quoi / quand',
    }))
    return [...planningRows, ...interventionRows].slice(0, 6)
  }, [openInterventions, planningUnderTension])

  const arbitrageRows = useMemo(() => {
    const unexpectedRows = unexpectedArrivals.slice(0, 3).map((row) => buildPrelevementEntry(row, {
      tone: 'red',
      badge: 'Hors prevision',
      badgeTone: 'red',
      extraMeta: 'Arbitrage responsable requis',
    }))
    const completion = receptionsToComplete.slice(0, 3).map((row) => buildPrelevementEntry(row, {
      tone: 'amber',
      badge: 'Reception incomplete',
      badgeTone: 'amber',
      extraMeta: 'Description / receptionnaire / rattachement manquants',
    }))
    return [...unexpectedRows, ...completion].slice(0, 6)
  }, [receptionsToComplete, unexpectedArrivals])

  const technicianScopedEssais = useMemo(() => {
    if (isAdmin) return essaisToLaunch

    if (technicianProfile) {
      const matched = openEssais.filter((row) => matchesTechnicianProfile(technicianProfile, row.operator, row.reference, row.label, row.chantier))
      return matched.length > 0 ? matched : essaisToLaunch
    }

    const matched = openEssais.filter((row) => matchesUserAssignment(user, [row.operator, row.reference, row.label, row.chantier]))
    return matched.length > 0 ? matched : essaisToLaunch
  }, [essaisToLaunch, isAdmin, openEssais, technicianProfile, user])

  const technicianActivityRows = useMemo(() => {
    const essaiRows = technicianScopedEssais.slice(0, 4).map((row) => buildEssaiEntry(row, {
      tone: normalizeText(row.status) === 'en cours' ? 'teal' : 'amber',
      badge: normalizeText(row.status) === 'en cours' ? 'En cours' : 'A lancer',
      badgeTone: normalizeText(row.status) === 'en cours' ? 'teal' : 'amber',
      extraMeta: row.operator || 'Affectation a confirmer',
    }))

    const interventionRows = openInterventions
      .filter((row) => technicianProfile
        ? matchesTechnicianProfile(technicianProfile, row.technicien, row.geotechnicien, row.reference, row.subject)
        : matchesUserAssignment(user, [row.technicien, row.geotechnicien, row.reference, row.subject]))
      .slice(0, 2)
      .map((row) => buildInterventionEntry(row, {
        tone: 'sky',
        badge: 'Terrain',
        badgeTone: 'sky',
        extraMeta: row.technicien || row.geotechnicien || 'Intervention a suivre',
      }))

    return [...essaiRows, ...interventionRows].slice(0, 6)
  }, [openInterventions, technicianProfile, technicianScopedEssais, user])

  const searchResults = useMemo(() => {
    const normalizedSearch = normalizeText(search)
    const source = normalizedSearch
      ? scopedEssais.filter((row) => [row.reference, row.code, row.label, row.echantillonReference, row.demandeReference, row.chantier]
        .filter(Boolean)
        .some((value) => normalizeText(value).includes(normalizedSearch)))
      : essaisToLaunch

    return source.slice(0, 6).map((row) => buildEssaiEntry(row, {
      tone: normalizeText(row.status) === 'en cours' ? 'teal' : 'green',
      badge: normalizeText(row.status) === 'en cours' ? 'En cours' : row.dateStart ? describeSchedule(row.dateStart) : row.status,
      badgeTone: normalizeText(row.status) === 'en cours' ? 'teal' : 'green',
      extraMeta: row.echantillonReference ? `Echantillon ${row.echantillonReference}` : '',
    }))
  }, [essaisToLaunch, scopedEssais, search])

  const metrics = [
    {
      label: 'Attendus terrain',
      value: openInterventions.length,
      hint: pluralize(openInterventions.length, 'intervention ouverte', 'interventions ouvertes'),
      tone: openInterventions.length > 0 ? 'sky' : 'slate',
      icon: Truck,
    },
    {
      label: 'Arrivages du jour',
      value: arrivals.filter((row) => isSameDay(getPrelevementReferenceDate(row))).length,
      hint: pluralize(arrivals.length, 'arrivage recense', 'arrivages recenses'),
      tone: arrivals.length > 0 ? 'teal' : 'slate',
      icon: Package,
    },
    {
      label: 'Receptions a completer',
      value: receptionsToComplete.length,
      hint: 'Description, quantite ou receptionnaire manquants',
      tone: receptionsToComplete.length > 0 ? 'amber' : 'green',
      icon: ClipboardList,
    },
    {
      label: 'Prets labo',
      value: readyForLab.length,
      hint: 'Reception exploitable pour la suite',
      tone: readyForLab.length > 0 ? 'green' : 'slate',
      icon: Workflow,
    },
    {
      label: 'Essais a lancer',
      value: essaisToLaunch.length,
      hint: 'Date d essai posee au calendrier',
      tone: essaisToLaunch.length > 0 ? 'amber' : 'slate',
      icon: TestTube2,
    },
    {
      label: 'Essais en cours',
      value: essaisInProgress.length,
      hint: essaisToReview.length > 0 ? `${essaisToReview.length} a relire` : 'Production active',
      tone: essaisInProgress.length > 0 ? 'teal' : essaisToReview.length > 0 ? 'red' : 'slate',
      icon: FlaskConical,
    },
  ]

  const modeLabel = isAdmin
    ? 'Mode admin transverse'
    : responsibleProfile
      ? 'Mode responsable labo'
      : 'Mode technicien / labo'

  const scopeLabel = effectiveLaboCode
    ? `Labo ${effectiveLaboCode}`
    : 'Vue multi-labo'

  const heroTitle = isAdmin
    ? 'Laboratoire - vue globale'
    : effectiveLaboCode
      ? `Laboratoire ${effectiveLaboCode}`
      : 'Laboratoire'

  function updateAdminLabo(value) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('labo', value)
    else next.delete('labo')
    setSearchParams(next, { replace: true })
  }

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ['labo-home'] })
  }

  const technicianMemo = [
    'Confirmer l arrivee reelle puis renseigner date/heure, description, quantite et qui a recu.',
    'Completer la fiche prelevement / essai avant de lancer la sequence de labo.',
    'Verifier la date d essai posee au calendrier puis demarrer l essai depuis sa fiche.',
    'Le memo procedures et materiel sera raccorde ici quand les fiches minute Excel seront reprises.',
  ]

  return (
    <div className="flex flex-col gap-5">
      <div
        className="relative overflow-hidden rounded-[24px] border border-[#234e51]/15 p-6 text-white"
        style={{
          background: [
            'radial-gradient(circle at top left, rgba(246, 205, 120, 0.24), transparent 28%)',
            'radial-gradient(circle at bottom right, rgba(94, 170, 156, 0.22), transparent 34%)',
            'linear-gradient(135deg, #17343a 0%, #24555d 46%, #8d5e32 100%)',
          ].join(', '),
        }}
      >
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Portail laboratoire</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{heroTitle}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">
              Entree metier du laboratoire: preparation des arrivages, reception, acces direct aux essais et pilotage des sequences a lancer ou a suivre.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">{modeLabel}</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">{scopeLabel}</span>
              {responsibleProfile ? <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">{responsibleProfile.displayName}</span> : null}
              {technicianProfile ? <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">{technicianProfile.displayName}</span> : null}
            </div>
          </div>

          <div className="flex w-full max-w-[420px] flex-col gap-3 rounded-[20px] border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Acces rapides</p>
              <Button variant="ghost" size="sm" onClick={refreshAll} className="border border-white/10 bg-white/10 text-white hover:bg-white/15">
                <RefreshCw size={14} />
              </Button>
            </div>

            {isAdmin ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-white/75">Contexte labo</label>
                <Select value={effectiveLaboCode} onChange={(event) => updateAdminLabo(event.target.value)} className="border-white/10 bg-white/90 text-text">
                  <option value="">Tous les labos</option>
                  {availableLabos.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ActionButton label="Vue transverse" onClick={() => navigate(buildWorkbenchPath(effectiveLaboCode))} />
                <ActionButton label="Prelevements" onClick={() => navigate(buildPrelevementsPath(effectiveLaboCode))} />
              <ActionButton label="Planning" onClick={() => navigate('/planning')} />
              <ActionButton label="Workbench essais" onClick={() => navigate('/essais-workbench')} />
              <ActionButton label="Essais actifs" onClick={() => navigate(buildWorkbenchPath(effectiveLaboCode, { tab: 'essais', status: '__active__' }))} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => (
          <MetricTile
            key={metric.label}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            tone={metric.tone}
            icon={metric.icon}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="overflow-hidden">
          <CardHeader className="bg-bg/60">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Recherche directe essai</CardTitle>
                <p className="mt-1 text-xs text-text-muted">Acces direct a un essai sans passer par la demande. Recherche par reference, code, echantillon, chantier ou libelle.</p>
              </div>
              <Badge text={search ? `${searchResults.length} resultat(s)` : 'Acces direct'} tone="green" />
            </div>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Reference essai, code, echantillon, chantier..."
                className="pl-9"
              />
            </div>

            {searchResults.length === 0 ? (
              <EmptyBlock loading={essaisQuery.isLoading} label="Aucun essai ne correspond a la recherche ou aucun essai a lancer n est visible sur le scope actuel." />
            ) : (
              searchResults.map((row) => (
                <EntryRow
                  key={row.key}
                  title={row.title}
                  subtitle={row.subtitle}
                  meta={row.meta}
                  tone={row.tone}
                  trailing={<Badge text={row.badge} tone={row.badgeTone} />}
                  onClick={() => openRowDestination(row)}
                />
              ))
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="bg-bg/60">
            <CardTitle>Cadre de travail</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className={cn('rounded-2xl border p-4', toneClass(showResponsibleBlocks ? 'teal' : 'amber'))}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70">
                  <UserRound size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text">{user?.display_name || 'Utilisateur labo'}</p>
                  <p className="text-xs text-text-muted">{modeLabel}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Logique du flux</p>
              <div className="mt-3 flex flex-col gap-2 text-sm text-text-muted">
                <span>Intervention terrain attendue</span>
                <span>Prelevement recu</span>
                <span>Reception a completer</span>
                <span>Pret labo</span>
                <span>Essai a lancer / en cours</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Points d attention</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge text={`${unexpectedArrivals.length} hors prevision`} tone={unexpectedArrivals.length > 0 ? 'red' : 'slate'} />
                <Badge text={`${receptionsToComplete.length} receptions a completer`} tone={receptionsToComplete.length > 0 ? 'amber' : 'green'} />
                <Badge text={`${essaisToReview.length} essais a relire`} tone={essaisToReview.length > 0 ? 'red' : 'slate'} />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <WorkstreamCard
          title="Interventions attendues"
          description="Ce qui doit revenir du terrain ou arriver au laboratoire dans le flux prepare."
          countLabel={pluralize(openInterventions.length, 'intervention ouverte', 'interventions ouvertes')}
          tone="sky"
          icon={Truck}
          rows={expectedTerrainRows}
          loading={interventionsQuery.isLoading}
          emptyLabel="Aucune intervention terrain ouverte visible sur le perimetre actuel."
          actionLabel="Voir les interventions"
          onAction={() => navigate(buildWorkbenchPath(effectiveLaboCode, { tab: 'interventions' }))}
          onRowClick={openRowDestination}
        />

        <WorkstreamCard
          title="Arrivages recus"
          description="Ce qui est deja arrive ou a ete preleve et peut maintenant etre pris en charge par le labo."
          countLabel={pluralize(arrivals.length, 'arrivage', 'arrivages')}
          tone="teal"
          icon={Package}
          rows={recentArrivalRows}
          loading={prelevementsQuery.isLoading}
          emptyLabel="Aucun arrivage recense pour le moment sur ce scope labo."
          actionLabel="Voir les prelevements"
          onAction={() => navigate(buildPrelevementsPath(effectiveLaboCode, { view: 'arrivals' }))}
          onRowClick={openRowDestination}
        />

        <WorkstreamCard
          title="Receptions a completer"
          description="Arrivages reels encore incomplets avant de devenir exploitables par le laboratoire."
          countLabel={pluralize(receptionsToComplete.length, 'reception incomplete', 'receptions incompletes')}
          tone="amber"
          icon={ClipboardList}
          rows={completionRows}
          loading={prelevementsQuery.isLoading}
          emptyLabel="Aucune reception incomplete detectee avec les donnees disponibles."
          actionLabel="Voir les receptions a completer"
          onAction={() => navigate(buildPrelevementsPath(effectiveLaboCode, { view: 'to-complete' }))}
          onRowClick={openRowDestination}
        />

        <WorkstreamCard
          title="Prets labo"
          description="Arrivages qualifies et exploitables pour la planification ou le lancement des essais."
          countLabel={pluralize(readyForLab.length, 'pret labo', 'prets labo')}
          tone="green"
          icon={Workflow}
          rows={readyRows}
          loading={prelevementsQuery.isLoading}
          emptyLabel="Aucun element pret labo detecte pour l instant."
          actionLabel="Voir les prets labo"
          onAction={() => navigate(buildPrelevementsPath(effectiveLaboCode, { view: 'ready' }))}
          onRowClick={openRowDestination}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <WorkstreamCard
          title="Essais a lancer"
          description="Essais planifies dans le calendrier et prets a etre demarres depuis la fiche essai."
          countLabel={pluralize(essaisToLaunch.length, 'essai a lancer', 'essais a lancer')}
          tone="amber"
          icon={TestTube2}
          rows={essaiLaunchRows}
          loading={essaisQuery.isLoading}
          emptyLabel="Aucun essai a lancer detecte sur le scope actuel."
          actionLabel="Voir les essais actifs"
          onAction={() => navigate(buildWorkbenchPath(effectiveLaboCode, { tab: 'essais', status: '__active__' }))}
          onRowClick={openRowDestination}
        />

        <WorkstreamCard
          title="Essais en cours / a relire"
          description="Suivi direct des essais demarres et des saisies qui attendent relelecture ou cloture."
          countLabel={pluralize(essaisInProgress.length + essaisToReview.length, 'essai a suivre', 'essais a suivre')}
          tone={essaisToReview.length > 0 ? 'red' : 'teal'}
          icon={FlaskConical}
          rows={essaiRunningRows}
          loading={essaisQuery.isLoading}
          emptyLabel="Aucun essai en cours ni a relire visible pour le moment."
          actionLabel="Workbench essais"
          onAction={() => navigate('/essais-workbench')}
          onRowClick={openRowDestination}
        />
      </div>

      {showResponsibleBlocks ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <WorkstreamCard
            title="Organisation responsable"
            description="Qui fait quoi, quand et sur quels dossiers terrain / labo dans le perimetre courant."
            countLabel={pluralize(organisationRows.length, 'point de pilotage', 'points de pilotage')}
            tone="sky"
            icon={CalendarClock}
            rows={organisationRows}
            loading={planningQuery.isLoading || interventionsQuery.isLoading}
            emptyLabel="Aucune charge responsable saillante sur le perimetre actuel."
            actionLabel="Ouvrir le planning"
            onAction={() => navigate('/planning')}
            onRowClick={openRowDestination}
          />

          <WorkstreamCard
            title="Arbitrages terrain / reception"
            description="Arrivages hors prevision ou receptions incompletes qui demandent une decision responsable."
            countLabel={pluralize(arbitrageRows.length, 'arbitrage', 'arbitrages')}
            tone={unexpectedArrivals.length > 0 ? 'red' : 'amber'}
            icon={TriangleAlert}
            rows={arbitrageRows}
            loading={prelevementsQuery.isLoading}
            emptyLabel="Aucun arbitrage de reception detecte avec les donnees disponibles."
            actionLabel="Voir les arbitrages"
            onAction={() => navigate(buildPrelevementsPath(effectiveLaboCode, { view: 'arbitrage' }))}
            onRowClick={openRowDestination}
          />
        </div>
      ) : null}

      {showTechnicianBlocks ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <WorkstreamCard
            title="Mon activite"
            description="Essais et interventions deja affectes ou a prendre en charge sur mon perimetre de travail."
            countLabel={pluralize(technicianActivityRows.length, 'action', 'actions')}
            tone="teal"
            icon={UserRound}
            rows={technicianActivityRows}
            loading={essaisQuery.isLoading || interventionsQuery.isLoading}
            emptyLabel="Aucune activite personnelle explicite detectee. Le labo complet reste visible sur le perimetre courant."
            actionLabel="Ouvrir le labo transverse"
            onAction={() => navigate(buildWorkbenchPath(effectiveLaboCode))}
            onRowClick={openRowDestination}
          />

          <MemoCard
            title="Memo operatoire"
            items={technicianMemo}
            actionLabel="Ouvrir une fiche essai"
            onAction={() => {
              const firstEssai = searchResults[0]
              if (firstEssai) openRowDestination(firstEssai)
              else navigate(buildWorkbenchPath(effectiveLaboCode, { tab: 'essais', status: '__active__' }))
            }}
          />
        </div>
      ) : null}
    </div>
  )
}