import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import Card, { CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn, formatDate } from '@/lib/utils'
import { echantillonsApi, essaisApi, interventionsApi, planningApi } from '@/services/api'
import {
  Activity,
  ArrowRight,
  Calculator,
  CalendarClock,
  ClipboardList,
  FileText,
  FlaskConical,
  Layers3,
  Package,
  TestTube2,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import {
  getTechnicianProfileBySlug,
  matchesTechnicianProfile,
} from '@/lib/technicianProfiles'

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

const CLOSED_INTERVENTION_STATUSES = new Set(['realisee', 'annulee'])
const FINISHED_ESSAI_STATUSES = new Set(['fini', 'termine'])
const DAY_MS = 24 * 60 * 60 * 1000
const ROLE_CHECKLISTS = {
  terrain: {
    planning: [
      'Verifier les sorties du jour et le materiel terrain.',
      'Confirmer les sites sensibles et les contraintes chantier.',
      'Preparer le retour rapide des prelevements vers le labo.',
    ],
    backlog: [
      'Recaler les interventions depassees avant decalage supplementaire.',
      'Escalader les alertes elevees ou critiques au bon interlocuteur.',
      'Pointer les dossiers terrain qui bloquent une suite labo.',
    ],
    closure: [
      'Faire redescendre les essais restes ouverts apres intervention.',
      'Verifier les rattachements echantillon / chantier / demande.',
      'Boucler les comptes rendus de fin de sequence terrain.',
    ],
  },
  coordination: {
    planning: [
      'Arbitrer les dossiers G3 a preparer en priorite.',
      'Preparer hypotheses de calcul pour Alyze et Taleron.',
      'Cadencer la redaction des notes techniques et avis.',
    ],
    backlog: [
      'Assembler les resultats utiles aux dimensionnements en attente.',
      'Verifier les ecarts entre terrain, labo et preparation.',
      'Prioriser les sujets qui demandent synthese ou retour client.',
    ],
    closure: [
      'Transformer les resultats disponibles en notes ou avis exploitables.',
      'Verrouiller les hypotheses et calculs avant emission.',
      'Synchroniser les retours techniques avec la charge terrain.',
    ],
  },
  lab: {
    planning: [
      'Verifier la paillasse du jour et les series a lancer.',
      'Distribuer les echantillons recus entre preparation et essais.',
      'Remonter rapidement les blocages de production labo.',
    ],
    backlog: [
      'Cloturer les essais en cours avec resultats et etiquettes.',
      'Verifier les chaines ID / VBS / MB avant accumulation.',
      'Ranger les echantillons sans essai ou sans rattachement clair.',
    ],
    closure: [
      'Solder les productions ouvertes et consolider les resultats.',
      'Verifier reception, datation et coherence des echantillons.',
      'Boucler les fins de serie avant passage au suivant.',
    ],
  },
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

function toneClass(tone) {
  return TONES[tone] || TONES.slate
}

function toneDotClass(tone) {
  return TONE_DOTS[tone] || TONE_DOTS.slate
}

function normalizeIntervention(row, index) {
  return {
    uid: row.uid ?? row.id ?? `intervention-${index}`,
    reference: row.reference || `Intervention #${row.uid ?? index}`,
    date: row.date_intervention || row.date || row.created_at || '',
    type: row.type_intervention || 'Intervention',
    subject: row.sujet || '',
    status: row.statut || 'Planifiee',
    technicien: row.technicien || '',
    geotechnicien: row.geotechnicien || '',
    laboCode: row.labo_code || row.labo || '',
    chantier: row.chantier || row.site || '',
    demandeReference: row.demande_reference || row.demande_ref || '',
    niveauAlerte: row.niveau_alerte || 'Aucun',
  }
}

function normalizeEssai(row, index) {
  return {
    uid: row.uid ?? row.id ?? `essai-${index}`,
    reference: row.reference || `Essai #${row.uid ?? index}`,
    code: row.essai_code || row.code_essai || row.type_essai || '',
    label: row.resultat_label || row.type_essai || row.designation || '',
    operator: row.operateur || '',
    status: row.statut || 'Programme',
    dateStart: row.date_debut || '',
    dateEnd: row.date_fin || '',
    laboCode: row.labo_code || row.labo || '',
    echantillonReference: row.echantillon_reference || row.ech_ref || '',
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

function normalizeEchantillon(row, index) {
  return {
    uid: row.uid ?? row.id ?? `echantillon-${index}`,
    reference: row.reference || `Echantillon #${row.uid ?? index}`,
    status: row.statut || 'Importe',
    laboCode: row.labo_code || row.labo || '',
    receptionDate: row.date_reception_labo || row.date_reception || '',
    samplingDate: row.date_prelevement || '',
    demandeReference: row.demande_reference || row.demande_ref || '',
    chantier: row.chantier || row.site || row.localisation || '',
    nature: row.nature || row.designation || '',
    essaiCode: row.essai_code || row.code_essai || '',
  }
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

function compareAsc(left, right) {
  return toDateMs(left) - toDateMs(right)
}

function compareDesc(left, right) {
  return toDateMs(right) - toDateMs(left)
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

function isBeforeToday(value) {
  const diff = dayDiffFromToday(value)
  return diff !== null && diff < 0
}

function isWithinNextDays(value, days) {
  const diff = dayDiffFromToday(value)
  return diff !== null && diff >= 0 && diff <= days
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

function isInterventionClosed(row) {
  return CLOSED_INTERVENTION_STATUSES.has(normalizeText(row.status))
}

function isEssaiFinished(row) {
  return !!row.dateEnd || FINISHED_ESSAI_STATUSES.has(normalizeText(row.status))
}

function isHighAlert(value) {
  return ['eleve', 'critique'].includes(normalizeText(value))
}

function statusTone(status) {
  const normalized = normalizeText(status)
  if (normalized === 'en cours') return 'amber'
  if (['fini', 'termine', 'realisee'].includes(normalized)) return 'green'
  if (['planifiee', 'programme'].includes(normalized)) return 'sky'
  if (normalized === 'annulee') return 'slate'
  return 'slate'
}

function planningTone(urgency) {
  if (urgency === 'late') return 'red'
  if (urgency === 'soon') return 'amber'
  if (urgency === 'done') return 'green'
  return 'sky'
}

function planningRank(urgency) {
  return {
    late: 0,
    soon: 1,
    ok: 2,
    done: 3,
  }[urgency] ?? 10
}

function needsEssaiClosure(row) {
  if (isEssaiFinished(row)) return false
  const status = normalizeText(row.status)
  const diff = dayDiffFromToday(row.dateStart)
  return status === 'en cours' || !!row.resultLabel || (diff !== null && diff <= -2)
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

function buildInterventionEntry(row, options = {}) {
  return {
    key: `intervention-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.type, row.subject || row.chantier || 'Sans contexte']),
    meta: buildMeta([
      row.date ? formatDate(row.date) : '',
      row.demandeReference || row.laboCode || '',
      options.extraMeta,
    ]),
    tone: options.tone || statusTone(row.status),
    badge: options.badge || row.status,
    badgeTone: options.badgeTone || options.tone || statusTone(row.status),
    to: `/interventions/${row.uid}`,
  }
}

function buildEssaiEntry(row, options = {}) {
  return {
    key: `essai-${row.uid}`,
    title: row.code || row.reference,
    subtitle: buildMeta([
      row.echantillonReference || 'Echantillon non renseigne',
      row.chantier || row.demandeReference || row.label,
    ]),
    meta: buildMeta([
      row.dateStart ? formatDate(row.dateStart) : row.dateEnd ? formatDate(row.dateEnd) : '',
      row.laboCode || '',
      options.extraMeta,
    ]),
    tone: options.tone || statusTone(row.status),
    badge: options.badge || row.resultLabel || row.status,
    badgeTone: options.badgeTone || options.tone || statusTone(row.status),
    to: `/essais/${row.uid}`,
  }
}

function buildPlanningEntry(row, options = {}) {
  return {
    key: `planning-${row.uid}`,
    title: row.reference,
    subtitle: row.title || 'Dossier de preparation',
    meta: buildMeta([
      row.deadline ? formatDate(row.deadline) : row.start ? formatDate(row.start) : '',
      row.laboLabel || row.status || '',
      options.extraMeta,
    ]),
    tone: options.tone || planningTone(row.urgency),
    badge: options.badge || (row.urgency === 'late' ? 'Retard' : row.urgency === 'soon' ? 'A arbitrer' : row.status || 'Planning'),
    badgeTone: options.badgeTone || options.tone || planningTone(row.urgency),
    to: '/planning',
  }
}

function buildSampleEntry(row, options = {}) {
  return {
    key: `echantillon-${row.uid}`,
    title: row.reference,
    subtitle: buildMeta([row.nature || 'Echantillon', row.chantier || 'Sans contexte']),
    meta: buildMeta([
      row.receptionDate ? formatDate(row.receptionDate) : row.samplingDate ? formatDate(row.samplingDate) : '',
      row.demandeReference || row.laboCode || '',
      options.extraMeta,
    ]),
    tone: options.tone || 'teal',
    badge: options.badge || (row.essaiCode ? `Essai ${row.essaiCode}` : row.status || 'A prendre'),
    badgeTone: options.badgeTone || options.tone || 'teal',
    to: `/echantillons/${row.uid}`,
  }
}

export default function TechnicianDashboardPage() {
  const navigate = useNavigate()
  const { slug } = useParams()

  const profile = getTechnicianProfileBySlug(slug)

  const interventionsQuery = useQuery({
    queryKey: ['technician-dashboard', slug, 'interventions'],
    queryFn: () => interventionsApi.list(),
    enabled: !!profile,
  })

  const essaisQuery = useQuery({
    queryKey: ['technician-dashboard', slug, 'essais'],
    queryFn: () => essaisApi.list(),
    enabled: !!profile,
  })

  const planningQuery = useQuery({
    queryKey: ['technician-dashboard', slug, 'planning'],
    queryFn: () => planningApi.list(),
    enabled: !!profile,
  })

  const echantillonsQuery = useQuery({
    queryKey: ['technician-dashboard', slug, 'echantillons'],
    queryFn: () => echantillonsApi.list(),
    enabled: !!profile,
  })

  const allInterventions = useMemo(
    () => (Array.isArray(interventionsQuery.data) ? interventionsQuery.data : []).map(normalizeIntervention),
    [interventionsQuery.data]
  )

  const allEssais = useMemo(
    () => (Array.isArray(essaisQuery.data) ? essaisQuery.data : []).map(normalizeEssai),
    [essaisQuery.data]
  )

  const allPlanning = useMemo(
    () => (Array.isArray(planningQuery.data) ? planningQuery.data : []).map(normalizePlanning),
    [planningQuery.data]
  )

  const allEchantillons = useMemo(
    () => (Array.isArray(echantillonsQuery.data) ? echantillonsQuery.data : []).map(normalizeEchantillon),
    [echantillonsQuery.data]
  )

  const assignedInterventions = useMemo(() => {
    if (!profile) return []
    return allInterventions.filter((row) => matchesTechnicianProfile(profile, row.technicien, row.geotechnicien, row.subject))
  }, [allInterventions, profile])

  const assignedEssais = useMemo(() => {
    if (!profile) return []
    return allEssais.filter((row) => matchesTechnicianProfile(profile, row.operator))
  }, [allEssais, profile])

  const uniqueLabos = useMemo(() => {
    const labels = [
      ...assignedInterventions.map((row) => row.laboCode),
      ...assignedEssais.map((row) => row.laboCode),
      ...(profile?.defaultLaboCodes || []),
    ].filter(Boolean)

    return [...new Set(labels)]
  }, [assignedEssais, assignedInterventions, profile])

  const labScopeInterventions = useMemo(() => {
    if (!uniqueLabos.length) return allInterventions
    return allInterventions.filter((row) => uniqueLabos.includes(row.laboCode))
  }, [allInterventions, uniqueLabos])

  const labScopeEssais = useMemo(() => {
    if (!uniqueLabos.length) return allEssais
    return allEssais.filter((row) => uniqueLabos.includes(row.laboCode))
  }, [allEssais, uniqueLabos])

  const labScopeEchantillons = useMemo(() => {
    if (!uniqueLabos.length) return allEchantillons
    return allEchantillons.filter((row) => uniqueLabos.includes(row.laboCode))
  }, [allEchantillons, uniqueLabos])

  const visibleInterventions = profile?.workstream === 'coordination' ? labScopeInterventions : assignedInterventions
  const visibleEssais = profile?.workstream === 'coordination' ? labScopeEssais : assignedEssais

  const openInterventions = useMemo(
    () => [...visibleInterventions]
      .filter((row) => !isInterventionClosed(row))
      .sort((left, right) => compareAsc(left.date, right.date)),
    [visibleInterventions]
  )

  const recentInterventions = useMemo(
    () => [...visibleInterventions]
      .sort((left, right) => compareDesc(left.date, right.date))
      .slice(0, 6),
    [visibleInterventions]
  )

  const openEssais = useMemo(
    () => [...visibleEssais]
      .filter((row) => !isEssaiFinished(row))
      .sort((left, right) => compareAsc(left.dateStart || left.dateEnd, right.dateStart || right.dateEnd)),
    [visibleEssais]
  )

  const recentFinishedEssais = useMemo(
    () => [...visibleEssais]
      .filter((row) => isEssaiFinished(row))
      .sort((left, right) => compareDesc(left.dateEnd || left.dateStart, right.dateEnd || right.dateStart))
      .slice(0, 6),
    [visibleEssais]
  )

  const linkedSamples = useMemo(
    () => new Set(visibleEssais.map((row) => row.echantillonReference).filter(Boolean)).size,
    [visibleEssais]
  )

  const todayInterventions = useMemo(
    () => openInterventions.filter((row) => isSameDay(row.date)).sort((left, right) => compareAsc(left.date, right.date)),
    [openInterventions]
  )

  const upcomingInterventions = useMemo(
    () => openInterventions.filter((row) => {
      const diff = dayDiffFromToday(row.date)
      return diff !== null && diff >= 0
    }),
    [openInterventions]
  )

  const overdueInterventions = useMemo(
    () => openInterventions.filter((row) => isBeforeToday(row.date)).sort((left, right) => compareAsc(left.date, right.date)),
    [openInterventions]
  )

  const highAlertInterventions = useMemo(
    () => openInterventions.filter((row) => isHighAlert(row.niveauAlerte)).sort((left, right) => compareAsc(left.date, right.date)),
    [openInterventions]
  )

  const closureQueueEssais = useMemo(
    () => openEssais.filter((row) => needsEssaiClosure(row)).sort((left, right) => compareAsc(left.dateStart, right.dateStart)),
    [openEssais]
  )

  const dailyBenchEssais = useMemo(() => {
    const focusRows = openEssais.filter((row) => {
      const diff = dayDiffFromToday(row.dateStart)
      return diff !== null && diff >= -1 && diff <= 1
    })

    return (focusRows.length > 0 ? focusRows : openEssais).slice(0, 6)
  }, [openEssais])

  const labSampleQueue = useMemo(() => {
    const rows = labScopeEchantillons
      .filter((row) => !row.essaiCode || ['importe', 'recu', 'en cours'].includes(normalizeText(row.status)))
      .sort((left, right) => compareDesc(left.receptionDate || left.samplingDate, right.receptionDate || right.samplingDate))

    return rows.slice(0, 6)
  }, [labScopeEchantillons])

  const urgentPlanning = useMemo(
    () => [...allPlanning]
      .filter((row) => row.urgency === 'late' || row.urgency === 'soon')
      .sort((left, right) => {
        const rankDiff = planningRank(left.urgency) - planningRank(right.urgency)
        if (rankDiff) return rankDiff
        return compareAsc(left.deadline || left.start, right.deadline || right.start)
      })
      .slice(0, 6),
    [allPlanning]
  )

  const preparationFlow = useMemo(() => {
    if (urgentPlanning.length > 0) return urgentPlanning

    return [...allPlanning]
      .filter((row) => isWithinNextDays(row.deadline || row.start, 7))
      .sort((left, right) => compareAsc(left.deadline || left.start, right.deadline || right.start))
      .slice(0, 6)
  }, [allPlanning, urgentPlanning])

  const coordinationFlow = useMemo(
    () => [...labScopeInterventions]
      .filter((row) => !isInterventionClosed(row))
      .filter((row) => isHighAlert(row.niveauAlerte) || isWithinNextDays(row.date, 3) || isBeforeToday(row.date))
      .sort((left, right) => compareAsc(left.date, right.date))
      .slice(0, 6),
    [labScopeInterventions]
  )

  const noteCandidates = useMemo(() => {
    const essaiEntries = recentFinishedEssais.slice(0, 3).map((row) => buildEssaiEntry(row, {
      tone: 'green',
      badge: row.resultLabel || 'Resultats',
      badgeTone: 'green',
      extraMeta: 'Support de note technique',
    }))

    const interventionEntries = recentInterventions
      .filter((row) => isInterventionClosed(row))
      .slice(0, 3)
      .map((row) => buildInterventionEntry(row, {
        tone: 'teal',
        badge: 'Retour terrain',
        badgeTone: 'teal',
        extraMeta: 'Base pour avis / synthese',
      }))

    return [...essaiEntries, ...interventionEntries].slice(0, 6)
  }, [recentFinishedEssais, recentInterventions])

  const roleMetric = useMemo(() => {
    if (!profile) return null

    if (profile.workstream === 'terrain') {
      return {
        label: 'Retards terrain',
        value: interventionsQuery.isLoading ? '…' : overdueInterventions.length,
        hint: interventionsQuery.isLoading
          ? 'Chargement...'
          : highAlertInterventions.length > 0
            ? `${pluralize(highAlertInterventions.length, 'alerte haute', 'alertes hautes')} a arbitrer`
            : 'Pas de point terrain critique detecte',
        tone: overdueInterventions.length > 0 ? 'red' : highAlertInterventions.length > 0 ? 'amber' : 'green',
        icon: TriangleAlert,
      }
    }

    if (profile.workstream === 'coordination') {
      return {
        label: 'Dossiers preparation',
        value: planningQuery.isLoading ? '…' : preparationFlow.length,
        hint: planningQuery.isLoading
          ? 'Chargement...'
          : noteCandidates.length > 0
            ? `${pluralize(noteCandidates.length, 'support disponible', 'supports disponibles')} pour note / avis`
            : 'Flux de preparation sous controle',
        tone: preparationFlow.length > 0 ? 'amber' : 'green',
        icon: Calculator,
      }
    }

    return {
      label: 'Echantillons a lancer',
      value: echantillonsQuery.isLoading ? '…' : labSampleQueue.length,
      hint: echantillonsQuery.isLoading
        ? 'Chargement...'
        : closureQueueEssais.length > 0
          ? `${pluralize(closureQueueEssais.length, 'essai a cloturer', 'essais a cloturer')}`
          : 'Paillasse sans attente critique',
      tone: labSampleQueue.length > 0 ? 'teal' : 'green',
      icon: Package,
    }
  }, [closureQueueEssais.length, echantillonsQuery.isLoading, highAlertInterventions.length, interventionsQuery.isLoading, labSampleQueue.length, noteCandidates.length, overdueInterventions.length, planningQuery.isLoading, preparationFlow.length, profile])

  const workstreamBoards = useMemo(() => {
    if (!profile) return []

    if (profile.workstream === 'terrain') {
      const terrainPlanningRows = (todayInterventions.length > 0 ? todayInterventions : upcomingInterventions.length > 0 ? upcomingInterventions : openInterventions)
        .slice(0, 6)
        .map((row) => buildInterventionEntry(row, {
          tone: isSameDay(row.date) ? 'sky' : 'slate',
          badge: describeSchedule(row.date),
          badgeTone: isSameDay(row.date) ? 'sky' : 'slate',
          extraMeta: row.niveauAlerte && normalizeText(row.niveauAlerte) !== 'aucun' ? `Alerte ${row.niveauAlerte}` : '',
        }))

      const terrainDelayRows = (overdueInterventions.length > 0 ? overdueInterventions : highAlertInterventions)
        .slice(0, 6)
        .map((row) => buildInterventionEntry(row, {
          tone: overdueInterventions.length > 0 ? 'red' : 'amber',
          badge: overdueInterventions.length > 0 ? describeSchedule(row.date) : row.niveauAlerte || 'A surveiller',
          badgeTone: overdueInterventions.length > 0 ? 'red' : 'amber',
          extraMeta: row.niveauAlerte && normalizeText(row.niveauAlerte) !== 'aucun' ? `Alerte ${row.niveauAlerte}` : 'Point terrain a lever',
        }))

      const terrainClosureRows = (closureQueueEssais.length > 0 ? closureQueueEssais : openEssais)
        .slice(0, 6)
        .map((row) => buildEssaiEntry(row, {
          tone: closureQueueEssais.length > 0 ? 'amber' : statusTone(row.status),
          badge: describeOpenAge(row.dateStart),
          badgeTone: closureQueueEssais.length > 0 ? 'amber' : statusTone(row.status),
          extraMeta: row.resultLabel ? 'Resultat deja saisi' : 'A solder apres retour terrain',
        }))

      return [
        {
          key: 'terrain-planning',
          title: 'Planning du jour',
          description: 'Sorties a tenir aujourd hui ou prochaines sequences terrain.',
          countLabel: todayInterventions.length > 0 ? pluralize(todayInterventions.length, 'sortie du jour', 'sorties du jour') : pluralize(terrainPlanningRows.length, 'sequence a venir', 'sequences a venir'),
          tone: 'sky',
          icon: CalendarClock,
          rows: terrainPlanningRows,
          loading: interventionsQuery.isLoading,
          emptyLabel: 'Aucune sortie terrain detectee pour ce profil.',
          emptyChecklist: ROLE_CHECKLISTS.terrain.planning,
          actionLabel: 'Ouvrir les interventions',
          actionTo: '/labo/workbench?tab=interventions',
        },
        {
          key: 'terrain-delay',
          title: 'Interventions en retard',
          description: 'Dossiers a replanifier, arbitrer ou debloquer rapidement.',
          countLabel: overdueInterventions.length > 0 ? pluralize(overdueInterventions.length, 'retard', 'retards') : highAlertInterventions.length > 0 ? pluralize(highAlertInterventions.length, 'alerte', 'alertes') : 'Sous controle',
          tone: overdueInterventions.length > 0 ? 'red' : highAlertInterventions.length > 0 ? 'amber' : 'green',
          icon: TriangleAlert,
          rows: terrainDelayRows,
          loading: interventionsQuery.isLoading,
          emptyLabel: 'Aucun retard terrain detecte pour l instant.',
          emptyChecklist: ROLE_CHECKLISTS.terrain.backlog,
          actionLabel: 'Voir la vue labo',
          actionTo: '/labo/workbench?tab=interventions',
        },
        {
          key: 'terrain-closure',
          title: 'Essais a cloturer',
          description: 'Actes ouverts a solder apres passage terrain et retour labo.',
          countLabel: closureQueueEssais.length > 0 ? pluralize(closureQueueEssais.length, 'essai prioritaire', 'essais prioritaires') : pluralize(openEssais.length, 'essai actif', 'essais actifs'),
          tone: closureQueueEssais.length > 0 ? 'amber' : 'teal',
          icon: ClipboardList,
          rows: terrainClosureRows,
          loading: essaisQuery.isLoading,
          emptyLabel: 'Aucun essai en attente de cloture pour ce profil.',
          emptyChecklist: ROLE_CHECKLISTS.terrain.closure,
          actionLabel: 'Ouvrir le workbench',
          actionTo: '/essais-workbench',
        },
      ]
    }

    if (profile.workstream === 'coordination') {
      const preparationRows = preparationFlow.map((row) => buildPlanningEntry(row, {
        extraMeta: row.urgency === 'late' ? 'A reprendre en preparation' : 'A cadrer pour calcul / note',
      }))

      const coordinationRows = (coordinationFlow.length > 0 ? coordinationFlow : openInterventions)
        .slice(0, 6)
        .map((row) => buildInterventionEntry(row, {
          tone: isBeforeToday(row.date) ? 'red' : isHighAlert(row.niveauAlerte) ? 'amber' : 'teal',
          badge: isBeforeToday(row.date) ? describeSchedule(row.date) : row.niveauAlerte || 'Coordination',
          badgeTone: isBeforeToday(row.date) ? 'red' : isHighAlert(row.niveauAlerte) ? 'amber' : 'teal',
          extraMeta: 'Lien terrain / labo / preparation',
        }))

      return [
        {
          key: 'coordination-planning',
          title: 'Preparation G3 et dimensionnement',
          description: 'Flux a arbitrer pour Alyze, Taleron, calculs et mise au propre.',
          countLabel: preparationFlow.length > 0 ? pluralize(preparationFlow.length, 'dossier chaud', 'dossiers chauds') : 'Aucun point chaud',
          tone: preparationFlow.length > 0 ? 'amber' : 'green',
          icon: Calculator,
          rows: preparationRows,
          loading: planningQuery.isLoading,
          emptyLabel: 'Aucun dossier preparation chaud detecte pour l instant.',
          emptyChecklist: ROLE_CHECKLISTS.coordination.planning,
          actionLabel: 'Ouvrir le planning',
          actionTo: '/planning',
        },
        {
          key: 'coordination-notes',
          title: 'Notes techniques et avis',
          description: 'Supports deja disponibles pour redaction, synthese ou validation.',
          countLabel: noteCandidates.length > 0 ? pluralize(noteCandidates.length, 'support', 'supports') : 'A consolider',
          tone: noteCandidates.length > 0 ? 'green' : 'slate',
          icon: FileText,
          rows: noteCandidates,
          loading: essaisQuery.isLoading || interventionsQuery.isLoading,
          emptyLabel: 'Pas encore de support direct pour note ou avis sur ce scope.',
          emptyChecklist: ROLE_CHECKLISTS.coordination.closure,
          actionLabel: 'Ouvrir le dashboard transverse',
          actionTo: '/dashboard',
        },
        {
          key: 'coordination-flow',
          title: 'Coordination labo-terrain',
          description: 'Sujets a synchroniser entre charge terrain, labo et preparation.',
          countLabel: coordinationFlow.length > 0 ? pluralize(coordinationFlow.length, 'point de coordination', 'points de coordination') : 'Flux calme',
          tone: coordinationFlow.length > 0 ? 'teal' : 'slate',
          icon: Layers3,
          rows: coordinationRows,
          loading: interventionsQuery.isLoading,
          emptyLabel: 'Aucun point de coordination saillant sur le scope actuel.',
          emptyChecklist: ROLE_CHECKLISTS.coordination.backlog,
          actionLabel: 'Ouvrir le workbench',
          actionTo: '/essais-workbench',
        },
      ]
    }

    const benchRows = dailyBenchEssais.map((row) => buildEssaiEntry(row, {
      tone: 'amber',
      badge: isSameDay(row.dateStart) ? 'Aujourd hui' : describeOpenAge(row.dateStart),
      badgeTone: 'amber',
      extraMeta: row.resultLabel ? 'Resultat present' : 'Serie active a suivre',
    }))

    const closureRows = (closureQueueEssais.length > 0 ? closureQueueEssais : openEssais)
      .slice(0, 6)
      .map((row) => buildEssaiEntry(row, {
        tone: closureQueueEssais.length > 0 ? 'red' : 'amber',
        badge: closureQueueEssais.length > 0 ? describeOpenAge(row.dateStart) : row.status,
        badgeTone: closureQueueEssais.length > 0 ? 'red' : 'amber',
        extraMeta: row.resultLabel ? 'Verifier la cloture resultat' : 'Cloture de production a faire',
      }))

    const sampleRows = labSampleQueue.map((row) => buildSampleEntry(row, {
      tone: !row.essaiCode ? 'teal' : 'sky',
      badge: !row.essaiCode ? 'Sans essai lance' : `Essai ${row.essaiCode}`,
      badgeTone: !row.essaiCode ? 'teal' : 'sky',
      extraMeta: !row.essaiCode ? 'A orienter vers une serie' : 'A reprendre si besoin',
    }))

    return [
      {
        key: 'lab-bench',
        title: 'Paillasse du jour',
        description: 'Series actives ou proches a prendre en charge sur la journee.',
        countLabel: dailyBenchEssais.length > 0 ? pluralize(dailyBenchEssais.length, 'serie prioritaire', 'series prioritaires') : 'Aucune serie',
        tone: 'amber',
        icon: FlaskConical,
        rows: benchRows,
        loading: essaisQuery.isLoading,
        emptyLabel: 'Aucune serie active detectee pour ce profil.',
        emptyChecklist: ROLE_CHECKLISTS.lab.planning,
        actionLabel: 'Ouvrir les essais',
        actionTo: '/labo/workbench?tab=essais&status=__active__',
      },
      {
        key: 'lab-closure',
        title: 'Essais a cloturer',
        description: 'Productions ouvertes a solder avant accumulation de paillasse.',
        countLabel: closureQueueEssais.length > 0 ? pluralize(closureQueueEssais.length, 'cloture prioritaire', 'clotures prioritaires') : pluralize(openEssais.length, 'essai actif', 'essais actifs'),
        tone: closureQueueEssais.length > 0 ? 'red' : 'amber',
        icon: ClipboardList,
        rows: closureRows,
        loading: essaisQuery.isLoading,
        emptyLabel: 'Aucun essai en attente de cloture sur le profil actuel.',
        emptyChecklist: ROLE_CHECKLISTS.lab.backlog,
        actionLabel: 'Ouvrir le workbench',
        actionTo: '/essais-workbench',
      },
      {
        key: 'lab-samples',
        title: 'Echantillons a prendre en charge',
        description: 'Reception labo recente ou echantillons encore sans serie claire.',
        countLabel: labSampleQueue.length > 0 ? pluralize(labSampleQueue.length, 'echantillon visible', 'echantillons visibles') : 'File vide',
        tone: 'teal',
        icon: Package,
        rows: sampleRows,
        loading: echantillonsQuery.isLoading,
        emptyLabel: 'Aucun echantillon en file visible pour le moment.',
        emptyChecklist: ROLE_CHECKLISTS.lab.closure,
        actionLabel: 'Ouvrir les echantillons',
        actionTo: '/labo/workbench?tab=echantillons',
      },
    ]
  }, [allPlanning, closureQueueEssais, coordinationFlow, dailyBenchEssais, echantillonsQuery.isLoading, essaisQuery.isLoading, highAlertInterventions, interventionsQuery.isLoading, labSampleQueue, noteCandidates, openEssais, openInterventions, overdueInterventions, planningQuery.isLoading, preparationFlow, profile, recentFinishedEssais, recentInterventions, todayInterventions, upcomingInterventions])

  if (!profile) {
    return <Navigate to="/dashboard" replace />
  }

  const firstOpenIntervention = openInterventions[0]
  const firstOpenEssai = openEssais[0]
  const dataIssues = [
    interventionsQuery.error ? 'Interventions' : null,
    essaisQuery.error ? 'Essais' : null,
    planningQuery.error ? 'Planning' : null,
    echantillonsQuery.error ? 'Echantillons' : null,
  ].filter(Boolean)

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
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Dashboard technicien</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{profile.displayName}</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/80">{profile.summary}</p>
            <p className="mt-3 text-sm text-white/70">{profile.mission}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                {profile.roleLabel}
              </span>
              {profile.focusAreas.map((item) => (
                <span key={item} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                  {item}
                </span>
              ))}
              {uniqueLabos.map((code) => (
                <span key={code} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm">
                  Labo {code}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionButton label="Workbench essais/interventions" onClick={() => navigate('/essais-workbench')} />
            <ActionButton label="Vue labo transverse" onClick={() => navigate('/labo/workbench')} />
          </div>
        </div>
      </div>

      {dataIssues.length > 0 ? (
        <Card className="border-[#efc2bf] bg-[#fdf7f6]">
          <CardBody className="p-4">
            <p className="text-sm font-semibold text-[#7a2925]">Donnees partielles</p>
            <p className="mt-1 text-xs text-[#8d4a44]">
              Certaines sources du dashboard technicien ne sont pas remontees: {dataIssues.join(', ')}.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          label="Interventions ouvertes"
          value={interventionsQuery.isLoading ? '…' : openInterventions.length}
          hint={interventionsQuery.isLoading ? 'Chargement...' : `${visibleInterventions.length} interventions visibles`}
          tone={openInterventions.length > 0 ? 'sky' : 'slate'}
          icon={CalendarClock}
        />
        <MetricTile
          label="Essais actifs"
          value={essaisQuery.isLoading ? '…' : openEssais.length}
          hint={essaisQuery.isLoading ? 'Chargement...' : `${visibleEssais.length} essais visibles`}
          tone={openEssais.length > 0 ? 'amber' : 'slate'}
          icon={TestTube2}
        />
        <MetricTile
          label="Echantillons lies"
          value={essaisQuery.isLoading ? '…' : linkedSamples}
          hint="Nombre d echantillons retrouves via les essais visibles"
          tone={linkedSamples > 0 ? 'teal' : 'slate'}
          icon={FlaskConical}
        />
        <MetricTile
          label="Essais termines"
          value={essaisQuery.isLoading ? '…' : recentFinishedEssais.length}
          hint="Historique recent des essais clotures"
          tone={recentFinishedEssais.length > 0 ? 'green' : 'slate'}
          icon={Activity}
        />
        {roleMetric ? (
          <MetricTile
            label={roleMetric.label}
            value={roleMetric.value}
            hint={roleMetric.hint}
            tone={roleMetric.tone}
            icon={roleMetric.icon}
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {workstreamBoards.map((board) => (
          <WorkstreamCard
            key={board.key}
            title={board.title}
            description={board.description}
            countLabel={board.countLabel}
            tone={board.tone}
            icon={board.icon}
            rows={board.rows}
            loading={board.loading}
            emptyLabel={board.emptyLabel}
            emptyChecklist={board.emptyChecklist}
            actionLabel={board.actionLabel}
            onAction={() => navigate(board.actionTo)}
            onRowClick={(row) => navigate(row.to)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader>
            <CardTitle>Priorites du moment</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Interventions ouvertes</p>
              {openInterventions.length === 0 ? (
                <EmptyBlock loading={interventionsQuery.isLoading} label="Aucune intervention ouverte pour ce profil." />
              ) : (
                openInterventions.slice(0, 6).map((row) => (
                  <EntryRow
                    key={row.uid}
                    title={row.reference}
                    subtitle={buildMeta([row.type, row.subject || row.chantier || 'Sans contexte'])}
                    meta={buildMeta([row.date ? formatDate(row.date) : '', row.demandeReference || row.laboCode || '', describeSchedule(row.date)])}
                    tone={isBeforeToday(row.date) ? 'red' : statusTone(row.status)}
                    trailing={<Badge text={row.status} tone={statusTone(row.status)} />}
                    onClick={() => navigate(`/interventions/${row.uid}`)}
                  />
                ))
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Essais actifs</p>
              {openEssais.length === 0 ? (
                <EmptyBlock loading={essaisQuery.isLoading} label="Aucun essai actif pour ce profil." />
              ) : (
                openEssais.slice(0, 6).map((row) => (
                  <EntryRow
                    key={row.uid}
                    title={row.code || row.reference}
                    subtitle={buildMeta([row.echantillonReference || 'Echantillon non renseigne', row.chantier || row.demandeReference || row.label])}
                    meta={buildMeta([row.dateStart ? formatDate(row.dateStart) : '', row.laboCode || row.status, describeOpenAge(row.dateStart)])}
                    tone={needsEssaiClosure(row) ? 'amber' : statusTone(row.status)}
                    trailing={<Badge text={row.status} tone={statusTone(row.status)} />}
                    onClick={() => navigate(`/essais/${row.uid}`)}
                  />
                ))
              )}
            </div>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Mode operatoire</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div className={cn('rounded-2xl border p-4', toneClass(profile.tone))}>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70">
                  <UserRound size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{profile.displayName}</p>
                  <p className="text-xs opacity-80">{profile.roleLabel}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Mission du poste</p>
              <p className="mt-2 text-sm text-text">{profile.mission}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.focusAreas.map((item) => <Badge key={item} text={item} tone={profile.tone} />)}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Rythme attendu</p>
              <div className="mt-3 flex flex-col gap-2">
                {profile.responsibilities.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-xs text-text-muted">
                    <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', toneDotClass(profile.tone))} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Prochaine activite</p>
              <p className="mt-2 text-sm font-semibold text-text">
                {firstOpenIntervention?.reference || firstOpenEssai?.code || 'Aucune activite ouverte'}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {firstOpenIntervention
                  ? buildMeta([firstOpenIntervention.date ? formatDate(firstOpenIntervention.date) : '', firstOpenIntervention.type, describeSchedule(firstOpenIntervention.date)])
                  : firstOpenEssai
                    ? buildMeta([firstOpenEssai.dateStart ? formatDate(firstOpenEssai.dateStart) : '', firstOpenEssai.label || firstOpenEssai.status, describeOpenAge(firstOpenEssai.dateStart)])
                    : 'Le profil est pret a monter en puissance des que les affectations seront stabilisees.'}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Couverture</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {uniqueLabos.length > 0 ? uniqueLabos.map((code) => <Badge key={code} text={`Labo ${code}`} tone="slate" />) : <Badge text="Aucun labo detecte" tone="slate" />}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">Raccourcis</p>
              <div className="mt-3 flex flex-col gap-2">
                <ActionButton label="Ouvrir labo" onClick={() => navigate('/labo')} />
                <ActionButton label="Ouvrir dashboard transverse" onClick={() => navigate('/dashboard')} />
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Interventions recentes</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            {recentInterventions.length === 0 ? (
              <EmptyBlock loading={interventionsQuery.isLoading} label="Aucune intervention rattachee pour l instant." />
            ) : (
              recentInterventions.map((row) => (
                <EntryRow
                  key={row.uid}
                  title={row.reference}
                  subtitle={buildMeta([row.type, row.subject || row.chantier || 'Sans contexte'])}
                  meta={buildMeta([row.date ? formatDate(row.date) : '', row.demandeReference || row.laboCode || ''])}
                  tone={statusTone(row.status)}
                  trailing={<Badge text={row.status} tone={statusTone(row.status)} />}
                  onClick={() => navigate(`/interventions/${row.uid}`)}
                />
              ))
            )}
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Essais recents termines</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            {recentFinishedEssais.length === 0 ? (
              <EmptyBlock loading={essaisQuery.isLoading} label="Aucun essai termine rattache pour l instant." />
            ) : (
              recentFinishedEssais.map((row) => (
                <EntryRow
                  key={row.uid}
                  title={row.code || row.reference}
                  subtitle={buildMeta([row.echantillonReference || 'Echantillon non renseigne', row.chantier || row.demandeReference || row.label])}
                  meta={buildMeta([row.dateEnd ? formatDate(row.dateEnd) : row.dateStart ? formatDate(row.dateStart) : '', row.laboCode || ''])}
                  tone="green"
                  trailing={<Badge text={row.resultLabel || row.status} tone="green" />}
                  onClick={() => navigate(`/essais/${row.uid}`)}
                />
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}