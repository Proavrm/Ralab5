import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { interventionCampaignsApi } from '@/services/api'
import { buildLocationTarget, buildPathWithReturnTo } from '@/lib/detailNavigation'

function normalizeNonEmpty(value) {
  const text = String(value ?? '').trim()
  return text.length ? text : ''
}

function Field({ label, children, full = false }) {
  return (
    <div className={full ? 'md:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function CampaignSummary({ data }) {
  return (
    <div className="rounded-lg border border-border bg-bg px-4 py-3 text-xs text-text-muted">
      <div>
        Référence: <span className="font-semibold text-text">{data?.reference || '—'}</span>
      </div>
      <div>
        Demande: <span className="font-semibold text-text">{data?.demande_reference || data?.demande_id || '—'}</span>
      </div>
      <div>
        Interventions associées: <span className="font-semibold text-text">{data?.intervention_count || 0}</span>
      </div>
    </div>
  )
}

export default function CampaignPage() {
  const { uid = '' } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const returnTo = String(searchParams.get('return_to') || '').trim()
  const [result, setResult] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaign', uid],
    queryFn: () => interventionCampaignsApi.get(uid),
    enabled: Boolean(uid),
  })

  const [form, setForm] = useState({})

  useEffect(() => {
    if (!data) return
    setForm({
      code: normalizeNonEmpty(data.code),
      label: normalizeNonEmpty(data.label),
      designation: normalizeNonEmpty(data.designation),
      zone_scope: normalizeNonEmpty(data.zone_scope),
      temporalite: normalizeNonEmpty(data.temporalite),
      programme_specifique: normalizeNonEmpty(data.programme_specifique),
      nb_points_prevus: normalizeNonEmpty(data.nb_points_prevus),
      types_essais_prevus: normalizeNonEmpty(data.types_essais_prevus),
      date_debut_prevue: normalizeNonEmpty(data.date_debut_prevue),
      date_fin_prevue: normalizeNonEmpty(data.date_fin_prevue),
      priorite: normalizeNonEmpty(data.priorite) || 'Normale',
      responsable_technique: normalizeNonEmpty(data.responsable_technique),
      attribue_a: normalizeNonEmpty(data.attribue_a),
      criteres_controle: normalizeNonEmpty(data.criteres_controle),
      livrables_attendus: normalizeNonEmpty(data.livrables_attendus),
      notes: normalizeNonEmpty(data.notes),
    })
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (payload) => interventionCampaignsApi.update(uid, payload),
    onSuccess: async (saved) => {
      await qc.invalidateQueries({ queryKey: ['campaign', uid] })
      setResult({ type: 'ok', msg: `Campagne enregistrée: ${saved?.reference || uid}` })
    },
    onError: (error) => {
      setResult({ type: 'err', msg: error?.message || 'Impossible d’enregistrer la campagne.' })
    },
  })

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleSave() {
    saveMutation.mutate({
      code: normalizeNonEmpty(form.code),
      label: normalizeNonEmpty(form.label) || 'Campagne',
      designation: normalizeNonEmpty(form.designation),
      zone_scope: normalizeNonEmpty(form.zone_scope),
      temporalite: normalizeNonEmpty(form.temporalite),
      programme_specifique: normalizeNonEmpty(form.programme_specifique),
      nb_points_prevus: normalizeNonEmpty(form.nb_points_prevus),
      types_essais_prevus: normalizeNonEmpty(form.types_essais_prevus),
      date_debut_prevue: normalizeNonEmpty(form.date_debut_prevue),
      date_fin_prevue: normalizeNonEmpty(form.date_fin_prevue),
      priorite: normalizeNonEmpty(form.priorite) || 'Normale',
      responsable_technique: normalizeNonEmpty(form.responsable_technique),
      attribue_a: normalizeNonEmpty(form.attribue_a),
      criteres_controle: normalizeNonEmpty(form.criteres_controle),
      livrables_attendus: normalizeNonEmpty(form.livrables_attendus),
      notes: normalizeNonEmpty(form.notes),
    })
  }

  function openNewInterventionFromCampaign() {
    const params = new URLSearchParams()
    if (data?.demande_id != null && data.demande_id !== '') params.set('demande_id', String(data.demande_id))
    params.set('source', 'campagne')
    if (data?.uid != null && data.uid !== '') params.set('campaign_uid', String(data.uid))
    if (data?.reference) params.set('campaign_ref', String(data.reference))
    if (data?.code) params.set('campaign_code', String(data.code))
    if (data?.label) params.set('campaign_label', String(data.label))
    if (data?.designation) params.set('campaign_designation', String(data.designation))
    if (data?.programme_specifique) params.set('campaign_programme', String(data.programme_specifique))
    if (data?.zone_scope) params.set('campaign_zone', String(data.zone_scope))
    if (data?.temporalite) params.set('campaign_temporalite', String(data.temporalite))
    if (data?.nb_points_prevus != null && data.nb_points_prevus !== '') params.set('campaign_nb_points', String(data.nb_points_prevus))
    if (data?.types_essais_prevus) params.set('campaign_essais', String(data.types_essais_prevus))
    if (data?.responsable_technique) params.set('campaign_responsable', String(data.responsable_technique))
    if (data?.attribue_a) params.set('campaign_attribue_a', String(data.attribue_a))
    const detailReturnTo = buildLocationTarget(location)
    navigate(buildPathWithReturnTo(`/interventions/new?${params.toString()}`, detailReturnTo))
  }

  if (isLoading) return <div className="py-10 text-center text-sm text-text-muted">Chargement campagne…</div>
  if (isError || !data) return <div className="py-10 text-center text-sm text-danger">Impossible de charger la campagne.</div>

  return (
    <div className="flex h-full -m-6 overflow-y-auto">
      <div className="w-full">
        <div className="flex items-center gap-2 px-6 bg-surface border-b border-border min-h-[58px] shrink-0 sticky top-0 z-10 flex-wrap">
          <button
            type="button"
            onClick={() => navigate(returnTo || `/demandes/${data.demande_id}`)}
            className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors"
          >
            Retour
          </button>
          {data?.demande_reference ? <span className="text-[13px] text-text-muted">{data.demande_reference} › </span> : null}
          <span className="truncate text-[14px] font-semibold flex-1 font-mono">
            {data.reference || `Campagne #${uid}`}
          </span>
          {data?.statut ? (
            <span className="inline-flex items-center rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] font-medium text-text-muted">
              {data.statut}
            </span>
          ) : null}
          <Button variant="secondary" size="sm" onClick={openNewInterventionFromCampaign}>
            Nouvelle intervention
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>

        <div className="mx-auto w-full max-w-[1280px] px-6 py-3 flex flex-col gap-4">
          <CampaignSummary data={data} />

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text">Configuration campagne</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Type / code"><Input value={form.code || ''} onChange={(e) => setField('code', e.target.value)} /></Field>
              <Field label="Libellé"><Input value={form.label || ''} onChange={(e) => setField('label', e.target.value)} /></Field>
              <Field label="Objectif / désignation" full><Input value={form.designation || ''} onChange={(e) => setField('designation', e.target.value)} /></Field>
              <Field label="Zone / scope" full><Input value={form.zone_scope || ''} onChange={(e) => setField('zone_scope', e.target.value)} /></Field>
              <Field label="Temporalité" full><Input value={form.temporalite || ''} onChange={(e) => setField('temporalite', e.target.value)} /></Field>
              <Field label="Programme spécifique" full><textarea value={form.programme_specifique || ''} onChange={(e) => setField('programme_specifique', e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y" /></Field>
              <Field label="Nb points prévus"><Input value={form.nb_points_prevus || ''} onChange={(e) => setField('nb_points_prevus', e.target.value)} /></Field>
              <Field label="Types d'essais prévus"><Input value={form.types_essais_prevus || ''} onChange={(e) => setField('types_essais_prevus', e.target.value)} /></Field>
              <Field label="Date début prévue"><Input type="date" value={form.date_debut_prevue || ''} onChange={(e) => setField('date_debut_prevue', e.target.value)} /></Field>
              <Field label="Date fin prévue"><Input type="date" value={form.date_fin_prevue || ''} onChange={(e) => setField('date_fin_prevue', e.target.value)} /></Field>
              <Field label="Priorité"><Input value={form.priorite || ''} onChange={(e) => setField('priorite', e.target.value)} /></Field>
              <Field label="Responsable technique"><Input value={form.responsable_technique || ''} onChange={(e) => setField('responsable_technique', e.target.value)} /></Field>
              <Field label="Attribué à"><Input value={form.attribue_a || ''} onChange={(e) => setField('attribue_a', e.target.value)} /></Field>
              <Field label="Critères de contrôle" full><textarea value={form.criteres_controle || ''} onChange={(e) => setField('criteres_controle', e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y" /></Field>
              <Field label="Livrables attendus" full><textarea value={form.livrables_attendus || ''} onChange={(e) => setField('livrables_attendus', e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y" /></Field>
              <Field label="Notes" full><textarea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent resize-y" /></Field>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-text">Interventions associées</h2>
            <div className="mt-2 text-xs text-text-muted">{data.intervention_count || 0} intervention(s)</div>
            <div className="mt-3 flex flex-col gap-2">
              {(Array.isArray(data.interventions) ? data.interventions : []).length ? (
                data.interventions.map((item) => (
                  <button
                    key={item.uid}
                    type="button"
                    onClick={() => navigate(`/interventions/${item.uid}`)}
                    className="rounded-lg border border-border bg-bg px-3 py-2 text-left hover:border-accent"
                  >
                    <div className="text-sm font-semibold text-accent">{item.reference || `Intervention #${item.uid}`}</div>
                    <div className="text-xs text-text-muted">
                      {[item.type_intervention, item.date_intervention, item.statut].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="mt-1 text-xs text-text">{item.sujet || item.zone || item.nature_reelle || ''}</div>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-text-muted">
                  Aucune intervention associée à cette campagne.
                </div>
              )}
            </div>
          </div>

          {result ? (
            <div className={`rounded-lg border px-3 py-2 text-xs ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
              {result.msg}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
