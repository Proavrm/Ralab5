/** Catálogo — Fiche de calcul Allyze / Talren (UI only, v1 préparation page). */

export const CALC_TOOLS = {
  allyze: { id: 'allyze', label: 'Allyze', subtitle: 'Dimensionnement des chaussées' },
  talren: { id: 'talren', label: 'Talren', subtitle: 'Stabilité de taludes et soutènements' },
}

export const STUDY_TYPES = [
  {
    id: 'chaussee',
    label: 'Chaussée — dimensionnement',
    tool: 'allyze',
    description: 'Structure neuve, renforcement ou variante — paramètres Allyze.',
    sectionIds: [
      'allyze_cas',
      'allyze_trafic',
      'allyze_geometrie',
      'allyze_plateforme',
      'allyze_sols',
      'allyze_couches_existantes',
      'allyze_materiaux',
      'allyze_criteres',
      'resultats',
    ],
  },
  {
    id: 'talude',
    label: 'Talude / excavation / aterro',
    tool: 'talren',
    description: 'Stabilité globale — paramètres Talren.',
    sectionIds: [
      'talren_geometrie',
      'talren_stratigraphie',
      'talren_eau',
      'talren_surcharges',
      'talren_reforcos',
      'talren_drainage',
      'talren_fondation',
      'talren_hypotheses',
      'talren_criteres',
      'resultats',
    ],
  },
  {
    id: 'mur_soutenement',
    label: 'Mur de soutènement',
    tool: 'talren',
    description: 'Talren — géométrie mur + stratigraphie + vérifications.',
    sectionIds: [
      'talren_geometrie',
      'talren_mur',
      'talren_stratigraphie',
      'talren_eau',
      'talren_surcharges',
      'talren_reforcos',
      'talren_drainage',
      'talren_fondation',
      'talren_hypotheses',
      'talren_criteres',
      'resultats',
    ],
  },
  {
    id: 'plateforme_industrielle',
    label: 'Plateforme industrielle',
    tool: 'allyze',
    description: 'Allyze + charges spéciales (engins, stockages).',
    sectionIds: [
      'allyze_plateforme',
      'allyze_sols',
      'allyze_materiaux',
      'allyze_criteres',
      'resultats',
    ],
  },
  {
    id: 'appuis_grue',
    label: 'Appuis de grue / charges concentrées',
    tool: 'allyze',
    description: 'Plateforme + charges concentrées.',
    sectionIds: [
      'allyze_plateforme',
      'allyze_sols',
      'allyze_criteres',
      'resultats',
    ],
  },
]

const ALLYZE_GEOMETRIE_OPTIONS = [
  'Rotonde',
  'Carrefour',
  'Zone de freinage',
  "Zone d'accélération",
  'Courbes serrées',
  'Zone de manœuvres',
  'Rampes',
]

const ALLYZE_MATERIAUX_OPTIONS = [
  'GB',
  'Grave émulsion',
  'BB',
  'BBSG',
  'BBME',
  'EME',
  'GNT',
  'Graves recyclées',
  'Béton',
]

const TALREN_CRITERES_OPTIONS = [
  'Glissement',
  'Renversement',
  'Poinçonnement',
  'Capacité portante',
  'Stabilité globale',
  'Rupture circulaire',
  'Rupture polygonale',
]

const TALREN_HYPOTHESES_OPTIONS = [
  'Eurocode 7',
  'Fascicule 62',
  'NF P94',
  'Situation permanente',
  'Situation temporaire',
  'Situation sismique',
]

function field(id, label, type = 'text', extra = {}) {
  return { id, label, type, ...extra }
}

function selectField(id, label, options, extra = {}) {
  return field(id, label, 'select', { options, placeholder: '—', ...extra })
}

function multiField(id, label, options, extra = {}) {
  return field(id, label, 'multiselect', { options, ...extra })
}

