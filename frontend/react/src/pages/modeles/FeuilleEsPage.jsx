import EquivalentSableForm from '@/components/essais/EquivalentSableForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleEsPage() {
  return (
    <FeuilleLaboShell
      code="ES"
      defaultTypeEssai="Équivalent de sable"
      defaultNorme="NF EN 933-8"
      Form={EquivalentSableForm}
      heroFromResultats={(res) => (
        res?.se_p != null || res?.es != null
          ? { value: String(res.se_p ?? res.es), label: res?.type_materiau === 'sols' ? 'ES P' : 'SE P' }
          : null
      )}
    />
  )
}
