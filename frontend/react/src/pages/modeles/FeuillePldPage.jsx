import FeuilleTerrainPointsShell from '@/components/terrain/FeuilleTerrainPointsShell'
import PldForm from '@/components/terrain/PldForm'
import {
  emptyPldPayload,
  serializePldPayload,
  unwrapPldPayload,
} from '@/lib/pldEssai'

export default function FeuillePldPage() {
  return (
    <FeuilleTerrainPointsShell
      code="PLD"
      title="Feuille PLD"
      subtitle="Portance Dynaplaque"
      defaultNorme="NF P 94-117-2"
      Form={PldForm}
      initialPayload={emptyPldPayload()}
      serializePayload={serializePldPayload}
      unwrapPayload={unwrapPldPayload}
      heroFromPayload={(payload) => (
        payload?.moyenne_ev2_mpa != null
          ? { value: String(payload.moyenne_ev2_mpa), label: 'EV2 moy. (MPa)' }
          : null
      )}
    />
  )
}
