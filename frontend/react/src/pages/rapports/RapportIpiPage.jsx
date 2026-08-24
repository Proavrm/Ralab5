import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'

export default function RapportIpiPage() {
  return (
    <RapportLaboShell code="IPI" subtitle="INDICE PORTANT IMMEDIAT" standardLabel="(NF P 94-078)" documentCode="DG-Q / RE IPI">
      {({ essai, res }) => {
        const tests = Array.isArray(res?.tests) ? res.tests : []
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-field-list">
                <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                <div><span>Proctor lié :</span><strong>{valueOrEmpty(res?.pn_uid)}</strong></div>
                <div><span>IPI (%) :</span><strong>{valueOrEmpty(formatNumber(res?.ipi))}</strong></div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>POINCONNEMENTS</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Point PN</th>
                    <th>w (%)</th>
                    <th>ρd</th>
                    <th>δ0</th>
                    <th>CBR 2.5</th>
                    <th>CBR 5.0</th>
                    <th>IPI (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(tests.length ? tests : [{}]).map((row, index) => (
                    <tr key={row?.id ?? index} className={row?.actif === false ? 'opacity-50' : ''}>
                      <td>{row?.id || index + 1}</td>
                      <td>{valueOrEmpty(row?.pn_point_id)}</td>
                      <td>{formatNumber(row?.pn_point_w)}</td>
                      <td>{formatNumber(row?.pn_point_rho_d)}</td>
                      <td>{formatNumber(row?.delta0_used ?? row?.delta0)}</td>
                      <td>{formatNumber(row?.cbr25c ?? row?.cbr25)}</td>
                      <td>{formatNumber(row?.cbr50c ?? row?.cbr50)}</td>
                      <td>{formatNumber(row?.ipi)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )
      }}
    </RapportLaboShell>
  )
}
