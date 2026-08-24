import { CBRForm } from '@/components/essais/IPICBRForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleCbrPage() {
  return (
    <FeuilleLaboShell
      code="CBR"
      defaultTypeEssai="CBR — après immersion 4 jours"
      defaultNorme="NF P 94-090-1"
      Form={CBRForm}
      heroFromResultats={(res) => (
        res?.cbr != null ? { value: `${res.cbr} %`, label: 'CBR' } : null
      )}
    />
  )
}
