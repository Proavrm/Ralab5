import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import { TX_FRACTIONS, computeTxResultats, unwrapTxResultats } from '@/lib/txEssai'

export default function RapportTxPage() {
  return (
    <RapportLaboShell
      code="TX"
      subtitle="TEXTURE / GRANULOMETRIE PEDOLOGIQUE"
      standardLabel="(méthode / norme renseignées sur la feuille)"
      documentCode="DG-Q / RE TX"
    >
      {({ essai, res }) => {
        const computed = computeTxResultats(unwrapTxResultats(res))
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
                  <div><span>Limons totaux :</span><strong>{valueOrEmpty(formatNumber(computed.limons_totaux))} %</strong></div>
                  <div><span>Sables totaux :</span><strong>{valueOrEmpty(formatNumber(computed.sables_totaux))} %</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>FRACTIONS GRANULOMETRIQUES</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>Fraction</th>
                    <th>Résultat (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {TX_FRACTIONS.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{formatNumber(computed[row.key])}</td>
                    </tr>
                  ))}
                  <tr>
                    <td><strong>Limons totaux</strong></td>
                    <td><strong>{formatNumber(computed.limons_totaux)}</strong></td>
                  </tr>
                  <tr>
                    <td><strong>Sables totaux</strong></td>
                    <td><strong>{formatNumber(computed.sables_totaux)}</strong></td>
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
