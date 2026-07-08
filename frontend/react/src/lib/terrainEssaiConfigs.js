/** Configurations feuilles terrain in situ (hors PMT/SC dédiés). */

export const TERRAIN_ESSAI_CONFIGS = {
  FWD: {
    code: 'FWD',
    label: 'FWD / déflexions lourdes',
    subtitle: 'Mesures de déflexion et température de chaussée',
    rapportRoute: '/rapports/fwd/view',
    valueFields: [
      { key: 'equipment', label: 'Équipement FWD', full: true },
      { key: 'load_kg', label: 'Charge (kg)' },
      { key: 'sensor_type', label: 'Capteurs' },
      { key: 'criteria_deflexion_mm', label: 'Critère déflexion (mm)' },
    ],
    pointColumns: [
      { key: 'point_code', label: 'Point', width: '90px' },
      { key: 'pk', label: 'PK / repère', width: '120px' },
      { key: 'deflexion_mm', label: 'd (mm)', width: '90px' },
      { key: 'temperature_c', label: 'T (°C)', width: '90px' },
      { key: 'observations', label: 'Observations' },
    ],
  },
  DE: {
    code: 'DE',
    label: 'Densité enrobés in situ',
    subtitle: 'Contrôle densité / compacité / vides',
    rapportRoute: '/rapports/de/view',
    valueFields: [
      { key: 'gammadensimeter', label: 'Gamma-densimètre' },
      { key: 'calibration_date', label: 'Date étalonnage' },
      { key: 'layer_thickness', label: 'Épaisseur couche (cm)' },
      { key: 'criteria_void_min', label: 'Vides min (%)' },
      { key: 'criteria_void_max', label: 'Vides max (%)' },
    ],
    pointColumns: [
      { key: 'point_code', label: 'Point', width: '90px' },
      { key: 'pk', label: 'PK / repère', width: '120px' },
      { key: 'density', label: 'ρ (t/m³)', width: '90px' },
      { key: 'compacity', label: 'Compacité (%)', width: '110px' },
      { key: 'voids', label: 'Vides (%)', width: '90px' },
      { key: 'observations', label: 'Observations' },
    ],
  },
  ADH: {
    code: 'ADH',
    label: 'Adhérence',
    subtitle: 'Mesure adhérence revêtement / support',
    rapportRoute: '/rapports/adh/view',
    valueFields: [
      { key: 'method', label: 'Méthode' },
      { key: 'support', label: 'Support' },
      { key: 'criteria_mpa', label: 'Critère (MPa)' },
    ],
    pointColumns: [
      { key: 'point_code', label: 'Point', width: '90px' },
      { key: 'pk', label: 'PK / repère', width: '120px' },
      { key: 'value_mpa', label: 'Adhérence (MPa)', width: '120px' },
      { key: 'observations', label: 'Observations' },
    ],
  },
  ACO: {
    code: 'ACO',
    label: 'Mesure acoustique',
    subtitle: 'Contrôle acoustique surfacique',
    rapportRoute: '/rapports/aco/view',
    valueFields: [
      { key: 'method', label: 'Méthode' },
      { key: 'criteria_db', label: 'Critère (dB)' },
    ],
    pointColumns: [
      { key: 'point_code', label: 'Point', width: '90px' },
      { key: 'pk', label: 'PK / repère', width: '120px' },
      { key: 'value_db', label: 'Niveau (dB)', width: '110px' },
      { key: 'observations', label: 'Observations' },
    ],
  },
}

export function getTerrainEssaiConfig(code) {
  const normalized = String(code || '').trim().toUpperCase()
  return TERRAIN_ESSAI_CONFIGS[normalized] || null
}

export function getTerrainEssaiRoute(code) {
  const normalized = String(code || '').trim().toUpperCase()
  if (TERRAIN_ESSAI_CONFIGS[normalized]) return `/modeles/terrain/${normalized.toLowerCase()}`
  return `/modeles/essai/${encodeURIComponent(normalized)}`
}

export function getTerrainRapportRoute(code) {
  const config = getTerrainEssaiConfig(code)
  return config?.rapportRoute || `/rapports/${String(code || 'gen').toLowerCase()}/view`
}
