import FeuilleTerrainPointsShell from '@/components/terrain/FeuilleTerrainPointsShell'
import FwdForm from '@/components/terrain/FwdForm'
import {
  emptyFwdPayload,
  hydrateFwdPayload,
  serializeFwdPayload,
} from '@/lib/fwdEssai'

export default function FeuilleFwdPage() {
  return (
    <FeuilleTerrainPointsShell
      code="FWD"
      title="Feuille FWD"
      subtitle="Déflexions lourdes"
      defaultNorme=""
      Form={FwdForm}
      initialPayload={emptyFwdPayload()}
      serializePayload={serializeFwdPayload}
      unwrapPayload={hydrateFwdPayload}
      heroFromPayload={(payload) => (
        payload?.moyenne_deflexion_mm != null
          ? { value: String(payload.moyenne_deflexion_mm), label: 'd moy. (mm)' }
          : null
      )}
    />
  )
}
