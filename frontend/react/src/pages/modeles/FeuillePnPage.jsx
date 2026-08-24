import ProctorForm from '@/components/essais/ProctorForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuillePnPage() {
  return (
    <FeuilleLaboShell
      code="PN"
      defaultTypeEssai="Proctor Normal"
      defaultNorme="NF P 94-093"
      Form={ProctorForm}
      heroFromResultats={(res) => (
        res?.wOPN != null ? { value: `${res.wOPN} %`, label: 'wOPN' } : null
      )}
    />
  )
}
