import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import DeFeuilleWorksheet from '@/components/de/DeFeuilleWorksheet'
import EssaiCorrectionBanner from '@/components/essais/EssaiCorrectionBanner'
import { applyDeComputedFields } from '@/lib/de/compute'
import {
  buildDeRuntimePayload,
  resolveDeDraftFromFeuille,
  toDeDraft,
} from '@/lib/de/runtime'
import { getFeuilleValidationInfo } from '@/lib/essaiValidation'
import { normalizePositionCodes } from '@/lib/positionCodes'
import { feuillesTerrainApi, qualiteApi } from '@/services/api'
import { WorksheetMain, WorksheetPageShell, WorksheetSubbar, WorksheetTopbar } from '@/components/layout/FicheLayout'

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function resolveFeuilleUid(paramsUid, searchParams) {
  const fromPath = String(paramsUid || '').trim()
  if (fromPath) return fromPath
  return String(searchParams.get('feuille_uid') || searchParams.get('source_uid') || '').trim()
}

export default function ModeleDEPage() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const uid = resolveFeuilleUid(params.uid, searchParams)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [feuilleRef, setFeuilleRef] = useState('')
  const [feuillePayload, setFeuillePayload] = useState({})
  const [feuilleData, setFeuilleData] = useState(null)
  const [draft, setDraft] = useState({ meta: {}, points_rows: [] })
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState('')
  const [deFeuilles, setDeFeuilles] = useState([])
  const [selectedFeuilleUid, setSelectedFeuilleUid] = useState(String(uid || ''))
  const [equipmentOptions, setEquipmentOptions] = useState([])
  const [equipmentLoading, setEquipmentLoading] = useState(false)
  const [equipmentError, setEquipmentError] = useState('')

  const returnToRaw = String(searchParams.get('return_to') || '').trim()
  const returnTo = returnToRaw || '/tools'

  const feuilleLinks = useMemo(() => ({
    interventionId: String(
      feuilleData?.intervention_id
      || feuillePayload?.intervention_id
      || '',
    ),
    demandeId: String(feuilleData?.demande_id || feuillePayload?.demande_id || ''),
    campagneId: String(
      feuilleData?.campagne_id
      || feuilleData?.campaign_id
      || feuillePayload?.campagne_id
      || feuillePayload?.campaign_id
      || '',
    ),
  }), [feuilleData, feuillePayload])

  const currentDraftSnapshot = useMemo(() => JSON.stringify(draft || {}), [draft])
  const hasUnsavedChanges = Boolean(savedDraftSnapshot) && currentDraftSnapshot !== savedDraftSnapshot
  const validationInfo = useMemo(
    () => getFeuilleValidationInfo({ payload: feuillePayload }),
    [feuillePayload],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        if (!uid) {
          throw new Error('Identifiant feuille DE manquant.')
        }
        const data = await feuillesTerrainApi.get(uid)
        if (cancelled) return
        if (String(data?.code_feuille || '').trim().toUpperCase() !== 'DE') {
          throw new Error('Cette feuille terrain n’est pas une feuille DE.')
        }
        const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {}
        const hydratedDraft = resolveDeDraftFromFeuille({ ...data, payload })
        setFeuilleData(data)
        setFeuilleRef(String(data?.reference || `#${uid}`))
        setFeuillePayload(payload)
        setDraft(hydratedDraft)
        setSavedDraftSnapshot(JSON.stringify(hydratedDraft))
        setSelectedFeuilleUid(String(uid))
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Impossible de charger la feuille DE.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [uid])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await feuillesTerrainApi.list({ limit: 400 })
        if (cancelled) return
        const filtered = (Array.isArray(rows) ? rows : [])
          .filter((row) => String(row?.code_feuille || '').trim().toUpperCase() === 'DE')
          .map((row) => ({
            uid: String(row?.uid || ''),
            reference: String(row?.reference || `#${row?.uid || ''}`),
          }))
        setDeFeuilles(filtered)
      } catch {
        if (!cancelled) setDeFeuilles([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setEquipmentLoading(true)
      setEquipmentError('')
      try {
        const rows = await qualiteApi.equipmentOptions.list({ usage: 'gammadensimetre_de' })
        const usageRows = Array.isArray(rows) ? rows : []
        const gammaTerms = ['gamma', 'gammadens', 'densim', 'densimetre', 'pqi', 'troxler', 'nucleaire']
        const equipmentRows = await qualiteApi.equipment.list().catch(() => [])
        const terrainRows = (Array.isArray(equipmentRows) ? equipmentRows : [])
          .filter((item) => String(item?.category || '').trim() === 'Terrain')
          .filter((item) => String(item?.status || '').trim() === 'En service')
          .filter((item) => {
            const searchable = normalizeSearchText([
              item?.code,
              item?.label,
              item?.domain,
              item?.serial_number,
              item?.notes,
            ].filter(Boolean).join(' '))
            return gammaTerms.some((term) => searchable.includes(term))
          })
          .map((item) => {
            const code = String(item?.code || '').trim()
            const label = String(item?.label || '').trim()
            const serial = String(item?.serial_number || '').trim()
            return {
              value: code || label || String(item?.uid || ''),
              label: code && label ? `${code} - ${label}${serial ? ` (${serial})` : ''}` : label || code || String(item?.uid || ''),
              equipment_id: item?.uid || null,
              calibration_date: item?.last_metrology || '',
              last_metrology: item?.last_metrology || '',
            }
          })
        const mergedByValue = new Map()
        for (const item of [...usageRows, ...terrainRows]) {
          const key = String(item?.value || '').trim().toUpperCase()
          if (!key) continue
          const current = mergedByValue.get(key)
          if (!current) {
            mergedByValue.set(key, item)
            continue
          }
          const currentCalib = String(current?.calibration_date || current?.last_metrology || '').trim()
          const nextCalib = String(item?.calibration_date || item?.last_metrology || '').trim()
          if (!currentCalib && nextCalib) mergedByValue.set(key, { ...current, ...item })
        }
        if (!cancelled) setEquipmentOptions(Array.from(mergedByValue.values()))
      } catch (e) {
        if (!cancelled) {
          setEquipmentOptions([])
          setEquipmentError(e?.message || 'Chargement des équipements impossible.')
        }
      } finally {
        if (!cancelled) setEquipmentLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    const runtimeValues = buildDeRuntimePayload(draft)
    try {
      const nextPayload = {
        ...(feuillePayload && typeof feuillePayload === 'object' ? feuillePayload : {}),
        ...runtimeValues,
      }
      await feuillesTerrainApi.update(uid, {
        payload: nextPayload,
        date_feuille: runtimeValues.meta?.date_essai || feuilleData?.date_feuille || '',
        operateur: runtimeValues.meta?.operateur || feuilleData?.operateur || '',
      })
      setFeuillePayload(nextPayload)
      const savedDraft = toDeDraft(runtimeValues)
      setDraft(savedDraft)
      setSavedDraftSnapshot(JSON.stringify(savedDraft))
      setResult({ type: 'ok', msg: 'Feuille DE enregistrée.' })
    } catch (e) {
      setResult({ type: 'err', msg: e?.message || 'Enregistrement impossible.' })
    }
  }

  function openReport() {
    const params = new URLSearchParams()
    params.set('mode', 'work')
    params.set('source_kind', 'feuille_terrain')
    params.set('source_family', 'terrain')
    params.set('source_uid', String(uid || ''))
    params.set('feuille_uid', String(uid || ''))
    if (feuilleLinks.demandeId) params.set('demande_id', feuilleLinks.demandeId)
    if (feuilleLinks.interventionId) params.set('intervention_id', feuilleLinks.interventionId)
    if (feuilleLinks.campagneId) params.set('campagne_id', feuilleLinks.campagneId)
    params.set('return_to', `/modeles/de/${encodeURIComponent(String(uid || ''))}`)
    navigate(`/rapports/de/view?${params.toString()}`)
  }

  function handleMetaChange(key, value) {
    setDraft((prev) => {
      const prevMeta = { ...(prev?.meta || {}) }
      const nextMeta = { ...prevMeta, [key]: value }
      if (key !== 'mvre') return { ...prev, meta: nextMeta }
      const rows = Array.isArray(prev?.points_rows) ? prev.points_rows : []
      const nextRows = rows.map((row) => applyDeComputedFields(row, value, 'mvre'))
      return { ...prev, meta: nextMeta, points_rows: nextRows }
    })
  }

  function handleRowChange(index, key, value) {
    setDraft((prev) => {
      const rows = Array.isArray(prev?.points_rows) ? [...prev.points_rows] : []
      const nextRow = {
        ...(rows[index] || {}),
        [key]: key === 'position_codes' ? normalizePositionCodes(value) : value,
      }
      rows[index] = applyDeComputedFields(nextRow, prev?.meta?.mvre, key)
      return { ...prev, points_rows: rows }
    })
  }

  function handleAddRow() {
    setDraft((prev) => ({
      ...prev,
      points_rows: [
        ...(Array.isArray(prev?.points_rows) ? prev.points_rows : []),
        {
          id: Date.now(),
          point: '',
          profil: '',
          position_codes: [],
          masse_volumique: '',
          compacite_pct: '',
          vides_pct: '',
          observations: '',
        },
      ],
    }))
  }

  function handleRemoveRow(index) {
    setDraft((prev) => ({
      ...prev,
      points_rows: (Array.isArray(prev?.points_rows) ? prev.points_rows : []).filter((_, idx) => idx !== index),
    }))
  }

  function goBack() {
    navigate(returnTo)
  }

  function navTarget(path, id) {
    const normalized = String(id || '').trim()
    return normalized ? `${path}/${encodeURIComponent(normalized)}` : ''
  }

  function renderContextButton(label, path, id) {
    const target = navTarget(path, id)
    const hasId = Boolean(target)
    return (
      <Button
        key={label}
        variant="secondary"
        size="sm"
        disabled={!hasId}
        onClick={() => (hasId ? navigate(target) : null)}
      >
        {label}
      </Button>
    )
  }

  function openCampaignContext() {
    const campaignId = String(feuilleLinks.campagneId || '').trim()
    if (!campaignId) return
    const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
    navigate(`/campagnes/${encodeURIComponent(campaignId)}${query}`)
  }

  function handleSwitchFeuille() {
    const nextUid = String(selectedFeuilleUid || '').trim()
    if (!nextUid || nextUid === String(uid || '')) return
    if (hasUnsavedChanges) {
      const proceed = window.confirm('Des changements ne sont pas enregistrés. Voulez-vous changer de feuille sans sauvegarder ?')
      if (!proceed) return
    }
    const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
    navigate(`/modeles/de/${encodeURIComponent(nextUid)}${query}`)
  }

  if (loading) {
    return (
      <WorksheetPageShell>
        <div className="py-10 text-center text-sm text-text-muted">Chargement feuille DE...</div>
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
        onBack={goBack}
        eyebrow="Feuille essai"
        title="Feuille DE"
        subtitle={feuilleRef || undefined}
      >
        <Button variant="primary" size="sm" onClick={handleSave}>Enregistrer</Button>
        <Button variant="secondary" size="sm" onClick={openReport}>Imprimer / Rapport</Button>
      </WorksheetTopbar>

      <WorksheetSubbar>
        <div className="flex min-w-[340px] flex-1 items-center gap-2 ml-auto">
          <select
            value={selectedFeuilleUid}
            onChange={(event) => setSelectedFeuilleUid(String(event.target.value || ''))}
            className="w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-nge"
          >
            <option value="">Sélectionner une référence DE…</option>
            {deFeuilles.map((row) => (
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
            onClick={openCampaignContext}
          >
            Campagne
          </Button>
        </div>
      </WorksheetSubbar>

      <WorksheetMain>
          <EssaiCorrectionBanner validation={validationInfo} essaiLabel="essai DE" />
          <DeFeuilleWorksheet
            norme={String(feuilleData?.norme || '').trim() || 'NF P 98-241-1'}
            draft={draft}
            equipmentOptions={equipmentOptions}
            equipmentLoading={equipmentLoading}
            equipmentError={equipmentError}
            onMetaChange={handleMetaChange}
            onRowChange={handleRowChange}
            onAddRow={handleAddRow}
            onRemoveRow={handleRemoveRow}
          />

          {result ? (
            <div className={`rounded-lg border px-3 py-2 text-xs ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
              {result.msg}
            </div>
          ) : null}
      </WorksheetMain>
    </WorksheetPageShell>
  )
}
