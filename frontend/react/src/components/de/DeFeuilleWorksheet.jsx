import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  computeDeConformiteValue,
  formatDeResult,
  isDeVidesNonConforme,
} from '@/lib/de/compute'
import {
  TERRAIN_CRITERIA_SOURCE_SELECT_OPTIONS,
  TERRAIN_FABRICATION_SITE_SELECT_OPTIONS,
  TERRAIN_FORMULA_SELECT_OPTIONS,
  TERRAIN_OPERATOR_SELECT_OPTIONS,
  TERRAIN_PRODUCT_SELECT_OPTIONS,
  renderTerrainSelectOptionExtras,
} from '@/lib/terrainEssaiSelectOptions'
import { hasPositionCode, normalizePositionCodes, togglePositionCode } from '@/lib/positionCodes'
import { computeDeSummary } from '@/services/modelWorkLocalStore'

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
      className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge disabled:cursor-not-allowed disabled:opacity-70 read-only:cursor-default read-only:opacity-80"
    />
  )
}

function Select({ value, onChange, readOnly = false, children, className = '' }) {
  return (
    <select
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={readOnly}
      className={`w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
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

export default function DeFeuilleWorksheet({
  norme = 'NF P 98-241-1',
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
  const computedConformite = computeDeConformiteValue(
    summary?.moyenne_vides_pct,
    meta?.criteria_void_min,
    meta?.criteria_void_max,
  )

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
          <Row label="Norme" value={norme} tone="manual" />
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
          <Row label="Moyenne compacité" value={formatDeResult(summary?.moyenne_compacite_pct, '%')} />
          <Row label="Moyenne vides" value={formatDeResult(summary?.moyenne_vides_pct, '%')} />
          <Row label="Moyenne masse volumique" value={formatDeResult(summary?.moyenne_mv, 'g/cm³')} />
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
            Aucun point saisi. Ajoute une ligne pour commencer la saisie.
          </div>
        )}
      </Card>
    </div>
  )
}
