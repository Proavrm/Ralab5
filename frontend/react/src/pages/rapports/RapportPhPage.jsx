import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import { computePhResultats, unwrapPhResultats } from '@/lib/phEssai'

export default function RapportPhPage() {
  return (
    <RapportLaboShell
      code="PH"
      subtitle="pH"
      standardLabel="(méthode / norme renseignées sur la feuille)"
      documentCode="DG-Q / RE PH"
    >
      {({ essai, res }) => {
        const computed = computePhResultats(unwrapPhResultats(res))
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
                  <div><span>Température :</span><strong>{valueOrEmpty(formatNumber(computed.temperature_c))} °C</strong></div>
                  <div><span>Ratio sol / eau :</span><strong>{valueOrEmpty(computed.ratio_sol_eau)}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>RESULTATS</span></h2>
              <div className="rapport-field-list">
                <div><span>pH eau :</span><strong>{valueOrEmpty(formatNumber(computed.resultat ?? computed.ph_eau))}</strong></div>
                <div><span>pH KCl :</span><strong>{valueOrEmpty(formatNumber(computed.ph_kcl_num ?? computed.ph_kcl))}</strong></div>
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
