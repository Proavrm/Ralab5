import { summarizePmtRows } from './compute'
import { normalizePositionCodes } from '../positionCodes'

export function normalizePmtRows(rows = []) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, index) => {
    const source = row && typeof row === 'object' ? row : {}
    const point = String(source.point ?? source.numero_essai ?? '').trim()
    const obs = String(source.observations ?? source.observation ?? '').trim()
    return {
      ...source,
      id: source.id ?? index + 1,
      point: point || String(index + 1),
      profil: String(source.profil ?? ''),
      position_codes: normalizePositionCodes(source.position_codes),
      diametre_moyen_tache_mm:
        source.diametre_moyen_tache_mm !== undefined && source.diametre_moyen_tache_mm !== null
          ? source.diametre_moyen_tache_mm
          : '',
      profondeur_macrotexture_mm: source.profondeur_macrotexture_mm ?? source.pmt_mm ?? '',
      observation: obs,
      observations: obs,
    }
  })
}

/** Chaves string usadas no modèle / runtime PMT — preserva qualquer outra chave vinda do serveur/import. */
const PMT_META_STRING_KEYS = new Set([
  'reference_chantier',
  'chrono',
  'date_essai',
  'date_mise_en_oeuvre',
  'emplacement',
  'norme',
  'operateur',
  'conditions_meteo',
  'section_controlee',
  'lieu_fabrication',
  'numero_formule',
  'produit_controle',
  'couche',
  'epaisseur_couche_cm',
  'atelier_mise_en_oeuvre',
  'volume_materiau_mm3',
  'laboratoire',
  'criteria_source',
  'criteria_definition',
  'conclusion_courte',
  'commentaires',
])

export function normalizePmtMeta(meta = {}) {
  const safe = meta && typeof meta === 'object' ? { ...meta } : {}
  const out = { ...safe }
  for (const key of PMT_META_STRING_KEYS) {
    if (out[key] === undefined || out[key] === null) {
      out[key] = ''
    } else if (key !== 'criteria_pmt_min' && key !== 'criteria_conformity_min_pct') {
      out[key] = String(out[key])
    }
  }
  if (out.criteria_pmt_min === undefined || out.criteria_pmt_min === null) out.criteria_pmt_min = ''
  if (out.criteria_conformity_min_pct === undefined || out.criteria_conformity_min_pct === null) {
    out.criteria_conformity_min_pct = ''
  }
  return out
}

export function normalizePmtRuntimeValues(values = {}) {
  const safe = values && typeof values === 'object' ? values : {}
  const meta = normalizePmtMeta(safe.meta)
  const pointsRows = normalizePmtRows(safe.points_rows)
  const resume = summarizePmtRows(pointsRows, meta.criteria_pmt_min)
  return {
    meta,
    points_rows: pointsRows,
    resume,
  }
}
