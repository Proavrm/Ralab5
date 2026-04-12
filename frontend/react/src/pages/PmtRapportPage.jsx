import { useMemo } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import Button from '@/components/ui/Button'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import { pmtApi } from '@/services/api'

function Section({ title, children, right }) {
  return (
    <section className="bg-surface border border-border rounded-[10px] overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-bg flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-[.06em] text-text-muted">{title}</div>
        {right}
      </div>
      <div className="p-4 flex flex-col gap-4">{children}</div>
    </section>
  )
}

function Badge({ children, tone = 'default' }) {
  const toneClass = tone === 'success'
    ? 'border-[#bfe5db] bg-[#e0f5ef] text-[#0f6e56]'
    : tone === 'warning'
      ? 'border-[#eadfca] bg-[#fbf5e8] text-[#854f0b]'
      : 'border-border bg-bg text-text'
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium ${toneClass}`}>{children}</span>
}

function InfoLine({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={`text-[13px] font-medium ${value ? '' : 'text-text-muted italic font-normal'}`}>{value || '—'}</div>
    </div>
  )
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-[10px] border border-border bg-bg px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-text">{value || '—'}</div>
    </div>
  )
}

function parseNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMetric(value, unit = '', digits = 2) {
  const parsed = parseNumber(value)
  if (parsed == null) return ''
  return `${parsed.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`
}

function metricEntries(metrics) {
  if (!metrics || typeof metrics !== 'object') return []
  const mapping = [
    ['measure_count', 'Mesures', (value) => String(value ?? 0)],
    ['essai_count', 'Essais PMT', (value) => String(value ?? 0)],
    ['intervention_count', 'Interventions', (value) => String(value ?? 0)],
    ['macrotexture_average_mm', 'Macrotexture moy.', (value) => formatMetric(value, 'mm')],
    ['macrotexture_min_mm', 'Macrotexture mini', (value) => formatMetric(value, 'mm')],
    ['macrotexture_max_mm', 'Macrotexture maxi', (value) => formatMetric(value, 'mm')],
    ['diameter_average_mm', 'Diamètre moy.', (value) => formatMetric(value, 'mm')],
    ['conformity_percent', 'Conformité', (value) => formatMetric(value, '%', 1)],
  ]
  return mapping
    .filter(([key]) => metrics[key] != null && metrics[key] !== '')
    .map(([key, label, formatter]) => ({ key, label, value: formatter(metrics[key]) }))
}

export default function PmtRapportPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const fallbackReturnTo = resolveReturnTo(searchParams, '/labo/workbench?tab=interventions')
  const childReturnTo = buildLocationTarget(location)

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['pmt-rapport', String(uid)],
    queryFn: () => pmtApi.getRapport(uid),
  })

  const metrics = useMemo(() => metricEntries(report?.generated?.metrics), [report])

  if (isLoading) {
    return <div className="text-xs text-text-muted text-center py-16">Chargement rapport PMT…</div>
  }

  if (isError || !report) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted text-sm mb-3">Rapport PMT introuvable</p>
        <Button onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}>Retour</Button>
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
        {report.demande?.reference ? <span className="text-[13px] text-text-muted">{report.demande.reference} › </span> : null}
        <span className="text-[14px] font-semibold flex-1 font-mono">{report.reference}</span>
        <Badge tone={report.statut === 'Genere' ? 'success' : 'warning'}>{report.statut || 'A completer'}</Badge>
        {report.intervention?.uid ? (
          <Button size="sm" variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/interventions/${report.intervention.uid}`, childReturnTo)}>
            Ouvrir intervention
          </Button>
        ) : null}
        {report.demande?.uid ? (
          <Button size="sm" variant="primary" onClick={() => navigateWithReturnTo(navigate, `/demandes/${report.demande.uid}`, childReturnTo)}>
            Ouvrir demande
          </Button>
        ) : null}
      </div>

      <div className="p-5 max-w-[1040px] mx-auto w-full flex flex-col gap-4">
        <div className="bg-surface border border-border rounded-[10px] p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[22px] font-bold text-accent">{report.title || report.reference}</div>
              <div className="text-[13px] text-text-muted mt-1">
                {report.scope === 'campagne' ? 'Rapport consolidé de campagne PMT' : 'Rapport d’essai PMT'}
              </div>
              <div className="text-[12px] text-text-muted mt-1">
                {report.campaign?.reference ? `Campagne ${report.campaign.reference}` : ''}
                {report.essai?.reference ? ` · Essai ${report.essai.reference}` : ''}
                {report.intervention?.reference ? ` · Intervention ${report.intervention.reference}` : ''}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{report.reference}</Badge>
              {report.campaign?.reference ? <Badge>{report.campaign.reference}</Badge> : null}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[10px] border border-border bg-bg px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">Synthèse</div>
              <div className="mt-2 text-[14px] leading-6 text-text">{report.summary || '—'}</div>
            </div>
            <div className="rounded-[10px] border border-border bg-bg px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">Conclusions</div>
              <div className="mt-2 text-[14px] leading-6 text-text">{report.conclusions || '—'}</div>
            </div>
          </div>
        </div>

        {metrics.length > 0 ? (
          <Section title="Indicateurs calculés">
            <div className="grid gap-3 md:grid-cols-4">
              {metrics.map((item) => <MetricCard key={item.key} label={item.label} value={item.value} />)}
            </div>
          </Section>
        ) : null}

        <Section title="Contexte métier">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoLine label="Demande" value={report.demande?.reference} />
            <InfoLine label="Affaire" value={report.demande?.affaire_reference} />
            <InfoLine label="Client / chantier" value={[report.demande?.client, report.demande?.chantier || report.demande?.site].filter(Boolean).join(' · ')} />
            <InfoLine label="Campagne" value={report.campaign?.reference} />
            <InfoLine label="Essai PMT" value={report.essai?.reference} />
            <InfoLine label="Intervention" value={report.intervention?.reference} />
            <InfoLine label="Date intervention" value={formatDate(report.intervention?.date_intervention)} />
            <InfoLine label="Technicien" value={report.intervention?.technicien} />
            <InfoLine label="Statut intervention" value={report.intervention?.statut} />
          </div>
        </Section>

        <Section title="Traces générées">
          <div className="grid gap-4 md:grid-cols-2">
            <InfoLine label="Référence demande générée" value={report.generated?.demande_reference} />
            <InfoLine label="Référence campagne générée" value={report.generated?.campaign_reference} />
            <InfoLine label="Référence intervention générée" value={report.generated?.intervention_reference} />
          </div>
        </Section>
      </div>
    </div>
  )
}