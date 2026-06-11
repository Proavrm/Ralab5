/** Champs structurés campagne / comparaison — génériques, pas liés à un chantier. */

export const ZONE_TYPE_OPTIONS = [
  { value: '', label: '— Non précisé' },
  { value: 'Diagnostic', label: 'Diagnostic' },
  { value: 'Témoin', label: 'Témoin' },
  { value: 'RARx', label: 'RARx / innovant' },
  { value: 'Suivi', label: 'Suivi comparatif' },
  { value: 'Transition', label: 'Zone de transition' },
  { value: 'Autre', label: 'Autre' },
]

export const CAMPAGNE_STRUCTURED_FIELD_KEYS = [
  'zone_type',
  'comparison_group',
  'pk_debut',
  'pk_fin',
  'voie',
  'sens',
  'cote',
  'planche',
  'longueur_ml',
  'zone_transition',
  'responsable_innovation',
  'responsable_travaux',
  'responsable_controle',
  'responsable_suivi',
]

export const EMPTY_CAMPAGNE_STRUCTURED_FIELDS = Object.fromEntries(
  CAMPAGNE_STRUCTURED_FIELD_KEYS.map((key) => [key, '']),
)

export function pickCampagneStructuredFields(source = {}) {
  return Object.fromEntries(
    CAMPAGNE_STRUCTURED_FIELD_KEYS.map((key) => [key, String(source?.[key] ?? '').trim()]),
  )
}

export function appendCampaignInterventionQueryParams(params, campaign = {}) {
  if (!params || !campaign) return params
  const structured = pickCampagneStructuredFields(campaign)
  Object.entries(structured).forEach(([key, value]) => {
    if (value) params.set(`campaign_${key}`, value)
  })
  return params
}

export function buildZoneSummary(campaign = {}) {
  return [
    campaign.pk_debut && campaign.pk_fin ? `PK ${campaign.pk_debut} → ${campaign.pk_fin}` : campaign.pk_debut || campaign.pk_fin,
    campaign.voie,
    campaign.sens,
    campaign.cote,
    campaign.planche,
    campaign.longueur_ml ? `${campaign.longueur_ml} ml` : '',
  ].filter(Boolean).join(' · ')
}

export function buildInterventionPrefillFromCampaignQuery(searchParams) {
  const get = (key) => String(searchParams.get(key) || '').trim()
  const zoneScope = get('campaign_zone') || get('zone')
  const programme = get('campaign_programme')
  const designation = get('campaign_designation')
  const essais = get('campaign_essais')
  const nbPoints = get('campaign_nb_points')
  const responsable = get('campaign_responsable') || get('responsable')
  const attribue = get('campaign_attribue_a') || get('attribue_a')
  const zoneSummary = buildZoneSummary({
    pk_debut: get('campaign_pk_debut'),
    pk_fin: get('campaign_pk_fin'),
    voie: get('campaign_voie'),
    sens: get('campaign_sens'),
    cote: get('campaign_cote'),
    planche: get('campaign_planche'),
    longueur_ml: get('campaign_longueur_ml'),
  })
  const zoneParts = [zoneScope, zoneSummary].filter(Boolean)
  const objectifParts = [designation, programme].filter(Boolean)

  return {
    zone_intervention: zoneParts.join(' · '),
    objectif_intervention: objectifParts.join(' — '),
    prep_essais_a_effectuer: essais,
    prep_points_a_realiser: nbPoints,
    responsable_referent: responsable,
    attribue_a: attribue,
    campaign_zone_type: get('campaign_zone_type'),
    campaign_comparison_group: get('campaign_comparison_group'),
    campaign_pk_debut: get('campaign_pk_debut'),
    campaign_pk_fin: get('campaign_pk_fin'),
    campaign_voie: get('campaign_voie'),
    campaign_sens: get('campaign_sens'),
    campaign_cote: get('campaign_cote'),
    campaign_planche: get('campaign_planche'),
    campaign_longueur_ml: get('campaign_longueur_ml'),
    campaign_zone_transition: get('campaign_zone_transition'),
  }
}
