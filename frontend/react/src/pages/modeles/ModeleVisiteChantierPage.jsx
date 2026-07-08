import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/ui/Button'
import EssaiCorrectionBanner from '@/components/essais/EssaiCorrectionBanner'
import Input from '@/components/ui/Input'
import { demandesApi, feuillesTerrainApi, interventionsApi, interventionCampaignsApi } from '@/services/api'
import {
  getFeuilleValidationInfo,
  getRapportStatusLabel,
  isFeuilleRapportLocked,
} from '@/lib/essaiValidation'
import { formatDate } from '@/lib/utils'
import { navigateBackWithFallback, resolveReturnTo } from '@/lib/detailNavigation'
import {
  buildVisiteChantierDocument,
  buildVisiteChantierInitialPayload,
  buildVisiteChantierRapportPath,
  mergeVisiteChantierPayload,
  VISITE_CHANTIER_LABEL,
} from '@/lib/modeleVisiteChantierContent'

const META_CHIP_TONES = {
  neutral: 'border-[#dbe1ea] bg-[#f8fafc] text-[#475569]',
  draft: 'border-[#dbe1ea] bg-[#f8fafc] text-[#475569]',
  pending: 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]',
  validated: 'border-[#bbf7d0] bg-[#ecfdf5] text-[#047857]',
  issued: 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]',
  correction: 'border-[#fcd34d] bg-[#fffbeb] text-[#92400e]',
  rejected: 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]',
}

function MetaChip({ label, value, tone = 'neutral' }) {
  if (!value) return null
  const toneClass = META_CHIP_TONES[tone] || META_CHIP_TONES.neutral
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      <span className="text-[#8a95a8] mr-1">{label}</span>
      {value}
    </span>
  )
}

function rapportStatusTone(status) {
  const label = getRapportStatusLabel(status)
  if (label === 'Émis') return 'issued'
  if (label === 'Validé technique') return 'validated'
  if (label === 'Correction demandée') return 'correction'
  if (label === 'Refusé') return 'rejected'
  if (label === 'À valider') return 'pending'
  return 'draft'
}

