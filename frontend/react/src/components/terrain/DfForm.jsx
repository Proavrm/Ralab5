import Input from '@/components/ui/Input'
import { Card, FG } from '@/components/essais/essaiFormUi'
import {
  DF_OUVRAGE_OPTIONS,
  computeDfResultats,
  emptyDfPoint,
  serializeDfPayload,
  unwrapDfPayload,
} from '@/lib/dfEssai'

export default function DfForm({ res = {}, onChange, readOnly = false, norme = 'NF P 98-200-2' }) {
  const computed = computeDfResultats(unwrapDfPayload(res))

  function emit(next) {
    onChange?.(serializeDfPayload(next))
  }

  function setField(key, value) {
    emit({ ...computed, [key]: value })
  }

  function setOuvrage(key, value) {
    emit({ ...computed, ouvrage: { ...computed.ouvrage, [key]: value } })
  }

  function setPoint(index, key, value) {
    const points = computed.points.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    ))
    emit({ ...computed, points })
  }

  function addPoint() {
    emit({ ...computed, points: [...computed.points, emptyDfPoint(computed.points.length)] })
  }

  function removePoint(index) {
    emit({ ...computed, points: computed.points.filter((_, rowIndex) => rowIndex !== index) })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Renseignements généraux">
        <p className="mb-3 text-[12px] text-text-muted">Norme {norme} — déflexions Gauche / Axe / Droite en 1/100 mm.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FG label="Opérateur">
            <Input value={computed.operateur} disabled={readOnly} onChange={(event) => setField('operateur', event.target.value)} />
          </FG>
          <FG label="Date essai">
            <Input type="date" value={computed.date_essai} disabled={readOnly} onChange={(event) => setField('date_essai', event.target.value)} />
          </FG>
          <FG label="Matériel">
            <Input value={computed.materiel} disabled={readOnly} onChange={(event) => setField('materiel', event.target.value)} />
          </FG>
          <FG label="Charge roulante (kN)">
            <Input value={computed.charge_roulante_kn} disabled={readOnly} onChange={(event) => setField('charge_roulante_kn', event.target.value)} />
          </FG>
          <FG label="T surface (°C)">
            <Input value={computed.temperature_surface_c} disabled={readOnly} onChange={(event) => setField('temperature_surface_c', event.target.value)} />
          </FG>
          <FG label="Matériaux">
            <Input value={computed.materiaux} disabled={readOnly} onChange={(event) => setField('materiaux', event.target.value)} />
          </FG>
          <FG label="Section contrôlée">
            <Input value={computed.section_controlee} disabled={readOnly} onChange={(event) => setField('section_controlee', event.target.value)} />
          </FG>
          <FG label="Nature du matériau">
            <Input value={computed.nature_materiau} disabled={readOnly} onChange={(event) => setField('nature_materiau', event.target.value)} />
          </FG>
          <FG label="Partie d'ouvrage">
            <Input value={computed.partie_ouvrage} disabled={readOnly} onChange={(event) => setField('partie_ouvrage', event.target.value)} />
          </FG>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          {DF_OUVRAGE_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="accent-nge"
                disabled={readOnly}
                checked={Boolean(computed.ouvrage?.[option.key])}
                onChange={(event) => setOuvrage(option.key, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </div>
        {computed.ouvrage?.autres ? (
          <div className="mt-3 max-w-md">
            <FG label="Autres (préciser)">
              <Input value={computed.ouvrage?.autres_libelle || ''} disabled={readOnly} onChange={(event) => setOuvrage('autres_libelle', event.target.value)} />
            </FG>
          </div>
        ) : null}
      </Card>

      <Card title="Critères de conformité">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FG label="Source des critères">
            <Input value={computed.source_criteres} disabled={readOnly} onChange={(event) => setField('source_criteres', event.target.value)} />
          </FG>
          <FG label="Déflexions ≥ N /100e mm">
            <Input value={computed.critere_deflexion_100e_mm} disabled={readOnly} onChange={(event) => setField('critere_deflexion_100e_mm', event.target.value)} />
          </FG>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
          <div className="text-[22px] font-bold leading-none text-[#3b6d11]">{computed.moyenne_gauche ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">Moy. gauche</div>
        </div>
        <div className="rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
          <div className="text-[22px] font-bold leading-none text-[#3b6d11]">{computed.moyenne_axe ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">Moy. axe</div>
        </div>
        <div className="rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
          <div className="text-[22px] font-bold leading-none text-[#3b6d11]">{computed.moyenne_droite ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">Moy. droite</div>
        </div>
        <div className="rounded-lg border border-[#90bfe8] bg-[#e6f1fb] px-5 py-3 text-center">
          <div className="text-[22px] font-bold leading-none text-[#185fa5]">{computed.taux_conformes_percent ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#185fa5]">Conformes %</div>
        </div>
      </div>

      <Card title="Mesures (1/100 mm)">
        <div className="mb-3 flex justify-end">
          <button type="button" className="text-xs font-semibold text-nge" onClick={addPoint} disabled={readOnly}>+ Point</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg">
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">N° essai</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">N° profil</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Gauche</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Axe</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Droite</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Observations</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {computed.points.map((row, index) => (
                <tr key={row.id ?? index} className="border-b border-border">
                  {['essai_no', 'profil', 'gauche', 'axe', 'droite', 'observations'].map((key) => (
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

      <Card title="Conclusion">
        <textarea
          rows={3}
          disabled={readOnly}
          value={computed.conclusion || ''}
          onChange={(event) => setField('conclusion', event.target.value)}
          className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge"
        />
      </Card>
    </div>
  )
}
