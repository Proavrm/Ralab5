import { useState } from 'react'
import { Select } from '@/components/ui/Input'
import { Card, FG, FR } from '@/components/essais/essaiFormUi'
import { computeMoResultats, moBaseLabel, unwrapMoResultats } from '@/lib/moEssai'

export default function MatiereOrganiqueForm({ res = {}, onChange, readOnly = false }) {
  const initial = unwrapMoResultats(res)
  const [draft, setDraft] = useState(initial)

  function emit(next) {
    onChange?.(JSON.stringify(computeMoResultats(next)))
  }

  function setField(key, value) {
    const next = { ...draft, [key]: value }
    setDraft(next)
    emit(next)
  }

  const computed = computeMoResultats(draft)

  return (
    <div className="flex flex-col gap-4">
      <Card title="Méthode / norme">
        {readOnly ? (
          <div className="grid grid-cols-3 gap-4">
            <FR label="Méthode" value={draft.methode || null} />
            <FR label="Norme" value={draft.norme || null} />
            <FR label="Base du résultat" value={moBaseLabel(draft.base_resultat)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FG label="Méthode (configurable)">
              <input
                value={draft.methode}
                onChange={(e) => setField('methode', e.target.value)}
                placeholder="Ex. perte au feu"
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
            <FG label="Base du résultat">
              <Select
                value={draft.base_resultat}
                onChange={(e) => setField('base_resultat', e.target.value)}
                className="w-full"
              >
                <option value="matiere_seche">Sur matière sèche</option>
                <option value="matiere_brute">Sur matière brute</option>
              </Select>
            </FG>
          </div>
        )}
      </Card>

      <Card title="Pesées — matière organique">
        {!readOnly ? (
          <p className="mb-3 text-[11px] italic text-text-muted">
            M1 = récipient vide · M2 = récipient + échantillon sec · M3 = après calcination.
            MO (%) = (M2−M3)/(M2−M1)×100.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['boite', 'N° boîte / creuset'],
            ['m1', 'M1 — vide (g)'],
            ['m2', 'M2 — + sol sec (g)'],
            ['m3', 'M3 — après calcination (g)'],
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
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <FR label="Masse sèche (g)" value={computed.masse_seche} />
          <FR label="Résidu (g)" value={computed.masse_residu} />
          <FR label="Perte (g)" value={computed.masse_perdue} />
          <FR label="MO (%)" value={computed.mo_pct} />
        </div>
        {computed.mo_pct != null ? (
          <div className="mt-3 inline-flex rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
            <div>
              <div className="text-[26px] font-bold leading-none text-[#3b6d11]">{computed.mo_pct}</div>
              <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">Matière organique (%)</div>
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
