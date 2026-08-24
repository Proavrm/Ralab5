import RapportLaboShell, { formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'

export default function RapportVbsPage() {
  return (
    <RapportLaboShell code="VBS" subtitle="VALEUR DE BLEU DE METHYLENE" standardLabel="(NF P 94-068 / NF EN 933-9)" documentCode="DG-Q / RE VBS">
      {({ essai, res }) => (
        <section className="rapport-section rapport-section-results">
          <h2>1/ <span>RESULTATS</span></h2>
          <div className="rapport-general-grid">
            <div className="rapport-field-list">
              <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
              <div><span>Type :</span><strong>{valueOrEmpty(res?.type_materiau)}</strong></div>
              <div><span>Méthode :</span><strong>{valueOrEmpty(res?.methode)}</strong></div>
            </div>
            <div className="rapport-field-list">
              <div><span>VBS moyen :</span><strong>{valueOrEmpty(formatNumber(res?.vbs_moyen ?? res?.vb_moyen))}</strong></div>
              <div><span>w :</span><strong>{valueOrEmpty(formatNumber(res?.w))} %</strong></div>
            </div>
          </div>
        </section>
      )}
    </RapportLaboShell>
  )
}
