import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { pmtEssaisApi } from '../../services/api'
import {
  listModelDefinitionsPMT,
  upsertModelDefinitionPMT,
} from '../../services/pmtModelWorkStore'
import { createDefaultPmtDraft } from '../../lib/pmt/draft'
import { normalizePmtRuntimeValues } from '../../lib/pmt/normalize'
import {
  computeDiameterFromPmtAndVolume,
  computePmtFromDiameterAndVolume,
  computeVolumeFromDiameterAndPmt,
  parsePmtNumericValue,
  sanitizePmtNumberFieldInput,
  summarizePmtRows,
} from '../../lib/pmt/compute'
import {
  TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS,
  TERRAIN_FABRICATION_SITE_SELECT_OPTIONS,
  TERRAIN_FORMULA_SELECT_OPTIONS,
  TERRAIN_OPERATOR_SELECT_OPTIONS,
  TERRAIN_PRODUCT_SELECT_OPTIONS,
  renderTerrainSelectOptionExtras,
} from '../../lib/terrainEssaiSelectOptions'
import { hasPositionCode, normalizePositionCodes, togglePositionCode } from '../../lib/positionCodes'

function createModelPayload(reference = '') {
  return {
    id: `PMT-${Date.now()}`,
    code: 'PMT',
    status: 'draft',
    reference: reference || `2025-SP-PMT${String(Date.now()).slice(-4)}`,
    values: createDefaultPmtDraft(),
    updated_at: new Date().toISOString(),
  }
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  )
}

function cleanModelReference(value) {
  let text = String(value || '').trim()
  if (!text) return ''
  const suffixPattern = /\s*[-·]\s*(Brouillon|Approuv[eé])$/i
  while (suffixPattern.test(text)) text = text.replace(suffixPattern, '').trim()
  return text
}

const TONE_CLASS = {
  manual: 'border-l-4 border-l-[#7fc998] bg-[#f7fcf9]',
  hierarchy: 'border-l-4 border-l-[#f0b35a] bg-[#fffaf2]',
  neutral: 'border-l-4 border-l-transparent bg-bg',
}

function formatResult(value, unit) {
  if (value == null || value === '') return ''
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
  }
  return `${value}${unit ? ` ${unit}` : ''}`
}

function computePmtConformiteValue(summary, criteriaPmtMin) {
  const avg = parsePmtNumericValue(summary?.profondeur_macrotexture_generale_mm)
  const min = parsePmtNumericValue(criteriaPmtMin)
  if (avg == null || min == null) return 'pour_info'
  return avg >= min ? 'conforme' : 'non_conforme'
}

function isPmtProfondeurNonConforme(profondeurMm, criteriaPmtMin) {
  const v = parsePmtNumericValue(profondeurMm)
  const min = parsePmtNumericValue(criteriaPmtMin)
  if (v == null || min == null) return false
  return v < min
}

function Row({ label, value, tone = 'manual' }) {
  const toneClass = TONE_CLASS[tone] || TONE_CLASS.manual
  return (
    <div className={`rounded-lg px-3 py-2 ${toneClass}`}>
      <span className="block text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`mt-1 block text-[13px] font-medium ${value ? 'text-text' : 'font-normal italic text-text-muted'}`}>
        {value || '—'}
      </span>
    </div>
  )
}

