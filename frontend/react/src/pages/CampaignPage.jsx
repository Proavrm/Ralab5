import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Save, Wrench } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { demandesApi, interventionCampaignsApi } from '@/services/api'
import { buildLocationTarget, buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import { formatDate } from '@/lib/utils'
import {
  EmptyStateBox,
  FicheBadge,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  LABO_NOM,
  MetricCard,
  PRIO_CLS,
  SectionCard,
} from '@/components/layout/FicheLayout'

const PRIORITY_OPTIONS = ['Basse', 'Normale', 'Haute', 'Urgente']

function normalizeNonEmpty(value) {
  const text = String(value ?? '').trim()
  return text.length ? text : ''
}

function Field({ label, children, full = false }) {
  return (
    <div className={full ? 'col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'}>
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
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

function CampaignHero({ campaign, demande, metrics }) {
  if (!campaign) return null

  const subtitle = campaign.designation || campaign.programme_specifique || campaign.zone_scope || 'Campagne à cadrer'

  return (
    <section
      className="overflow-hidden rounded-[26px] border border-[#dbe1ea] bg-white"
      style={{ boxShadow: '0 10px 34px rgba(0,49,112,0.08)' }}
    >
      <div
        className="relative flex flex-wrap justify-between gap-6 text-white px-[30px] pt-[30px] pb-7"
        style={{ background: 'linear-gradient(135deg, #003170 0%, #00224f 74%, #001a3d 100%)' }}
      >
        <div className="absolute right-0 bottom-0 w-[270px] h-2.5 bg-[#ffcc00] rounded-tl-full" />
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 mb-3.5 rounded-full border border-[rgba(255,204,0,0.55)] bg-[rgba(255,204,0,0.12)] px-2.5 py-1.5 text-[11px] font-black tracking-[.12em] uppercase">
            <span className="w-[9px] h-[9px] rounded-full bg-[#ffcc00]" style={{ boxShadow: '0 0 0 4px rgba(255,204,0,0.18)' }} />
            RaLab 5 · Campagne
          </div>
          <h1 className="text-[32px] font-black leading-none tracking-tight m-0">{campaign.reference || '—'}</h1>
          <div className="mt-3 text-[20px] font-black">{campaign.label || 'Campagne'}</div>
          <div className="mt-2 text-[14px] text-white/85 leading-6 max-w-[720px]">{subtitle}</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-2.5 text-[13px] text-white/80">
            {campaign.demande_reference || demande?.reference ? (
              <span>
                Demande : <strong className="text-white">{campaign.demande_reference || demande?.reference}</strong>
              </span>
            ) : null}
            {demande?.affaire_ref ? (
              <span>
                Affaire : <strong className="text-white">{demande.affaire_ref}</strong>
              </span>
            ) : null}
            {demande?.chantier ? (
              <span>
                Chantier : <strong className="text-white">{demande.chantier}</strong>
              </span>
            ) : null}
            {demande?.client ? (
              <span>
                Client : <strong className="text-white">{demande.client}</strong>
              </span>
            ) : null}
            {campaign.zone_scope ? (
              <span>
                Zone : <strong className="text-white">{campaign.zone_scope}</strong>
              </span>
            ) : null}
          </div>
        </div>
        <div className="min-w-[260px] max-w-[440px] rounded-[18px] border border-white/20 bg-white/[.11] p-4 text-right">
          <div className="flex flex-wrap justify-end gap-2">
            <FicheBadge s={campaign.statut} />
            <FicheBadge s={campaign.priorite} map={PRIO_CLS} />
          </div>
          <div className="mt-4 text-white/65 text-[11px] font-black tracking-[.12em] uppercase">Laboratoire</div>
          <div className="mt-1.5 text-[13px] font-black">{LABO_NOM[demande?.labo_code] || demande?.labo_code || '—'}</div>
          <div className="mt-2 text-[12px] font-black text-white/70">
            {[campaign.temporalite, campaign.responsable_technique].filter(Boolean).join(' · ') || 'Pilotage à cadrer'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#f8fafc] p-5">
        <MetricCard label="Interventions" value={metrics.interventionCount} detail="Rattachées à la campagne" />
        <MetricCard label="Points prévus" value={metrics.nbPoints} detail="Volume terrain cible" />
        <MetricCard label="Début prévu" value={metrics.dateDebut} detail={metrics.dateFinDetail} />
        <MetricCard label="Priorité" value={metrics.priorite} detail={metrics.responsableDetail} />
      </div>
    </section>
  )
}

export default function CampaignPage() {
  const { uid = '' } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const returnTo = resolveReturnTo(searchParams.get('return_to'), '/demandes')
  const [result, setResult] = useState(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['campaign', uid],
    queryFn: () => interventionCampaignsApi.get(uid),
    enabled: Boolean(uid),
  })

  const demandeUid = data?.demande_id ?? data?.demande_uid
  const { data: demande } = useQuery({
    queryKey: ['demande', demandeUid],
    queryFn: () => demandesApi.get(demandeUid),
    enabled: Boolean(demandeUid),
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
      if (demandeUid) {
        await qc.invalidateQueries({ queryKey: ['demande-nav', String(demandeUid)] })
        await qc.invalidateQueries({ queryKey: ['campagnes', String(demandeUid)] })
      }
      setResult({ type: 'ok', msg: `Campagne enregistrée : ${saved?.reference || uid}` })
    },
    onError: (error) => {
      setResult({ type: 'err', msg: error?.message || 'Impossible d’enregistrer la campagne.' })
    },
  })

  const heroCampaign = useMemo(() => (data ? { ...data, ...form } : null), [data, form])

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

  const preparationHref = demandeUid
    ? buildPathWithReturnTo(
      `/preparations/${demandeUid}${demande?.reference ? `?ref=${encodeURIComponent(demande.reference)}` : ''}`,
      returnTo,
    )
    : null

  if (isLoading) {
    return (
      <FichePageShell>
        <FicheMain>
          <div className="rounded-[18px] border border-[#dbe1ea] bg-white p-10 text-center text-[#69758a] text-[13px]">
            Chargement campagne…
          </div>
        </FicheMain>
      </FichePageShell>
    )
  }

  if (isError || !data) {
    return (
      <FichePageShell>
        <FicheTopbar backLabel="← Retour" onBack={() => navigate(returnTo)} eyebrow="Campagne" title="Introuvable" />
        <FicheMain>
          <EmptyStateBox
            icon="⚠️"
            title="Impossible de charger la campagne"
            description="La campagne est introuvable ou inaccessible. Revenez à la demande et réessayez."
            action={(
              <Button size="sm" variant="primary" onClick={() => navigate(returnTo)}>
                Retour
              </Button>
            )}
          />
        </FicheMain>
      </FichePageShell>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnTo)}
        eyebrow="Campagne d'intervention"
        title={data.reference || `Campagne #${uid}`}
      >
        {demandeUid ? (
          <>
            <button
              type="button"
              onClick={() => navigate(buildPathWithReturnTo(`/demandes/${demandeUid}`, returnTo))}
              className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]"
            >
              Demande
            </button>
            {preparationHref ? (
              <button
                type="button"
                onClick={() => navigate(preparationHref)}
                className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]"
              >
                Préparation
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => navigate(buildPathWithReturnTo(`/campagnes?demande_id=${demandeUid}`, returnTo))}
              className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]"
            >
              Campagnes
            </button>
            <button
              type="button"
              onClick={() => navigate(buildPathWithReturnTo(`/interventions?demande_id=${demandeUid}`, returnTo))}
              className="px-3.5 py-2 rounded-xl border border-[#dbe1ea] bg-white text-[13px] font-bold text-[#003170] hover:bg-[#f3f6fb]"
            >
              Interventions
            </button>
          </>
        ) : null}
        <Button size="sm" variant="secondary" onClick={openNewInterventionFromCampaign}>
          <Plus size={13} />
          <span className="ml-1">Nouvelle intervention</span>
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
          <Save size={13} />
          <span className="ml-1">{saveMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}</span>
        </Button>
      </FicheTopbar>

      <FicheMain>
        <CampaignHero
          campaign={heroCampaign}
          demande={demande}
          metrics={{
            interventionCount: data.intervention_count || 0,
            nbPoints: form.nb_points_prevus || '—',
            dateDebut: form.date_debut_prevue ? formatDate(form.date_debut_prevue) : '—',
            dateFinDetail: form.date_fin_prevue ? `Fin ${formatDate(form.date_fin_prevue)}` : 'Planning à cadrer',
            priorite: form.priorite || '—',
            responsableDetail: form.responsable_technique || 'Responsable à définir',
          }}
        />

        {result ? (
          <div className={`rounded-[14px] border px-4 py-3 text-[13px] ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
            {result.msg}
          </div>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1.55fr)_360px] gap-4">
          <SectionCard title="Configuration campagne" subtitle="Cadrage opérationnel de la campagne">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Type / code"><Input value={form.code || ''} onChange={(e) => setField('code', e.target.value)} /></Field>
              <Field label="Libellé"><Input value={form.label || ''} onChange={(e) => setField('label', e.target.value)} /></Field>
              <Field label="Objectif / désignation" full><Input value={form.designation || ''} onChange={(e) => setField('designation', e.target.value)} /></Field>
              <Field label="Zone / scope" full><Input value={form.zone_scope || ''} onChange={(e) => setField('zone_scope', e.target.value)} /></Field>
              <Field label="Temporalité" full><Input value={form.temporalite || ''} onChange={(e) => setField('temporalite', e.target.value)} /></Field>
              <Field label="Programme spécifique" full><Textarea value={form.programme_specifique} onChange={(value) => setField('programme_specifique', value)} rows={3} /></Field>
              <Field label="Nb points prévus"><Input value={form.nb_points_prevus || ''} onChange={(e) => setField('nb_points_prevus', e.target.value)} /></Field>
              <Field label="Types d'essais prévus"><Input value={form.types_essais_prevus || ''} onChange={(e) => setField('types_essais_prevus', e.target.value)} /></Field>
              <Field label="Date début prévue"><Input type="date" value={form.date_debut_prevue || ''} onChange={(e) => setField('date_debut_prevue', e.target.value)} /></Field>
              <Field label="Date fin prévue"><Input type="date" value={form.date_fin_prevue || ''} onChange={(e) => setField('date_fin_prevue', e.target.value)} /></Field>
              <Field label="Priorité">
                <Select value={form.priorite || 'Normale'} onChange={(e) => setField('priorite', e.target.value)}>
                  {PRIORITY_OPTIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Responsable technique"><Input value={form.responsable_technique || ''} onChange={(e) => setField('responsable_technique', e.target.value)} /></Field>
              <Field label="Attribué à"><Input value={form.attribue_a || ''} onChange={(e) => setField('attribue_a', e.target.value)} /></Field>
              <Field label="Critères de contrôle" full><Textarea value={form.criteres_controle} onChange={(value) => setField('criteres_controle', value)} rows={2} /></Field>
              <Field label="Livrables attendus" full><Textarea value={form.livrables_attendus} onChange={(value) => setField('livrables_attendus', value)} rows={2} /></Field>
              <Field label="Notes" full><Textarea value={form.notes} onChange={(value) => setField('notes', value)} rows={3} /></Field>
            </div>
          </SectionCard>

          <SectionCard
            title="Interventions associées"
            subtitle={`${data.intervention_count || 0} intervention(s) rattachée(s)`}
            actions={(
              <Button size="sm" variant="secondary" onClick={openNewInterventionFromCampaign}>
                <Wrench size={13} />
                <span className="ml-1">Créer</span>
              </Button>
            )}
          >
            <div className="flex flex-col gap-2">
              {(Array.isArray(data.interventions) ? data.interventions : []).length ? (
                data.interventions.map((item) => (
                  <button
                    key={item.uid}
                    type="button"
                    onClick={() => navigate(buildPathWithReturnTo(`/interventions/${item.uid}`, buildLocationTarget(location)))}
                    className="rounded-[14px] border border-[#dbe1ea] bg-[#fbfcfe] px-4 py-3 text-left transition-colors hover:border-[#003170]/25 hover:bg-white"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="text-[14px] font-black text-[#003170]">{item.reference || `Intervention #${item.uid}`}</div>
                      {item.statut ? <FicheBadge s={item.statut} /> : null}
                    </div>
                    <div className="mt-1 text-[12px] text-[#69758a]">
                      {[item.type_intervention, item.date_intervention ? formatDate(item.date_intervention) : ''].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="mt-1 text-[13px] text-[#172033]">{item.sujet || item.zone || item.nature_reelle || ''}</div>
                  </button>
                ))
              ) : (
                <EmptyStateBox
                  icon="🛠️"
                  title="Aucune intervention"
                  description="Créez une intervention rattachée à cette campagne pour démarrer l'exécution terrain."
                  action={(
                    <Button size="sm" variant="primary" onClick={openNewInterventionFromCampaign}>
                      Créer une intervention
                    </Button>
                  )}
                />
              )}
            </div>
          </SectionCard>
        </div>
      </FicheMain>
    </FichePageShell>
  )
}
