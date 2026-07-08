import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import {
  buildVisiteChantierDocument,
  buildVisiteChantierInitialPayload,
  buildVisiteChantierRapportPath,
  buildVisiteChantierRapportSections,
  VISITE_CHANTIER_LABEL,
} from '@/lib/modeleVisiteChantierContent'
import { useReportAutoPrint } from '@/lib/reportAutoPrint'
import { formatDate } from '@/lib/utils'
import { demandesApi, feuillesTerrainApi, interventionsApi, interventionCampaignsApi } from '@/services/api'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-vc.css'

function valueOrDash(value) {
  if (value == null || String(value).trim() === '') return '-'
  return String(value)
}

function renderMultiline(value) {
  const text = valueOrDash(value)
  if (text === '-') return text
  return String(text).split('\n').map((line, index) => (
    <div key={`${line.slice(0, 24)}-${index}`}>{line || '\u00a0'}</div>
  ))
}

function RapportField({ label, value, full = false }) {
  return (
    <div className={full ? 'rapport-field rapport-field-full' : 'rapport-field'}>
      <strong>{label}</strong>
      <div>{renderMultiline(value)}</div>
    </div>
  )
}

function formatSectionHeading(title) {
  const match = String(title || '').match(/^(\d+\/)\s*(.+)$/)
  if (!match) return { prefix: '', label: String(title || '').toUpperCase() }
  return { prefix: `${match[1]} `, label: match[2].toUpperCase() }
}

function VcRapportSections({ sections, start = 0, end = sections.length }) {
  return sections.slice(start, end).map((section) => {
    const heading = formatSectionHeading(section.title)
    return (
      <section key={section.title} className="rapport-section">
        <h2>{heading.prefix}<span>{heading.label}</span></h2>
        <div className="rapport-grid-2">
          {section.rows.map((row) => (
            <RapportField
              key={`${section.title}-${row.label}`}
              label={row.label}
              value={row.value}
              full={row.full}
            />
          ))}
        </div>
      </section>
    )
  })
}

const VC_PAGE1_SECTION_COUNT = 4

