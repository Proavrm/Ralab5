/**
 * Éditeurs génériques par block_type (aucune section métier hardcodée).
 */
import { useEffect, useState } from 'react'
import Input, { Select, Textarea } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { fetchAuthorizedStorageBlobUrl } from '@/services/api'

function isImagePath(storedPath) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(storedPath || ''))
}

export function AuthStorageImage({ storedPath, alt = '', className = '' }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let blobUrl = ''
    setSrc('')
    setFailed(false)
    if (!storedPath || !isImagePath(storedPath)) {
      setFailed(true)
      return undefined
    }
    ;(async () => {
      try {
        const url = await fetchAuthorizedStorageBlobUrl(storedPath)
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        blobUrl = url
        setSrc(url)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [storedPath])

  if (failed) {
    return (
      <div className="px-3 text-center text-[12px] text-text-muted">Aperçu indisponible</div>
    )
  }
  if (!src) {
    return <div className="px-3 text-center text-[12px] text-text-muted">Chargement…</div>
  }
  return <img src={src} alt={alt} className={className} />
}

function FieldLabel({ children }) {
  return <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{children}</div>
}

export function RichTextBlockEditor({ content, onChange }) {
  return (
    <Textarea
      rows={6}
      value={content?.text || ''}
      onChange={(e) => onChange({ ...content, text: e.target.value })}
      placeholder="Texte…"
    />
  )
}

export function BulletListBlockEditor({ content, onChange, checklist = false }) {
  const items = Array.isArray(content?.items) ? content.items : []

  function updateItem(index, next) {
    const copy = items.map((item, i) => (i === index ? next : item))
    onChange({ ...content, items: copy })
  }

  function addItem() {
    onChange({
      ...content,
      items: [...items, checklist ? { text: '', done: false } : ''],
    })
  }

  function removeItem(index) {
    onChange({ ...content, items: items.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const text = typeof item === 'string' ? item : String(item?.text || '')
        const done = typeof item === 'object' ? Boolean(item?.done || item?.checked) : false
        return (
          <div key={index} className="flex items-start gap-2">
            {checklist ? (
              <input
                type="checkbox"
                className="mt-2"
                checked={done}
                onChange={(e) => updateItem(index, { text, done: e.target.checked })}
              />
            ) : null}
            <Input
              value={text}
              onChange={(e) => {
                if (checklist || typeof item === 'object') {
                  updateItem(index, { text: e.target.value, done })
                } else {
                  updateItem(index, e.target.value)
                }
              }}
            />
            <Button type="button" variant="ghost" onClick={() => removeItem(index)}>
              ×
            </Button>
          </div>
        )
      })}
      <Button type="button" variant="secondary" onClick={addItem}>
        + Ajouter
      </Button>
    </div>
  )
}

export function KeyValueTableBlockEditor({ content, onChange }) {
  const rows = Array.isArray(content?.rows) ? content.rows : []

  function updateRow(index, patch) {
    const copy = rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    onChange({ ...content, rows: copy })
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={row?.key || ''}
            placeholder="Clé"
            onChange={(e) => updateRow(index, { key: e.target.value })}
          />
          <Input
            value={row?.value || ''}
            placeholder="Valeur"
            onChange={(e) => updateRow(index, { value: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange({ ...content, rows: rows.filter((_, i) => i !== index) })}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange({ ...content, rows: [...rows, { key: '', value: '' }] })}
      >
        + Ligne
      </Button>
    </div>
  )
}

function normalizeFreeTables(content) {
  if (Array.isArray(content?.tables) && content.tables.length > 0) {
    return content.tables.map((t) => ({
      caption: t?.caption || '',
      headers: Array.isArray(t?.headers) ? t.headers : [],
      rows: Array.isArray(t?.rows) ? t.rows : [],
    }))
  }
  // Compat: ancien format headers/rows au premier niveau
  if (content?.headers || content?.rows) {
    return [
      {
        caption: content?.caption || '',
        headers: Array.isArray(content?.headers) ? content.headers : [],
        rows: Array.isArray(content?.rows) ? content.rows : [],
      },
    ]
  }
  return [{ caption: '', headers: ['Col 1', 'Col 2'], rows: [['', '']] }]
}

function SingleFreeTableGrid({ table, onChange, onRemove, canRemove }) {
  const headers = Array.isArray(table?.headers) ? table.headers : []
  const rows = Array.isArray(table?.rows) ? table.rows : []
  const colCount = Math.max(headers.length, 1)

  function setHeaders(nextHeaders) {
    const cols = Math.max(nextHeaders.length, 1)
    onChange({
      ...table,
      headers: nextHeaders,
      rows: rows.map((r) => {
        const copy = Array.isArray(r) ? [...r] : []
        while (copy.length < cols) copy.push('')
        return copy.slice(0, cols)
      }),
    })
  }

  return (
    <div className="space-y-2 rounded-xl border border-[#dbe1ea] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={table?.caption || ''}
          placeholder="Légende du tableau (optionnel)"
          onChange={(e) => onChange({ ...table, caption: e.target.value })}
          className="min-w-[220px] flex-1"
        />
        {canRemove ? (
          <Button type="button" variant="ghost" onClick={onRemove}>
            Supprimer tableau
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr>
              {Array.from({ length: colCount }).map((_, cIdx) => (
                <th key={`h-${cIdx}`} className="border border-[#dbe1ea] bg-[#f8fafc] p-1 font-semibold">
                  <Input
                    value={headers[cIdx] || ''}
                    placeholder={`Col ${cIdx + 1}`}
                    onChange={(e) => {
                      const next = [...headers]
                      while (next.length < colCount) next.push('')
                      next[cIdx] = e.target.value
                      setHeaders(next)
                    }}
                  />
                </th>
              ))}
              <th className="w-10 border border-[#dbe1ea] bg-[#f8fafc] p-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => {
              const values = Array.isArray(row) ? row : []
              return (
                <tr key={rIdx}>
                  {Array.from({ length: colCount }).map((_, cIdx) => (
                    <td key={`${rIdx}-${cIdx}`} className="border border-[#dbe1ea] p-1 align-top">
                      <Textarea
                        rows={Math.min(4, Math.max(1, String(values[cIdx] || '').split('\n').length))}
                        value={values[cIdx] || ''}
                        onChange={(e) => {
                          const nextRows = rows.map((r, i) => {
                            if (i !== rIdx) return r
                            const copy = Array.isArray(r) ? [...r] : []
                            while (copy.length < colCount) copy.push('')
                            copy[cIdx] = e.target.value
                            return copy
                          })
                          onChange({ ...table, rows: nextRows })
                        }}
                      />
                    </td>
                  ))}
                  <td className="border border-[#dbe1ea] p-1 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onChange({ ...table, rows: rows.filter((_, i) => i !== rIdx) })}
                    >
                      ×
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange({
              ...table,
              rows: [...rows, Array.from({ length: colCount }, () => '')],
            })
          }
        >
          + Ligne
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setHeaders([...headers, `Col ${headers.length + 1}`])}
        >
          + Colonne
        </Button>
        {colCount > 1 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setHeaders(headers.slice(0, -1))}
          >
            − Colonne
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function FreeTableBlockEditor({ content, onChange }) {
  const tables = normalizeFreeTables(content)

  function commit(nextTables) {
    onChange({ ...content, tables: nextTables, headers: undefined, rows: undefined })
  }

  return (
    <div className="space-y-3">
      {tables.map((table, index) => (
        <SingleFreeTableGrid
          key={index}
          table={table}
          canRemove={tables.length > 1}
          onChange={(next) => commit(tables.map((t, i) => (i === index ? next : t)))}
          onRemove={() => commit(tables.filter((_, i) => i !== index))}
        />
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          commit([
            ...tables,
            { caption: '', headers: ['Col 1', 'Col 2'], rows: [['', '']] },
          ])
        }
      >
        + Ajouter un tableau
      </Button>
    </div>
  )
}

export function MetaDocumentBlockEditor({ content, onChange, instanceMeta }) {
  const fields = { ...(instanceMeta || {}), ...(content?.fields || {}) }
  const keys = Object.keys(fields).length
    ? Object.keys(fields)
    : ['title', 'reference', 'author', 'document_date', 'status']

  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div key={key}>
          <FieldLabel>{key}</FieldLabel>
          <Input
            value={fields[key] ?? ''}
            onChange={(e) =>
              onChange({
                ...content,
                fields: { ...fields, [key]: e.target.value },
              })
            }
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          const key = window.prompt('Nom du champ ?')
          if (!key) return
          onChange({ ...content, fields: { ...fields, [key]: '' } })
        }}
      >
        + Champ
      </Button>
    </div>
  )
}

export function MediaCardsBlockEditor({ content, onChange, documents = [] }) {
  const cards = Array.isArray(content?.cards) ? [...content.cards] : []
  cards.sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
  const docsById = Object.fromEntries(documents.map((d) => [String(d.id), d]))

  function commit(nextCards) {
    onChange({
      ...content,
      cards: nextCards.map((card, index) => ({ ...card, order: index })),
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => {
          const doc = docsById[String(card.document_id)] || null
          const hasImage = Boolean(doc?.stored_path) && isImagePath(doc.stored_path)
          return (
            <div
              key={`${card.document_id || 'x'}-${index}`}
              className="overflow-hidden rounded-xl border border-[#dbe1ea] bg-white shadow-sm"
            >
              <div className="flex h-36 items-center justify-center bg-[#f1f5f9]">
                {hasImage ? (
                  <AuthStorageImage
                    storedPath={doc.stored_path}
                    alt={card.caption || doc.label || ''}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="px-3 text-center text-[12px] text-text-muted">
                    {doc?.label || doc?.document_type || 'Sans aperçu'}
                  </div>
                )}
              </div>
              <div className="space-y-2 p-3">
                <Select
                  value={card.document_id ?? ''}
                  onChange={(e) => {
                    const next = cards.map((c, i) =>
                      i === index
                        ? {
                            ...c,
                            document_id: e.target.value ? Number(e.target.value) : null,
                          }
                        : c,
                    )
                    commit(next)
                  }}
                >
                  <option value="">— Document —</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label || d.document_type || `#${d.id}`}
                    </option>
                  ))}
                </Select>
                <Input
                  value={card.caption || ''}
                  placeholder="Légende"
                  onChange={(e) => {
                    const next = cards.map((c, i) => (i === index ? { ...c, caption: e.target.value } : c))
                    commit(next)
                  }}
                />
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => {
                      if (index === 0) return
                      const next = [...cards]
                      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                      commit(next)
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={index >= cards.length - 1}
                    onClick={() => {
                      if (index >= cards.length - 1) return
                      const next = [...cards]
                      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
                      commit(next)
                    }}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => commit(cards.filter((_, i) => i !== index))}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
        <button
          type="button"
          onClick={() =>
            commit([
              ...cards,
              { document_id: null, caption: '', order: cards.length, display: 'full_width' },
            ])
          }
          className="flex min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-[#94a3b8] bg-[#f8fafc] text-[13px] font-medium text-[#003170] hover:border-[#003170]"
        >
          + Ajouter une figure
        </button>
      </div>
    </div>
  )
}

export function DocumentGalleryBlockEditor({ content, onChange, documents = [] }) {
  const items = Array.isArray(content?.items) ? content.items : []

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Select
            value={item.document_id ?? ''}
            onChange={(e) => {
              const next = items.map((it, i) =>
                i === index
                  ? { ...it, document_id: e.target.value ? Number(e.target.value) : null }
                  : it,
              )
              onChange({ ...content, items: next })
            }}
          >
            <option value="">— Document —</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label || d.document_type || `#${d.id}`}
              </option>
            ))}
          </Select>
          <Input
            value={item.caption || item.label || ''}
            placeholder="Libellé / légende"
            onChange={(e) => {
              const next = items.map((it, i) => (i === index ? { ...it, caption: e.target.value } : it))
              onChange({ ...content, items: next })
            }}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange({ ...content, items: items.filter((_, i) => i !== index) })}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange({ ...content, items: [...items, { document_id: null, caption: '' }] })}
      >
        + Document
      </Button>
    </div>
  )
}

