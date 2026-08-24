import BleuMethyleneForm from '@/components/essais/BleuMethyleneForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleMbfPage() {
  return (
    <FeuilleLaboShell
      code="MBF"
      defaultTypeEssai="Valeur au bleu 0/0.125"
      defaultNorme="NF EN 933-9"
      Form={BleuMethyleneForm}
      initialResultats={{ type_materiau: 'mbf_0_0125' }}
      heroFromResultats={(res) => (res?.mbf != null ? { value: `${res.mbf} g/kg`, label: 'MBF' } : null)}
    />
  )
}
