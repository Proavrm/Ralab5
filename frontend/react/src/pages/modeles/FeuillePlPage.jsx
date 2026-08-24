import FeuilleTerrainPointsShell from '@/components/terrain/FeuilleTerrainPointsShell'
import PlForm from '@/components/terrain/PlForm'
import {
  emptyPlPayload,
  serializePlPayload,
  unwrapPlPayload,
} from '@/lib/plEssai'

export default function FeuillePlPage() {
  return (
    <FeuilleTerrainPointsShell
      code="PL"
      title="Feuille PL"
      subtitle="Portance à la plaque"
      defaultNorme="NF P 94-117-1"
      Form={PlForm}
      initialPayload={emptyPlPayload()}
      serializePayload={serializePlPayload}
      unwrapPayload={unwrapPlPayload}
      heroFromPayload={(payload) => (
        payload?.moyenne_ev2_mpa != null
          ? { value: String(payload.moyenne_ev2_mpa), label: 'EV2 moy. (MPa)' }
          : null
      )}
    />
  )
}
