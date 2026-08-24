import FeuilleTerrainPointsShell from '@/components/terrain/FeuilleTerrainPointsShell'
import DfForm from '@/components/terrain/DfForm'
import {
  emptyDfPayload,
  serializeDfPayload,
  unwrapDfPayload,
} from '@/lib/dfEssai'

export default function FeuilleDfPage() {
  return (
    <FeuilleTerrainPointsShell
      code="DF"
      title="Feuille DF"
      subtitle="Déflexions"
      defaultNorme="NF P 98-200-2"
      Form={DfForm}
      initialPayload={emptyDfPayload()}
      serializePayload={serializeDfPayload}
      unwrapPayload={unwrapDfPayload}
      heroFromPayload={(payload) => (
        payload?.moyenne_axe != null
          ? { value: String(payload.moyenne_axe), label: 'Déflexion axe (1/100 mm)' }
          : null
      )}
    />
  )
}
