/**
 * Prévisualisation lecture d’un avis technique (document HTML).
 * Données = instance DB + template — aucun contenu métier hardcodé.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import AlizeFicheEmbed from '@/components/avisTechnique/AlizeFicheEmbed'
import { AuthStorageImage } from '@/components/avisTechnique/BlockEditors'
import { buildPathWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'
import {
  avisTechniqueApi,
  calculsApi,
  demandesApi,
  getApiErrorMessage,
} from '@/services/api'

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

function normalizeFreeTables(content) {
  if (Array.isArray(content?.tables) && content.tables.length) {
    return content.tables
  }
  if (content?.headers || content?.rows) {
    return [{ caption: content?.caption || '', headers: content.headers || [], rows: content.rows || [] }]
  }
  return []
}

function slotPayload(contents, sectionId, slotId) {
  const section = contents?.[sectionId]
  if (!section || typeof section !== 'object') return null
  return section[slotId] || null
}

function hasRenderableContent(blockType, content) {
  if (!content) return false
  if (blockType === 'rich_text') return Boolean(String(content.text || '').trim())
  if (blockType === 'bullet_list' || blockType === 'checklist') {
    return Array.isArray(content.items) && content.items.some((it) => {
      const text = typeof it === 'string' ? it : it?.text
      return Boolean(String(text || '').trim())
    })
  }
  if (blockType === 'key_value_table') {
    return Array.isArray(content.rows) && content.rows.some((r) => String(r?.key || r?.value || '').trim())
  }
  if (blockType === 'free_table') {
    return normalizeFreeTables(content).some(
      (t) => (t.headers || []).length || (t.rows || []).length,
    )
  }
  if (blockType === 'media_cards') {
    return Array.isArray(content.cards) && content.cards.some((c) => c?.document_id)
  }
  if (blockType === 'document_gallery') {
    return Array.isArray(content.items) && content.items.length > 0
  }
  if (blockType === 'meta_document') {
    const fields = content.fields || {}
    return Object.values(fields).some((v) => String(v || '').trim())
  }
  if (blockType === 'calcul_fiches' || blockType === 'calculs_table') {
    // Always render in preview — IDs may be resolved from demande calculs
    return true
  }
  if (blockType === 'materiau_status') {
    return Array.isArray(content.items) && content.items.length > 0
  }
  return false
}

function PreviewRichText({ content }) {
  const text = String(content?.text || '').trim()
  if (!text) return null
  return (
    <div className="space-y-3 text-[15px] leading-7 text-[#1f2937] whitespace-pre-wrap">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>{para}</p>
      ))}
    </div>
  )
}

function PreviewBulletList({ content, checklist = false }) {
  const items = Array.isArray(content?.items) ? content.items : []
  if (!items.length) return null
  return (
    <ul className={`my-3 space-y-1.5 text-[15px] leading-6 text-[#1f2937] ${checklist ? 'list-none' : 'list-disc pl-5'}`}>
      {items.map((item, i) => {
        const text = typeof item === 'string' ? item : String(item?.text || '')
        const done = typeof item === 'object' ? Boolean(item?.done || item?.checked) : false
        if (!text.trim()) return null
        return (
          <li key={i} className={checklist ? 'flex gap-2' : undefined}>
            {checklist ? <span className="text-[#64748b]">{done ? '☑' : '☐'}</span> : null}
            <span>{text}</span>
          </li>
        )
      })}
    </ul>
  )
}

function PreviewKeyValueTable({ content }) {
  const rows = Array.isArray(content?.rows) ? content.rows : []
  if (!rows.length) return null
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border border-[#cbd5e1]">
              <th className="w-[36%] bg-[#f1f5f9] px-3 py-2 text-left font-semibold text-[#334155] align-top">
                {row?.key || '—'}
              </th>
              <td className="px-3 py-2 text-[#1f2937] align-top whitespace-pre-wrap">{row?.value || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PreviewFreeTable({ content }) {
  const tables = normalizeFreeTables(content)
  if (!tables.length) return null
  return (
    <div className="my-4 space-y-5">
      {tables.map((table, tIdx) => {
        const headers = Array.isArray(table.headers) ? table.headers : []
        const rows = Array.isArray(table.rows) ? table.rows : []
        const cols = Math.max(headers.length, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)), 1)
        return (
          <div key={tIdx}>
            {table.caption ? (
              <div className="mb-2 text-[13px] font-semibold text-[#334155]">{table.caption}</div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-[12px]">
                {headers.some((h) => String(h || '').trim()) ? (
                  <thead>
                    <tr>
                      {Array.from({ length: cols }).map((_, c) => (
                        <th
                          key={c}
                          className="border border-[#94a3b8] bg-[#e2e8f0] px-2 py-1.5 text-left font-semibold text-[#0f172a]"
                        >
                          {headers[c] || ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                ) : null}
                <tbody>
                  {rows.map((row, rIdx) => {
                    const values = Array.isArray(row) ? row : []
                    return (
                      <tr key={rIdx} className={rIdx % 2 ? 'bg-[#f8fafc]' : 'bg-white'}>
                        {Array.from({ length: cols }).map((_, c) => (
                          <td key={c} className="border border-[#cbd5e1] px-2 py-1.5 align-top whitespace-pre-wrap text-[#1f2937]">
                            {values[c] || ''}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PreviewMeta({ content, instance }) {
  const fields = { ...(instance?.meta || {}), ...(content?.fields || {}) }
  if (instance?.reference) fields.reference = fields.reference || instance.reference
  if (instance?.titre) fields.title = fields.title || instance.titre
  if (instance?.auteur) fields.author = fields.author || instance.auteur
  if (instance?.statut) fields.status = fields.status || instance.statut
  const entries = Object.entries(fields).filter(([, v]) => String(v || '').trim())
  if (!entries.length) return null
  return (
    <div className="my-4 overflow-x-auto">
      <table className="w-full max-w-xl border-collapse text-[13px]">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border border-[#cbd5e1]">
              <th className="w-[40%] bg-[#f1f5f9] px-3 py-2 text-left font-semibold text-[#334155]">{key}</th>
              <td className="px-3 py-2 text-[#1f2937]">{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function isAnnexSection(section) {
  const id = String(section?.id || '')
  const title = String(section?.title || '')
  return id.startsWith('a') || /annexe/i.test(title)
}

function resolveCalculIds(content, calculs) {
  const explicit = Array.isArray(content?.calcul_ids)
    ? content.calcul_ids.map(Number).filter((n) => Number.isFinite(n))
    : []
  if (explicit.length) return explicit
  const list = Array.isArray(calculs) ? calculs : []
  const forPrint = list.filter((c) => c.pour_impression || c.a_retenir || c.general?.pour_impression || c.general?.a_retenir)
  if (forPrint.length) return forPrint.map((c) => Number(c.id)).filter(Number.isFinite)
  // Fallback métier : série CAM1 (20 cas) si présente
  const cam1 = list.filter((c) => /CAM\s*1|CAM1/i.test(String(c.nom_calcul || '')))
  if (cam1.length) return cam1.map((c) => Number(c.id)).filter(Number.isFinite)
  return list.filter((c) => c.type_calcul === 'alize').map((c) => Number(c.id)).filter(Number.isFinite)
}

function PreviewCalculFiches({ content, calculs }) {
  const ids = resolveCalculIds(content, calculs)
  if (!ids.length) {
    return (
      <p className="my-3 text-[14px] text-[#64748b]">
        Aucune fiche de calcul liée — marquez des calculs « pour impression » ou « retenus » sur la demande.
      </p>
    )
  }
  return (
    <div className="my-4 space-y-8">
      <p className="text-[13px] text-[#64748b]">
        {ids.length} fiche{ids.length > 1 ? 's' : ''} de calcul (annexe)
      </p>
      {ids.map((cid) => (
        <div key={cid} className="break-before-page print:break-before-page">
          <AlizeFicheEmbed calculId={cid} />
        </div>
      ))}
    </div>
  )
}

function PreviewMediaCards({ content, documentsById }) {
  const cards = Array.isArray(content?.cards) ? [...content.cards] : []
  cards.sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
  if (!cards.length) return null
  return (
    <div className="my-5 space-y-6">
      {cards.map((card, index) => {
        const doc = documentsById[String(card.document_id)] || null
        const path = doc?.stored_path || ''
        const caption = card.caption || doc?.label || ''
        return (
          <figure key={`${card.document_id || 'x'}-${index}`} className="mx-auto max-w-3xl">
            {path ? (
              <div className="overflow-hidden rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
                <AuthStorageImage
                  storedPath={path}
                  alt={caption}
                  className="mx-auto max-h-[480px] w-full object-contain"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#cbd5e1] px-4 py-10 text-center text-[13px] text-[#64748b]">
                Figure non liée
              </div>
            )}
            {caption ? (
              <figcaption className="mt-2 text-center text-[12px] text-[#64748b]">{caption}</figcaption>
            ) : null}
          </figure>
        )
      })}
    </div>
  )
}

function PreviewBlock({ blockType, content, documentsById, instance, calculs, calculsById }) {
  if (blockType === 'calcul_fiches') {
    return <PreviewCalculFiches content={content} calculs={calculs} />
  }
  if (blockType === 'calculs_table') {
    const ids = resolveCalculIds(content, calculs)
    if (!ids.length) return null
    return (
      <ul className="my-3 list-disc space-y-1 pl-5 text-[14px] text-[#1f2937]">
        {ids.map((cid) => {
          const calc = calculsById[String(cid)]
          return (
            <li key={cid}>
              {calc?.nom_calcul || calc?.reference || `Calcul #${cid}`}
              {calc?.a_retenir ? ' · retenu' : ''}
            </li>
          )
        })}
      </ul>
    )
  }
  if (!hasRenderableContent(blockType, content) && blockType !== 'meta_document') {
    if (blockType === 'meta_document') {
      return <PreviewMeta content={content || {}} instance={instance} />
    }
    return null
  }
  switch (blockType) {
    case 'rich_text':
      return <PreviewRichText content={content} />
    case 'bullet_list':
      return <PreviewBulletList content={content} />
    case 'checklist':
      return <PreviewBulletList content={content} checklist />
    case 'key_value_table':
      return <PreviewKeyValueTable content={content} />
    case 'free_table':
      return <PreviewFreeTable content={content} />
    case 'meta_document':
      return <PreviewMeta content={content} instance={instance} />
    case 'media_cards':
      return <PreviewMediaCards content={content} documentsById={documentsById} />
    case 'materiau_status':
      return (
        <PreviewFreeTable
          content={{
            headers: ['Matériau', 'Formulation', 'Module', 'Origine', 'Statut'],
            rows: (content.items || []).map((it) => [
              it.materiau || '',
              it.formulation || '',
              it.module ?? '',
              it.origine || '',
              it.status || '',
            ]),
          }}
        />
      )
    default:
      return null
  }
}

export default function AvisTechniquePreviewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = resolveReturnTo(searchParams, `/avis-technique/${id}`)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [instance, setInstance] = useState(null)
  const [documents, setDocuments] = useState([])
  const [calculs, setCalculs] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await avisTechniqueApi.getInstance(Number(id))
        if (cancelled) return
        setInstance(data)
        if (data.demande_id) {
          const [nav, calcs] = await Promise.all([
            demandesApi.navigation(data.demande_id),
            calculsApi.list({ demande_id: data.demande_id }),
          ])
          if (cancelled) return
          setDocuments(normalizeDocs(nav?.documents || []))
          setCalculs(Array.isArray(calcs) ? calcs : [])
        }
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Impossible de charger la prévisualisation'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const flatSections = useMemo(
    () => buildSectionTree(instance?.template?.definition?.sections),
    [instance],
  )
  const documentsById = useMemo(
    () => Object.fromEntries(documents.map((d) => [String(d.id), d])),
    [documents],
  )
  const calculsById = useMemo(
    () => Object.fromEntries(calculs.map((c) => [String(c.id), c])),
    [calculs],
  )
  const contents = instance?.contents || {}

  const editHref = buildPathWithReturnTo(`/avis-technique/${id}`, returnTo)

  return (
    <div className="min-h-screen bg-[#e8edf3] print:bg-white">
      <div className="sticky top-0 z-20 border-b border-[#d0d7e2] bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748b]">Prévisualisation</div>
            <div className="text-[15px] font-bold text-[#0f172a]">
              {instance?.reference || 'Avis technique'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(returnTo)}>
              ← Retour
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(editHref)}>
              Éditer
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => avisTechniqueApi.downloadDocx(Number(id)).catch((err) => setError(getApiErrorMessage(err)))}
            >
              Export Word
            </Button>
            <Button type="button" variant="primary" onClick={() => window.print()}>
              Imprimer
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
        {loading ? <p className="text-[14px] text-[#64748b]">Chargement…</p> : null}
        {error ? <p className="mb-3 text-[14px] text-[#a32d2d]">{error}</p> : null}

        {!loading && instance ? (
          <article className="rounded-2xl border border-[#dbe1ea] bg-white px-8 py-10 shadow-sm print:rounded-none print:border-0 print:shadow-none print:px-0 print:py-0">
            <header className="mb-10 border-b border-[#e2e8f0] pb-8">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
                Note technique / Avis
              </p>
              <h1 className="mt-2 text-[28px] font-bold leading-tight text-[#0f172a]">
                {instance.titre || instance.meta?.title || 'Avis technique'}
              </h1>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#475569]">
                <span className="font-mono font-semibold text-[#003170]">{instance.reference}</span>
                {instance.auteur ? <span>{instance.auteur}</span> : null}
                {instance.statut ? <span>{instance.statut}</span> : null}
                {instance.meta?.document_date ? <span>{instance.meta.document_date}</span> : null}
              </div>
            </header>

            <div className="space-y-10">
              {flatSections.map((section) => {
                const blocks = Array.isArray(section.blocks) ? section.blocks : []
                const isChapter = Boolean(section.navigable_only) || (section.parent_id == null && section.id !== 'cover')
                const annex = isAnnexSection(section)
                const renderedBlocks = blocks
                  .map((blockDef) => {
                    const slotId = blockDef.slot_id
                    const blockType = blockDef.block_type
                    const slot = slotPayload(contents, section.id, slotId)
                    const content = slot?.content || {}
                    const type = slot?.block_type || blockType
                    if (!hasRenderableContent(type, content) && type !== 'meta_document') return null
                    if (type === 'meta_document' && !hasRenderableContent(type, content) && !(instance.meta && Object.keys(instance.meta).length)) {
                      return null
                    }
                    return (
                      <div key={`${section.id}-${slotId}`} className="mt-4">
                        {blockDef.label && !['Texte', 'Commentaire', 'Introduction', 'Fiches de calcul'].includes(blockDef.label) ? (
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                            {blockDef.label}
                          </div>
                        ) : null}
                        <PreviewBlock
                          blockType={type}
                          content={content}
                          documentsById={documentsById}
                          instance={instance}
                          calculs={calculs}
                          calculsById={calculsById}
                        />
                      </div>
                    )
                  })
                  .filter(Boolean)

                if (isChapter && !renderedBlocks.length) {
                  return (
                    <section
                      key={section.id}
                      id={`sec-${section.id}`}
                      className={`scroll-mt-24 ${annex ? 'break-before-page print:break-before-page' : ''}`}
                    >
                      <h2 className="border-b border-[#003170]/pb-2 text-[22px] font-bold text-[#003170]">
                        {section.title}
                      </h2>
                    </section>
                  )
                }

                if (!renderedBlocks.length && section.id !== 'cover') return null

                const HeadingTag = section.depth === 0 || annex ? 'h2' : 'h3'
                const headingCls = (section.depth === 0 || annex)
                  ? 'border-b border-[#003170]/pb-2 text-[22px] font-bold text-[#003170]'
                  : 'text-[17px] font-bold text-[#0f172a]'

                return (
                  <section
                    key={section.id}
                    id={`sec-${section.id}`}
                    className={`scroll-mt-24 ${annex ? 'break-before-page print:break-before-page pt-4' : ''}`}
                  >
                    {section.id !== 'cover' ? (
                      <HeadingTag className={headingCls}>
                        {annex ? `Annexe — ${section.title.replace(/^Annexe\s*\d+\s*-?\s*/i, '') || section.title}` : section.title}
                      </HeadingTag>
                    ) : null}
                    {renderedBlocks}
                  </section>
                )
              })}
            </div>
          </article>
        ) : null}
      </div>
    </div>
  )
}
