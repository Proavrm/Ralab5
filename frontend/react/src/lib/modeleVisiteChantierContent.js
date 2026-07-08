export const VISITE_CHANTIER_CODE = 'VC'
export const VISITE_CHANTIER_LABEL = 'Feuille de visite chantier'

function pick(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

export function createDefaultVisiteChantierPayload() {
  return {
    version: 1,
    contexte: {
      objet_visite: '',
      zone: '',
      participants_rst: '',
      participants_moe: '',
      participants_entreprise: '',
    },
    deroulement: {
      meteo: '',
      etat_site: '',
      points_visites: '',
      travaux_en_cours: '',
    },
    constats: {
      observations: '',
      anomalies: '',
      non_conformites: '',
      adaptations: '',
    },
    sortie: {
      synthese: '',
      alerte: '',
      alerte_desc: '',
      info_demandeur: '',
      suites: '',
    },
  }
}

export function buildVisiteChantierInitialPayload({
  intervention = {},
  demande = {},
  campaign = {},
  feuille = {},
} = {}) {
  const base = createDefaultVisiteChantierPayload()

  return {
    ...base,
    contexte: {
      ...base.contexte,
      objet_visite: pick(
        intervention.objectif_intervention,
        intervention.sujet,
        intervention.finalite_intervention,
        feuille.label,
      ),
      zone: pick(
        intervention.zone_intervention,
        intervention.zone,
        campaign.zone_scope,
        campaign.label,
        demande.chantier,
        demande.site,
      ),
      participants_rst: pick(intervention.technicien, intervention.geotechnicien, feuille.operateur),
    },
    deroulement: {
      ...base.deroulement,
      meteo: pick(intervention.cond_meteo),
      etat_site: pick(intervention.cond_etat_site),
      points_visites: pick(intervention.real_nb_points_realises, intervention.zone_intervention),
    },
    constats: {
      ...base.constats,
      anomalies: pick(intervention.real_incidents),
      non_conformites: pick(intervention.real_non_conformites),
      adaptations: pick(intervention.real_adaptations),
      observations: pick(intervention.notes_terrain, feuille.observations),
    },
    sortie: {
      ...base.sortie,
      synthese: pick(intervention.sortie_synthese),
      alerte: pick(intervention.sortie_alerte),
      alerte_desc: pick(intervention.sortie_alerte_desc),
      info_demandeur: pick(intervention.sortie_info_demandeur),
    },
  }
}

export function mergeVisiteChantierPayload(storedPayload, defaults) {
  const base = createDefaultVisiteChantierPayload()
  const source = storedPayload && typeof storedPayload === 'object' ? storedPayload : {}

  return {
    version: source.version || base.version,
    contexte: { ...base.contexte, ...(defaults?.contexte || {}), ...(source.contexte || {}) },
    deroulement: { ...base.deroulement, ...(defaults?.deroulement || {}), ...(source.deroulement || {}) },
    constats: { ...base.constats, ...(defaults?.constats || {}), ...(source.constats || {}) },
    sortie: { ...base.sortie, ...(defaults?.sortie || {}), ...(source.sortie || {}) },
  }
}

export function buildVisiteChantierDocument({
  feuille = {},
  intervention = {},
  demande = {},
  campaign = {},
  payload = null,
} = {}) {
  const mergedPayload = mergeVisiteChantierPayload(
    payload ?? feuille.payload ?? feuille.resultats,
    buildVisiteChantierInitialPayload({ intervention, demande, campaign, feuille }),
  )

  return {
    meta: {
      reference: pick(feuille.reference, 'Modèle VC'),
      demande: pick(demande.reference, feuille.demande_reference),
      campagne: pick(campaign.reference, campaign.code, campaign.label, feuille.campagne_reference),
      intervention: pick(intervention.reference, feuille.intervention_reference),
      date: pick(feuille.date_feuille, intervention.date_intervention),
      technicien: pick(feuille.operateur, intervention.technicien),
      chantier: pick(demande.chantier, demande.site),
      statut: pick(feuille.statut, intervention.statut, 'Planifiée'),
    },
    payload: mergedPayload,
    sections: [
      {
        key: 'contexte',
        title: 'Contexte de la visite',
        fields: [
          { key: 'objet_visite', label: 'Objet de la visite', full: true },
          { key: 'zone', label: 'Zone / localisation', full: true },
          { key: 'participants_rst', label: 'Participants RST / labo' },
          { key: 'participants_moe', label: 'Participants MOE / MOA' },
          { key: 'participants_entreprise', label: 'Participants entreprise', full: true },
        ],
      },
      {
        key: 'deroulement',
        title: 'Déroulement',
        fields: [
          { key: 'meteo', label: 'Météo' },
          { key: 'etat_site', label: 'État du site' },
          { key: 'travaux_en_cours', label: 'Travaux en cours', full: true },
          { key: 'points_visites', label: 'Points / zones visités', full: true },
        ],
      },
      {
        key: 'constats',
        title: 'Constats terrain',
        fields: [
          { key: 'observations', label: 'Observations générales', full: true },
          { key: 'anomalies', label: 'Incidents / anomalies', full: true },
          { key: 'non_conformites', label: 'Non-conformités', full: true },
          { key: 'adaptations', label: 'Adaptations sur site', full: true },
        ],
      },
      {
        key: 'sortie',
        title: 'Sortie & suites',
        fields: [
          { key: 'synthese', label: 'Synthèse de la visite', full: true },
          { key: 'alerte', label: 'Alerte émise' },
          { key: 'alerte_desc', label: 'Description alerte', full: true },
          { key: 'info_demandeur', label: 'Information demandeur' },
          { key: 'suites', label: 'Suites à donner', full: true },
        ],
      },
    ],
  }
}

export function buildModeleVisiteChantierPath({ feuilleUid = '', returnTo = '' } = {}) {
  const params = new URLSearchParams()
  if (feuilleUid) params.set('feuille_uid', String(feuilleUid))
  if (returnTo) params.set('return_to', returnTo)
  const qs = params.toString()
  return qs ? `/modeles/visite-chantier?${qs}` : '/modeles/visite-chantier'
}

export function buildVisiteChantierRapportPath({ feuilleUid = '', returnTo = '' } = {}) {
  if (feuilleUid) {
    const params = new URLSearchParams()
    if (returnTo) params.set('return_to', returnTo)
    const qs = params.toString()
    return qs
      ? `/rapports/vc/${encodeURIComponent(String(feuilleUid))}?${qs}`
      : `/rapports/vc/${encodeURIComponent(String(feuilleUid))}`
  }
  const params = new URLSearchParams()
  if (returnTo) params.set('return_to', returnTo)
  const qs = params.toString()
  return qs ? `/rapports/vc/view?${qs}` : '/rapports/vc/view'
}

export function buildVisiteChantierRapportSections(document) {
  const payload = document?.payload || createDefaultVisiteChantierPayload()
  const meta = document?.meta || {}

  return [
    {
      title: '1/ Renseignements généraux',
      rows: [
        { label: 'Référence feuille', value: meta.reference },
        { label: 'Demande', value: meta.demande },
        { label: 'Campagne', value: meta.campagne },
        { label: 'Intervention', value: meta.intervention },
        { label: 'Chantier / site', value: meta.chantier },
        { label: 'Date de visite', value: meta.date },
        { label: 'Technicien / rédacteur', value: meta.technicien },
      ],
    },
    {
      title: '2/ Contexte de la visite',
      rows: [
        { label: 'Objet de la visite', value: payload.contexte?.objet_visite, full: true },
        { label: 'Zone / localisation', value: payload.contexte?.zone, full: true },
        { label: 'Participants RST / labo', value: payload.contexte?.participants_rst },
        { label: 'Participants MOE / MOA', value: payload.contexte?.participants_moe },
        { label: 'Participants entreprise', value: payload.contexte?.participants_entreprise, full: true },
      ],
    },
    {
      title: '3/ Déroulement',
      rows: [
        { label: 'Météo', value: payload.deroulement?.meteo },
        { label: 'État du site', value: payload.deroulement?.etat_site },
        { label: 'Travaux en cours', value: payload.deroulement?.travaux_en_cours, full: true },
        { label: 'Points / zones visités', value: payload.deroulement?.points_visites, full: true },
      ],
    },
    {
      title: '4/ Constats terrain',
      rows: [
        { label: 'Observations générales', value: payload.constats?.observations, full: true },
        { label: 'Incidents / anomalies', value: payload.constats?.anomalies, full: true },
        { label: 'Non-conformités', value: payload.constats?.non_conformites, full: true },
        { label: 'Adaptations sur site', value: payload.constats?.adaptations, full: true },
      ],
    },
    {
      title: '5/ Synthèse et suites',
      rows: [
        { label: 'Synthèse de la visite', value: payload.sortie?.synthese, full: true },
        { label: 'Alerte émise', value: payload.sortie?.alerte },
        { label: 'Description alerte', value: payload.sortie?.alerte_desc, full: true },
        { label: 'Information demandeur', value: payload.sortie?.info_demandeur },
        { label: 'Suites à donner', value: payload.sortie?.suites, full: true },
      ],
    },
  ]
}
