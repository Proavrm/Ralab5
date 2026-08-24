import { useState } from 'react'
import { Card, FG, FR } from '@/components/essais/essaiFormUi'
import { TX_FRACTIONS, computeTxResultats, unwrapTxResultats } from '@/lib/txEssai'

export default function TextureTerreForm({ res = {}, onChange, readOnly = false }) {
  const initial = unwrapTxResultats(res)
  const [draft, setDraft] = useState(initial)

  function emit(next) {
    onChange?.(JSON.stringify(computeTxResultats(next)))
  }

  function setField(key, value) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    emit(next)
  }

  const computed = computeTxResultats(draft)

  return (
    <div className="flex flex-col gap-4">
      <Card title="Méthode / norme">
        {readOnly ? (
          <div className="grid grid-cols-2 gap-4">
            <FR label="Méthode" value={draft.methode || null} />
            <FR label="Norme" value={draft.norme || null} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FG label="Méthode (configurable)">
              <input
                value={draft.methode}
                onChange={(e) => setField('methode', e.target.value)}
                placeholder="Ex. analyse granulométrique / texture"
                className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-nge"
              />
            </FG>
            <FG label="Norme (configurable)">
              <input
                value={draft.norme}
                onChange={(e) => setField('norme', e.target.value)}
                placeholder="Référence à confirmer / renseigner"
                className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-nge"
              />
            </FG>
          </div>
        )}
      </Card>

      <Card title="Fractions granulométriques (% massique)">
        {!readOnly ? (
          <p className="mb-3 text-[11px] italic text-text-muted">
            Saisir les pourcentages massiques. Limons totaux et sables totaux sont calculés automatiquement.
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-muted">
                <th className="px-2 py-1.5 font-medium">Fraction</th>
                <th className="px-2 py-1.5 font-medium text-right">Résultat (%)</th>
              </tr>
            </thead>
            <tbody>
              {TX_FRACTIONS.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <td className="px-2 py-1.5">{row.label}</td>
                  <td className="px-2 py-1.5 text-right">
                    {readOnly ? (
                      <span className="font-medium">{draft[row.key] === '' || draft[row.key] == null ? '—' : draft[row.key]}</span>
                    ) : (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft[row.key]}
                        onChange={(e) => setField(row.key, e.target.value)}
                        className="w-24 rounded border border-border bg-bg px-2 py-1 text-right text-[12px] outline-none focus:border-nge"
                      />
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-bg/60">
                <td className="px-2 py-1.5 font-semibold">Limons totaux (fins + grossiers)</td>
                <td className="px-2 py-1.5 text-right font-semibold">{computed.limons_totaux ?? '—'}</td>
              </tr>
              <tr className="bg-bg/60">
                <td className="px-2 py-1.5 font-semibold">Sables totaux (fins + grossiers)</td>
                <td className="px-2 py-1.5 text-right font-semibold">{computed.sables_totaux ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Observations">
        {readOnly ? (
          <FR label="Observations" value={draft.observations || null} />
        ) : (
          <textarea
            value={draft.observations}
            onChange={(e) => setField('observations', e.target.value)}
            rows={3}
            className="w-full rounded border border-border bg-bg px-2 py-1.5 text-[12px] outline-none focus:border-nge"
          />
        )}
      </Card>
    </div>
  )
}
