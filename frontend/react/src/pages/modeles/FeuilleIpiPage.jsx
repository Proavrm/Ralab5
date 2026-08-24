import IPIForm from '@/components/essais/IPIForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleIpiPage() {
  return (
    <FeuilleLaboShell
      code="IPI"
      defaultTypeEssai="IPI — Indice Portant Immédiat"
      defaultNorme="NF P 94-078"
      Form={IPIForm}
      heroFromResultats={(res) => (
        res?.ipi != null ? { value: `${res.ipi} %`, label: 'IPI' } : null
      )}
    />
  )
}
