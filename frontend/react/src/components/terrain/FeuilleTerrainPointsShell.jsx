import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import EssaiCorrectionBanner from '@/components/essais/EssaiCorrectionBanner'
import { getFeuilleValidationInfo } from '@/lib/essaiValidation'
import { resolveReturnTo } from '@/lib/detailNavigation'
import { feuillesTerrainApi } from '@/services/api'
import { WorksheetMain, WorksheetPageShell, WorksheetSubbar, WorksheetTopbar } from '@/components/layout/FicheLayout'

function resolveFeuilleUid(paramsUid, searchParams) {
  const fromPath = String(paramsUid || '').trim()
  if (fromPath && fromPath !== 'new') return fromPath
  return String(searchParams.get('feuille_uid') || searchParams.get('source_uid') || '').trim()
}

export default function FeuilleTerrainPointsShell({
  code,
  title,
  subtitle = '',
  defaultNorme = '',
  Form,
  initialPayload = {},
  serializePayload = (value) => value,
  unwrapPayload = (value) => value,
  heroFromPayload,
}) {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const normalizedCode = String(code || '').trim().toUpperCase()
  const routeBase = `/modeles/${normalizedCode.toLowerCase()}`
  const uid = resolveFeuilleUid(params.uid, searchParams)
  const interventionId = Number.parseInt(searchParams.get('intervention_id') || '', 10)
  const hasIntervention = Number.isInteger(interventionId) && interventionId > 0
  const returnTo = resolveReturnTo(searchParams, hasIntervention ? `/interventions/${interventionId}` : '/tools')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [feuilleData, setFeuilleData] = useState(null)
  const [payload, setPayload] = useState(initialPayload)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [siblings, setSiblings] = useState([])
  const [selectedFeuilleUid, setSelectedFeuilleUid] = useState(String(uid || ''))

  const currentSnapshot = useMemo(() => JSON.stringify(payload || {}), [payload])
  const hasUnsavedChanges = Boolean(savedSnapshot) && currentSnapshot !== savedSnapshot
  const validationInfo = useMemo(
    () => getFeuilleValidationInfo({ payload, ...(feuilleData || {}) }),
    [feuilleData, payload],
  )
  const hero = heroFromPayload ? heroFromPayload(payload) : null
  const feuilleRef = String(feuilleData?.reference || (uid ? `#${uid}` : ''))
  const feuilleLinks = useMemo(() => ({
    interventionId: String(feuilleData?.intervention_id || payload?.intervention_id || interventionId || ''),
    demandeId: String(feuilleData?.demande_id || payload?.demande_id || ''),
    campagneId: String(
      feuilleData?.campagne_id
      || feuilleData?.campaign_id
      || payload?.campagne_id
      || payload?.campaign_id
      || '',
    ),
  }), [feuilleData, payload, interventionId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        if (!uid && hasIntervention) {
          const created = await feuillesTerrainApi.create({
            intervention_id: interventionId,
            code_feuille: normalizedCode,
            label: title,
            date_feuille: searchParams.get('test_date') || searchParams.get('date_feuille') || '',
            operateur: searchParams.get('operateur') || searchParams.get('operator') || '',
          })
          const nextUid = created?.uid ?? created?.id
          if (!nextUid) throw new Error('Feuille terrain créée sans identifiant.')
          if (cancelled) return
          const query = new URLSearchParams()
          if (returnTo) query.set('return_to', returnTo)
          navigate(`${routeBase}/${encodeURIComponent(String(nextUid))}${query.toString() ? `?${query}` : ''}`, { replace: true })
          return
        }
        if (!uid) {
          setFeuilleData(null)
          setPayload(serializePayload(unwrapPayload(initialPayload)))
          setSavedSnapshot('')
          setLoading(false)
          return
        }
        const data = await feuillesTerrainApi.get(uid)
        if (cancelled) return
        if (String(data?.code_feuille || '').trim().toUpperCase() !== normalizedCode) {
          throw new Error(`Cette feuille terrain n’est pas une feuille ${normalizedCode}.`)
        }
        const loadedPayload = data?.payload && typeof data.payload === 'object' ? data.payload : {}
        const hydrated = serializePayload(unwrapPayload(loadedPayload, { essaiId: String(uid), feuille: data }))
        setFeuilleData(data)
        setPayload(hydrated)
        setSavedSnapshot(JSON.stringify(hydrated || {}))
        setSelectedFeuilleUid(String(uid))
      } catch (err) {
        if (!cancelled) setError(err?.message || `Impossible de charger la feuille ${normalizedCode}.`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [uid, hasIntervention, interventionId, normalizedCode])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await feuillesTerrainApi.list({ limit: 400, code_feuille: normalizedCode })
        if (cancelled) return
        setSiblings((Array.isArray(rows) ? rows : []).map((row) => ({
          uid: String(row?.uid || ''),
          reference: String(row?.reference || `#${row?.uid || ''}`),
        })))
      } catch {
        if (!cancelled) setSiblings([])
      }
    })()
    return () => { cancelled = true }
  }, [normalizedCode])

  async function handleSave() {
    if (!uid) {
      setResult({ type: 'err', msg: 'Créez cette feuille depuis une intervention pour l’enregistrer.' })
      return
    }
    setSaving(true)
    try {
      const nextPayload = serializePayload(payload)
      await feuillesTerrainApi.update(uid, {
        payload: nextPayload,
        date_feuille: nextPayload.date_essai || nextPayload.header?.test_date || feuilleData?.date_feuille || '',
        operateur: nextPayload.operateur || nextPayload.header?.operator || feuilleData?.operateur || '',
      })
      setPayload(nextPayload)
      setSavedSnapshot(JSON.stringify(nextPayload || {}))
      setResult({ type: 'ok', msg: `Feuille ${normalizedCode} enregistrée.` })
    } catch (err) {
      setResult({ type: 'err', msg: err?.message || 'Enregistrement impossible.' })
    } finally {
      setSaving(false)
    }
  }

  function openReport() {
    if (!uid) return
    const query = new URLSearchParams()
    query.set('mode', 'work')
    query.set('source_kind', 'feuille_terrain')
    query.set('source_family', 'terrain')
    query.set('source_uid', String(uid))
    query.set('feuille_uid', String(uid))
    if (feuilleLinks.demandeId) query.set('demande_id', feuilleLinks.demandeId)
    if (feuilleLinks.interventionId) query.set('intervention_id', feuilleLinks.interventionId)
    if (feuilleLinks.campagneId) query.set('campagne_id', feuilleLinks.campagneId)
    query.set('return_to', `${routeBase}/${encodeURIComponent(String(uid))}`)
    navigate(`/rapports/${normalizedCode.toLowerCase()}/view?${query.toString()}`)
  }

  function navTarget(path, id) {
    const normalized = String(id || '').trim()
    return normalized ? `${path}/${encodeURIComponent(normalized)}` : ''
  }

  function renderContextButton(label, path, id) {
    const target = navTarget(path, id)
    return (
      <Button
        key={label}
        variant="secondary"
        size="sm"
        disabled={!target}
        onClick={() => (target ? navigate(target) : null)}
      >
        {label}
      </Button>
    )
  }

  function handleSwitchFeuille() {
    const nextUid = String(selectedFeuilleUid || '').trim()
    if (!nextUid || nextUid === String(uid || '')) return
    if (hasUnsavedChanges) {
      const proceed = window.confirm('Des changements ne sont pas enregistrés. Voulez-vous changer de feuille sans sauvegarder ?')
      if (!proceed) return
    }
    const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
    navigate(`${routeBase}/${encodeURIComponent(nextUid)}${query}`)
  }

  if (loading) {
    return (
      <WorksheetPageShell>
        <div className="py-10 text-center text-sm text-text-muted">Chargement feuille {normalizedCode}...</div>
      </WorksheetPageShell>
    )
  }

  if (error) {
    return (
      <WorksheetPageShell>
        <div className="mx-auto max-w-[1280px] px-6 py-6">
          <div className="rounded-lg border border-[#f0a0a0] bg-[#fcebeb] px-4 py-3 text-sm text-[#a32d2d]">
            {error}
          </div>
        </div>
      </WorksheetPageShell>
    )
  }

  return (
    <WorksheetPageShell>
      <WorksheetTopbar
        backLabel="← Retour"
        onBack={() => navigate(returnTo)}
        eyebrow="Feuille essai"
        title={title || `Feuille ${normalizedCode}`}
        subtitle={feuilleRef || subtitle || defaultNorme || undefined}
      >
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !uid}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button variant="secondary" size="sm" onClick={openReport} disabled={!uid}>Imprimer / Rapport</Button>
      </WorksheetTopbar>

      <WorksheetSubbar>
        <div className="flex min-w-[340px] flex-1 items-center gap-2 ml-auto">
          <select
            value={selectedFeuilleUid}
            onChange={(event) => setSelectedFeuilleUid(String(event.target.value || ''))}
            className="w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-nge"
          >
            <option value="">Sélectionner une référence {normalizedCode}…</option>
            {siblings.map((row) => (
              <option key={row.uid} value={row.uid}>
                {row.reference}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSwitchFeuille}
            disabled={!selectedFeuilleUid || selectedFeuilleUid === String(uid || '')}
          >
            Ouvrir
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {renderContextButton('Demande', '/demandes', feuilleLinks.demandeId)}
          {renderContextButton('Intervention', '/interventions', feuilleLinks.interventionId)}
          <Button
            variant="secondary"
            size="sm"
            disabled={!feuilleLinks.campagneId}
            onClick={() => {
              const campaignId = String(feuilleLinks.campagneId || '').trim()
              if (!campaignId) return
              const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
              navigate(`/campagnes/${encodeURIComponent(campaignId)}${query}`)
            }}
          >
            Campagne
          </Button>
        </div>
      </WorksheetSubbar>

      <WorksheetMain>
        {!uid ? (
          <div className="rounded-lg border border-[#dbe1ea] bg-white px-4 py-3 text-sm text-text-muted">
            Feuille {normalizedCode} non enregistrée. Ouvrez une référence existante ou créez-la depuis une intervention.
          </div>
        ) : null}
        <EssaiCorrectionBanner validation={validationInfo} essaiLabel={`essai ${normalizedCode}`} />
        {hero?.value != null ? (
          <div className="w-fit rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
            <div className="text-[26px] font-bold leading-none text-[#3b6d11]">{hero.value}</div>
            <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">{hero.label}</div>
          </div>
        ) : null}
        {Form ? (
          <Form
            res={payload}
            onChange={setPayload}
            readOnly={!uid}
            norme={String(feuilleData?.norme || '').trim() || defaultNorme}
          />
        ) : null}
        {result ? (
          <div className={`rounded-lg border px-3 py-2 text-xs ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
            {result.msg}
          </div>
        ) : null}
      </WorksheetMain>
    </WorksheetPageShell>
  )
}