export function CalculsTableBlockEditor({ content, onChange, calculs = [] }) {
  const selected = new Set((content?.calcul_ids || []).map(Number))

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ ...content, calcul_ids: [...next], auto_from_binding: false })
  }

  return (
    <div className="space-y-2">
      {calculs.length === 0 ? (
        <p className="text-[13px] text-text-muted">Aucun calcul sur cette demande.</p>
      ) : (
        calculs.map((calc) => (
          <label key={calc.id} className="flex items-center gap-2 rounded-lg border border-[#e5e9f0] px-3 py-2 text-[13px]">
            <input type="checkbox" checked={selected.has(Number(calc.id))} onChange={() => toggle(Number(calc.id))} />
            <span className="font-medium">{calc.nom_calcul || calc.reference}</span>
            <span className="text-text-muted">
              {calc.a_retenir ? '★ retenu · ' : ''}{calc.avis || calc.statut || ''}
            </span>
          </label>
        ))
      )}
    </div>
  )
}

export function MateriauStatusBlockEditor({ content, onChange }) {
  const items = Array.isArray(content?.items) ? content.items : []

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-[#e5e9f0] p-2 sm:grid-cols-5">
          <Input
            value={item.materiau || ''}
            placeholder="Matériau"
            onChange={(e) => {
              const next = items.map((it, i) => (i === index ? { ...it, materiau: e.target.value } : it))
              onChange({ ...content, items: next, auto_from_binding: false })
            }}
          />
          <Input
            value={item.formulation || ''}
            placeholder="Formulation"
            onChange={(e) => {
              const next = items.map((it, i) => (i === index ? { ...it, formulation: e.target.value } : it))
              onChange({ ...content, items: next, auto_from_binding: false })
            }}
          />
          <Input
            value={item.module ?? ''}
            placeholder="Module"
            onChange={(e) => {
              const next = items.map((it, i) => (i === index ? { ...it, module: e.target.value } : it))
              onChange({ ...content, items: next, auto_from_binding: false })
            }}
          />
          <Input
            value={item.origine || ''}
            placeholder="Origine"
            onChange={(e) => {
              const next = items.map((it, i) => (i === index ? { ...it, origine: e.target.value } : it))
              onChange({ ...content, items: next, auto_from_binding: false })
            }}
          />
          <Input
            value={item.status || ''}
            placeholder="Statut"
            onChange={(e) => {
              const next = items.map((it, i) => (i === index ? { ...it, status: e.target.value } : it))
              onChange({ ...content, items: next, auto_from_binding: false })
            }}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          onChange({
            ...content,
            auto_from_binding: false,
            items: [...items, { materiau: '', formulation: '', module: '', origine: '', status: '' }],
          })
        }
      >
        + Matériau
      </Button>
    </div>
  )
}

