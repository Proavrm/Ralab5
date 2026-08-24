import TextureTerreForm from '@/components/essais/TextureTerreForm'
import FeuilleLaboShell from '@/components/essais/FeuilleLaboShell'

export default function FeuilleTxPage() {
  return (
    <FeuilleLaboShell
      code="TX"
      defaultTypeEssai="Texture / granulométrie pédologique"
      defaultNorme=""
      Form={TextureTerreForm}
      heroFromResultats={(res) => (
        res?.limons_totaux != null
          ? { value: String(res.limons_totaux), label: 'Limons totaux %' }
          : res?.argiles != null
            ? { value: String(res.argiles), label: 'Argiles %' }
            : null
      )}
    />
  )
}
