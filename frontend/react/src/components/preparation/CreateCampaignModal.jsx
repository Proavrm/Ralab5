import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { interventionCampaignsApi } from '@/services/api'

const NO_TEMPLATE = ''

function normalizeCampaignCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

function toTemplateOption(row) {
  return {
    code: row?.code || '',
    label: row?.label || row?.code || 'Campagne',
    category: row?.category || '',
  }
}

export default function CreateCampaignModal({ open, onClose, onConfirm, existingCodes = [] }) {
  const qc = useQueryClient()
  const [templateCode, setTemplateCode] = useState(NO_TEMPLATE)
  const [draftCode, setDraftCode] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [formError, setFormError] = useState('')

  const { data: catalogRows = [], isLoading, error: catalogError } = useQuery({
    queryKey: ['campaign-type-catalog'],
    queryFn: () => interventionCampaignsApi.listTypeCatalog(),
    enabled: open,
  })

  const createTypeMutation = useMutation({
    mutationFn: (payload) => interventionCampaignsApi.createTypeCatalog(payload),
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['campaign-type-catalog'] })
      if (saved?.code) setTemplateCode(saved.code)
      setDraftCode('')
      setDraftLabel('')
      setDraftDescription('')
      setDraftCategory('')
      setFormError('')
    },
    onError: (error) => setFormError(error.message || 'Impossible d\'ajouter ce type.'),
  })

  const normalizedExisting = useMemo(
    () => existingCodes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean),
    [existingCodes],
  )

  const catalogTemplates = useMemo(
    () => (catalogRows || []).map(toTemplateOption),
    [catalogRows],
  )

  const groupedTemplates = useMemo(() => {
    const groups = new Map()
    for (const template of catalogTemplates) {
      const key = template.category || 'Autre'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(template)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'fr'))
  }, [catalogTemplates])

  const selectedTemplate = useMemo(
    () => catalogTemplates.find((item) => item.code === templateCode) || null,
    [catalogTemplates, templateCode],
  )

  const templateTaken = Boolean(
    selectedTemplate?.code
    && normalizedExisting.includes(String(selectedTemplate.code).toUpperCase()),
  )

  useEffect(() => {
    if (!open) return
    setTemplateCode(NO_TEMPLATE)
    setDraftCode('')
    setDraftLabel('')
    setDraftDescription('')
    setDraftCategory('')
    setFormError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      document.getElementById('create-campaign-template')?.focus()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [open])

  function handleConfirm() {
    if (!selectedTemplate || templateTaken) return
    onConfirm?.({
      ...selectedTemplate,
      label: selectedTemplate.label,
      description: '',
    })
    onClose?.()
  }

  function handleCreateType() {
    setFormError('')
    const code = normalizeCampaignCode(draftCode)
    const label = String(draftLabel || '').trim()
    if (code.length < 2) {
      setFormError('Code obligatoire (2 caractères minimum).')
      return
    }
    if (!label) {
      setFormError('Libellé obligatoire.')
      return
    }
    createTypeMutation.mutate({
      code,
      label,
      description: String(draftDescription || '').trim(),
      category: String(draftCategory || '').trim(),
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Créer une campagne" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-[12px] leading-relaxed text-[#69758a]">
          Le cadrage (nom, périmètre, prestations) vient de la demande et de la passation.
          Choisissez ici le type de campagne à ouvrir.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-[#003170]">Type de campagne</span>
          <Select
            id="create-campaign-template"
            value={templateCode}
            onChange={(event) => {
              setTemplateCode(event.target.value)
              setFormError('')
            }}
            disabled={isLoading || Boolean(catalogError)}
            className="w-full py-2.5"
          >
            <option value={NO_TEMPLATE} disabled>— Choisir —</option>
            {groupedTemplates.map(([category, items]) => (
              <optgroup key={category} label={category}>
                {items.map((template) => {
                  const taken = normalizedExisting.includes(String(template.code).toUpperCase())
                  return (
                    <option key={template.code} value={template.code} disabled={taken}>
                      {template.label}{taken ? ' (déjà sur la demande)' : ''}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </Select>
        </label>

        {isLoading ? (
          <div className="text-[12px] text-[#69758a]">Chargement du catalogue…</div>
        ) : null}

        {catalogError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {catalogError.message || 'Catalogue indisponible.'}
          </div>
        ) : null}

        {templateTaken ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            Ce type est déjà ouvert sur cette demande.
          </div>
        ) : null}

        <details className="rounded-lg border border-[#dbe1ea] bg-[#fbfcfe] px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-semibold text-[#69758a]">
            Ajouter un type au catalogue
          </summary>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pb-1">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#69758a]">Code</span>
              <Input value={draftCode} onChange={(e) => setDraftCode(e.target.value)} placeholder="Ex. SUIV-SPEC" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#69758a]">Libellé</span>
              <Input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-[#69758a]">Description</span>
              <Input value={draftDescription} onChange={(e) => setDraftDescription(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#69758a]">Catégorie</span>
              <Input value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)} />
            </label>
            <div className="flex items-end">
              <Button size="sm" variant="secondary" onClick={handleCreateType} disabled={createTypeMutation.isPending}>
                {createTypeMutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
            {formError ? <div className="sm:col-span-2 text-[12px] text-red-700">{formError}</div> : null}
          </div>
        </details>

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!selectedTemplate || templateTaken}
          >
            Créer la campagne
          </Button>
        </div>
      </div>
    </Modal>
  )
}
