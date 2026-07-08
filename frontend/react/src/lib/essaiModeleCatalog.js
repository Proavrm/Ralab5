/**
 * Catalogue des modèles JSX terrain/labo.
 * PMT et SC ont des pages dédiées ; FWD/DE/ADH/ACO utilisent TerrainEssaiPage.
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
    fields: ['centrale', 'formulation', 'temperature_fabrication', 'tonnage', 'observations'],
    status: 'base',
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
    fields: ['point', 'localisation', 'deflexion_mm', 'temperature_c', 'observations'],
    status: 'base',
  },
  FWD: {
    code: 'FWD',
    label: 'FWD',
    route: '/modeles/terrain/fwd',
    terrain: true,
    status: 'active',
    summary: 'Feuille terrain FWD avec rapport.',
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
