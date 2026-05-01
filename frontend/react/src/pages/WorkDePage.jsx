import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  computeDeSummary,
  createWorkDocumentDEFromModel,
  getRapportModelDefinitionDEById,
  getWorkDocumentDE,
  listApprovedModelDefinitionsDE,
  listApprovedRapportModelDefinitionsDE,
  listWorkDocumentsDE,
  WORK_STATUS_DE,
  updateWorkDocumentDE,
} from '@/services/modelWorkLocalStore'

function formatResult(value, unit) {
  if (value == null || value === '') return ''
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
  return `${value}${unit ? ` ${unit}` : ''}`
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [models, setModels] = useState(() => listApprovedModelDefinitionsDE())
  const [rapportModels, setRapportModels] = useState(() => listApprovedRapportModelDefinitionsDE())
  const [documents, setDocuments] = useState(() => listWorkDocumentsDE())
  const selectedDocId = searchParams.get('doc') || ''
  const selectedModelId = searchParams.get('model') || ''

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

  const activeValues = selectedDocument?.runtime_values || selectedModel?.values || {}
  const summary = computeDeSummary(activeValues?.points_rows || [])
  const hasRapportLinkedToDocument = Boolean(selectedDocument?.rapport_model_definition_id) && linkedRapportModel?.status === 'approved'
  const workStatus = selectedDocument?.work_status || WORK_STATUS_DE.DRAFT
  const canPrint = Boolean(selectedDocId && hasRapportLinkedToDocument && workStatus === WORK_STATUS_DE.VALIDATED)

  function refreshAll(nextDocId = selectedDocId) {
    setModels(listApprovedModelDefinitionsDE())
    setRapportModels(listApprovedRapportModelDefinitionsDE())
    setDocuments(listWorkDocumentsDE())
    if (nextDocId) {
      const fresh = getWorkDocumentDE(nextDocId)
      setRuntimeDraft(toDraft(fresh?.runtime_values || {}))
    }
  }

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

  function handleCreateFromModel() {
    if (!selectedModel) {
      setResult({ type: 'err', msg: 'Aucun modèle DE approuvé disponible.' })
      return
    }
    const created = createWorkDocumentDEFromModel(selectedModel)
    setSearchParams({ doc: String(created.id), model: String(selectedModel.id) })
    setRuntimeDraft(toDraft(created.runtime_values || {}))
    refreshAll(created.id)
    setResult({ type: 'ok', msg: `Document de travail créé (${created.id}). Version modèle fixée: v${created.model_version}.` })
  }

  function handleSaveRuntime() {
    if (!selectedDocId) {
      setResult({ type: 'err', msg: 'Crée d’abord un document de travail DE.' })
      return
    }
    const rows = Array.isArray(runtimeDraft.points_rows) ? runtimeDraft.points_rows : []
    const runtimeValues = {
      meta: runtimeDraft.meta || {},
      points_rows: rows,
      resume: computeDeSummary(rows),
    }
    const updated = updateWorkDocumentDE(selectedDocId, { runtime_values: runtimeValues })
    if (!updated) {
      setResult({ type: 'err', msg: 'Document introuvable.' })
      return
    }
    refreshAll(selectedDocId)
    setResult({ type: 'ok', msg: 'Document de travail DE mis à jour.' })
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
    refreshAll(selectedDocId)
    setResult({ type: 'ok', msg: `Statut mis à jour: ${nextStatus}.` })
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 py-3">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">Work DE</div>
            <h1 className="mt-1 text-2xl font-semibold text-text">Feuille de travail DE (runtime)</h1>
            <p className="mt-2 text-sm text-text-muted">
              Cette page n’utilise que des modèles DE approuvés et fixe la version du modèle à la création du document.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/modelos-base/DE')}>Ouvrir le modèle DE</Button>
        </div>
      </div>

      {selectedDocId && !hasRapportLinkedToDocument ? (
        <div className="rounded-lg border border-[#f1d2a4] bg-[#fff4e5] px-4 py-3 text-sm text-[#8a5c11]">
          Rapport DE não associado ou não aprovado. Pode continuar a preencher a folha, mas a impressão está desativada.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text">Modèles approuvés</h2>
          <p className="mt-1 text-xs text-text-muted">{models.length} modèle(s) DE approved</p>
          <div className="mt-3 flex flex-col gap-2">
            {models.length ? models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSearchParams({ model: String(model.id) })}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${String(selectedModel?.id) === String(model.id) ? 'border-accent bg-bg' : 'border-border bg-surface'}`}
              >
                <div className="font-semibold text-text">{model.reference || model.id}</div>
                <div className="text-text-muted">v{model.schema_version} · {model.status}</div>
              </button>
            )) : <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-text-muted">Aucun modèle approuvé.</div>}
          </div>
          <Button className="mt-3" variant="primary" onClick={handleCreateFromModel} disabled={!selectedModel}>Créer document depuis modèle</Button>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text">Documents de travail DE</h2>
          <p className="mt-1 text-xs text-text-muted">{documents.length} document(s)</p>
          <div className="mt-3 flex flex-col gap-2 max-h-[260px] overflow-auto">
            {documents.length ? documents.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => {
                  setSearchParams({ doc: String(doc.id), model: String(doc.model_definition_id || '') })
                  setRuntimeDraft(toDraft(doc.runtime_values || {}))
                }}
                className={`rounded-lg border px-3 py-2 text-left text-xs ${String(selectedDocId) === String(doc.id) ? 'border-accent bg-bg' : 'border-border bg-surface'}`}
              >
                <div className="font-semibold text-text">{doc.id}</div>
                <div className="text-text-muted">
                  model={doc.model_definition_id} · v{doc.model_version}
                  {doc.rapport_model_definition_id ? ` · rapport=${doc.rapport_model_definition_id}` : ' · sem rapport'}
                </div>
              </button>
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

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-text">Runtime DE</h2>
          <div className="text-xs text-text-muted">
            Points {summary.points} · Compacité {formatResult(summary.moyenne_compacite_pct, '%')} · Vides {formatResult(summary.moyenne_vides_pct, '%')} · MV {formatResult(summary.moyenne_mv, 'g/cm³')}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs text-text-muted">
            Opérateur
            <Input value={runtimeDraft.meta?.operateur || ''} onChange={(e) => setRuntimeDraft((prev) => ({ ...prev, meta: { ...(prev.meta || {}), operateur: e.target.value } }))} />
          </label>
          <label className="text-xs text-text-muted">
            Conditions météo
            <Input value={runtimeDraft.meta?.conditions_meteo || ''} onChange={(e) => setRuntimeDraft((prev) => ({ ...prev, meta: { ...(prev.meta || {}), conditions_meteo: e.target.value } }))} />
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-[12px]">
            <thead className="bg-bg">
              <tr>
                <th className="border-b border-border px-2 py-2 text-left">Point</th>
                <th className="border-b border-border px-2 py-2 text-left">Profil</th>
                <th className="border-b border-border px-2 py-2 text-left">Position</th>
                <th className="border-b border-border px-2 py-2 text-right">MV</th>
                <th className="border-b border-border px-2 py-2 text-right">Compacité</th>
                <th className="border-b border-border px-2 py-2 text-right">Vides</th>
              </tr>
            </thead>
            <tbody>
              {(runtimeDraft.points_rows || []).map((row, index) => (
                <tr key={row?.id || index}>
                  <td className="border-b border-border px-2 py-1.5"><Input value={row?.point || ''} onChange={(e) => setRuntimeDraft((prev) => {
                    const rows = [...(prev.points_rows || [])]
                    rows[index] = { ...(rows[index] || {}), point: e.target.value }
                    return { ...prev, points_rows: rows }
                  })} /></td>
                  <td className="border-b border-border px-2 py-1.5"><Input value={row?.profil || ''} onChange={(e) => setRuntimeDraft((prev) => {
                    const rows = [...(prev.points_rows || [])]
                    rows[index] = { ...(rows[index] || {}), profil: e.target.value }
                    return { ...prev, points_rows: rows }
                  })} /></td>
                  <td className="border-b border-border px-2 py-1.5"><Input value={row?.position || ''} onChange={(e) => setRuntimeDraft((prev) => {
                    const rows = [...(prev.points_rows || [])]
                    rows[index] = { ...(rows[index] || {}), position: e.target.value }
                    return { ...prev, points_rows: rows }
                  })} /></td>
                  <td className="border-b border-border px-2 py-1.5"><Input value={row?.masse_volumique || ''} onChange={(e) => setRuntimeDraft((prev) => {
                    const rows = [...(prev.points_rows || [])]
                    rows[index] = { ...(rows[index] || {}), masse_volumique: e.target.value }
                    return { ...prev, points_rows: rows }
                  })} className="text-right" /></td>
                  <td className="border-b border-border px-2 py-1.5"><Input value={row?.compacite_pct || ''} onChange={(e) => setRuntimeDraft((prev) => {
                    const rows = [...(prev.points_rows || [])]
                    rows[index] = { ...(rows[index] || {}), compacite_pct: e.target.value }
                    return { ...prev, points_rows: rows }
                  })} className="text-right" /></td>
                  <td className="border-b border-border px-2 py-1.5"><Input value={row?.vides_pct || ''} onChange={(e) => setRuntimeDraft((prev) => {
                    const rows = [...(prev.points_rows || [])]
                    rows[index] = { ...(rows[index] || {}), vides_pct: e.target.value }
                    return { ...prev, points_rows: rows }
                  })} className="text-right" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setRuntimeDraft((prev) => ({ ...prev, points_rows: [...(prev.points_rows || []), { id: Date.now(), point: '', profil: '', position: '', masse_volumique: '', compacite_pct: '', vides_pct: '' }] }))}>+ Ligne</Button>
          <Button variant="primary" onClick={handleSaveRuntime}>Enregistrer runtime</Button>
          <Button
            variant="secondary"
            onClick={() => navigate(`/rapports/de/${encodeURIComponent(selectedDocId || 'modele')}?mode=work`)}
            disabled={!canPrint}
          >
            Imprimer / Ouvrir rapport DE
          </Button>
        </div>
        {!canPrint && selectedDocId ? (
          <div className="mt-2 text-xs text-[#8a5c11]">
            Impression active uniquement quand le document est validé et un rapport DE approuvé est associé.
          </div>
        ) : null}
      </div>

      {result ? (
        <div className={`rounded-lg border px-3 py-2 text-xs ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
          {result.msg}
        </div>
      ) : null}
    </div>
  )
}
