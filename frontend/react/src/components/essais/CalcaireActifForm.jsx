import { useState } from 'react'
import { Card, FG, FR } from '@/components/essais/essaiFormUi'
import { computeCaResultats, unwrapCaResultats } from '@/lib/caEssai'

export default function CalcaireActifForm({ res = {}, onChange, readOnly = false }) {
  const initial = unwrapCaResultats(res)
  const [draft, setDraft] = useState(initial)

  function emit(next) {
    onChange?.(JSON.stringify(computeCaResultats(next)))
  }

  function setField(key, value) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    emit(next)
  }

  const computed = computeCaResultats(draft)

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
                placeholder="Ex. dosage calcaire actif"
                className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-nge"
              />
            </FG>
            <FG label="Norme (configurable)">
              <input
                value={draft.norme}
                onChange={(e) => setField('norme', e.target.value)}
                placeholder="Référence à renseigner"
                className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-nge"
              />
            </FG>
          </div>
        )}
      </Card>

      <Card title="Mesures de laboratoire">
        {!readOnly ? (
          <p className="mb-3 text-[11px] italic text-text-muted">
            Résultat (%) = (V titre − V blanc) × facteur / prise d&apos;essai.
            Le facteur de titre dépend de la méthode retenue — ne pas inventer une norme.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['prise_essai_g', "Prise d'essai (g)"],
            ['volume_titre_ml', 'Volume titré (mL)'],
            ['blanc_ml', 'Blanc (mL)'],
            ['facteur_titre', 'Facteur de titre'],
          ].map(([key, label]) => (
            <FG key={key} label={label}>
              {readOnly ? (
                <FR label="" value={draft[key] === '' || draft[key] == null ? null : draft[key]} />
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft[key]}
                  onChange={(e) => setField(key, e.target.value)}
                  className="w-full rounded border border-border bg-bg px-2 py-1 text-[12px] outline-none focus:border-nge"
                />
              )}
            </FG>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <FR label="Volume net (mL)" value={computed.volume_net} />
          <FR label="Calcaire actif (%)" value={computed.ca_pct} />
        </div>
        {computed.ca_pct != null ? (
          <div className="mt-3 inline-flex rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
            <div>
              <div className="text-[26px] font-bold leading-none text-[#3b6d11]">{computed.ca_pct}</div>
              <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">Calcaire actif (%)</div>
            </div>
          </div>
        ) : null}
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
