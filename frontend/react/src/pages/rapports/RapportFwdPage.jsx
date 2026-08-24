import RapportTerrainShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportTerrainShell'
import { computeFwdResultats, hydrateFwdPayload } from '@/lib/fwdEssai'

function conformityLabel(value) {
  if (value === 'conforme') return 'Conforme'
  if (value === 'non_conforme') return 'Non conforme'
  return 'Pour information'
}

export default function RapportFwdPage() {
  return (
    <RapportTerrainShell
      code="FWD"
      subtitle="FWD / DEFLEXIONS LOURDES"
      standardLabel=""
      documentCode="DG-Q / RE FWD"
      unwrapPayload={hydrateFwdPayload}
      computePayload={computeFwdResultats}
      conclusionFromPayload={(payload, feuille) => ({
        controlLabel: 'Contrôle',
        conformityLabel: conformityLabel(payload?.conclusion?.conformity),
        name: payload?.conclusion?.controller || payload?.header?.operator || feuille?.operateur || '',
        functionName: 'Technicien',
        comments: payload?.conclusion?.comments || '',
      })}
    >
      {({ payload }) => {
        const header = payload.header || {}
        const values = payload.values || {}
        const rows = payload.points?.length ? payload.points : [{}]
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(header.operator)}</strong></div>
                  <div><span>Date essai :</span><strong>{valueOrEmpty(header.test_date)}</strong></div>
                  <div><span>Site :</span><strong>{valueOrEmpty(header.site)}</strong></div>
                  <div><span>Zone :</span><strong>{valueOrEmpty(header.zone)}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>Intervention :</span><strong>{valueOrEmpty(header.intervention_ref)}</strong></div>
                  <div><span>Section contrôlée :</span><strong>{valueOrEmpty(header.controlled_section)}</strong></div>
                  <div><span>Météo :</span><strong>{valueOrEmpty(header.weather)}</strong></div>
                  <div><span>Équipement :</span><strong>{valueOrEmpty(values.equipment)}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-criteria">
              <h2>2/ <span>PARAMETRES ESSAI</span></h2>
              <div className="rapport-criteria-grid">
                <div><span>Charge :</span><strong>{valueOrEmpty(values.load_kg)} kg</strong></div>
                <div><span>Capteurs :</span><strong>{valueOrEmpty(values.sensor_type)}</strong></div>
                <div><span>Critère d max :</span><strong>{valueOrEmpty(formatNumber(values.criteria_deflexion_mm))} mm</strong></div>
                <div><span>d moyenne :</span><strong>{valueOrEmpty(formatNumber(payload.moyenne_deflexion_mm))} mm</strong></div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>3/ <span>RESULTATS PAR POINT</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>Point</th>
                    <th>PK / repère</th>
                    <th>d (mm)</th>
                    <th>T (°C)</th>
                    <th>Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id ?? index}>
                      <td>{valueOrEmpty(row.point_code)}</td>
                      <td>{valueOrEmpty(row.pk)}</td>
                      <td>{formatNumber(row.deflexion_mm)}</td>
                      <td>{formatNumber(row.temperature_c)}</td>
                      <td>{valueOrEmpty(row.observations)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )
      }}
    </RapportTerrainShell>
  )
}
