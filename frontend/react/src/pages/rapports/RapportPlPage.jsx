import RapportTerrainShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportTerrainShell'
import { PL_EV2_EV1_NOTE, computePlResultats, unwrapPlPayload } from '@/lib/plEssai'

export default function RapportPlPage() {
  return (
    <RapportTerrainShell
      code="PL"
      subtitle="PORTANCE A LA PLAQUE"
      standardLabel="(NF P 94-117-1)"
      documentCode="DG-Q / RE PL"
      unwrapPayload={unwrapPlPayload}
      computePayload={computePlResultats}
    >
      {({ payload }) => {
        const rows = payload.points?.length ? payload.points : [{}]
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(payload.operateur)}</strong></div>
                  <div><span>Date essai :</span><strong>{valueOrEmpty(payload.date_essai)}</strong></div>
                  <div><span>Matériel :</span><strong>{valueOrEmpty(payload.materiel)}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>Partie d'ouvrage :</span><strong>{valueOrEmpty(payload.partie_ouvrage)}</strong></div>
                  <div><span>Nature du matériau :</span><strong>{valueOrEmpty(payload.nature_materiau)}</strong></div>
                  <div><span>Diamètre plaque :</span><strong>{valueOrEmpty(formatNumber(payload.diametre_plaque_mm))} mm</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-criteria">
              <h2>2/ <span>CRITERES DE CONFORMITE</span></h2>
              <div className="rapport-criteria-grid">
                <div><span>Source :</span><strong>{valueOrEmpty(payload.source_criteres)}</strong></div>
                <div><span>EV2 mini :</span><strong>{valueOrEmpty(formatNumber(payload.critere_ev2_min_mpa))} MPa</strong></div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>3/ <span>RESULTATS DES ESSAIS</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>N° essai</th>
                    <th>Localisation</th>
                    <th>EV1 (MPa)</th>
                    <th>EV2 (MPa)</th>
                    <th>EV2/EV1 (*)</th>
                    <th>Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id ?? index}>
                      <td>{valueOrEmpty(row.point_no || row.point)}</td>
                      <td>{valueOrEmpty(row.localisation)}</td>
                      <td>{formatNumber(row.ev1_mpa)}</td>
                      <td>{formatNumber(row.ev2_mpa)}</td>
                      <td>{formatNumber(row.rapport_ev2_ev1)}</td>
                      <td>{valueOrEmpty(row.observation)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}><strong>Moyennes</strong></td>
                    <td><strong>{formatNumber(payload.moyenne_ev1_mpa)}</strong></td>
                    <td><strong>{formatNumber(payload.moyenne_ev2_mpa)}</strong></td>
                    <td><strong>{formatNumber(payload.moyenne_rapport_ev2_ev1)}</strong></td>
                    <td><strong>{formatNumber(payload.taux_conformes_percent)} %</strong></td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] italic">(*) {PL_EV2_EV1_NOTE}</p>
            </section>
          </>
        )
      }}
    </RapportTerrainShell>
  )
}
