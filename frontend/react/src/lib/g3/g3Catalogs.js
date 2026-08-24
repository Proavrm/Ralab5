/** Catalogues configurables du module G3 — aucune donnée chantier hardcodée. */

export const G3_MISSION_STATUS_OPTIONS = [
  'À préparer',
  'En attente documents',
  'Programme à valider',
  'Reconnaissances planifiées',
  'Reconnaissances en cours',
  'Analyse en cours',
  'Avis en cours',
  'Rapport en cours',
  'Terminé',
  'Archivé',
]

export const G3_MISSION_TYPE_OPTIONS = [
  'Terrassements',
  'Voiries',
  'Plateformes',
  'Fondations',
  'Remblais techniques',
  'Bassins / hydraulique',
  'Talus',
  'Soutènements',
  'Réemploi matériaux',
  'Expertise / désordre',
  'Contrôle chantier',
  'Autre',
]

export const G3_INTERVENTION_TYPE_OPTIONS = [
  'Visite initiale chantier',
  'Sondage à la pelle',
  'Carottage chaussée',
  'Reconnaissance structure existante',
  'Prélèvement matériau',
  'Essai EV2',
  'Essai PANDA',
  'Essai pénétrométrique',
  'Contrôle compactage',
  'Réception fond de fouille',
  'Contrôle plateforme',
  'Contrôle remblai technique',
  'Visite point d\'arrêt',
  'Avis géotechnique',
  'Réunion chantier',
  'Analyse documentaire',
  'Autre',
]

export const G3_PROGRAMME_STATUS_OPTIONS = [
  'À prévoir',
  'À planifier',
  'Planifié',
  'En cours',
  'Réalisé',
  'Annulé',
  'Reporté',
  'À compléter',
]

export const G3_INTERVENTION_REALIZED_STATUS_OPTIONS = [
  'Brouillon',
  'À compléter',
  'Validé',
  'Transmis',
  'Archivé',
]

export const G3_WEATHER_OPTIONS = ['Beau', 'Nuageux', 'Pluie', 'Vent', 'Gel', 'Autre']

export const G3_HYDRIC_CONDITION_OPTIONS = ['Sec', 'Humide', 'Saturation', 'En eau', 'Non applicable']

export const G3_TEST_TYPE_OPTIONS = [
  'EV2',
  'PANDA',
  'Pénétromètre dynamique',
  'Carottage',
  'Sondage pelle',
  'Teneur en eau',
  'VBS',
  'Granulométrie',
  'IPI',
  'Proctor',
  'Compactage',
  'Densité',
  'Portance',
  'Analyse environnementale',
  'Autre',
]

export const G3_TEST_STATUS_OPTIONS = [
  'En attente',
  'En cours',
  'Reçu labo',
  'Analysé',
  'Validé',
  'Annulé',
]

export const G3_CONFORMITY_OPTIONS = [
  'Conforme',
  'Non conforme',
  'En attente',
  'Non applicable',
]

export const G3_NOTICE_TYPE_OPTIONS = [
  'Avis terrassement',
  'Avis plateforme',
  'Avis fondation',
  'Avis remblai technique',
  'Avis voirie',
  'Avis bassin',
  'Avis talus',
  'Avis réemploi matériaux',
  'Avis adaptation',
  'Avis non-conformité',
  'Avis point d\'arrêt',
  'Avis final',
]

export const G3_NOTICE_STATUS_OPTIONS = ['Brouillon', 'À relire', 'Validé', 'Transmis', 'Annulé']

export const G3_HOLD_POINT_STATUS_OPTIONS = [
  'À venir',
  'Ouvert',
  'En attente essais',
  'En attente avis',
  'Validé',
  'Validé avec réserves',
  'Refusé',
  'Clos',
]

export const G3_DELIVERABLE_TYPE_OPTIONS = [
  'G3001 Note de cadrage G3',
  'G3002 Programme des reconnaissances',
  'G3003 Compte rendu de visite',
  'G3004 Avis G3',
  'G3005 Synthèse essais',
  'G3006 Fiche réception fond de fouille',
  'G3007 Synthèse réemploi matériaux',
  'G3008 Rapport final G3',
]

export const G3_DELIVERABLE_STATUS_OPTIONS = [
  'À produire',
  'Brouillon',
  'Validé',
  'Transmis',
  'Archivé',
]

