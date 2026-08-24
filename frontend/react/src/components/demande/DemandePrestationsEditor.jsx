import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import {
  RST_NEED_STATUS_OPTIONS,
  RST_PRESTATION_TEMPLATES,
  buildPrestationFollowUp,
  createStructuredNeed,
  normalizeStructuredNeed,
  serializePrestations,
} from '@/lib/rstPrestationTemplates'

function Textarea({ value, onChange, rows = 3, placeholder = '' }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg outline-none focus:border-nge resize-y"
    />
  )
}

function PrestationCard({ item, onChange, onRemove, followUp, onFollowUp }) {
  function set(key, value) {
    onChange({ ...item, [key]: value })
  }

  return (
    <div className="rounded-2xl border border-[#dbe1ea] bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e5eaf1] bg-[#f8fafc] px-4 py-3">
        <span className="inline-flex rounded-full bg-[#003170] px-2.5 py-1 text-[10px] font-black tracking-[.08em] text-white">
          {item.domain_code || 'RST'}
        </span>
        <input
          value={item.need_label ?? ''}
          onChange={(event) => set('need_label', event.target.value)}
          placeholder="Prestation / objectif"
          className="min-w-[220px] flex-1 border-0 bg-transparent px-1 py-1 text-[13px] font-black text-[#172033] outline-none"
        />
        <Select
          value={item.request_status ?? 'À confirmer'}
          onChange={(event) => set('request_status', event.target.value)}
          className="text-xs py-1.5 min-w-[130px]"
        >
          {RST_NEED_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>
        {followUp ? (
          <Button size="sm" onClick={() => onFollowUp?.(followUp)}>
            {followUp.label}
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg px-2 py-1 text-xs font-black text-danger hover:bg-[#fcebeb]"
          title="Supprimer la prestation"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-4">
        <div className="lg:col-span-4">
          <label className="mb-1 block text-[10px] font-medium text-text-muted">
            Description / résultat attendu (haut niveau)
          </label>
          <Textarea
            value={item.description}
            onChange={(value) => set('description', value)}
            rows={2}
            placeholder="Décrire le besoin global. Le détail technique sera traité en Préparation."
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium text-text-muted">Volume estimé</label>
          <Input value={item.quantity ?? ''} onChange={(event) => set('quantity', event.target.value)} />
        </div>
        <div className="lg:col-span-3" />
        <div className="lg:col-span-4">
          <label className="mb-1 block text-[10px] font-medium text-text-muted">Notes</label>
          <Textarea value={item.notes} onChange={(value) => set('notes', value)} rows={2} />
        </div>
      </div>
    </div>
  )
}

export default function DemandePrestationsEditor({
  prestations = [],
  onChange,
  onSave,
  isSaving = false,
  followUpContext = null,
}) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])

  useEffect(() => {
    setItems((prestations || []).map((item) => normalizeStructuredNeed(item)))
  }, [prestations])

  const summary = useMemo(() => ({
    total: items.length,
    active: items.filter((item) => !['Annulé', 'Hors périmètre'].includes(item.request_status)).length,
  }), [items])

  function updateItems(nextItems) {
    setItems(nextItems)
    onChange?.(nextItems)
  }

  function addFromTemplate(template) {
    updateItems([...items, createStructuredNeed(template)])
  }

  function updateItem(index, nextItem) {
    updateItems(items.map((item, itemIndex) => (itemIndex === index ? nextItem : item)))
  }

  function removeItem(index) {
    updateItems(items.filter((_, itemIndex) => itemIndex !== index))
  }

  function handleSave() {
    onSave?.(serializePrestations(items))
  }

  function handleFollowUp(followUp) {
    if (!followUp?.href) return
    navigate(followUp.href)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[10px] border border-[#dbe1ea] bg-[#f8fafc] px-4 py-3 text-[12px] leading-relaxed text-[#69758a]">
        Cadrer les prestations RST demandées. Elles seront reprises en Préparation pour le détail
        technique, les essais et les campagnes.
      </div>

      <div className="rounded-2xl border border-[#dbe1ea] bg-[#f8fafc] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] font-black text-[#172033]">Ajouter une famille de prestation</div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="rounded-full border border-[#dbe1ea] bg-white px-2.5 py-1">
              {summary.total} prestation{summary.total !== 1 ? 's' : ''}
            </span>
            <span className="rounded-full border border-[#dbe1ea] bg-white px-2.5 py-1">
              {summary.active} à préparer
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {RST_PRESTATION_TEMPLATES.map((template) => (
            <button
              key={template.key}
              type="button"
              onClick={() => addFromTemplate(template)}
              className="rounded-xl border border-[#cfd7e4] bg-white px-3 py-2 text-xs font-black text-[#003170] transition-colors hover:border-[#003170] hover:bg-[#eef4fb]"
            >
              + {template.need_label}
            </button>
          ))}
        </div>
      </div>

      {items.length ? (
        <div className="flex flex-col gap-3">
          {items.map((item, index) => {
            const followUp = followUpContext
              ? buildPrestationFollowUp(item, followUpContext)
              : null
            return (
              <PrestationCard
                key={item.client_key || item.uid || index}
                item={item}
                followUp={followUp}
                onFollowUp={handleFollowUp}
                onChange={(next) => updateItem(index, next)}
                onRemove={() => removeItem(index)}
              />
            )
          })}
        </div>
      ) : (
        <div className="rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 text-center text-[13px] text-[#69758a]">
          Aucune prestation renseignée. Ajoutez les familles RST concernées par cette demande.
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer prestations'}
        </Button>
      </div>
    </div>
  )
}
