import { CBRIForm } from '@/components/essais/IPICBRForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleCbriPage() {
  return (
    <FeuilleLaboShell
      code="CBRI"
      defaultTypeEssai="CBRi — CBR immédiat"
      defaultNorme="NF P 94-090-1"
      Form={CBRIForm}
      heroFromResultats={(res) => (
        res?.cbr != null ? { value: `${res.cbr} %`, label: 'CBRi' } : null
      )}
    />
  )
}
