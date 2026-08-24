import Input, { Select } from '@/components/ui/Input'
import { Card, FG } from '@/components/essais/essaiFormUi'
import { TERRAIN_HEADER_FIELDS } from '@/lib/terrainEssaiDraft'
import {
  computeFwdResultats,
  emptyFwdPoint,
  hydrateFwdPayload,
  serializeFwdPayload,
} from '@/lib/fwdEssai'

export default function FwdForm({ res = {}, onChange, readOnly = false, norme = '' }) {
  const computed = computeFwdResultats(hydrateFwdPayload(res))

  function emit(next) {
    onChange?.(serializeFwdPayload(next))
  }

  function setHeader(key, value) {
    emit({ ...computed, header: { ...computed.header, [key]: value } })
  }

  function setValue(key, value) {
    emit({ ...computed, values: { ...computed.values, [key]: value } })
  }

  function setConclusion(key, value) {
    emit({ ...computed, conclusion: { ...computed.conclusion, [key]: value } })
  }

  function setPoint(index, key, value) {
    const points = computed.points.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    ))
    emit({ ...computed, points })
  }

  function addPoint() {
    emit({ ...computed, points: [...computed.points, emptyFwdPoint(computed.points.length)] })
  }

  function removePoint(index) {
    emit({ ...computed, points: computed.points.filter((_, rowIndex) => rowIndex !== index) })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte">
        {norme ? <p className="mb-3 text-[12px] text-text-muted">Norme {norme}</p> : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {TERRAIN_HEADER_FIELDS.map((field) => (
            <FG key={field.key} label={field.label}>
              <Input
                type={field.key === 'test_date' ? 'date' : 'text'}
                value={computed.header?.[field.key] || ''}
                disabled={readOnly}
                onChange={(event) => setHeader(field.key, event.target.value)}
              />
            </FG>
          ))}
        </div>
      </Card>

      <Card title="Paramètres essai">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FG label="Équipement FWD">
            <Input value={computed.values?.equipment || ''} disabled={readOnly} onChange={(event) => setValue('equipment', event.target.value)} />
          </FG>
          <FG label="Charge (kg)">
            <Input value={computed.values?.load_kg || ''} disabled={readOnly} onChange={(event) => setValue('load_kg', event.target.value)} />
          </FG>
          <FG label="Capteurs">
            <Input value={computed.values?.sensor_type || ''} disabled={readOnly} onChange={(event) => setValue('sensor_type', event.target.value)} />
          </FG>
          <FG label="Critère déflexion max (mm)">
            <Input value={computed.values?.criteria_deflexion_mm || ''} disabled={readOnly} onChange={(event) => setValue('criteria_deflexion_mm', event.target.value)} />
          </FG>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
          <div className="text-[26px] font-bold leading-none text-[#3b6d11]">{computed.moyenne_deflexion_mm ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">d moy. (mm)</div>
        </div>
        <div className="rounded-lg border border-[#90bfe8] bg-[#e6f1fb] px-5 py-3 text-center">
          <div className="text-[22px] font-bold leading-none text-[#185fa5]">{computed.taux_conformes_percent ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#185fa5]">Conformes %</div>
        </div>
      </div>

      <Card title="Points de mesure">
        <div className="mb-3 flex justify-end">
          <button type="button" className="text-xs font-semibold text-nge" onClick={addPoint} disabled={readOnly}>+ Point</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Point</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">PK / repère</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">d (mm)</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">T (°C)</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Observations</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {computed.points.map((row, index) => (
                <tr key={row.id ?? index} className="border-b border-border">
                  {['point_code', 'pk', 'deflexion_mm', 'temperature_c', 'observations'].map((key) => (
                    <td key={key} className="px-1 py-1.5">
                      <Input value={row[key]} disabled={readOnly} onChange={(event) => setPoint(index, key, event.target.value)} />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button type="button" className="text-[12px] font-bold text-[#a32d2d]" disabled={readOnly} onClick={() => removePoint(index)}>Retirer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Conclusion provisoire">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FG label="Conformité">
            <Select
              value={computed.conclusion?.conformity || 'pour_info'}
              disabled={readOnly}
              onChange={(event) => setConclusion('conformity', event.target.value)}
            >
              <option value="pour_info">Pour information</option>
              <option value="conforme">Conforme</option>
              <option value="non_conforme">Non conforme</option>
            </Select>
          </FG>
          <FG label="Contrôleur">
            <Input value={computed.conclusion?.controller || ''} disabled={readOnly} onChange={(event) => setConclusion('controller', event.target.value)} />
          </FG>
          <div className="md:col-span-2">
            <FG label="Commentaires">
              <textarea
                rows={3}
                disabled={readOnly}
                value={computed.conclusion?.comments || ''}
                onChange={(event) => setConclusion('comments', event.target.value)}
                className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge"
              />
            </FG>
          </div>
        </div>
      </Card>
    </div>
  )
}
