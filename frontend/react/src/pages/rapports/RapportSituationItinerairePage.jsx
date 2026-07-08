import { useMemo, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import { buildDocumentStorageUrl } from '@/lib/documentVersionDrop'
import { buildDistanceToLabCaption } from '@/lib/labGeo'
import { useReportAutoPrint } from '@/lib/reportAutoPrint'
import {
  MISSION_TERRAIN_FICHE_SUBTITLE,
  MISSION_TERRAIN_FICHE_TITLE,
  countPlanImplantationPoints,
  findItineraryDocument,
  findPlanSituationDocument,
  resolvePlanImplantationImage,
} from '@/lib/siteAccessRapport'
import {
  buildAnnuaireContactMap,
  buildFmtProgrammeRows,
  enrichInterventionForFmt,
  resolveFmtLocalisation,
  resolveFmtTechnicienLabel,
  resolveFmtTerrainContacts,
  resolveTechnicienPhoneFromDirectory,
} from '@/lib/fmtMissionTerrain'
import { useLaboratoireCatalog } from '@/hooks/useLaboratoireCatalog'
import { formatDate } from '@/lib/utils'
import {
  fetchFeuilleMissionSnapshotHash,
  recordFeuilleMissionJournee,
} from '@/lib/feuilleMissionJournee'
import { isNoteTechniqueIntervention } from '@/lib/noteTechniqueIntervention'
import {
  normalizeTechnicienKey,
  resolveInterventionTechnicienLabel,
} from '@/lib/planningShared'
import { affairesApi, api, authApi, interventionCampaignsApi, interventionsApi, plansImplantationApi } from '@/services/api'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-si.css'

function valueOrDash(value) {
  if (value == null || String(value).trim() === '') return '-'
  return String(value)
}

function SiField({ label, value, full = false }) {
  return (
    <div className={`rapport-si-field ${full ? 'rapport-si-field-full' : ''}`}>
      <strong>{label}</strong>
      <div>{valueOrDash(value)}</div>
    </div>
  )
}

function SiNotesField({ label, hint = '', lines = 4 }) {
  return (
    <div className="rapport-si-field rapport-si-field-full rapport-si-notes-field">
      <strong>{label}</strong>
      {hint ? <div className="rapport-si-notes-hint">{hint}</div> : null}
      <div
        className="rapport-si-notes-area"
        style={{ '--si-notes-lines': lines }}
        aria-hidden="true"
      />
    </div>
  )
}

function SiFmtClosureSection({ technicienLabel = '' }) {
  return (
    <section className="rapport-section rapport-si-closure" aria-label="Validation terrain">
      <div className="rapport-si-closure-grid rapport-si-closure-grid-inline">
        <div className="rapport-si-closure-field">
          <strong>Technicien</strong>
          <div className="rapport-si-closure-value">{technicienLabel || '—'}</div>
        </div>
        <div className="rapport-si-closure-field">
          <strong>Date</strong>
          <div className="rapport-si-closure-line" aria-hidden="true" />
        </div>
        <div className="rapport-si-closure-field">
          <strong>Signature</strong>
          <div className="rapport-si-closure-line rapport-si-closure-line-tall" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

function SiMapFigure({ src, alt, landscape = false, missingText, missingClassName = '' }) {
  if (!src) {
    return (
      <div className={`rapport-si-missing ${missingClassName}`.trim()}>
        {missingText}
      </div>
    )
  }
  return (
    <figure className={`rapport-si-map ${landscape ? 'rapport-si-map-landscape' : ''}`}>
      <img src={src} alt={alt} />
    </figure>
  )
}

function collectNavInterventions(nav) {
  const byUid = new Map()
  for (const campaign of nav?.campagnes || []) {
    for (const intervention of campaign.interventions || []) {
      byUid.set(String(intervention.uid), intervention)
    }
  }
  for (const intervention of nav?.interventions || []) {
    if (!byUid.has(String(intervention.uid))) {
      byUid.set(String(intervention.uid), intervention)
    }
  }
  return Array.from(byUid.values())
}

function isTerrainMissionIntervention(intervention) {
  if (!intervention) return false
  if (isNoteTechniqueIntervention(intervention)) return false
  return true
}

function interventionMatchesJournee(intervention, missionDate, technicienLabel) {
  const date = String(intervention?.date_intervention || '').slice(0, 10)
  if (date !== missionDate) return false
  const label = resolveInterventionTechnicienLabel(intervention) || 'Sans technicien'
  return normalizeTechnicienKey(label) === normalizeTechnicienKey(technicienLabel || 'Sans technicien')
}

function SiInterventionMissionBlock({ intervention, index }) {
  const item = enrichInterventionForFmt(intervention)
  if (!item) return null
  return (
    <div className="rapport-si-mission-block">
      <h3 className="rapport-si-mission-heading">
        {index + 1}. {item.reference || `Intervention #${item.uid}`}
      </h3>
      <div className="rapport-si-grid-2">
        <SiField label="Type" value={item.type_intervention} />
        <SiField label="Statut" value={item.statut} />
        <SiField label="Zone" value={item.zone} />
        <SiField label="Objet / sujet" value={item.sujet} full />
        <SiField label="Finalité" value={item.finalite || item.finalite_intervention} full />
        {item.objectif_intervention ? (
          <SiField
            label="Objectif terrain"
            value={item.objectif_intervention}
            full
          />
        ) : null}
      </div>
    </div>
  )
}

function SiConsignesList({ items = [] }) {
  if (!items.length) return null
  return (
    <div className="rapport-si-consignes-box">
      <p className="rapport-si-consignes-title">Consignes terrain</p>
      <ul className="rapport-si-consignes">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function SiProgrammeEssaisSection({ rows = [] }) {
  return (
    <section className="rapport-section">
      <h2>2/ <span>ESSAIS &amp; POINTS PRÉVUS</span></h2>
      {!rows.length ? (
        <p className="rapport-si-missing rapport-si-missing-inline">
          Aucune intervention terrain dans le périmètre.
        </p>
      ) : (
        <table className="rapport-si-mission-table rapport-si-programme-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Réf.</th>
              <th>Type</th>
              <th>Objet / objectif</th>
              <th>Essais prévus</th>
              <th>Points à réaliser</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.uid || row.reference || index}>
                <td>{index + 1}</td>
                <td>{valueOrDash(row.reference || `#${row.uid}`)}</td>
                <td>{valueOrDash(row.type)}</td>
                <td>{valueOrDash(row.objet)}</td>
                <td>{row.essais?.length ? row.essais.join(' · ') : '—'}</td>
                <td>{valueOrDash(row.points) === '-' ? '—' : row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function SiContactsConsignesSection({ contacts }) {
  if (!contacts) return null
  const contactMissing = !String(contacts.contactChantier || '').trim()
  const contactDisplay = contactMissing
    ? 'À renseigner dans l\'intervention (Contact chantier / accès), puis régénérer la feuille'
    : contacts.contactChantier
  return (
    <section className="rapport-section rapport-si-section-terrain">
      <h2>3/ <span>CONTACTS &amp; CONSIGNES TERRAIN</span></h2>
      <div className="rapport-si-grid-2">
        <div className={`rapport-si-field rapport-si-field-full ${contactMissing ? 'rapport-si-field-alert' : ''}`}>
          <strong>Contact chantier / accès</strong>
          <div>{contactDisplay}</div>
        </div>
        <SiField label="Demandeur" value={contacts.demandeur} />
        <SiField label="Responsable dossier" value={contacts.responsableDossier} />
        {contacts.planPrevention ? (
          <SiField label="Plan de prévention" value={contacts.planPrevention} />
        ) : null}
        {contacts.contraintesAcces ? (
          <SiField label="Contraintes d'accès" value={contacts.contraintesAcces} />
        ) : null}
      </div>
      <div className="rapport-si-notes-stack">
        <SiNotesField
          label="Retour chantier (si nécessaire) — notes terrain"
          lines={2}
        />
        <SiNotesField
          label="Observations — notes terrain"
          lines={5}
        />
        <SiNotesField
          label="Compte rendu (CR) — notes terrain"
          lines={4}
        />
      </div>
      <div className="rapport-si-consignes-anchor">
        <SiConsignesList items={contacts.consignes} />
      </div>
    </section>
  )
}

export default function RapportSituationItinerairePage() {
  const { demandeUid: routeDemandeUid } = useParams()
  const [searchParams] = useSearchParams()
  const demandeUid = String(routeDemandeUid || searchParams.get('demande_uid') || '').trim()
  const campagneUid = String(searchParams.get('campagne_uid') || '').trim()
  const interventionUid = String(searchParams.get('intervention_uid') || '').trim()
  const missionDate = String(searchParams.get('mission_date') || '').trim()
  const missionTechnicien = String(searchParams.get('technicien') || '').trim()
  const isJourneeMode = Boolean(missionDate && !interventionUid)
  const isEmbed = String(searchParams.get('embed') || '').trim() === '1'
  const hideToolbar = String(searchParams.get('hide_toolbar') || '').trim() === '1'

  const { data: nav, isLoading: navLoading, error: navError } = useQuery({
    queryKey: ['rapport-acces-chantier-nav', demandeUid],
    queryFn: () => api.get(`/demandes_rst/${demandeUid}/navigation`),
    enabled: Boolean(demandeUid),
  })

  const demande = nav?.demande || null
  const documents = nav?.documents || []
  const affaireUid = demande?.affaire_rst_id
  const laboCode = demande?.labo_code || 'SP'
  const { labLine } = useLaboratoireCatalog()

  const planDoc = useMemo(() => findPlanSituationDocument(documents), [documents])
  const itineraryDoc = useMemo(() => findItineraryDocument(documents), [documents])

  const { data: affaire } = useQuery({
    queryKey: ['rapport-acces-chantier-affaire', affaireUid, laboCode],
    queryFn: () => affairesApi.get(affaireUid, { labo_code: laboCode }),
    enabled: Boolean(affaireUid),
  })

  const { data: affaireContacts = [] } = useQuery({
    queryKey: ['rapport-fmt-affaire-contacts', affaireUid],
    queryFn: () => affairesApi.listContacts(affaireUid),
    enabled: Boolean(affaireUid),
    staleTime: 60 * 1000,
  })

  const { data: planMeta } = useQuery({
    queryKey: ['rapport-acces-chantier-plan-meta', affaireUid, planDoc?.stored_path],
    queryFn: () => affairesApi.getSitePlanMeta(affaireUid, planDoc.stored_path, { kind: 'plan' }),
    enabled: Boolean(affaireUid && planDoc?.stored_path),
  })

  const { data: itineraryMeta } = useQuery({
    queryKey: ['rapport-acces-chantier-itin-meta', affaireUid, itineraryDoc?.stored_path],
    queryFn: () => affairesApi.getSitePlanMeta(affaireUid, itineraryDoc.stored_path, { kind: 'itinerary' }),
    enabled: Boolean(affaireUid && itineraryDoc?.stored_path),
  })

  const siteLat = planMeta?.lat ?? itineraryMeta?.lat ?? affaire?.site_lat
  const siteLon = planMeta?.lon ?? itineraryMeta?.lon ?? affaire?.site_lon

  const { data: liveItinerary } = useQuery({
    queryKey: ['rapport-acces-chantier-itin-live', affaireUid, siteLat, siteLon, laboCode],
    queryFn: () => affairesApi.getSitePlanItinerary(affaireUid, { lat: siteLat, lon: siteLon, laboCode }),
    enabled: Boolean(affaireUid && siteLat != null && siteLon != null),
  })

  const planListParams = useMemo(() => {
    if (interventionUid) return { intervention_id: interventionUid }
    if (isJourneeMode && demandeUid) return { demande_id: demandeUid }
    if (campagneUid) return { campagne_id: campagneUid }
    if (demandeUid) return { demande_id: demandeUid }
    return {}
  }, [demandeUid, campagneUid, interventionUid, isJourneeMode])

  const journeeInterventions = useMemo(() => {
    if (!isJourneeMode || !nav) return []
    return collectNavInterventions(nav)
      .filter(isTerrainMissionIntervention)
      .filter((item) => interventionMatchesJournee(item, missionDate, missionTechnicien))
      .sort((a, b) => String(a.reference || '').localeCompare(String(b.reference || ''), 'fr'))
  }, [isJourneeMode, nav, missionDate, missionTechnicien])

  const journeeInterventionUids = useMemo(
    () => new Set(journeeInterventions.map((item) => String(item.uid))),
    [journeeInterventions],
  )

  const { data: implantationPlansRaw = [] } = useQuery({
    queryKey: ['rapport-acces-chantier-plans', planListParams],
    queryFn: () => plansImplantationApi.list(planListParams),
    enabled: Boolean(planListParams.demande_id || planListParams.campagne_id || planListParams.intervention_id),
  })

  const implantationPlans = useMemo(() => {
    if (!isJourneeMode || !journeeInterventionUids.size) return implantationPlansRaw
    return (implantationPlansRaw || []).filter(
      (plan) => journeeInterventionUids.has(String(plan.intervention_id)),
    )
  }, [implantationPlansRaw, isJourneeMode, journeeInterventionUids])

  const { data: campagne } = useQuery({
    queryKey: ['rapport-acces-chantier-campagne', campagneUid],
    queryFn: () => interventionCampaignsApi.get(campagneUid),
    enabled: Boolean(campagneUid),
  })

  const { data: intervention } = useQuery({
    queryKey: ['rapport-acces-chantier-intervention', interventionUid],
    queryFn: () => interventionsApi.get(interventionUid),
    enabled: Boolean(interventionUid),
  })

  const primaryImplantationPlan = implantationPlans[0] || null
  const implantationImagePath = resolvePlanImplantationImage(primaryImplantationPlan)
  const implantationPointCount = countPlanImplantationPoints(primaryImplantationPlan)

  const planImageUrl = planDoc?.stored_path ? buildDocumentStorageUrl(planDoc.stored_path) : ''
  const itineraryImageUrl = itineraryDoc?.stored_path ? buildDocumentStorageUrl(itineraryDoc.stored_path) : ''
  const implantationImageUrl = implantationImagePath ? buildDocumentStorageUrl(implantationImagePath) : ''

  const addressLabel = planMeta?.address_label
    || itineraryMeta?.address_label
    || affaire?.site_geocode_label
    || affaire?.adresse_ouvrage
    || demande?.adresse_ouvrage
    || ''

  const distanceCaption = buildDistanceToLabCaption(
    planMeta?.distance_to_lab
    || itineraryMeta?.distance_to_lab
    || liveItinerary?.distance_to_lab
    || affaire?.site_geo?.distance_to_lab,
  )

  const drivingDistance = liveItinerary?.driving_distance_text || ''
  const drivingDuration = liveItinerary?.driving_duration_min != null
    ? `~${liveItinerary.driving_duration_min} min`
    : ''
  const labAddress = liveItinerary?.labo_address || liveItinerary?.labo_label || ''

  const annotationPins = Array.isArray(planMeta?.pins) ? planMeta.pins : []
  const zoneCount = Array.isArray(planMeta?.zones) ? planMeta.zones.length : 0

  const contextLabel = [
    !isJourneeMode && campagne?.reference ? `Campagne ${campagne.reference}` : '',
    !isJourneeMode && intervention?.reference ? `Intervention ${intervention.reference}` : '',
  ].filter(Boolean).join(' · ')

  const reportReference = demande?.reference || String(demandeUid)

  const missionIntervention = intervention || (journeeInterventions.length === 1 ? journeeInterventions[0] : null)

  const fmtContactInterventions = useMemo(() => {
    if (isJourneeMode) return journeeInterventions
    if (missionIntervention) return [missionIntervention]
    return collectNavInterventions(nav).filter(isTerrainMissionIntervention)
  }, [isJourneeMode, journeeInterventions, missionIntervention, nav])

  const fmtTerrainContacts = useMemo(
    () => resolveFmtTerrainContacts({
      demande,
      affaire,
      interventions: fmtContactInterventions,
      annuaireContacts: affaireContacts,
    }),
    [demande, affaire, fmtContactInterventions, affaireContacts],
  )

  const fmtLocalisation = useMemo(
    () => resolveFmtLocalisation({
      demande,
      affaire,
      geocodeLabel: addressLabel,
    }),
    [demande, affaire, addressLabel],
  )

  const fmtTechnicienLabel = useMemo(
    () => resolveFmtTechnicienLabel({
      isJourneeMode,
      missionTechnicien,
      interventions: fmtContactInterventions,
    }),
    [isJourneeMode, missionTechnicien, fmtContactInterventions],
  )

  const { data: userDirectory = [] } = useQuery({
    queryKey: ['auth-user-directory-fmt'],
    queryFn: () => authApi.users(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const fmtTechnicienPhone = useMemo(
    () => resolveTechnicienPhoneFromDirectory(fmtTechnicienLabel, userDirectory),
    [fmtTechnicienLabel, userDirectory],
  )

  const fmtLaboLabel = useMemo(
    () => labLine(laboCode) || laboCode,
    [labLine, laboCode],
  )

  const fmtMissionHeadline = useMemo(() => {
    if (isJourneeMode) {
      return [
        missionDate ? formatDate(missionDate) : '',
        fmtTechnicienLabel || 'Sans technicien',
        `${fmtContactInterventions.length} intervention(s)`,
      ].filter(Boolean).join(' · ')
    }
    const item = enrichInterventionForFmt(missionIntervention)
    if (!item) return ''
    return [
      item.reference,
      item.date_intervention ? formatDate(item.date_intervention) : '',
      fmtTechnicienLabel,
    ].filter(Boolean).join(' · ')
  }, [
    isJourneeMode,
    missionDate,
    fmtTechnicienLabel,
    fmtContactInterventions.length,
    missionIntervention,
  ])

  const fmtProgrammeRows = useMemo(
    () => buildFmtProgrammeRows(fmtContactInterventions, buildAnnuaireContactMap(affaireContacts)),
    [fmtContactInterventions, affaireContacts],
  )

  const checklistSection = (
    <section className="rapport-section">
      <h2>3/ <span>ÉLÉMENTS À TRANSMETTRE</span></h2>
      <ul className="rapport-si-checklist">
        <li data-ok={planDoc ? 'true' : 'false'}>Plan de situation (accès / localisation)</li>
        <li data-ok={itineraryDoc ? 'true' : 'false'}>Itinéraire routier labo → chantier</li>
        <li data-ok={primaryImplantationPlan ? 'true' : 'false'}>Plan d&apos;implantation (points à réaliser)</li>
        {zoneCount ? <li data-ok="true">{zoneCount} zone(s) chantier sur le plan</li> : null}
        {annotationPins.length ? <li data-ok="true">{annotationPins.length} repère(s) commenté(s)</li> : null}
      </ul>
    </section>
  )

  const ready = !navLoading && Boolean(demandeUid)
  const journeeTouchRef = useRef(false)
  useReportAutoPrint(searchParams, ready)

  useEffect(() => {
    document.documentElement.classList.add('rapport-fmt-active')
    document.body.classList.add('rapport-fmt-active')
    return () => {
      document.documentElement.classList.remove('rapport-fmt-active')
      document.body.classList.remove('rapport-fmt-active')
    }
  }, [])

  useEffect(() => {
    if (!isJourneeMode || navLoading || !journeeInterventions.length) return undefined
    if (journeeTouchRef.current) return undefined
    journeeTouchRef.current = true
    let cancelled = false
    async function markGenerated() {
      try {
        const snapshotHash = await fetchFeuilleMissionSnapshotHash({
          demandeUid,
          missionDate,
          technicien: missionTechnicien,
        })
        if (cancelled) return
        await recordFeuilleMissionJournee({
          demandeUid,
          missionDate,
          technicien: missionTechnicien,
          action: 'generated',
          snapshotHash,
        })
      } catch {
        journeeTouchRef.current = false
      }
    }
    markGenerated()
    return () => { cancelled = true }
  }, [isJourneeMode, navLoading, journeeInterventions.length, demandeUid, missionDate, missionTechnicien])

  useEffect(() => {
    if (!isJourneeMode || !journeeInterventions.length) return undefined
    async function onAfterPrint() {
      try {
        const snapshotHash = await fetchFeuilleMissionSnapshotHash({
          demandeUid,
          missionDate,
          technicien: missionTechnicien,
        })
        await recordFeuilleMissionJournee({
          demandeUid,
          missionDate,
          technicien: missionTechnicien,
          action: 'printed',
          snapshotHash,
        })
      } catch {
        // ignore tracking errors
      }
    }
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [isJourneeMode, journeeInterventions.length, demandeUid, missionDate, missionTechnicien])

  const totalPages = 4
  const headerProps = {
    hideChrono: true,
    affaireNumber: demande?.affaire_ref || demande?.affaire_reference || affaire?.reference || '',
    editionDate: formatDate(new Date().toISOString().slice(0, 10)),
    siteTitle: demande?.chantier || demande?.site || affaire?.site || '',
    mainTitle: MISSION_TERRAIN_FICHE_TITLE,
    subtitle: isJourneeMode
      ? `${MISSION_TERRAIN_FICHE_SUBTITLE}\nJournée ${formatDate(missionDate)} · ${missionTechnicien || 'Sans technicien'}`
      : MISSION_TERRAIN_FICHE_SUBTITLE,
  }

  if (!demandeUid) {
    return <div className="p-8 text-center">Identifiant demande manquant.</div>
  }

  if (navLoading) {
    return <div className="p-8 text-center">Chargement de la fiche de mission terrain…</div>
  }

  if (navError) {
    return <div className="p-8 text-center text-red-700">{navError.message || 'Fiche indisponible.'}</div>
  }

  if (isJourneeMode && !navLoading && !journeeInterventions.length) {
    return (
      <div className="p-8 text-center">
        Aucune intervention terrain planifiée pour {formatDate(missionDate)}
        {missionTechnicien ? ` — ${missionTechnicien}` : ''}.
      </div>
    )
  }

  return (
    <RapportPageShell
      embedded={isEmbed}
      hideToolbar={hideToolbar}
      toolbar={(
        <RapportToolbar
          reportReference={reportReference}
        />
      )}
    >
      <div className="rapport-si-paper-stack">
        <div className="rapport-si-a3-sheet">
          <main className="rapport-page rapport-page-a4 rapport-si-page" id="rapport-si-printable-4">
            <div className="rapport-print-frame rapport-si-frame">
              <RapportHeader {...headerProps} />
              <div className="rapport-si-page-indicator">Page 4/{totalPages}</div>

              <div className="rapport-si-body-sheet">
              <section className="rapport-section rapport-si-section-fill">
                <h2>6/ <span>PLAN D&apos;IMPLANTATION</span></h2>
                {primaryImplantationPlan ? (
                  <div className="rapport-si-grid-2">
                    <SiField label="Référence plan" value={primaryImplantationPlan.reference} />
                    <SiField label="Titre" value={primaryImplantationPlan.titre} />
                    <SiField label="Zone / périmètre" value={primaryImplantationPlan.zone} />
                    <SiField label="Points implantés" value={implantationPointCount ? String(implantationPointCount) : '—'} />
                  </div>
                ) : null}
                <SiMapFigure
                  src={implantationImageUrl}
                  alt="Plan d'implantation"
                  missingClassName="rapport-si-missing-croqui"
                  missingText="Pas de plan d'implantation disponible — réaliser un croquis à main levée sur le chantier (points, repères et zones à implanter)."
                />
                {implantationPlans.length > 1 ? (
                  <p className="rapport-si-missing" style={{ marginTop: '1mm', border: 'none', padding: '0 2mm', textAlign: 'left' }}>
                    {`${implantationPlans.length - 1} autre(s) plan(s) d'implantation disponible(s) dans RaLab pour ce périmètre.`}
                  </p>
                ) : null}
              </section>

              <SiFmtClosureSection technicienLabel={fmtTechnicienLabel} />

              <RapportFooter documentCode="RAP-FMT" />
              </div>
            </div>
          </main>

          <main className="rapport-page rapport-page-a4 rapport-si-page" id="rapport-si-printable-1">
            <div className="rapport-print-frame rapport-si-frame">
              <RapportHeader {...headerProps} />
              <div className="rapport-si-page-indicator">Page 1/{totalPages}</div>

              <div className="rapport-si-body-sheet">
              <section className="rapport-section">
                <h2>1/ <span>IDENTITÉ &amp; MISSION</span></h2>
                <div className="rapport-si-grid-2 rapport-si-grid-identite">
                  <SiField label="Demande" value={demande?.reference} />
                  <SiField label="Client" value={demande?.client || affaire?.client} />
                  <SiField label="Laboratoire" value={fmtLaboLabel} />
                  <SiField label="Distance chantier → labo" value={distanceCaption} />
                  <SiField label="Chantier" value={headerProps.siteTitle} full />
                  <SiField label="Commune" value={fmtLocalisation.commune} />
                  <SiField label="Adresse ouvrage" value={fmtLocalisation.adresse} />
                  {fmtMissionHeadline ? (
                    <SiField
                      label={isJourneeMode ? 'Mission du jour' : 'Intervention'}
                      value={fmtMissionHeadline}
                    />
                  ) : (
                    <SiField label="Mission du jour" value="" />
                  )}
                  <SiField label="Contexte" value={contextLabel} />
                  {fmtTechnicienLabel ? (
                    <SiField label="Technicien" value={fmtTechnicienLabel} />
                  ) : null}
                  {fmtTechnicienPhone ? (
                    <SiField label="Téléphone technicien" value={fmtTechnicienPhone} />
                  ) : null}
                </div>
              </section>

              <SiProgrammeEssaisSection rows={fmtProgrammeRows} />

              <SiContactsConsignesSection contacts={fmtTerrainContacts} />
              </div>
            </div>
          </main>
        </div>

        <div className="rapport-si-a3-sheet">
          <main className="rapport-page rapport-page-a4 rapport-si-page" id="rapport-si-printable-2">
            <div className="rapport-print-frame rapport-si-frame">
              <RapportHeader {...headerProps} />
              <div className="rapport-si-page-indicator">Page 2/{totalPages}</div>

              <div className="rapport-si-body-sheet">
              {checklistSection}

              <section className="rapport-section rapport-si-section-fill">
                <h2>4/ <span>PLAN DE SITUATION</span></h2>
                <SiMapFigure
                  src={planImageUrl}
                  alt="Plan de situation"
                  missingText="Plan de situation non disponible — capturez-le depuis la demande (quadro C) ou la passation."
                />
                {annotationPins.length ? (
                  <ul className="rapport-si-pins">
                    {annotationPins.map((pin, index) => (
                      <li key={pin.id || `pin-${index}`}>
                        <strong>{`Repère ${index + 1}`}</strong>
                        {' — '}
                        {pin.comment || 'Sans commentaire'}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              </div>
            </div>
          </main>

          <main className="rapport-page rapport-page-a4 rapport-si-page" id="rapport-si-printable-3">
            <div className="rapport-print-frame rapport-si-frame">
              <RapportHeader {...headerProps} />
              <div className="rapport-si-page-indicator">Page 3/{totalPages}</div>

              <div className="rapport-si-body-sheet">
              <section className="rapport-section rapport-si-section-fill">
                <h2>5/ <span>ITINÉRAIRE ROUTIER</span></h2>
                <div className="rapport-si-grid-2">
                  <SiField label="Départ laboratoire" value={labAddress} full />
                  <SiField label="Arrivée chantier" value={addressLabel} full />
                  {drivingDistance ? <SiField label="Distance routière" value={drivingDistance} /> : null}
                  {drivingDuration ? <SiField label="Durée estimée" value={drivingDuration} /> : null}
                </div>
                <SiMapFigure
                  src={itineraryImageUrl}
                  alt="Itinéraire routier"
                  landscape
                  missingText="Itinéraire non disponible — générez-le avec la capture plan + itinéraire sur la demande."
                />
                <p className="rapport-si-missing" style={{ marginTop: '1mm', border: 'none', padding: '0 2mm', textAlign: 'left' }}>
                  Carré bleu = laboratoire · ligne violette = route · pin rouge = chantier
                </p>
              </section>
              </div>
            </div>
          </main>
        </div>
      </div>
    </RapportPageShell>
  )
}
