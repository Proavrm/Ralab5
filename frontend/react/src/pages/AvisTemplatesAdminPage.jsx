import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Textarea } from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { avisTechniqueApi, getApiErrorMessage } from '@/services/api'

function emptyDefinition() {
  return {
    reference_rule: '{affaire_ref}-RST-D{seq:04d}',
    meta_field_keys: ['title', 'reference', 'author', 'document_date', 'status'],
    sections: [],
  }
}

export default function AvisTemplatesAdminPage() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [definitionText, setDefinitionText] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState(null)

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) || null,
    [templates, selectedId],
  )

  async function reload() {
    setLoading(true)
    setError('')
    try {
      const [list, metaRes] = await Promise.all([
        avisTechniqueApi.listTemplates({}),
        avisTechniqueApi.meta(),
      ])
      setTemplates(Array.isArray(list) ? list : [])
      setMeta(metaRes)
      if (!selectedId && list?.[0]?.id) {
        selectTemplate(list[0])
      } else if (selectedId) {
        const found = (list || []).find((t) => t.id === selectedId)
        if (found) selectTemplate(found)
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Chargement impossible'))
    } finally {
      setLoading(false)
    }
  }

  function selectTemplate(tpl) {
    setSelectedId(tpl.id)
    setDraft({
      code: tpl.code,
      label: tpl.label,
      docx_style_path: tpl.docx_style_path || '',
      is_active: Boolean(tpl.is_active),
      bump_version: false,
    })
    setDefinitionText(JSON.stringify(tpl.definition || emptyDefinition(), null, 2))
    setMessage('')
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleSave() {
    if (!selectedId || !draft) return
    setError('')
    setMessage('')
    let definition
    try {
      definition = JSON.parse(definitionText || '{}')
    } catch {
      setError('definition_json invalide')
      return
    }
    try {
      const updated = await avisTechniqueApi.patchTemplate(selectedId, {
        label: draft.label,
        docx_style_path: draft.docx_style_path,
        is_active: draft.is_active,
        definition,
        bump_version: Boolean(draft.bump_version),
      })
      setMessage(`Template enregistré (v${updated.version})`)
      await reload()
      selectTemplate(updated)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Enregistrement impossible'))
    }
  }

  async function handleCreate() {
    const code = window.prompt('Code du nouveau template ?')
    if (!code) return
    try {
      const created = await avisTechniqueApi.upsertTemplate({
        code: code.trim(),
        label: code.trim(),
        definition: emptyDefinition(),
        is_active: true,
      })
      await reload()
      selectTemplate(created)
      setMessage('Template créé')
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  async function handleExport() {
    if (!selectedId) return
    try {
      const payload = await avisTechniqueApi.exportTemplate(selectedId)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${payload.code || 'template'}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  async function handleImportFile(file) {
    if (!file) return
    try {
      const text = await file.text()
      const payload = JSON.parse(text)
      const imported = await avisTechniqueApi.importTemplate(payload)
      await reload()
      selectTemplate(imported)
      setMessage(`Importé : ${imported.code}`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Import JSON impossible'))
    }
  }

  function addSection() {
    let definition
    try {
      definition = JSON.parse(definitionText || '{}')
    } catch {
      setError('JSON invalide')
      return
    }
    const sections = Array.isArray(definition.sections) ? [...definition.sections] : []
    const id = `section_${Date.now()}`
    sections.push({
      id,
      title: 'Nouvelle section',
      order: (sections.length + 1) * 10,
      parent_id: null,
      optional: false,
      blocks: [{ slot_id: 'body', block_type: 'rich_text', label: 'Texte' }],
    })
    definition.sections = sections
    setDefinitionText(JSON.stringify(definition, null, 2))
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        title="Templates avis technique"
        subtitle="Structure éditable en base (JSON) — aucun sommaire hardcodé"
        onBack={() => navigate(-1)}
      >
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => avisTechniqueApi.seedTemplates(false).then(reload)}>
              Seed disque
            </Button>
            <Button type="button" variant="secondary" onClick={handleCreate}>
              Nouveau
            </Button>
            <Button type="button" variant="secondary" onClick={handleExport} disabled={!selectedId}>
              Export JSON
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded border border-border bg-surface px-3 py-1.5 text-xs">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0])}
              />
            </label>
            <Button type="button" variant="primary" onClick={handleSave} disabled={!selectedId}>
              Enregistrer
            </Button>
          </div>
      </FicheTopbar>
      <FicheMain>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {message ? <p className="mb-3 text-sm text-emerald-700">{message}</p> : null}
        {loading ? <p className="text-text-muted">Chargement…</p> : null}

        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="rounded-xl border border-[#dbe1ea] bg-white p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase text-text-muted">Templates</div>
            <div className="space-y-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTemplate(t)}
                  className={`block w-full rounded-lg px-2 py-1.5 text-left text-[13px] ${
                    selectedId === t.id ? 'bg-[#003170] text-white' : 'hover:bg-[#f1f5f9]'
                  }`}
                >
                  <div className="font-medium">{t.label || t.code}</div>
                  <div className="text-[11px] opacity-80">{t.code} · v{t.version}{t.is_active ? '' : ' · inactif'}</div>
                </button>
              ))}
            </div>
            {meta ? (
              <div className="mt-4 border-t border-[#e5e9f0] pt-3 text-[11px] text-text-muted">
                Types de blocs : {(meta.block_types || []).join(', ')}
              </div>
            ) : null}
          </aside>

          {draft && selected ? (
            <div className="space-y-4">
              <SectionCard title="Métadonnées">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Code</div>
                    <Input value={draft.code} disabled />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Label</div>
                    <Input
                      value={draft.label}
                      onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">docx_style_path</div>
                    <Input
                      value={draft.docx_style_path}
                      onChange={(e) => setDraft((p) => ({ ...p, docx_style_path: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={draft.is_active}
                        onChange={(e) => setDraft((p) => ({ ...p, is_active: e.target.checked }))}
                      />
                      Actif
                    </label>
                    <label className="flex items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={draft.bump_version}
                        onChange={(e) => setDraft((p) => ({ ...p, bump_version: e.target.checked }))}
                      />
                      Incrémenter version
                    </label>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="definition_json"
                actions={(
                  <Button type="button" variant="secondary" size="sm" onClick={addSection}>
                    + Section
                  </Button>
                )}
              >
                <Textarea
                  rows={28}
                  className="font-mono text-[12px]"
                  value={definitionText}
                  onChange={(e) => setDefinitionText(e.target.value)}
                />
                <p className="mt-2 text-[12px] text-text-muted">
                  Éditer l’arbre de sections / slots / bindings ici. Les titres métier vivent dans ce JSON, pas dans le code React.
                </p>
              </SectionCard>
            </div>
          ) : (
            <p className="text-text-muted">Sélectionnez un template.</p>
          )}
        </div>
      </FicheMain>
    </FichePageShell>
  )
}
