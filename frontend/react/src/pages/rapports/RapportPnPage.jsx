import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import { calcPNPoint } from '@/lib/pnEssai'

export default function RapportPnPage() {
  return (
    <RapportLaboShell code="PN" subtitle="ESSAI PROCTOR" standardLabel="(NF P 94-093)" documentCode="DG-Q / RE PN">
      {({ essai, res }) => {
        const points = Array.isArray(res?.points) ? res.points : []
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                  <div><span>Type :</span><strong>{res?.type_proctor === 'modifie' ? 'Proctor Modifié' : 'Proctor Normal'}</strong></div>
                  <div><span>Moule :</span><strong>{valueOrEmpty(res?.moule_ref || res?.moule_preset)}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>M moule (g) :</span><strong>{valueOrEmpty(formatNumber(res?.m_moule))}</strong></div>
                  <div><span>V moule (cm³) :</span><strong>{valueOrEmpty(formatNumber(res?.v_moule))}</strong></div>
                  <div><span>Gs fins :</span><strong>{valueOrEmpty(formatNumber(res?.gs_fin))}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>RESULTATS</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>wOPN (%) :</span><strong>{valueOrEmpty(formatNumber(res?.wOPN))}</strong></div>
                  <div><span>ρdOPN (Mg/m³) :</span><strong>{valueOrEmpty(formatNumber(res?.rho_d_OPN))}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>wOPN corr. 0/D :</span><strong>{valueOrEmpty(formatNumber(res?.wOPN_corr))}</strong></div>
                  <div><span>ρdOPN corr. :</span><strong>{valueOrEmpty(formatNumber(res?.rho_d_OPN_corr))}</strong></div>
                </div>
              </div>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>Pt</th>
                    <th>w (%)</th>
                    <th>M tot (g)</th>
                    <th>ρh</th>
                    <th>ρd</th>
                  </tr>
                </thead>
                <tbody>
                  {(points.length ? points : [{}]).map((row, index) => {
                    const calc = calcPNPoint(row || {}, res?.m_moule, res?.v_moule)
                    return (
                      <tr key={row?.id ?? index} className={row?.actif === false ? 'opacity-50' : ''}>
                        <td>{row?.id || index + 1}</td>
                        <td>{formatNumber(calc.w)}</td>
                        <td>{formatNumber(row?.m_tot)}</td>
                        <td>{formatNumber(calc.rho_h)}</td>
                        <td>{formatNumber(calc.rho_d)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          </>
        )
      }}
    </RapportLaboShell>
  )
}
