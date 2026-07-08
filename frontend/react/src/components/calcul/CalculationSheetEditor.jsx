import Button from '@/components/ui/Button'
import Input, { Select, Textarea } from '@/components/ui/Input'
import { SectionCard } from '@/components/layout/FicheLayout'
import {
  buildEmptyRepeatRow,
  getStudyType,
  getVisibleSections,
} from '@/lib/calculationSheetCatalog'

function FieldGrid({ columns = 2, children }) {
  return (
    <div className={`grid grid-cols-1 ${columns > 1 ? 'md:grid-cols-2' : ''} gap-3`}>
      {children}
    </div>
  )
}

function CalcField({ fieldDef, value, onChange, readOnly = false }) {
  const { id, label, type, options = [], placeholder, rows = 3, full } = fieldDef
  const wrapClass = full ? 'md:col-span-2 flex flex-col gap-1' : 'flex flex-col gap-1'

  if (type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className={wrapClass}>
        <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">{label}</span>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const active = selected.includes(option)
            return (
              <label
                key={option}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] cursor-pointer ${
                  active
                    ? 'border-[#5b4b8a] bg-[#eeedfe] text-[#534ab7] font-semibold'
                    : 'border-[#dbe1ea] bg-white text-[#475569]'
                } ${readOnly ? 'opacity-70 cursor-default' : ''}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={active}
                  disabled={readOnly}
                  onChange={() => {
                    if (readOnly) return
                    onChange(active ? selected.filter((item) => item !== option) : [...selected, option])
                  }}
                />
                {option}
              </label>
            )
          })}
        </div>
      </div>
    )
  }

  const commonLabel = (
    <span className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8]">{label}</span>
  )

  if (type === 'textarea') {
    return (
      <label className={wrapClass}>
        {commonLabel}
        <Textarea
          rows={rows}
          value={value ?? ''}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  if (type === 'select') {
    return (
      <label className={wrapClass}>
        {commonLabel}
        <Select
          value={value ?? ''}
          disabled={readOnly}
          onChange={(event) => onChange(event.target.value)}
          className="w-full"
        >
          <option value="">{placeholder || '—'}</option>
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
      </label>
    )
  }

  return (
    <label className={wrapClass}>
      {commonLabel}
      <Input
        type={type === 'number' || type === 'date' ? type : 'text'}
        value={value ?? ''}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function RepeatableBlock({ repeatable, rows, onChange, readOnly = false }) {
  const items = Array.isArray(rows) && rows.length ? rows : [buildEmptyRepeatRow(repeatable.fields)]

  function updateRow(index, fieldId, nextValue) {
    onChange(items.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [fieldId]: nextValue } : row
    )))
  }

  function addRow() {
    onChange([...items, buildEmptyRepeatRow(repeatable.fields)])
  }

  function removeRow(index) {
    if (items.length <= 1) return
    onChange(items.filter((_, rowIndex) => rowIndex !== index))
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((row, index) => (
        <div key={index} className="rounded-[14px] border border-[#dbe1ea] bg-[#f8fafc] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-[12px] font-bold text-[#003170]">
              {repeatable.label} {index + 1}
            </div>
            {!readOnly && items.length > 1 ? (
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="text-[11px] font-semibold text-[#a32d2d] hover:underline"
              >
                Retirer
              </button>
            ) : null}
          </div>
          <FieldGrid columns={2}>
            {repeatable.fields.map((fieldDef) => (
              <CalcField
                key={`${index}-${fieldDef.id}`}
                fieldDef={fieldDef}
                value={row[fieldDef.id]}
                readOnly={readOnly}
                onChange={(nextValue) => updateRow(index, fieldDef.id, nextValue)}
              />
            ))}
          </FieldGrid>
        </div>
      ))}
      {!readOnly ? (
        <Button size="sm" variant="secondary" onClick={addRow}>
          + {repeatable.addLabel || 'Ajouter une ligne'}
        </Button>
      ) : null}
    </div>
  )
}

