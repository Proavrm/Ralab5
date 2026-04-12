import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import Card, { CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn, formatDate } from '@/lib/utils'
import { demandesApi, echantillonsApi, essaisApi, interventionsApi, planningApi } from '@/services/api'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  Inbox,
  Package,
  TestTube2,
  UserRound,
  Waves,
} from 'lucide-react'
import { getResponsibleLaboProfileBySlug } from '@/lib/responsibleLaboProfiles'

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

const CLOSED_DEMANDE_STATUSES = new Set(['fini', 'envoye perdu', 'archivee'])
const CLOSED_INTERVENTION_STATUSES = new Set(['realisee', 'annulee'])
const FINISHED_ESSAI_STATUSES = new Set(['fini', 'termine'])
const DAY_MS = 24 * 60 * 60 * 1000

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

function toneClass(tone) {
  return TONES[tone] || TONES.slate
}

function toneDotClass(tone) {
  return TONE_DOTS[tone] || TONE_DOTS.slate
}

function toDateMs(value) {
  const ms = new Date(value || '').getTime()
  return Number.isNaN(ms) ? 0 : ms
}

function compareAsc(left, right) {
  return toDateMs(left) - toDateMs(right)
}

function compareDesc(left, right) {
  return toDateMs(right) - toDateMs(left)
}

function sortByDateDesc(items, picker) {
  return [...items].sort((left, right) => compareDesc(picker(left), picker(right)))
}

