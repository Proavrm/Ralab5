import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'

export default function RapportMbPage() {
  return (
    <RapportLaboShell code="MB" subtitle="VALEUR AU BLEU 0/2 mm" standardLabel="(NF EN 933-9)" documentCode="DG-Q / RE MB">
      {({ essai, res }) => (
        <section className="rapport-section rapport-section-results">
          <h2>1/ <span>RESULTATS</span></h2>
          <div className="rapport-field-list">
            <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
            <div><span>MB :</span><strong>{valueOrEmpty(formatNumber(res?.mb))} g/kg</strong></div>
            <div><span>V1 :</span><strong>{valueOrEmpty(formatNumber(res?.v1))} mL</strong></div>
            <div><span>Ms :</span><strong>{valueOrEmpty(formatNumber(res?.ms))} g</strong></div>
          </div>
        </section>
      )}
    </RapportLaboShell>
  )
}
