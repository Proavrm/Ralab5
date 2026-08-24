import CalcaireActifForm from '@/components/essais/CalcaireActifForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleCaPage() {
  return (
    <FeuilleLaboShell
      code="CA"
      defaultTypeEssai="Calcaire actif"
      defaultNorme=""
      Form={CalcaireActifForm}
      heroFromResultats={(res) => (
        res?.ca_pct != null || res?.resultat != null
          ? { value: String(res.ca_pct ?? res.resultat), label: 'CaCO₃ actif %' }
          : null
      )}
    />
  )
}
