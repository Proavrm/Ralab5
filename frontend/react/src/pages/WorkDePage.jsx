import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { essaisApi, feuillesTerrainApi } from '@/services/api'
import {
  createWorkDocumentDEFromModel,
  deleteWorkDocumentDE,
  findWorkDocumentDEBySourceEssaiUid,
  findWorkDocumentDEBySourceTerrainUid,
  getRapportModelDefinitionDEById,
  getWorkDocumentDE,
  listApprovedModelDefinitionsDE,
  listApprovedRapportModelDefinitionsDE,
  listWorkDocumentsDE,
  publishRuntimeDE,
  WORK_STATUS_DE,
  updateWorkDocumentDE,
} from '@/services/modelWorkLocalStore'

// NOTE (2026-05-01):
// This page is intentionally DE-only for now (selection/association/validation/publication).
// Keep the workflow rules generic because this same orchestration will be reused for other essai types.

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('fr-FR')
}

function toDraft(values = {}) {
  return {
    meta: values?.meta && typeof values.meta === 'object' ? { ...values.meta } : {},
    points_rows: Array.isArray(values?.points_rows)
      ? values.points_rows.map((row, index) => ({ ...row, id: row?.id ?? index + 1 }))
      : [],
  }
}

export default function WorkDePage() {
  // NOTE (2026-05-01):
  // Work DE is the managerial gate: select approved model, associate approved rapport,
  // validate, then publish the runtime package consumed by the technician page.
  // Current implementation is DE-specific by design; orchestration is intended to be reused per essai type.
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [models, setModels] = useState(() => listApprovedModelDefinitionsDE())
  const [rapportModels, setRapportModels] = useState(() => listApprovedRapportModelDefinitionsDE())
  const [documents, setDocuments] = useState(() => listWorkDocumentsDE())
  const selectedDocId = searchParams.get('doc') || ''
  const selectedModelId = searchParams.get('model') || ''
  const essaiUidParam = searchParams.get('essai_uid') || ''
  const sourceFamily = String(searchParams.get('source_family') || '').trim().toLowerCase()
  const sourceUidParam = searchParams.get('source_uid') || ''

  const selectedDocument = useMemo(() => {
    if (!selectedDocId) return null
    return getWorkDocumentDE(selectedDocId)
  }, [selectedDocId, documents])

  const selectedModel = useMemo(() => {
    if (!selectedModelId) return models[0] || null
    return models.find((item) => String(item.id) === String(selectedModelId)) || null
  }, [selectedModelId, models])

  const [runtimeDraft, setRuntimeDraft] = useState(() => toDraft(selectedDocument?.runtime_values || {}))
  const [result, setResult] = useState(null)
  const selectedRapportModelId = useMemo(() => String(selectedDocument?.rapport_model_definition_id || ''), [selectedDocument])
  const linkedRapportModel = useMemo(
    () => getRapportModelDefinitionDEById(selectedRapportModelId),
    [selectedRapportModelId, rapportModels]
  )

  const hasRapportLinkedToDocument = Boolean(selectedDocument?.rapport_model_definition_id) && linkedRapportModel?.status === 'approved'
  const workStatus = selectedDocument?.work_status || WORK_STATUS_DE.DRAFT
  const mustChooseModel = models.length > 1 && !selectedModelId
  const returnTo = String(searchParams.get('return_to') || '').trim()
  const backPath = returnTo || '/tools#feuilles-preparation'

  function updateSearch(next = {}) {
    const params = new URLSearchParams(searchParams)
    Object.entries(next).forEach(([key, value]) => {
      if (value == null || value === '') params.delete(key)
      else params.set(key, String(value))
    })
    setSearchParams(params)
  }

  function parseEssaiResultats(essai) {
    const raw = essai?.resultats
    if (raw && typeof raw === 'object') return raw
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch { return {} }
    }
    return {}
  }

  function parseTerrainPayload(terrain) {
    const payload = terrain?.payload
    if (payload && typeof payload === 'object') return payload
    return {}
  }

  function refreshAll(nextDocId = selectedDocId) {
    setModels(listApprovedModelDefinitionsDE())
    setRapportModels(listApprovedRapportModelDefinitionsDE())
    setDocuments(listWorkDocumentsDE())
    if (nextDocId) {
      const fresh = getWorkDocumentDE(nextDocId)
      setRuntimeDraft(toDraft(fresh?.runtime_values || {}))
    }
  }

  useEffect(() => {
    if (!essaiUidParam) return
    if (selectedDocId) return
    const existing = findWorkDocumentDEBySourceEssaiUid(essaiUidParam)
    if (existing?.id) {
      updateSearch({
        doc: existing.id,
        model: existing.model_definition_id || '',
      })
      return
    }
    setResult({ type: 'ok', msg: 'Sélectionne un modèle approuvé, puis clique sur "Créer document depuis modèle".' })
  }, [essaiUidParam, selectedDocId])

  useEffect(() => {
    if (sourceFamily !== 'terrain' || !sourceUidParam) return
    if (selectedDocId) return
    const existing = findWorkDocumentDEBySourceTerrainUid(sourceUidParam)
    if (existing?.id) {
      updateSearch({
        doc: existing.id,
        model: existing.model_definition_id || '',
      })
      return
    }
    setResult({ type: 'ok', msg: 'Sélectionne un modèle approuvé, puis clique sur "Créer document depuis modèle".' })
  }, [sourceFamily, sourceUidParam, selectedDocId])

  function handleAssociateRapport(rapportModelId) {
    if (!selectedDocId) {
      setResult({ type: 'err', msg: 'Sélectionne d’abord un document de travail.' })
      return
    }
    const rapportModel = getRapportModelDefinitionDEById(rapportModelId)
    if (!rapportModel || rapportModel.status !== 'approved') {
      setResult({ type: 'err', msg: 'Le rapport sélectionné doit être approuvé.' })
      return
    }
    const updated = updateWorkDocumentDE(selectedDocId, {
      rapport_model_definition_id: rapportModel.id,
      rapport_model_version: rapportModel.schema_version,
    })
    if (!updated) {
      setResult({ type: 'err', msg: 'Impossible d’associer le rapport.' })
      return
    }
    refreshAll(selectedDocId)
    setResult({ type: 'ok', msg: `Rapport associé: ${rapportModel.reference || rapportModel.id}` })
  }

  function handleClearRapportAssociation() {
    if (!selectedDocId) return
    const updated = updateWorkDocumentDE(selectedDocId, {
      rapport_model_definition_id: '',
      rapport_model_version: '',
    })
    if (!updated) return
    refreshAll(selectedDocId)
    setResult({ type: 'ok', msg: 'Association du rapport supprimée.' })
  }

  async function handleCreateFromModel() {
    if (mustChooseModel) {
      setResult({ type: 'err', msg: 'Escolhe primeiro o modelo aprovado a usar.' })
      return
    }
    if (!selectedModel) {
      setResult({ type: 'err', msg: 'Aucun modèle DE approuvé disponible.' })
      return
    }
    try {
      const created = createWorkDocumentDEFromModel(selectedModel)
      const autoRapport = rapportModels[0] || null
      let nextRuntime = created.runtime_values || {}
      let extra = {}

      if (sourceFamily === 'terrain' && sourceUidParam) {
        const terrain = await feuillesTerrainApi.get(sourceUidParam)
        nextRuntime = parseTerrainPayload(terrain)
        extra = {
          source_terrain_uid: Number(sourceUidParam),
          source_essai_uid: terrain?.source_essai_id ?? null,
        }
      } else if (essaiUidParam) {
        const essai = await essaisApi.get(essaiUidParam)
        nextRuntime = parseEssaiResultats(essai)
        extra = {
          source_essai_uid: Number(essaiUidParam),
        }
      }

      if (autoRapport?.id) {
        updateWorkDocumentDE(created.id, {
          ...extra,
          runtime_values: nextRuntime,
          rapport_model_definition_id: autoRapport.id,
          rapport_model_version: autoRapport.schema_version,
        })
      } else {
        updateWorkDocumentDE(created.id, {
          ...extra,
          runtime_values: nextRuntime,
        })
      }

      updateSearch({ doc: String(created.id), model: String(selectedModel.id) })
      const freshCreated = getWorkDocumentDE(created.id) || created
      setRuntimeDraft(toDraft(freshCreated.runtime_values || {}))
      refreshAll(created.id)
      setResult({
        type: 'ok',
        msg: autoRapport?.id
          ? `Document créé (${created.id}) avec modèle et rapport approuvés associés.`
          : `Document créé (${created.id}) com modelo aprovado. Falta associar um rapport aprovado.`,
      })
    } catch (e) {
      setResult({ type: 'err', msg: e?.message || 'Impossible de créer le document depuis le modèle sélectionné.' })
    }
  }

  function handleDeleteDocument(docId) {
    const id = String(docId || '')
    if (!id) return
    if (!window.confirm(`Supprimer le document ${id} ?`)) return
    const ok = deleteWorkDocumentDE(id)
    if (!ok) {
      setResult({ type: 'err', msg: 'Impossible de supprimer le document.' })
      return
    }
    const nextDoc = documents.find((item) => String(item.id) !== id)
    if (String(selectedDocId) === id) {
      updateSearch({
        doc: nextDoc?.id || '',
        model: nextDoc?.model_definition_id || '',
      })
      setRuntimeDraft(toDraft(nextDoc?.runtime_values || {}))
    }
    refreshAll(nextDoc?.id || '')
    setResult({ type: 'ok', msg: `Document supprimé: ${id}.` })
  }

  function handleChangeWorkStatus(nextStatus) {
    if (!selectedDocId) {
      setResult({ type: 'err', msg: 'Sélectionne un document avant de changer de statut.' })
      return
    }
    const nowIso = new Date().toISOString()
    const payload = { work_status: nextStatus }
    if (nextStatus === WORK_STATUS_DE.DRAFT) {
      payload.reviewed_at = null
      payload.validated_at = null
      payload.validated_by = ''
    }
    if (nextStatus === WORK_STATUS_DE.IN_REVIEW && !selectedDocument?.reviewed_at) {
      payload.reviewed_at = nowIso
    }
    if (nextStatus === WORK_STATUS_DE.VALIDATED) {
      payload.validated_at = nowIso
      if (!selectedDocument?.reviewed_at) payload.reviewed_at = nowIso
    }
    const updated = updateWorkDocumentDE(selectedDocId, payload)
    if (!updated) {
      setResult({ type: 'err', msg: 'Impossible de mettre à jour le statut.' })
      return
    }
    if (nextStatus === WORK_STATUS_DE.VALIDATED) {
      if (!updated?.rapport_model_definition_id) {
        setResult({ type: 'err', msg: 'Validation enregistrée, mas sem rapport associado para publicação runtime.' })
        refreshAll(selectedDocId)
        return
      }
      const publishedModel = models.find((item) => String(item.id) === String(updated.model_definition_id)) || null
      const publishedRapport = getRapportModelDefinitionDEById(updated.rapport_model_definition_id) || null
      // NOTE:
      // Publication stores explicit snapshots so runtime executes a fixed approved version.
      // This "snapshot publish" mechanism should become generic (per code/type), not DE-only.
      const published = publishRuntimeDE({
        work_document_id: updated.id,
        model_definition_id: updated.model_definition_id,
        rapport_model_definition_id: updated.rapport_model_definition_id,
        model_snapshot: publishedModel ? {
          id: publishedModel.id,
          reference: publishedModel.reference || '',
          schema_version: publishedModel.schema_version,
          values: publishedModel.values && typeof publishedModel.values === 'object' ? publishedModel.values : {},
        } : null,
        rapport_snapshot: publishedRapport ? {
          id: publishedRapport.id,
          reference: publishedRapport.reference || '',
          schema_version: publishedRapport.schema_version,
          template: publishedRapport.template && typeof publishedRapport.template === 'object' ? publishedRapport.template : {},
        } : null,
      })
      if (!published) {
        setResult({ type: 'err', msg: 'Validation enregistrée, mas publication runtime falhou.' })
        refreshAll(selectedDocId)
        return
      }
      refreshAll(selectedDocId)
      setResult({ type: 'ok', msg: 'Statut validé et runtime DE global publicado.' })
      return
    }
    refreshAll(selectedDocId)
    setResult({ type: 'ok', msg: `Statut mis à jour: ${nextStatus}.` })
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 py-3">
      <div className="sticky top-2 z-20 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate(backPath)}>
              ← Retour
            </Button>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">Work DE</div>
              <div className="truncate text-[14px] font-semibold text-text">
                {selectedDocId ? `Document ${selectedDocId}` : 'Feuille de travail DE'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => refreshAll(selectedDocId)}>
              Actualiser
            </Button>
          </div>
        </div>
      </div>

      {selectedDocId && !hasRapportLinkedToDocument ? (
        <div className="rounded-lg border border-[#f1d2a4] bg-[#fff4e5] px-4 py-3 text-sm text-[#8a5c11]">
          Rapport DE não associado ou não aprovado. Pode continuar a preencher a folha, mas a impressão está desativada.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text">Nouveau document de travail</h2>
          <p className="mt-1 text-xs text-text-muted">
            Crée un document runtime à partir du dernier modèle DE approuvé.
          </p>
          <Button className="mt-3" variant="primary" onClick={handleCreateFromModel} disabled={!selectedModel}>Créer document depuis modèle</Button>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-text-muted">Modèle approuvé</label>
            <select
              value={selectedModelId || ''}
              onChange={(e) => updateSearch({ model: e.target.value || '' })}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {!selectedModelId ? <option value="">Sélectionner un modèle…</option> : null}
              {models.map((model) => (
                <option key={model.id} value={String(model.id)}>
                  {model.reference || model.id}
                </option>
              ))}
            </select>
            {mustChooseModel ? (
              <div className="mt-1 text-xs text-[#8a5c11]">Choix obligatoire car plusieurs modèles sont approuvés.</div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text">Documents de travail DE</h2>
          <p className="mt-1 text-xs text-text-muted">{documents.length} document(s)</p>
          <div className="mt-3 flex flex-col gap-2 max-h-[260px] overflow-auto">
            {documents.length ? documents.map((doc) => (
              <div
                key={doc.id}
                className={`rounded-lg border px-3 py-2 text-xs ${String(selectedDocId) === String(doc.id) ? 'border-accent bg-bg' : 'border-border bg-surface'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateSearch({ doc: String(doc.id), model: String(doc.model_definition_id || '') })
                      setRuntimeDraft(toDraft(doc.runtime_values || {}))
                    }}
                    className="flex-1 text-left"
                  >
                    {(() => {
                      const modelRef = models.find((item) => String(item.id) === String(doc.model_definition_id))?.reference
                      const rapportRef = rapportModels.find((item) => String(item.id) === String(doc.rapport_model_definition_id))?.reference
                      return (
                        <>
                          <div className="font-semibold text-text">{doc.id}</div>
                          <div className="text-text-muted">
                            modèle: {modelRef || doc.model_definition_id || 'introuvable'}
                            {modelRef ? '' : ' (id technique)'}
                          </div>
                          <div className="text-text-muted">
                            rapport: {doc.rapport_model_definition_id ? (rapportRef || doc.rapport_model_definition_id) : 'sem rapport'}
                            {doc.rapport_model_definition_id && !rapportRef ? ' (id technique)' : ''}
                          </div>
                          <div className="text-text-muted">
                            criado: {formatDateTime(doc.created_at)} · atualizado: {formatDateTime(doc.updated_at)}
                          </div>
                        </>
                      )
                    })()}
                  </button>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteDocument(doc.id)}>✕</Button>
                </div>
              </div>
            )) : <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-text-muted">Aucun document de travail.</div>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Rapport DE associado ao documento</h2>
        <div className="mt-2 text-xs text-text-muted">
          {selectedDocId
            ? linkedRapportModel
              ? `Associé: ${linkedRapportModel.reference || linkedRapportModel.id} (v${selectedDocument?.rapport_model_version || linkedRapportModel.schema_version})`
              : 'Sem rapport associado.'
            : 'Selecione um documento de trabalho para associar rapport.'}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
          {rapportModels.length ? rapportModels.map((rapport) => (
            <button
              key={rapport.id}
              type="button"
              onClick={() => handleAssociateRapport(rapport.id)}
              disabled={!selectedDocId}
              className={`rounded-lg border px-3 py-2 text-left text-xs ${String(linkedRapportModel?.id) === String(rapport.id) ? 'border-accent bg-bg' : 'border-border bg-surface'} disabled:opacity-60`}
            >
              <div className="font-semibold text-text">{rapport.reference || rapport.id}</div>
              <div className="text-text-muted">v{rapport.schema_version} · {rapport.status}</div>
            </button>
          )) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-text-muted">
              Nenhum rapport DE aprovado disponível.
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleClearRapportAssociation} disabled={!selectedDocId || !linkedRapportModel}>
            Remover associação
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text">Relecture / validation</h2>
        <div className="mt-2 text-xs text-text-muted">
          Statut actuel: <span className="font-semibold text-text">{workStatus}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-text-muted">
            Relu par
            <Input
              value={selectedDocument?.reviewed_by || ''}
              onChange={(e) => {
                if (!selectedDocId) return
                updateWorkDocumentDE(selectedDocId, { reviewed_by: e.target.value })
                refreshAll(selectedDocId)
              }}
              disabled={!selectedDocId}
            />
          </label>
          <label className="text-xs text-text-muted">
            Validé par
            <Input
              value={selectedDocument?.validated_by || ''}
              onChange={(e) => {
                if (!selectedDocId) return
                updateWorkDocumentDE(selectedDocId, { validated_by: e.target.value })
                refreshAll(selectedDocId)
              }}
              disabled={!selectedDocId}
            />
          </label>
          <label className="text-xs text-text-muted md:col-span-2">
            Notes de relecture
            <textarea
              value={selectedDocument?.review_notes || ''}
              onChange={(e) => {
                if (!selectedDocId) return
                updateWorkDocumentDE(selectedDocId, { review_notes: e.target.value })
                refreshAll(selectedDocId)
              }}
              disabled={!selectedDocId}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleChangeWorkStatus(WORK_STATUS_DE.DRAFT)} disabled={!selectedDocId || workStatus === WORK_STATUS_DE.DRAFT}>
            Revenir draft
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleChangeWorkStatus(WORK_STATUS_DE.IN_REVIEW)} disabled={!selectedDocId || workStatus === WORK_STATUS_DE.IN_REVIEW}>
            Passer en relecture
          </Button>
          <Button variant="primary" size="sm" onClick={() => handleChangeWorkStatus(WORK_STATUS_DE.VALIDATED)} disabled={!selectedDocId || workStatus === WORK_STATUS_DE.VALIDATED}>
            Valider document
          </Button>
        </div>
      </div>

      {result ? (
        <div className={`rounded-lg border px-3 py-2 text-xs ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
          {result.msg}
        </div>
      ) : null}
    </div>
  )
}
