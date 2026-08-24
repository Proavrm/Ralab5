import GranulometrieForm from '@/components/essais/GranulometrieForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleGrPage() {
  return (
    <FeuilleLaboShell
      code="GR"
      defaultTypeEssai="Granulométrie"
      defaultNorme="NF P 94-056"
      Form={GranulometrieForm}
      heroFromResultats={(res) => (res?.passant_80 != null ? { value: `${res.passant_80} %`, label: 'P80 µm' } : null)}
    />
  )
}
