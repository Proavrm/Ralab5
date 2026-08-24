import BleuMethyleneForm from '@/components/essais/BleuMethyleneForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleVbsPage() {
  return (
    <FeuilleLaboShell
      code="VBS"
      defaultTypeEssai="Bleu de méthylène"
      defaultNorme="NF P 94-068"
      Form={BleuMethyleneForm}
      initialResultats={{ type_materiau: 'granulats' }}
      heroFromResultats={(res) => (
        res?.vbs_moyen != null ? { value: String(res.vbs_moyen), label: 'VBS moyen' } : null
      )}
    />
  )
}
