/**
 * pages/DashboardPage.jsx
 * Dashboard principal transverse.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  api,
  affairesApi,
  demandesApi,
  echantillonsApi,
  essaisApi,
  interventionsApi,
  passationsApi,
  planningApi,
  qualiteApi,
} from '@/services/api'
import { cn, formatDate } from '@/lib/utils'
import Card, { CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  ClipboardList,
  Clock3,
  FileText,
  FlaskConical,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  TestTube2,
  TriangleAlert,
} from 'lucide-react'
import { getDashboardPresetLabel } from '@/lib/dashboardWidgets'
import { hasPermission } from '@/lib/permissions'
import { useDashboardPreferences } from '@/hooks/useDashboardPreferences'

const DOMAIN_BADGES = [
  'Affaires',
  'Demandes',
  'Planning',
  'Passations',
  'Interventions',
  'Échantillons',
  'Essais',
  'Qualité',
]

const TONES = {
  sky: {
    panel: 'border-[#cfe4f6] bg-[#eef6fd] text-[#185fa5]',
    dot: 'bg-[#4b8fc8]',
    soft: 'bg-[#dcecf9]',
    value: 'text-[#185fa5]',
  },
  amber: {
    panel: 'border-[#ecd1a2] bg-[#fbf1e2] text-[#854f0b]',
    dot: 'bg-[#d18d24]',
    soft: 'bg-[#f5debc]',
    value: 'text-[#854f0b]',
  },
  green: {
    panel: 'border-[#d4e4c1] bg-[#eef5e6] text-[#3b6d11]',
    dot: 'bg-[#6ea235]',
    soft: 'bg-[#dceac9]',
    value: 'text-[#3b6d11]',
  },
  red: {
    panel: 'border-[#efc2bf] bg-[#fdf0ef] text-[#a32d2d]',
    dot: 'bg-[#d56560]',
    soft: 'bg-[#f7d8d5]',
    value: 'text-[#a32d2d]',
  },
  teal: {
    panel: 'border-[#c7e2de] bg-[#e8f4f2] text-[#14655d]',
    dot: 'bg-[#2a8a80]',
    soft: 'bg-[#d3ebe7]',
    value: 'text-[#14655d]',
  },
  slate: {
    panel: 'border-[#e4ddd3] bg-[#f4f1eb] text-[#5f5e5a]',
    dot: 'bg-[#7b7973]',
    soft: 'bg-[#ebe6dd]',
    value: 'text-[#5f5e5a]',
  },
}

const STATUS_TONES = {
  'À qualifier': 'slate',
  Demande: 'sky',
  'En Cours': 'amber',
  'Répondu': 'sky',
  Fini: 'green',
  'Envoyé - Perdu': 'red',
  'En cours': 'amber',
  Programmé: 'sky',
  Terminé: 'green',
  Annulé: 'slate',
  Planifiée: 'sky',
  Réalisée: 'green',
  Annulée: 'slate',
  Reçu: 'sky',
  'En attente': 'slate',
  Rejeté: 'red',
  Ouverte: 'red',
  'En service': 'green',
  'Hors service': 'red',
}

const URGENCY_TONES = {
  late: 'red',
  soon: 'amber',
  ok: 'sky',
  done: 'green',
}

const DASHBOARD_SHORTCUTS = [
  {
    key: 'affaires',
    title: 'Affaires',
    desc: 'Pilotage client, chantier et charge active',
    to: '/affaires',
    tone: 'teal',
    icon: Briefcase,
  },
  {
    key: 'demandes',
    title: 'Demandes',
    desc: 'Qualification, priorites et fiches detaillees',
    to: '/demandes',
    tone: 'sky',
    icon: ClipboardList,
    permission: 'view_demandes',
  },
  {
    key: 'planning',
    title: 'Planning',
    desc: 'Retards, echeances et coordination des demandes',
    to: '/planning',
    tone: 'amber',
    icon: Clock3,
    permission: 'view_planning',
  },
  {
    key: 'labo',
    title: 'Labo',
    desc: 'Interventions, echantillons et essais en cours',
    to: '/labo',
    tone: 'green',
    icon: FlaskConical,
    permission: 'view_labo',
  },
  {
    key: 'passations',
    title: 'Passations',
    desc: 'Transmission chantier, documents et actions',
    to: '/passations',
    tone: 'slate',
    icon: FileText,
  },
  {
    key: 'qualite',
    title: 'Qualite',
    desc: 'NC, metrologie, equipements et conformite',
    to: '/qualite',
    tone: 'red',
    icon: ShieldAlert,
  },
]

const QUALITY_FUTURE_AREAS = [
  {
    id: 'audits',
    title: 'Audits & constats',
    description: 'Planification des audits internes et externes, constats et bouclage des suites.',
    tone: 'amber',
  },
  {
    id: 'capa',
    title: 'Plans d action CAPA',
    description: 'Actions correctives et preventives liees aux NC, audits et incidents methodes.',
    tone: 'red',
  },
  {
    id: 'competences',
    title: 'Habilitations & competences',
    description: 'Matrice des personnes habilitees par essai, equipement, verification et signature.',
    tone: 'sky',
  },
  {
    id: 'intercomparaisons',
    title: 'Intercomparaisons',
    description: 'Campagnes externes, comparaisons inter-labos et suivi de performance des methodes.',
    tone: 'teal',
  },
]

const LAB_FUTURE_AREAS = [
  {
    id: 'bench-capacity',
    title: 'Charge paillasse par poste',
    description: 'Charge par banc, methode, equipement et capacite journaliere de production.',
    tone: 'amber',
  },
  {
    id: 'technical-validation',
    title: 'Validation technique & diffusion',
    description: 'Contre-lecture, signatures, liberations et diffusion des resultats labo.',
    tone: 'green',
  },
  {
    id: 'draft-series',
    title: 'Brouillons & series types',
    description: 'Preparation des essais a lancer depuis les echantillons, avec gabarits par methode.',
    tone: 'teal',
  },
  {
    id: 'operator-matrix',
    title: 'Affectation operateurs',
    description: 'Vue operateur, methode et couverture de paillasse par competences disponibles.',
    tone: 'sky',
  },
  {
    id: 'consumables',
    title: 'Consommables & ruptures',
    description: 'Stocks critiques, seuils mini et ruptures sur les consommables du laboratoire.',
    tone: 'red',
  },
]

const TERRAIN_FUTURE_AREAS = [
  {
    id: 'mission-prep',
    title: 'Preparation de mission',
    description: 'Ordres de mission, materiel, equipes et checklists prets avant depart terrain.',
    tone: 'amber',
  },
  {
    id: 'field-equipment',
    title: 'Materiel terrain & vehicules',
    description: 'Disponibilites, reservations, verifications et etalonnages des moyens terrain.',
    tone: 'red',
  },
  {
    id: 'field-return',
    title: 'Retours terrain & avis',
    description: 'Comptes rendus, photos, notes techniques et relais vers laboratoire et etudes.',
    tone: 'teal',
  },
  {
    id: 'requalification',
    title: 'Requalification & rematch',
    description: 'Consolidation des interventions brutes, reprises et rapprochements prelevements.',
    tone: 'sky',
  },
  {
    id: 'handover-circuit',
    title: 'Circuit de passation',
    description: 'Qui transmet quoi, a qui, avec accusés de reception et bouclage des suites.',
    tone: 'slate',
  },
]

function tonePanel(tone) {
  return TONES[tone]?.panel || TONES.slate.panel
}

function toneDot(tone) {
  return TONES[tone]?.dot || TONES.slate.dot
}

function toneSoft(tone) {
  return TONES[tone]?.soft || TONES.slate.soft
}

function toneValue(tone) {
  return TONES[tone]?.value || TONES.slate.value
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function pluralize(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`
}

function getDateMs(item, fields) {
  for (const field of fields) {
    const value = item?.[field]
    if (!value) continue
    const ms = new Date(value).getTime()
    if (!Number.isNaN(ms)) return ms
  }
  return 0
}

function sortByDateDesc(items, fields) {
  return [...items].sort((left, right) => getDateMs(right, fields) - getDateMs(left, fields))
}

function sortByDateAsc(items, fields) {
  return [...items].sort((left, right) => {
    const leftMs = getDateMs(left, fields)
    const rightMs = getDateMs(right, fields)
    if (!leftMs && !rightMs) return 0
    if (!leftMs) return 1
    if (!rightMs) return -1
    return leftMs - rightMs
  })
}

function isDemandeClosed(status) {
  return ['Fini', 'Envoyé - Perdu', 'Archivée'].includes(status)
}

function getEssaiDisplayStatus(essai) {
  if (essai?.date_fin) return 'Terminé'
  return essai?.statut || 'Programmé'
}

function getUrgencyRank(urgency) {
  return { late: 0, soon: 1, ok: 2, done: 3 }[urgency] ?? 9
}

function getInterventionAlertTone(level) {
  if (level === 'Critique' || level === 'Élevé') return 'red'
  if (level === 'Moyen') return 'amber'
  if (level === 'Faible') return 'sky'
  return 'slate'
}

function daysUntil(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function formatDeadline(value) {
  const days = daysUntil(value)
  if (days == null) return 'Sans échéance'
  if (days < 0) return `${Math.abs(days)} j de retard`
  if (days === 0) return "Échéance aujourd'hui"
  if (days <= 7) return `J-${days}`
  return formatDate(value)
}

function getNcSeverityRank(severity) {
  return { Majeure: 0, Mineure: 1, Observation: 2 }[severity] ?? 9
}

function getNcFocusTone(item) {
  if (!item) return 'slate'
  if (item.is_late) return 'red'
  if (item.severity === 'Majeure') return 'red'
  if (item.status === 'En cours') return 'amber'
  return 'sky'
}

function getQualityDocumentRank(item) {
  if (!item) return 99
  if (item.reviewDue) return 0
  if (item.status === 'En révision') return 1
  if (item.status === 'Obsolète') return 2
  if (item.status === 'Projet') return 3
  return 9
}

function getQualityDocumentTone(item) {
  if (!item) return 'slate'
  if (item.reviewDue) return 'red'
  if (item.status === 'En révision') return 'amber'
  if (item.status === 'Obsolète') return 'slate'
  if (item.status === 'Projet') return 'sky'
  return 'green'
}

function getQualityEquipmentRank(item) {
  if (!item) return 99
  if (item.status === 'Hors service') return 0
  if (item.status === 'En maintenance') return 1

  const remainingDays = daysUntil(item.next_metrology)
  if (remainingDays != null && remainingDays < 0) return 2
  if (remainingDays != null && remainingDays <= 30) return 3

  return 9
}

function getQualityEquipmentTone(item) {
  if (!item) return 'slate'
  if (item.status === 'Hors service') return 'red'
  if (item.status === 'En maintenance') return 'amber'

  const remainingDays = daysUntil(item.next_metrology)
  if (remainingDays != null && remainingDays < 0) return 'red'
  if (remainingDays != null && remainingDays <= 30) return 'amber'

  return 'sky'
}

function isLabEssaiFinished(essai) {
  if (essai?.date_fin) return true
  return ['fini', 'termine'].includes(normalizeText(essai?.statut))
}

function needsLabEssaiClosure(essai) {
  if (isLabEssaiFinished(essai)) return false

  const status = normalizeText(essai?.statut)
  const startAge = daysUntil(essai?.date_debut || essai?.created_at)

  return status === 'en cours' || Boolean(essai?.resultat_label) || (startAge != null && startAge <= -2)
}

function getLabEssaiTone(essai) {
  if (!essai) return 'slate'
  if (needsLabEssaiClosure(essai)) return essai?.resultat_label ? 'red' : 'amber'

  const status = normalizeText(essai?.statut)
  if (status === 'en cours') return 'amber'
  if (status === 'programme') return 'sky'
  if (isLabEssaiFinished(essai)) return 'green'

  return 'slate'
}

function getLabSampleTone(sample) {
  if (!sample) return 'slate'
  if (!String(sample.essai_code || '').trim()) return 'teal'

  const status = normalizeText(sample.statut)
  if (status === 'recu') return 'sky'
  if (status === 'en cours') return 'amber'

  return 'slate'
}

function isTerrainInterventionClosed(intervention) {
  return ['realisee', 'annulee'].includes(normalizeText(intervention?.statut))
}

function isTerrainInterventionDone(intervention) {
  return normalizeText(intervention?.statut) === 'realisee'
}

function isTerrainHighAlert(intervention) {
  return ['eleve', 'critique'].includes(normalizeText(intervention?.niveau_alerte))
}

function getTerrainInterventionRank(intervention) {
  if (!intervention || isTerrainInterventionClosed(intervention)) return 99
  if (isTerrainHighAlert(intervention)) return 0

  const interventionDay = daysUntil(intervention?.date_intervention || intervention?.created_at)
  if (interventionDay != null && interventionDay < 0) return 1
  if (interventionDay != null && interventionDay <= 3) return 2

  return 9
}

function getTerrainInterventionTone(intervention) {
  if (!intervention) return 'slate'
  if (isTerrainHighAlert(intervention)) return 'red'

  const interventionDay = daysUntil(intervention?.date_intervention || intervention?.created_at)
  if (interventionDay != null && interventionDay < 0) return 'amber'
  if (interventionDay != null && interventionDay <= 3) return 'sky'
  if (isTerrainInterventionDone(intervention)) return 'green'

  return getInterventionAlertTone(intervention?.niveau_alerte)
}

function getTerrainPassationRank(passation) {
  if (!passation) return 99

  const actions = Number(passation.nb_actions || 0)
  const docs = Number(passation.nb_documents || 0)

  if (actions > 0 && docs === 0) return 0
  if (actions > 0) return 1
  if (docs === 0) return 2

  return 9
}

function getTerrainPassationTone(passation) {
  if (!passation) return 'slate'

  const actions = Number(passation.nb_actions || 0)
  const docs = Number(passation.nb_documents || 0)

  if (actions > 0 && docs === 0) return 'red'
  if (actions > 0) return 'amber'
  if (docs === 0) return 'sky'

  return 'slate'
}

function getDemandeFocusRank(demande) {
  if (!demande || isDemandeClosed(demande.statut)) return 99
  if (demande.statut === 'À qualifier') return 0

  const deadline = daysUntil(demande.date_echeance)
  if (deadline != null && deadline < 0) return 1
  if (deadline != null && deadline <= 7) return 2

  return 3
}

function getDemandeFocusTone(demande) {
  if (!demande) return 'slate'
  if (demande.statut === 'À qualifier') return 'amber'

  const deadline = daysUntil(demande.date_echeance)
  if (deadline != null && deadline < 0) return 'red'
  if (deadline != null && deadline <= 7) return 'amber'

  return STATUS_TONES[demande.statut] || 'sky'
}

function TonePill({ tone = 'slate', children, className }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', tonePanel(tone), className)}>
      {children}
    </span>
  )
}

function StatusPill({ status }) {
  return <TonePill tone={STATUS_TONES[status] || 'slate'}>{status || '—'}</TonePill>
}

function UrgencyPill({ urgency }) {
  const label =
    urgency === 'late'
      ? 'En retard'
      : urgency === 'soon'
        ? 'Sous 7 j'
        : urgency === 'done'
          ? 'Clôturé'
          : 'Cadence ok'
  return <TonePill tone={URGENCY_TONES[urgency] || 'slate'}>{label}</TonePill>
}

function MetricCard({ label, value, subtitle, tone = 'slate', icon: Icon, onClick }) {
  return (
    <Card onClick={onClick} className="overflow-hidden">
      <CardBody className="relative flex items-start justify-between gap-4 p-4">
        <div className={cn('absolute inset-x-0 top-0 h-1.5', toneSoft(tone))} />
        <div className="pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
          <p className={cn('mt-3 text-3xl font-semibold leading-none', toneValue(tone))}>{value}</p>
          {subtitle ? <p className="mt-2 text-xs text-text-muted">{subtitle}</p> : null}
        </div>
        {Icon ? (
          <div className={cn('mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border', tonePanel(tone))}>
            <Icon size={18} />
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}

function QuickLink({ title, desc, stat, note, badge, badgeTone = 'slate', to, tone = 'slate', icon: Icon }) {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="group flex h-full items-start gap-3 rounded-[18px] border border-border bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border', tonePanel(tone))}>
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text">{title}</p>
            {stat ? <p className={cn('mt-1 text-base font-semibold', toneValue(tone))}>{stat}</p> : null}
          </div>
          {badge ? <TonePill tone={badgeTone} className="shrink-0">{badge}</TonePill> : null}
        </div>
        {desc ? <p className="mt-1 text-xs leading-relaxed text-text-muted">{desc}</p> : null}
        {note ? <p className="mt-2 text-[11px] font-medium text-text-muted">{note}</p> : null}
      </div>
      <ArrowRight size={14} className="mt-1 shrink-0 text-text-muted transition group-hover:translate-x-0.5" />
    </button>
  )
}

function SectionAction({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-[#185fa5] transition hover:text-[#0f477e]"
    >
      {label}
      <ArrowRight size={12} />
    </button>
  )
}

function SectionCard({ title, subtitle, actionLabel, onAction, className, children }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle ? <p className="mt-1 text-xs text-text-muted">{subtitle}</p> : null}
        </div>
        {actionLabel && onAction ? <SectionAction label={actionLabel} onClick={onAction} /> : null}
      </CardHeader>
      <CardBody className="flex flex-col gap-5">{children}</CardBody>
    </Card>
  )
}

function SubsectionHeader({ title, actionLabel, onAction }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">{title}</p>
      {actionLabel && onAction ? <SectionAction label={actionLabel} onClick={onAction} /> : null}
    </div>
  )
}

function MiniMetric({ label, value, tone = 'slate', help }) {
  return (
    <div className={cn('rounded-2xl border p-3', tonePanel(tone))}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none">{value}</p>
      {help ? <p className="mt-2 text-xs opacity-80">{help}</p> : null}
    </div>
  )
}

function ListFallback({ loading, label }) {
  return (
    <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-xs text-text-muted">
      {loading ? 'Chargement...' : label}
    </div>
  )
}

function ListRow({ title, subtitle, meta, trailing, leadingTone = 'slate', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-border bg-white px-4 py-3 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
    >
      <div className="flex items-start gap-3">
        <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', toneDot(leadingTone))} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-sm font-semibold text-text">{title}</p>
            {trailing ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">{trailing}</div> : null}
          </div>
          {subtitle ? <p className="mt-1 truncate text-xs text-text-muted">{subtitle}</p> : null}
          {meta ? <p className="mt-1 text-[11px] text-text-muted">{meta}</p> : null}
        </div>
      </div>
    </button>
  )
}

function WidgetToggle({ widget, active, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition',
        active
          ? 'border-[#d8e6e1] bg-[#f8fbfa]'
          : 'border-border bg-white hover:border-[#d8e6e1] hover:bg-[#f8fbfa]'
      )}
    >
      <div>
        <p className="text-sm font-semibold text-text">{widget.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{widget.description}</p>
      </div>
      <span
        className={cn(
          'inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
          active ? tonePanel('teal') : tonePanel('slate')
        )}
      >
        {active ? 'Visible' : 'Masque'}
      </span>
    </button>
  )
}

function FutureCapabilityCard({ title, description, tone = 'slate' }) {
  return (
    <div className={cn('rounded-2xl border p-3', tonePanel(tone))}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] opacity-80">A connecter</p>
        <TonePill tone={tone} className="border-current/20 bg-white/30">Future</TonePill>
      </div>
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mt-2 text-xs leading-relaxed opacity-90">{description}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isWidgetPickerOpen, setIsWidgetPickerOpen] = useState(false)
  const {
    availableWidgets,
    visibleWidgetIds,
    isWidgetVisible,
    resetWidgets,
    toggleWidget,
  } = useDashboardPreferences(user)

  const affairesQuery = useQuery({
    queryKey: ['affaires'],
    queryFn: () => affairesApi.list(),
  })

  const demandesQuery = useQuery({
    queryKey: ['demandes'],
    queryFn: () => demandesApi.list(),
  })

  const planningQuery = useQuery({
    queryKey: ['planning-demandes'],
    queryFn: () => planningApi.list(),
  })

  const passationsQuery = useQuery({
    queryKey: ['passations'],
    queryFn: () => passationsApi.list(),
  })

  const interventionsQuery = useQuery({
    queryKey: ['interventions'],
    queryFn: () => interventionsApi.list(),
  })

  const echantillonsQuery = useQuery({
    queryKey: ['echantillons-dashboard'],
    queryFn: () => echantillonsApi.list(),
  })

  const essaisQuery = useQuery({
    queryKey: ['essais-dashboard'],
    queryFn: () => essaisApi.list(),
  })

  const qualiteStatsQuery = useQuery({
    queryKey: ['qualite-stats'],
    queryFn: () => qualiteApi.stats(),
  })

  const metrologyAlertsQuery = useQuery({
    queryKey: ['qualite-metrology-alerts', 60],
    queryFn: () => api.get('/qualite/metrology/alerts?days=60'),
  })

  const qualiteEquipmentQuery = useQuery({
    queryKey: ['qualite-equipment-dashboard'],
    queryFn: () => qualiteApi.equipment.list(),
  })

  const qualiteProceduresQuery = useQuery({
    queryKey: ['qualite-procedures-dashboard'],
    queryFn: () => qualiteApi.procedures.list(),
  })

  const qualiteStandardsQuery = useQuery({
    queryKey: ['qualite-standards-dashboard'],
    queryFn: () => qualiteApi.standards.list(),
  })

  const qualiteNcQuery = useQuery({
    queryKey: ['qualite-nc-dashboard'],
    queryFn: () => qualiteApi.nc.list(),
  })

  const affaires = affairesQuery.data || []
  const demandes = demandesQuery.data || []
  const planning = planningQuery.data || []
  const passations = passationsQuery.data || []
  const interventions = interventionsQuery.data || []
  const echantillons = echantillonsQuery.data || []
  const essais = essaisQuery.data || []
  const qualiteStats = qualiteStatsQuery.data
  const metrologyAlerts = metrologyAlertsQuery.data || []
  const qualiteEquipment = qualiteEquipmentQuery.data || []
  const qualiteProcedures = qualiteProceduresQuery.data || []
  const qualiteStandards = qualiteStandardsQuery.data || []
  const qualiteNc = qualiteNcQuery.data || []

  const affairesEnCours = affaires.filter((affaire) => affaire.statut === 'En cours').length
  const affairesSousCharge = affaires.filter((affaire) => Number(affaire.nb_demandes_actives || 0) > 0).length

  const demandesActives = demandes.filter((demande) => !isDemandeClosed(demande.statut)).length
  const demandesAQualifier = demandes.filter((demande) => demande.statut === 'À qualifier').length

  const planningLate = planning.filter((item) => item.urg === 'late').length
  const planningSoon = planning.filter((item) => item.urg === 'soon').length
  const planningUnderTension = planningLate + planningSoon

  const essaisProgrammes = essais.filter((essai) => getEssaiDisplayStatus(essai) === 'Programmé').length
  const essaisEnCours = essais.filter((essai) => getEssaiDisplayStatus(essai) === 'En cours').length
  const essaisTermines = essais.filter((essai) => getEssaiDisplayStatus(essai) === 'Terminé').length
  const essaisActifs = essaisProgrammes + essaisEnCours

  const echantillonsRecus = echantillons.filter((echantillon) => echantillon.statut === 'Reçu').length
  const echantillonsEnCours = echantillons.filter((echantillon) => echantillon.statut === 'En cours').length

  const interventionsActives = interventions.filter(
    (intervention) => !['Réalisée', 'Annulée'].includes(intervention.statut)
  ).length
  const interventionsElevated = interventions.filter(
    (intervention) => !['Réalisée', 'Annulée'].includes(intervention.statut)
      && ['Élevé', 'Critique'].includes(intervention.niveau_alerte)
  ).length

  const passationsActions = passations.reduce((sum, passation) => sum + Number(passation.nb_actions || 0), 0)

  const ncOpen = qualiteStats?.nc_open ?? 0
  const ncLate = qualiteStats?.nc_late ?? 0
  const metrologyDue = qualiteStats?.metrology_due ?? 0
  const equipmentHs = qualiteStats?.equipment_hs ?? 0
  const proceduresRevision = qualiteStats?.procedures_revision ?? 0
  const standardsTotal = qualiteStats?.standards_total ?? 0
  const equipmentActive = qualiteStats?.equipment_active ?? 0

  const urgentPlanning = [...planning]
    .filter((item) => item.urg === 'late' || item.urg === 'soon')
    .sort((left, right) => {
      const urgencyDiff = getUrgencyRank(left.urg) - getUrgencyRank(right.urg)
      if (urgencyDiff) return urgencyDiff
      return getDateMs(left, ['ech', 'start']) - getDateMs(right, ['ech', 'start'])
    })
    .slice(0, 6)

  const priorityDemandes = [...demandes]
    .filter((demande) => !isDemandeClosed(demande.statut))
    .sort((left, right) => {
      const rankDiff = getDemandeFocusRank(left) - getDemandeFocusRank(right)
      if (rankDiff) return rankDiff

      const leftDeadline = daysUntil(left.date_echeance)
      const rightDeadline = daysUntil(right.date_echeance)
      if (leftDeadline != null || rightDeadline != null) {
        if (leftDeadline == null) return 1
        if (rightDeadline == null) return -1
        if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline
      }

      return getDateMs(right, ['updated_at', 'date_reception', 'created_at']) - getDateMs(left, ['updated_at', 'date_reception', 'created_at'])
    })
    .slice(0, 5)
  const recentEssais = sortByDateDesc(
    essais.filter((essai) => getEssaiDisplayStatus(essai) === 'Terminé' || essai.resultat_label),
    ['date_fin', 'updated_at', 'date_debut', 'created_at']
  ).slice(0, 5)
  const focusedInterventions = [...interventions]
    .filter((intervention) => intervention.statut !== 'Annulée')
    .sort((left, right) => {
      const leftDone = left.statut === 'Réalisée'
      const rightDone = right.statut === 'Réalisée'
      if (leftDone !== rightDone) return leftDone ? 1 : -1
      return getDateMs(left, ['date_intervention', 'created_at']) - getDateMs(right, ['date_intervention', 'created_at'])
    })
    .slice(0, 5)
  const recentPassations = sortByDateDesc(passations, ['date_passation', 'updated_at', 'created_at']).slice(0, 5)
  const focusMetrologyAlerts = sortByDateAsc(metrologyAlerts, ['valid_until', 'performed_on', 'created_at']).slice(0, 5)
  const overdueMetrologyCount = metrologyAlerts.filter((alert) => {
    const remainingDays = daysUntil(alert.valid_until)
    return remainingDays != null && remainingDays < 0
  }).length
  const equipmentMaintenance = qualiteEquipment.filter((item) => item.status === 'En maintenance').length
  const majorNcOpen = qualiteNc.filter(
    (item) => ['Ouverte', 'En cours'].includes(item.status) && item.severity === 'Majeure'
  ).length
  const proceduresReviewDue = qualiteProcedures.filter((item) => item.review_due).length
  const proceduresUnderWatch = qualiteProcedures.filter(
    (item) => item.review_due || item.status !== 'En vigueur'
  ).length
  const standardsWatch = qualiteStandards.filter((item) => item.status !== 'En vigueur').length
  const documentsUnderWatch = proceduresUnderWatch + standardsWatch

  const priorityQualityNc = [...qualiteNc]
    .filter((item) => ['Ouverte', 'En cours'].includes(item.status))
    .sort((left, right) => {
      if (left.is_late !== right.is_late) return left.is_late ? -1 : 1

      const severityDiff = getNcSeverityRank(left.severity) - getNcSeverityRank(right.severity)
      if (severityDiff) return severityDiff

      const leftDue = daysUntil(left.due_date)
      const rightDue = daysUntil(right.due_date)
      if (leftDue != null || rightDue != null) {
        if (leftDue == null) return 1
        if (rightDue == null) return -1
        if (leftDue !== rightDue) return leftDue - rightDue
      }

      return getDateMs(right, ['detected_on', 'created_at']) - getDateMs(left, ['detected_on', 'created_at'])
    })
    .slice(0, 4)

  const qualityDocumentItems = [
    ...qualiteProcedures
      .filter((item) => item.review_due || item.status !== 'En vigueur')
      .map((item) => ({
        key: `procedure-${item.uid}`,
        title: `${item.code} · ${item.title}`,
        subtitle: [item.technical_family || 'Sans famille', item.owner || 'Responsable non renseigné'].filter(Boolean).join(' - '),
        meta: item.review_date ? `Révision ${formatDate(item.review_date)}` : `Émission ${formatDate(item.issue_date)}`,
        statusLabel: item.review_due ? 'Révision due' : item.status,
        tone: getQualityDocumentTone({ status: item.status, reviewDue: item.review_due }),
        rank: getQualityDocumentRank({ status: item.status, reviewDue: item.review_due }),
      })),
    ...qualiteStandards
      .filter((item) => item.status !== 'En vigueur')
      .map((item) => ({
        key: `standard-${item.uid}`,
        title: `${item.code} · ${item.title}`,
        subtitle: [item.technical_family || 'Sans famille', item.issuer || 'Organisme non renseigné'].filter(Boolean).join(' - '),
        meta: item.issue_date ? `Publication ${formatDate(item.issue_date)}` : 'Date non renseignée',
        statusLabel: item.status,
        tone: getQualityDocumentTone({ status: item.status, reviewDue: false }),
        rank: getQualityDocumentRank({ status: item.status, reviewDue: false }),
      })),
  ]
    .sort((left, right) => {
      if (left.rank !== right.rank) return left.rank - right.rank
      return left.title.localeCompare(right.title, 'fr')
    })
    .slice(0, 4)

  const qualityEquipmentWatchlist = [...qualiteEquipment]
    .filter((item) => {
      if (item.status !== 'En service') return true
      const remainingDays = daysUntil(item.next_metrology)
      return remainingDays != null && remainingDays <= 30
    })
    .sort((left, right) => {
      const rankDiff = getQualityEquipmentRank(left) - getQualityEquipmentRank(right)
      if (rankDiff) return rankDiff
      return getDateMs(left, ['next_metrology', 'updated_at', 'created_at']) - getDateMs(right, ['next_metrology', 'updated_at', 'created_at'])
    })
    .slice(0, 4)

  const dataIssues = [
    affairesQuery.error ? 'Affaires' : null,
    demandesQuery.error ? 'Demandes' : null,
    planningQuery.error ? 'Planning' : null,
    passationsQuery.error ? 'Passations' : null,
    interventionsQuery.error ? 'Interventions' : null,
    echantillonsQuery.error ? 'Échantillons' : null,
    essaisQuery.error ? 'Essais' : null,
    qualiteStatsQuery.error ? 'Qualité' : null,
    metrologyAlertsQuery.error ? 'Métrologie' : null,
    qualiteEquipmentQuery.error ? 'Équipements qualité' : null,
    qualiteProceduresQuery.error ? 'Procédures' : null,
    qualiteStandardsQuery.error ? 'Normes' : null,
    qualiteNcQuery.error ? 'Non-conformités' : null,
  ].filter(Boolean)

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const displayName = user?.display_name || user?.username || ''
  const dashboardPresetLabel = getDashboardPresetLabel(user)
  const activeWidgetCount = visibleWidgetIds.length

  const showOverviewMetrics = isWidgetVisible('overview-metrics')
  const showModuleShortcuts = isWidgetVisible('module-shortcuts')
  const showPlanningFocus = isWidgetVisible('planning-focus')
  const showQualityCompliance = isWidgetVisible('quality-compliance')
  const showLabOverview = isWidgetVisible('lab-overview')
  const showTerrainPassations = isWidgetVisible('terrain-passations')
  const canViewDemandes = hasPermission(user, 'view_demandes')
  const canViewPlanning = hasPermission(user, 'view_planning')
  const canViewLabo = hasPermission(user, 'view_labo')

  const shortcutLinks = DASHBOARD_SHORTCUTS
    .filter((shortcut) => !shortcut.permission || hasPermission(user, shortcut.permission))
    .map((shortcut) => {
      if (shortcut.key === 'affaires') {
        return {
          ...shortcut,
          stat: affairesQuery.isLoading ? '…' : pluralize(affairesEnCours, 'affaire active', 'affaires actives'),
          desc: affairesQuery.isLoading ? 'Chargement...' : `${affairesSousCharge} avec demandes actives`,
          note: affairesSousCharge > 0 ? 'Reprendre les dossiers avec charge en cours.' : 'Portefeuille client et chantier à jour.',
          badge: affairesSousCharge > 0 ? 'Charge' : 'Suivi',
          badgeTone: affairesSousCharge > 0 ? 'teal' : 'slate',
          signalLabel: affairesSousCharge > 0 ? `${affairesSousCharge} sous charge` : `${affairesEnCours} en cours`,
          priorityRank: affairesSousCharge > 0 ? 2 : affairesEnCours > 0 ? 1 : 0,
        }
      }

      if (shortcut.key === 'demandes') {
        return {
          ...shortcut,
          stat: demandesQuery.isLoading ? '…' : pluralize(demandesActives, 'demande active', 'demandes actives'),
          desc: demandesQuery.isLoading ? 'Chargement...' : `${demandesAQualifier} à qualifier`,
          note:
            demandesAQualifier > 0
              ? 'Commencer par la qualification des nouvelles entrées.'
              : 'Ouvrir le flux demandes et les priorités courantes.',
          badge: demandesAQualifier > 0 ? 'À traiter' : demandesActives > 0 ? 'En flux' : 'Stable',
          badgeTone: demandesAQualifier > 0 ? 'amber' : demandesActives > 0 ? 'sky' : 'green',
          signalLabel: demandesAQualifier > 0 ? `${demandesAQualifier} à qualifier` : `${demandesActives} actives`,
          priorityRank: demandesAQualifier > 0 ? 3 : demandesActives > 0 ? 2 : 0,
        }
      }

      if (shortcut.key === 'planning') {
        return {
          ...shortcut,
          stat: planningQuery.isLoading ? '…' : pluralize(planningUnderTension, 'échéance tendue', 'échéances tendues'),
          desc: planningQuery.isLoading ? 'Chargement...' : `${planningLate} retards · ${planningSoon} sous 7 j`,
          note:
            planningLate > 0
              ? 'Commencer par les retards planning à résorber.'
              : planningSoon > 0
                ? 'Arbitrer les échéances proches.'
                : 'Planning sans tension immédiate.',
          badge: planningLate > 0 ? 'Urgent' : planningSoon > 0 ? 'Sous 7 j' : 'Cadencé',
          badgeTone: planningLate > 0 ? 'red' : planningSoon > 0 ? 'amber' : 'green',
          signalLabel:
            planningLate > 0
              ? `${planningLate} retards`
              : planningSoon > 0
                ? `${planningSoon} proches`
                : 'Ras',
          priorityRank: planningLate > 0 ? 3 : planningSoon > 0 ? 2 : 0,
        }
      }

      if (shortcut.key === 'labo') {
        return {
          ...shortcut,
          stat: essaisQuery.isLoading ? '…' : pluralize(essaisActifs, 'essai actif', 'essais actifs'),
          desc:
            essaisQuery.isLoading || interventionsQuery.isLoading || echantillonsQuery.isLoading
              ? 'Chargement...'
              : `${interventionsActives} interventions actives · ${echantillonsRecus} reçus`,
          note:
            interventionsElevated > 0
              ? `${pluralize(interventionsElevated, 'alerte élevée', 'alertes élevées')} côté interventions.`
              : echantillonsEnCours > 0
                ? `${pluralize(echantillonsEnCours, 'échantillon en cours', 'échantillons en cours')} en paillasse.`
                : 'Production laboratoire sous contrôle.',
          badge: interventionsElevated > 0 ? 'Alerte' : essaisActifs > 0 || interventionsActives > 0 ? 'Production' : 'Stable',
          badgeTone: interventionsElevated > 0 ? 'red' : essaisActifs > 0 || interventionsActives > 0 ? 'green' : 'slate',
          signalLabel:
            interventionsElevated > 0
              ? `${interventionsElevated} alertes`
              : essaisActifs > 0
                ? `${essaisActifs} essais actifs`
                : 'Flux labo',
          priorityRank: interventionsElevated > 0 ? 3 : essaisActifs > 0 || interventionsActives > 0 || echantillonsRecus > 0 ? 2 : 0,
        }
      }

      if (shortcut.key === 'passations') {
        return {
          ...shortcut,
          stat: passationsQuery.isLoading ? '…' : pluralize(passations.length, 'passation', 'passations'),
          desc: passationsQuery.isLoading ? 'Chargement...' : `${passationsActions} actions suivies`,
          note:
            passationsActions > 0
              ? 'Reprendre les transmissions chantier avec actions ouvertes.'
              : 'Accéder aux derniers échanges et documents terrain.',
          badge: passationsActions > 0 ? 'Actions' : 'Consultation',
          badgeTone: passationsActions > 0 ? 'amber' : 'slate',
          signalLabel: passationsActions > 0 ? `${passationsActions} actions` : `${passations.length} vues`,
          priorityRank: passationsActions > 0 ? 2 : passations.length > 0 ? 1 : 0,
        }
      }

      return {
        ...shortcut,
        stat: qualiteStatsQuery.isLoading ? '…' : pluralize(ncOpen, 'NC ouverte', 'NC ouvertes'),
        desc: qualiteStatsQuery.isLoading ? 'Chargement...' : `${metrologyDue} échéances métrologie · ${equipmentHs} eq. HS`,
        note:
          ncOpen > 0
            ? 'Traiter les non-conformités encore ouvertes.'
            : metrologyDue > 0 || equipmentHs > 0
              ? 'Arbitrer la conformité et les équipements à échéance.'
              : 'Périmètre qualité stable.',
        badge: ncOpen > 0 ? 'Alerte' : metrologyDue > 0 || equipmentHs > 0 ? 'Vigilance' : 'Stable',
        badgeTone: ncOpen > 0 ? 'red' : metrologyDue > 0 || equipmentHs > 0 ? 'amber' : 'green',
        signalLabel:
          ncOpen > 0
            ? `${ncOpen} NC`
            : metrologyDue > 0
              ? `${metrologyDue} échéances`
              : 'Qualité stable',
        priorityRank: ncOpen > 0 ? 3 : metrologyDue > 0 || equipmentHs > 0 ? 2 : 0,
      }
    })
    .sort((left, right) => {
      if (right.priorityRank !== left.priorityRank) return right.priorityRank - left.priorityRank
      return left.title.localeCompare(right.title, 'fr')
    })

  const highPriorityShortcutCount = shortcutLinks.filter((shortcut) => shortcut.priorityRank >= 3).length
  const mediumPriorityShortcutCount = shortcutLinks.filter((shortcut) => shortcut.priorityRank === 2).length

  let shortcutsHeadline = 'Navigation métier prête'
  let shortcutsHeadlineTone = 'green'
  if (highPriorityShortcutCount > 0) {
    shortcutsHeadline = `${pluralize(highPriorityShortcutCount, 'module prioritaire', 'modules prioritaires')} à ouvrir d'abord`
    shortcutsHeadlineTone = 'red'
  } else if (mediumPriorityShortcutCount > 0) {
    shortcutsHeadline = `${pluralize(mediumPriorityShortcutCount, 'module à surveiller', 'modules à surveiller')}`
    shortcutsHeadlineTone = 'amber'
  }

  const shortcutSignals = shortcutLinks
    .filter((shortcut) => shortcut.priorityRank >= 2)
    .slice(0, 3)
    .map((shortcut) => ({
      key: shortcut.key,
      tone: shortcut.badgeTone,
      label: `${shortcut.title}: ${shortcut.signalLabel}`,
    }))

  const planningFocusTitle = canViewDemandes && canViewPlanning
    ? 'Pilotage & planning'
    : canViewPlanning
      ? 'Planning opérationnel'
      : 'Pilotage demandes'
  const planningFocusSubtitle = canViewDemandes && canViewPlanning
    ? 'Demandes à cadrer et échéances à arbitrer sur le court terme.'
    : canViewPlanning
      ? 'Retards, échéances proches et arbitrages du planning.'
      : 'Qualification, priorités et dossiers à reprendre.'
  const planningFocusActionLabel = canViewPlanning ? 'Ouvrir le planning' : canViewDemandes ? 'Voir demandes' : null
  const planningFocusAction = canViewPlanning ? () => navigate('/planning') : canViewDemandes ? () => navigate('/demandes') : undefined
  const planningFocusMetrics = [
    {
      key: 'affaires-sous-charge',
      label: 'Affaires sous charge',
      value: affairesQuery.isLoading ? '…' : affairesSousCharge,
      tone: affairesSousCharge > 0 ? 'teal' : 'slate',
      help: 'avec demandes actives',
      visible: canViewDemandes || canViewPlanning,
    },
    {
      key: 'demandes-actives',
      label: 'Demandes actives',
      value: demandesQuery.isLoading ? '…' : demandesActives,
      tone: demandesActives > 0 ? 'sky' : 'slate',
      help: demandesAQualifier > 0 ? `${demandesAQualifier} à qualifier` : 'Flux en cours',
      visible: canViewDemandes,
    },
    {
      key: 'a-qualifier',
      label: 'À qualifier',
      value: demandesQuery.isLoading ? '…' : demandesAQualifier,
      tone: demandesAQualifier > 0 ? 'amber' : 'green',
      help: demandesAQualifier > 0 ? 'Qualification en attente' : 'Qualification à jour',
      visible: canViewDemandes,
    },
    {
      key: 'retards',
      label: 'Retards',
      value: planningQuery.isLoading ? '…' : planningLate,
      tone: planningLate > 0 ? 'red' : 'green',
      help: planningLate > 0 ? 'À absorber rapidement' : 'Aucun retard',
      visible: canViewPlanning,
    },
    {
      key: 'sous-7j',
      label: 'Sous 7 j',
      value: planningQuery.isLoading ? '…' : planningSoon,
      tone: planningSoon > 0 ? 'amber' : 'green',
      help: planningSoon > 0 ? 'Échéances proches' : 'Aucune urgence proche',
      visible: canViewPlanning,
    },
  ].filter((metric) => metric.visible)
  const planningMetricGridClassName = planningFocusMetrics.length >= 5
    ? 'grid-cols-2 lg:grid-cols-5'
    : planningFocusMetrics.length === 4
      ? 'grid-cols-2 lg:grid-cols-4'
      : planningFocusMetrics.length === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : planningFocusMetrics.length === 2
          ? 'grid-cols-1 sm:grid-cols-2'
          : 'grid-cols-1'

  let planningHeadline = 'Cadence pilotage stabilisée'
  let planningHeadlineTone = 'green'
  if (canViewPlanning && !planningQuery.isLoading && planningLate > 0) {
    planningHeadline = `${pluralize(planningLate, 'retard planning', 'retards planning')} à arbitrer`
    planningHeadlineTone = 'red'
  } else if (canViewDemandes && !demandesQuery.isLoading && demandesAQualifier > 0) {
    planningHeadline = `${pluralize(demandesAQualifier, 'demande à qualifier', 'demandes à qualifier')}`
    planningHeadlineTone = 'amber'
  } else if (canViewPlanning && !planningQuery.isLoading && planningSoon > 0) {
    planningHeadline = `${pluralize(planningSoon, 'échéance proche', 'échéances proches')} à cadrer`
    planningHeadlineTone = 'amber'
  } else if (canViewDemandes && !demandesQuery.isLoading && demandesActives > 0) {
    planningHeadline = `${pluralize(demandesActives, 'demande active', 'demandes actives')} en suivi`
    planningHeadlineTone = 'sky'
  }

  const planningSignals = [
    canViewDemandes && !demandesQuery.isLoading
      ? {
          key: 'demandes-a-qualifier',
          tone: demandesAQualifier > 0 ? 'amber' : 'green',
          label: demandesAQualifier > 0 ? `${demandesAQualifier} à qualifier` : 'Qualification à jour',
        }
      : null,
    canViewPlanning && !planningQuery.isLoading
      ? {
          key: 'planning-alerts',
          tone: planningLate > 0 ? 'red' : planningSoon > 0 ? 'amber' : 'green',
          label:
            planningLate > 0
              ? `${planningLate} retards planning`
              : planningSoon > 0
                ? `${planningSoon} échéances proches`
                : 'Planning sans tension',
        }
      : null,
    (canViewDemandes || canViewPlanning) && !affairesQuery.isLoading
      ? {
          key: 'affaires-sous-charge',
          tone: affairesSousCharge > 0 ? 'teal' : 'slate',
          label:
            affairesSousCharge > 0
              ? `${pluralize(affairesSousCharge, 'affaire sous charge', 'affaires sous charge')}`
              : 'Charge affaires maîtrisée',
        }
      : null,
  ].filter(Boolean)

  const qualityMetrics = [
    {
      key: 'nc-open',
      label: 'NC ouvertes',
      value: qualiteStatsQuery.isLoading ? '…' : ncOpen,
      tone: ncOpen > 0 ? 'red' : 'green',
      help: qualiteNcQuery.isLoading ? 'Chargement...' : majorNcOpen > 0 ? `${majorNcOpen} majeures` : 'Aucune critique',
    },
    {
      key: 'nc-late',
      label: 'NC en retard',
      value: qualiteStatsQuery.isLoading ? '…' : ncLate,
      tone: ncLate > 0 ? 'red' : 'green',
      help: ncLate > 0 ? 'Échéance dépassée' : 'Cadence tenue',
    },
    {
      key: 'metrology-due',
      label: 'Métrologie 60 j',
      value: qualiteStatsQuery.isLoading ? '…' : metrologyDue,
      tone: overdueMetrologyCount > 0 ? 'red' : metrologyDue > 0 ? 'amber' : 'green',
      help: metrologyAlertsQuery.isLoading ? 'Chargement...' : overdueMetrologyCount > 0 ? `${overdueMetrologyCount} dépassés` : 'À horizon 60 j',
    },
    {
      key: 'equipment-hs',
      label: 'Équip. HS',
      value: qualiteStatsQuery.isLoading ? '…' : equipmentHs,
      tone: equipmentHs > 0 ? 'red' : equipmentMaintenance > 0 ? 'amber' : 'green',
      help: qualiteEquipmentQuery.isLoading ? 'Chargement...' : equipmentMaintenance > 0 ? `${equipmentMaintenance} en maintenance` : `${equipmentActive} actifs`,
    },
    {
      key: 'procedures-revision',
      label: 'Procédures',
      value: qualiteStatsQuery.isLoading ? '…' : proceduresRevision,
      tone: proceduresRevision > 0 ? 'amber' : 'green',
      help: qualiteProceduresQuery.isLoading ? 'Chargement...' : proceduresReviewDue > 0 ? `${proceduresReviewDue} revues dues` : 'En révision',
    },
    {
      key: 'standards-watch',
      label: 'Normes à suivre',
      value: qualiteStandardsQuery.isLoading ? '…' : standardsWatch,
      tone: standardsWatch > 0 ? 'amber' : 'green',
      help: qualiteStandardsQuery.isLoading ? 'Chargement...' : `${standardsTotal} référencées`,
    },
  ]

  let qualityHeadline = 'Conformité globale sous contrôle'
  let qualityHeadlineTone = 'green'
  if (!qualiteStatsQuery.isLoading && ncLate > 0) {
    qualityHeadline = `${pluralize(ncLate, 'NC en retard', 'NC en retard')} à refermer`
    qualityHeadlineTone = 'red'
  } else if (!qualiteNcQuery.isLoading && majorNcOpen > 0) {
    qualityHeadline = `${pluralize(majorNcOpen, 'NC majeure ouverte', 'NC majeures ouvertes')}`
    qualityHeadlineTone = 'red'
  } else if (!metrologyAlertsQuery.isLoading && (overdueMetrologyCount > 0 || metrologyDue > 0 || equipmentHs > 0)) {
    qualityHeadline = overdueMetrologyCount > 0
      ? `${pluralize(overdueMetrologyCount, 'étalonnage dépassé', 'étalonnages dépassés')}`
      : equipmentHs > 0
        ? `${pluralize(equipmentHs, 'équipement hors service', 'équipements hors service')}`
        : `${pluralize(metrologyDue, 'échéance métrologie', 'échéances métrologie')}`
    qualityHeadlineTone = overdueMetrologyCount > 0 || equipmentHs > 0 ? 'red' : 'amber'
  } else if (!qualiteProceduresQuery.isLoading && !qualiteStandardsQuery.isLoading && documentsUnderWatch > 0) {
    qualityHeadline = `${pluralize(documentsUnderWatch, 'document à revoir', 'documents à revoir')}`
    qualityHeadlineTone = 'amber'
  }

  const qualitySignals = [
    !qualiteStatsQuery.isLoading
      ? {
          key: 'quality-nc',
          tone: ncOpen > 0 ? 'red' : 'green',
          label: ncOpen > 0 ? `${ncOpen} NC ouvertes` : 'Aucune NC ouverte',
        }
      : null,
    !metrologyAlertsQuery.isLoading
      ? {
          key: 'quality-metrology',
          tone: overdueMetrologyCount > 0 ? 'red' : metrologyDue > 0 ? 'amber' : 'green',
          label:
            overdueMetrologyCount > 0
              ? `${overdueMetrologyCount} étalonnages dépassés`
              : metrologyDue > 0
                ? `${metrologyDue} échéances métrologie`
                : 'Métrologie stable',
        }
      : null,
    !qualiteProceduresQuery.isLoading && !qualiteStandardsQuery.isLoading
      ? {
          key: 'quality-docs',
          tone: documentsUnderWatch > 0 ? 'amber' : 'green',
          label: documentsUnderWatch > 0 ? `${documentsUnderWatch} documents à revoir` : 'Documentation stable',
        }
      : null,
    {
      key: 'quality-future',
      tone: 'slate',
      label: `${QUALITY_FUTURE_AREAS.length} relais à connecter`,
    },
  ].filter(Boolean)

  const labOpenEssais = essais.filter((essai) => !isLabEssaiFinished(essai))
  const labClosureQueueCount = labOpenEssais.filter((essai) => needsLabEssaiClosure(essai)).length
  const labSamplesWithoutEssai = echantillons.filter((sample) => !String(sample.essai_code || '').trim()).length
  const labEssaisWithoutOperator = labOpenEssais.filter((essai) => !String(essai.operateur || '').trim()).length
  const labResultsPendingReview = labOpenEssais.filter((essai) => Boolean(essai.resultat_label)).length

  const labBenchCandidates = [...labOpenEssais]
    .filter((essai) => {
      const status = normalizeText(essai.statut)
      const startAge = daysUntil(essai.date_debut || essai.created_at)
      return status === 'en cours' || (startAge != null && startAge >= -1)
    })
    .sort((left, right) => {
      const leftRunning = normalizeText(left.statut) === 'en cours' ? 0 : 1
      const rightRunning = normalizeText(right.statut) === 'en cours' ? 0 : 1
      if (leftRunning !== rightRunning) return leftRunning - rightRunning
      return getDateMs(left, ['date_debut', 'created_at']) - getDateMs(right, ['date_debut', 'created_at'])
    })

  const focusLabBenchEssais = (labBenchCandidates.length > 0
    ? labBenchCandidates
    : sortByDateAsc(labOpenEssais, ['date_debut', 'created_at']))
    .slice(0, 4)

  const labClosureFocus = [...labOpenEssais]
    .filter((essai) => needsLabEssaiClosure(essai))
    .sort((left, right) => {
      const leftWithResult = left.resultat_label ? 0 : 1
      const rightWithResult = right.resultat_label ? 0 : 1
      if (leftWithResult !== rightWithResult) return leftWithResult - rightWithResult
      return getDateMs(left, ['date_debut', 'created_at']) - getDateMs(right, ['date_debut', 'created_at'])
    })
    .slice(0, 4)

  const labSampleQueue = [...echantillons]
    .filter((sample) => {
      const status = normalizeText(sample.statut)
      return !String(sample.essai_code || '').trim() || ['recu', 'importe', 'en cours'].includes(status)
    })
    .sort((left, right) => {
      const leftWithoutEssai = !String(left.essai_code || '').trim() ? 0 : 1
      const rightWithoutEssai = !String(right.essai_code || '').trim() ? 0 : 1
      if (leftWithoutEssai !== rightWithoutEssai) return leftWithoutEssai - rightWithoutEssai
      return getDateMs(right, ['date_reception_labo', 'date_prelevement', 'created_at'])
        - getDateMs(left, ['date_reception_labo', 'date_prelevement', 'created_at'])
    })
    .slice(0, 4)

  const labMetrics = [
    {
      key: 'ech-recus',
      label: 'Éch. reçus',
      value: echantillonsQuery.isLoading ? '…' : echantillonsRecus,
      tone: echantillonsRecus > 0 ? 'sky' : 'green',
      help: labSamplesWithoutEssai > 0 ? `${labSamplesWithoutEssai} sans essai lancé` : 'Réceptions à jour',
    },
    {
      key: 'sans-essai',
      label: 'Sans essai lancé',
      value: echantillonsQuery.isLoading ? '…' : labSamplesWithoutEssai,
      tone: labSamplesWithoutEssai > 0 ? 'teal' : 'green',
      help: labSamplesWithoutEssai > 0 ? 'À orienter vers une série' : 'Tous orientés',
    },
    {
      key: 'paillasse',
      label: 'Paillasse active',
      value: essaisQuery.isLoading ? '…' : labOpenEssais.length,
      tone: labOpenEssais.length > 0 ? 'amber' : 'green',
      help: focusLabBenchEssais.length > 0 ? `${focusLabBenchEssais.length} séries du moment` : 'Aucune série ouverte',
    },
    {
      key: 'a-cloturer',
      label: 'À clôturer',
      value: essaisQuery.isLoading ? '…' : labClosureQueueCount,
      tone: labClosureQueueCount > 0 ? (labResultsPendingReview > 0 ? 'red' : 'amber') : 'green',
      help: labResultsPendingReview > 0 ? `${labResultsPendingReview} résultats saisis` : 'Clôture à jour',
    },
    {
      key: 'essais-termines',
      label: 'Essais terminés',
      value: essaisQuery.isLoading ? '…' : essaisTermines,
      tone: essaisTermines > 0 ? 'green' : 'slate',
      help: recentEssais.length > 0 ? `${recentEssais.length} récents visibles` : 'Aucun résultat récent',
    },
    {
      key: 'sans-operateur',
      label: 'Sans opérateur',
      value: essaisQuery.isLoading ? '…' : labEssaisWithoutOperator,
      tone: labEssaisWithoutOperator > 0 ? 'amber' : 'green',
      help: labEssaisWithoutOperator > 0 ? 'Affectations à fiabiliser' : 'Affectations remplies',
    },
  ]

  let labHeadline = 'Flux laboratoire maîtrisé'
  let labHeadlineTone = 'green'
  if (!essaisQuery.isLoading && labClosureQueueCount > 0) {
    labHeadline = `${pluralize(labClosureQueueCount, 'essai à clôturer', 'essais à clôturer')}`
    labHeadlineTone = labResultsPendingReview > 0 ? 'red' : 'amber'
  } else if (!echantillonsQuery.isLoading && labSamplesWithoutEssai > 0) {
    labHeadline = `${pluralize(labSamplesWithoutEssai, 'échantillon sans essai lancé', 'échantillons sans essai lancé')}`
    labHeadlineTone = 'teal'
  } else if (!essaisQuery.isLoading && labEssaisWithoutOperator > 0) {
    labHeadline = `${pluralize(labEssaisWithoutOperator, 'essai sans opérateur', 'essais sans opérateur')}`
    labHeadlineTone = 'amber'
  } else if (!essaisQuery.isLoading && labOpenEssais.length > 0) {
    labHeadline = `${pluralize(labOpenEssais.length, 'essai en paillasse', 'essais en paillasse')}`
    labHeadlineTone = 'amber'
  }

  const labSignals = [
    !echantillonsQuery.isLoading
      ? {
          key: 'lab-samples',
          tone: labSamplesWithoutEssai > 0 ? 'teal' : echantillonsRecus > 0 ? 'sky' : 'green',
          label:
            labSamplesWithoutEssai > 0
              ? `${labSamplesWithoutEssai} sans essai lancé`
              : echantillonsRecus > 0
                ? `${echantillonsRecus} reçus`
                : 'Réception calme',
        }
      : null,
    !essaisQuery.isLoading
      ? {
          key: 'lab-closure',
          tone: labClosureQueueCount > 0 ? (labResultsPendingReview > 0 ? 'red' : 'amber') : 'green',
          label: labClosureQueueCount > 0 ? `${labClosureQueueCount} clôtures à faire` : 'Clôture à jour',
        }
      : null,
    !essaisQuery.isLoading
      ? {
          key: 'lab-operators',
          tone: labEssaisWithoutOperator > 0 ? 'amber' : 'green',
          label: labEssaisWithoutOperator > 0 ? `${labEssaisWithoutOperator} sans opérateur` : 'Affectations remplies',
        }
      : null,
    {
      key: 'lab-future',
      tone: 'slate',
      label: `${LAB_FUTURE_AREAS.length} relais à connecter`,
    },
  ].filter(Boolean)

  const terrainOpenInterventions = interventions.filter((intervention) => !isTerrainInterventionClosed(intervention))
  const terrainHighAlertInterventions = terrainOpenInterventions.filter((intervention) => isTerrainHighAlert(intervention))
  const terrainOverdueInterventions = terrainOpenInterventions.filter((intervention) => {
    const interventionDay = daysUntil(intervention.date_intervention || intervention.created_at)
    return interventionDay != null && interventionDay < 0
  })
  const terrainTodayInterventions = terrainOpenInterventions.filter((intervention) => {
    const interventionDay = daysUntil(intervention.date_intervention || intervention.created_at)
    return interventionDay === 0
  })
  const terrainSoonInterventions = terrainOpenInterventions.filter((intervention) => {
    const interventionDay = daysUntil(intervention.date_intervention || intervention.created_at)
    return interventionDay != null && interventionDay > 0 && interventionDay <= 3
  })
  const terrainWindowCount = terrainTodayInterventions.length + terrainSoonInterventions.length
  const terrainPassationsWithActions = passations.filter((passation) => Number(passation.nb_actions || 0) > 0).length
  const terrainPassationsWithoutDocs = passations.filter((passation) => Number(passation.nb_documents || 0) === 0).length
  const terrainDocumentsTracked = passations.reduce((sum, passation) => sum + Number(passation.nb_documents || 0), 0)

  const terrainCoordinationInterventions = [...terrainOpenInterventions]
    .filter((intervention) => {
      const interventionDay = daysUntil(intervention.date_intervention || intervention.created_at)
      return isTerrainHighAlert(intervention) || (interventionDay != null && interventionDay < 0) || (interventionDay != null && interventionDay <= 3)
    })
    .sort((left, right) => {
      const rankDiff = getTerrainInterventionRank(left) - getTerrainInterventionRank(right)
      if (rankDiff) return rankDiff
      return getDateMs(left, ['date_intervention', 'created_at']) - getDateMs(right, ['date_intervention', 'created_at'])
    })
    .slice(0, 4)

  const terrainWindowInterventions = (
    [...terrainOpenInterventions]
      .filter((intervention) => {
        const interventionDay = daysUntil(intervention.date_intervention || intervention.created_at)
        return interventionDay != null && interventionDay >= 0 && interventionDay <= 3
      })
      .sort((left, right) => getDateMs(left, ['date_intervention', 'created_at']) - getDateMs(right, ['date_intervention', 'created_at']))
  )
  const focusTerrainWindowInterventions = (terrainWindowInterventions.length > 0
    ? terrainWindowInterventions
    : sortByDateAsc(terrainOpenInterventions, ['date_intervention', 'created_at']))
    .slice(0, 4)

  const terrainPassationCandidates = [...passations]
    .filter((passation) => Number(passation.nb_actions || 0) > 0 || Number(passation.nb_documents || 0) === 0)
    .sort((left, right) => {
      const rankDiff = getTerrainPassationRank(left) - getTerrainPassationRank(right)
      if (rankDiff) return rankDiff
      return getDateMs(right, ['date_passation', 'updated_at', 'created_at']) - getDateMs(left, ['date_passation', 'updated_at', 'created_at'])
    })

  const terrainPassationWatchlist = (terrainPassationCandidates.length > 0
    ? terrainPassationCandidates
    : sortByDateDesc(passations, ['date_passation', 'updated_at', 'created_at']))
    .slice(0, 4)

  const terrainRecentRelayFeed = [
    ...sortByDateDesc(
      interventions.filter((intervention) => isTerrainInterventionDone(intervention)),
      ['date_intervention', 'updated_at', 'created_at']
    )
      .slice(0, 4)
      .map((intervention) => ({
        key: `intervention-${intervention.uid}`,
        kind: 'intervention',
        dateMs: getDateMs(intervention, ['date_intervention', 'updated_at', 'created_at']),
        item: intervention,
      })),
    ...sortByDateDesc(passations, ['date_passation', 'updated_at', 'created_at'])
      .slice(0, 4)
      .map((passation) => ({
        key: `passation-${passation.uid}`,
        kind: 'passation',
        dateMs: getDateMs(passation, ['date_passation', 'updated_at', 'created_at']),
        item: passation,
      })),
  ]
    .sort((left, right) => right.dateMs - left.dateMs)
    .slice(0, 4)

  const terrainMetrics = [
    {
      key: 'terrain-open',
      label: 'Interventions ouvertes',
      value: interventionsQuery.isLoading ? '…' : terrainOpenInterventions.length,
      tone: terrainOpenInterventions.length > 0 ? 'sky' : 'green',
      help: terrainHighAlertInterventions.length > 0 ? `${terrainHighAlertInterventions.length} alertes hautes` : 'Flux terrain en cours',
    },
    {
      key: 'terrain-alerts',
      label: 'Alertes hautes',
      value: interventionsQuery.isLoading ? '…' : terrainHighAlertInterventions.length,
      tone: terrainHighAlertInterventions.length > 0 ? 'red' : 'green',
      help: terrainHighAlertInterventions.length > 0 ? 'Coordination immediate' : 'Aucune alerte elevee',
    },
    {
      key: 'terrain-overdue',
      label: 'Retards terrain',
      value: interventionsQuery.isLoading ? '…' : terrainOverdueInterventions.length,
      tone: terrainOverdueInterventions.length > 0 ? 'amber' : 'green',
      help: terrainOverdueInterventions.length > 0 ? 'Sorties a recaler' : 'Cadence tenue',
    },
    {
      key: 'terrain-window',
      label: 'Sorties 72 h',
      value: interventionsQuery.isLoading ? '…' : terrainWindowCount,
      tone: terrainWindowCount > 0 ? 'teal' : 'green',
      help: terrainWindowCount > 0 ? `${terrainTodayInterventions.length} aujourd'hui · ${terrainSoonInterventions.length} a venir` : 'Fenetre calme',
    },
    {
      key: 'passations-open',
      label: 'Passations a boucler',
      value: passationsQuery.isLoading ? '…' : terrainPassationsWithActions,
      tone: terrainPassationsWithActions > 0 ? 'amber' : 'green',
      help: passationsActions > 0 ? `${passationsActions} actions suivies` : 'Aucune action ouverte',
    },
    {
      key: 'passations-docs',
      label: 'Sans docs',
      value: passationsQuery.isLoading ? '…' : terrainPassationsWithoutDocs,
      tone: terrainPassationsWithoutDocs > 0 ? 'sky' : 'green',
      help: terrainDocumentsTracked > 0 ? `${terrainDocumentsTracked} documents traces` : 'Aucun document remonte',
    },
  ]

  let terrainHeadline = 'Terrain et transmissions sous controle'
  let terrainHeadlineTone = 'green'
  if (!interventionsQuery.isLoading && terrainHighAlertInterventions.length > 0) {
    terrainHeadline = `${pluralize(terrainHighAlertInterventions.length, 'intervention critique', 'interventions critiques')} a arbitrer`
    terrainHeadlineTone = 'red'
  } else if (!interventionsQuery.isLoading && terrainOverdueInterventions.length > 0) {
    terrainHeadline = `${pluralize(terrainOverdueInterventions.length, 'retard terrain', 'retards terrain')} a recaler`
    terrainHeadlineTone = 'amber'
  } else if (!passationsQuery.isLoading && terrainPassationsWithActions > 0) {
    terrainHeadline = `${pluralize(terrainPassationsWithActions, 'passation avec action', 'passations avec actions')}`
    terrainHeadlineTone = 'amber'
  } else if (!interventionsQuery.isLoading && terrainWindowCount > 0) {
    terrainHeadline = `${pluralize(terrainWindowCount, 'sortie terrain a preparer', 'sorties terrain a preparer')}`
    terrainHeadlineTone = 'sky'
  }

  const terrainSignals = [
    !interventionsQuery.isLoading
      ? {
          key: 'terrain-alert',
          tone: terrainHighAlertInterventions.length > 0 ? 'red' : terrainOverdueInterventions.length > 0 ? 'amber' : 'green',
          label:
            terrainHighAlertInterventions.length > 0
              ? `${terrainHighAlertInterventions.length} alertes hautes`
              : terrainOverdueInterventions.length > 0
                ? `${terrainOverdueInterventions.length} retards terrain`
                : 'Terrain cale',
        }
      : null,
    !interventionsQuery.isLoading
      ? {
          key: 'terrain-window',
          tone: terrainWindowCount > 0 ? 'sky' : 'green',
          label: terrainWindowCount > 0 ? `${terrainWindowCount} sorties sur 72 h` : 'Aucune sortie proche',
        }
      : null,
    !passationsQuery.isLoading
      ? {
          key: 'terrain-passations',
          tone: terrainPassationsWithActions > 0 ? 'amber' : terrainPassationsWithoutDocs > 0 ? 'sky' : 'green',
          label:
            terrainPassationsWithActions > 0
              ? `${passationsActions} actions de passation`
              : terrainPassationsWithoutDocs > 0
                ? `${terrainPassationsWithoutDocs} sans doc`
                : 'Transmissions stables',
        }
      : null,
    {
      key: 'terrain-future',
      tone: 'slate',
      label: `${TERRAIN_FUTURE_AREAS.length} relais à connecter`,
    },
  ].filter(Boolean)

  const overviewMetrics = [
    {
      id: 'affaires',
      label: 'Affaires en cours',
      value: affairesQuery.isLoading ? '…' : affairesEnCours,
      subtitle: affairesQuery.isLoading ? 'Chargement...' : `${affairesSousCharge} avec demandes actives`,
      tone: 'teal',
      icon: Briefcase,
      onClick: () => navigate(`/affaires?statut=${encodeURIComponent('En cours')}`),
      visible: true,
    },
    {
      id: 'demandes',
      label: 'Demandes actives',
      value: demandesQuery.isLoading ? '…' : demandesActives,
      subtitle: demandesQuery.isLoading ? 'Chargement...' : `${demandesAQualifier} à qualifier`,
      tone: 'sky',
      icon: ClipboardList,
      onClick: () => navigate('/demandes?statut=__active__'),
      visible: canViewDemandes,
    },
    {
      id: 'planning',
      label: 'Planning sous tension',
      value: planningQuery.isLoading ? '…' : planningUnderTension,
      subtitle: planningQuery.isLoading ? 'Chargement...' : `${planningLate} en retard - ${planningSoon} sous 7 j`,
      tone: 'amber',
      icon: Clock3,
      onClick: () => navigate('/planning?filter=soon'),
      visible: canViewPlanning,
    },
    {
      id: 'essais',
      label: 'Essais actifs',
      value: essaisQuery.isLoading ? '…' : essaisActifs,
      subtitle: essaisQuery.isLoading ? 'Chargement...' : `${essaisEnCours} en cours - ${essaisProgrammes} programmés`,
      tone: 'green',
      icon: TestTube2,
      onClick: () => navigate('/labo/workbench?tab=essais&status=__active__'),
      visible: canViewLabo,
    },
    {
      id: 'nc-open',
      label: 'NC ouvertes',
      value: qualiteStatsQuery.isLoading ? '…' : ncOpen,
      subtitle: qualiteStatsQuery.isLoading ? 'Chargement...' : `${ncLate} en retard - ${equipmentHs} eq. HS`,
      tone: ncOpen > 0 ? 'red' : 'slate',
      icon: TriangleAlert,
      onClick: () => navigate('/qualite?tab=nc&status=__open__'),
      visible: true,
    },
    {
      id: 'metrology',
      label: 'Métrologie à échéance',
      value: qualiteStatsQuery.isLoading ? '…' : metrologyDue,
      subtitle: metrologyAlertsQuery.isLoading ? 'Chargement...' : `${focusMetrologyAlerts.length} alertes visibles`,
      tone: metrologyDue > 0 ? 'amber' : 'sky',
      icon: CalendarClock,
      onClick: () => navigate('/qualite?tab=metrology&days=60'),
      visible: true,
    },
  ].filter((metric) => metric.visible)

  let overviewHeadline = 'Synthèse en cours de chargement'
  let overviewHeadlineTone = 'slate'
  if (canViewPlanning && !planningQuery.isLoading && planningLate > 0) {
    overviewHeadline = `${pluralize(planningLate, 'retard planning', 'retards planning')} à traiter`
    overviewHeadlineTone = 'red'
  } else if (!qualiteStatsQuery.isLoading && ncOpen > 0) {
    overviewHeadline = `${pluralize(ncOpen, 'NC ouverte', 'NC ouvertes')} à surveiller`
    overviewHeadlineTone = 'red'
  } else if (canViewDemandes && !demandesQuery.isLoading && demandesAQualifier > 0) {
    overviewHeadline = `${pluralize(demandesAQualifier, 'demande à qualifier', 'demandes à qualifier')}`
    overviewHeadlineTone = 'amber'
  } else if (canViewLabo && !interventionsQuery.isLoading && interventionsElevated > 0) {
    overviewHeadline = `${pluralize(interventionsElevated, 'intervention à alerte élevée', 'interventions à alerte élevée')}`
    overviewHeadlineTone = 'amber'
  } else if (!affairesQuery.isLoading) {
    overviewHeadline = 'Cadence globale stable'
    overviewHeadlineTone = 'green'
  }

  const overviewSignals = [
    canViewDemandes && !demandesQuery.isLoading
      ? {
          key: 'demandes-a-qualifier',
          tone: demandesAQualifier > 0 ? 'amber' : 'sky',
          label:
            demandesAQualifier > 0
              ? `${pluralize(demandesAQualifier, 'demande à qualifier', 'demandes à qualifier')}`
              : 'Flux demandes qualifié',
        }
      : null,
    canViewPlanning && !planningQuery.isLoading
      ? {
          key: 'planning-alerts',
          tone: planningLate > 0 ? 'red' : planningSoon > 0 ? 'amber' : 'green',
          label:
            planningLate > 0
              ? `${pluralize(planningLate, 'retard planning', 'retards planning')}`
              : planningSoon > 0
                ? `${pluralize(planningSoon, 'échéance proche', 'échéances proches')}`
                : 'Planning sans retard',
        }
      : null,
    canViewLabo && !interventionsQuery.isLoading
      ? {
          key: 'labo-alerts',
          tone: interventionsElevated > 0 ? 'red' : 'green',
          label:
            interventionsElevated > 0
              ? `${pluralize(interventionsElevated, 'intervention critique', 'interventions critiques')}`
              : 'Interventions sous contrôle',
        }
      : null,
    !qualiteStatsQuery.isLoading
      ? {
          key: 'quality-alerts',
          tone: ncOpen > 0 || metrologyDue > 0 ? 'amber' : 'green',
          label:
            ncOpen > 0 || metrologyDue > 0
              ? `${ncOpen} NC - ${metrologyDue} échéances métrologie`
              : 'Conformité stable',
        }
      : null,
  ].filter(Boolean)

  const heroHighlights = []
  if (!demandesQuery.isLoading) heroHighlights.push(pluralize(demandesActives, 'demande active', 'demandes actives'))
  if (!planningQuery.isLoading) {
    heroHighlights.push(
      planningLate > 0
        ? `${pluralize(planningLate, 'retard planning', 'retards planning')}`
        : 'Planning sans retard'
    )
  }
  if (!essaisQuery.isLoading) heroHighlights.push(pluralize(essaisActifs, 'essai actif', 'essais actifs'))
  if (!qualiteStatsQuery.isLoading) heroHighlights.push(ncOpen > 0 ? pluralize(ncOpen, 'NC ouverte', 'NC ouvertes') : 'Aucune NC ouverte')
  if (heroHighlights.length === 0) heroHighlights.push('Chargement des indicateurs...')

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
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Vue opérationnelle</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {greeting}{displayName ? `, ${displayName}` : ''}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">
              Pilotage transversal des affaires, du planning, du laboratoire, du terrain et de la conformité.
            </p>
            <p className="mt-3 text-sm text-white/70">
              {now.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {heroHighlights.map((label) => (
                <span key={label} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-white/15 bg-white/10 p-4 backdrop-blur-sm lg:max-w-md">
            <div className="flex items-center gap-2 text-white/85">
              <ShieldAlert size={15} />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">Sources reliées</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {DOMAIN_BADGES.map((label) => (
                <span key={label} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-medium text-white/80">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {dataIssues.length > 0 ? (
        <Card className="border-[#efc2bf] bg-[#fdf7f6]">
          <CardBody className="flex items-start gap-3 p-4">
            <TriangleAlert size={18} className="mt-0.5 shrink-0 text-[#a32d2d]" />
            <div>
              <p className="text-sm font-semibold text-[#7a2925]">Données partielles</p>
              <p className="mt-1 text-xs text-[#8d4a44]">
                Certaines sources ne sont pas remontées pour le dashboard: {dataIssues.join(', ')}.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Mon dashboard configurable</CardTitle>
            <p className="mt-1 text-xs text-text-muted">
              Activez les widgets que vous voulez garder. De nouveaux widgets pourront etre ajoutes ensuite sans refaire une page par utilisateur.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <TonePill tone="teal">{activeWidgetCount}/{availableWidgets.length} widgets</TonePill>
            <TonePill tone="slate">{dashboardPresetLabel}</TonePill>
            <button
              type="button"
              onClick={() => setIsWidgetPickerOpen((current) => !current)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-text transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
            >
              <SlidersHorizontal size={13} />
              {isWidgetPickerOpen ? 'Fermer' : 'Configurer'}
            </button>
            <button
              type="button"
              onClick={resetWidgets}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-text transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
            >
              <RotateCcw size={13} />
              Reinitialiser
            </button>
          </div>
        </CardHeader>
        {isWidgetPickerOpen ? (
          <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableWidgets.map((widget) => (
              <WidgetToggle
                key={widget.id}
                widget={widget}
                active={isWidgetVisible(widget.id)}
                onToggle={() => toggleWidget(widget.id)}
              />
            ))}
          </CardBody>
        ) : null}
      </Card>

      {activeWidgetCount === 0 ? (
        <Card>
          <CardBody className="flex flex-col gap-3 p-5">
            <p className="text-sm font-semibold text-text">Aucun widget visible</p>
            <p className="text-xs text-text-muted">
              Le dashboard est pret, mais tous les widgets sont masques. Reinitialisez ou reouvrez la configuration pour en reactiver.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {showOverviewMetrics ? (
        <SectionCard
          title="Indicateurs globaux"
          subtitle="Lecture instantanée du périmètre autorisé. Les cartes affichées s'adaptent au rôle et ouvrent directement le module concerné."
        >
          <div className="flex flex-wrap gap-2">
            <TonePill tone={overviewHeadlineTone}>{overviewHeadline}</TonePill>
            <TonePill tone="slate">{pluralize(overviewMetrics.length, 'indicateur visible', 'indicateurs visibles')}</TonePill>
            {overviewSignals.map((signal) => (
              <TonePill key={signal.key} tone={signal.tone}>{signal.label}</TonePill>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {overviewMetrics.map((metric) => (
              <MetricCard
                key={metric.id}
                label={metric.label}
                value={metric.value}
                subtitle={metric.subtitle}
                tone={metric.tone}
                icon={metric.icon}
                onClick={metric.onClick}
              />
            ))}
          </div>
        </SectionCard>
      ) : null}

      {showModuleShortcuts ? (
        <SectionCard
          title="Accès rapides"
          subtitle="Modules triés selon les signaux du moment et votre périmètre d'accès."
        >
          <div className="flex flex-wrap gap-2">
            <TonePill tone={shortcutsHeadlineTone}>{shortcutsHeadline}</TonePill>
            <TonePill tone="slate">{pluralize(shortcutLinks.length, 'module disponible', 'modules disponibles')}</TonePill>
            {shortcutSignals.map((signal) => (
              <TonePill key={signal.key} tone={signal.tone}>{signal.label}</TonePill>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shortcutLinks.map((shortcut) => (
              <QuickLink
                key={shortcut.key}
                title={shortcut.title}
                stat={shortcut.stat}
                desc={shortcut.desc}
                note={shortcut.note}
                badge={shortcut.badge}
                badgeTone={shortcut.badgeTone}
                to={shortcut.to}
                tone={shortcut.tone}
                icon={shortcut.icon}
              />
            ))}
          </div>
        </SectionCard>
      ) : null}

      {showPlanningFocus || showQualityCompliance ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {showPlanningFocus ? (
            <SectionCard
              title={planningFocusTitle}
              subtitle={planningFocusSubtitle}
              actionLabel={planningFocusActionLabel}
              onAction={planningFocusAction}
              className={showQualityCompliance ? 'xl:col-span-2' : 'xl:col-span-3'}
            >
              <div className="flex flex-wrap gap-2">
                <TonePill tone={planningHeadlineTone}>{planningHeadline}</TonePill>
                <TonePill tone="slate">{pluralize(planningFocusMetrics.length, 'repère visible', 'repères visibles')}</TonePill>
                {planningSignals.map((signal) => (
                  <TonePill key={signal.key} tone={signal.tone}>{signal.label}</TonePill>
                ))}
              </div>

              <div className={cn('grid gap-2', planningMetricGridClassName)}>
                {planningFocusMetrics.map((metric) => (
                  <MiniMetric
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                    help={metric.help}
                  />
                ))}
              </div>

              <div className={cn('grid grid-cols-1 gap-4', canViewDemandes && canViewPlanning ? 'md:grid-cols-2' : '')}>
                {canViewDemandes ? (
                  <div className="flex flex-col gap-2">
                    <SubsectionHeader title="Demandes à cadrer" actionLabel="Voir demandes" onAction={() => navigate('/demandes')} />
                    {priorityDemandes.length === 0 ? (
                      <ListFallback loading={demandesQuery.isLoading} label="Aucune demande prioritaire." />
                    ) : (
                      priorityDemandes.map((demande) => (
                        <ListRow
                          key={demande.uid}
                          title={demande.reference}
                          subtitle={[
                            demande.chantier || demande.client || demande.affaire || 'Sans contexte',
                            demande.labo_code || '',
                          ].filter(Boolean).join(' - ')}
                          meta={
                            demande.date_echeance
                              ? formatDeadline(demande.date_echeance)
                              : `Maj ${formatDate(demande.updated_at || demande.date_reception || demande.created_at)}`
                          }
                          trailing={<StatusPill status={demande.statut} />}
                          leadingTone={getDemandeFocusTone(demande)}
                          onClick={() => navigate(`/demandes/${demande.uid}`)}
                        />
                      ))
                    )}
                  </div>
                ) : null}

                {canViewPlanning ? (
                  <div className="flex flex-col gap-2">
                    <SubsectionHeader title="Échéances à arbitrer" actionLabel="Voir planning" onAction={() => navigate('/planning')} />
                    {urgentPlanning.length === 0 ? (
                      <ListFallback loading={planningQuery.isLoading} label="Aucune urgence planning." />
                    ) : (
                      urgentPlanning.map((item) => (
                        <ListRow
                          key={item.uid}
                          title={item.ref}
                          subtitle={[item.tit || 'Sans chantier', item.labo || '', item.stat || ''].filter(Boolean).join(' - ')}
                          meta={item.ech ? `Échéance ${formatDate(item.ech)}` : 'Sans échéance'}
                          trailing={<UrgencyPill urgency={item.urg} />}
                          leadingTone={URGENCY_TONES[item.urg] || 'slate'}
                          onClick={() => navigate(`/demandes/${item.uid}`)}
                        />
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          {showQualityCompliance ? (
            <SectionCard
              title="Qualité & conformité"
              subtitle="Incidents qualité, métrologie, parc matériel, documents et relais de conformité à brancher ensuite."
              actionLabel="Ouvrir qualité"
              onAction={() => navigate('/qualite')}
              className={showPlanningFocus ? '' : 'xl:col-span-3'}
            >
              <div className="flex flex-wrap gap-2">
                <TonePill tone={qualityHeadlineTone}>{qualityHeadline}</TonePill>
                <TonePill tone="slate">{pluralize(qualityMetrics.length, 'repère qualité', 'repères qualité')}</TonePill>
                {qualitySignals.map((signal) => (
                  <TonePill key={signal.key} tone={signal.tone}>{signal.label}</TonePill>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {qualityMetrics.map((metric) => (
                  <MiniMetric
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                    help={metric.help}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-2">
                <SubsectionHeader title="NC prioritaires" actionLabel="Voir qualité" onAction={() => navigate('/qualite')} />
                {priorityQualityNc.length === 0 ? (
                  <ListFallback loading={qualiteNcQuery.isLoading} label="Aucune non-conformité prioritaire." />
                ) : (
                  priorityQualityNc.map((item) => (
                    <ListRow
                      key={item.uid}
                      title={item.reference}
                      subtitle={[item.title || 'Sans titre', item.source_type || '', item.owner || 'Responsable non renseigné'].filter(Boolean).join(' - ')}
                      meta={item.due_date ? formatDeadline(item.due_date) : `Détectée ${formatDate(item.detected_on || item.created_at)}`}
                      trailing={
                        <>
                          <StatusPill status={item.status} />
                          <TonePill tone={item.severity === 'Majeure' ? 'red' : item.severity === 'Mineure' ? 'amber' : 'slate'}>{item.severity}</TonePill>
                        </>
                      }
                      leadingTone={getNcFocusTone(item)}
                      onClick={() => navigate('/qualite')}
                    />
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2">
                <SubsectionHeader title="Métrologie à surveiller" actionLabel="Voir qualité" onAction={() => navigate('/qualite')} />
                {focusMetrologyAlerts.length === 0 ? (
                  <ListFallback loading={metrologyAlertsQuery.isLoading} label="Aucune alerte métrologie." />
                ) : (
                  focusMetrologyAlerts.map((alert) => {
                    const remainingDays = daysUntil(alert.valid_until)
                    const alertTone = remainingDays != null && remainingDays < 0 ? 'red' : 'amber'

                    return (
                      <ListRow
                        key={alert.uid}
                        title={[alert.eq_code, alert.eq_label].filter(Boolean).join(' - ') || `Contrôle #${alert.uid}`}
                        subtitle={[alert.control_type, alert.provider || alert.eq_category].filter(Boolean).join(' - ')}
                        meta={[alert.status, alert.eq_category].filter(Boolean).join(' - ')}
                        trailing={<TonePill tone={alertTone}>{formatDeadline(alert.valid_until)}</TonePill>}
                        leadingTone={alertTone}
                        onClick={() => navigate('/qualite')}
                      />
                    )
                  })
                )}
              </div>

              <div className="flex flex-col gap-2">
                <SubsectionHeader title="Documents & référentiels" actionLabel="Voir qualité" onAction={() => navigate('/qualite')} />
                {qualityDocumentItems.length === 0 ? (
                  <ListFallback loading={qualiteProceduresQuery.isLoading || qualiteStandardsQuery.isLoading} label="Documentation stable." />
                ) : (
                  qualityDocumentItems.map((item) => (
                    <ListRow
                      key={item.key}
                      title={item.title}
                      subtitle={item.subtitle}
                      meta={item.meta}
                      trailing={<TonePill tone={item.tone}>{item.statusLabel}</TonePill>}
                      leadingTone={item.tone}
                      onClick={() => navigate('/qualite')}
                    />
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2">
                <SubsectionHeader title="Équipements à risque" actionLabel="Voir qualité" onAction={() => navigate('/qualite')} />
                {qualityEquipmentWatchlist.length === 0 ? (
                  <ListFallback loading={qualiteEquipmentQuery.isLoading} label="Aucun équipement à risque immédiat." />
                ) : (
                  qualityEquipmentWatchlist.map((item) => {
                    const equipmentTone = getQualityEquipmentTone(item)
                    const equipmentLabel = item.status !== 'En service'
                      ? item.status
                      : item.next_metrology
                        ? formatDeadline(item.next_metrology)
                        : 'Surveillance'

                    return (
                      <ListRow
                        key={item.uid}
                        title={[item.code, item.label].filter(Boolean).join(' - ')}
                        subtitle={[item.category || '', item.domain || '', item.lieu || ''].filter(Boolean).join(' - ')}
                        meta={item.next_metrology ? `Métrologie ${formatDate(item.next_metrology)}` : 'Aucune prochaine métrologie renseignée'}
                        trailing={<TonePill tone={equipmentTone}>{equipmentLabel}</TonePill>}
                        leadingTone={equipmentTone}
                        onClick={() => navigate('/qualite')}
                      />
                    )
                  })
                )}
              </div>

              <div className="flex flex-col gap-2">
                <SubsectionHeader title="Périmètres à connecter" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {QUALITY_FUTURE_AREAS.map((item) => (
                    <FutureCapabilityCard
                      key={item.id}
                      title={item.title}
                      description={item.description}
                      tone={item.tone}
                    />
                  ))}
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      {showLabOverview || showTerrainPassations ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {showLabOverview ? (
            <SectionCard
              title="Laboratoire"
              subtitle="Réception, paillasse, clôture, résultats et couches labo à connecter progressivement."
              actionLabel="Ouvrir labo"
              onAction={() => navigate('/labo')}
              className={showTerrainPassations ? '' : 'xl:col-span-3'}
            >
              <div className="flex flex-wrap gap-2">
                <TonePill tone={labHeadlineTone}>{labHeadline}</TonePill>
                <TonePill tone="slate">{pluralize(labMetrics.length, 'repère labo', 'repères labo')}</TonePill>
                {labSignals.map((signal) => (
                  <TonePill key={signal.key} tone={signal.tone}>{signal.label}</TonePill>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {labMetrics.map((metric) => (
                  <MiniMetric
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                    help={metric.help}
                  />
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Paillasse du moment" actionLabel="Workbench essais" onAction={() => navigate('/essais-workbench')} />
                  {focusLabBenchEssais.length === 0 ? (
                    <ListFallback loading={essaisQuery.isLoading} label="Aucune série active détectée." />
                  ) : (
                    focusLabBenchEssais.map((essai) => {
                      const essaiStatus = getEssaiDisplayStatus(essai)
                      return (
                        <ListRow
                          key={essai.uid}
                          title={essai.essai_code || essai.type_essai || essai.reference || `Essai #${essai.uid}`}
                          subtitle={[
                            essai.echantillon_reference || essai.ech_ref || 'Échantillon non renseigné',
                            essai.chantier || essai.demande_reference || essai.designation || '',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            formatDate(essai.date_debut || essai.created_at),
                            essai.operateur ? `Opérateur ${essai.operateur}` : 'Opérateur à affecter',
                          ].filter(Boolean).join(' - ')}
                          trailing={
                            essai.resultat_label
                              ? <TonePill tone="green">Résultat saisi</TonePill>
                              : <StatusPill status={essaiStatus} />
                          }
                          leadingTone={getLabEssaiTone(essai)}
                          onClick={() => navigate(`/essais/${essai.uid}`)}
                        />
                      )
                    })
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Échantillons à orienter" actionLabel="Voir labo" onAction={() => navigate('/labo/workbench?tab=echantillons')} />
                  {labSampleQueue.length === 0 ? (
                    <ListFallback loading={echantillonsQuery.isLoading} label="Aucun échantillon en attente d'orientation." />
                  ) : (
                    labSampleQueue.map((sample) => {
                      const sampleTone = getLabSampleTone(sample)
                      const sampleBadge = !String(sample.essai_code || '').trim()
                        ? 'Sans essai lancé'
                        : `Essai ${sample.essai_code}`

                      return (
                        <ListRow
                          key={sample.uid}
                          title={sample.reference || `Échantillon #${sample.uid}`}
                          subtitle={[
                            sample.nature || 'Échantillon',
                            sample.chantier || sample.demande_reference || 'Sans contexte',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            sample.date_reception_labo
                              ? `Réception ${formatDate(sample.date_reception_labo)}`
                              : sample.date_prelevement
                                ? `Prélèvement ${formatDate(sample.date_prelevement)}`
                                : null,
                            sample.demande_reference || '',
                          ].filter(Boolean).join(' - ')}
                          trailing={<TonePill tone={sampleTone}>{sampleBadge}</TonePill>}
                          leadingTone={sampleTone}
                          onClick={() => navigate(`/echantillons/${sample.uid}`)}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Clôtures & validations" actionLabel="Workbench essais" onAction={() => navigate('/essais-workbench')} />
                  {labClosureFocus.length === 0 ? (
                    <ListFallback loading={essaisQuery.isLoading} label="Aucune clôture critique visible." />
                  ) : (
                    labClosureFocus.map((essai) => {
                      const essaiStatus = getEssaiDisplayStatus(essai)
                      const closureTone = essai.resultat_label ? 'red' : 'amber'

                      return (
                        <ListRow
                          key={essai.uid}
                          title={essai.essai_code || essai.type_essai || essai.reference || `Essai #${essai.uid}`}
                          subtitle={[
                            essai.echantillon_reference || essai.ech_ref || 'Échantillon non renseigné',
                            essai.demande_reference || essai.chantier || '',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            formatDate(essai.date_debut || essai.created_at),
                            essai.resultat_label ? 'Résultat saisi à relire' : 'Clôture de production à faire',
                          ].filter(Boolean).join(' - ')}
                          trailing={<TonePill tone={closureTone}>{essai.resultat_label ? 'À valider' : essaiStatus}</TonePill>}
                          leadingTone={closureTone}
                          onClick={() => navigate(`/essais/${essai.uid}`)}
                        />
                      )
                    })
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Résultats récents" actionLabel="Voir labo" onAction={() => navigate('/labo/workbench?tab=essais')} />
                  {recentEssais.length === 0 ? (
                    <ListFallback loading={essaisQuery.isLoading} label="Aucun essai terminé récent." />
                  ) : (
                    recentEssais.map((essai) => {
                      const essaiStatus = getEssaiDisplayStatus(essai)
                      return (
                        <ListRow
                          key={essai.uid}
                          title={essai.essai_code || essai.type_essai || essai.reference || `Essai #${essai.uid}`}
                          subtitle={[
                            essai.echantillon_reference || essai.ech_ref || 'Échantillon non renseigné',
                            essai.chantier || essai.demande_reference || essai.designation || '',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            formatDate(essai.date_fin || essai.date_debut || essai.created_at),
                            essai.operateur ? `Opérateur ${essai.operateur}` : '',
                          ].filter(Boolean).join(' - ')}
                          trailing={
                            essai.resultat_label
                              ? <span className="max-w-[10rem] truncate text-[11px] font-semibold text-[#14655d]">{essai.resultat_label}</span>
                              : <StatusPill status={essaiStatus} />
                          }
                          leadingTone={STATUS_TONES[essaiStatus] || 'slate'}
                          onClick={() => navigate(`/essais/${essai.uid}`)}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <SubsectionHeader title="Périmètres labo à connecter" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {LAB_FUTURE_AREAS.map((item) => (
                    <FutureCapabilityCard
                      key={item.id}
                      title={item.title}
                      description={item.description}
                      tone={item.tone}
                    />
                  ))}
                </div>
              </div>
            </SectionCard>
          ) : null}

          {showTerrainPassations ? (
            <SectionCard
              title="Terrain & passations"
              subtitle="Coordination des interventions, fenetre terrain a tres court terme, transmissions chantier et futurs relais a connecter."
              actionLabel="Ouvrir passations"
              onAction={() => navigate('/passations')}
              className={showLabOverview ? 'xl:col-span-2' : 'xl:col-span-3'}
            >
              <div className="flex flex-wrap gap-2">
                <TonePill tone={terrainHeadlineTone}>{terrainHeadline}</TonePill>
                <TonePill tone="slate">{pluralize(terrainMetrics.length, 'repère terrain', 'repères terrain')}</TonePill>
                {terrainSignals.map((signal) => (
                  <TonePill key={signal.key} tone={signal.tone}>{signal.label}</TonePill>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                {terrainMetrics.map((metric) => (
                  <MiniMetric
                    key={metric.key}
                    label={metric.label}
                    value={metric.value}
                    tone={metric.tone}
                    help={metric.help}
                  />
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Interventions à arbitrer" actionLabel="Voir labo" onAction={() => navigate('/labo/workbench?tab=interventions')} />
                  {terrainCoordinationInterventions.length === 0 ? (
                    <ListFallback loading={interventionsQuery.isLoading} label="Aucune intervention prioritaire à arbitrer." />
                  ) : (
                    terrainCoordinationInterventions.map((intervention) => {
                      const interventionTone = getTerrainInterventionTone(intervention)
                      const deadlineLabel = formatDeadline(intervention.date_intervention || intervention.created_at)

                      return (
                        <ListRow
                          key={intervention.uid}
                          title={intervention.reference || `Intervention #${intervention.uid}`}
                          subtitle={[
                            intervention.type_intervention || 'Intervention',
                            intervention.sujet || intervention.chantier || intervention.client || '',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            formatDate(intervention.date_intervention || intervention.created_at),
                            intervention.demande_reference || intervention.affaire_reference || '',
                          ].filter(Boolean).join(' - ')}
                          trailing={
                            intervention.niveau_alerte && intervention.niveau_alerte !== 'Aucun'
                              ? (
                                <>
                                  <StatusPill status={intervention.statut || 'Planifiée'} />
                                  <TonePill tone={interventionTone}>{intervention.niveau_alerte}</TonePill>
                                </>
                              )
                              : <TonePill tone={interventionTone}>{deadlineLabel}</TonePill>
                          }
                          leadingTone={interventionTone}
                          onClick={() => navigate(`/interventions/${intervention.uid}`)}
                        />
                      )
                    })
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Fenêtre terrain J0-J+3" actionLabel="Voir labo" onAction={() => navigate('/labo/workbench?tab=interventions')} />
                  {focusTerrainWindowInterventions.length === 0 ? (
                    <ListFallback loading={interventionsQuery.isLoading} label="Aucune sortie terrain proche visible." />
                  ) : (
                    focusTerrainWindowInterventions.map((intervention) => {
                      const interventionTone = getTerrainInterventionTone(intervention)
                      return (
                        <ListRow
                          key={intervention.uid}
                          title={intervention.reference || `Intervention #${intervention.uid}`}
                          subtitle={[
                            intervention.chantier || intervention.sujet || intervention.client || 'Sans contexte',
                            intervention.type_intervention || 'Intervention',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            formatDeadline(intervention.date_intervention || intervention.created_at),
                            intervention.demande_reference || intervention.affaire_reference || '',
                          ].filter(Boolean).join(' - ')}
                          trailing={<StatusPill status={intervention.statut || 'Planifiée'} />}
                          leadingTone={interventionTone}
                          onClick={() => navigate(`/interventions/${intervention.uid}`)}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Passations à boucler" actionLabel="Voir passations" onAction={() => navigate('/passations')} />
                  {terrainPassationWatchlist.length === 0 ? (
                    <ListFallback loading={passationsQuery.isLoading} label="Aucune passation à surveiller." />
                  ) : (
                    terrainPassationWatchlist.map((passation) => {
                      const passationTone = getTerrainPassationTone(passation)
                      const actions = Number(passation.nb_actions || 0)
                      const docs = Number(passation.nb_documents || 0)
                      const passationLabel = actions > 0 ? `${actions} actions` : docs > 0 ? `${docs} docs` : 'Sans doc'

                      return (
                        <ListRow
                          key={passation.uid}
                          title={passation.reference || `Passation #${passation.uid}`}
                          subtitle={[
                            passation.phase_operation || passation.operation_type || 'Passation chantier',
                            passation.chantier || passation.client || '',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            formatDate(passation.date_passation || passation.updated_at || passation.created_at),
                            passation.affaire_ref || passation.source || '',
                          ].filter(Boolean).join(' - ')}
                          trailing={<TonePill tone={passationTone}>{passationLabel}</TonePill>}
                          leadingTone={passationTone}
                          onClick={() => navigate(`/passations/${passation.uid}`)}
                        />
                      )
                    })
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <SubsectionHeader title="Retours & transmissions récents" actionLabel="Voir passations" onAction={() => navigate('/passations')} />
                  {terrainRecentRelayFeed.length === 0 ? (
                    <ListFallback loading={interventionsQuery.isLoading || passationsQuery.isLoading} label="Aucun retour terrain ou transmission récente." />
                  ) : (
                    terrainRecentRelayFeed.map((entry) => {
                      if (entry.kind === 'intervention') {
                        const intervention = entry.item
                        return (
                          <ListRow
                            key={entry.key}
                            title={intervention.reference || `Intervention #${intervention.uid}`}
                            subtitle={[
                              intervention.type_intervention || 'Intervention',
                              intervention.chantier || intervention.client || '',
                            ].filter(Boolean).join(' - ')}
                            meta={[
                              formatDate(intervention.date_intervention || intervention.updated_at || intervention.created_at),
                              intervention.demande_reference || intervention.affaire_reference || '',
                            ].filter(Boolean).join(' - ')}
                            trailing={<TonePill tone="teal">Retour terrain</TonePill>}
                            leadingTone="teal"
                            onClick={() => navigate(`/interventions/${intervention.uid}`)}
                          />
                        )
                      }

                      const passation = entry.item
                      const passationTone = getTerrainPassationTone(passation)
                      const actions = Number(passation.nb_actions || 0)
                      const docs = Number(passation.nb_documents || 0)
                      const relayLabel = actions > 0 ? `${actions} actions` : docs > 0 ? `${docs} docs` : 'Transmission'

                      return (
                        <ListRow
                          key={entry.key}
                          title={passation.reference || `Passation #${passation.uid}`}
                          subtitle={[
                            passation.phase_operation || passation.operation_type || 'Passation chantier',
                            passation.chantier || passation.client || '',
                          ].filter(Boolean).join(' - ')}
                          meta={[
                            formatDate(passation.date_passation || passation.updated_at || passation.created_at),
                            passation.source || passation.affaire_ref || '',
                          ].filter(Boolean).join(' - ')}
                          trailing={<TonePill tone={passationTone}>{relayLabel}</TonePill>}
                          leadingTone={passationTone}
                          onClick={() => navigate(`/passations/${passation.uid}`)}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <SubsectionHeader title="Périmètres terrain à connecter" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {TERRAIN_FUTURE_AREAS.map((item) => (
                    <FutureCapabilityCard
                      key={item.id}
                      title={item.title}
                      description={item.description}
                      tone={item.tone}
                    />
                  ))}
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}