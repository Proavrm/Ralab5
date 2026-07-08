import { feuilleMissionApi } from '@/services/api'

export function missionFeuilleStatusMeta(status) {
  switch (String(status || '').trim()) {
    case 'printed':
      return { label: 'Imprimée', className: 'fmt-printed', title: 'Feuille mission imprimée' }
    case 'generated':
      return { label: 'Générée', className: 'fmt-generated', title: 'Feuille mission générée, pas encore imprimée' }
    case 'stale':
      return { label: 'Modifiée', className: 'fmt-stale', title: 'Planning modifié depuis la dernière feuille — à regénérer' }
    default:
      return { label: 'Non générée', className: 'fmt-none', title: 'Feuille mission pas encore générée' }
  }
}

export async function recordFeuilleMissionJournee({
  demandeUid,
  missionDate,
  technicien,
  action,
  snapshotHash = '',
}) {
  const demande_id = Number(demandeUid)
  if (!demande_id || !missionDate) return null
  return feuilleMissionApi.touchJournee({
    demande_id,
    mission_date: missionDate,
    technicien: technicien || 'Sans technicien',
    action,
    snapshot_hash: snapshotHash || '',
  })
}

export async function fetchFeuilleMissionSnapshotHash({
  demandeUid,
  missionDate,
  technicien,
}) {
  const demande_id = Number(demandeUid)
  if (!demande_id || !missionDate) return ''
  const payload = await feuilleMissionApi.getJourneeSnapshotHash({
    demande_id,
    mission_date: missionDate,
    technicien: technicien || 'Sans technicien',
  })
  return String(payload?.snapshot_hash || '')
}
