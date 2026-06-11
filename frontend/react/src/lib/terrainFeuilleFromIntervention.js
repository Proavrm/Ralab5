import { feuillesTerrainApi } from '@/services/api'
import { buildScEssaiRoute } from '@/lib/essaiValidation'

export const FEUILLE_TERRAIN_ESSAI_CODES = new Set(['DE', 'SC', 'SO', 'PMT', 'PL', 'PLD'])

export function isFeuilleTerrainEssaiCode(code) {
  return FEUILLE_TERRAIN_ESSAI_CODES.has(String(code || '').trim().toUpperCase())
}

export function buildTerrainFeuilleOpenPath(feuilleUid, code) {
  const feuilleId = String(feuilleUid)
  const normalizedCode = String(code || '').trim().toUpperCase()

  if (normalizedCode === 'DE') {
    return `/feuilles-terrain/de/${encodeURIComponent(feuilleId)}/runtime`
  }
  if (normalizedCode === 'SC') {
    return buildScEssaiRoute(feuilleId, '', true)
  }
  if (normalizedCode === 'SO') {
    return `/feuilles-terrain/${encodeURIComponent(feuilleId)}?edit=1`
  }
  return `/feuilles-terrain/${encodeURIComponent(feuilleId)}`
}

export async function createTerrainFeuilleForIntervention({
  interventionId,
  code,
  label = '',
  dateFeuille = '',
  operateur = '',
}) {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!isFeuilleTerrainEssaiCode(normalizedCode)) {
    throw new Error(`Code feuille terrain non supporté: ${normalizedCode || '—'}`)
  }

  const created = await feuillesTerrainApi.create({
    intervention_id: Number(interventionId),
    code_feuille: normalizedCode,
    label,
    date_feuille: dateFeuille,
    operateur,
  })

  const feuilleUid = created?.uid ?? created?.id
  if (!feuilleUid) {
    throw new Error('Feuille terrain créée sans identifiant.')
  }

  return {
    feuilleUid,
    openPath: buildTerrainFeuilleOpenPath(feuilleUid, normalizedCode),
    created,
  }
}
