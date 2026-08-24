import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import { computeCaResultats, unwrapCaResultats } from '@/lib/caEssai'

export default function RapportCaPage() {
  return (
    <RapportLaboShell
      code="CA"
      subtitle="CALCAIRE ACTIF"
      standardLabel="(méthode / norme renseignées sur la feuille)"
      documentCode="DG-Q / RE CA"
    >
      {({ essai, res }) => {
        const computed = computeCaResultats(unwrapCaResultats(res))
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                  <div><span>Méthode :</span><strong>{valueOrEmpty(computed.methode)}</strong></div>
                  <div><span>Norme :</span><strong>{valueOrEmpty(computed.norme || essai?.norme)}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>Prise d&apos;essai :</span><strong>{valueOrEmpty(formatNumber(computed.prise_essai_g))} g</strong></div>
                  <div><span>Facteur de titre :</span><strong>{valueOrEmpty(formatNumber(computed.facteur_titre))}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>RESULTATS</span></h2>
              <div className="rapport-field-list">
                <div><span>Volume titré :</span><strong>{valueOrEmpty(formatNumber(computed.volume_titre_ml))} mL</strong></div>
                <div><span>Blanc :</span><strong>{valueOrEmpty(formatNumber(computed.blanc_ml))} mL</strong></div>
                <div><span>Volume net :</span><strong>{valueOrEmpty(formatNumber(computed.volume_net))} mL</strong></div>
                <div><span>Calcaire actif :</span><strong>{valueOrEmpty(formatNumber(computed.ca_pct))} %</strong></div>
              </div>
            </section>
            {computed.observations ? (
              <section className="rapport-section">
                <h2>3/ <span>OBSERVATIONS</span></h2>
                <p>{computed.observations}</p>
              </section>
            ) : null}
          </>
        )
      }}
    </RapportLaboShell>
  )
}