function dayDiffFromToday(value) {
  if (!value) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

function formatLeadTime(value) {
  const diff = dayDiffFromToday(value)
  if (diff == null) return 'Sans echeance'
  if (diff < 0) return `${Math.abs(diff)} j de retard`
  if (diff === 0) return 'Aujourd hui'
  if (diff === 1) return 'Demain'
  return `Dans ${diff} j`
}

function pluralize(count, singular, plural) {
  return `${count} ${count > 1 ? plural : singular}`
}

function buildMeta(parts) {
  return parts.filter(Boolean).join(' - ')
}

function hasCodeMarker(value, code) {
  const upper = String(value || '').trim().toUpperCase()
  if (!upper || !code) return false
  return upper === code
    || upper.includes(`-${code}-`)
    || upper.startsWith(`${code}-`)
    || upper.endsWith(`-${code}`)
}

function matchesProfileScope(profile, ...values) {
  if (!profile) return false

  const code = normalizeCode(profile.laboCode)
  const terms = profile.matchTerms || []

  return values.some((value) => {
    if (!value) return false
    if (hasCodeMarker(value, code)) return true

    const normalized = normalizeText(value)
    if (!normalized) return false

    return terms.some((term) => term.length >= 3 && normalized.includes(term))
  })
}

function urgencyTone(value) {
  if (value === 'late') return 'red'
  if (value === 'soon') return 'amber'
  if (value === 'done') return 'green'
  return 'sky'
}

function statusTone(value) {
  const normalized = normalizeText(value)
  if (['en cours'].includes(normalized)) return 'amber'
  if (['termine', 'fini', 'realisee'].includes(normalized)) return 'green'
  if (['planifiee', 'programme', 'importee', 'importe'].includes(normalized)) return 'sky'
  if (['annulee', 'archivee'].includes(normalized)) return 'slate'
  return 'slate'
}

function interventionAlertTone(value) {
  const normalized = normalizeText(value)
  if (['critique', 'eleve'].includes(normalized)) return 'red'
  if (normalized === 'moyen') return 'amber'
  if (normalized === 'faible') return 'sky'
  return 'slate'
}

function normalizeDemande(row, index) {
  return {
    uid: row.uid ?? row.id ?? `demande-${index}`,
    reference: row.reference || `Demande #${row.uid ?? index}`,
    laboCode: row.labo_code || row.service_code || row.service || '',
    chantier: row.chantier || row.client || '',
    client: row.client || '',
    status: row.statut || row.status || '',
    deadline: row.date_echeance || row.echeance || '',
    updatedAt: row.updated_at || row.date_reception || row.created_at || '',
  }
}

function normalizePlanning(row, index) {
  return {
    uid: row.uid ?? row.id ?? `planning-${index}`,
    reference: row.ref || row.reference || `Planning #${row.uid ?? index}`,
    title: row.tit || row.title || '',
    laboLabel: row.labo || row.labo_code || '',
    status: row.stat || row.statut || '',
    start: row.start || row.date_debut || '',
    deadline: row.ech || row.echeance || '',
    urgency: String(row.urg || row.urgence || 'ok').trim().toLowerCase(),
  }
}

function normalizeIntervention(row, index) {
  return {
    uid: row.uid ?? row.id ?? `intervention-${index}`,
    reference: row.reference || `Intervention #${row.uid ?? index}`,
    laboCode: row.labo_code || row.labo || '',
    demandeReference: row.demande_reference || row.demande_ref || '',
    chantier: row.chantier || row.site || '',
    status: row.statut || row.status || '',
    date: row.date_intervention || row.date || row.created_at || '',
    alertLevel: row.niveau_alerte || '',
    technicien: row.technicien || row.geotechnicien || '',
  }
}

function normalizeEchantillon(row, index) {
  return {
    uid: row.uid ?? row.id ?? `echantillon-${index}`,
    reference: row.reference || `Echantillon #${row.uid ?? index}`,
    laboCode: row.labo_code || row.labo || '',
    demandeReference: row.demande_reference || row.demande_ref || '',
    chantier: row.chantier || row.site || row.localisation || '',
    nature: row.nature || row.designation || '',
    status: row.statut || row.status || '',
    receptionDate: row.date_reception_labo || row.date_reception || '',
    samplingDate: row.date_prelevement || '',
    essaiCode: row.essai_code || row.code_essai || '',
  }
}

function normalizeEssai(row, index) {
  return {
    uid: row.uid ?? row.id ?? `essai-${index}`,
    reference: row.reference || `Essai #${row.uid ?? index}`,
    laboCode: row.labo_code || row.labo || '',
    demandeReference: row.demande_reference || row.demande_ref || '',
    echantillonReference: row.echantillon_reference || row.echantillon_ref || '',
    code: row.essai_code || row.code_essai || row.type_essai || '',
    label: row.resultat_label || row.type_essai || row.designation || '',
    status: row.statut || row.status || '',
    resultLabel: row.resultat_label || '',
    dateStart: row.date_debut || row.date || row.created_at || '',
    dateEnd: row.date_fin || '',
    operateur: row.operateur || '',
  }
}

function isDemandeClosed(row) {
  return CLOSED_DEMANDE_STATUSES.has(normalizeText(row.status))
}

function isInterventionClosed(row) {
  return CLOSED_INTERVENTION_STATUSES.has(normalizeText(row.status))
}

function isEssaiFinished(row) {
  return !!row.dateEnd || FINISHED_ESSAI_STATUSES.has(normalizeText(row.status))
}

function needsEssaiAttention(row) {
  if (isEssaiFinished(row)) return false
  const diff = dayDiffFromToday(row.dateStart)
  return normalizeText(row.status) === 'en cours' || !!row.resultLabel || (diff != null && diff <= -2)
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

function ActionButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-text transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
    >
      {label}
      <ArrowRight size={14} />
    </button>
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

function Badge({ text, tone = 'slate' }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', toneClass(tone))}>
      {text}
    </span>
  )
}

function EmptyBlock({ label, loading }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-xs text-text-muted">
      {loading ? 'Chargement...' : label}
    </div>
  )
}

