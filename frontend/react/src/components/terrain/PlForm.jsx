import Input from '@/components/ui/Input'
import { Card, FG } from '@/components/essais/essaiFormUi'
import {
  PL_EV2_EV1_NOTE,
  computePlResultats,
  emptyPlPoint,
  serializePlPayload,
  unwrapPlPayload,
} from '@/lib/plEssai'

export default function PlForm({ res = {}, onChange, readOnly = false, norme = 'NF P 94-117-1' }) {
  const computed = computePlResultats(unwrapPlPayload(res))

  function emit(next) {
    onChange?.(serializePlPayload(next))
  }

  function setField(key, value) {
    emit({ ...computed, [key]: value })
  }

  function setPoint(index, key, value) {
    const points = computed.points.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    ))
    emit({ ...computed, points })
  }

  function addPoint() {
    emit({ ...computed, points: [...computed.points, emptyPlPoint(computed.points.length)] })
  }

  function removePoint(index) {
    emit({ ...computed, points: computed.points.filter((_, rowIndex) => rowIndex !== index) })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Renseignements généraux">
        <p className="mb-3 text-[12px] text-text-muted">Norme {norme} — essai de chargement à la plaque, modules EV1 / EV2.</p>
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
          <FG label="Partie d'ouvrage">
            <Input value={computed.partie_ouvrage} disabled={readOnly} onChange={(event) => setField('partie_ouvrage', event.target.value)} />
          </FG>
          <FG label="Nature du matériau">
            <Input value={computed.nature_materiau} disabled={readOnly} onChange={(event) => setField('nature_materiau', event.target.value)} />
          </FG>
          <FG label="Diamètre plaque (mm)">
            <Input value={computed.diametre_plaque_mm} disabled={readOnly} onChange={(event) => setField('diametre_plaque_mm', event.target.value)} />
          </FG>
        </div>
      </Card>

      <Card title="Critères de conformité">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FG label="Source des critères">
            <Input value={computed.source_criteres} disabled={readOnly} onChange={(event) => setField('source_criteres', event.target.value)} />
          </FG>
          <FG label="EV2 mini (MPa)">
            <Input value={computed.critere_ev2_min_mpa} disabled={readOnly} onChange={(event) => setField('critere_ev2_min_mpa', event.target.value)} />
          </FG>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-[#dbe1ea] bg-white px-5 py-3 text-center">
          <div className="text-[22px] font-bold leading-none">{computed.moyenne_ev1_mpa ?? '—'}</div>
          <div className="mt-1 text-[11px] text-text-muted">EV1 moy. (MPa)</div>
        </div>
        <div className="rounded-lg border border-[#b5d88a] bg-[#eaf3de] px-5 py-3 text-center">
          <div className="text-[26px] font-bold leading-none text-[#3b6d11]">{computed.moyenne_ev2_mpa ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#5a8f30]">EV2 moy. (MPa)</div>
        </div>
        <div className="rounded-lg border border-[#90bfe8] bg-[#e6f1fb] px-5 py-3 text-center">
          <div className="text-[22px] font-bold leading-none text-[#185fa5]">{computed.moyenne_rapport_ev2_ev1 ?? '—'}</div>
          <div className="mt-1 text-[11px] font-medium text-[#185fa5]">EV2/EV1 moy. (indicatif)</div>
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
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">N° essai</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Localisation</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">EV1 (MPa)</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">EV2 (MPa)</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">EV2/EV1 (*)</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Observations</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {computed.points.map((row, index) => (
                <tr key={row.id ?? index} className="border-b border-border">
                  <td className="px-1 py-1.5">
                    <Input value={row.point_no} disabled={readOnly} onChange={(event) => setPoint(index, 'point_no', event.target.value)} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input value={row.localisation} disabled={readOnly} onChange={(event) => setPoint(index, 'localisation', event.target.value)} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input value={row.ev1_mpa} disabled={readOnly} onChange={(event) => setPoint(index, 'ev1_mpa', event.target.value)} />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input value={row.ev2_mpa} disabled={readOnly} onChange={(event) => setPoint(index, 'ev2_mpa', event.target.value)} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-nge">{row.rapport_ev2_ev1 ?? '—'}</td>
                  <td className="px-1 py-1.5">
                    <Input value={row.observation} disabled={readOnly} onChange={(event) => setPoint(index, 'observation', event.target.value)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button type="button" className="text-[12px] font-bold text-[#a32d2d]" disabled={readOnly} onClick={() => removePoint(index)}>Retirer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] italic text-text-muted">(*) {PL_EV2_EV1_NOTE}</p>
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
