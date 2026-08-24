import { useState } from 'react'
import { Select } from '@/components/ui/Input'
import { Card, FG, FR } from '@/components/essais/essaiFormUi'
import {
  ES_ECART_MAX,
  ES_TYPES,
  computeEsResultats,
  esTypeLabel,
  unwrapEsResultats,
} from '@/lib/esEssai'

export default function EquivalentSableForm({ res = {}, onChange, readOnly = false }) {
  const initial = unwrapEsResultats(res)
  const [typeMateriau, setTypeMateriau] = useState(initial.type_materiau)
  const [nature, setNature] = useState(initial.nature_materiau)
  const [dets, setDets] = useState(initial.determinations)

  function emit(nextDets, nextType, nextNature) {
    onChange?.(JSON.stringify(computeEsResultats({
      type_materiau: nextType,
      nature_materiau: nextNature,
      determinations: nextDets,
    })))
  }

  function setDet(index, key, value) {
    const next = dets.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    setDets(next)
    emit(next, typeMateriau, nature)
  }

  function addDet() {
    const next = [...dets, { id: dets.length + 1, actif: true, mh: '', h1: '', h2: '', h2v: '' }]
    setDets(next)
    emit(next, typeMateriau, nature)
  }

  const computed = computeEsResultats({
    type_materiau: typeMateriau,
    nature_materiau: nature,
    determinations: dets,
  })
  const labelSE = typeMateriau === 'sols' ? 'ES' : 'SE'

  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte">
        {readOnly ? (
          <div className="grid grid-cols-2 gap-4">
            <FR label="Type / norme" value={esTypeLabel(typeMateriau)} />
            <FR label="Nature du matériau" value={nature || null} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FG label="Type / norme">
              <Select value={typeMateriau} onChange={(event) => {
                setTypeMateriau(event.target.value)
                emit(dets, event.target.value, nature)
              }} className="w-full" tabIndex={0}>
                {ES_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </FG>
            <FG label="Nature du matériau">
              <input
                value={nature}
                onChange={(event) => {
                  setNature(event.target.value)
                  emit(dets, typeMateriau, event.target.value)
                }}
                className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-nge"
                tabIndex={0}
              />
            </FG>
          </div>
        )}
        {!readOnly ? (
          <p className="mt-3 text-[11px] italic text-text-muted">
            {labelSE} P = (h2 / h1) × 100 · {labelSE} V = (h′2 / h1) × 100. Deux prises ; écart max. {ES_ECART_MAX} points.
            Protocole : addition du matériau, agitation à t+10 min, lavage puis repos, lecture à t+20 min.
          </p>
        ) : null}
      </Card>

      {(computed.se_p != null || computed.se_v != null) && (
        <div className="flex flex-wrap gap-3">
          {computed.se_p != null && (
            <div className="rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
              <div className="text-[26px] font-bold leading-none text-[#3b6d11]">{computed.se_p}</div>
              <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">{labelSE} P échantillon</div>
            </div>
          )}
          {computed.se_v != null && (
            <div className="rounded-lg border border-[#90bfe8] bg-[#e6f1fb] px-5 py-3 text-center">
              <div className="text-[26px] font-bold leading-none text-[#185fa5]">{computed.se_v}</div>
              <div className="mt-1 text-[11px] font-medium text-[#185fa5]">{labelSE} V échantillon</div>
            </div>
          )}
          {computed.ecart_p != null && (
            <div className={`rounded-lg border px-5 py-3 text-center ${computed.ecart_ok ? 'border-[#b5d88a] bg-[#eaf3de]' : 'border-[#f0a0a0] bg-[#fcebeb]'}`}>
              <div className={`text-[26px] font-bold leading-none ${computed.ecart_ok ? 'text-[#3b6d11]' : 'text-[#a32d2d]'}`}>{computed.ecart_p}</div>
              <div className={`mt-1 text-[11px] font-medium ${computed.ecart_ok ? 'text-[#5a8f30]' : 'text-[#a32d2d]'}`}>
                Écart {labelSE} P {computed.ecart_ok ? `≤ ${ES_ECART_MAX}` : `> ${ES_ECART_MAX} — à reprendre`}
              </div>
            </div>
          )}
        </div>
      )}

      <Card title={`Prises d'essai — ${labelSE} P / ${labelSE} V`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="w-6 px-2 py-2 text-[11px] font-medium text-text-muted">✓</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">N°</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">Mh (g)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">h1 floculat (mm)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">h2 piston (mm)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">h′2 vue (mm)</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-nge">{labelSE} P</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-nge">{labelSE} V</th>
              </tr>
            </thead>
            <tbody>
              {computed.determinations.map((row, index) => (
                <tr key={row.id ?? index} className={`border-b border-border ${row.actif ? '' : 'opacity-30'}`}>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={Boolean(row.actif)}
                      onChange={(event) => setDet(index, 'actif', event.target.checked)}
                      disabled={readOnly}
                      className="accent-nge"
                      tabIndex={0}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-[12px] text-text-muted">{row.id}</td>
                  {['mh', 'h1', 'h2', 'h2v'].map((key) => (
                    <td key={key} className="px-1 py-1.5">
                      {readOnly ? (
                        <span className="block pr-3 text-right text-[12px]">{row[key] || '—'}</span>
                      ) : (
                        <input
                          type="number"
                          step="0.1"
                          value={row[key]}
                          onChange={(event) => setDet(index, key, event.target.value)}
                          disabled={!row.actif}
                          className="w-[90px] rounded border border-border bg-bg px-2 py-1 text-right text-[12px] outline-none focus:border-nge disabled:opacity-40"
                          tabIndex={0}
                        />
                      )}
                    </td>
                  ))}
                  <td className={`px-3 py-1.5 text-right font-bold ${row.se_p != null && row.actif ? 'text-[14px] text-nge' : 'text-[12px] text-text-muted'}`}>
                    {row.se_p ?? '—'}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-bold ${row.se_v != null && row.actif ? 'text-[14px] text-nge' : 'text-[12px] text-text-muted'}`}>
                    {row.se_v ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly ? (
          <button type="button" onClick={addDet} className="mt-3 text-[12px] text-nge hover:underline" tabIndex={0}>
            + Ajouter une prise
          </button>
        ) : null}
      </Card>
    </div>
  )
}