export const CALCULATION_SECTIONS = [
  {
    id: 'allyze_cas',
    title: 'Cas de dimensionnement',
    tool: 'allyze',
    fields: [
      selectField('allyze_cas', 'Cas', ['Structure neuve', 'Renforcement', 'Variante']),
    ],
  },
  {
    id: 'allyze_trafic',
    title: 'Trafic',
    tool: 'allyze',
    columns: 2,
    fields: [
      field('allyze_classe_trafic', 'Classe de trafic (TC)'),
      field('allyze_pl_jour', 'N° PL/jour', 'number'),
      field('allyze_tmja', 'TMJA', 'number'),
      field('allyze_croissance', 'Croissance annuelle (%)', 'number'),
      field('allyze_vie_utile', 'Vie utile (ans)', 'number'),
      field('allyze_canal_circulation', 'Canal de circulation'),
      field('allyze_pct_pl', 'Pourcentage de PL (%)', 'number'),
    ],
  },
  {
    id: 'allyze_geometrie',
    title: 'Géométrie',
    tool: 'allyze',
    columns: 2,
    fields: [
      field('allyze_largeur_via', 'Largeur de la voie (m)', 'number'),
      field('allyze_nb_voies', 'N° de voies', 'number'),
      selectField('allyze_sens', 'Sens', ['Unique', 'Double']),
      multiField('allyze_geometrie_particularites', 'Particularités', ALLYZE_GEOMETRIE_OPTIONS, { full: true }),
    ],
  },
  {
    id: 'allyze_plateforme',
    title: 'Plateforme',
    tool: 'allyze',
    columns: 2,
    fields: [
      field('allyze_classe_pf', 'Classe PF recherchée'),
      field('allyze_ev2', 'EV2 (MPa)', 'number'),
      field('allyze_ev2_ev1', 'EV2/EV1', 'number'),
      field('allyze_portance_mesuree', 'Portance mesurée'),
      field('allyze_pf_existante', 'Type plateforme existante'),
      selectField('allyze_pf_neuve_existante', 'Plateforme', ['Neuve', 'Existante', 'Mixte']),
      field('allyze_charges_contraintes', 'Charges / contraintes particulières', 'textarea', { full: true, rows: 4 }),
    ],
  },
  {
    id: 'allyze_sols',
    title: 'Solos',
    tool: 'allyze',
    columns: 2,
    fields: [
      field('allyze_classe_gtr', 'Classe GTR'),
      field('allyze_nature_sol', 'Nature'),
      field('allyze_cbr', 'CBR (%)', 'number'),
      field('allyze_ev2_sol', 'EV2 sol (MPa)', 'number'),
      field('allyze_module_sol', 'Module (MPa)', 'number'),
      selectField('allyze_sensibilite_eau', 'Sensibilité à l\'eau', ['Faible', 'Moyenne', 'Forte']),
      selectField('allyze_gelivite', 'Gélivité', ['Non gélif', 'Gélif', 'Très gélif']),
    ],
  },
  {
    id: 'allyze_couches_existantes',
    title: 'Couches existantes (renforcement)',
    tool: 'allyze',
    columns: 2,
    fields: [
      field('allyze_ep_bb', 'Épaisseur BB (cm)', 'number'),
      field('allyze_ep_gb', 'Épaisseur GB (cm)', 'number'),
      field('allyze_ep_gnt', 'Épaisseur GNT (cm)', 'number'),
      field('allyze_etat_couches', 'État général', 'textarea', { full: true, rows: 2 }),
      field('allyze_carottages', 'Carottages', 'textarea', { full: true, rows: 2 }),
      field('allyze_deflexions', 'Déflexions', 'textarea', { full: true, rows: 2 }),
      field('allyze_fissuration', 'Fissuration', 'textarea', { full: true, rows: 2 }),
    ],
  },
  {
    id: 'allyze_materiaux',
    title: 'Matériaux disponibles',
    tool: 'allyze',
    fields: [
      multiField('allyze_materiaux', 'Matériaux envisagés', ALLYZE_MATERIAUX_OPTIONS, { full: true }),
      field('allyze_materiaux_notes', 'Notes matériaux', 'textarea', { full: true, rows: 3 }),
    ],
  },
  {
    id: 'allyze_criteres',
    title: 'Critères — Allyze',
    tool: 'allyze',
    columns: 2,
    fields: [
      field('allyze_categorie_plateforme', 'Catégorie de plateforme'),
      field('allyze_classe_fiabilite', 'Classe de fiabilité'),
      field('allyze_norme', 'Norme utilisée'),
      field('allyze_marges', 'Marges de sécurité', 'textarea', { full: true, rows: 2 }),
    ],
  },
  {
    id: 'talren_geometrie',
    title: 'Géométrie — Talren',
    tool: 'talren',
    columns: 2,
    fields: [
      field('talren_terrain_natural', 'Terrain naturel', 'textarea', { full: true, rows: 2 }),
      field('talren_profil_topo', 'Profil topographique', 'textarea', { rows: 2 }),
      field('talren_coordonnees', 'Coordonnées / repères'),
      field('talren_hauteurs', 'Hauteurs (m)', 'number'),
      field('talren_inclinaisons', 'Inclinaisons (°)', 'number'),
      field('talren_excav_prof', 'Excavation — profondeur (m)', 'number'),
      field('talren_excav_incl', 'Excavation — inclinaison (°)', 'number'),
      field('talren_excav_banquettes', 'Banquettes'),
      field('talren_excav_longueur', 'Longueur (m)', 'number'),
    ],
  },
  {
    id: 'talren_mur',
    title: 'Géométrie du mur',
    tool: 'talren',
    columns: 2,
    fields: [
      field('talren_mur_hauteur', 'Hauteur mur (m)', 'number'),
      field('talren_mur_epaisseur', 'Épaisseur (m)', 'number'),
      field('talren_mur_fondation', 'Fondation'),
      field('talren_mur_encastrement', 'Encastrement (m)', 'number'),
      field('talren_mur_inclinaison', 'Inclinaison (°)', 'number'),
    ],
  },
  {
    id: 'talren_stratigraphie',
    title: 'Stratigraphie',
    tool: 'talren',
    repeatable: {
      id: 'talren_couches',
      label: 'Couche',
      addLabel: 'Ajouter une couche',
      fields: [
        field('nom', 'Nom'),
        field('epaisseur', 'Épaisseur (m)', 'number'),
        field('gamma_sec', 'γ sec (kN/m³)', 'number'),
        field('gamma_sat', 'γ sat (kN/m³)', 'number'),
        field('c_prime', "c' (kPa)", 'number'),
        field('phi_prime', "φ' (°)", 'number'),
        field('cu', 'Cu (kPa)', 'number'),
        field('e_module', 'E (MPa)', 'number'),
        field('nu', 'ν', 'number'),
        field('k', 'k (m/s)', 'number'),
        field('ocr', 'OCR', 'number'),
      ],
    },
  },
  {
    id: 'talren_eau',
    title: 'Eau',
    tool: 'talren',
    columns: 2,
    fields: [
      field('talren_nappe', 'Niveau nappe (m)', 'number'),
      field('talren_pressions', 'Pressions interstitielles', 'textarea', { rows: 2 }),
      field('talren_eau_permanente', 'Eau permanente', 'textarea', { rows: 2 }),
      field('talren_eau_temporaire', 'Eau temporaire', 'textarea', { rows: 2 }),
      field('talren_drainages_eau', 'Drainages / sources / infiltrations', 'textarea', { full: true, rows: 3 }),
    ],
  },
  {
    id: 'talren_surcharges',
    title: 'Surcharges',
    tool: 'talren',
    columns: 2,
    fields: [
      field('talren_surcharge_uniforme', 'Uniforme (kPa)', 'number'),
      field('talren_surcharge_camions', 'Camions'),
      field('talren_surcharge_batiments', 'Bâtiments'),
      field('talren_surcharge_stockages', 'Stockages'),
      field('talren_surcharge_grues', 'Grues'),
      field('talren_surcharge_trafic', 'Trafic'),
      field('talren_surcharge_gba', 'GBA'),
      field('talren_surcharge_equipements', 'Équipements'),
      field('talren_surcharge_ferroviaire', 'Lignes ferroviaires'),
      field('talren_surcharge_distance', 'Distance à la crête (m)', 'number'),
      field('talren_surcharge_largeur', 'Largeur surcharge (m)', 'number'),
      field('talren_surcharge_intensite', 'Intensité', 'textarea', { full: true, rows: 2 }),
    ],
  },
  {
    id: 'talren_reforcos',
    title: 'Renforts',
    tool: 'talren',
    columns: 2,
    fields: [
      field('talren_grampos_long', 'Grampos — longueur (m)', 'number'),
      field('talren_grampos_incl', 'Grampos — inclinaison (°)', 'number'),
      field('talren_grampos_esp', 'Grampos — espacement (m)', 'number'),
      field('talren_grampos_cap', 'Grampos — capacité (kN)', 'number'),
      field('talren_tirants_libre', 'Tirants — longueur libre (m)', 'number'),
      field('talren_tirants_sele', 'Tirants — longueur scellée (m)', 'number'),
      field('talren_tirants_pre', 'Tirants — précontrainte (kN)', 'number'),
      field('talren_geogr_res', 'Geogr. — résistance (kN/m)', 'number'),
      field('talren_geogr_long', 'Geogr. — longueur (m)', 'number'),
      field('talren_geogr_esp', 'Geogr. — espacement (m)', 'number'),
    ],
  },
  {
    id: 'talren_drainage',
    title: 'Drainage',
    tool: 'talren',
    columns: 2,
    fields: [
      field('talren_geodrain', 'Géodrain'),
      field('talren_drain_long', 'Drain longitudinal'),
      field('talren_drain_trans', 'Drain transversal'),
      field('talren_masque_drainant', 'Masque drainant'),
      field('talren_couche_drainante', 'Couche drainante'),
    ],
  },
  {
    id: 'talren_fondation',
    title: 'Fondation',
    tool: 'talren',
    columns: 2,
    fields: [
      field('talren_fond_type', 'Type de fondation'),
      field('talren_fond_cote', 'Cote'),
      field('talren_fond_sol', 'Sol d\'appui'),
      field('talren_fond_pression', 'Pression admissible (kPa)', 'number'),
      field('talren_fond_melhoramentos', 'Améliorations / renforcements', 'textarea', { full: true, rows: 3 }),
    ],
  },
  {
    id: 'talren_hypotheses',
    title: 'Hypothèses de calcul',
    tool: 'talren',
    fields: [
      multiField('talren_hypotheses', 'Référentiels / situations', TALREN_HYPOTHESES_OPTIONS, { full: true }),
      field('talren_coef_partiels', 'Coefficients partiels', 'textarea', { full: true, rows: 2 }),
    ],
  },
  {
    id: 'talren_criteres',
    title: 'Critères de vérification — Talren',
    tool: 'talren',
    columns: 2,
    fields: [
      multiField('talren_criteres', 'Vérifications', TALREN_CRITERES_OPTIONS, { full: true }),
      field('talren_fs_min', 'Facteur de sécurité minimum', 'number'),
      field('talren_deplacements', 'Déplacements admissibles', 'textarea', { full: true, rows: 2 }),
    ],
  },
  {
    id: 'resultats',
    title: 'Résultats & restitution',
    fields: [
      field('resultat_interpretation', 'Interprétation / synthèse', 'textarea', { full: true, rows: 5 }),
      field('resultat_conclusions', 'Conclusions', 'textarea', { full: true, rows: 4 }),
    ],
  },
]

