import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import { formatDateFr, formatNumber, valueOrEmpty } from '@/components/rapports/RapportLaboShell'
import { parseRes } from '@/components/essais/essaiFormUi'
import { resolveReturnTo } from '@/lib/detailNavigation'
import { resolveEssaiCodeFromRecord } from '@/lib/essaiFeuilleRoutes'
import { computeCaResultats, unwrapCaResultats } from '@/lib/caEssai'
import { computeIdResultats, unwrapIdResultats } from '@/lib/gtrEssai'
import { computeMoResultats, moBaseLabel, unwrapMoResultats } from '@/lib/moEssai'
import { computePhResultats, unwrapPhResultats } from '@/lib/phEssai'
import { TX_FRACTIONS, computeTxResultats, unwrapTxResultats } from '@/lib/txEssai'
import { useReportAutoPrint } from '@/lib/reportAutoPrint'
import { echantillonsApi, essaisApi } from '@/services/api'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-de.css'

const TV_CODES = ['ID', 'TX', 'PH', 'MO', 'CA']

function pickLatestByCode(essais = []) {
  const byCode = {}
  essais.forEach((essai) => {
    const code = resolveEssaiCodeFromRecord(essai)
    if (!TV_CODES.includes(code)) return
    const prev = byCode[code]
    if (!prev) {
      byCode[code] = essai
      return
    }
    const prevUid = Number(prev.uid || prev.id || 0)
    const nextUid = Number(essai.uid || essai.id || 0)
    if (nextUid >= prevUid) byCode[code] = essai
  })
  return byCode
}

function MissingNote({ code, label }) {
  return (
    <p className="text-[12px] italic text-text-muted">
      Essai {code} ({label}) non renseigné pour cet échantillon — section omise.
    </p>
  )
}