function FieldBlock({ label, value, onChange, full = false, readOnly = false, rows = 3 }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? 'md:col-span-2' : ''}`}>
      <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">{label}</span>
      {readOnly ? (
        <div className="rounded-lg border border-[#e5e9f0] bg-[#f8fafc] px-3 py-2 text-[13px] text-[#334155] whitespace-pre-wrap min-h-[42px]">
          {value || '—'}
        </div>
      ) : (
        <textarea
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
          rows={rows}
          className="w-full resize-y rounded-lg border border-[#dbe1ea] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#003170]"
        />
      )}
    </label>
  )
}

function VisiteChantierPhotosSection({ feuilleUid, affaireRef = '', readOnly = false }) {
  const fileInputRef = useRef(null)
  const [photoVersion, setPhotoVersion] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const { data: photoGalleryData } = useQuery({
    queryKey: ['feuille-photo-gallery', feuilleUid, photoVersion],
    queryFn: () => feuillesTerrainApi.listFeuillePhotos(feuilleUid),
    enabled: Boolean(feuilleUid),
    staleTime: 0,
  })

  const photoItems = useMemo(
    () => (Array.isArray(photoGalleryData?.photos) ? photoGalleryData.photos : []),
    [photoGalleryData?.photos],
  )

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !feuilleUid) return
    try {
      setUploading(true)
      setPhotoError('')
      await feuillesTerrainApi.uploadFeuillePhoto(feuilleUid, file, affaireRef)
      setPhotoVersion((value) => value + 1)
    } catch (error) {
      setPhotoError(error.message || 'Impossible de charger la photo.')
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(storedName) {
    if (!feuilleUid || !storedName) return
    if (!window.confirm('Supprimer cette photo ?')) return
    try {
      setUploading(true)
      setPhotoError('')
      await feuillesTerrainApi.deleteFeuillePhoto(feuilleUid, storedName)
      setPhotoVersion((value) => value + 1)
    } catch (error) {
      setPhotoError(error.message || 'Impossible de supprimer la photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="px-6 py-5 border-b border-[#e5e9f0] last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-[14px] font-black uppercase tracking-[.08em] text-[#003170]">
            Photos de visite
          </h2>
          <p className="mt-1 text-[12px] text-[#69758a]">
            Illustrations du chantier, sections PL2/PL3, singularités repérées.
          </p>
        </div>
        {!readOnly ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/jpg"
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Chargement…' : 'Ajouter une photo'}
            </Button>
          </>
        ) : null}
      </div>

      {photoError ? (
        <div className="mb-3 rounded-lg border border-[#f2c6c6] bg-[#fcebeb] px-3 py-2 text-[12px] text-[#a32d2d]">
          {photoError}
        </div>
      ) : null}

      {photoItems.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photoItems.map((photo) => (
            <div
              key={photo.stored_name}
              className="overflow-hidden rounded-lg border border-[#dbe1ea] bg-[#f8fafc]"
            >
              <div className="aspect-[4/3] bg-[#eef2f7]">
                <img
                  src={`${photo.url}?v=${photoVersion}`}
                  alt={photo.original_name || photo.filename}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-2">
                <div className="min-w-0 text-[11px] text-[#475569] truncate" title={photo.original_name || photo.filename}>
                  {photo.original_name || photo.filename}
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => handleDelete(photo.stored_name)}
                    disabled={uploading}
                    className="shrink-0 text-[11px] font-bold text-[#a32d2d] hover:underline disabled:opacity-50"
                  >
                    Suppr.
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 text-center text-[13px] text-[#69758a]">
          {readOnly
            ? 'Aucune photo pour cette visite.'
            : 'Aucune photo pour cette visite. Ajoutez des clichés terrain pour le compte rendu.'}
        </div>
      )}
    </section>
  )
}

export default function ModeleVisiteChantierPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { uid: routeFeuilleUid } = useParams()
  const [searchParams] = useSearchParams()
  const feuilleUid = String(routeFeuilleUid || searchParams.get('feuille_uid') || '').trim()
  const returnTo = resolveReturnTo(searchParams.get('return_to'), '/interventions')
  const isPreview = !feuilleUid

  const [payload, setPayload] = useState(null)
  const [header, setHeader] = useState({ dateFeuille: '', operateur: '', observations: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveInfo, setSaveInfo] = useState('')

  const { data: feuille, isLoading: feuilleLoading, error: feuilleError } = useQuery({
    queryKey: ['feuille-visite-chantier', feuilleUid],
    queryFn: () => feuillesTerrainApi.get(feuilleUid),
    enabled: Boolean(feuilleUid),
  })

  const interventionId = String(feuille?.intervention_id || feuille?.intervention_uid || '').trim()

  const { data: intervention } = useQuery({
    queryKey: ['visite-chantier-intervention', interventionId],
    queryFn: () => interventionsApi.get(interventionId),
    enabled: Boolean(interventionId),
  })

  const demandeId = String(intervention?.demande_id || feuille?.demande_id || '').trim()
  const campaignId = String(intervention?.campagne_id || intervention?.campaign_id || feuille?.campagne_id || '').trim()

  const { data: demande } = useQuery({
    queryKey: ['visite-chantier-demande', demandeId],
    queryFn: () => demandesApi.get(demandeId),
    enabled: Boolean(demandeId),
  })

  const { data: campaign } = useQuery({
    queryKey: ['visite-chantier-campaign', campaignId],
    queryFn: () => interventionCampaignsApi.get(campaignId),
    enabled: Boolean(campaignId),
  })

  const storedPayload = useMemo(() => {
    if (!feuille) return null
    return feuille.payload || feuille.resultats || null
  }, [feuille])

  useEffect(() => {
    if (isPreview) {
      setPayload(buildVisiteChantierInitialPayload())
      setHeader({ dateFeuille: '', operateur: '', observations: '' })
      return
    }
    if (!feuille) return

    const defaults = buildVisiteChantierInitialPayload({
      intervention,
      demande,
      campaign,
      feuille,
    })
    setPayload(mergeVisiteChantierPayload(storedPayload, defaults))
    setHeader({
      dateFeuille: String(feuille.date_feuille || '').slice(0, 10),
      operateur: feuille.operateur || '',
      observations: feuille.observations || '',
    })
  }, [isPreview, feuille, intervention, demande, campaign, storedPayload])

  const document = useMemo(() => buildVisiteChantierDocument({
    feuille: isPreview
      ? { reference: 'Modèle VC', label: VISITE_CHANTIER_LABEL }
      : feuille,
    intervention,
    demande,
    campaign,
    payload,
  }), [isPreview, feuille, intervention, demande, campaign, payload])

  const validationInfo = useMemo(() => getFeuilleValidationInfo(feuille), [feuille])
  const rapportStatusLabel = getRapportStatusLabel(validationInfo.status)
  const isFormLocked = isFeuilleRapportLocked(validationInfo)
  const isReadOnly = isPreview || isFormLocked
  const validationPath = document.meta.reference
    ? `/rapports/validation?report=${encodeURIComponent(document.meta.reference)}`
    : '/rapports/validation'

  function updateSection(sectionKey, fieldKey, value) {
    setPayload((current) => ({
      ...(current || {}),
      [sectionKey]: {
        ...(current?.[sectionKey] || {}),
        [fieldKey]: value,
      },
    }))
    setSaveInfo('')
  }

  function updateHeader(field, value) {
    setHeader((current) => ({ ...current, [field]: value }))
    setSaveInfo('')
  }

  async function handleSave() {
    if (!feuilleUid || !payload || isFormLocked) return
    setSaving(true)
    setSaveError('')
    setSaveInfo('')
    try {
      const existingPayload = storedPayload && typeof storedPayload === 'object' ? storedPayload : {}
      const nextPayload = {
        ...existingPayload,
        version: payload.version || existingPayload.version || 1,
        contexte: payload.contexte,
        deroulement: payload.deroulement,
        constats: payload.constats,
        sortie: payload.sortie,
      }
      await feuillesTerrainApi.update(feuilleUid, {
        date_feuille: header.dateFeuille || null,
        operateur: header.operateur || '',
        observations: header.observations || '',
        payload: nextPayload,
      })
      await qc.invalidateQueries({ queryKey: ['feuille-visite-chantier', feuilleUid] })
      if (interventionId) {
        await qc.invalidateQueries({ queryKey: ['visite-chantier-intervention', interventionId] })
      }
      setSaveInfo('Feuille enregistrée')
    } catch (error) {
      setSaveError(error.message || 'Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  const loading = Boolean(feuilleUid) && feuilleLoading
  const rapportPath = feuilleUid
    ? buildVisiteChantierRapportPath({ feuilleUid, returnTo: `/feuilles-terrain/vc/${encodeURIComponent(feuilleUid)}` })
    : buildVisiteChantierRapportPath()

  function openRapport() {
    navigate(rapportPath)
  }

  return (
    <div
      className="flex flex-col h-full -m-6 overflow-y-auto"
      style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #f3f6fb 42%, #eef3fa 100%)' }}
    >
      <div className="sticky top-0 z-10 border-b border-[#dbe1ea] bg-white/95 backdrop-blur px-6 py-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigateBackWithFallback(navigate, returnTo)}
          className="px-3 py-2 rounded-xl text-[#69758a] text-[13px] font-bold hover:bg-[#f3f6fb]"
        >
          ← Retour
        </button>
        <div className="flex-1 min-w-[220px]">
          <div className="text-[10px] font-black uppercase tracking-[.12em] text-[#8a95a8]">
            Terrain · Visite chantier
          </div>
          <div className="text-[15px] font-black text-[#003170]">
            {document.meta.reference || VISITE_CHANTIER_LABEL}
          </div>
        </div>
        {isPreview ? (
          <span className="inline-flex items-center rounded-full border border-[#dbe1ea] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-bold text-[#475569]">
            Modèle — aperçu
          </span>
        ) : (
          <>
            {isFormLocked ? (
              <span className="inline-flex items-center rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-2.5 py-1 text-[11px] font-bold text-[#1d4ed8]">
                Rapport {rapportStatusLabel}
              </span>
            ) : null}
            <Button size="sm" variant="secondary" onClick={() => navigate(validationPath)}>
              Validation rapport
            </Button>
            <Button size="sm" variant="secondary" onClick={openRapport}>
              Voir le rapport
            </Button>
            {!isFormLocked ? (
              <Button size="sm" variant="primary" onClick={handleSave} disabled={saving || !payload}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            ) : null}
          </>
        )}
      </div>

      <div className="mx-auto w-full max-w-[980px] px-6 py-6 flex flex-col gap-5">
        {feuilleError ? (
          <div className="rounded-[18px] border border-[#f2c6c6] bg-[#fcebeb] px-5 py-4 text-[13px] text-[#a32d2d]">
            {feuilleError.message || 'Impossible de charger la feuille'}
          </div>
        ) : null}

        {saveError ? (
          <div className="rounded-[18px] border border-[#f2c6c6] bg-[#fcebeb] px-5 py-4 text-[13px] text-[#a32d2d]">
            {saveError}
          </div>
        ) : null}

        {saveInfo ? (
          <div className="rounded-[18px] border border-[#b8e6cf] bg-[#edfbf3] px-5 py-4 text-[13px] text-[#0f6e56]">
            {saveInfo}
          </div>
        ) : null}

        {!isPreview && isFormLocked ? (
          <div className="rounded-[18px] border border-[#c7d2fe] bg-[#eef2ff] px-5 py-4 text-[13px] text-[#312e81]">
            <p className="font-semibold">
              Feuille verrouillée — rapport « {rapportStatusLabel} »
            </p>
            <p className="mt-1 text-[#4338ca]">
              Les données ne peuvent plus être modifiées après validation technique ou émission.
              Consultez le rapport PDF ou la page Validation rapports.
            </p>
          </div>
        ) : null}

        {!isPreview ? (
          <EssaiCorrectionBanner validation={validationInfo} essaiLabel="visite chantier" />
        ) : null}

        {loading ? (
          <div className="rounded-[18px] border border-[#dbe1ea] bg-white px-5 py-8 text-center text-[13px] text-[#69758a]">
            Chargement de la feuille…
          </div>
        ) : null}

        {!loading && payload ? (
          <article className="overflow-hidden rounded-[18px] border border-[#dbe1ea] bg-white shadow-[0_6px_22px_rgba(0,49,112,0.06)]">
            <header
              className="border-b border-[#e5e9f0] px-6 py-5"
              style={{ background: 'linear-gradient(90deg, #f8fafc 0%, #f8fafc 78%, #fff6cf 100%)' }}
            >
              <div className="text-[11px] font-black uppercase tracking-[.14em] text-[#003170]">
                {VISITE_CHANTIER_LABEL}
              </div>
              <h1 className="mt-2 text-[24px] font-black text-[#003170]">
                {document.meta.intervention || document.meta.chantier || 'Visite terrain'}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <MetaChip label="Demande" value={document.meta.demande} />
                <MetaChip label="Campagne" value={document.meta.campagne} />
                <MetaChip label="Date" value={formatDate(document.meta.date)} />
                <MetaChip label="Technicien" value={document.meta.technicien} />
                <MetaChip label="Intervention" value={document.meta.statut} />
                <MetaChip
                  label="Rapport"
                  value={rapportStatusLabel}
                  tone={rapportStatusTone(validationInfo.status)}
                />
              </div>
            </header>

            <div className="px-6 py-5 border-b border-[#e5e9f0] grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Date visite</span>
                <Input
                  type="date"
                  value={header.dateFeuille}
                  onChange={(event) => updateHeader('dateFeuille', event.target.value)}
                  readOnly={isReadOnly}
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Technicien / rédacteur</span>
                <Input
                  value={header.operateur}
                  onChange={(event) => updateHeader('operateur', event.target.value)}
                  readOnly={isReadOnly}
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-3">
                <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">Observations générales (en-tête)</span>
                <Input
                  value={header.observations}
                  onChange={(event) => updateHeader('observations', event.target.value)}
                  readOnly={isReadOnly}
                />
              </label>
            </div>

            {document.sections.map((section) => (
              <section key={section.key} className="px-6 py-5 border-b border-[#e5e9f0] last:border-b-0">
                <h2 className="text-[14px] font-black uppercase tracking-[.08em] text-[#003170] mb-4">
                  {section.title}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {section.fields.map((field) => (
                    <FieldBlock
                      key={`${section.key}.${field.key}`}
                      label={field.label}
                      value={payload?.[section.key]?.[field.key] || ''}
                      onChange={(value) => updateSection(section.key, field.key, value)}
                      full={field.full}
                      readOnly={isReadOnly}
                      rows={field.full ? 4 : 2}
                    />
                  ))}
                </div>
              </section>
            ))}

            {!isPreview && feuilleUid ? (
              <VisiteChantierPhotosSection
                feuilleUid={feuilleUid}
                affaireRef={demande?.affaire_reference || demande?.affaire_rst_reference || ''}
                readOnly={isFormLocked}
              />
            ) : null}
          </article>
        ) : null}

        {isPreview ? (
          <div className="rounded-[18px] border border-[#dbe1ea] bg-white px-5 py-4 text-[13px] text-[#475569]">
            Ce modèle sert d&apos;aperçu. Pour une visite réelle, créez la feuille depuis une intervention
            de type « Visite chantier » — elle sera liée au dossier et enregistrable.
            {' '}
            <button type="button" onClick={openRapport} className="font-semibold text-[#003170] hover:underline">
              Voir l&apos;aperçu du rapport
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
