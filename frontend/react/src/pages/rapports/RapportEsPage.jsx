import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import { ES_ECART_MAX, computeEsResultats, unwrapEsResultats } from '@/lib/esEssai'

export default function RapportEsPage() {
  return (
    <RapportLaboShell code="ES" subtitle="EQUIVALENT DE SABLE" standardLabel="(NF EN 933-8 / NF P 18-622-8)" documentCode="DG-Q / RE ES">
      {({ essai, res }) => {
        const computed = computeEsResultats(unwrapEsResultats(res))
        const labelSE = computed.type_materiau === 'sols' ? 'ES' : 'SE'
        const rows = computed.determinations.length ? computed.determinations : [{}]
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                  <div><span>Norme :</span><strong>{valueOrEmpty(essai?.norme)}</strong></div>
                  <div><span>Type :</span><strong>{computed.type_materiau === 'sols' ? 'Sols' : 'Granulats'}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>Nature du matériau :</span><strong>{valueOrEmpty(computed.nature_materiau)}</strong></div>
                  <div><span>{labelSE} P :</span><strong>{valueOrEmpty(formatNumber(computed.se_p))}</strong></div>
                  <div><span>{labelSE} V :</span><strong>{valueOrEmpty(formatNumber(computed.se_v))}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-criteria">
              <h2>2/ <span>CRITERES DE CONFORMITE</span></h2>
              <div className="rapport-criteria-grid">
                <div>
                  <span>Écart maximal entre prises :</span>
                  <strong>≤ {ES_ECART_MAX}</strong>
                </div>
                <div>
                  <span>Écart {labelSE} P mesuré :</span>
                  <strong>{valueOrEmpty(formatNumber(computed.ecart_p))}</strong>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>3/ <span>RESULTATS DES ESSAIS</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>Prise</th>
                    <th>Mh (g)</th>
                    <th>h1 (mm)</th>
                    <th>h2 (mm)</th>
                    <th>h′2 (mm)</th>
                    <th>{labelSE} P</th>
                    <th>{labelSE} V</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id ?? index} className={row.actif === false ? 'opacity-50' : ''}>
                      <td>{row.id || index + 1}</td>
                      <td>{formatNumber(row.mh)}</td>
                      <td>{formatNumber(row.h1)}</td>
                      <td>{formatNumber(row.h2)}</td>
                      <td>{formatNumber(row.h2v)}</td>
                      <td>{formatNumber(row.se_p)}</td>
                      <td>{formatNumber(row.se_v)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5}><strong>{labelSE} sur l'échantillon</strong></td>
                    <td><strong>{formatNumber(computed.se_p)}</strong></td>
                    <td><strong>{formatNumber(computed.se_v)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </section>
          </>
        )
      }}
    </RapportLaboShell>
  )
}