function Select({ value, onChange, readOnly = false, children, className = '' }) {
  return (
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={readOnly}
      className={`w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      {children}
    </select>
  )
}

function Textarea({ value, onChange, rows = 3, readOnly = false }) {
  return (
    <textarea
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      readOnly={readOnly}
      className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-70 read-only:cursor-default read-only:opacity-80"
    />
  )
}

function NumericInput({ value, onChange, readOnly, className = '' }) {
  return (
    <Input
      value={value ?? ''}
      onChange={onChange}
      readOnly={readOnly}
      className={`min-w-[95px] text-right tabular-nums ${className}`}
    />
  )
}

function PositionSelector({ value, onChange, readOnly }) {
  const codes = normalizePositionCodes(value)
  return (
    <div className="flex items-center justify-center gap-2">
      {['G', 'A', 'D'].map((code) => (
        <label key={code} className="inline-flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={hasPositionCode(codes, code)}
            onChange={() => onChange(togglePositionCode(codes, code))}
          />
          <span>{code}</span>
        </label>
      ))}
    </div>
  )
}

function StructureCard({ title, description, right, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border bg-bg px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</div>
          {description ? <p className="mt-1 text-[11px] text-text-muted">{description}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function FieldBox({ label, tone = 'manual', children, full = false }) {
  return (
    <div className={`${full ? 'md:col-span-2' : ''} rounded-lg px-3 py-2 ${TONE_CLASS[tone] || TONE_CLASS.manual}`}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</label>
      {children}
    </div>
  )
}

export default function ModelePMTPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const [selectedModelId, setSelectedModelId] = useState('')
  const [selectedEssaiRef, setSelectedEssaiRef] = useState('')
  const [selectedEssaiId, setSelectedEssaiId] = useState('')
  const [pmtEssaiOptions, setPmtEssaiOptions] = useState([])
  const autoOpenDone = useRef(false)
  const [reference, setReference] = useState('')
  const [draft, setDraft] = useState(createDefaultPmtDraft())
  const [importRef, setImportRef] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState('')

  const models = useMemo(() => listModelDefinitionsPMT(), [revision])
  const selectedModel = useMemo(
    () => models.find((row) => String(row.id) === String(selectedModelId)) || models[0] || null,
    [models, selectedModelId]
  )
  const isModelLocked = false
  const summary = useMemo(
    () => summarizePmtRows(draft?.points_rows || [], draft?.meta?.criteria_pmt_min),
    [draft]
  )
  const computedConformite = useMemo(
    () => computePmtConformiteValue(summary, draft?.meta?.criteria_pmt_min),
    [summary, draft?.meta?.criteria_pmt_min]
  )
  const currentSnapshot = useMemo(() => JSON.stringify({
    reference: String(reference || ''),
    draft: normalizePmtRuntimeValues(draft || {}),
  }), [reference, draft])
  const hasUnsavedChanges = Boolean(savedSnapshot) && currentSnapshot !== savedSnapshot

  useEffect(() => {
    if (models.length > 0) return
    const seeded = upsertModelDefinitionPMT(createModelPayload('2025-SP-PMT0001'))
    setSelectedModelId(String(seeded.id))
    setReference(cleanModelReference(seeded.reference))
    setDraft(normalizePmtRuntimeValues(seeded.values || createDefaultPmtDraft()))
    setResult({ type: 'ok', message: 'Feuille PMT initiale créée.' })
    setRevision((v) => v + 1)
  }, [models.length])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await pmtEssaisApi.list({ limit: 400 })
        if (cancelled) return
        const mapped = (Array.isArray(rows) ? rows : [])
          .map((row) => {
            const essaiId = String(row?.id || '').trim()
            const reference = String(row?.reference || '').trim()
            return {
              essaiId,
              reference,
            }
          })
          .filter((item) => item.essaiId && item.reference)
        setPmtEssaiOptions(mapped)
        if (!String(selectedEssaiRef || '').trim() && mapped.length > 0) {
          setSelectedEssaiRef(String(mapped[0].reference))
        }
      } catch {
        if (!cancelled) setPmtEssaiOptions([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedModel) return
    setSelectedModelId(String(selectedModel.id))
    setReference(cleanModelReference(selectedModel.reference))
    const nextDraft = normalizePmtRuntimeValues(selectedModel.values || createDefaultPmtDraft())
    const nextReference = cleanModelReference(selectedModel.reference)
    setDraft(nextDraft)
    setSelectedEssaiRef(String(nextReference || ''))
    setSelectedEssaiId('')
    setSavedSnapshot(JSON.stringify({ reference: String(nextReference || ''), draft: nextDraft }))
  }, [selectedModel?.id])

  useEffect(() => {
    if (autoOpenDone.current || !pmtEssaiOptions.length) return
    const urlEssaiId = String(searchParams.get('essai_id') || '').trim()
    if (!urlEssaiId) return
    const match = pmtEssaiOptions.find((o) => String(o.essaiId) === urlEssaiId)
    if (!match) return
    autoOpenDone.current = true
    setSelectedEssaiRef(match.reference)
    ;(async () => {
      try {
        const data = await pmtEssaisApi.getByReference(match.reference)
        const importedDraft = normalizePmtRuntimeValues(data?.runtime_values || {})
        const nextMeta = {
          ...(importedDraft?.meta || {}),
          demande_id: data?.demande_id || importedDraft?.meta?.demande_id || '',
          intervention_id: data?.intervention_id || importedDraft?.meta?.intervention_id || '',
          campaign_id: data?.campaign_id || importedDraft?.meta?.campaign_id || '',
        }
        const hydratedDraft = normalizePmtRuntimeValues({ ...importedDraft, meta: nextMeta })
        const loadedId = String(data?.id || '').trim()
        const nextRef = cleanModelReference(match.reference)
        setSelectedEssaiId(loadedId)
        setReference(nextRef)
        setDraft(hydratedDraft)
        setSavedSnapshot(JSON.stringify({ reference: String(nextRef || ''), draft: hydratedDraft }))
        setResult({ type: 'ok', message: `Essai PMT chargé: ${nextRef}` })
      } catch (e) {
        setResult({ type: 'err', message: e?.message || 'Ouverture essai PMT impossible.' })
      }
    })()
  }, [pmtEssaiOptions, searchParams])

  function refresh(preferredModelId = '') {
    setRevision((v) => v + 1)
    if (preferredModelId) setSelectedModelId(String(preferredModelId))
  }

  function handleSaveModel() {
    if (!selectedEssaiId) {
      setResult({ type: 'err', message: 'Ouvrez un essai PMT depuis le sélecteur avant d’enregistrer.' })
      return
    }
    const normalized = normalizePmtRuntimeValues(draft)
    void (async () => {
      try {
        await pmtEssaisApi.putRuntimeValues(selectedEssaiId, { runtime_values: normalized })
        setSavedSnapshot(JSON.stringify({ reference: String(cleanModelReference(reference) || ''), draft: normalized }))
        setResult({ type: 'ok', message: `Feuille PMT enregistrée: ${reference || selectedEssaiRef}` })
      } catch (e) {
        setResult({ type: 'err', message: e?.message || 'Enregistrement PMT impossible.' })
      }
    })()
  }

  async function handleOpenModel() {
    const ref = String(selectedEssaiRef || '').trim()
    if (!ref) return
    if (hasUnsavedChanges) {
      const proceed = window.confirm('Des changements ne sont pas enregistrés. Voulez-vous changer de feuille sans sauvegarder ?')
      if (!proceed) return
    }
    try {
      const data = await pmtEssaisApi.getByReference(ref)
      const importedDraft = normalizePmtRuntimeValues(data?.runtime_values || {})
      const nextMeta = {
        ...(importedDraft?.meta || {}),
        demande_id: data?.demande_id || importedDraft?.meta?.demande_id || '',
        intervention_id: data?.intervention_id || importedDraft?.meta?.intervention_id || '',
        campaign_id: data?.campaign_id || importedDraft?.meta?.campaign_id || '',
      }
      const hydratedDraft = normalizePmtRuntimeValues({ ...importedDraft, meta: nextMeta })
      const loadedId = String(data?.id || '').trim()
      const nextRef = cleanModelReference(ref)
      setSelectedEssaiId(loadedId)
      setReference(nextRef)
      setDraft(hydratedDraft)
      setSavedSnapshot(JSON.stringify({ reference: String(nextRef || ''), draft: hydratedDraft }))
      setResult({ type: 'ok', message: `Essai PMT chargé: ${nextRef || ref}` })
    } catch (e) {
      setResult({ type: 'err', message: e?.message || 'Ouverture essai PMT impossible.' })
    }
  }

  async function handleImportReference() {
    if (!String(importRef || '').trim()) {
      setResult({ type: 'err', message: 'Indique une référence à importer.' })
      return
    }
    const ref = importRef.trim()
    try {
      const data = await pmtEssaisApi.getByReference(ref)
      if (!data?.runtime_values || typeof data.runtime_values !== 'object') {
        throw new Error('Réponse vide')
      }
      const importedDraft = normalizePmtRuntimeValues(data.runtime_values)
      const nextMeta = {
        ...(importedDraft?.meta || {}),
        demande_id: data?.demande_id || importedDraft?.meta?.demande_id || '',
        intervention_id: data?.intervention_id || importedDraft?.meta?.intervention_id || '',
        campaign_id: data?.campaign_id || importedDraft?.meta?.campaign_id || '',
      }
      setDraft(normalizePmtRuntimeValues({ ...importedDraft, meta: nextMeta }))
      setResult({ type: 'ok', message: `Données chargées depuis ${ref} (essai #${data.id}).` })
    } catch (e) {
      setResult({ type: 'err', message: e?.message || 'Import impossible (référence ou serveur).' })
    }
  }

  function handleMetaChange(key, value) {
    const numericMetaKeys = new Set(['volume_materiau_mm3', 'criteria_pmt_min', 'epaisseur_couche_cm'])
    const nextValue = numericMetaKeys.has(key) ? sanitizePmtNumberFieldInput(value) : value
    setDraft((prev) => {
      const meta = { ...(prev?.meta || {}), [key]: nextValue }
      let points_rows = Array.isArray(prev?.points_rows) ? [...prev.points_rows] : []
      if (key === 'volume_materiau_mm3') {
        points_rows = points_rows.map((row) => {
          const pmt = computePmtFromDiameterAndVolume(row?.diametre_moyen_tache_mm, nextValue)
          if (pmt == null) return row
          return { ...row, profondeur_macrotexture_mm: pmt }
        })
      }
      return normalizePmtRuntimeValues({ ...prev, meta, points_rows })
    })
  }

  function handleRowChange(index, key, value) {
    setDraft((prev) => {
      const meta = { ...(prev?.meta || {}) }
      const rows = Array.isArray(prev?.points_rows) ? [...prev.points_rows] : []
      const cell =
        key === 'diametre_moyen_tache_mm' || key === 'profondeur_macrotexture_mm'
          ? sanitizePmtNumberFieldInput(value)
          : key === 'position_codes'
            ? normalizePositionCodes(value)
          : value
      const row = { ...(rows[index] || {}), [key]: cell }
      const vMeta = meta?.volume_materiau_mm3
      const vNum = parsePmtNumericValue(vMeta)

      if (key === 'diametre_moyen_tache_mm') {
        const pmt = computePmtFromDiameterAndVolume(row.diametre_moyen_tache_mm, vMeta)
        if (pmt != null) row.profondeur_macrotexture_mm = pmt
      } else if (key === 'profondeur_macrotexture_mm') {
        if (vNum != null && vNum > 0) {
          const d = computeDiameterFromPmtAndVolume(row.profondeur_macrotexture_mm, vMeta)
          if (d != null) row.diametre_moyen_tache_mm = d
        } else {
          const vol = computeVolumeFromDiameterAndPmt(row.diametre_moyen_tache_mm, row.profondeur_macrotexture_mm)
          if (vol != null) meta.volume_materiau_mm3 = String(vol)
        }
      }

      rows[index] = row
      return normalizePmtRuntimeValues({ ...prev, meta, points_rows: rows })
    })
  }

  function handleAddRow() {
    setDraft((prev) => normalizePmtRuntimeValues({
      ...prev,
      points_rows: [...(Array.isArray(prev?.points_rows) ? prev.points_rows : []), { id: Date.now(), point: '', profil: '', position_codes: [], diametre_moyen_tache_mm: '', profondeur_macrotexture_mm: '', observations: '' }],
    }))
  }

  function handleRemoveRow(index) {
    setDraft((prev) => normalizePmtRuntimeValues({
      ...prev,
      points_rows: (Array.isArray(prev?.points_rows) ? prev.points_rows : []).filter((_, idx) => idx !== index),
    }))
  }

  function handleOpenRapport() {
    const params = new URLSearchParams()
    params.set('mode', 'work')
    if (selectedEssaiId) params.set('pmt_essai_id', String(selectedEssaiId))
    params.set('source_ref', String(reference || selectedEssaiRef || ''))
    if (draft?.meta?.demande_id) params.set('demande_id', String(draft.meta.demande_id))
    if (draft?.meta?.intervention_id) params.set('intervention_id', String(draft.meta.intervention_id))
    if (draft?.meta?.campaign_id || draft?.meta?.campagne_id) {
      params.set('campaign_id', String(draft?.meta?.campaign_id || draft?.meta?.campagne_id))
    }
    navigate(`/rapports/pmt/view?${params.toString()}`)
  }

  function goBack() {
    const returnTo = searchParams.get('return_to')
    navigate(returnTo || '/tools')
  }

  function navTarget(path, id) {
    const normalized = String(id || '').trim()
    return normalized ? `${path}/${encodeURIComponent(normalized)}` : ''
  }

  function renderContextButton(label, path, id) {
    const target = navTarget(path, id)
    const hasId = Boolean(target)
    return (
      <Button
        key={label}
        variant="secondary"
        size="sm"
        disabled={!hasId}
        onClick={() => hasId ? navigate(target) : null}
      >
        {label}
      </Button>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-4 py-3">
      <div className="sticky top-0 z-10 flex min-h-[58px] flex-wrap items-center gap-2 border-b border-border bg-surface px-6">
        <Button variant="secondary" size="sm" onClick={goBack}>
          ← Retour
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-text">Feuille PMT de travail</div>
          <div className="truncate text-[11px] text-text-muted">
            {cleanModelReference(reference) || 'PMT'}
          </div>
        </div>
        <div className="flex min-w-[420px] items-center gap-2">
          <select
            className="h-10 w-full rounded border border-border bg-bg px-3 text-sm"
            value={selectedEssaiRef}
            onChange={(event) => setSelectedEssaiRef(event.target.value)}
          >
            {pmtEssaiOptions.map((item) => (
              <option key={`essai-${item.essaiId}`} value={item.reference}>
                {item.reference}
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenModel}
            disabled={!selectedEssaiRef}
          >
            Ouvrir
          </Button>
          {renderContextButton('Demande', '/demandes', draft?.meta?.demande_id)}
          {renderContextButton('Intervention', '/interventions', draft?.meta?.intervention_id)}
          {renderContextButton('Campagne', '/campagnes', draft?.meta?.campagne_id || draft?.meta?.campaign_id)}
        </div>
      </div>

      <div className="flex flex-col gap-4">
          <StructureCard title="Identification" description="Données de réalisation de l’essai ou de l’intervention.">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
              <Badge className="border-[#b7e2c4] bg-[#f1fbf4] text-[#477d55]">Saisie manuelle / import</Badge>
              <Badge className="border-[#f1d2a4] bg-[#fff8ec] text-[#8a5c11]">Donnée hiérarchique</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Row label="Norme" value={String(draft?.meta?.norme || '').trim() || 'NF EN 13036-1'} tone="manual" />
              <FieldBox label="Date essai"><Input type="date" value={String(draft?.meta?.date_essai || '')} onChange={(event) => handleMetaChange('date_essai', event.target.value)} readOnly={isModelLocked} /></FieldBox>
              <FieldBox label="Opérateur" tone="manual">
                <Select
                  value={draft?.meta?.operateur || ''}
                  onChange={(value) => handleMetaChange('operateur', value)}
                  readOnly={isModelLocked}
                >
                  <option value="">Sélectionner un opérateur</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_OPERATOR_SELECT_OPTIONS, draft?.meta?.operateur)}
                </Select>
              </FieldBox>
              <FieldBox label="Conditions météo"><Input value={String(draft?.meta?.conditions_meteo || '')} onChange={(event) => handleMetaChange('conditions_meteo', event.target.value)} readOnly={isModelLocked} /></FieldBox>
              <FieldBox label="Section contrôlée" tone="hierarchy" full><Input value={String(draft?.meta?.section_controlee || '')} onChange={(event) => handleMetaChange('section_controlee', event.target.value)} readOnly={isModelLocked} /></FieldBox>
            </div>
          </StructureCard>

          <StructureCard title="Produit / chantier" description="Informations utiles pour relier l’essai au produit contrôlé et à la mise en œuvre.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <FieldBox label="Lieu de fabrication" tone="manual">
                <Select
                  value={draft?.meta?.lieu_fabrication || ''}
                  onChange={(value) => handleMetaChange('lieu_fabrication', value)}
                  readOnly={isModelLocked}
                >
                  <option value="">Sélectionner une centrale</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_FABRICATION_SITE_SELECT_OPTIONS, draft?.meta?.lieu_fabrication)}
                </Select>
              </FieldBox>
              <FieldBox label="Numéro formule" tone="manual">
                <Select
                  value={draft?.meta?.numero_formule || ''}
                  onChange={(value) => handleMetaChange('numero_formule', value)}
                  readOnly={isModelLocked}
                >
                  <option value="">Sélectionner une formule</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_FORMULA_SELECT_OPTIONS, draft?.meta?.numero_formule)}
                </Select>
              </FieldBox>
              <FieldBox label="Produit contrôlé" tone="manual">
                <Select
                  value={draft?.meta?.produit_controle || ''}
                  onChange={(value) => handleMetaChange('produit_controle', value)}
                  readOnly={isModelLocked}
                >
                  <option value="">Sélectionner une FTP</option>
                  {renderTerrainSelectOptionExtras(TERRAIN_PRODUCT_SELECT_OPTIONS, draft?.meta?.produit_controle)}
                </Select>
              </FieldBox>
              <FieldBox label="Couche"><Input value={String(draft?.meta?.couche || '')} onChange={(event) => handleMetaChange('couche', event.target.value)} readOnly={isModelLocked} /></FieldBox>
              <FieldBox label="Épaisseur couche (cm)"><Input value={String(draft?.meta?.epaisseur_couche_cm || '')} onChange={(event) => handleMetaChange('epaisseur_couche_cm', event.target.value)} readOnly={isModelLocked} /></FieldBox>
              <FieldBox label="Date mise en œuvre"><Input type="date" value={String(draft?.meta?.date_mise_en_oeuvre || '')} onChange={(event) => handleMetaChange('date_mise_en_oeuvre', event.target.value)} readOnly={isModelLocked} /></FieldBox>
            </div>
          </StructureCard>

          <StructureCard title="Matériel" description="Données pratiques de mesure et matériel utilisé.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FieldBox label="Volume de matériau utilisé (mm³)">
                <NumericInput
                  value={draft?.meta?.volume_materiau_mm3}
                  onChange={(event) => handleMetaChange('volume_materiau_mm3', event.target.value)}
                  readOnly={isModelLocked}
                />
              </FieldBox>
              <FieldBox label="Atelier mise en œuvre"><Input value={String(draft?.meta?.atelier_mise_en_oeuvre || '')} onChange={(event) => handleMetaChange('atelier_mise_en_oeuvre', event.target.value)} readOnly={isModelLocked} /></FieldBox>
            </div>
          </StructureCard>

          <StructureCard title="Critères / conclusion" description="Synthèse calculée, objectifs et conclusion du contrôle.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-4">
                <FieldBox label="Source des critères :" tone="hierarchy">
                  <Select
                    value={draft?.meta?.criteria_source || ''}
                    onChange={(value) => handleMetaChange('criteria_source', value)}
                    readOnly={isModelLocked}
                  >
                    <option value="">Sélectionner une source</option>
                    {renderTerrainSelectOptionExtras(TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS, draft?.meta?.criteria_source)}
                  </Select>
                </FieldBox>
              </div>
              <div className="md:col-span-8">
                <FieldBox label="Définition des critères / objectifs :">
                  <div className="grid grid-cols-[auto_minmax(0,180px)_1fr] items-center gap-2">
                    <span className="whitespace-nowrap text-xs font-semibold text-text-muted">PMT ≥</span>
                    <NumericInput
                      value={draft?.meta?.criteria_pmt_min}
                      onChange={(event) => handleMetaChange('criteria_pmt_min', event.target.value)}
                      readOnly={isModelLocked}
                    />
                    <Input
                      value={String(draft?.meta?.criteria_definition || '')}
                      onChange={(event) => handleMetaChange('criteria_definition', event.target.value)}
                      readOnly={isModelLocked}
                    />
                  </div>
                </FieldBox>
              </div>
              <div className="md:col-span-12">
                <FieldBox label="Conclusion" tone="manual" full>
                  <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)]">
                    <Select value={computedConformite} onChange={() => {}} readOnly>
                      <option value="conforme">✓ Conforme</option>
                      <option value="non_conforme">✕ Non conforme</option>
                      <option value="pour_info">ℹ Pour info</option>
                    </Select>
                    <Input
                      value={String(draft?.meta?.conclusion_courte || '')}
                      onChange={(event) => handleMetaChange('conclusion_courte', event.target.value)}
                      readOnly={isModelLocked}
                      placeholder="Complément éventuel"
                      className="min-w-0 w-full"
                    />
                  </div>
                </FieldBox>
              </div>
              <div className="md:col-span-12">
                <FieldBox label="Commentaires" tone="manual" full>
                  <Textarea
                    value={String(draft?.meta?.commentaires || '')}
                    onChange={(value) => handleMetaChange('commentaires', value)}
                    rows={3}
                    readOnly={isModelLocked}
                  />
                </FieldBox>
              </div>
            </div>
          </StructureCard>

          <StructureCard
            title="Points de mesure PMT"
            description={`${(draft?.points_rows || []).length} point(s) saisi(s).`}
            right={<Button variant="secondary" size="sm" onClick={handleAddRow} disabled={isModelLocked}>+ Ajouter une ligne</Button>}
          >
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <Row label="Profondeur macrotexture générale" value={formatResult(summary?.profondeur_macrotexture_generale_mm, 'mm')} tone="manual" />
              <Row label="PMT mini" value={formatResult(summary?.min_pmt_mm, 'mm')} tone="manual" />
              <Row label="PMT maxi" value={formatResult(summary?.max_pmt_mm, 'mm')} tone="manual" />
              <Row label="Valeurs conformes" value={formatResult(summary?.pourcentage_valeurs_conformes, '%')} tone="manual" />
            </div>
            {(draft?.points_rows || []).length ? (
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="bg-bg">
                    <tr>
                      <th className="px-2 py-2 text-left border-b border-border">N° essai</th>
                      <th className="px-2 py-2 text-left border-b border-border">Profil</th>
                      <th className="px-2 py-2 text-center border-b border-border">Position (G/A/D)</th>
                      <th className="px-2 py-2 text-right border-b border-border">Diamètre moyen de la tache (mm)</th>
                      <th className="px-2 py-2 text-right border-b border-border">Profondeur de macrotexture (mm)</th>
                      <th className="px-2 py-2 text-left border-b border-border">Observation</th>
                      <th className="px-2 py-2 text-center border-b border-border">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(draft?.points_rows || []).map((row, index) => {
                      const pmtNonConforme = isPmtProfondeurNonConforme(
                        row?.profondeur_macrotexture_mm,
                        draft?.meta?.criteria_pmt_min
                      )
                      return (
                        <tr key={row?.id || index} className="border-b border-border last:border-b-0 odd:bg-surface even:bg-bg/40">
                          <td className="px-2 py-1.5"><Input value={String(row?.point || '')} onChange={(event) => handleRowChange(index, 'point', event.target.value)} readOnly={isModelLocked} /></td>
                          <td className="px-2 py-1.5"><Input value={String(row?.profil || '')} onChange={(event) => handleRowChange(index, 'profil', event.target.value)} readOnly={isModelLocked} /></td>
                          <td className="px-2 py-1.5 min-w-[140px]">
                            <PositionSelector value={row?.position_codes} onChange={(value) => handleRowChange(index, 'position_codes', value)} readOnly={isModelLocked} />
                          </td>
                          <td className="px-2 py-1.5">
                            <NumericInput
                              value={row?.diametre_moyen_tache_mm}
                              onChange={(event) => handleRowChange(index, 'diametre_moyen_tache_mm', event.target.value)}
                              readOnly={isModelLocked}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <NumericInput
                              value={row?.profondeur_macrotexture_mm}
                              onChange={(event) => handleRowChange(index, 'profondeur_macrotexture_mm', event.target.value)}
                              readOnly={isModelLocked}
                              className={pmtNonConforme ? 'border-[#e11d48] bg-[#fff1f2] text-[#9f1239] font-semibold' : ''}
                            />
                          </td>
                          <td className="px-2 py-1.5"><Input value={String(row?.observations || '')} onChange={(event) => handleRowChange(index, 'observations', event.target.value)} readOnly={isModelLocked} /></td>
                          <td className="px-2 py-1.5 text-center"><Button variant="danger" size="sm" onClick={() => handleRemoveRow(index)} disabled={isModelLocked}>Supprimer</Button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-8 text-center text-sm text-text-muted">
                Aucun point saisi. Ajoute une ligne ou importe une feuille PMT existante.
              </div>
            )}
          </StructureCard>
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="primary" size="sm" onClick={handleSaveModel} disabled={isModelLocked}>Enregistrer</Button>
          <Button variant="secondary" size="sm" onClick={handleOpenRapport}>Imprimer / Ouvrir rapport</Button>
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
