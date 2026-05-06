import React, { useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { feuillesTerrainApi, pmtEssaisApi } from '../../services/api'
import {
  getRuntimePublicationPMT,
  getWorkDocumentPMT,
  updateWorkDocumentPMT,
} from '../../services/pmtModelWorkStore'
import { buildPmtDraftFromPublication } from '../../lib/pmt/draft'
import { summarizePmtRows } from '../../lib/pmt/compute'
import { normalizePmtRuntimeValues } from '../../lib/pmt/normalize'
import { hasPositionCode, normalizePositionCodes, togglePositionCode } from '../../lib/positionCodes'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

function PositionSelector({ value, onChange }) {
  const codes = normalizePositionCodes(value)
  return (
    <div className="flex items-center gap-2">
      {['G', 'A', 'D'].map((code) => (
        <label key={code} className="inline-flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={hasPositionCode(codes, code)}
            onChange={() => onChange(togglePositionCode(codes, code))}
          />
          <span>{code}</span>
        </label>
      ))}
    </div>
  )
}

export default function FeuillePmtRuntimePage() {
  const navigate = useNavigate()
  const { uid = '', pmtId: pmtIdParam = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [publication, setPublication] = useState(null)
  const [runtimeDoc, setRuntimeDoc] = useState(null)
  const [runtimeDraft, setRuntimeDraft] = useState({ meta: {}, points_rows: [], resume: {} })
  const [feuillePayload, setFeuillePayload] = useState({})
  const [feuilleRef, setFeuilleRef] = useState('')
  const [feuilleLinks, setFeuilleLinks] = useState({
    demandeId: '',
    interventionId: '',
    campagneId: '',
  })
  /** ID canonique pmt_essais — enregistrement serveur uniquement via cette clé. */
  const [essaiPmtId, setEssaiPmtId] = useState('')
  const [terrainUid, setTerrainUid] = useState('')
  const returnTo = String(searchParams.get('return_to') || '').trim()
  const pmtIdFromQuery = String(searchParams.get('pmt_id') || '').trim()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        setEssaiPmtId('')
        setTerrainUid(uid ? String(uid) : '')

        const activePublication = getRuntimePublicationPMT()
        if (!activePublication?.work_document_id) {
          throw new Error('Aucune publication runtime PMT trouvée. Valide/associe d’abord dans Work PMT.')
        }
        const workDoc = getWorkDocumentPMT(activePublication.work_document_id)
        if (!workDoc) {
          throw new Error(`Document work PMT introuvable (${activePublication.work_document_id}).`)
        }

        setPublication(activePublication)
        setRuntimeDoc(workDoc)

        let resolvedPmtId = ''
        if (pmtIdParam) {
          resolvedPmtId = String(pmtIdParam)
        } else if (pmtIdFromQuery) {
          resolvedPmtId = pmtIdFromQuery
        } else if (uid) {
          const row = await feuillesTerrainApi.get(uid)
          if (cancelled) return
          const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {}
          setFeuillePayload(payload)
          setFeuilleRef(String(row?.reference || `#${uid}`))
          setFeuilleLinks({
            demandeId: String(row?.demande_id || payload?.demande_id || ''),
            interventionId: String(row?.intervention_id || payload?.intervention_id || ''),
            campagneId: String(row?.campagne_id || row?.campaign_id || payload?.campagne_id || payload?.campaign_id || ''),
          })
          resolvedPmtId = String(row?.source_essai_id || '').trim()
          const refForPmt = String(row?.reference || '').trim()
          if (!resolvedPmtId && /^\d{4}-SP-PMT\d+$/i.test(refForPmt)) {
            const byRef = await pmtEssaisApi.getByReference(refForPmt)
            if (cancelled) return
            resolvedPmtId = String(byRef?.id || '').trim()
          }
        } else {
          throw new Error('Ouvrez la feuille via une feuille terrain PMT ou /pmt-essais/:id/runtime.')
        }

        if (!resolvedPmtId) {
          throw new Error('Aucun essai PMT lié (source_essai_id ou référence PMT).')
        }

        const pmtData = await pmtEssaisApi.get(resolvedPmtId)
        if (cancelled) return

        setEssaiPmtId(String(pmtData.id))
        const fromPmt = normalizePmtRuntimeValues(pmtData.runtime_values || {})
        const fallback = buildPmtDraftFromPublication(activePublication, { values: workDoc.runtime_values })
        const hasPmtPoints = (fromPmt?.points_rows || []).some(
          (r) =>
            String(r?.point ?? '').trim() !== '' ||
            (r?.profondeur_macrotexture_mm !== '' &&
              r?.profondeur_macrotexture_mm != null &&
              r?.profondeur_macrotexture_mm !== undefined)
        )
        const sourceDraft = hasPmtPoints ? fromPmt : normalizePmtRuntimeValues(fallback)
        setRuntimeDraft(normalizePmtRuntimeValues(sourceDraft))
      } catch (e) {
        if (cancelled) return
        setError(e?.message || 'Impossible de charger la feuille PMT runtime.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uid, pmtIdParam, pmtIdFromQuery])

  const summary = useMemo(
    () => summarizePmtRows(runtimeDraft?.points_rows || [], runtimeDraft?.meta?.criteria_pmt_min),
    [runtimeDraft]
  )

  function handleMetaChange(key, value) {
    setRuntimeDraft((prev) => normalizePmtRuntimeValues({
      ...prev,
      meta: { ...(prev?.meta || {}), [key]: value },
    }))
  }

  function handleRowChange(index, key, value) {
    setRuntimeDraft((prev) => {
      const rows = Array.isArray(prev?.points_rows) ? [...prev.points_rows] : []
      rows[index] = { ...(rows[index] || {}), [key]: key === 'position_codes' ? normalizePositionCodes(value) : value }
      return normalizePmtRuntimeValues({ ...prev, points_rows: rows })
    })
  }

  function handleAddRow() {
    setRuntimeDraft((prev) => normalizePmtRuntimeValues({
      ...prev,
      points_rows: [...(Array.isArray(prev?.points_rows) ? prev.points_rows : []), { id: Date.now(), point: '', profil: '', position_codes: [], diametre_moyen_tache_mm: '', profondeur_macrotexture_mm: '', observation: '' }],
    }))
  }

  function handleRemoveRow(index) {
    setRuntimeDraft((prev) => normalizePmtRuntimeValues({
      ...prev,
      points_rows: (Array.isArray(prev?.points_rows) ? prev.points_rows : []).filter((_, idx) => idx !== index),
    }))
  }

  async function handleSaveRuntime() {
    if (!runtimeDoc?.id) return
    try {
      const runtimeValues = normalizePmtRuntimeValues({
        meta: runtimeDraft?.meta || {},
        points_rows: runtimeDraft?.points_rows || [],
      })
      const updatedDoc = updateWorkDocumentPMT(runtimeDoc.id, { runtime_values: runtimeValues })
      if (!updatedDoc) throw new Error('Mise à jour du document Work PMT impossible.')

      setRuntimeDoc(updatedDoc)

      if (essaiPmtId) {
        await pmtEssaisApi.putRuntimeValues(essaiPmtId, { runtime_values: runtimeValues })
        const refreshed = await pmtEssaisApi.get(essaiPmtId)
        setRuntimeDraft(normalizePmtRuntimeValues(refreshed?.runtime_values || runtimeValues))
      } else if (uid) {
        const nextPayload = {
          ...(feuillePayload && typeof feuillePayload === 'object' ? feuillePayload : {}),
          ...runtimeValues,
        }
        await feuillesTerrainApi.update(uid, { payload: nextPayload })
        setFeuillePayload(nextPayload)
        setRuntimeDraft(normalizePmtRuntimeValues(updatedDoc.runtime_values || runtimeValues))
      } else {
        setRuntimeDraft(normalizePmtRuntimeValues(updatedDoc.runtime_values || runtimeValues))
      }

      setResult({ type: 'ok', msg: essaiPmtId ? 'Essai PMT enregistré (base).' : 'Feuille PMT enregistrée.' })
    } catch (e) {
      setResult({ type: 'err', msg: e?.message || 'Impossible d’enregistrer.' })
    }
  }

  function openReport() {
    if (!publication) return
    const params = new URLSearchParams()
    params.set('mode', 'work')
    params.set('source_kind', 'work_doc')
    params.set('source_family', 'terrain')
    params.set('source_uid', String(terrainUid || essaiPmtId || ''))
    params.set('source_id', String(runtimeDoc?.id || ''))
    if (terrainUid) params.set('feuille_uid', String(terrainUid))
    if (essaiPmtId) params.set('pmt_essai_id', String(essaiPmtId))
    params.set('work_document_id', String(publication?.work_document_id || ''))
    if (feuilleLinks.demandeId) params.set('demande_id', feuilleLinks.demandeId)
    if (feuilleLinks.interventionId) params.set('intervention_id', feuilleLinks.interventionId)
    if (feuilleLinks.campagneId) params.set('campagne_id', feuilleLinks.campagneId)
    if (returnTo) params.set('return_to', returnTo)
    const target = `/rapports/pmt/view?${params.toString()}`
    navigate(target)
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-text-muted">Chargement feuille PMT...</div>
  }

  if (error) {
    return (
      <div className="rounded border border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d] px-3 py-2 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Feuille PMT Runtime</h1>
        <Button variant="secondary" size="sm" onClick={() => navigate(returnTo || '/tools')}>
          Retour
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-sm font-medium">Identification</div>
        <div className="text-xs text-text-muted mt-1 mb-3">
          {feuilleRef || (essaiPmtId ? `PMT #${essaiPmtId}` : '')}
          {essaiPmtId ? <span className="ml-2 text-text-muted">· Essai PMT #{essaiPmtId}</span> : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-text-muted">Date essai</label>
            <Input type="date" value={String(runtimeDraft?.meta?.date_essai || '')} onChange={(event) => handleMetaChange('date_essai', event.target.value)} />
          </div>
          <div>
            <label className="text-xs text-text-muted">Emplacement</label>
            <Input value={String(runtimeDraft?.meta?.emplacement || '')} onChange={(event) => handleMetaChange('emplacement', event.target.value)} />
          </div>
          <div>
            <label className="text-xs text-text-muted">Critère PMT min</label>
            <Input value={String(runtimeDraft?.meta?.criteria_pmt_min || '')} onChange={(event) => handleMetaChange('criteria_pmt_min', event.target.value)} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium">Points PMT</div>
          <Button variant="secondary" size="sm" onClick={handleAddRow}>+ Ajouter ligne</Button>
        </div>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[960px] text-xs">
            <thead className="bg-bg">
              <tr>
                <th className="px-2 py-2 text-left border-b border-border">Point</th>
                <th className="px-2 py-2 text-left border-b border-border">Profil</th>
                <th className="px-2 py-2 text-center border-b border-border">Position (G/A/D)</th>
                <th className="px-2 py-2 text-right border-b border-border">Diamètre (mm)</th>
                <th className="px-2 py-2 text-right border-b border-border">PMT (mm)</th>
                <th className="px-2 py-2 text-left border-b border-border">Observation</th>
                <th className="px-2 py-2 text-center border-b border-border">Action</th>
              </tr>
            </thead>
            <tbody>
              {(runtimeDraft?.points_rows || []).map((row, index) => (
                <tr key={row?.id || index} className="border-b border-border last:border-b-0">
                  <td className="px-2 py-1.5">
                    <Input value={String(row?.point || '')} onChange={(event) => handleRowChange(index, 'point', event.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={String(row?.profil || '')} onChange={(event) => handleRowChange(index, 'profil', event.target.value)} />
                  </td>
                  <td className="px-2 py-1.5 min-w-[130px]">
                    <PositionSelector value={row?.position_codes} onChange={(value) => handleRowChange(index, 'position_codes', value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={String(row?.diametre_moyen_tache_mm || '')} onChange={(event) => handleRowChange(index, 'diametre_moyen_tache_mm', event.target.value)} className="text-right" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={String(row?.profondeur_macrotexture_mm || '')} onChange={(event) => handleRowChange(index, 'profondeur_macrotexture_mm', event.target.value)} className="text-right" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input value={String(row?.observation || '')} onChange={(event) => handleRowChange(index, 'observation', event.target.value)} />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Button variant="danger" size="sm" onClick={() => handleRemoveRow(index)}>Supprimer</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="text-sm font-medium mb-2">Résumé calculé</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
          <div className="rounded border border-border p-2">Points: {summary?.points ?? 0}</div>
          <div className="rounded border border-border p-2">PMT moyenne: {summary?.profondeur_macrotexture_generale_mm ?? '-'}</div>
          <div className="rounded border border-border p-2">PMT min: {summary?.min_pmt_mm ?? '-'}</div>
          <div className="rounded border border-border p-2">Conformité: {summary?.pourcentage_valeurs_conformes ?? '-'}%</div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="primary" size="sm" onClick={handleSaveRuntime}>
          Enregistrer
        </Button>
        <Button variant="primary" size="sm" onClick={openReport} disabled={!publication}>
          Imprimer / Ouvrir rapport
        </Button>
      </div>

      {result ? (
        <div className={`rounded border px-3 py-2 text-sm ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
          {result.msg}
        </div>
      ) : null}
    </div>
  )
}
