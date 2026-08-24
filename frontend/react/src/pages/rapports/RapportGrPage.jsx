import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'

export default function RapportGrPage() {
  return (
    <RapportLaboShell code="GR" subtitle="ANALYSE GRANULOMETRIQUE" standardLabel="(NF P 94-056 / NF EN 933-1)" documentCode="DG-Q / RE GR">
      {({ essai, res }) => (
        <>
          <section className="rapport-section rapport-section-general">
            <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
            <div className="rapport-general-grid">
              <div className="rapport-field-list">
                <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                <div><span>Mode :</span><strong>{valueOrEmpty(res?.mode_preparation === 'coupures' ? 'Avec coupure(s)' : 'Directe')}</strong></div>
                <div><span>Modèle :</span><strong>{valueOrEmpty(res?.modele)}</strong></div>
              </div>
              <div className="rapport-field-list">
                <div><span>P80 µm :</span><strong>{valueOrEmpty(formatNumber(res?.passant_80))}</strong></div>
                <div><span>Dmax :</span><strong>{valueOrEmpty(formatNumber(res?.dmax))}</strong></div>
                <div><span>Coeff. C :</span><strong>{valueOrEmpty(formatNumber(res?.coeff_vbs))}</strong></div>
              </div>
            </div>
          </section>
          <section className="rapport-section rapport-section-results">
            <h2>2/ <span>RESULTATS</span></h2>
            <table className="rapport-table">
              <thead>
                <tr>
                  <th>Tamis (mm)</th>
                  <th>Refus (g)</th>
                  <th>Passant (%)</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(res?.tamis_global) && res.tamis_global.length ? res.tamis_global : (res?.tamis || [])).map((row, index) => (
                  <tr key={row.d ?? index}>
                    <td>{formatNumber(row.d)}</td>
                    <td>{formatNumber(row.retained_g ?? row.r)}</td>
                    <td>{formatNumber(row.passant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </RapportLaboShell>
  )
}
