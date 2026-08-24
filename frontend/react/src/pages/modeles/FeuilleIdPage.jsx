import IdentificationGtrForm from '@/components/essais/IdentificationGtrForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleIdPage() {
  return (
    <FeuilleLaboShell
      code="ID"
      defaultTypeEssai="Identification GTR"
      defaultNorme="NF P 11-300"
      Form={IdentificationGtrForm}
      heroFromResultats={(res) => {
        const gtr = res?.gtr_ancienne?.code || res?.classification_gtr || res?.gtr_class
        const neu = res?.gtr_nouvelle?.code
        const iso = res?.eurocode?.iso_14688
        if (gtr && (neu || iso)) {
          return { value: [gtr, neu, iso].filter(Boolean).join(' · '), label: 'GTR 1992 · EN 16907 · ISO 14688' }
        }
        return gtr ? { value: String(gtr), label: 'GTR 1992' } : null
      }}
    />
  )
}
