import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { feuillesTerrainApi, qualiteApi } from '@/services/api'
import {
  computeDeSummary,
  createWorkDocumentDE,
  findWorkDocumentDEBySourceTerrainUid,
  getModelDefinitionDE,
  getRuntimePublicationDE,
  getWorkDocumentDE,
  listModelDefinitionsDE,
  updateWorkDocumentDE,
} from '@/services/modelWorkLocalStore'
import {
  TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS,
  TERRAIN_FABRICATION_SITE_SELECT_OPTIONS,
  TERRAIN_FORMULA_SELECT_OPTIONS,
  TERRAIN_OPERATOR_SELECT_OPTIONS,
  TERRAIN_PRODUCT_SELECT_OPTIONS,
  renderTerrainSelectOptionExtras,
} from '@/lib/terrainEssaiSelectOptions'
import { hasPositionCode, normalizePositionCodes, togglePositionCode } from '@/lib/positionCodes'

// NOTE (2026-05-01):
// Runtime page is DE-only for now. It is structured as an execution page (load/save/calc/print)
// and must later be generalized to other essai types via a type-specific runtime mapper/renderer.

const SOURCE_TONE_CLS = {
  manual: 'border-l-4 border-l-[#7fc998] bg-[#f7fcf9]',
  hierarchy: 'border-l-4 border-l-[#f0b35a] bg-[#fffaf2]',
  neutral: 'border-l-4 border-l-transparent bg-bg',
}

function Card({ title, children, right, description, overflow = 'hidden', bodyClassName = 'p-4' }) {
  const overflowClass = overflow === 'visible' ? 'overflow-visible' : 'overflow-hidden'
  return (
    <div className={`${overflowClass} rounded-xl border border-border bg-surface shadow-sm`}>
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-border bg-bg px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</div>
            {description ? <p className="mt-1 text-[11px] text-text-muted">{description}</p> : null}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  )
}

function Row({ label, value, tone = 'neutral' }) {
  const toneClass = SOURCE_TONE_CLS[tone] || SOURCE_TONE_CLS.neutral
  return (
    <div className={`rounded-lg px-3 py-2 ${toneClass}`}>
      <span className="block text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`mt-1 block text-[13px] font-medium ${value ? 'text-text' : 'font-normal italic text-text-muted'}`}>
        {value || '—'}
      </span>
    </div>
  )
}

