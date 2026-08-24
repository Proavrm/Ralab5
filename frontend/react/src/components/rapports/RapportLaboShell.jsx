import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import RapportConclusionBlock from '@/components/rapports/RapportConclusionBlock'
import RapportFooter from '@/components/rapports/RapportFooter'
import RapportHeader from '@/components/rapports/RapportHeader'
import RapportToolbar from '@/components/rapports/RapportToolbar'
import RapportPageShell from '@/components/rapports/RapportPageShell'
import { parseRes } from '@/components/essais/essaiFormUi'
import { essaisApi } from '@/services/api'
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
  const num = Number(String(value).replace(',', '.'))
  if (!Number.isFinite(num)) return String(value)
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(num)
}

export default function RapportLaboShell({
  code,
  subtitle,
  standardLabel,
  documentCode,
  children,
}) {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const essaiId = String(params.essaiId || searchParams.get('essai_id') || searchParams.get('source_uid') || '').trim()
  const returnTo = resolveReturnTo(searchParams, essaiId ? `/modeles/${code.toLowerCase()}/${encodeURIComponent(essaiId)}` : `/modeles/${code.toLowerCase()}`)
  const [essai, setEssai] = useState(null)
  const [res, setRes] = useState({})
  const [loading, setLoading] = useState(Boolean(essaiId && /^\d+$/.test(essaiId)))
  const [error, setError] = useState('')

  useReportAutoPrint(searchParams)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!essaiId || !/^\d+$/.test(essaiId)) {
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const loaded = await essaisApi.get(essaiId)
        if (cancelled) return
        setEssai(loaded)
        setRes(parseRes(loaded?.resultats))
      } catch (err) {
        if (cancelled) return
        setError(err?.message || `Impossible de charger le rapport ${code}.`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [essaiId, code])

  return (
    <RapportPageShell
      toolbar={(
        <RapportToolbar
          reportReference={essaiId ? `${code}-${essaiId}` : code}
          feuilleTarget={returnTo}
        />
      )}
    >
      <div className="rapport-de-paper-stack">
        {loading ? <div className="rapport-de-inline-alert">Chargement du rapport {code}…</div> : null}
        {error ? <div className="rapport-de-inline-alert rapport-de-inline-alert-warning">{error}</div> : null}
        <main className="rapport-page rapport-page-a4 rapport-de-page" id={`rapport-${code.toLowerCase()}-printable`}>
          <div className="rapport-print-frame rapport-de-frame">
            <RapportHeader
              reportTypeLabel={`${code} n°`}
              reportNumber={essai?.reference || essaiId}
              chronoNumber={essai?.reference || essaiId}
              affaireNumber={essai?.affaire_ref || essai?.affaire_reference || essai?.demande_ref}
              editionDate={formatDateFr(essai?.date_debut)}
              siteTitle={essai?.ech_ref || essai?.echantillon_reference || essai?.designation}
              subtitle={subtitle}
              standardLabel={standardLabel}
            />
            {typeof children === 'function' ? children({ essai, res }) : children}
            <RapportConclusionBlock controlLabel="Contrôle" conformityLabel="À compléter" name="" functionName="" comments="" />
            <RapportFooter documentCode={documentCode} />
          </div>
        </main>
      </div>
    </RapportPageShell>
  )
}
