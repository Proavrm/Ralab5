import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import Card, { CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import Input, { Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { buildLocationTarget, buildPathWithReturnTo } from '@/lib/detailNavigation'
import { hasRole } from '@/lib/permissions'
import { normalizePrelevement, getPrelevementReferenceDate, prelevementHasArrival, prelevementIsReadyForLab, prelevementIsUnexpectedArrival, prelevementNeedsReceptionCompletion } from '@/lib/prelevements'
import { findResponsibleLaboProfileByUser } from '@/lib/responsibleLaboProfiles'
import { findTechnicianProfileByUser } from '@/lib/technicianProfiles'
import { cn, formatDate } from '@/lib/utils'
import { prelevementsApi } from '@/services/api'
import { ClipboardList, Package, RefreshCw, Search, TriangleAlert, Workflow } from 'lucide-react'

const KNOWN_LABOS = ['AUV', 'SP', 'PT', 'CLM', 'CHB']
const DAY_MS = 24 * 60 * 60 * 1000

const VIEWS = [
  { key: 'all', label: 'Tous' },
  { key: 'arrivals', label: 'Arrivages' },
  { key: 'to-complete', label: 'À compléter' },
  { key: 'ready', label: 'Prêts labo' },
  { key: 'arbitrage', label: 'Arbitrages' },
]

const TONES = {
  teal: 'border-[#c7e2de] bg-[#e8f4f2] text-[#14655d]',
  amber: 'border-[#ecd1a2] bg-[#fbf1e2] text-[#854f0b]',
  green: 'border-[#d4e4c1] bg-[#eef5e6] text-[#3b6d11]',
  slate: 'border-[#e4ddd3] bg-[#f4f1eb] text-[#5f5e5a]',
  red: 'border-[#efc2bf] bg-[#fdf0ef] text-[#a32d2d]',
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

function isSameDay(value) {
  const target = new Date(value || '')
  if (Number.isNaN(target.getTime())) return false
  const today = new Date()
  return target.getFullYear() === today.getFullYear()
    && target.getMonth() === today.getMonth()
    && target.getDate() === today.getDate()
}

function dayDiffFromToday(value) {
  const target = new Date(value || '').getTime()
  if (Number.isNaN(target)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const normalizedTarget = new Date(target)
  normalizedTarget.setHours(0, 0, 0, 0)
  return Math.round((normalizedTarget.getTime() - today.getTime()) / DAY_MS)
}

function describeSchedule(value) {
  const diff = dayDiffFromToday(value)
  if (diff === null) return 'Date à confirmer'
  if (diff === 0) return 'Aujourd’hui'
  if (diff === 1) return 'Demain'
  if (diff > 1) return `Dans ${diff} j`
  if (diff === -1) return '1 j de retard'
  return `${Math.abs(diff)} j de retard`
}

function pluralize(count, singular, plural) {
  return `${count} ${count > 1 ? plural : singular}`
}

function toneClass(tone) {
  return TONES[tone] || TONES.slate
}

function StatCard({ label, value, hint, tone = 'slate', icon: Icon }) {
  return (
    <Card>
      <CardBody className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-text">{value}</p>
          <p className="mt-2 text-xs text-text-muted">{hint}</p>
        </div>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border', toneClass(tone))}>
          <Icon size={18} />
        </div>
      </CardBody>
    </Card>
  )
}

function StatusBadge({ label, tone }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', toneClass(tone))}>
      {label}
    </span>
  )
}

function rowStatus(row) {
  if (prelevementIsUnexpectedArrival(row)) return { label: 'Arbitrage', tone: 'red' }
  if (prelevementNeedsReceptionCompletion(row)) return { label: 'À compléter', tone: 'amber' }
  if (prelevementIsReadyForLab(row)) return { label: 'Prêt labo', tone: 'green' }
  if (prelevementHasArrival(row)) return { label: 'Arrivé', tone: 'teal' }
  return { label: row.status || 'À trier', tone: 'slate' }
}

function matchesSearch(row, search) {
  const normalizedSearch = normalizeText(search)
  if (!normalizedSearch) return true
  return [
    row.reference,
    row.description,
    row.demandeReference,
    row.affaireReference,
    row.chantier,
    row.site,
    row.zone,
    row.materiau,
    row.receptionOwner,
    row.interventionReference,
  ]
    .filter(Boolean)
    .some((value) => normalizeText(value).includes(normalizedSearch))
}

function filterByView(row, view) {
  if (view === 'arrivals') return prelevementHasArrival(row)
  if (view === 'to-complete') return prelevementNeedsReceptionCompletion(row)
  if (view === 'ready') return prelevementIsReadyForLab(row)
  if (view === 'arbitrage') return prelevementIsUnexpectedArrival(row)
  return true
}

export default function PrelevementsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const detailReturnTo = buildLocationTarget(location)
  const { user } = useAuth()

  const requestedLaboCode = normalizeCode(searchParams.get('labo') || '')
  const requestedView = VIEWS.some((item) => item.key === searchParams.get('view')) ? searchParams.get('view') : 'all'
  const search = searchParams.get('q') || ''
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

  const prelevementsQuery = useQuery({
    queryKey: ['prelevements'],
    queryFn: () => prelevementsApi.list(),
  })

  const allPrelevements = useMemo(
    () => (Array.isArray(prelevementsQuery.data) ? prelevementsQuery.data : []).map(normalizePrelevement),
    [prelevementsQuery.data]
  )

  const availableLabos = useMemo(() => {
    const discovered = allPrelevements.map((row) => normalizeCode(row.laboCode)).filter(Boolean)
    return [...new Set([...KNOWN_LABOS, ...discovered, defaultLaboCode, requestedLaboCode].filter(Boolean))]
  }, [allPrelevements, defaultLaboCode, requestedLaboCode])

  const scopedRows = useMemo(
    () => allPrelevements.filter((row) => !effectiveLaboCode || matchesLaboCode(effectiveLaboCode, row.laboCode, row.reference, row.demandeReference, row.chantier)),
    [allPrelevements, effectiveLaboCode]
  )

  const arrivals = useMemo(
    () => scopedRows.filter(prelevementHasArrival),
    [scopedRows]
  )

  const receptionsToComplete = useMemo(
    () => scopedRows.filter(prelevementNeedsReceptionCompletion),
    [scopedRows]
  )

  const readyForLab = useMemo(
    () => scopedRows.filter(prelevementIsReadyForLab),
    [scopedRows]
  )

  const arbitrages = useMemo(
    () => scopedRows.filter(prelevementIsUnexpectedArrival),
    [scopedRows]
  )

  const filteredRows = useMemo(
    () => scopedRows
      .filter((row) => filterByView(row, requestedView))
      .filter((row) => matchesSearch(row, search))
      .sort((left, right) => toDateMs(getPrelevementReferenceDate(right)) - toDateMs(getPrelevementReferenceDate(left))),
    [requestedView, scopedRows, search]
  )

  function openEtiquettes() {
    const params = new URLSearchParams()
    if (effectiveLaboCode) params.set('labo', effectiveLaboCode)
    if (requestedView && requestedView !== 'all') params.set('view', requestedView)
    if (search) params.set('q', search)
    navigate(`/prelevements/etiquettes${params.toString() ? `?${params.toString()}` : ''}`)
  }

  function updateParams(nextValues) {
    const next = new URLSearchParams(searchParams)
    Object.entries(nextValues).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    setSearchParams(next, { replace: true })
  }

  const metrics = [
    {
      label: 'Prélèvements visibles',
      value: scopedRows.length,
      hint: pluralize(scopedRows.length, 'prélèvement', 'prélèvements'),
      tone: scopedRows.length > 0 ? 'teal' : 'slate',
      icon: Package,
    },
    {
      label: 'Arrivages du jour',
      value: arrivals.filter((row) => isSameDay(getPrelevementReferenceDate(row))).length,
      hint: pluralize(arrivals.length, 'arrivage', 'arrivages'),
      tone: arrivals.length > 0 ? 'teal' : 'slate',
      icon: Package,
    },
    {
      label: 'Réceptions à compléter',
      value: receptionsToComplete.length,
      hint: 'Description, réceptionnaire ou rattachement manquant',
      tone: receptionsToComplete.length > 0 ? 'amber' : 'green',
      icon: ClipboardList,
    },
    {
      label: 'Prêts labo',
      value: readyForLab.length,
      hint: 'Prélèvements exploitables pour la suite',
      tone: readyForLab.length > 0 ? 'green' : 'slate',
      icon: Workflow,
    },
    {
      label: 'Arbitrages',
      value: arbitrages.length,
      hint: 'Retours terrain sans rattachement clair',
      tone: arbitrages.length > 0 ? 'red' : 'slate',
      icon: TriangleAlert,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-[24px] border border-[#234e51]/15 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">Portail laboratoire</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text">Prélèvements laboratoire</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-muted">
              Le prélèvement est l’objet reçu au laboratoire. Il porte la réception, le contexte d’arrivée et la suite métier avant la création ou l’affectation des échantillons d’essais.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/labo')}>Retour portail labo</Button>
            <Button variant="secondary" onClick={openEtiquettes}>Étiquettes</Button>
            <Button variant="secondary" onClick={() => prelevementsQuery.refetch()} disabled={prelevementsQuery.isFetching}>
              <RefreshCw size={14} />
              Actualiser
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr_0.7fr]">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              value={search}
              onChange={(event) => updateParams({ q: event.target.value })}
              placeholder="Référence, demande, chantier, matériau, zone..."
              className="pl-9"
            />
          </div>

          <Select value={requestedView} onChange={(event) => updateParams({ view: event.target.value !== 'all' ? event.target.value : '' })}>
            {VIEWS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </Select>

          {isAdmin ? (
            <Select value={effectiveLaboCode} onChange={(event) => updateParams({ labo: event.target.value })}>
              <option value="">Tous les labos</option>
              {availableLabos.map((code) => <option key={code} value={code}>{code}</option>)}
            </Select>
          ) : (
            <div className="flex items-center rounded-lg border border-border bg-bg px-3 text-sm text-text-muted">
              {effectiveLaboCode ? `Scope ${effectiveLaboCode}` : 'Vue multi-labo'}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            tone={metric.tone}
            icon={metric.icon}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="bg-bg/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Liste métier</CardTitle>
              <p className="mt-1 text-xs text-text-muted">
                {filteredRows.length} ligne(s) dans la vue courante. Le clic ouvre la fiche prélèvement et les groupes d’essais associés.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {VIEWS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => updateParams({ view: item.key !== 'all' ? item.key : '' })}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    requestedView === item.key ? 'border-accent bg-accent text-white' : 'border-border bg-white text-text hover:bg-bg'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {prelevementsQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">Chargement des prélèvements…</div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-sm text-text-muted">
              Aucun prélèvement ne correspond aux filtres courants.
            </div>
          ) : filteredRows.map((row) => {
            const status = rowStatus(row)
            const referenceDate = getPrelevementReferenceDate(row)
            return (
              <button
                key={row.uid}
                type="button"
                onClick={() => navigate(buildPathWithReturnTo(`/prelevements/${row.uid}`, detailReturnTo))}
                className="flex w-full items-start justify-between gap-4 rounded-2xl border border-border bg-white px-4 py-4 text-left transition hover:border-[#d8e6e1] hover:bg-[#f8fbfa]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text">{row.reference}</p>
                    {row.laboCode ? <StatusBadge label={row.laboCode} tone="slate" /> : null}
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {[row.description || 'Description à préciser', row.chantier || row.demandeReference || 'Sans contexte'].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-2 text-[11px] text-text-muted">
                    {referenceDate ? `${formatDate(referenceDate)} · ${describeSchedule(referenceDate)}` : 'Sans date'}
                    {' · '}
                    {row.demandeReference || 'Sans demande'}
                    {' · '}
                    {row.echantillonCount} échantillon(s)
                    {' · '}
                    {row.essaiCount} essai(s)
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <StatusBadge label={status.label} tone={status.tone} />
                  <span className="text-[11px] text-text-muted">
                    {row.receptionOwner || row.technicien || 'Réceptionnaire à préciser'}
                  </span>
                </div>
              </button>
            )
          })}
        </CardBody>
      </Card>
    </div>
  )
}