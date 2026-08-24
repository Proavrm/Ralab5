import BleuMethyleneForm from '@/components/essais/BleuMethyleneForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleMbPage() {
  return (
    <FeuilleLaboShell
      code="MB"
      defaultTypeEssai="Valeur au bleu 0/2"
      defaultNorme="NF EN 933-9"
      Form={BleuMethyleneForm}
      initialResultats={{ type_materiau: 'mb_0_2' }}
      heroFromResultats={(res) => (res?.mb != null ? { value: `${res.mb} g/kg`, label: 'MB' } : null)}
    />
  )
}