export default function RapportTvPage() {
  const [searchParams] = useSearchParams()
  const echantillonId = String(
    searchParams.get('echantillon_id')
      || searchParams.get('source_uid')
      || '',
  ).trim()
  const returnTo = resolveReturnTo(
    searchParams,
    echantillonId ? `/echantillons/${encodeURIComponent(echantillonId)}` : '/labo/workbench?tab=echantillons',
  )

  const [echantillon, setEchantillon] = useState(null)
  const [byCode, setByCode] = useState({})
  const [loading, setLoading] = useState(Boolean(echantillonId && /^\d+$/.test(echantillonId)))
  const [error, setError] = useState('')

  useReportAutoPrint(searchParams)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!echantillonId || !/^\d+$/.test(echantillonId)) {
        setLoading(false)
        setError('Identifiant d’échantillon manquant (echantillon_id).')
        return
      }
      setLoading(true)
      setError('')
      try {
        const [ech, essaisRaw] = await Promise.all([
          echantillonsApi.get(echantillonId),
          essaisApi.list({ echantillon_id: echantillonId }),
        ])
        if (cancelled) return
        const list = Array.isArray(essaisRaw) ? essaisRaw : (essaisRaw?.items || essaisRaw?.data || [])
        setEchantillon(ech)
        setByCode(pickLatestByCode(list))
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Impossible de charger le rapport regroupé TV.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [echantillonId])

  const idRes = useMemo(
    () => (byCode.ID ? computeIdResultats(unwrapIdResultats(parseRes(byCode.ID.resultats))) : null),
    [byCode.ID],
  )
  const txRes = useMemo(
    () => (byCode.TX ? computeTxResultats(unwrapTxResultats(parseRes(byCode.TX.resultats))) : null),
    [byCode.TX],
  )
  const phRes = useMemo(
    () => (byCode.PH ? computePhResultats(unwrapPhResultats(parseRes(byCode.PH.resultats))) : null),
    [byCode.PH],
  )
  const moRes = useMemo(
    () => (byCode.MO ? computeMoResultats(unwrapMoResultats(parseRes(byCode.MO.resultats))) : null),
    [byCode.MO],
  )
  const caRes = useMemo(
    () => (byCode.CA ? computeCaResultats(unwrapCaResultats(parseRes(byCode.CA.resultats))) : null),
    [byCode.CA],
  )

  const siteTitle = echantillon?.reference
    || echantillon?.designation
    || byCode.TX?.ech_ref
    || byCode.ID?.ech_ref
    || `Échantillon ${echantillonId || '—'}`

  return (
    <RapportPageShell
      toolbar={(
        <RapportToolbar
          reportReference={echantillonId ? `TV-${echantillonId}` : 'TV'}
          feuilleTarget={returnTo}
        />
      )}
    >
      <div className="rapport-de-paper-stack">
        {loading ? <div className="rapport-de-inline-alert">Chargement du rapport TV…</div> : null}
        {error ? <div className="rapport-de-inline-alert rapport-de-inline-alert-warning">{error}</div> : null}
        <main className="rapport-page rapport-page-a4 rapport-de-page" id="rapport-tv-printable">
          <div className="rapport-print-frame rapport-de-frame">
            <RapportHeader
              reportTypeLabel="TV n°"
              reportNumber={echantillon?.reference || echantillonId}
              sampleNumber={echantillon?.reference || echantillonId}
              affaireNumber={echantillon?.affaire_ref || echantillon?.affaire_reference || echantillon?.demande_ref}
              editionDate={formatDateFr(echantillon?.date_reception || echantillon?.created_at)}
              siteTitle={siteTitle}
              subtitle="TERRE VEGETALE / SUBSTRAT — RAPPORT REGROUPE"
              standardLabel="(identification, texture, pH, matière organique, calcaire actif)"
            />

            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>IDENTIFICATION</span></h2>
              {idRes ? (
                <div className="rapport-general-grid">
                  <div className="rapport-field-list">
                    <div><span>Description :</span><strong>{valueOrEmpty(idRes.description_visuelle || byCode.ID?.designation)}</strong></div>
                    <div><span>Opérateur ID :</span><strong>{valueOrEmpty(byCode.ID?.operateur)}</strong></div>
                    <div><span>Norme ID :</span><strong>{valueOrEmpty(byCode.ID?.norme)}</strong></div>
                  </div>
                  <div className="rapport-field-list">
                    <div><span>GTR 1992 :</span><strong>{valueOrEmpty(idRes.gtr_ancienne?.code || idRes.gtr_ancienne?.classe)}</strong></div>
                    <div><span>GTR 2022 :</span><strong>{valueOrEmpty(idRes.gtr_nouvelle?.code)}</strong></div>
                    <div><span>ISO 14688 :</span><strong>{valueOrEmpty(idRes.eurocode?.iso_14688)}</strong></div>
                  </div>
                </div>
              ) : (
                <MissingNote code="ID" label="Identification GTR" />
              )}
            </section>

            <section className="rapport-section rapport-section-results">
              <h2>2/ <span>TEXTURE (TX)</span></h2>
              {txRes ? (
                <>
                  <div className="rapport-field-list mb-3">
                    <div><span>Méthode :</span><strong>{valueOrEmpty(txRes.methode)}</strong></div>
                    <div><span>Norme :</span><strong>{valueOrEmpty(txRes.norme || byCode.TX?.norme)}</strong></div>
                  </div>
                  <table className="rapport-table">
                    <thead>
                      <tr>
                        <th>Fraction</th>
                        <th>Résultat (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TX_FRACTIONS.map((row) => (
                        <tr key={row.key}>
                          <td>{row.label}</td>
                          <td>{formatNumber(txRes[row.key])}</td>
                        </tr>
                      ))}
                      <tr>
                        <td><strong>Limons totaux</strong></td>
                        <td><strong>{formatNumber(txRes.limons_totaux)}</strong></td>
                      </tr>
                      <tr>
                        <td><strong>Sables totaux</strong></td>
                        <td><strong>{formatNumber(txRes.sables_totaux)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </>
              ) : (
                <MissingNote code="TX" label="Texture" />
              )}
            </section>

            <section className="rapport-section rapport-section-results">
              <h2>3/ <span>PHYSICO-CHIMIE</span></h2>
              <div className="rapport-general-grid">
                <div>
                  <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide">pH (PH)</h3>
                  {phRes ? (
                    <div className="rapport-field-list">
                      <div><span>Méthode :</span><strong>{valueOrEmpty(phRes.methode)}</strong></div>
                      <div><span>Norme :</span><strong>{valueOrEmpty(phRes.norme || byCode.PH?.norme)}</strong></div>
                      <div><span>pH eau :</span><strong>{valueOrEmpty(formatNumber(phRes.resultat ?? phRes.ph_eau))}</strong></div>
                      <div><span>pH KCl :</span><strong>{valueOrEmpty(formatNumber(phRes.ph_kcl_num ?? phRes.ph_kcl))}</strong></div>
                    </div>
                  ) : (
                    <MissingNote code="PH" label="pH" />
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide">Matière organique (MO)</h3>
                  {moRes ? (
                    <div className="rapport-field-list">
                      <div><span>Méthode :</span><strong>{valueOrEmpty(moRes.methode)}</strong></div>
                      <div><span>Norme :</span><strong>{valueOrEmpty(moRes.norme || byCode.MO?.norme)}</strong></div>
                      <div><span>Base :</span><strong>{moBaseLabel(moRes.base_resultat)}</strong></div>
                      <div><span>MO :</span><strong>{valueOrEmpty(formatNumber(moRes.mo_pct))} %</strong></div>
                    </div>
                  ) : (
                    <MissingNote code="MO" label="Matière organique" />
                  )}
                </div>
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide">Calcaire actif (CA)</h3>
                {caRes ? (
                  <div className="rapport-field-list">
                    <div><span>Méthode :</span><strong>{valueOrEmpty(caRes.methode)}</strong></div>
                    <div><span>Norme :</span><strong>{valueOrEmpty(caRes.norme || byCode.CA?.norme)}</strong></div>
                    <div><span>Calcaire actif :</span><strong>{valueOrEmpty(formatNumber(caRes.ca_pct))} %</strong></div>
                  </div>
                ) : (
                  <MissingNote code="CA" label="Calcaire actif" />
                )}
              </div>
            </section>

            <RapportConclusionBlock controlLabel="Contrôle" conformityLabel="À compléter" name="" functionName="" comments="" />
            <RapportFooter documentCode="DG-Q / RE TV" />
          </div>
        </main>
      </div>
    </RapportPageShell>
  )
}
