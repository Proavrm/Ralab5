import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import { essaisApi } from '@/services/api'
import { resolveReturnTo } from '@/lib/detailNavigation'
import { parseEssaiResultats } from '@/lib/essaiFeuilleRoutes'
import { formatEnrobeProductLabel } from '@/lib/enrobeProductMeta'
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

function draftFromResultats(raw) {
  const parsed = parseEssaiResultats(raw)
  if (parsed?.worksheet_kind === 'el' && parsed.draft) return parsed.draft
  if (parsed?.draft) return parsed.draft
  return parsed || null
}

function computeStatus(draft) {
  const mini = Number(String(draft?.criteria?.liantMini || '').replace(',', '.'))
  const maxi = Number(String(draft?.criteria?.liantMaxi || '').replace(',', '.'))
  const mean = Number(String(draft?.moyenneExt || draft?.moyenne || '').replace(',', '.'))
  if (!Number.isFinite(mean)) return 'À compléter'
  if (Number.isFinite(mini) && mean < mini) return 'Non conforme'
  if (Number.isFinite(maxi) && mean > maxi) return 'Non conforme'
  if (Number.isFinite(mini) || Number.isFinite(maxi)) return 'Conforme'
  return 'À compléter'
}

export default function RapportElPage() {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const essaiId = String(params.essaiId || searchParams.get('essai_id') || searchParams.get('source_uid') || '').trim()
  const returnTo = resolveReturnTo(searchParams, essaiId ? `/modeles/el/${encodeURIComponent(essaiId)}` : '/modeles/el')
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(Boolean(essaiId && /^\d+$/.test(essaiId)))
  const [error, setError] = useState('')

  useReportAutoPrint(searchParams)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!essaiId || !/^\d+$/.test(essaiId)) {
        try {
          const raw = window.localStorage.getItem('ralab5:el:draft:new')
          setDraft(raw ? JSON.parse(raw) : null)
        } catch {
          setDraft(null)
        }
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const essai = await essaisApi.get(essaiId)
        if (cancelled) return
        setDraft(draftFromResultats(essai?.resultats))
      } catch (err) {
        if (cancelled) return
        setError(err?.message || 'Impossible de charger le rapport EL.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [essaiId])

  const product = draft?.product || {}
  const measures = Array.isArray(draft?.measures) ? draft.measures : []

  function meanOf(key) {
    const nums = measures
      .map((row) => Number(String(row?.[key] ?? '').replace(',', '.')))
      .filter((value) => Number.isFinite(value))
    if (!nums.length) return null
    return nums.reduce((sum, value) => sum + value, 0) / nums.length
  }

  const meanBinder = meanOf('teneurLiant')
  const meanBinderExt = meanOf('teneurLiantExt')
  const meanModule = meanOf('moduleRichesse')
  const status = useMemo(
    () => computeStatus({
      ...draft,
      moyenne: meanBinder,
      moyenneExt: Number.isFinite(meanBinderExt) ? meanBinderExt : meanBinder,
    }),
    [draft, meanBinder, meanBinderExt],
  )

  return (
    <RapportPageShell
      toolbar={(
        <RapportToolbar
          reportReference={essaiId ? `EL-${essaiId}` : 'EL'}
          feuilleTarget={returnTo}
        />
      )}
    >
      <div className="rapport-de-paper-stack">
        {loading ? <div className="rapport-de-inline-alert">Chargement du rapport EL…</div> : null}
        {error ? <div className="rapport-de-inline-alert rapport-de-inline-alert-warning">{error}</div> : null}
        <main className="rapport-page rapport-page-a4 rapport-de-page" id="rapport-el-printable">
          <div className="rapport-print-frame rapport-de-frame">
            <RapportHeader
              reportTypeLabel="EL n°"
              reportNumber={draft?.chronoNumber}
              chronoNumber={draft?.chronoNumber}
              affaireNumber={draft?.affairNumber}
              editionDate={formatDateFr(draft?.reportDate)}
              siteTitle={draft?.chantier || product.section_controlee}
              laboratory={draft?.laboratory}
              subtitle="EXTRACTION DE LIANT"
              standardLabel="(NF EN 12697-1)"
            />

            <section className="rapport-section rapport-section-general">
              <h2>1/ <span>RENSEIGNEMENTS GENERAUX</span></h2>
              <div className="rapport-general-grid">
                <div className="rapport-field-list">
                  <div><span>Opérateur :</span><strong>{valueOrEmpty(draft?.operateur)}</strong></div>
                  <div><span>Date de l'essai :</span><strong>{valueOrEmpty(formatDateFr(draft?.dateEssai))}</strong></div>
                  <div><span>Couche :</span><strong>{valueOrEmpty(product.couche)}</strong></div>
                  <div><span>Date de mise en œuvre :</span><strong>{valueOrEmpty(formatDateFr(product.date_mise_en_oeuvre))}</strong></div>
                  <div><span>Méthode d'essai :</span><strong>{valueOrEmpty(draft?.methodeEssai)}</strong></div>
                </div>
                <div className="rapport-field-list">
                  <div><span>Produit contrôlé :</span><strong>{valueOrEmpty(formatEnrobeProductLabel('produit_controle', product.produit_controle))}</strong></div>
                  <div><span>N° formule :</span><strong>{valueOrEmpty(formatEnrobeProductLabel('numero_formule', product.numero_formule))}</strong></div>
                  <div><span>Epaisseur de la couche :</span><strong>{valueOrEmpty(product.epaisseur_couche_cm)}</strong></div>
                  <div><span>Lieu de fabrication :</span><strong>{valueOrEmpty(formatEnrobeProductLabel('lieu_fabrication', product.lieu_fabrication))}</strong></div>
                  <div><span>Section contrôlée :</span><strong>{valueOrEmpty(product.section_controlee)}</strong></div>
                </div>
                <div className="rapport-field-full">
                  <span>Atelier de mise en œuvre :</span>
                  <strong>{valueOrEmpty(product.atelier_mise_en_oeuvre)}</strong>
                </div>
              </div>
            </section>

            <section className="rapport-section rapport-section-criteria">
              <h2>2/ <span>CRITERES DE CONFORMITE</span></h2>
              <div className="rapport-criteria-grid">
                <div>
                  <span>Source des critères :</span>
                  <strong>{valueOrEmpty(formatEnrobeProductLabel('criteria_source', draft?.criteria?.source))}</strong>
                </div>
                <div>
                  <span>Définition des critères / objectifs :</span>
                  <strong>
                    {valueOrEmpty(draft?.criteria?.liantMini)} <span className="rapport-inline-symbol">≤ % liant ≤</span> {valueOrEmpty(draft?.criteria?.liantMaxi)}
                  </strong>
                </div>
              </div>
            </section>

            <section className="rapport-section rapport-section-results">
              <h2>3/ <span>RESULTATS DES ESSAIS</span></h2>
              <table className="rapport-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Heure</th>
                    <th>Température (°C)</th>
                    <th>Prise (g)</th>
                    <th>Liant (%)</th>
                    <th>Liant extrait (%)</th>
                    <th>Module richesse</th>
                  </tr>
                </thead>
                <tbody>
                  {(measures.length ? measures : [{}]).map((row, index) => (
                    <tr key={row.id || index}>
                      <td>{row.numero || index + 1}</td>
                      <td>{valueOrEmpty(row.heure)}</td>
                      <td>{formatNumber(row.temperature)}</td>
                      <td>{formatNumber(row.massePrise)}</td>
                      <td>{formatNumber(row.teneurLiant)}</td>
                      <td>{formatNumber(row.teneurLiantExt)}</td>
                      <td>{formatNumber(row.moduleRichesse)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4}><strong>Moyenne</strong></td>
                    <td><strong>{formatNumber(meanBinder)}</strong></td>
                    <td><strong>{formatNumber(Number.isFinite(meanBinderExt) ? meanBinderExt : '')}</strong></td>
                    <td><strong>{formatNumber(Number.isFinite(meanModule) ? meanModule : '')}</strong></td>
                  </tr>
                </tbody>
              </table>
            </section>

            <RapportConclusionBlock
              controlLabel={draft?.conclusion?.controlLabel || 'Contrôle'}
              conformityLabel={status}
              name={draft?.conclusion?.name}
              functionName={draft?.conclusion?.functionName}
              comments={draft?.conclusion?.comments}
            />
            <RapportFooter documentCode="DG-Q / RE EL" />
          </div>
        </main>
      </div>
    </RapportPageShell>
  )
}
