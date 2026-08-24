import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'

export default function RapportLcpPage() {
  return (
    <RapportLaboShell code="LCP" subtitle="LIMITES D'ATTERBERG" standardLabel="(NF P 94-051)" documentCode="DG-Q / RE LCP">
      {({ essai, res }) => (
        <section className="rapport-section rapport-section-results">
          <h2>1/ <span>RESULTATS</span></h2>
          <div className="rapport-general-grid">
            <div className="rapport-field-list">
              <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
              <div><span>wL :</span><strong>{valueOrEmpty(formatNumber(res?.wl))} %</strong></div>
              <div><span>wP :</span><strong>{valueOrEmpty(formatNumber(res?.wp))} %</strong></div>
            </div>
            <div className="rapport-field-list">
              <div><span>Ip :</span><strong>{valueOrEmpty(formatNumber(res?.ip))} %</strong></div>
              <div><span>Wn :</span><strong>{valueOrEmpty(formatNumber(res?.wnat))} %</strong></div>
            </div>
          </div>
        </section>
      )}
    </RapportLaboShell>
  )
}
