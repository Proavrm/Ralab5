import { feuillesTerrainApi } from '@/services/api'
import { buildScEssaiRoute } from '@/lib/essaiValidation'
import { getTerrainEssaiConfig, getTerrainEssaiRoute } from '@/lib/terrainEssaiConfigs'

export const FEUILLE_TERRAIN_ESSAI_CODES = new Set(['DE', 'SC', 'SO', 'PMT', 'PL', 'PLD', 'VC'])

export function isFeuilleTerrainEssaiCode(code) {
  return FEUILLE_TERRAIN_ESSAI_CODES.has(String(code || '').trim().toUpperCase())
}

export function isGenericTerrainEssaiCode(code) {
  return Boolean(getTerrainEssaiConfig(code))
}

export function buildGenericTerrainEssaiOpenPath({
  interventionId,
  code,
  interventionRef = '',
  demandeRef = '',
  campagneRef = '',
  site = '',
  zone = '',
  operateur = '',
  dateFeuille = '',
  returnTo = '',
}) {
  const params = new URLSearchParams()
  params.set('essai_id', `int-${interventionId}`)
  if (interventionRef) params.set('intervention_ref', interventionRef)
  if (demandeRef) params.set('demande_ref', demandeRef)
  if (campagneRef) params.set('campagne_ref', campagneRef)
  if (site) params.set('site', site)
  if (zone) params.set('zone', zone)
  if (operateur) params.set('operator', operateur)
  if (dateFeuille) params.set('test_date', dateFeuille)
  if (returnTo) params.set('return_to', returnTo)
  return `${getTerrainEssaiRoute(code)}?${params.toString()}`
}

export function buildTerrainFeuilleOpenPath(feuilleUid, code) {
  const feuilleId = String(feuilleUid)
  const normalizedCode = String(code || '').trim().toUpperCase()

  if (normalizedCode === 'DE') {
    return `/modeles/de/${encodeURIComponent(feuilleId)}`
  }
  if (normalizedCode === 'SC') {
    return buildScEssaiRoute(feuilleId, '', true)
  }
  if (normalizedCode === 'SO') {
    return `/feuilles-terrain/${encodeURIComponent(feuilleId)}?edit=1`
  }
  if (normalizedCode === 'VC') {
    return `/feuilles-terrain/vc/${encodeURIComponent(feuilleId)}`
  }
  return `/feuilles-terrain/${encodeURIComponent(feuilleId)}`
}

export function findLinkedFeuilleTerrainByCode(feuilles = [], code) {
  const normalized = String(code || '').trim().toUpperCase()
  return feuilles.find(
    (item) => String(item?.code_feuille || '').trim().toUpperCase() === normalized,
  ) || null
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
