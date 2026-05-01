import React, { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import {
  WORK_STATUS_PMT,
  listApprovedModelDefinitionsPMT,
  listApprovedRapportModelDefinitionsPMT,
  listWorkDocumentsPMT,
  createWorkDocumentPMT,
  updateWorkDocumentPMT,
  deleteWorkDocumentPMT,
  publishRuntimePMT,
} from '../../services/pmtModelWorkStore'
import { buildPmtDraftFromModel } from '../../lib/pmt/draft'

export default function WorkPmtPage() {
  const [revision, setRevision] = useState(0)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [result, setResult] = useState(null)

  const approvedModels = useMemo(() => listApprovedModelDefinitionsPMT(), [revision])
  const approvedRapports = useMemo(() => listApprovedRapportModelDefinitionsPMT(), [revision])
  const documents = useMemo(() => listWorkDocumentsPMT(), [revision])

  function refreshWithMessage(type, message) {
    setResult({ type, message })
    setRevision((v) => v + 1)
  }

  function handleCreateWorkDocument() {
    const model = approvedModels.find((item) => String(item.id) === String(selectedModelId))
    if (!model) {
      refreshWithMessage('err', 'Sélectionne un modèle PMT approuvé.')
      return
    }
    const rapport = approvedRapports[0] || null
    createWorkDocumentPMT({
      modelDefinitionId: model.id,
      modelVersion: model.schema_version,
      runtimeValues: buildPmtDraftFromModel(model),
      rapportModelDefinitionId: rapport?.id || '',
      rapportModelVersion: rapport?.schema_version ?? null,
    })
    refreshWithMessage('ok', 'Document de travail PMT créé.')
  }

  function handleValidate(doc) {
    const updated = updateWorkDocumentPMT(doc.id, {
      work_status: WORK_STATUS_PMT.VALIDATED,
      validated_at: new Date().toISOString(),
    })
    if (!updated) {
      refreshWithMessage('err', 'Validation impossible.')
      return
    }
    refreshWithMessage('ok', 'Document validé.')
  }

  function handlePublish(doc) {
    const publication = publishRuntimePMT({
      work_document_id: doc.id,
      model_definition_id: doc.model_definition_id,
      rapport_model_definition_id: doc.rapport_model_definition_id,
      model_snapshot: {
        id: doc.model_definition_id,
        values: doc.runtime_values,
      },
      rapport_snapshot: doc.rapport_model_definition_id
        ? { id: doc.rapport_model_definition_id }
        : null,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (!publication) {
      refreshWithMessage('err', 'Publication runtime PMT impossible.')
      return
    }
    refreshWithMessage('ok', 'Runtime PMT publié.')
  }

  function handleDelete(docId) {
    const ok = deleteWorkDocumentPMT(docId)
    refreshWithMessage(ok ? 'ok' : 'err', ok ? 'Document supprimé.' : 'Suppression impossible.')
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Work PMT</h1>
      </div>

      <p className="text-sm text-text-muted">
        Validation/association PMT isolée (sans logique DE).
      </p>

      <div className="rounded-lg border border-border bg-surface p-4 flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="pmt-model-select">
          Modèle PMT approuvé
        </label>
        <select
          id="pmt-model-select"
          className="h-10 rounded border border-border bg-bg px-3 text-sm"
          value={selectedModelId}
          onChange={(event) => setSelectedModelId(event.target.value)}
        >
          <option value="">Sélectionner...</option>
          {approvedModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.reference || model.id}
            </option>
          ))}
        </select>

        <Button variant="primary" size="sm" onClick={handleCreateWorkDocument}>
          Créer document depuis modèle
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          Documents Work PMT ({documents.length})
        </div>
        <div className="p-4 flex flex-col gap-3">
          {documents.length === 0 ? (
            <div className="text-sm text-text-muted">Aucun document PMT.</div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className={`rounded border p-3 flex items-center gap-3 ${String(selectedDocId) === String(doc.id) ? 'border-primary' : 'border-border'}`}
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setSelectedDocId(doc.id)}
                >
                  <div className="font-medium truncate">{doc.id}</div>
                  <div className="text-xs text-text-muted">
                    statut: {doc.work_status} | modèle: {doc.model_definition_id || '-'}
                  </div>
                </button>
                <Button variant="secondary" size="sm" onClick={() => handleValidate(doc)}>
                  Valider
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handlePublish(doc)}>
                  Publier runtime
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(doc.id)}>
                  Supprimer
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {result ? (
        <div className={`rounded border px-3 py-2 text-sm ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
          {result.message}
        </div>
      ) : null}
    </div>
  )
}
