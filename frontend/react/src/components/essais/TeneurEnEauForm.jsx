import { useState } from 'react'
import { Select } from '@/components/ui/Input'
import {
  WE_METHODES,
  WE_USAGES,
  WE_ECART_MAX_PERCENT,
  computeWeDraft,
  padWeDeterminations,
  serializeWeResultats,
  unwrapWeResultats,
  weMethodeLabel,
  weUsageLabel,
} from '@/lib/weEssai'

function Card({ title, children }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
      {title ? (
        <div className="border-b border-border bg-bg px-4 py-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </div>
  )
}

function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}

function FR({ label, value }) {
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium ${!value && value !== 0 ? 'font-normal italic text-text-muted' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export default function TeneurEnEauForm({ res = {}, onChange, readOnly = false }) {
  const initial = unwrapWeResultats(res)
  const [usage, setUsage] = useState(initial.usage)
  const [methode, setMethode] = useState(initial.methode)
  const [dets, setDets] = useState(initial.determinations)

  function emit(nextDets, nextUsage, nextMethode) {
    onChange?.(serializeWeResultats({
      usage: nextUsage,
      methode: nextMethode,
      determinations: nextDets,
    }))
  }

  function setDet(index, key, value) {
    const next = dets.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row))
    setDets(next)
    emit(next, usage, methode)
  }

  function onUsage(nextUsage) {
    const nextDets = (nextUsage === 'proctor' || nextUsage === 'traitement')
      ? padWeDeterminations(dets, nextUsage)
      : dets
    setUsage(nextUsage)
    setDets(nextDets)
    emit(nextDets, nextUsage, methode)
  }

  function onMethode(nextMethode) {
    setMethode(nextMethode)
    emit(dets, usage, nextMethode)
  }

  const computed = computeWeDraft({ determinations: dets })

  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte et méthode">
        {readOnly ? (
          <div className="grid grid-cols-2 gap-4">
            <FR label="Usage" value={weUsageLabel(usage)} />
            <FR label="Méthode" value={weMethodeLabel(methode)} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FG label="Usage / contexte">
              <Select value={usage} onChange={(event) => onUsage(event.target.value)} className="w-full" tabIndex={-1}>
                {WE_USAGES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </FG>
            <FG label="Méthode de dessiccation">
              <Select value={methode} onChange={(event) => onMethode(event.target.value)} className="w-full" tabIndex={0}>
                {WE_METHODES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </FG>
          </div>
        )}
      </Card>

      <Card title="Pesées — NF P 94-050">
        {!readOnly ? (
          <p className="mb-3 text-[11px] italic text-text-muted">
            Minimum 2 déterminations. Masses en grammes. M1 = récipient vide, M2 = +sol humide, M3 = +sol sec (après étuvage).
            w = (M2−M3)/(M3−M1)×100.
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="w-6 px-2 py-2 text-[11px] font-medium text-text-muted">✓</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">N°</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Boîte</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M1<br /><span className="font-normal opacity-60">Récipient (g)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M2<br /><span className="font-normal opacity-60">+Humide (g)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M3<br /><span className="font-normal opacity-60">+Sec (g)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M eau (g)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M sol sec (g)</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-nge">w (%)</th>
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
                  <td className="px-1 py-1.5">
                    {readOnly ? (
                      <span className="text-[12px]">{row.boite || '—'}</span>
                    ) : (
                      <input
                        value={row.boite}
                        onChange={(event) => setDet(index, 'boite', event.target.value)}
                        disabled={!row.actif}
                        placeholder="ex: B-12"
                        className="w-[65px] rounded border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-nge disabled:opacity-40"
                        tabIndex={0}
                      />
                    )}
                  </td>
                  {['m1', 'm2', 'm3'].map((key) => (
                    <td key={key} className="px-1 py-1.5">
                      {readOnly ? (
                        <span className="block pr-3 text-right text-[12px]">{row[key] || '—'}</span>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={row[key]}
                          onChange={(event) => setDet(index, key, event.target.value)}
                          disabled={!row.actif}
                          className="w-[90px] rounded border border-border bg-bg px-2 py-1 text-right text-[12px] outline-none focus:border-nge disabled:opacity-40"
                          tabIndex={0}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{row.m_eau ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{row.m_sol_sec ?? '—'}</td>
                  <td className={`px-3 py-1.5 text-right font-bold ${row.w != null && row.actif ? 'text-[14px] text-nge' : 'text-[12px] text-text-muted'}`}>
                    {row.w ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-3">
          {computed.wMoyen != null ? (
            <div className="flex items-center gap-3 rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3">
              <div>
                <div className="text-[30px] font-bold leading-none text-[#3b6d11]">{computed.wMoyen} %</div>
                <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">
                  w moyen — {computed.nbDet} détermination{computed.nbDet > 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ) : null}
          {computed.ecart != null ? (
            <div className={`rounded-lg border px-4 py-3 text-[12px] ${
              computed.conforme
                ? 'border-[#b5d88a] bg-[#eaf3de] text-[#3b6d11]'
                : 'border-[#f0a0a0] bg-[#fcebeb] text-[#a32d2d]'
            }`}
            >
              <div className="font-bold">{computed.conforme ? '✓ Conformes' : '⚠ Écart excessif'}</div>
              <div className="opacity-80">Écart: {computed.ecart} % (seuil: {WE_ECART_MAX_PERCENT.toFixed(1).replace('.', ',')} %)</div>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