export function BlockEditor({ blockType, content, onChange, documents, calculs, instanceMeta }) {
  switch (blockType) {
    case 'rich_text':
      return <RichTextBlockEditor content={content} onChange={onChange} />
    case 'bullet_list':
      return <BulletListBlockEditor content={content} onChange={onChange} />
    case 'checklist':
      return <BulletListBlockEditor content={content} onChange={onChange} checklist />
    case 'key_value_table':
      return <KeyValueTableBlockEditor content={content} onChange={onChange} />
    case 'free_table':
      return <FreeTableBlockEditor content={content} onChange={onChange} />
    case 'meta_document':
      return <MetaDocumentBlockEditor content={content} onChange={onChange} instanceMeta={instanceMeta} />
    case 'media_cards':
      return <MediaCardsBlockEditor content={content} onChange={onChange} documents={documents} />
    case 'document_gallery':
      return <DocumentGalleryBlockEditor content={content} onChange={onChange} documents={documents} />
    case 'calculs_table':
    case 'calcul_fiches':
      return <CalculsTableBlockEditor content={content} onChange={onChange} calculs={calculs} />
    case 'materiau_status':
      return <MateriauStatusBlockEditor content={content} onChange={onChange} />
    default:
      return (
        <Textarea
          rows={4}
          value={JSON.stringify(content || {}, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value || '{}'))
            } catch {
              /* ignore while typing */
            }
          }}
        />
      )
  }
}
