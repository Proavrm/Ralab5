import MatiereOrganiqueForm from '@/components/essais/MatiereOrganiqueForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleMoPage() {
  return (
    <FeuilleLaboShell
      code="MO"
      defaultTypeEssai="Matière organique"
      defaultNorme=""
      Form={MatiereOrganiqueForm}
      heroFromResultats={(res) => (
        res?.mo_pct != null || res?.resultat != null
          ? { value: String(res.mo_pct ?? res.resultat), label: 'MO %' }
          : null
      )}
    />
  )
}