function ChecklistBlock({ items, tone = 'slate' }) {
  if (!items?.length) return null

  return (
    <div className="mt-3 flex flex-col gap-2">
      {items.map((item) => (
        <div key={item} className="flex items-start gap-2 text-xs text-text-muted">
          <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', toneDotClass(tone))} />
          <span>{item}</span>
        </div>
      ))}
    </div>
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
  emptyChecklist,
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
          <div>
            <EmptyBlock loading={loading} label={emptyLabel} />
            <ChecklistBlock items={emptyChecklist} tone={tone} />
          </div>
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

function buildDemandeEntry(row, options = {}) {
  return {
    key: `demande-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.chantier || row.client || 'Sans contexte', row.laboCode || '']),
    meta: buildMeta([
      row.deadline ? `Echeance ${formatDate(row.deadline)}` : row.updatedAt ? `Maj ${formatDate(row.updatedAt)}` : '',
      options.extraMeta,
    ]),
    tone: options.tone || statusTone(row.status),
    badge: options.badge || row.status,
    badgeTone: options.badgeTone || options.tone || statusTone(row.status),
    to: `/demandes/${row.uid}`,
  }
}

function buildPlanningEntry(row, options = {}) {
  return {
    key: `planning-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.title || 'Sans contexte', row.laboLabel || row.status || '']),
    meta: buildMeta([
      row.deadline ? `Echeance ${formatDate(row.deadline)}` : row.start ? `Demarrage ${formatDate(row.start)}` : '',
      options.extraMeta,
    ]),
    tone: options.tone || urgencyTone(row.urgency),
    badge: options.badge || (row.urgency === 'late' ? 'Retard' : row.urgency === 'soon' ? 'Sous 7 j' : row.status || 'Planning'),
    badgeTone: options.badgeTone || options.tone || urgencyTone(row.urgency),
    to: `/demandes/${row.uid}`,
  }
}

function buildInterventionEntry(row, options = {}) {
  return {
    key: `intervention-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.chantier || 'Sans contexte', row.technicien || 'Technicien non renseigne']),
    meta: buildMeta([
      row.date ? formatDate(row.date) : '',
      row.demandeReference || row.laboCode || '',
      options.extraMeta,
    ]),
    tone: options.tone || interventionAlertTone(row.alertLevel),
    badge: options.badge || row.alertLevel || row.status,
    badgeTone: options.badgeTone || options.tone || interventionAlertTone(row.alertLevel),
    to: `/interventions/${row.uid}`,
  }
}

function buildEchantillonEntry(row, options = {}) {
  return {
    key: `echantillon-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.nature || 'Echantillon', row.chantier || 'Sans contexte']),
    meta: buildMeta([
      row.receptionDate ? `Recu ${formatDate(row.receptionDate)}` : row.samplingDate ? `Preleve ${formatDate(row.samplingDate)}` : '',
      row.demandeReference || row.laboCode || '',
      options.extraMeta,
    ]),
    tone: options.tone || statusTone(row.status),
    badge: options.badge || row.essaiCode || row.status,
    badgeTone: options.badgeTone || options.tone || statusTone(row.status),
    to: `/echantillons/${row.uid}`,
  }
}

function buildEssaiEntry(row, options = {}) {
  return {
    key: `essai-${row.uid}`,
    title: row.code || row.reference,
    subtitle: buildMeta([row.echantillonReference || 'Echantillon non renseigne', row.demandeReference || row.label || '']),
    meta: buildMeta([
      row.dateStart ? `Demarre ${formatDate(row.dateStart)}` : row.dateEnd ? `Cloture ${formatDate(row.dateEnd)}` : '',
      options.extraMeta,
    ]),
    tone: options.tone || statusTone(row.status),
    badge: options.badge || row.resultLabel || row.status,
    badgeTone: options.badgeTone || options.tone || statusTone(row.status),
    to: `/essais/${row.uid}`,
  }
}