function Field({ label, children, full = false, tone = 'neutral' }) {
  const toneClass = SOURCE_TONE_CLS[tone] || SOURCE_TONE_CLS.neutral
  return (
    <div className={`${full ? 'md:col-span-2' : ''} rounded-lg px-3 py-2 ${toneClass}`}>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-text-muted">{label}</label>
      {children}
    </div>
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

function PositionSelector({ value, onChange }) {
  const codes = normalizePositionCodes(value)
  return (
    <div className="flex items-center gap-2">
      {['G', 'A', 'D'].map((code) => (
        <label key={code} className="inline-flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={hasPositionCode(codes, code)}
            onChange={() => onChange(togglePositionCode(codes, code))}
          />
          <span>{code}</span>
        </label>
      ))}
    </div>
  )
}

function toDateInputValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const isoLoose = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (isoLoose) {
    const year = isoLoose[1]
    const month = isoLoose[2].padStart(2, '0')
    const day = isoLoose[3].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const frenchLoose = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (frenchLoose) {
    const day = frenchLoose[1].padStart(2, '0')
    const month = frenchLoose[2].padStart(2, '0')
    const year = frenchLoose[3]
    return `${year}-${month}-${day}`
  }

  return ''
}

function toFrenchDateDisplay(value) {
  const iso = toDateInputValue(value)
  if (iso) {
    const [year, month, day] = iso.split('-')
    return `${day}/${month}/${year}`
  }
  return String(value || '').trim()
}

function parseDeNumericValue(value) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function computeDeConformiteValue(moyenneVides, critereMin, critereMax) {
  const avg = parseDeNumericValue(moyenneVides)
  const min = parseDeNumericValue(critereMin)
  const max = parseDeNumericValue(critereMax)
  if (avg === null || min === null || max === null) return 'pour_info'
  return avg >= min && avg <= max ? 'conforme' : 'non_conforme'
}

function applyDeComputedFields(row, mvreValue, changedKey = '') {
  const nextRow = { ...(row || {}) }
  const mv = parseDeNumericValue(nextRow.masse_volumique)
  const mvre = parseDeNumericValue(mvreValue)
  const compacite = parseDeNumericValue(nextRow.compacite_pct)
  const vides = parseDeNumericValue(nextRow.vides_pct)
  if (changedKey === 'compacite_pct' && compacite != null) {
    const nextVides = Number((100 - compacite).toFixed(2))
    nextRow.vides_pct = nextVides
    if (mvre != null && mvre > 0) nextRow.masse_volumique = Number(((mvre * compacite) / 100).toFixed(3))
    return nextRow
  }
  if (changedKey === 'vides_pct' && vides != null) {
    const nextCompacite = Number((100 - vides).toFixed(2))
    nextRow.compacite_pct = nextCompacite
    if (mvre != null && mvre > 0) nextRow.masse_volumique = Number(((mvre * nextCompacite) / 100).toFixed(3))
    return nextRow
  }
  if ((changedKey === 'masse_volumique' || changedKey === 'mvre') && mv != null && mvre != null && mvre > 0) {
    const computedCompacite = Number(((mv / mvre) * 100).toFixed(2))
    nextRow.compacite_pct = computedCompacite
    nextRow.vides_pct = Number((100 - computedCompacite).toFixed(2))
    return nextRow
  }
  if (changedKey === 'mvre' && mvre != null && mvre > 0) {
    if (compacite != null) {
      const nextVides = Number((100 - compacite).toFixed(2))
      nextRow.vides_pct = nextVides
      nextRow.masse_volumique = Number(((mvre * compacite) / 100).toFixed(3))
      return nextRow
    }
    if (vides != null) {
      const nextCompacite = Number((100 - vides).toFixed(2))
      nextRow.compacite_pct = nextCompacite
      nextRow.masse_volumique = Number(((mvre * nextCompacite) / 100).toFixed(3))
      return nextRow
    }
  }
  return nextRow
}

function isDeVidesNonConforme(videsPct, critereMin, critereMax) {
  const vides = parseDeNumericValue(videsPct)
  const min = parseDeNumericValue(critereMin)
  const max = parseDeNumericValue(critereMax)
  if (vides == null || min == null || max == null) return false
  return vides < min || vides > max
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeDeMetaAliases(meta = {}) {
  // NOTE:
  // DE imports use legacy aliases (criteria_vides_*). Runtime normalizes them to current keys.
  // Keep this mapper explicit; future essai types should provide their own alias map.
  const safe = meta && typeof meta === 'object' ? { ...meta } : {}

  if ((safe.criteria_void_min == null || safe.criteria_void_min === '') && safe.criteria_vides_min != null) {
    safe.criteria_void_min = safe.criteria_vides_min
  }
  if ((safe.criteria_void_max == null || safe.criteria_void_max === '') && safe.criteria_vides_max != null) {
    safe.criteria_void_max = safe.criteria_vides_max
  }
  if ((safe.date_essai == null || safe.date_essai === '') && safe.date_essai_raw) {
    safe.date_essai = safe.date_essai_raw
  }
  if ((safe.conclusion_courte == null || safe.conclusion_courte === '') && safe.conclusion) {
    safe.conclusion_courte = safe.conclusion
  }

  return safe
}

function renderDeRuntimeView({
  data,
  draft,
  equipmentOptions = [],
  equipmentLoading = false,
  equipmentError = '',
  onMetaChange,
  onRowChange,
  onAddRow,
  onRemoveRow,
}) {
  const meta = draft?.meta || {}
  const pointsRows = Array.isArray(draft?.points_rows) ? draft.points_rows : []
  const summary = computeDeSummary(pointsRows)
  const computedConformite = computeDeConformiteValue(summary?.moyenne_vides_pct, meta?.criteria_void_min, meta?.criteria_void_max)
  const handleGammadensimetreChange = (value) => {
    const selected = equipmentOptions.find((option) => String(option.value) === String(value))
    onMetaChange('gammadensimetre', value)
    if (selected?.calibration_date || selected?.last_metrology) {
      onMetaChange('date_dernier_calibrage', selected.calibration_date || selected.last_metrology)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card title="Identification" description="Données de réalisation de l’essai ou de l’intervention.">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
          <Badge className="border-[#b7e2c4] bg-[#f1fbf4] text-[#477d55]">Saisie manuelle / import</Badge>
          <Badge className="border-[#f1d2a4] bg-[#fff8ec] text-[#8a5c11]">Donnée hiérarchique</Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Row label="Norme" value={data.norme || 'NF P 98-241-1'} tone="manual" />
          <Field label="Date essai" tone="manual"><Input type="date" value={toDateInputValue(meta.date_essai)} onChange={(event) => onMetaChange('date_essai', event.target.value)} /></Field>
          <Field label="Opérateur" tone="manual"><Select value={meta.operateur || ''} onChange={(value) => onMetaChange('operateur', value)}><option value="">Sélectionner un opérateur</option>{renderTerrainSelectOptionExtras(TERRAIN_OPERATOR_SELECT_OPTIONS, meta.operateur)}</Select></Field>
          <Field label="Conditions météo" tone="manual"><Input value={meta.conditions_meteo || ''} onChange={(event) => onMetaChange('conditions_meteo', event.target.value)} /></Field>
          <Field label="Section contrôlée" tone="hierarchy" full><Input value={meta.section_controlee || ''} onChange={(event) => onMetaChange('section_controlee', event.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Produit / chantier" description="Informations utiles pour relier l’essai au produit contrôlé et à la mise en œuvre.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Lieu de fabrication" tone="manual"><Select value={meta.lieu_fabrication || ''} onChange={(value) => onMetaChange('lieu_fabrication', value)}><option value="">Sélectionner une centrale</option>{renderTerrainSelectOptionExtras(TERRAIN_FABRICATION_SITE_SELECT_OPTIONS, meta.lieu_fabrication)}</Select></Field>
          <Field label="Numéro formule" tone="manual"><Select value={meta.numero_formule || ''} onChange={(value) => onMetaChange('numero_formule', value)}><option value="">Sélectionner une formule</option>{renderTerrainSelectOptionExtras(TERRAIN_FORMULA_SELECT_OPTIONS, meta.numero_formule)}</Select></Field>
          <Field label="Produit contrôlé" tone="manual"><Select value={meta.produit_controle || ''} onChange={(value) => onMetaChange('produit_controle', value)}><option value="">Sélectionner une FTP</option>{renderTerrainSelectOptionExtras(TERRAIN_PRODUCT_SELECT_OPTIONS, meta.produit_controle)}</Select></Field>
          <Field label="Couche" tone="manual"><Input value={meta.couche || ''} onChange={(event) => onMetaChange('couche', event.target.value)} /></Field>
          <Field label="Épaisseur couche (cm)" tone="manual"><Input value={meta.epaisseur_couche_cm || ''} onChange={(event) => onMetaChange('epaisseur_couche_cm', event.target.value)} /></Field>
          <Field label="Date mise en œuvre" tone="manual"><Input type="date" value={toDateInputValue(meta.date_mise_en_oeuvre)} onChange={(event) => onMetaChange('date_mise_en_oeuvre', event.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Matériel" description="Données pratiques de mesure et matériel utilisé.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Gammadensimètre" tone="manual">
            <Select value={meta.gammadensimetre || ''} onChange={handleGammadensimetreChange} readOnly={equipmentLoading}>
              <option value="">{equipmentLoading ? 'Chargement des équipements...' : 'Sélectionner un équipement'}</option>
              {renderTerrainSelectOptionExtras(equipmentOptions, meta.gammadensimetre)}
            </Select>
            {equipmentError ? <div className="mt-1 text-[11px] text-red-600">{equipmentError}</div> : null}
          </Field>
          <Field label="Date dernier calibrage" tone="manual"><Input value={toFrenchDateDisplay(meta.date_dernier_calibrage)} onChange={(event) => onMetaChange('date_dernier_calibrage', event.target.value)} placeholder="jj/mm/aaaa" /></Field>
          <Field label="Profondeur mesure" tone="manual"><Input value={meta.profondeur_mesure || ''} onChange={(event) => onMetaChange('profondeur_mesure', event.target.value)} /></Field>
          <Field label="Atelier mise en œuvre" tone="manual"><Input value={meta.atelier_mise_en_oeuvre || ''} onChange={(event) => onMetaChange('atelier_mise_en_oeuvre', event.target.value)} /></Field>
        </div>
      </Card>

      <Card title="Critères / conclusion" description="Synthèse calculée, objectifs et conclusion du contrôle.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="md:col-span-3"><Field label="MVRE" tone="manual"><Input value={meta.mvre || ''} onChange={(event) => onMetaChange('mvre', event.target.value)} placeholder="MVA ou saisie directe" /></Field></div>
          <div className="md:col-span-4"><Field label="Source des critères :" tone="hierarchy"><Select value={meta.criteria_source || ''} onChange={(value) => onMetaChange('criteria_source', value)}><option value="">Sélectionner une source</option>{renderTerrainSelectOptionExtras(TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS, meta.criteria_source)}</Select></Field></div>
          <div className="md:col-span-5"><Field label="Définition des critères / objectifs :" tone="manual"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Input value={meta.criteria_void_min || ''} onChange={(event) => onMetaChange('criteria_void_min', event.target.value)} className="text-right tabular-nums" placeholder="Minimum" /><span className="whitespace-nowrap text-xs font-semibold text-text-muted">≤ % de vide ≤</span><Input value={meta.criteria_void_max || ''} onChange={(event) => onMetaChange('criteria_void_max', event.target.value)} className="text-right tabular-nums" placeholder="Maximum" /></div></Field></div>
          <div className="md:col-span-12"><Field label="Conclusion" tone="manual" full><div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)]"><Select value={computedConformite} onChange={() => {}} readOnly><option value="conforme">✓ Conforme</option><option value="non_conforme">✕ Non conforme</option><option value="pour_info">ℹ Pour info</option></Select><Input value={meta.conclusion_courte || ''} onChange={(event) => onMetaChange('conclusion_courte', event.target.value)} placeholder="Complément éventuel" className="min-w-0 w-full" /></div></Field></div>
          <div className="md:col-span-12"><Field label="Commentaires" tone="manual" full><Textarea value={meta.commentaires || ''} onChange={(value) => onMetaChange('commentaires', value)} rows={3} /></Field></div>
        </div>
      </Card>

      <Card title="Points de mesure DE" description={`${pointsRows.length} point${pointsRows.length > 1 ? 's' : ''} saisi${pointsRows.length > 1 ? 's' : ''}.`} right={<Button variant="secondary" size="sm" onClick={onAddRow}>+ Ajouter une ligne</Button>}>
        <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Row label="Moyenne compacité" value={formatResult(summary?.moyenne_compacite_pct, '%')} />
          <Row label="Moyenne vides" value={formatResult(summary?.moyenne_vides_pct, '%')} />
          <Row label="Moyenne masse volumique" value={formatResult(summary?.moyenne_mv, 'g/cm³')} />
        </div>
        {pointsRows.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[1040px] text-[12px]">
              <thead className="bg-bg">
                <tr>
                  <th className="border-b border-border px-2 py-2 text-left font-semibold text-text-muted">Point</th>
                  <th className="border-b border-border px-2 py-2 text-left font-semibold text-text-muted">Profil</th>
                  <th className="border-b border-border px-2 py-2 text-center font-semibold text-text-muted">Position (G/A/D)</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold text-text-muted">MV (g/cm³)</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold text-text-muted">Compacité (%)</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold text-text-muted">Vides (%)</th>
                  <th className="border-b border-border px-2 py-2 text-left font-semibold text-text-muted">Observation</th>
                  <th className="border-b border-border px-2 py-2 text-center font-semibold text-text-muted">Action</th>
                </tr>
              </thead>
              <tbody>
                {pointsRows.map((row, index) => {
                  const videsNonConforme = isDeVidesNonConforme(row?.vides_pct, meta?.criteria_void_min, meta?.criteria_void_max)
                  return (
                    <tr key={row?.id || row?.point || index} className="border-b border-border last:border-b-0 odd:bg-surface even:bg-bg/40">
                      <td className="px-2 py-1.5"><Input value={row?.point ?? ''} onChange={(event) => onRowChange(index, 'point', event.target.value)} className="min-w-[90px]" /></td>
                      <td className="px-2 py-1.5"><Input value={row?.profil ?? ''} onChange={(event) => onRowChange(index, 'profil', event.target.value)} className="min-w-[90px]" /></td>
                      <td className="px-2 py-1.5 min-w-[130px]"><PositionSelector value={row?.position_codes} onChange={(value) => onRowChange(index, 'position_codes', value)} /></td>
                      <td className="px-2 py-1.5"><NumericInput value={row?.masse_volumique} onChange={(event) => onRowChange(index, 'masse_volumique', event.target.value)} /></td>
                      <td className="px-2 py-1.5"><NumericInput value={row?.compacite_pct} onChange={(event) => onRowChange(index, 'compacite_pct', event.target.value)} /></td>
                      <td className="px-2 py-1.5"><NumericInput value={row?.vides_pct} onChange={(event) => onRowChange(index, 'vides_pct', event.target.value)} className={videsNonConforme ? 'border-[#e11d48] bg-[#fff1f2] text-[#9f1239] font-semibold' : ''} /></td>
                      <td className="px-2 py-1.5"><Input value={row?.observations || ''} onChange={(event) => onRowChange(index, 'observations', event.target.value)} /></td>
                      <td className="px-2 py-1.5 text-center"><Button variant="danger" size="sm" onClick={() => onRemoveRow(index)}>Supprimer</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-bg px-4 py-8 text-center text-sm text-text-muted">
            Aucun point saisi. Ajoute une ligne ou importe une feuille DE existante.
          </div>
        )}
      </Card>
    </div>
  )
}

function formatResult(value, unit) {
  if (value == null || value === '') return ''
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return `${numeric.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`
  return `${value}${unit ? ` ${unit}` : ''}`
}

export default function FeuilleDeRuntimePage() {
  const navigate = useNavigate()
  const { uid = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [feuilleRef, setFeuilleRef] = useState('')
  const [feuillePayload, setFeuillePayload] = useState({})
  const [publication, setPublication] = useState(null)
  const [publishedWorkDocId, setPublishedWorkDocId] = useState('')
  const [runtimeDraft, setRuntimeDraft] = useState({ meta: {}, points_rows: [] })
  const [runtimeDoc, setRuntimeDoc] = useState(null)
  const [feuilleLinks, setFeuilleLinks] = useState({
    interventionId: '',
    demandeId: '',
    campagneId: '',
  })
  const [equipmentOptions, setEquipmentOptions] = useState([])
  const [equipmentLoading, setEquipmentLoading] = useState(false)
  const [equipmentError, setEquipmentError] = useState('')
  const [deFeuilles, setDeFeuilles] = useState([])
  const [selectedFeuilleUid, setSelectedFeuilleUid] = useState(String(uid || ''))
  const [savedDraftSnapshot, setSavedDraftSnapshot] = useState('')

  const returnToRaw = String(searchParams.get('return_to') || '').trim()
  const legacyLoopPath = `/feuilles-terrain/${encodeURIComponent(String(uid))}`
  const returnTo = returnToRaw && returnToRaw !== legacyLoopPath ? returnToRaw : '/tools'

  const summary = useMemo(
    () => computeDeSummary(Array.isArray(runtimeDraft?.points_rows) ? runtimeDraft.points_rows : []),
    [runtimeDraft]
  )
  const currentDraftSnapshot = useMemo(() => JSON.stringify(runtimeDraft || {}), [runtimeDraft])
  const hasUnsavedChanges = Boolean(savedDraftSnapshot) && currentDraftSnapshot !== savedDraftSnapshot

  function toDraft(values = {}) {
    return {
      meta: normalizeDeMetaAliases(values?.meta),
      points_rows: Array.isArray(values?.points_rows)
        ? values.points_rows.map((row, index) => ({ ...row, id: row?.id ?? index + 1, position_codes: normalizePositionCodes(row?.position_codes) }))
        : [],
    }
  }

  function buildDraftFromPublication(values = {}, published = null) {
    // NOTE:
    // Runtime executes the already published decision from Work DE.
    // No model management/approval happens here: only hydrate structure + DB values.
    const runtimeMeta = normalizeDeMetaAliases(values?.meta)
    const runtimeRows = Array.isArray(values?.points_rows) ? values.points_rows : []
    const modelValues = published?.model_snapshot?.values && typeof published.model_snapshot.values === 'object'
      ? published.model_snapshot.values
      : {}
    const modelMeta = normalizeDeMetaAliases(modelValues?.meta)
    const modelRows = Array.isArray(modelValues?.points_rows) ? modelValues.points_rows : []

    const mergedMeta = { ...modelMeta, ...runtimeMeta }
    const rowTemplate = modelRows[0] && typeof modelRows[0] === 'object' ? modelRows[0] : {}
    const rows = runtimeRows.map((row, index) => ({
      ...rowTemplate,
      ...(row && typeof row === 'object' ? row : {}),
      id: row?.id ?? index + 1,
    }))

    return { meta: mergedMeta, points_rows: rows }
  }

  function hasRuntimeContent(values = {}) {
    const meta = values?.meta && typeof values.meta === 'object' ? values.meta : {}
    const rows = Array.isArray(values?.points_rows) ? values.points_rows : []
    return Object.keys(meta).length > 0 || rows.length > 0
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        if (!uid) {
          throw new Error('UID feuille terrain manquant.')
        }
        const data = await feuillesTerrainApi.get(uid)
        if (cancelled) return
        setFeuilleRef(String(data?.reference || `#${uid}`))
        setFeuillePayload(data?.payload && typeof data.payload === 'object' ? data.payload : {})
        const payload = data?.payload && typeof data.payload === 'object' ? data.payload : {}
        setFeuilleLinks({
          interventionId: String(data?.intervention_id || payload?.intervention_id || ''),
          demandeId: String(data?.demande_id || payload?.demande_id || ''),
          campagneId: String(
            data?.campagne_id ||
            data?.campaign_id ||
            payload?.campagne_id ||
            payload?.campaign_id ||
            ''
          ),
        })
        const terrainNum = Number(uid)
        let publication = getRuntimePublicationDE()
        if (!publication?.work_document_id) {
          let workDoc = Number.isFinite(terrainNum)
            ? findWorkDocumentDEBySourceTerrainUid(terrainNum)
            : null
          if (!workDoc) {
            const model = getModelDefinitionDE()
            const payloadDraft = toDraft(payload)
            const initialRv = hasRuntimeContent(payloadDraft)
              ? payloadDraft
              : (model?.values ? toDraft(model.values) : { meta: {}, points_rows: [] })
            workDoc = createWorkDocumentDE({
              modelDefinitionId: model?.id || '',
              modelVersion: model?.schema_version || 1,
              runtimeValues: initialRv,
              sourceTerrainUid: Number.isFinite(terrainNum) ? terrainNum : null,
            })
          }
          const modelList = listModelDefinitionsDE()
          const modelForSnapshot =
            (workDoc?.model_definition_id
              && modelList.find((m) => String(m?.id) === String(workDoc.model_definition_id)))
            || getModelDefinitionDE()
          const snapValues =
            modelForSnapshot && typeof modelForSnapshot.values === 'object'
              ? modelForSnapshot.values
              : { meta: {}, points_rows: [] }
          publication = {
            work_document_id: String(workDoc.id),
            model_definition_id: String(workDoc.model_definition_id || ''),
            rapport_model_definition_id: String(workDoc.rapport_model_definition_id || ''),
            model_snapshot: { values: snapValues },
            rapport_snapshot: null,
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        }
        setPublication(publication)
        setPublishedWorkDocId(String(publication.work_document_id))
      } catch (e) {
        if (cancelled) return
        setError(e?.message || 'Impossible de charger la feuille DE.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uid])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await feuillesTerrainApi.list({ limit: 400 })
        if (cancelled) return
        const filtered = (Array.isArray(rows) ? rows : [])
          .filter((row) => String(row?.code_feuille || '').trim().toUpperCase() === 'DE')
          .map((row) => ({
            uid: String(row?.uid || ''),
            reference: String(row?.reference || `#${row?.uid || ''}`),
          }))
        setDeFeuilles(filtered)
      } catch {
        if (!cancelled) setDeFeuilles([])
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!publishedWorkDocId) return
    const doc = getWorkDocumentDE(publishedWorkDocId)
    if (!doc) {
      setError(`Publication runtime introuvable (${publishedWorkDocId}).`)
      return
    }
    const dbValues = toDraft(feuillePayload || {})
    const sourceValues = hasRuntimeContent(dbValues) ? dbValues : toDraft(doc.runtime_values || {})
    const mergedDraft = buildDraftFromPublication(sourceValues, publication)
    const synced = updateWorkDocumentDE(doc.id, { runtime_values: mergedDraft }) || doc
    setRuntimeDoc(synced)
    const hydratedDraft = toDraft(synced.runtime_values || mergedDraft)
    setRuntimeDraft(hydratedDraft)
    setSavedDraftSnapshot(JSON.stringify(hydratedDraft))
    setSelectedFeuilleUid(String(uid || ''))
  }, [publishedWorkDocId, publication, feuillePayload])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setEquipmentLoading(true)
      setEquipmentError('')
      try {
        const rows = await qualiteApi.equipmentOptions.list({ usage: 'gammadensimetre_de' })
        const usageRows = Array.isArray(rows) ? rows : []
        const gammaTerms = ['gamma', 'gammadens', 'densim', 'densimetre', 'pqi', 'troxler', 'nucleaire']
        const equipmentRows = await qualiteApi.equipment.list().catch(() => [])
        const terrainRows = (Array.isArray(equipmentRows) ? equipmentRows : [])
          .filter((item) => String(item?.category || '').trim() === 'Terrain')
          .filter((item) => String(item?.status || '').trim() === 'En service')
          .filter((item) => {
            const searchable = normalizeSearchText([item?.code, item?.label, item?.domain, item?.serial_number, item?.notes].filter(Boolean).join(' '))
            return gammaTerms.some((term) => searchable.includes(term))
          })
          .map((item) => {
            const code = String(item?.code || '').trim()
            const label = String(item?.label || '').trim()
            const serial = String(item?.serial_number || '').trim()
            return {
              value: code || label || String(item?.uid || ''),
              label: code && label ? `${code} - ${label}${serial ? ` (${serial})` : ''}` : label || code || String(item?.uid || ''),
              equipment_id: item?.uid || null,
              calibration_date: item?.last_metrology || '',
              last_metrology: item?.last_metrology || '',
            }
          })
        const mergedByValue = new Map()
        for (const item of [...usageRows, ...terrainRows]) {
          const key = String(item?.value || '').trim().toUpperCase()
          if (!key) continue
          const current = mergedByValue.get(key)
          if (!current) {
            mergedByValue.set(key, item)
            continue
          }
          const currentCalib = String(current?.calibration_date || current?.last_metrology || '').trim()
          const nextCalib = String(item?.calibration_date || item?.last_metrology || '').trim()
          if (!currentCalib && nextCalib) mergedByValue.set(key, { ...current, ...item })
        }
        if (!cancelled) setEquipmentOptions(Array.from(mergedByValue.values()))
      } catch (e) {
        if (!cancelled) {
          setEquipmentOptions([])
          setEquipmentError(e?.message || 'Chargement des équipements impossible.')
        }
      } finally {
        if (!cancelled) setEquipmentLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <div className="py-10 text-center text-sm text-text-muted">Chargement feuille DE...</div>
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[#f0a0a0] bg-[#fcebeb] px-4 py-3 text-sm text-[#a32d2d]">
        {error}
      </div>
    )
  }

  if (!runtimeDoc?.id) {
    return <div className="py-10 text-center text-sm text-text-muted">Préparation du runtime DE...</div>
  }

  async function handleSaveRuntime() {
    const rows = Array.isArray(runtimeDraft.points_rows) ? runtimeDraft.points_rows : []
    const runtimeValues = {
      meta: runtimeDraft.meta || {},
      points_rows: rows,
      resume: computeDeSummary(rows),
    }
    const updated = updateWorkDocumentDE(runtimeDoc.id, { runtime_values: runtimeValues })
    if (!updated) {
      setResult({ type: 'err', msg: 'Impossible d’enregistrer la feuille runtime.' })
      return
    }
    try {
      if (uid) {
        const nextPayload = {
          ...(feuillePayload && typeof feuillePayload === 'object' ? feuillePayload : {}),
          ...runtimeValues,
        }
        await feuillesTerrainApi.update(uid, { payload: nextPayload })
        setFeuillePayload(nextPayload)
      }
    } catch (e) {
      setResult({ type: 'err', msg: e?.message || 'Enregistré localement, mais échec de sauvegarde DB.' })
      return
    }
    setRuntimeDoc(updated)
    setRuntimeDraft(toDraft(updated.runtime_values || {}))
    setSavedDraftSnapshot(JSON.stringify(toDraft(updated.runtime_values || {})))
    setResult({ type: 'ok', msg: 'Feuille runtime enregistrée.' })
  }

  function openReport() {
    const params = new URLSearchParams()
    params.set('mode', 'work')
    params.set('source_kind', 'work_doc')
    params.set('source_id', String(runtimeDoc.id || ''))
    params.set('source_family', 'terrain')
    params.set('source_uid', String(uid || ''))
    params.set('feuille_uid', String(uid || ''))
    if (feuilleLinks.demandeId) params.set('demande_id', String(feuilleLinks.demandeId))
    if (feuilleLinks.interventionId) params.set('intervention_id', String(feuilleLinks.interventionId))
    if (feuilleLinks.campagneId) params.set('campagne_id', String(feuilleLinks.campagneId))
    params.set('return_to', `/feuilles-terrain/de/${encodeURIComponent(String(uid || ''))}/runtime`)
    navigate(`/rapports/de/view?${params.toString()}`)
  }

  function handleMetaChange(key, value) {
    setRuntimeDraft((prev) => {
      const prevMeta = { ...(prev?.meta || {}) }
      const nextMeta = { ...prevMeta, [key]: value }
      if (key !== 'mvre') return { ...prev, meta: nextMeta }
      const rows = Array.isArray(prev?.points_rows) ? prev.points_rows : []
      const nextRows = rows.map((row) => applyDeComputedFields(row, value, 'mvre'))
      return { ...prev, meta: nextMeta, points_rows: nextRows }
    })
  }

  function handleRowChange(index, key, value) {
    setRuntimeDraft((prev) => {
      const rows = Array.isArray(prev?.points_rows) ? [...prev.points_rows] : []
      const nextRow = { ...(rows[index] || {}), [key]: key === 'position_codes' ? normalizePositionCodes(value) : value }
      rows[index] = applyDeComputedFields(nextRow, prev?.meta?.mvre, key)
      return { ...prev, points_rows: rows }
    })
  }

  function handleAddRow() {
    setRuntimeDraft((prev) => ({
      ...prev,
      points_rows: [
        ...(Array.isArray(prev?.points_rows) ? prev.points_rows : []),
        { id: Date.now(), point: '', profil: '', position_codes: [], masse_volumique: '', compacite_pct: '', vides_pct: '', observations: '' },
      ],
    }))
  }

  function handleRemoveRow(index) {
    setRuntimeDraft((prev) => ({
      ...prev,
      points_rows: (Array.isArray(prev?.points_rows) ? prev.points_rows : []).filter((_, idx) => idx !== index),
    }))
  }

  function goBack() {
    navigate(returnTo)
  }

  function navTarget(path, id) {
    const normalized = String(id || '').trim()
    return normalized ? `${path}/${encodeURIComponent(normalized)}` : ''
  }

  function renderDebugNavButton(label, path, id) {
    const target = navTarget(path, id)
    const hasId = Boolean(target)
    return (
      <Button
        key={label}
        variant="secondary"
        size="sm"
        disabled={!hasId}
        onClick={() => hasId ? navigate(target) : null}
        className={!hasId ? 'border-amber-300 bg-amber-50 text-amber-800' : ''}
        title={hasId ? `${label} ${id}` : `${label} indisponível (debug: ID ausente)`}
      >
        {label}
      </Button>
    )
  }

  function openCampaignContext() {
    const campaignId = String(feuilleLinks.campagneId || '').trim()
    if (!campaignId) return
    const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
    navigate(`/campagnes/${encodeURIComponent(campaignId)}${query}`)
  }

  function handleSwitchFeuille() {
    const nextUid = String(selectedFeuilleUid || '').trim()
    if (!nextUid || nextUid === String(uid || '')) return
    if (hasUnsavedChanges) {
      const proceed = window.confirm('Des changements ne sont pas enregistrés. Voulez-vous changer de feuille sans sauvegarder ?')
      if (!proceed) return
    }
    const query = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : ''
    navigate(`/feuilles-terrain/de/${encodeURIComponent(nextUid)}/runtime${query}`)
  }

  return (
    <div className="flex flex-col h-full -m-6">
      <div className="flex items-center gap-3 px-6 bg-surface border-b border-border h-[58px] shrink-0">
        <span className="text-[15px] font-semibold flex-1">Feuille DE Runtime</span>
        <Button variant="secondary" size="sm" onClick={goBack}>
          ← Retour
        </Button>
        <Button variant="primary" size="sm" onClick={handleSaveRuntime}>Enregistrer</Button>
        <Button variant="secondary" size="sm" onClick={openReport}>Imprimer / Ouvrir rapport</Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 py-2.5 bg-surface border-b border-border shrink-0">
        <span className="text-xs text-text-muted">{feuilleRef}</span>

        <div className="flex min-w-[340px] items-center gap-2 ml-auto">
          <select
            value={selectedFeuilleUid}
            onChange={(event) => setSelectedFeuilleUid(String(event.target.value || ''))}
            className="w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="">Sélectionner une référence DE…</option>
            {deFeuilles.map((row) => (
              <option key={row.uid} value={row.uid}>
                {row.reference}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={handleSwitchFeuille} disabled={!selectedFeuilleUid || selectedFeuilleUid === String(uid || '')}>
            Ouvrir
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {renderDebugNavButton('Demande', '/demandes', feuilleLinks.demandeId)}
          {renderDebugNavButton('Intervention', '/interventions', feuilleLinks.interventionId)}
          <Button
            variant="secondary"
            size="sm"
            disabled={!feuilleLinks.campagneId}
            onClick={openCampaignContext}
            className={!feuilleLinks.campagneId ? 'border-amber-300 bg-amber-50 text-amber-800' : ''}
            title={
              feuilleLinks.campagneId
                ? `Campagne ${feuilleLinks.campagneId}`
                : 'Campagne indisponível (debug: campaign_id ausente)'
            }
          >
            Campagne
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-4">
          {renderDeRuntimeView({
            data: { norme: publication?.model_snapshot?.norme || 'NF P 98-241-1' },
            draft: runtimeDraft,
            equipmentOptions,
            equipmentLoading,
            equipmentError,
            onMetaChange: handleMetaChange,
            onRowChange: handleRowChange,
            onAddRow: handleAddRow,
            onRemoveRow: handleRemoveRow,
          })}

          {result ? (
            <div className={`rounded-lg border px-3 py-2 text-xs ${result.type === 'ok' ? 'border-[#b6d98b] bg-[#eaf3de] text-[#3b6d11]' : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'}`}>
              {result.msg}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
