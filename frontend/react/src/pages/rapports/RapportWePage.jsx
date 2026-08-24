import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import { essaisApi } from '@/services/api'
import { resolveReturnTo } from '@/lib/detailNavigation'
import { computeWeDraft, unwrapWeResultats, weMethodeLabel, weUsageLabel } from '@/lib/weEssai'
import { useReportAutoPrint } from '@/lib/reportAutoPrint'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-de.css'

function valueOrEmpty(value) {
  if (value == null || String(value).trim() === '') return ''
  return String(value)
}

function formatDateFr(value) {
  const raw = String(value || '').trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return raw
}

function formatNumber(value) {
  if (value == null || value === '') return ''
  const num = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(num)) return String(value)
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(num)
}

export default function RapportWePage() {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const essaiId = String(params.essaiId || searchParams.get('essai_id') || searchParams.get('source_uid') || '').trim()
  const returnTo = resolveReturnTo(searchParams, essaiId ? `/modeles/we/${encodeURIComponent(essaiId)}` : '/modeles/we')
  const [we, setWe] = useState(null)
  const [essai, setEssai] = useState(null)
  const [loading, setLoading] = useState(Boolean(essaiId && /^\d+$/.test(essaiId)))
  const [error, setError] = useState('')

  useReportAutoPrint(searchParams)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!essaiId || !/^\d+$/.test(essaiId)) {
        setWe(unwrapWeResultats({}))
        setEssai(null)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const loaded = await essaisApi.get(essaiId)
        if (cancelled) return
        setEssai(loaded)
        setWe(unwrapWeResultats(loaded?.resultats))
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Impossible de charger le rapport WE.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [essaiId])

  const computed = useMemo(() => computeWeDraft(we || {}), [we])
  const status = computed.conforme === true
    ? 'Conforme'
    : computed.conforme === false
      ? 'Non conforme'
      : 'À compléter'

  return (
    <RapportPageShell
      toolbar={(
        <RapportToolbar
          reportReference={essaiId ? `WE-${essaiId}` : 'WE'}
          feuilleTarget={returnTo}
        />
      )}
    >
      <div className="rapport-de-paper-stack">
        {loading ? <div className="rapport-de-inline-alert">Chargement du rapport WE…</div> : null}
        {error ? <div className="rapport-de-inline-alert rapport-de-inline-alert-warning">{error}</div> : null}
        <main className="rapport-page rapport-page-a4 rapport-de-page" id="rapport-we-printable">
          <div className="rapport-print-frame rapport-de-frame">
            <RapportHeader
              reportTypeLabel="WE n°"
              reportNumber={essai?.reference || essaiId}
              chronoNumber={essai?.reference || essaiId}
              affaireNumber={essai?.affaire_ref || essai?.affaire_reference || essai?.demande_ref || essai?.demande_reference}
              editionDate={formatDateFr(essai?.date_debut)}
              siteTitle={essai?.ech_ref || essai?.echantillon_reference || essai?.designation}
              subtitle="TENEUR EN EAU PONDERALE"
              standardLabel={`(${weMethodeLabel(we?.methode) || essai?.norme || 'NF P 94-050'})`}
            />

            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(essai?.operateur)}</strong></div>
                  <div><span>Date de l'essai :</span><strong>{valueOrEmpty(formatDateFr(essai?.date_debut))}</strong></div>
                  <div><span>Date de fin :</span><strong>{valueOrEmpty(formatDateFr(essai?.date_fin))}</strong></div>
                  <div><span>Usage :</span><strong>{valueOrEmpty(weUsageLabel(we?.usage))}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>Échantillon :</span><strong>{valueOrEmpty(essai?.ech_ref || essai?.echantillon_reference)}</strong></div>
                  <div><span>Désignation :</span><strong>{valueOrEmpty(essai?.designation)}</strong></div>
                  <div><span>Méthode :</span><strong>{valueOrEmpty(weMethodeLabel(we?.methode) || essai?.norme)}</strong></div>
                  <div><span>Type :</span><strong>{valueOrEmpty(essai?.type_essai)}</strong></div>
                </div>
              </div>
            </section>

            <section className="rapport-section rapport-section-criteria">
              <h2>2/ <span>CRITERES DE CONFORMITE</span></h2>
              <div className="rapport-criteria-grid">
                <div>
                  <span>Écart maximal entre déterminations :</span>
                  <strong>≤ 1,0 %</strong>
                </div>
                <div>
                  <span>Écart mesuré :</span>
                  <strong>{valueOrEmpty(formatNumber(computed.ecart))}</strong>
                </div>
              </div>
            </section>

            <section className="rapport-section rapport-section-results">
              <h2>3/ <span>RESULTATS DES ESSAIS</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Boîte</th>
                    <th>M1 (g)</th>
                    <th>M2 (g)</th>
                    <th>M3 (g)</th>
                    <th>M eau (g)</th>
                    <th>M sol sec (g)</th>
                    <th>w (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {(computed.determinations.length ? computed.determinations : [{}]).map((row, index) => (
                    <tr key={row.id || index} className={row.actif === false ? 'opacity-50' : ''}>
                      <td>{row.id || index + 1}</td>
                      <td>{valueOrEmpty(row.boite)}</td>
                      <td>{formatNumber(row.m1)}</td>
                      <td>{formatNumber(row.m2)}</td>
                      <td>{formatNumber(row.m3)}</td>
                      <td>{formatNumber(row.m_eau)}</td>
                      <td>{formatNumber(row.m_sol_sec)}</td>
                      <td>{formatNumber(row.w)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={7}><strong>Moyenne ({computed.nbDet || 0} det.)</strong></td>
                    <td><strong>{formatNumber(computed.wMoyen)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </section>

            <RapportConclusionBlock
              controlLabel="Contrôle"
              conformityLabel={status}
              name=""
              functionName=""
              comments=""
            />
            <RapportFooter documentCode="DG-Q / RE WE" />
          </div>
        </main>
      </div>
    </RapportPageShell>
  )
}
