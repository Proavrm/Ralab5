import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import { computeMoResultats, moBaseLabel, unwrapMoResultats } from '@/lib/moEssai'

export default function RapportMoPage() {
  return (
    <RapportLaboShell
      code="MO"
      subtitle="MATIERE ORGANIQUE"
      standardLabel="(méthode / norme renseignées sur la feuille)"
      documentCode="DG-Q / RE MO"
    >
      {({ essai, res }) => {
        const computed = computeMoResultats(unwrapMoResultats(res))
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
                  <div><span>Base du résultat :</span><strong>{moBaseLabel(computed.base_resultat)}</strong></div>
                  <div><span>N° boîte :</span><strong>{valueOrEmpty(computed.boite)}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>PESÉES ET RÉSULTAT</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>M1 (g)</th>
                    <th>M2 (g)</th>
                    <th>M3 (g)</th>
                    <th>Masse sèche (g)</th>
                    <th>Perte (g)</th>
                    <th>MO (%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{formatNumber(computed.m1)}</td>
                    <td>{formatNumber(computed.m2)}</td>
                    <td>{formatNumber(computed.m3)}</td>
                    <td>{formatNumber(computed.masse_seche)}</td>
                    <td>{formatNumber(computed.masse_perdue)}</td>
                    <td><strong>{formatNumber(computed.mo_pct)}</strong></td>
                  </tr>
                </tbody>
              </table>
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
