import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import {
  FicheBadge,
  FicheMain,
  FichePageShell,
  FicheTopbar,
  SectionCard,
} from '@/components/layout/FicheLayout'
import { api, demandesApi, interventionsApi, interventionCampaignsApi, passationsApi } from '@/services/api'
import { formatDate } from '@/lib/utils'
import { resolveReturnTo } from '@/lib/detailNavigation'
import { buildG3NotesTechniquesPath, buildModeleNTDocument } from '@/lib/modeleNTContent'
import {
  buildNoteTechniqueCreatePayload,
  buildNoteTechniqueLifecyclePayload,
  findNoteTechniqueIntervention,
  isNoteTechniqueIntervention,
  NOTE_TECHNIQUE_STATUTS,
  toDateInputValue,
} from '@/lib/noteTechniqueIntervention'

function MetaChip({ label, value }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
      <span className="text-[#8a95a8] mr-1">{label}</span>
      {value}
    </span>
  )
}

function NtSection({ section }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[15px] font-black uppercase tracking-[.08em] text-[#003170] border-b border-[#dbe1ea] pb-2">
        {section.title}
      </h2>
      {(section.paragraphs || []).map((paragraph) => (
        <p key={paragraph.slice(0, 48)} className="text-[14px] leading-7 text-[#1f2937] whitespace-pre-wrap">
          {paragraph}
        </p>
      ))}
      {section.bullets?.length ? (
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          {section.bullets.map((item) => (
            <li key={item} className="text-[13px] leading-6 text-[#334155]">{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function NtLifecyclePanel({
  lifecycle,
  onChange,
  onSave,
  saving,
  saveError,
  saveInfo,
}) {
  return (
    <SectionCard title="Suivi & dates">
      <div className="grid grid-cols-1 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Date début</span>
          <Input
            type="date"
            value={lifecycle.dateDebut}
            onChange={(event) => onChange('dateDebut', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Statut</span>
          <Select
            value={lifecycle.statut}
            onChange={(event) => onChange('statut', event.target.value)}
            className="w-full"
          >
            {NOTE_TECHNIQUE_STATUTS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Date fin</span>
          <Input
            type="date"
            value={lifecycle.dateFin}
            onChange={(event) => onChange('dateFin', event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Date envoi</span>
          <Input
            type="date"
            value={lifecycle.dateEnvoi}
            onChange={(event) => onChange('dateEnvoi', event.target.value)}
          />
        </label>
      </div>
      {saveError ? (
        <p className="mt-3 text-[12px] text-[#a32d2d]">{saveError}</p>
      ) : null}
      {saveInfo ? (
        <p className="mt-3 text-[12px] text-[#0f6e56]">{saveInfo}</p>
      ) : null}
      <div className="mt-3">
        <Button size="sm" variant="primary" onClick={onSave} disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer le suivi'}
        </Button>
      </div>
    </SectionCard>
  )
}

export default function NoteTechniquePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { uid: routeUid = '' } = useParams()
  const [searchParams] = useSearchParams()
  const isNouveau = location.pathname.endsWith('/nouveau')
  const demandeIdParam = String(searchParams.get('demande_id') || '').trim()
  const demandeRefParam = String(searchParams.get('demande_ref') || '').trim()
  const campaignId = String(searchParams.get('campaign_id') || '').trim()
  const returnTo = resolveReturnTo(searchParams.get('return_to'), '/g3/notes-techniques')
  const interventionId = isNouveau ? '' : String(routeUid || '').trim()

  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [lifecycle, setLifecycle] = useState({
    dateDebut: '',
    statut: 'Planifiée',
    dateFin: '',
    dateEnvoi: '',
  })
  const [savingLifecycle, setSavingLifecycle] = useState(false)
  const [lifecycleError, setLifecycleError] = useState('')
  const [lifecycleInfo, setLifecycleInfo] = useState('')

  const { data: demandeByRef } = useQuery({
    queryKey: ['demande-by-ref', demandeRefParam],
    queryFn: async () => {
      const rows = await demandesApi.list({ search: demandeRefParam, limit: 1 })
      return Array.isArray(rows) ? rows[0] : null
    },
    enabled: isNouveau && !demandeIdParam && Boolean(demandeRefParam),
  })

  const resolvedDemandeId = isNouveau
    ? (demandeIdParam || String(demandeByRef?.uid || demandeByRef?.id || '').trim())
    : ''

  const { data: intervention, isLoading: interventionLoading, error: interventionError } = useQuery({
    queryKey: ['note-technique-intervention', interventionId],
    queryFn: () => interventionsApi.get(interventionId),
    enabled: Boolean(interventionId),
  })

  const interventionDemandeId = String(intervention?.demande_id || '').trim()
  const activeDemandeId = isNouveau ? resolvedDemandeId : interventionDemandeId

  const { data: nav, isLoading: navLoading, error: navError } = useQuery({
    queryKey: ['demande-nav', activeDemandeId],
    queryFn: () => api.get(`/demandes_rst/${activeDemandeId}/navigation`),
    enabled: Boolean(activeDemandeId),
  })

  const passationUid = nav?.passation_uid || null

  const { data: passation } = useQuery({
    queryKey: ['note-technique-passation', passationUid],
    queryFn: () => passationsApi.get(passationUid),
    enabled: Boolean(passationUid),
  })

  const resolvedCampaignId = campaignId
    || String(intervention?.campagne_id || intervention?.campaign_id || '').trim()

  const { data: campaign } = useQuery({
    queryKey: ['note-technique-campaign', resolvedCampaignId],
    queryFn: () => interventionCampaignsApi.get(resolvedCampaignId),
    enabled: Boolean(resolvedCampaignId),
  })

  const noteTechnique = useMemo(
    () => findNoteTechniqueIntervention({
      campaigns: nav?.campagnes || [],
      interventions: nav?.interventions || [],
      notesTechniques: nav?.notes_techniques || [],
    }),
    [nav],
  )

  const activeInterventionId = interventionId || String(noteTechnique?.uid || '')

  const lifecycleSource = intervention || noteTechnique

  useEffect(() => {
    if (!lifecycleSource?.uid) return
    setLifecycle({
      dateDebut: toDateInputValue(lifecycleSource.date_intervention),
      statut: lifecycleSource.statut || 'Planifiée',
      dateFin: toDateInputValue(lifecycleSource.date_fin),
      dateEnvoi: toDateInputValue(lifecycleSource.date_envoi),
    })
  }, [
    lifecycleSource?.uid,
    lifecycleSource?.date_intervention,
    lifecycleSource?.statut,
    lifecycleSource?.date_fin,
    lifecycleSource?.date_envoi,
  ])

  useEffect(() => {
    if (!isNouveau || !noteTechnique?.uid || creating) return
    navigate(buildG3NotesTechniquesPath({
      interventionUid: noteTechnique.uid,
      returnTo,
    }), { replace: true })
  }, [isNouveau, noteTechnique?.uid, creating, navigate, returnTo])

  const document = useMemo(() => buildModeleNTDocument({
    nav,
    passation,
    intervention: lifecycleSource,
    campaign,
  }), [nav, passation, lifecycleSource, campaign])

  const loading = (Boolean(activeDemandeId) && navLoading)
    || (Boolean(interventionId) && interventionLoading && !interventionError)
    || (isNouveau && Boolean(demandeRefParam) && !demandeIdParam && !demandeByRef && !navError)

  const missingContext = isNouveau
    ? !activeDemandeId && !demandeRefParam
    : !interventionId

  const hasNote = Boolean(lifecycleSource?.uid && (isNoteTechniqueIntervention(lifecycleSource) || interventionId))
  const pageTitle = document?.meta?.intervention
    || lifecycleSource?.reference
    || (isNouveau ? 'Nouvelle note technique' : 'Note technique')
  const pageSubtitle = document?.meta?.demande
    || nav?.demande?.reference
    || lifecycleSource?.sujet
    || ''

  async function handleSaveLifecycle() {
    if (!activeInterventionId) return
    setLifecycleError('')
    setLifecycleInfo('')
    setSavingLifecycle(true)
    try {
      await interventionsApi.update(activeInterventionId, buildNoteTechniqueLifecyclePayload(lifecycle))
      await qc.invalidateQueries({ queryKey: ['note-technique-intervention', activeInterventionId] })
      await qc.invalidateQueries({ queryKey: ['demande-nav', activeDemandeId] })
      await qc.invalidateQueries({ queryKey: ['notes-techniques'] })
      await qc.invalidateQueries({ queryKey: ['preparation-planning', activeDemandeId] })
      setLifecycleInfo('Suivi enregistré')
    } catch (error) {
      setLifecycleError(error.message || 'Erreur lors de l\'enregistrement')
    } finally {
      setSavingLifecycle(false)
    }
  }

  function handleLifecycleChange(field, value) {
    setLifecycle((current) => ({ ...current, [field]: value }))
    setLifecycleInfo('')
  }

  async function handleCreateNoteTechnique() {
    if (!activeDemandeId || noteTechnique?.uid) return
    setCreateError('')
    setCreating(true)
    try {
      const demande = nav?.demande || {}
      const preparation = nav?.preparation || {}
      const created = await interventionsApi.create(buildNoteTechniqueCreatePayload({
        demandeUid: activeDemandeId,
        preparation,
        demande,
      }))
      await qc.invalidateQueries({ queryKey: ['demande-nav', activeDemandeId] })
      await qc.invalidateQueries({ queryKey: ['preparation-planning', activeDemandeId] })
      await qc.invalidateQueries({ queryKey: ['notes-techniques'] })
      navigate(buildG3NotesTechniquesPath({
        interventionUid: created.uid,
        returnTo,
      }), { replace: true })
    } catch (error) {
      setCreateError(error.message || 'Erreur lors de la création de la note technique')
    } finally {
      setCreating(false)
    }
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnTo)}
        eyebrow="G3 · Note technique"
        title={pageTitle}
        subtitle={pageSubtitle}
      >
        {lifecycleSource?.statut ? <FicheBadge s={lifecycleSource.statut} /> : null}
        {isNouveau && activeDemandeId && !noteTechnique ? (
          <Button size="sm" onClick={handleCreateNoteTechnique} disabled={creating || loading}>
            {creating ? 'Création…' : 'Créer note technique'}
          </Button>
        ) : null}
      </FicheTopbar>

      <FicheMain>
        {missingContext ? (
          <div className="rounded-[18px] border border-[#f2c6c6] bg-[#fcebeb] px-5 py-4 text-[13px] text-[#a32d2d]">
            {isNouveau
              ? 'Indiquez une demande (demande_id ou demande_ref dans l\'URL).'
              : 'Note technique introuvable.'}
          </div>
        ) : null}

        {interventionError ? (
          <div className="rounded-[18px] border border-[#f2c6c6] bg-[#fcebeb] px-5 py-4 text-[13px] text-[#a32d2d]">
            {interventionError.message || 'Impossible de charger la note technique'}
          </div>
        ) : null}

        {createError ? (
          <div className="rounded-[18px] border border-[#f2c6c6] bg-[#fcebeb] px-5 py-4 text-[13px] text-[#a32d2d]">
            {createError}
          </div>
        ) : null}

        {navError ? (
          <div className="rounded-[18px] border border-[#f2c6c6] bg-[#fcebeb] px-5 py-4 text-[13px] text-[#a32d2d]">
            {navError.message || 'Erreur de chargement du dossier'}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[18px] border border-[#dbe1ea] bg-white px-5 py-8 text-center text-[13px] text-[#69758a]">
            Chargement du dossier…
          </div>
        ) : null}

        {!loading && isNouveau && activeDemandeId && !noteTechnique && !creating ? (
          <div className="rounded-[16px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[13px] text-[#475569]">
            Aucune note technique sur cette demande — une seule NT par demande, créée sur action explicite.
          </div>
        ) : null}

        {!loading && !missingContext && document && hasNote ? (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <SectionCard
              title="Note technique synthétique"
              subtitle={document.subtitle}
            >
              <div className="flex flex-wrap gap-2 mb-5">
                <MetaChip label="Affaire" value={document.meta.affaire} />
                <MetaChip label="Demande" value={document.meta.demande} />
                <MetaChip label="Passation" value={document.meta.passation} />
                <MetaChip label="Réf. NT" value={document.meta.intervention} />
                <MetaChip label="Début" value={formatDate(document.meta.dateDebut)} />
                <MetaChip label="Statut" value={document.meta.statut} />
                <MetaChip label="Fin" value={formatDate(document.meta.dateFin)} />
                <MetaChip label="Envoi" value={formatDate(document.meta.dateEnvoi)} />
                {document.meta.comparisonGroup ? (
                  <MetaChip label="Comparaison" value={document.meta.comparisonGroup} />
                ) : null}
              </div>
              <h1 className="text-[20px] font-black leading-tight text-[#003170] mb-6">
                {document.title}
              </h1>
              <div className="flex flex-col gap-8">
                {document.sections.map((section) => (
                  <NtSection key={section.id} section={section} />
                ))}
              </div>
            </SectionCard>

            <aside className="flex flex-col gap-4">
              {activeInterventionId ? (
                <NtLifecyclePanel
                  lifecycle={lifecycle}
                  onChange={handleLifecycleChange}
                  onSave={handleSaveLifecycle}
                  saving={savingLifecycle}
                  saveError={lifecycleError}
                  saveInfo={lifecycleInfo}
                />
              ) : null}

              <SectionCard title="Sources dossier">
                <div className="flex flex-col gap-2">
                  {(document?.sources || []).map((item) => (
                    <div key={item.label} className="rounded-lg border border-[#eef2f7] bg-[#f8fafc] px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">{item.label}</div>
                      <div className="text-[12px] font-semibold text-[#003170]">{item.value}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {document?.meta?.responsables ? (
                <SectionCard title="Responsables">
                  <dl className="flex flex-col gap-2 text-[12px]">
                    {Object.entries(document.meta.responsables).map(([key, value]) => (
                      value ? (
                        <div key={key} className="flex flex-col gap-0.5">
                          <dt className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">{key}</dt>
                          <dd className="text-[#334155]">{value}</dd>
                        </div>
                      ) : null
                    ))}
                  </dl>
                </SectionCard>
              ) : null}

              {document?.campaigns?.length ? (
                <SectionCard title="Campagnes lues">
                  <div className="flex flex-col gap-2">
                    {document.campaigns.map((item) => (
                      <div key={item.uid} className="rounded-lg border border-[#eef2f7] px-3 py-2">
                        <div className="text-[12px] font-bold text-[#003170]">{item.reference || item.code}</div>
                        <div className="text-[11px] text-[#69758a]">{item.label}</div>
                        {item.zone_type ? (
                          <div className="text-[10px] font-semibold text-[#1d9e75] mt-1">{item.zone_type}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}

              <div className="rounded-[16px] border border-[#dbe1ea] bg-[#fff6cf] p-4 text-[12px] leading-6 text-[#8A6410]">
                Rédaction G3 — le planning affiche la note technique comme repère sur toutes les campagnes,
                sans permettre l&apos;édition du document depuis le planning.
              </div>
            </aside>
          </div>
        ) : null}
      </FicheMain>
    </FichePageShell>
  )
}
