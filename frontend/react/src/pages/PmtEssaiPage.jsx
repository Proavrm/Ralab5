import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import { pmtApi } from '@/services/api'

const PMT_STATUTS = ['Brouillon', 'A reprendre', 'En cours', 'Validé']

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

function Field({ label, children, full = false }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function InfoLine({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className={`text-[13px] font-medium ${value ? '' : 'text-text-muted italic font-normal'}`}>{value || '—'}</div>
    </div>
  )
}

function Badge({ children, tone = 'default' }) {
  const toneClass = tone === 'accent'
    ? 'border-[#cfe4f6] bg-[#eef6fd] text-[#185fa5]'
    : tone === 'success'
      ? 'border-[#bfe5db] bg-[#e0f5ef] text-[#0f6e56]'
      : 'border-border bg-bg text-text'
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium ${toneClass}`}>{children}</span>
}

function MetricCard({ label, value, tone = 'default' }) {
  return (
    <div className="rounded-[10px] border border-border bg-bg px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-text-muted">{label}</div>
      <div className={`mt-1 text-[20px] font-semibold ${tone === 'accent' ? 'text-accent' : 'text-text'}`}>{value || '—'}</div>
    </div>
  )
}

function Textarea({ value, onChange, rows = 3, placeholder = '' }) {
  return (
    <textarea
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y"
    />
  )
}

function parseNumber(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value).replace(/\u00a0/g, ' ').replace(',', '.').trim()
  if (!cleaned) return null
  const match = cleaned.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalBool(value) {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function computeMetrics(points, manualConformityPercent) {
  const macroValues = points.map((item) => parseNumber(item.macrotexture_mm)).filter((value) => value != null)
  const diameterValues = points.map((item) => parseNumber(item.diametre_mm)).filter((value) => value != null)
  const conformityValues = points.map((item) => parseOptionalBool(item.is_conforme)).filter((value) => value != null)
  const macroAverage = macroValues.length ? macroValues.reduce((sum, value) => sum + value, 0) / macroValues.length : null
  const diameterAverage = diameterValues.length ? diameterValues.reduce((sum, value) => sum + value, 0) / diameterValues.length : null
  const conformityPercent = conformityValues.length
    ? (conformityValues.filter(Boolean).length / conformityValues.length) * 100
    : parseNumber(manualConformityPercent)

  return {
    measure_count: points.length,
    macrotexture_average_mm: macroAverage,
    macrotexture_min_mm: macroValues.length ? Math.min(...macroValues) : null,
    macrotexture_max_mm: macroValues.length ? Math.max(...macroValues) : null,
    diameter_average_mm: diameterAverage,
    conformity_percent: conformityPercent,
  }
}

function formatMetric(value, unit = '', digits = 2) {
  const parsed = parseNumber(value)
  if (parsed == null) return ''
  return `${parsed.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`
}

function createEmptyPoint(index) {
  return {
    point: index,
    position: '',
    diametre_mm: '',
    macrotexture_mm: '',
    is_conforme: '',
  }
}

function buildFormFromEssai(essai) {
  const points = Array.isArray(essai?.resultats?.points) && essai.resultats.points.length
    ? essai.resultats.points.map((item, index) => ({
      point: item.point ?? index + 1,
      position: item.position || '',
      diametre_mm: item.diametre_mm ?? '',
      macrotexture_mm: item.macrotexture_mm ?? '',
      is_conforme: item.is_conforme === true ? 'true' : item.is_conforme === false ? 'false' : '',
    }))
    : [createEmptyPoint(1)]

  return {
    statut: essai?.statut || 'Brouillon',
    date_essai: essai?.date_essai || '',
    operateur: essai?.operateur || '',
    section_controlee: essai?.section_controlee || '',
    voie: essai?.voie || '',
    sens: essai?.sens || '',
    couche: essai?.couche || '',
    nature_support: essai?.nature_support || '',
    observations: essai?.observations || '',
    manual_conformity_percent: essai?.resultats?.manual_conformity_percent ?? '',
    points,
  }
}

function buildPayload(form) {
  return {
    statut: form.statut,
    date_essai: form.date_essai,
    operateur: form.operateur,
    section_controlee: form.section_controlee,
    voie: form.voie,
    sens: form.sens,
    couche: form.couche,
    nature_support: form.nature_support,
    observations: form.observations,
    resultats: {
      manual_conformity_percent: form.manual_conformity_percent,
      points: form.points.map((item, index) => ({
        point: item.point === '' ? index + 1 : item.point,
        position: item.position,
        diametre_mm: item.diametre_mm,
        macrotexture_mm: item.macrotexture_mm,
        is_conforme: item.is_conforme,
      })),
    },
  }
}

export default function PmtEssaiPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  const fallbackReturnTo = resolveReturnTo(searchParams, '/labo/workbench?tab=interventions')
  const childReturnTo = buildLocationTarget(location)

  const [form, setForm] = useState(null)
  const [loadedUid, setLoadedUid] = useState('')
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const { data: essai, isLoading, isError } = useQuery({
    queryKey: ['pmt-essai', String(uid)],
    queryFn: () => pmtApi.getEssai(uid),
  })

  const saveMut = useMutation({
    mutationFn: (payload) => pmtApi.updateEssai(uid, payload),
    onSuccess: (saved) => {
      qc.setQueryData(['pmt-essai', String(uid)], saved)
      setForm(buildFormFromEssai(saved))
      setLoadedUid(String(saved.uid))
      setSuccess('Essai PMT enregistré.')
      setError('')
    },
    onError: (mutationError) => {
      setError(mutationError.message || 'Impossible d’enregistrer l’essai PMT.')
      setSuccess('')
    },
  })

  useEffect(() => {
    if (!essai || loadedUid === String(essai.uid)) return
    setForm(buildFormFromEssai(essai))
    setLoadedUid(String(essai.uid))
    setError('')
  }, [essai, loadedUid])

  const metrics = useMemo(() => {
    if (!form) return null
    return computeMetrics(form.points, form.manual_conformity_percent)
  }, [form])

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setSuccess('')
  }

  function setPointField(index, key, value) {
    setForm((current) => ({
      ...current,
      points: current.points.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setSuccess('')
  }

  function addPoint() {
    setForm((current) => ({
      ...current,
      points: [...current.points, createEmptyPoint(current.points.length + 1)],
    }))
    setSuccess('')
  }

  function removePoint(index) {
    setForm((current) => {
      const nextPoints = current.points.filter((_, itemIndex) => itemIndex !== index)
      return {
        ...current,
        points: nextPoints.length ? nextPoints : [createEmptyPoint(1)],
      }
    })
    setSuccess('')
  }

  function handleSave() {
    if (!form) return
    saveMut.mutate(buildPayload(form))
  }

  if (isLoading || !form) {
    return <div className="text-xs text-text-muted text-center py-16">Chargement essai PMT…</div>
  }

  if (isError || !essai) {
    return (
      <div className="text-center py-16">
        <p className="text-text-muted text-sm mb-3">Essai PMT introuvable</p>
        <Button onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}>Retour</Button>
      </div>
    )
  }

  const demandRef = essai.demande?.reference || ''
  const campaignRef = essai.campaign?.reference || ''
  const interventionRef = essai.intervention?.reference || ''
  const importedSheet = essai.imported_prefill?.meta?.source_sheet || ''
  const canOpenEssaiReport = Boolean(essai.essai_report?.uid)
  const canOpenCampaignReport = Boolean(essai.campaign_report?.uid)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface shrink-0 flex-wrap">
        <button
          onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
        >
          Retour
        </button>
        {demandRef ? <span className="text-[13px] text-text-muted">{demandRef} › </span> : null}
        <span className="text-[14px] font-semibold flex-1 font-mono">{essai.reference}</span>
        <Badge tone="accent">{form.statut}</Badge>
        {canOpenEssaiReport ? (
          <Button size="sm" variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/pmt/rapports/${essai.essai_report.uid}`, childReturnTo)}>
            Rapport PMT
          </Button>
        ) : null}
        {canOpenCampaignReport ? (
          <Button size="sm" variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/pmt/rapports/${essai.campaign_report.uid}`, childReturnTo)}>
            Rapport campagne
          </Button>
        ) : null}
        <Button size="sm" variant="primary" onClick={handleSave} disabled={saveMut.isPending}>
          {saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>

      <div className="p-5 max-w-[1040px] mx-auto w-full flex flex-col gap-4">
        {error ? (
          <div className="text-sm text-danger bg-[#fcebeb] border border-[#f2d1d1] rounded-lg px-3 py-2">{error}</div>
        ) : null}
        {success ? (
          <div className="text-sm text-[#0f6e56] bg-[#e0f5ef] border border-[#bfe5db] rounded-lg px-3 py-2">{success}</div>
        ) : null}

        <div className="bg-surface border border-border rounded-[10px] p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[22px] font-bold text-accent">{essai.reference}</div>
              <div className="text-[13px] text-text-muted mt-1">
                {campaignRef ? `Campagne ${campaignRef}` : 'Campagne PMT'}
                {interventionRef ? ` · Intervention ${interventionRef}` : ''}
              </div>
              <div className="text-[12px] text-text-muted mt-1">
                {essai.demande?.chantier || essai.demande?.site || essai.demande?.client || 'Chaîne PMT manuelle'}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 min-w-[280px]">
              <MetricCard label="Mesures" value={`${metrics?.measure_count || 0}`} />
              <MetricCard label="Macrotexture moy." value={formatMetric(metrics?.macrotexture_average_mm, 'mm')} tone="accent" />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Mini" value={formatMetric(metrics?.macrotexture_min_mm, 'mm')} />
            <MetricCard label="Maxi" value={formatMetric(metrics?.macrotexture_max_mm, 'mm')} />
            <MetricCard label="Diamètre moy." value={formatMetric(metrics?.diameter_average_mm, 'mm')} />
            <MetricCard label="Conformité" value={formatMetric(metrics?.conformity_percent, '%', 1)} />
          </div>
        </div>

        <Section title="Contexte PMT" right={importedSheet ? <Badge>Import {importedSheet}</Badge> : null}>
          <div className="grid gap-4 md:grid-cols-3">
            <InfoLine label="Demande" value={demandRef} />
            <InfoLine label="Campagne" value={campaignRef} />
            <InfoLine label="Intervention" value={interventionRef} />
            <InfoLine label="Date intervention" value={formatDate(essai.intervention?.date_intervention)} />
            <InfoLine label="Technicien importé" value={essai.intervention?.technicien} />
            <InfoLine label="Préremplissage" value={essai.imported_prefill?.points?.length ? `${essai.imported_prefill.points.length} mesure(s) reprises` : 'Aucun import exploitable'} />
          </div>
        </Section>

        <Section title="Fiche Essai PMT">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Statut">
              <Select value={form.statut} onChange={(event) => setField('statut', event.target.value)}>
                {PMT_STATUTS.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
            </Field>
            <Field label="Date essai">
              <Input type="date" value={form.date_essai} onChange={(event) => setField('date_essai', event.target.value)} />
            </Field>
            <Field label="Opérateur">
              <Input value={form.operateur} onChange={(event) => setField('operateur', event.target.value)} placeholder="Nom opérateur PMT" />
            </Field>
            <Field label="Section contrôlée">
              <Input value={form.section_controlee} onChange={(event) => setField('section_controlee', event.target.value)} placeholder="Section contrôlée" />
            </Field>
            <Field label="Voie">
              <Input value={form.voie} onChange={(event) => setField('voie', event.target.value)} placeholder="Voie" />
            </Field>
            <Field label="Sens">
              <Input value={form.sens} onChange={(event) => setField('sens', event.target.value)} placeholder="Sens de circulation" />
            </Field>
            <Field label="Couche">
              <Input value={form.couche} onChange={(event) => setField('couche', event.target.value)} placeholder="Couche contrôlée" />
            </Field>
            <Field label="Nature support">
              <Input value={form.nature_support} onChange={(event) => setField('nature_support', event.target.value)} placeholder="Nature du support / matériau" />
            </Field>
            <Field label="Taux de conformité (%)" full>
              <Input
                type="number"
                step="0.1"
                value={form.manual_conformity_percent}
                onChange={(event) => setField('manual_conformity_percent', event.target.value)}
                placeholder="Utilisé si la conformité n'est pas renseignée point par point"
              />
            </Field>
            <Field label="Observations" full>
              <Textarea value={form.observations} onChange={(value) => setField('observations', value)} rows={4} placeholder="Remarques de saisie, réserves, suites à donner…" />
            </Field>
          </div>
        </Section>

        <Section title="Mesures de Macrotexture" right={<Button variant="secondary" onClick={addPoint}>Ajouter une ligne</Button>}>
          <div className="text-[13px] leading-6 text-text-muted">
            L’essai PMT est saisi directement ici, sans prélèvement ni groupe labo intermédiaire. Le rapport PMT et la consolidation campagne sont générés à partir de ce tableau.
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg border-b border-border">
                  {['Point', 'Position', 'Diamètre (mm)', 'Macrotexture (mm)', 'Conforme', ''].map((label) => (
                    <th key={label} className="px-2 py-2 text-left text-[11px] font-medium text-text-muted whitespace-nowrap">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.points.map((point, index) => (
                  <tr key={`pmt-point-${index}`} className="border-b border-border align-top">
                    <td className="px-2 py-2 w-[90px]">
                      <Input type="number" value={point.point} onChange={(event) => setPointField(index, 'point', event.target.value)} />
                    </td>
                    <td className="px-2 py-2 min-w-[220px]">
                      <Input value={point.position} onChange={(event) => setPointField(index, 'position', event.target.value)} placeholder="Position / repère" />
                    </td>
                    <td className="px-2 py-2 w-[150px]">
                      <Input type="number" step="0.1" value={point.diametre_mm} onChange={(event) => setPointField(index, 'diametre_mm', event.target.value)} />
                    </td>
                    <td className="px-2 py-2 w-[170px]">
                      <Input type="number" step="0.01" value={point.macrotexture_mm} onChange={(event) => setPointField(index, 'macrotexture_mm', event.target.value)} />
                    </td>
                    <td className="px-2 py-2 w-[160px]">
                      <Select value={point.is_conforme} onChange={(event) => setPointField(index, 'is_conforme', event.target.value)}>
                        <option value="">À compléter</option>
                        <option value="true">Conforme</option>
                        <option value="false">Non conforme</option>
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-right w-[90px]">
                      <button type="button" onClick={() => removePoint(index)} className="text-[12px] text-text-muted hover:text-danger transition-colors">
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  )
}