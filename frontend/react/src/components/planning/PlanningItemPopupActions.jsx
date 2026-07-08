import { MISSION_JOURNEE_BUTTON_LABEL, openSiteAccessRapport } from '@/lib/siteAccessRapport'
import { resolvePlanningItemMissionJournee } from '@/lib/planningShared'

export default function PlanningItemPopupActions({ item, onOpenPreparation }) {
  const mission = resolvePlanningItemMissionJournee(item)
  const demandeUid = String(item?.source_demande_id || '').trim()
  const showPreparation = Boolean(
    demandeUid
    && item?.kind === 'intervention'
    && !item?.is_demande_scope,
  )

  if (!mission && !showPreparation) return null

  return (
    <div className="ip-actions">
      {showPreparation ? (
        <button
          type="button"
          className="ip-btn link"
          onClick={() => onOpenPreparation?.(demandeUid)}
        >
          Préparation
        </button>
      ) : null}
      {mission ? (
        <button
          type="button"
          className="ip-btn primary"
          onClick={() => openSiteAccessRapport({
            demandeUid: mission.demandeUid,
            missionDate: mission.missionDate,
            technicien: mission.technicienLabel,
            interventions: item ? [item] : undefined,
          })}
        >
          {MISSION_JOURNEE_BUTTON_LABEL}
        </button>
      ) : null}
    </div>
  )
}
