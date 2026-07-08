import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import { useReportAutoPrint } from '@/lib/reportAutoPrint'
import { readTerrainDraft } from '@/lib/terrainEssaiDraft'
import { getTerrainEssaiConfig } from '@/lib/terrainEssaiConfigs'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-de.css'

function valueOrDash(value) {
  if (value == null || String(value).trim() === '') return '-'
  return String(value)
}

export default function TerrainEssaiRapportPage({ code: codeProp = 'FWD' }) {
  const [searchParams] = useSearchParams()
  const code = String(searchParams.get('essai_code') || codeProp || 'FWD').toUpperCase()
  const essaiId = String(searchParams.get('essai_id') || 'draft').trim()
  const config = useMemo(() => getTerrainEssaiConfig(code), [code])
  const draft = useMemo(() => readTerrainDraft(code, essaiId), [code, essaiId])
  useReportAutoPrint(searchParams)

  if (!config) {
    return <div className="p-8 text-center">Rapport `{code}` indisponible.</div>
  }

  const header = draft.header || {}

  return (
    <RapportPageShell
      toolbar={<RapportToolbar reportReference={`${config.code}-${essaiId}`} />}
    >
      <RapportHeader
        reportTypeLabel={`${config.code} n°`}
        reportNumber={header.intervention_ref || essaiId}
        affaireNumber={header.affaire_ref}
        editionDate={header.test_date}
        siteTitle={header.site || header.zone}
        mainTitle={`COMPTE RENDU D'ESSAI ${config.code}`}
        subtitle={config.label}
      />

      <section className="rapport-section">
        <h2 className="rapport-section-title">Informations générales</h2>
        <div className="rapport-grid-2">
          <div><strong>Demande</strong><div>{valueOrDash(header.demande_ref)}</div></div>
          <div><strong>Campagne</strong><div>{valueOrDash(header.campagne_ref)}</div></div>
          <div><strong>Intervention</strong><div>{valueOrDash(header.intervention_ref)}</div></div>
          <div><strong>Opérateur</strong><div>{valueOrDash(header.operator)}</div></div>
          <div><strong>Zone</strong><div>{valueOrDash(header.zone)}</div></div>
          <div><strong>Météo</strong><div>{valueOrDash(header.weather)}</div></div>
          <div><strong>Section contrôlée</strong><div>{valueOrDash(header.controlled_section)}</div></div>
        </div>
      </section>

      <section className="rapport-section">
        <h2 className="rapport-section-title">Paramètres essai</h2>
        <div className="rapport-grid-2">
          {config.valueFields.map((field) => (
            <div key={field.key}>
              <strong>{field.label}</strong>
              <div>{valueOrDash(draft.values?.[field.key])}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rapport-section">
        <h2 className="rapport-section-title">Résultats par point</h2>
        {(draft.points || []).length ? (
          <table className="rapport-table">
            <thead>
              <tr>
                {config.pointColumns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.points.map((point, index) => (
                <tr key={`rapport-point-${index}`}>
                  {config.pointColumns.map((col) => (
                    <td key={col.key}>{valueOrDash(point[col.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Aucun point saisi.</p>
        )}
      </section>

      <RapportConclusionBlock
        controlLabel="Contrôle"
        conformityLabel={
          draft.conclusion?.conformity === 'conforme'
            ? 'Conforme'
            : draft.conclusion?.conformity === 'non_conforme'
              ? 'Non conforme'
              : 'Pour information'
        }
        name={draft.conclusion?.controller || header.operator}
        functionName="Technicien"
        comments={draft.conclusion?.comments || ''}
      />

      <RapportFooter documentCode={`RAP-${config.code}`} />
    </RapportPageShell>
  )
}
