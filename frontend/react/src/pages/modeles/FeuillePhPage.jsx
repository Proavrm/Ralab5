import PhForm from '@/components/essais/PhForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuillePhPage() {
  return (
    <FeuilleLaboShell
      code="PH"
      defaultTypeEssai="pH"
      defaultNorme=""
      Form={PhForm}
      heroFromResultats={(res) => (
        res?.resultat != null || res?.ph_eau != null
          ? { value: String(res.resultat ?? res.ph_eau), label: 'pH eau' }
          : null
      )}
    />
  )
}
