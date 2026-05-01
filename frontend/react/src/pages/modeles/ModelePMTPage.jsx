import React, { useMemo, useState } from 'react'
import Button from '../../components/ui/Button'
import {
  listModelDefinitionsPMT,
  upsertModelDefinitionPMT,
  deleteModelDefinitionPMT,
} from '../../services/pmtModelWorkStore'
import { createDefaultPmtDraft } from '../../lib/pmt/draft'
import { normalizePmtRuntimeValues } from '../../lib/pmt/normalize'

function createModelPayload(reference = '') {
  return {
    id: `PMT-${Date.now()}`,
    code: 'PMT',
    status: 'draft',
    reference: reference || `PMT modèle ${new Date().toLocaleString('fr-FR')}`,
    values: createDefaultPmtDraft(),
    updated_at: new Date().toISOString(),
  }
}

export default function ModelePMTPage() {
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const models = useMemo(() => listModelDefinitionsPMT(), [revision])

  function handleCreateModel() {
    const saved = upsertModelDefinitionPMT(createModelPayload())
    setResult({ type: 'ok', message: `Modèle créé: ${saved.reference}` })
    setRevision((v) => v + 1)
  }

  function handleApproveModel(model) {
    const saved = upsertModelDefinitionPMT({
      ...model,
      status: 'approved',
      values: normalizePmtRuntimeValues(model?.values || {}),
      updated_at: new Date().toISOString(),
    })
    setResult({ type: 'ok', message: `Modèle approuvé: ${saved.reference}` })
    setRevision((v) => v + 1)
  }

  function handleDeleteModel(modelId) {
    const ok = deleteModelDefinitionPMT(modelId)
    setResult({
      type: ok ? 'ok' : 'err',
      message: ok ? 'Modèle supprimé.' : 'Suppression impossible.',
    })
    if (ok) setRevision((v) => v + 1)
  }

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Modèle PMT</h1>
        <Button variant="primary" size="sm" onClick={handleCreateModel}>
          Nouveau modèle PMT
        </Button>
      </div>

      <p className="text-sm text-text-muted">
        Cette page est dédiée au modèle PMT (isolée de la DE).
      </p>

      <div className="rounded-lg border border-border bg-surface">
        <div className="px-4 py-3 border-b border-border text-sm font-medium">
          Modèles enregistrés ({models.length})
        </div>
        <div className="p-4 flex flex-col gap-3">
          {models.length === 0 ? (
            <div className="text-sm text-text-muted">Aucun modèle PMT pour le moment.</div>
          ) : (
            models.map((model) => (
              <div key={model.id} className="rounded border border-border p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{model.reference || model.id}</div>
                  <div className="text-xs text-text-muted">
                    statut: {model.status} | maj: {model.updated_at || '-'}
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => handleApproveModel(model)}>
                  Approuver
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleDeleteModel(model.id)}>
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
