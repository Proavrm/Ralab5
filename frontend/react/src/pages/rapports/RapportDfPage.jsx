import RapportTerrainShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportTerrainShell'
import { DF_OUVRAGE_OPTIONS, computeDfResultats, unwrapDfPayload } from '@/lib/dfEssai'

export default function RapportDfPage() {
  return (
    <RapportTerrainShell
      code="DF"
      subtitle="DEFLEXIONS"
      standardLabel="(NF P 98-200-2)"
      documentCode="DG-Q / RE DF"
      unwrapPayload={unwrapDfPayload}
      computePayload={computeDfResultats}
    >
      {({ payload }) => {
        const rows = payload.points?.length ? payload.points : [{}]
        const ouvrageLabel = DF_OUVRAGE_OPTIONS
          .filter((option) => payload.ouvrage?.[option.key])
          .map((option) => (
            option.key === 'autres' && payload.ouvrage?.autres_libelle
              ? payload.ouvrage.autres_libelle
              : option.label
          ))
          .join(', ')
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(payload.operateur)}</strong></div>
                  <div><span>Date essai :</span><strong>{valueOrEmpty(payload.date_essai)}</strong></div>
                  <div><span>Matériel :</span><strong>{valueOrEmpty(payload.materiel)}</strong></div>
                  <div><span>Charge roulante :</span><strong>{valueOrEmpty(formatNumber(payload.charge_roulante_kn))} kN</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>Ouvrage :</span><strong>{valueOrEmpty(ouvrageLabel || payload.partie_ouvrage)}</strong></div>
                  <div><span>Section contrôlée :</span><strong>{valueOrEmpty(payload.section_controlee)}</strong></div>
                  <div><span>T surface :</span><strong>{valueOrEmpty(formatNumber(payload.temperature_surface_c))} °C</strong></div>
                  <div><span>Matériaux :</span><strong>{valueOrEmpty(payload.materiaux || payload.nature_materiau)}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section rapport-section-criteria">
              <h2>2/ <span>CRITERES DE CONFORMITE</span></h2>
              <div className="rapport-criteria-grid">
                <div><span>Source :</span><strong>{valueOrEmpty(payload.source_criteres)}</strong></div>
                <div><span>Déflexions ≥ :</span><strong>{valueOrEmpty(formatNumber(payload.critere_deflexion_100e_mm))} /100e mm</strong></div>
              </div>
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>3/ <span>RESULTATS DES ESSAIS</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>N° essai</th>
                    <th>N° profil</th>
                    <th>Gauche</th>
                    <th>Axe</th>
                    <th>Droite</th>
                    <th>Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id ?? index}>
                      <td>{valueOrEmpty(row.essai_no)}</td>
                      <td>{valueOrEmpty(row.profil)}</td>
                      <td>{formatNumber(row.gauche)}</td>
                      <td>{formatNumber(row.axe)}</td>
                      <td>{formatNumber(row.droite)}</td>
                      <td>{valueOrEmpty(row.observations)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}><strong>Moyennes</strong></td>
                    <td><strong>{formatNumber(payload.moyenne_gauche)}</strong></td>
                    <td><strong>{formatNumber(payload.moyenne_axe)}</strong></td>
                    <td><strong>{formatNumber(payload.moyenne_droite)}</strong></td>
                    <td><strong>{formatNumber(payload.taux_conformes_percent)} %</strong></td>
                  </tr>
                </tbody>
              </table>
            </section>
          </>
        )
      }}
    </RapportTerrainShell>
  )
}
