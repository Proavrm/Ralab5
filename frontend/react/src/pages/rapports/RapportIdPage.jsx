import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import GtrGranuloChart from '@/components/essais/GtrGranuloChart'
import { buildGtrChartCalcs, computeIdResultats, hydricLabel, unwrapIdResultats } from '@/lib/gtrEssai'

function ClassBlock({ title, code, lines, steps }) {
  return (
    <div>
      <div className="rapport-field-list">
        <div><span>{title}</span><strong>{valueOrEmpty(code)}</strong></div>
        {lines.map((line) => (
          <div key={line.label}><span>{line.label} :</span><strong>{valueOrEmpty(line.value)}</strong></div>
        ))}
      </div>
      {steps?.length ? (
        <ol className="mt-2 list-decimal pl-4 text-[11px] leading-snug">
          {steps.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

export default function RapportIdPage() {
  return (
    <RapportLaboShell
      code="ID"
      subtitle="IDENTIFICATION GTR"
      standardLabel="(NF P 11-300 / EN 16907-2 / ISO 14688-2)"
      documentCode="DG-Q / RE ID"
    >
      {({ essai, res }) => {
        const computed = computeIdResultats(unwrapIdResultats(res))
        const ancienne = computed.gtr_ancienne || {}
        const nouvelle = computed.gtr_nouvelle || {}
        const euro = computed.eurocode || {}
        return (
          <>
            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>DESCRIPTION VISUELLE</span></h2>
              <p>{valueOrEmpty(computed.description_visuelle || essai?.designation)}</p>
            </section>
            <section className="rapport-section rapport-section-general">
              <h2>2/ <span>ESSAIS ASSOCIES</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                  <div><span>Wn :</span><strong>{valueOrEmpty(formatNumber(computed.wn))} %</strong></div>
                  <div><span>Dmax :</span><strong>{valueOrEmpty(formatNumber(computed.dmax))} mm</strong></div>
                  <div><span>P80 µm :</span><strong>{valueOrEmpty(formatNumber(computed.passant_80))} %</strong></div>
                  <div><span>P2 mm :</span><strong>{valueOrEmpty(formatNumber(computed.passant_2))} %</strong></div>
                  <div><span>P20 mm :</span><strong>{valueOrEmpty(formatNumber(computed.passant_20))} %</strong></div>
                  <div><span>P50 mm :</span><strong>{valueOrEmpty(formatNumber(computed.passant_50))} %</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>wL :</span><strong>{valueOrEmpty(formatNumber(computed.wl))} %</strong></div>
                  <div><span>wP :</span><strong>{valueOrEmpty(formatNumber(computed.wp))} %</strong></div>
                  <div><span>Ip :</span><strong>{valueOrEmpty(formatNumber(computed.ip))} %</strong></div>
                  <div><span>VBS :</span><strong>{valueOrEmpty(formatNumber(computed.vbs))}</strong></div>
                  <div><span>wOPN :</span><strong>{valueOrEmpty(formatNumber(computed.w_opn))} %</strong></div>
                  <div><span>ES :</span><strong>{valueOrEmpty(formatNumber(computed.es))}</strong></div>
                </div>
              </div>
            </section>
            <section className="rapport-section">
              <h2>3/ <span>GRANULOMETRIE GTR</span></h2>
              <GtrGranuloChart calcs={buildGtrChartCalcs(computed)} />
            </section>
            <section className="rapport-section rapport-section-results">
              <h2>4/ <span>CLASSIFICATIONS</span></h2>
              <div className="rapport-general-grid">
                <ClassBlock
                  title="GTR 1992 :"
                  code={ancienne.code || ancienne.classe}
                  lines={[
                    { label: 'Norme', value: 'NF P 11-300:1992' },
                    { label: 'Classe', value: ancienne.classe },
                    { label: 'Description', value: ancienne.description },
                    { label: 'État hydrique', value: ancienne.hydrique ? `${ancienne.hydrique} (${hydricLabel(ancienne.hydrique)})` : '' },
                  ]}
                  steps={ancienne.chemin}
                />
                <ClassBlock
                  title="GTR 2022 / EN 16907-2 :"
                  code={nouvelle.code}
                  lines={[
                    { label: 'Nature', value: nouvelle.nature },
                    { label: 'Description', value: nouvelle.description },
                    { label: 'Sensibilité à l’eau', value: nouvelle.sensibilite },
                  ]}
                  steps={nouvelle.chemin}
                />
              </div>
              <div className="mt-4">
                <ClassBlock
                  title="Eurocode 7 / ISO 14688-2 :"
                  code={euro.iso_14688}
                  lines={[
                    { label: 'Désignation', value: euro.description },
                    { label: 'Équivalent USCS', value: euro.uscs },
                  ]}
                  steps={euro.chemin}
                />
              </div>
            </section>
            {computed.commentaire ? (
              <section className="rapport-section">
                <h2>5/ <span>COMMENTAIRE</span></h2>
                <p>{computed.commentaire}</p>
              </section>
            ) : null}
          </>
        )
      }}
    </RapportLaboShell>
  )
}