export const G3_MISSION_TABS = [
  { id: 'general', label: 'Général' },
  { id: 'documents', label: 'Documents' },
  { id: 'objectives', label: 'Objectifs G3' },
  { id: 'zones', label: 'Ouvrages / zones' },
  { id: 'programme', label: 'Programme des reconnaissances' },
  { id: 'interventions', label: 'Interventions' },
  { id: 'tests', label: 'Essais / contrôles' },
  { id: 'notices', label: 'Avis G3' },
  { id: 'holdpoints', label: 'Points d\'arrêt' },
  { id: 'photos', label: 'Photos' },
  { id: 'planning', label: 'Planning' },
  { id: 'deliverables', label: 'Livrables / rapport' },
  { id: 'history', label: 'Historique' },
]

export const G3_DOCUMENT_TYPE_OPTIONS = [
  'G1 ES+PGC', 'G2 AVP', 'G2 PRO', 'G4', 'INFOS-DIAG', 'CCTP', 'DPGF',
  'Plans EXE', 'Plans PRO', 'Plans VRD', 'Plans terrassement', 'Plans fondations',
  'Plans réseaux', 'Coupes / profils', 'Cubatures', 'Planning travaux',
  'DICT / réseaux', 'Note technique AO', 'Compte rendu chantier', 'Photos',
  'Plan de situation', "Plan d'implantation", 'Itinéraire', 'Autre',
]

export const G3_ZONE_TYPE_OPTIONS = [
  'Voirie PL', 'Voirie VL', 'Parking', 'Plateforme', 'Terrassement général',
  'Bassin EP', 'Remblais techniques', 'Fondations', 'Bâtiment', 'Talus', 'Soutènement',
  'Zone de réemploi', 'Stock matériaux', 'Zone sensible', 'Zone existante', 'Zone extension', 'Autre',
]

export const G3_ZONE_RISK_OPTIONS = ['Faible', 'Moyen', 'Fort', 'Critique']

export const G3_OBJECTIVE_PRIORITY_OPTIONS = ['Faible', 'Moyenne', 'Forte', 'Critique']

export const G3_OBJECTIVE_STATUS_OPTIONS = [
  'À faire', 'En cours', 'En attente', 'Réalisé', 'Non retenu',
]

export const G3_STATUS_CLS = {
  'À préparer': 'bg-[#f1efe8] text-[#5f5e5a]',
  'En attente documents': 'bg-[#faeeda] text-[#854f0b]',
  'Programme à valider': 'bg-[#e6f1fb] text-[#185fa5]',
  'Reconnaissances planifiées': 'bg-[#e6f1fb] text-[#185fa5]',
  'Reconnaissances en cours': 'bg-[#eaf3de] text-[#3b6d11]',
  'Analyse en cours': 'bg-[#eeedfe] text-[#534ab7]',
  'Avis en cours': 'bg-[#eeedfe] text-[#534ab7]',
  'Rapport en cours': 'bg-[#faeeda] text-[#854f0b]',
  'Terminé': 'bg-[#e0f5ef] text-[#0f6e56]',
  'Archivé': 'bg-[#f1efe8] text-[#5f5e5a]',
}

export function mergeG3Catalogs(remote = {}) {
  return {
    mission_status: remote.mission_status || G3_MISSION_STATUS_OPTIONS,
    mission_types: remote.mission_types || G3_MISSION_TYPE_OPTIONS,
    intervention_types: remote.intervention_types || G3_INTERVENTION_TYPE_OPTIONS,
    programme_statuses: remote.programme_statuses || G3_PROGRAMME_STATUS_OPTIONS,
    intervention_realized_statuses: remote.intervention_realized_statuses || G3_INTERVENTION_REALIZED_STATUS_OPTIONS,
    weather_options: remote.weather_options || G3_WEATHER_OPTIONS,
    hydric_condition_options: remote.hydric_condition_options || G3_HYDRIC_CONDITION_OPTIONS,
    test_types: remote.test_types || G3_TEST_TYPE_OPTIONS,
    test_statuses: remote.test_statuses || G3_TEST_STATUS_OPTIONS,
    conformity_options: remote.conformity_options || G3_CONFORMITY_OPTIONS,
    notice_types: remote.notice_types || G3_NOTICE_TYPE_OPTIONS,
    notice_statuses: remote.notice_statuses || G3_NOTICE_STATUS_OPTIONS,
    hold_point_statuses: remote.hold_point_statuses || G3_HOLD_POINT_STATUS_OPTIONS,
    hold_point_templates: remote.hold_point_templates || [],
    notice_formulation_templates: remote.notice_formulation_templates || {},
    deliverable_types: remote.deliverable_types || G3_DELIVERABLE_TYPE_OPTIONS,
    deliverable_statuses: remote.deliverable_statuses || G3_DELIVERABLE_STATUS_OPTIONS,
    intervention_payload_fields: remote.intervention_payload_fields || {},
    programme_default_template: remote.programme_default_template || [],
    ...remote,
  }
}
