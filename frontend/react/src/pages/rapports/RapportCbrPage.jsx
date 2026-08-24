import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'

export default function RapportCbrPage() {
  return (
    <RapportLaboShell code="CBR" subtitle="CBR APRES IMMERSION" standardLabel="(NF P 94-090-1)" documentCode="DG-Q / RE CBR">
      {({ essai, res }) => {
        const tests = Array.isArray(res?.tests) && res.tests.length ? res.tests : (res?.moules || [])
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-field-list">
                <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                <div><span>Mode :</span><strong>{valueOrEmpty(res?.mode || 'CBR')}</strong></div>
                <div><span>Proctor lié :</span><strong>{valueOrEmpty(res?.pn_uid)}</strong></div>
                <div><span>Surcharge (kg) :</span><strong>{valueOrEmpty(formatNumber(res?.surcharge_kg))}</strong></div>
                <div><span>Immersion (j) :</span><strong>{valueOrEmpty(formatNumber(res?.soak_days))}</strong></div>
                <div><span>CBR (%) :</span><strong>{valueOrEmpty(formatNumber(res?.cbr))}</strong></div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>MOULES</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Point PN</th>
                    <th>w (%)</th>
                    <th>ρd</th>
                    <th>Gonfl. (%)</th>
                    <th>CBR 2.5</th>
                    <th>CBR 5.0</th>
                    <th>CBR (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(tests.length ? tests : [{}]).map((row, index) => (
                    <tr key={row?.id ?? index} className={row?.actif === false ? 'opacity-50' : ''}>
                      <td>{row?.id || index + 1}</td>
                      <td>{valueOrEmpty(row?.pn_point_id)}</td>
                      <td>{formatNumber(row?.w_calc ?? row?.w ?? row?.pn_point_w)}</td>
                      <td>{formatNumber(row?.rho_d ?? row?.pn_point_rho_d)}</td>
                      <td>{formatNumber(row?.gonf)}</td>
                      <td>{formatNumber(row?.cbr25c ?? row?.cbr25)}</td>
                      <td>{formatNumber(row?.cbr50c ?? row?.cbr50)}</td>
                      <td>{formatNumber(row?.cbr)}</td>
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