export function getStudyType(studyTypeId) {
  return STUDY_TYPES.find((item) => item.id === studyTypeId) || STUDY_TYPES[0]
}

export function listStudyTypesForTool(toolId) {
  return STUDY_TYPES.filter((item) => item.tool === toolId)
}

export function defaultStudyTypeForTool(toolId) {
  return listStudyTypesForTool(toolId)[0]?.id || STUDY_TYPES[0].id
}

export function resolveToolForStudyType(studyTypeId) {
  return getStudyType(studyTypeId).tool
}

export function getVisibleSections(studyTypeId) {
  const profile = getStudyType(studyTypeId)
  const ids = new Set(profile.sectionIds || [])
  return CALCULATION_SECTIONS.filter((section) => ids.has(section.id))
}

export function buildEmptySheetValues(studyTypeId) {
  const values = { studyType: studyTypeId }
  for (const section of getVisibleSections(studyTypeId)) {
    if (section.repeatable) {
      values[section.repeatable.id] = [buildEmptyRepeatRow(section.repeatable.fields)]
      continue
    }
    for (const f of section.fields || []) {
      if (f.type === 'multiselect') values[f.id] = []
      else values[f.id] = ''
    }
  }
  return values
}

export function buildEmptyRepeatRow(fields) {
  const row = {}
  for (const f of fields) {
    row[f.id] = f.type === 'multiselect' ? [] : ''
  }
  return row
}

export const FICHE_CALCUL_DRAFT_KEY = 'ralab_fiche_calcul_draft'
