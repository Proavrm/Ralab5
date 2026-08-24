import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import { feuillesTerrainApi } from '@/services/api'
import { resolveReturnTo } from '@/lib/detailNavigation'
import { useReportAutoPrint } from '@/lib/reportAutoPrint'
import '@/styles/rapport-nge.css'
import '@/styles/rapport-de.css'

export function valueOrEmpty(value) {
  if (value == null || String(value).trim() === '') return ''
  return String(value)
}

export function formatDateFr(value) {
  const raw = String(value || '').trim()
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return raw
}

export function formatNumber(value) {
  if (value == null || value === '') return ''
  const parsed = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(parsed)) return String(value)
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(parsed)
}

export default function RapportTerrainShell({
  code,
  subtitle,
  standardLabel,
  documentCode,
  unwrapPayload = (value) => value,
  computePayload = (value) => value,
  conclusionFromPayload,
  children,
}) {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const normalizedCode = String(code || '').trim().toUpperCase()
  const feuilleUid = String(
    params.essaiId
    || searchParams.get('feuille_uid')
    || searchParams.get('source_uid')
    || searchParams.get('essai_id')
    || '',
  ).trim()
  const returnTo = resolveReturnTo(
    searchParams,
    feuilleUid
      ? `/modeles/${normalizedCode.toLowerCase()}/${encodeURIComponent(feuilleUid)}`
      : `/modeles/${normalizedCode.toLowerCase()}`,
  )
  const [feuille, setFeuille] = useState(null)
  const [payload, setPayload] = useState({})
  const [loading, setLoading] = useState(Boolean(feuilleUid))
  const [error, setError] = useState('')

  useReportAutoPrint(searchParams)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!feuilleUid) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const loaded = await feuillesTerrainApi.get(feuilleUid)
        if (cancelled) return
        const raw = loaded?.payload && typeof loaded.payload === 'object' ? loaded.payload : {}
        const unwrapped = unwrapPayload(raw, { essaiId: feuilleUid, feuille: loaded })
        setFeuille(loaded)
        setPayload(computePayload(unwrapped))
      } catch (err) {
        if (cancelled) return
        setError(err?.message || `Impossible de charger le rapport ${normalizedCode}.`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [feuilleUid, normalizedCode])

  const headerDate = payload?.date_essai || payload?.header?.test_date || feuille?.date_feuille
  const siteTitle = payload?.partie_ouvrage
    || payload?.header?.site
    || payload?.header?.zone
    || payload?.section_controlee
    || ''
  const conclusion = conclusionFromPayload
    ? conclusionFromPayload(payload, feuille)
    : {
      controlLabel: 'Contrôle',
      conformityLabel: payload?.conclusion || 'À compléter',
      name: payload?.operateur || payload?.header?.operator || feuille?.operateur || '',
      functionName: 'Technicien',
      comments: typeof payload?.conclusion === 'string' ? payload.conclusion : (payload?.conclusion?.comments || ''),
    }

  return (
    <RapportPageShell
      toolbar={(
        <RapportToolbar
          reportReference={feuilleUid ? `${normalizedCode}-${feuilleUid}` : normalizedCode}
          feuilleTarget={returnTo}
        />
      )}
    >
      <div className="rapport-de-paper-stack">
        {loading ? <div className="rapport-de-inline-alert">Chargement du rapport {normalizedCode}…</div> : null}
        {error ? <div className="rapport-de-inline-alert rapport-de-inline-alert-warning">{error}</div> : null}
        <main className="rapport-page rapport-page-a4 rapport-de-page" id={`rapport-${normalizedCode.toLowerCase()}-printable`}>
          <div className="rapport-print-frame rapport-de-frame">
            <RapportHeader
              reportTypeLabel={`${normalizedCode} n°`}
              reportNumber={feuille?.reference || feuilleUid}
              chronoNumber={feuille?.reference || feuilleUid}
              affaireNumber={payload?.header?.affaire_ref || feuille?.affaire_ref || feuille?.demande_ref}
              editionDate={formatDateFr(headerDate)}
              siteTitle={siteTitle}
              subtitle={subtitle}
              standardLabel={standardLabel}
            />
            {typeof children === 'function' ? children({ feuille, payload }) : children}
            <RapportConclusionBlock
              controlLabel={conclusion.controlLabel || 'Contrôle'}
              conformityLabel={conclusion.conformityLabel || ''}
              name={conclusion.name || ''}
              functionName={conclusion.functionName || ''}
              comments={conclusion.comments || ''}
            />
            <RapportFooter documentCode={documentCode} />
          </div>
        </main>
      </div>
    </RapportPageShell>
  )
}