export default function ResponsableLaboDashboardPage() {
  const navigate = useNavigate()
  const { slug } = useParams()
  const profile = getResponsibleLaboProfileBySlug(slug)

  const demandesQuery = useQuery({
    queryKey: ['responsable-labo', slug, 'demandes'],
    queryFn: () => demandesApi.list(),
    enabled: !!profile,
  })

  const planningQuery = useQuery({
    queryKey: ['responsable-labo', slug, 'planning'],
    queryFn: () => planningApi.list(),
    enabled: !!profile,
  })

  const interventionsQuery = useQuery({
    queryKey: ['responsable-labo', slug, 'interventions'],
    queryFn: () => interventionsApi.list(),
    enabled: !!profile,
  })

  const echantillonsQuery = useQuery({
    queryKey: ['responsable-labo', slug, 'echantillons'],
    queryFn: () => echantillonsApi.list(),
    enabled: !!profile,
  })

  const essaisQuery = useQuery({
    queryKey: ['responsable-labo', slug, 'essais'],
    queryFn: () => essaisApi.list(),
    enabled: !!profile,
  })

  const allDemandes = useMemo(
    () => (Array.isArray(demandesQuery.data) ? demandesQuery.data : []).map(normalizeDemande),
    [demandesQuery.data]
  )

  const allPlanning = useMemo(
    () => (Array.isArray(planningQuery.data) ? planningQuery.data : []).map(normalizePlanning),
    [planningQuery.data]
  )

  const allInterventions = useMemo(
    () => (Array.isArray(interventionsQuery.data) ? interventionsQuery.data : []).map(normalizeIntervention),
    [interventionsQuery.data]
  )

  const allEchantillons = useMemo(
    () => (Array.isArray(echantillonsQuery.data) ? echantillonsQuery.data : []).map(normalizeEchantillon),
    [echantillonsQuery.data]
  )

  const allEssais = useMemo(
    () => (Array.isArray(essaisQuery.data) ? essaisQuery.data : []).map(normalizeEssai),
    [essaisQuery.data]
  )

  const laboDemandes = useMemo(
    () => allDemandes.filter((row) => matchesProfileScope(profile, row.laboCode, row.reference, row.chantier, row.client)),
    [allDemandes, profile]
  )

  const laboPlanning = useMemo(
    () => allPlanning.filter((row) => matchesProfileScope(profile, row.reference, row.laboLabel, row.title)),
    [allPlanning, profile]
  )

  const laboInterventions = useMemo(
    () => allInterventions.filter((row) => matchesProfileScope(profile, row.laboCode, row.reference, row.demandeReference, row.chantier)),
    [allInterventions, profile]
  )

  const laboEchantillons = useMemo(
    () => allEchantillons.filter((row) => matchesProfileScope(profile, row.laboCode, row.reference, row.demandeReference, row.chantier)),
    [allEchantillons, profile]
  )

  const laboEssais = useMemo(
    () => allEssais.filter((row) => matchesProfileScope(profile, row.laboCode, row.reference, row.demandeReference, row.echantillonReference)),
    [allEssais, profile]
  )

  const activeDemandes = useMemo(
    () => laboDemandes.filter((row) => !isDemandeClosed(row)),
    [laboDemandes]
  )

  const urgentPlanning = useMemo(
    () => [...laboPlanning]
      .filter((row) => row.urgency === 'late' || row.urgency === 'soon')
      .sort((left, right) => {
        const leftRank = left.urgency === 'late' ? 0 : 1
        const rightRank = right.urgency === 'late' ? 0 : 1
        if (leftRank !== rightRank) return leftRank - rightRank
        return compareAsc(left.deadline || left.start, right.deadline || right.start)
      }),
    [laboPlanning]
  )

  const openInterventions = useMemo(
    () => [...laboInterventions]
      .filter((row) => !isInterventionClosed(row))
      .sort((left, right) => compareAsc(left.date, right.date)),
    [laboInterventions]
  )

  const elevatedInterventions = useMemo(
    () => openInterventions.filter((row) => ['critique', 'eleve'].includes(normalizeText(row.alertLevel))),
    [openInterventions]
  )

  const recentEchantillons = useMemo(
    () => sortByDateDesc(laboEchantillons, (row) => row.receptionDate || row.samplingDate).slice(0, 6),
    [laboEchantillons]
  )

  const visibleEssais = useMemo(
    () => [...laboEssais].sort((left, right) => compareDesc(left.dateEnd || left.dateStart, right.dateEnd || right.dateStart)),
    [laboEssais]
  )

  const openEssais = useMemo(
    () => visibleEssais.filter((row) => !isEssaiFinished(row)),
    [visibleEssais]
  )

  const closureEssais = useMemo(
    () => openEssais.filter((row) => needsEssaiAttention(row)).slice(0, 6),
    [openEssais]
  )

  const recentFinishedEssais = useMemo(
    () => visibleEssais.filter((row) => isEssaiFinished(row)).slice(0, 6),
    [visibleEssais]
  )

  const linkedSamples = useMemo(
    () => new Set(laboEssais.map((row) => row.echantillonReference).filter(Boolean)).size,
    [laboEssais]
  )

  const recentDemandes = useMemo(
    () => sortByDateDesc(laboDemandes, (row) => row.updatedAt || row.deadline).slice(0, 6),
    [laboDemandes]
  )

  const hasOperationalData = laboDemandes.length + laboPlanning.length + laboInterventions.length + laboEchantillons.length + laboEssais.length > 0
  const dataIssues = [
    demandesQuery.error ? 'Demandes' : null,
    planningQuery.error ? 'Planning' : null,
    interventionsQuery.error ? 'Interventions' : null,
    echantillonsQuery.error ? 'Echantillons' : null,
    essaisQuery.error ? 'Essais' : null,
  ].filter(Boolean)

  const chargeBoardRows = (urgentPlanning.length > 0 ? urgentPlanning : activeDemandes.slice(0, 6)).map((row) => {
    if ('urgency' in row) {
      return buildPlanningEntry(row, {
        extraMeta: row.deadline ? formatLeadTime(row.deadline) : row.start ? formatLeadTime(row.start) : '',
      })
    }

    return buildDemandeEntry(row, {
      tone: row.deadline && dayDiffFromToday(row.deadline) != null && dayDiffFromToday(row.deadline) < 0 ? 'red' : statusTone(row.status),
      extraMeta: row.deadline ? formatLeadTime(row.deadline) : 'Charge active du labo',
    })
  })

  const productionRows = (closureEssais.length > 0 ? closureEssais : recentEchantillons).map((row) => {
    if ('echantillonReference' in row) {
      return buildEssaiEntry(row, {
        tone: 'amber',
        badge: row.resultLabel || row.status || 'A suivre',
        badgeTone: 'amber',
        extraMeta: row.dateStart ? formatLeadTime(row.dateStart) : 'Production ouverte',
      })
    }

    return buildEchantillonEntry(row, {
      tone: !row.essaiCode ? 'teal' : statusTone(row.status),
      badge: row.essaiCode ? `Essai ${row.essaiCode}` : 'A orienter',
      badgeTone: !row.essaiCode ? 'teal' : statusTone(row.status),
      extraMeta: row.receptionDate ? formatLeadTime(row.receptionDate) : 'Reception labo',
    })
  })

  const coordinationRows = (elevatedInterventions.length > 0 ? elevatedInterventions : openInterventions.slice(0, 6)).map((row) => buildInterventionEntry(row, {
    tone: row.alertLevel ? interventionAlertTone(row.alertLevel) : statusTone(row.status),
    badge: row.alertLevel || row.status,
    badgeTone: row.alertLevel ? interventionAlertTone(row.alertLevel) : statusTone(row.status),
    extraMeta: row.date ? formatLeadTime(row.date) : 'Coordination terrain / labo',
  }))

  if (!profile) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="relative overflow-hidden rounded-[20px] border border-[#234e51]/20 p-6 text-white"
        style={{
          background: [
            'radial-gradient(circle at top left, rgba(246, 205, 120, 0.24), transparent 28%)',
            'radial-gradient(circle at bottom right, rgba(94, 170, 156, 0.22), transparent 34%)',
            'linear-gradient(135deg, #17343a 0%, #24555d 46%, #8d5e32 100%)',
          ].join(', '),
        }}
      >
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Dashboard responsable labo</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{profile.displayName}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/80">{profile.summary}</p>
            <p className="mt-3 text-sm text-white/70">{profile.title} - {profile.location}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                {profile.roleLabel}
              </span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                Labo {profile.laboCode}
              </span>
              {profile.focusAreas.map((item) => (
                <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                  {item}
                </span>
              ))}
              {!hasOperationalData ? (
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                  Import en attente
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionButton label="Vue labo transverse" onClick={() => navigate(`/labo/workbench?labo=${profile.laboCode}`)} />
            <ActionButton label="Ouvrir le planning" onClick={() => navigate('/planning')} />
          </div>
        </div>
      </div>

      {dataIssues.length > 0 ? (
        <Card className="border-[#efc2bf] bg-[#fdf7f6]">
          <CardBody className="p-4">
            <p className="text-sm font-semibold text-[#7a2925]">Donnees partielles</p>
            <p className="mt-1 text-xs text-[#8d4a44]">
              Certaines sources du dashboard responsable labo ne sont pas remontees: {dataIssues.join(', ')}.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {!hasOperationalData ? (
        <Card className="border-[#ecd1a2] bg-[#fbf6ec]">
          <CardBody className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-[#7a5b1f]">
              <Inbox size={16} />
              <p className="text-sm font-semibold">Labo en attente de premiers imports</p>
            </div>
            <p className="text-sm text-[#7a6a48]">
              Ce dashboard est deja pret pour {profile.title}, mais il ne voit encore aucun flux source sur le perimetre {profile.laboCode}.
            </p>
            <ChecklistBlock items={profile.readinessChecklist} tone={profile.tone} />
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          label="Demandes actives"
          value={demandesQuery.isLoading ? '…' : activeDemandes.length}
          hint={demandesQuery.isLoading ? 'Chargement...' : `${laboDemandes.length} demandes visibles`}
          tone={activeDemandes.length > 0 ? 'sky' : 'slate'}
          icon={ClipboardList}
        />
        <MetricTile
          label="Charge planning"
          value={planningQuery.isLoading ? '…' : urgentPlanning.length}
          hint={planningQuery.isLoading ? 'Chargement...' : `${laboPlanning.length} lignes planning rattachees`}
          tone={urgentPlanning.length > 0 ? 'amber' : 'green'}
          icon={CalendarClock}
        />
        <MetricTile
          label="Interventions ouvertes"
          value={interventionsQuery.isLoading ? '…' : openInterventions.length}
          hint={interventionsQuery.isLoading ? 'Chargement...' : `${elevatedInterventions.length} a suivre de pres`}
          tone={elevatedInterventions.length > 0 ? 'red' : openInterventions.length > 0 ? 'teal' : 'slate'}
          icon={Waves}
        />
        <MetricTile
          label="Echantillons visibles"
          value={echantillonsQuery.isLoading ? '…' : laboEchantillons.length}
          hint={echantillonsQuery.isLoading ? 'Chargement...' : `${recentEchantillons.length} receptions recentes`}
          tone={laboEchantillons.length > 0 ? 'teal' : 'slate'}
          icon={Package}
        />
        <MetricTile
          label="Essais a suivre"
          value={essaisQuery.isLoading ? '…' : openEssais.length}
          hint={essaisQuery.isLoading ? 'Chargement...' : `${linkedSamples} echantillons relies`}
          tone={openEssais.length > 0 ? 'green' : 'slate'}
          icon={TestTube2}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <WorkstreamCard
          title="Charge du labo"
          description="Demandes et priorites qui donnent le tempo du laboratoire."
          countLabel={urgentPlanning.length > 0 ? pluralize(urgentPlanning.length, 'priorite', 'priorites') : pluralize(activeDemandes.length, 'demande active', 'demandes actives')}
          tone={urgentPlanning.length > 0 ? 'amber' : 'sky'}
          icon={CalendarClock}
          rows={chargeBoardRows}
          loading={demandesQuery.isLoading || planningQuery.isLoading}
          emptyLabel="Aucune charge labo visible pour ce perimetre pour le moment."
          emptyChecklist={profile.readinessChecklist}
          actionLabel="Voir demandes"
          onAction={() => navigate('/demandes')}
          onRowClick={(row) => navigate(row.to)}
        />

        <WorkstreamCard
          title="Reception et production"
          description="Flux d echantillons et essais a prendre en charge ou a boucler."
          countLabel={closureEssais.length > 0 ? pluralize(closureEssais.length, 'essai chaud', 'essais chauds') : pluralize(recentEchantillons.length, 'reception recente', 'receptions recentes')}
          tone={closureEssais.length > 0 ? 'green' : 'teal'}
          icon={FlaskConical}
          rows={productionRows}
          loading={echantillonsQuery.isLoading || essaisQuery.isLoading}
          emptyLabel="Aucun flux echantillon ou essai visible pour l instant."
          emptyChecklist={profile.readinessChecklist}
          actionLabel="Voir labo"
          onAction={() => navigate(`/labo/workbench?labo=${profile.laboCode}`)}
          onRowClick={(row) => navigate(row.to)}
        />

        <WorkstreamCard
          title="Urgences et coordination terrain/labo"
          description="Points terrain a arbitrer et charge qui peut perturber le laboratoire."
          countLabel={elevatedInterventions.length > 0 ? pluralize(elevatedInterventions.length, 'alerte haute', 'alertes hautes') : pluralize(openInterventions.length, 'intervention ouverte', 'interventions ouvertes')}
          tone={elevatedInterventions.length > 0 ? 'red' : 'teal'}
          icon={AlertTriangle}
          rows={coordinationRows}
          loading={interventionsQuery.isLoading}
          emptyLabel="Aucune intervention terrain rattachee a ce labo pour le moment."
          emptyChecklist={profile.readinessChecklist}
          actionLabel="Voir interventions"
          onAction={() => navigate(`/labo/workbench?labo=${profile.laboCode}`)}
          onRowClick={(row) => navigate(row.to)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Flux recents</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Demandes recentes</p>
              {recentDemandes.length === 0 ? (
                <EmptyBlock loading={demandesQuery.isLoading} label="Aucune demande recente visible." />
              ) : (
                recentDemandes.map((row) => {
                  const isLate = row.deadline && dayDiffFromToday(row.deadline) != null && dayDiffFromToday(row.deadline) < 0 && !isDemandeClosed(row)
                  return (
                    <EntryRow
                      key={row.uid}
                      title={row.reference}
                      subtitle={buildMeta([row.chantier || row.client || 'Sans contexte', row.laboCode || ''])}
                      meta={row.deadline ? `Echeance ${formatDate(row.deadline)} - ${formatLeadTime(row.deadline)}` : `Maj ${formatDate(row.updatedAt)}`}
                      tone={isLate ? 'red' : statusTone(row.status)}
                      trailing={<Badge text={row.status || 'Demande'} tone={isLate ? 'red' : statusTone(row.status)} />}
                      onClick={() => navigate(`/demandes/${row.uid}`)}
                    />
                  )
                })
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Essais termines recents</p>
              {recentFinishedEssais.length === 0 ? (
                <EmptyBlock loading={essaisQuery.isLoading} label="Aucun essai termine visible sur ce perimetre." />
              ) : (
                recentFinishedEssais.map((row) => (
                  <EntryRow
                    key={row.uid}
                    title={row.code || row.reference}
                    subtitle={buildMeta([row.echantillonReference || 'Echantillon non renseigne', row.demandeReference || row.label || ''])}
                    meta={row.dateEnd ? `Cloture ${formatDate(row.dateEnd)}` : row.dateStart ? `Demarre ${formatDate(row.dateStart)}` : ''}
                    tone="green"
                    trailing={<Badge text={row.resultLabel || row.status || 'Resultat'} tone="green" />}
                    onClick={() => navigate(`/essais/${row.uid}`)}
                  />
                ))
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Cadre du labo</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className={cn('rounded-2xl border p-4', toneClass(profile.tone))}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70">
                  <UserRound size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{profile.displayName}</p>
                  <p className="text-xs opacity-80">{profile.title}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Mission</p>
              <p className="mt-2 text-sm text-text">{profile.mission}</p>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Perimetre suivi</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge text={`Labo ${profile.laboCode}`} tone={profile.tone} />
                <Badge text={profile.location} tone="slate" />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Etat des flux</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {hasOperationalData ? (
                  <>
                    <Badge text={pluralize(laboDemandes.length, 'demande', 'demandes')} tone="sky" />
                    <Badge text={pluralize(laboInterventions.length, 'intervention', 'interventions')} tone="teal" />
                    <Badge text={pluralize(laboEchantillons.length, 'echantillon', 'echantillons')} tone="amber" />
                    <Badge text={pluralize(laboEssais.length, 'essai', 'essais')} tone="green" />
                  </>
                ) : (
                  <Badge text="Sources a initialiser" tone="amber" />
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Raccourcis</p>
              <div className="mt-3 flex flex-col gap-2">
                <ActionButton label="Ouvrir le labo" onClick={() => navigate(`/labo?labo=${profile.laboCode}`)} />
                <ActionButton label="Ouvrir les demandes" onClick={() => navigate('/demandes')} />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}