export default function RapportVisiteChantierPage() {
  const { feuilleUid: routeFeuilleUid } = useParams()
  const [searchParams] = useSearchParams()
  const feuilleUid = String(routeFeuilleUid || searchParams.get('feuille_uid') || '').trim()
  const isPreview = !feuilleUid
  const isEmbed = String(searchParams.get('embed') || '').trim() === '1'
  const hideToolbar = String(searchParams.get('hide_toolbar') || '').trim() === '1'
  useReportAutoPrint(searchParams)

  const { data: feuille, isLoading, error } = useQuery({
    queryKey: ['rapport-visite-chantier-feuille', feuilleUid],
    queryFn: () => feuillesTerrainApi.get(feuilleUid),
    enabled: Boolean(feuilleUid),
  })

  const interventionId = String(feuille?.intervention_id || feuille?.intervention_uid || '').trim()

  const { data: intervention } = useQuery({
    queryKey: ['rapport-visite-chantier-intervention', interventionId],
    queryFn: () => interventionsApi.get(interventionId),
    enabled: Boolean(interventionId),
  })

  const demandeId = String(feuille?.demande_id || intervention?.demande_id || '').trim()
  const campaignId = String(
    feuille?.campagne_id || feuille?.campaign_id || intervention?.campagne_id || intervention?.campaign_id || '',
  ).trim()

  const { data: demande } = useQuery({
    queryKey: ['rapport-visite-chantier-demande', demandeId],
    queryFn: () => demandesApi.get(demandeId),
    enabled: Boolean(demandeId),
  })

  const { data: campaign } = useQuery({
    queryKey: ['rapport-visite-chantier-campaign', campaignId],
    queryFn: () => interventionCampaignsApi.get(campaignId),
    enabled: Boolean(campaignId),
  })

  const { data: photoGalleryData } = useQuery({
    queryKey: ['rapport-visite-chantier-photos', feuilleUid],
    queryFn: () => feuillesTerrainApi.listFeuillePhotos(feuilleUid),
    enabled: Boolean(feuilleUid),
  })

  const photoItems = useMemo(
    () => (Array.isArray(photoGalleryData?.photos) ? photoGalleryData.photos : []),
    [photoGalleryData?.photos],
  )

  const affaireNumber = useMemo(() => (
    demande?.affaire_ref
    || demande?.affaire_reference
    || demande?.affaire_nge
    || intervention?.affaire_ref
    || intervention?.affaire_reference
    || ''
  ), [demande, intervention])

  const document = useMemo(() => {
    if (isPreview) {
      return buildVisiteChantierDocument({
        feuille: { reference: 'Modèle VC', label: VISITE_CHANTIER_LABEL },
        payload: buildVisiteChantierInitialPayload(),
      })
    }
    if (!feuille) return null
    return buildVisiteChantierDocument({
      feuille,
      intervention,
      demande,
      campaign,
      payload: feuille.payload || feuille.resultats,
    })
  }, [isPreview, feuille, intervention, demande, campaign])

  const sections = useMemo(
    () => buildVisiteChantierRapportSections(document),
    [document],
  )

  if (!isPreview && isLoading) {
    return <div className="p-8 text-center">Chargement du rapport…</div>
  }

  if (!isPreview && error) {
    return <div className="p-8 text-center text-red-700">{error.message || 'Rapport indisponible.'}</div>
  }

  if (!document) {
    return <div className="p-8 text-center">Rapport indisponible.</div>
  }

  const alertLabel = document.payload?.sortie?.alerte === 'Oui'
    ? 'Alerte émise'
    : document.payload?.sortie?.alerte === 'Non'
      ? 'Pas d\'alerte'
      : 'Pour information'

  const totalPages = 2
  const rapportPath = feuilleUid
    ? buildVisiteChantierRapportPath({ feuilleUid })
    : buildVisiteChantierRapportPath()
  const feuilleTarget = feuilleUid
    ? `/feuilles-terrain/vc/${encodeURIComponent(feuilleUid)}?return_to=${encodeURIComponent(rapportPath)}`
    : ''
  const headerProps = {
    reportTypeLabel: 'VC n°',
    reportNumber: document.meta.reference || feuilleUid || 'view',
    affaireNumber,
    editionDate: formatDate(document.meta.date),
    siteTitle: document.meta.chantier,
    mainTitle: 'COMPTE RENDU DE VISITE CHANTIER',
    subtitle: VISITE_CHANTIER_LABEL,
  }

  return (
    <RapportPageShell
      embedded={isEmbed}
      hideToolbar={hideToolbar}
      toolbar={(
        <RapportToolbar
          reportReference={document.meta.reference || `VC-${feuilleUid || 'view'}`}
          feuilleTarget={feuilleTarget}
        />
      )}
    >
      <div className="rapport-vc-paper-stack">
        <main className="rapport-page rapport-page-a4 rapport-vc-page" id="rapport-vc-printable-1">
          <div className="rapport-print-frame rapport-vc-frame">
            <RapportHeader {...headerProps} />
            <div className="rapport-vc-page-indicator">Page 1/{totalPages}</div>
            <VcRapportSections sections={sections} end={VC_PAGE1_SECTION_COUNT} />
          </div>
        </main>

        <main className="rapport-page rapport-page-a4 rapport-vc-page rapport-vc-page-continued" id="rapport-vc-printable-2">
          <div className="rapport-print-frame rapport-vc-frame">
            <RapportHeader {...headerProps} />
            <div className="rapport-vc-page-indicator">Page 2/{totalPages}</div>
            <VcRapportSections sections={sections} start={VC_PAGE1_SECTION_COUNT} />

            {photoItems.length ? (
              <section className="rapport-section">
                <h2>6/ <span>PHOTOS DE VISITE</span></h2>
                <div className="rapport-vc-photos">
                  {photoItems.map((photo) => (
                    <figure key={photo.stored_name} className="rapport-vc-photo">
                      <img
                        src={photo.url}
                        alt={photo.original_name || photo.filename}
                      />
                      <figcaption>{photo.original_name || photo.filename}</figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ) : null}

            <RapportConclusionBlock
              controlLabel="Visite chantier"
              conformityLabel={alertLabel}
              name={document.meta.technicien}
              functionName="Technicien RST"
              comments={[
                document.payload?.sortie?.synthese,
                document.payload?.sortie?.suites,
              ].filter(Boolean).join('\n\n')}
            />

            <RapportFooter documentCode="RAP-VC" />
          </div>
        </main>
      </div>
    </RapportPageShell>
  )
}
