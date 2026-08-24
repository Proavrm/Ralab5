import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { FicheMain, FichePageShell, FicheTopbar, SectionCard } from '@/components/layout/FicheLayout'
import { BlockEditor } from '@/components/avisTechnique/BlockEditors'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import {
  avisTechniqueApi,
  calculsApi,
  demandesApi,
  getApiErrorMessage,
} from '@/services/api'

function parseOptionalInt(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeDocs(rawDocs) {
  const list = Array.isArray(rawDocs) ? rawDocs : []
  return list.map((d) => {
    const id = d.id ?? d.uid
    return {
      id,
      document_type: d.document_type || '',
      label: d.document_type || d.comment || `Document #${id}`,
      stored_path: d.stored_path || '',
      comment: d.comment || '',
    }
  })
}

function buildSectionTree(sections) {
  const list = Array.isArray(sections) ? [...sections] : []
  list.sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
  const byParent = new Map()
  list.forEach((s) => {
    const key = s.parent_id || null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(s)
  })
  const flat = []
  function walk(parentId, depth) {
    const kids = byParent.get(parentId) || []
    kids.forEach((node) => {
      flat.push({ ...node, depth })
      walk(node.id, depth + 1)
    })
  }
  walk(null, 0)
  return flat
}

function firstEditableSection(flat) {
  return flat.find((s) => !s.navigable_only && (s.blocks || []).length > 0) || flat[0] || null
}

function slotHasContent(slot) {
  const c = slot?.content
  if (!c) return false
  if (typeof c.text === 'string' && c.text.trim()) return true
  if (Array.isArray(c.items) && c.items.length) return true
  if (Array.isArray(c.rows) && c.rows.length) return true
  if (Array.isArray(c.cards) && c.cards.length) return true
  if (Array.isArray(c.calcul_ids) && c.calcul_ids.length) return true
  if (c.fields && Object.values(c.fields).some((v) => String(v || '').trim())) return true
  return false
}

export default function AvisTechniquePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = resolveReturnTo(searchParams)
  const demandeIdParam = parseOptionalInt(searchParams.get('demande_id'))
  const isNew = !id || id === 'nouveau'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [instance, setInstance] = useState(null)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [documents, setDocuments] = useState([])
  const [calculs, setCalculs] = useState([])
  const [activeSectionId, setActiveSectionId] = useState(null)
  const [meta, setMeta] = useState(null)
  const [existingInstances, setExistingInstances] = useState([])

  const template = instance?.template || null
  const flatSections = useMemo(
    () => buildSectionTree(template?.definition?.sections),
    [template],
  )

  useEffect(() => {
    if (!flatSections.length) return
    if (!activeSectionId || !flatSections.some((s) => s.id === activeSectionId)) {
      const first = firstEditableSection(flatSections)
      setActiveSectionId(first?.id || null)
    }
  }, [flatSections, activeSectionId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [tpls, metaRes] = await Promise.all([
          avisTechniqueApi.listTemplates({ active_only: true }),
          avisTechniqueApi.meta().catch(() => null),
        ])
        if (cancelled) return
        setTemplates(Array.isArray(tpls) ? tpls : [])
        setMeta(metaRes)
        if (!selectedTemplateId && tpls?.[0]?.id) setSelectedTemplateId(String(tpls[0].id))

        if (isNew) {
          setInstance(null)
          if (demandeIdParam) {
            const [demande, nav, existing] = await Promise.all([
              demandesApi.get(demandeIdParam),
              demandesApi.navigation(demandeIdParam),
              avisTechniqueApi.listInstances({ demande_id: demandeIdParam }),
            ])
            if (cancelled) return
            setExistingInstances(Array.isArray(existing) ? existing : [])
            setDocuments(normalizeDocs(nav?.documents || demande?.documents || []))
            const calcs = await calculsApi.list({ demande_id: demandeIdParam })
            setCalculs(Array.isArray(calcs) ? calcs.map((c) => ({
              ...c,
              a_retenir: Boolean(c.a_retenir ?? c.general?.a_retenir),
            })) : [])
          }
        } else {
          const data = await avisTechniqueApi.getInstance(Number(id))
          if (cancelled) return
          setInstance(data)
          if (data.demande_id) {
            const nav = await demandesApi.navigation(data.demande_id)
            if (cancelled) return
            setDocuments(normalizeDocs(nav?.documents || []))
            const calcs = await calculsApi.list({ demande_id: data.demande_id })
            setCalculs(Array.isArray(calcs) ? calcs.map((c) => ({
              ...c,
              a_retenir: Boolean(c.a_retenir ?? c.general?.a_retenir),
            })) : [])
          }
        }
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Impossible de charger l’avis'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, isNew, demandeIdParam])

  async function handleCreate() {
    if (!demandeIdParam) {
      setError('demande_id requis pour créer un avis')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (!templates.length) await avisTechniqueApi.seedTemplates(false)
      const created = await avisTechniqueApi.createInstance({
        demande_id: demandeIdParam,
        template_id: selectedTemplateId ? Number(selectedTemplateId) : undefined,
        apply_bindings: true,
      })
      navigate(
        buildPathWithReturnTo(`/avis-technique/${created.id}`, returnTo || `/demandes/${demandeIdParam}`),
        { replace: true },
      )
    } catch (err) {
      setError(getApiErrorMessage(err, 'Création impossible'))
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    if (!instance?.id) return
    setSaving(true)
    setError('')
    try {
      const updated = await avisTechniqueApi.updateInstance(instance.id, {
        reference: instance.reference,
        titre: instance.titre,
        statut: instance.statut,
        auteur: instance.auteur,
        meta: instance.meta,
        contents: instance.contents,
        linked_document_ids: instance.linked_document_ids,
        linked_calcul_ids: instance.linked_calcul_ids,
        linked_materiau_ids: instance.linked_materiau_ids,
      })
      setInstance(updated)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Enregistrement impossible'))
    } finally {
      setSaving(false)
    }
  }

  function patchSlot(sectionId, slotId, blockType, nextContent) {
    setInstance((prev) => {
      if (!prev) return prev
      const contents = { ...(prev.contents || {}) }
      const section = { ...(contents[sectionId] || {}) }
      section[slotId] = { block_type: blockType, content: nextContent }
      contents[sectionId] = section
      return { ...prev, contents }
    })
  }

  function selectNav(section) {
    if (section.navigable_only) {
      const child = flatSections.find((s) => s.parent_id === section.id && !s.navigable_only)
      if (child) setActiveSectionId(child.id)
      return
    }
    setActiveSectionId(section.id)
  }

  const activeSection = flatSections.find((s) => s.id === activeSectionId) || null
  const visibleBlocks = (activeSection?.blocks || []).filter((blockDef) => {
    const slot = instance?.contents?.[activeSection.id]?.[blockDef.slot_id]
    // Always show texte; hide empty optional lists/tables unless user needs them — show all with content OR always show texte/meta/figures/fiches
    if (['texte', 'meta', 'figures', 'fiches'].includes(blockDef.slot_id)) return true
    if (slotHasContent(slot)) return true
    // still show empty liste/tableau collapsed? show with add capability — keep visible for editing
    return true
  })

  const backHref = returnTo
    || (instance?.demande_id ? `/demandes/${instance.demande_id}` : (demandeIdParam ? `/demandes/${demandeIdParam}` : '/demandes'))

  if (loading) {
    return (
      <FichePageShell>
        <FicheTopbar backLabel="← Retour" title="Avis technique" onBack={() => navigate(backHref)} />
        <FicheMain><p className="text-text-muted">Chargement…</p></FicheMain>
      </FichePageShell>
    )
  }

  if (isNew) {
    return (
      <FichePageShell>
        <FicheTopbar
          backLabel="← Retour"
          title="Nouvel avis technique"
          subtitle={demandeIdParam ? `Demande #${demandeIdParam}` : 'Sélectionnez une demande'}
          onBack={() => navigate(backHref)}
        />
        <FicheMain>
          {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
          <SectionCard title="Création">
            <div className="max-w-lg space-y-3">
              {existingInstances.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-[#dbe1ea] bg-[#f8fafc] p-3">
                  <div className="text-[12px] font-semibold uppercase text-text-muted">Avis existants</div>
                  {existingInstances.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="block w-full rounded-lg border border-[#e5e9f0] bg-white px-3 py-2 text-left text-[13px] hover:border-[#003170]"
                      onClick={() => navigate(buildPathWithReturnTo(
                        `/avis-technique/${item.id}`,
                        returnTo || `/demandes/${demandeIdParam}`,
                      ))}
                    >
                      <div className="font-medium">{item.reference || item.titre || `#${item.id}`}</div>
                      <div className="text-text-muted">{item.statut}</div>
                    </button>
                  ))}
                </div>
              ) : null}
              <Select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.label || t.code} (v{t.version})</option>
                ))}
              </Select>
              <Button type="button" variant="primary" disabled={saving || !demandeIdParam} onClick={handleCreate}>
                {saving ? 'Création…' : 'Créer un nouvel avis'}
              </Button>
            </div>
          </SectionCard>
        </FicheMain>
      </FichePageShell>
    )
  }

  return (
    <FichePageShell>
      <FicheTopbar
        backLabel="← Retour"
        title={instance?.titre || instance?.reference || 'Avis technique'}
        subtitle={`${instance?.reference || ''} · ${instance?.statut || ''}`}
        onBack={() => navigate(backHref)}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(buildPathWithReturnTo(
              `/calculs?demande_id=${instance.demande_id}`,
              `/avis-technique/${instance.id}`,
            ))}
          >
            Calculs
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(buildPathWithReturnTo(
              `/avis-technique/${instance.id}/preview`,
              `/avis-technique/${instance.id}`,
            ))}
          >
            Prévisualiser
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => avisTechniqueApi.downloadDocx(instance.id).catch((err) => setError(getApiErrorMessage(err)))}
          >
            Export Word
          </Button>
          <Button type="button" variant="primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </FicheTopbar>

      <FicheMain>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Référence</div>
            <Input value={instance?.reference || ''} onChange={(e) => setInstance((p) => ({ ...p, reference: e.target.value }))} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Titre</div>
            <Input value={instance?.titre || ''} onChange={(e) => setInstance((p) => ({ ...p, titre: e.target.value }))} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Auteur</div>
            <Input value={instance?.auteur || ''} onChange={(e) => setInstance((p) => ({ ...p, auteur: e.target.value }))} />
          </div>
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-text-muted">Statut</div>
            <Select value={instance?.statut || 'Brouillon'} onChange={(e) => setInstance((p) => ({ ...p, statut: e.target.value }))}>
              {(meta?.statuts || ['Brouillon', 'En rédaction', 'Validé', 'Envoyé']).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-xl border border-[#dbe1ea] bg-white p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Sommaire</div>
            <nav className="max-h-[70vh] space-y-0.5 overflow-y-auto">
              {flatSections.map((section) => {
                const isChapter = !section.parent_id || section.navigable_only
                const active = activeSectionId === section.id
                  || (section.navigable_only && activeSection?.parent_id === section.id)
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => selectNav(section)}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left ${
                      active ? 'bg-[#003170] text-white' : 'text-[#0f172a] hover:bg-[#f1f5f9]'
                    }`}
                    style={{ paddingLeft: `${8 + (section.depth || 0) * 12}px` }}
                  >
                    <span className={`text-[12px] ${isChapter && !section.parent_id ? 'font-bold' : 'font-medium'}`}>
                      {section.title || section.id}
                    </span>
                  </button>
                )
              })}
            </nav>
            <div className="mt-4 border-t border-[#e5e9f0] pt-3 text-[12px] text-text-muted">
              <Link className="text-[#003170] underline" to="/avis-technique/templates">Admin templates</Link>
            </div>
          </aside>

          <div className="space-y-4">
            {activeSection ? (
              <SectionCard title={activeSection.title || activeSection.id}>
                {(activeSection.blocks || []).length === 0 ? (
                  <p className="text-[13px] text-text-muted">
                    Chapitre de navigation — choisissez un sous-chapitre dans le sommaire.
                  </p>
                ) : (
                  <div className="space-y-8">
                    {visibleBlocks.map((blockDef) => {
                      const slotId = blockDef.slot_id
                      const blockType = blockDef.block_type
                      const slot = instance?.contents?.[activeSection.id]?.[slotId]
                      const content = slot?.content || {}
                      return (
                        <div key={slotId}>
                          {blockDef.label && blockDef.label !== activeSection.title ? (
                            <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#69758a]">
                              {blockDef.label}
                            </div>
                          ) : null}
                          <BlockEditor
                            blockType={blockType}
                            content={content}
                            documents={documents}
                            calculs={calculs}
                            instanceMeta={instance?.meta}
                            onChange={(next) => patchSlot(activeSection.id, slotId, blockType, next)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </SectionCard>
            ) : (
              <p className="text-text-muted">Aucune section.</p>
            )}
          </div>
        </div>
      </FicheMain>
    </FichePageShell>
  )
}
