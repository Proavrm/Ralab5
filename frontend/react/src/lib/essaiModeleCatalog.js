/**
 * Catalogue des modèles JSX terrain/labo.
 * PMT, SC, DE, PL, PLD, DF et FWD ont des pages dédiées ; ADH/ACO utilisent TerrainEssaiPage.
 */

import { getTerrainEssaiConfig, getTerrainEssaiRoute } from './terrainEssaiConfigs'

export const ESSAI_MODELE_CATALOG = {
  PMT: {
    code: 'PMT',
    label: 'Profondeur de macrotexture',
    route: '/modeles/pmt',
    dedicated: true,
    status: 'active',
    summary: 'Feuille PMT complète avec calculs et rapport.',
  },
  SC: {
    code: 'SC',
    label: 'Sondage carotté',
    route: '/modeles/sc',
    dedicated: true,
    status: 'active',
    summary: 'Feuille stratigraphique SC avec couches et prélèvements.',
  },
  HAP: {
    code: 'HAP',
    label: 'Analyse HAP',
    fields: ['point', 'localisation', 'materiau', 'prelevement_ref', 'laboratoire', 'resultat', 'observations'],
    status: 'base',
  },
  AMI: {
    code: 'AMI',
    label: 'Diagnostic amiante',
    fields: ['point', 'localisation', 'materiau', 'prelevement_ref', 'laboratoire', 'resultat', 'observations'],
    status: 'base',
  },
  ADH: {
    code: 'ADH',
    label: 'Adhérence',
    route: '/modeles/terrain/adh',
    terrain: true,
    status: 'active',
    summary: 'Feuille terrain adhérence avec rapport.',
  },
  ACO: {
    code: 'ACO',
    label: 'Mesure acoustique',
    route: '/modeles/terrain/aco',
    terrain: true,
    status: 'active',
    summary: 'Feuille terrain acoustique avec rapport.',
  },
  CFE: {
    code: 'CFE',
    label: 'Contrôle fabrication enrobés',
    route: '/modeles/cfe',
    dedicated: true,
    status: 'active',
    summary: 'Feuille CFE complète avec granulométrie, liant et rapport.',
  },
  MVA: {
    code: 'MVA',
    label: 'Masse volumique des enrobés',
    route: '/modeles/mva',
    dedicated: true,
    status: 'active',
    summary: 'Feuille MVA complète avec calculs et rapport.',
  },
  EL: {
    code: 'EL',
    label: 'Extraction de liant',
    route: '/modeles/el',
    dedicated: true,
    status: 'active',
    summary: 'Feuille EL avec produit DE (centrale, formule, FTP) et rapport NF EN 12697-1.',
  },
  WE: {
    code: 'WE',
    label: 'Teneur en eau pondérale',
    route: '/modeles/we',
    dedicated: true,
    status: 'active',
    summary: 'Feuille WE (ancienne TeneurEnEau) : pesées NF P 94-050 et JSON usage / w_moyen.',
  },
  GR: {
    code: 'GR',
    label: 'Granulométrie',
    route: '/modeles/gr',
    dedicated: true,
    status: 'active',
    summary: 'Feuille GR ancienne : tamis, coupures, P80, Dmax, coeff C pour VBS.',
  },
  LCP: {
    code: 'LCP',
    label: "Limites d'Atterberg",
    route: '/modeles/lcp',
    dedicated: true,
    status: 'active',
    summary: 'Feuille LCP ancienne : wL, wP, Ip, Wn (prérempli depuis WE).',
  },
  VBS: {
    code: 'VBS',
    label: 'Valeur de bleu',
    route: '/modeles/vbs',
    dedicated: true,
    status: 'active',
    summary: 'Feuille VBS ancienne : lit WE et coeff C du GR du même échantillon.',
  },
  MB: {
    code: 'MB',
    label: 'Valeur au bleu 0/2',
    route: '/modeles/mb',
    dedicated: true,
    status: 'active',
    summary: 'Feuille MB ancienne : lit le WE usage coupure_0250.',
  },
  MBF: {
    code: 'MBF',
    label: 'Valeur au bleu 0/0.125',
    route: '/modeles/mbf',
    dedicated: true,
    status: 'active',
    summary: 'Feuille MBF ancienne : lit le WE usage coupure_0125.',
  },
  ID: {
    code: 'ID',
    label: 'Identification GTR',
    route: '/modeles/id',
    dedicated: true,
    status: 'active',
    summary: 'Feuille ID : description visuelle, GTR 1992, GTR 2022 / EN 16907-2 et ISO 14688-2.',
  },
  PN: {
    code: 'PN',
    label: 'Proctor',
    route: '/modeles/pn',
    dedicated: true,
    status: 'active',
    summary: 'Feuille PN ancienne : courbe, OPN, correction GTR 0/20 depuis GR.',
  },
  IPI: {
    code: 'IPI',
    label: 'Indice Portant Immédiat',
    route: '/modeles/ipi',
    dedicated: true,
    status: 'active',
    summary: 'Feuille IPI ancienne : poinçonnements liés au Proctor du même échantillon.',
  },
  CBRI: {
    code: 'CBRI',
    label: 'CBR immédiat',
    route: '/modeles/cbri',
    dedicated: true,
    status: 'active',
    summary: 'Feuille CBRi ancienne : CBR immédiat lié au Proctor.',
  },
  IM: {
    code: 'IM',
    label: 'CBR immédiat',
    route: '/modeles/cbri',
    dedicated: true,
    status: 'active',
    summary: 'Alias IM : même feuille que CBRi.',
  },
  CBR: {
    code: 'CBR',
    label: 'CBR après immersion',
    route: '/modeles/cbr',
    dedicated: true,
    status: 'active',
    summary: 'Feuille CBR ancienne : immersion 4 jours, liée au Proctor.',
  },
  ES: {
    code: 'ES',
    label: 'Équivalent de sable',
    route: '/modeles/es',
    dedicated: true,
    status: 'active',
    summary: 'Feuille ES : SE P / SE V (h1, h2, h′2) selon le CRE NF EN 933-8.',
  },
  TX: {
    code: 'TX',
    label: 'Texture / granulométrie pédologique',
    route: '/modeles/tx',
    dedicated: true,
    status: 'active',
    summary: 'Feuille TX : fractions argiles / limons / sables (générique, normes configurables).',
  },
  PH: {
    code: 'PH',
    label: 'pH',
    route: '/modeles/ph',
    dedicated: true,
    status: 'active',
    summary: 'Feuille PH : pH eau / pH KCl optionnel (méthode et norme configurables).',
  },
  MO: {
    code: 'MO',
    label: 'Matière organique',
    route: '/modeles/mo',
    dedicated: true,
    status: 'active',
    summary: 'Feuille MO : matière organique par perte au feu (méthode et norme configurables).',
  },
  CA: {
    code: 'CA',
    label: 'Calcaire actif',
    route: '/modeles/ca',
    dedicated: true,
    status: 'active',
    summary: 'Feuille CA : calcaire actif (prise, titre, facteur — méthode et norme configurables).',
  },
  DE: {
    code: 'DE',
    label: 'Densité enrobés',
    route: '/modeles/de',
    dedicated: true,
    status: 'active',
    summary: 'Feuille DE dédiée avec saisie terrain et rapport.',
  },
  DF: {
    code: 'DF',
    label: 'Déflexions',
    route: '/modeles/df',
    dedicated: true,
    status: 'active',
    summary: 'Feuille DF : déflexions Gauche / Axe / Droite (1/100 mm) selon le CRE NF P 98-200-2.',
  },
  FWD: {
    code: 'FWD',
    label: 'FWD',
    route: '/modeles/fwd',
    dedicated: true,
    status: 'active',
    summary: 'Feuille FWD persistée en feuilles_terrain, avec rapport.',
  },
  PLD: {
    code: 'PLD',
    label: 'Portance Dynaplaque',
    route: '/modeles/pld',
    dedicated: true,
    status: 'active',
    summary: 'Feuille PLD : module EV2 Dynaplaque selon le CRE NF P 94-117-2.',
  },
  PL: {
    code: 'PL',
    label: 'Portance à la plaque',
    route: '/modeles/pl',
    dedicated: true,
    status: 'active',
    summary: 'Feuille PL : EV1 / EV2 / EV2/EV1 selon le CRE NF P 94-117-1.',
  },
  EXT: {
    code: 'EXT',
    label: 'Extraction / granulo',
    fields: ['echantillon_ref', 'liant_percent', 'granulometrie', 'observations'],
    status: 'base',
  },
  PCG: {
    code: 'PCG',
    label: 'Presse compactage giratoire',
    fields: ['formulation', 'energie', 'observations'],
    status: 'base',
  },
  ORN: {
    code: 'ORN',
    label: 'Orniérage',
    fields: ['point', 'profondeur_mm', 'observations'],
    status: 'base',
  },
  ITSR: {
    code: 'ITSR',
    label: 'Tenue à l\'eau',
    fields: ['echantillon_ref', 'resultat', 'observations'],
    status: 'base',
  },
  SCB: {
    code: 'SCB',
    label: 'Semi-circular bending',
    fields: ['echantillon_ref', 'temperature_c', 'charge_kn', 'observations'],
    status: 'base',
  },
  ARR: {
    code: 'ARR',
    label: 'Arrachement',
    fields: ['point', 'valeur', 'observations'],
    status: 'base',
  },
  GPR: {
    code: 'GPR',
    label: 'Radar chaussée',
    fields: ['trace', 'profondeur_m', 'observations'],
    status: 'base',
  },
}

export function getEssaiModeleDefinition(code) {
  const normalized = String(code || '').trim().toUpperCase()
  return ESSAI_MODELE_CATALOG[normalized] || {
    code: normalized || 'GEN',
    label: normalized || 'Essai générique',
    fields: ['point', 'localisation', 'resultat', 'observations'],
    status: 'base',
  }
}

export function resolveEssaiModeleRoute(code) {
  const def = getEssaiModeleDefinition(code)
  if (def.dedicated && def.route) return def.route
  if (def.terrain && def.route) return def.route
  if (getTerrainEssaiConfig(code)) return getTerrainEssaiRoute(code)
  if (!def.code || def.code === 'GEN') return null
  return `/modeles/essai/${encodeURIComponent(def.code)}`
}

export function buildEssaiModelePath(code, params = {}) {
  const route = resolveEssaiModeleRoute(code)
  if (!route) return null
  const search = new URLSearchParams(params)
  const query = search.toString()
  return query ? `${route}?${query}` : route
}