function FigureUploadZone({ figures, onChange, readOnly = false, toolLabel = 'calcul' }) {
  const items = Array.isArray(figures) ? figures : []

  function handleFiles(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    const next = files.map((file) => ({
      id: `${Date.now()}-${file.name}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
    }))
    onChange([...items, ...next])
  }

  function removeFigure(id) {
    const target = items.find((item) => item.id === id)
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    onChange(items.filter((item) => item.id !== id))
  }

  return (
    <div className="flex flex-col gap-3">
      {!readOnly ? (
        <label className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#dbe1ea] bg-[#f8fafc] px-4 py-8 cursor-pointer hover:border-[#5b4b8a]">
          <span className="text-[13px] font-semibold text-[#003170]">+ Ajouter capture / print {toolLabel}</span>
          <span className="text-[11px] text-[#69758a]">PNG, JPG — stockage local pour l&apos;instant</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
        </label>
      ) : null}
      {items.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-[12px] border border-[#dbe1ea] bg-white overflow-hidden">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt={item.name} className="w-full max-h-[220px] object-contain bg-[#f8fafc]" />
              ) : null}
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-[11px] text-[#475569] truncate">{item.name}</span>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => removeFigure(item.id)}
                    className="text-[11px] text-[#a32d2d] hover:underline shrink-0"
                  >
                    Retirer
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-[#69758a] italic">Aucune capture pour l&apos;instant.</p>
      )}
    </div>
  )
}

export default function CalculationSheetEditor({
  studyTypeId,
  activeTool = 'allyze',
  values,
  onChange,
  readOnly = false,
}) {
  const profile = getStudyType(studyTypeId)
  const sections = getVisibleSections(studyTypeId)
  const toolLabel = activeTool === 'talren' ? 'Talren' : 'Allyze'

  function patchField(fieldId, nextValue) {
    onChange({ ...values, [fieldId]: nextValue })
  }

  function patchRepeatable(repeatableId, nextRows) {
    onChange({ ...values, [repeatableId]: nextRows })
  }

  if (sections.length === 0) {
    return (
      <SectionCard title={`Aucune section ${toolLabel}`}>
        <p className="text-[13px] text-[#69758a]">Sélectionnez un cas d&apos;étude pour ce logiciel.</p>
      </SectionCard>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title={`Saisie ${toolLabel}`}
        subtitle={`${sections.length} section${sections.length > 1 ? 's' : ''} — ${profile.label}`}
      >
        <p className="text-[13px] leading-6 text-[#475569]">
          {activeTool === 'talren'
            ? 'Talren couvre la stabilité des ouvrages géotechniques : géométrie, stratigraphie, eau, surcharges et vérifications.'
            : 'Allyze couvre le dimensionnement de chaussées et plateformes : trafic, géométrie, plateforme, sols et matériaux.'}
        </p>
      </SectionCard>

      {sections.map((section) => (
        <SectionCard
          key={section.id}
          title={`${toolLabel} — ${section.title}`}
        >
          {section.repeatable ? (
            <RepeatableBlock
              repeatable={section.repeatable}
              rows={values[section.repeatable.id]}
              readOnly={readOnly}
              onChange={(nextRows) => patchRepeatable(section.repeatable.id, nextRows)}
            />
          ) : (
            <FieldGrid columns={section.columns || 1}>
              {(section.fields || []).map((fieldDef) => (
                <CalcField
                  key={fieldDef.id}
                  fieldDef={fieldDef}
                  value={values[fieldDef.id]}
                  readOnly={readOnly}
                  onChange={(nextValue) => patchField(fieldDef.id, nextValue)}
                />
              ))}
            </FieldGrid>
          )}
          {section.id === 'resultats' ? (
            <div className="mt-4 pt-4 border-t border-[#eef2f7]">
              <div className="text-[10px] font-bold uppercase tracking-[.06em] text-[#8a95a8] mb-2">
                Captures & prints
              </div>
              <FigureUploadZone
                figures={values.figures}
                readOnly={readOnly}
                toolLabel={toolLabel}
                onChange={(nextFigures) => patchField('figures', nextFigures)}
              />
            </div>
          ) : null}
        </SectionCard>
      ))}
    </div>
  )
}
