import LimitesAtterbergForm from '@/components/essais/LimitesAtterbergForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleLcpPage() {
  return (
    <FeuilleLaboShell
      code="LCP"
      defaultTypeEssai="Limites d'Atterberg"
      defaultNorme="NF P 94-051"
      Form={LimitesAtterbergForm}
      heroFromResultats={(res) => (res?.ip != null ? { value: `${res.ip} %`, label: 'Ip' } : null)}
    />
  )
}
