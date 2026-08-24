import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'

export default function RapportMbfPage() {
  return (
    <RapportLaboShell code="MBF" subtitle="VALEUR AU BLEU 0/0.125 mm" standardLabel="(NF EN 933-9)" documentCode="DG-Q / RE MBF">
      {({ essai, res }) => (
        <section className="rapport-section rapport-section-results">
          <h2>1/ <span>RESULTATS</span></h2>
          <div className="rapport-field-list">
            <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
            <div><span>MBF :</span><strong>{valueOrEmpty(formatNumber(res?.mbf))} g/kg</strong></div>
            <div><span>V1 :</span><strong>{valueOrEmpty(formatNumber(res?.v1))} mL</strong></div>
            <div><span>Ms :</span><strong>{valueOrEmpty(formatNumber(res?.ms))} g</strong></div>
          </div>
        </section>
      )}
    </RapportLaboShell>
  )
}
