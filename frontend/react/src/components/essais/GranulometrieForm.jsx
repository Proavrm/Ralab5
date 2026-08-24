import { useEffect, useState } from 'react'
import {
  ALL_TAMIS,
  GR_MODELES,
  buildSegmentTamis,
  calcCoeffVBSFromCalcs,
  calcCuCc,
  calcGR,
  calcWaterInputs,
  initGRCutoffState,
  initGRTamis,
  reconstructGlobalGR,
} from '@/lib/grEssai'
import { Card, FG, FR, num, rnd } from '@/components/essais/essaiFormUi'
import GRChart from '@/components/essais/GRChart'

function GRTamisTable({ title, rows, ms, onSetR, allowEdit = true, onAdd, onRemove, addOptions = [] }) {
  const [showAdd, setShowAdd] = useState(false)
  const [tamisToAdd, setTamisToAdd] = useState('')
  const calcs = calcGR(rows, ms)
  const availableTamis = addOptions.filter(d => !rows.find(t => Number(t.d) === Number(d)))

  useEffect(() => {
    if (!tamisToAdd) return
    if (!availableTamis.find(d => Number(d) === Number(tamisToAdd))) {
      setTamisToAdd('')
    }
  }, [tamisToAdd, availableTamis])

  function handleAdd() {
    if (!tamisToAdd || !onAdd) return
    onAdd(tamisToAdd)
    setTamisToAdd('')
    setShowAdd(false)
  }

  return (
    <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
      </div>
      <div className="p-4">
        <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0">
              <tr className="bg-bg border-b border-border">
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Refus (g)</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Rc%</th>
                <th className="px-2 py-2 text-right text-[11px] font-bold text-nge">Pass%</th>
                <th className="w-5"></th>
              </tr>
            </thead>
            <tbody>
              {[...calcs].reverse().map(t => (
                <tr key={t.d} className="border-b border-border">
                  <td className="px-2 py-1 font-mono text-[12px] font-bold">{t.d}</td>
                  <td className="px-1 py-1">
                    {allowEdit ? (
                      <input
                        type="number"
                        step="0.01"
                        value={t.r}
                        onChange={e => onSetR(t.d, e.target.value)}
                        className="w-[80px] px-2 py-0.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge text-right"
                        tabIndex={0}
                      />
                    ) : (
                      <span className="text-[12px]">{t.r || '—'}</span>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right text-[11px] text-text-muted">{t.rc_pct ?? '—'}</td>
                  <td className="px-2 py-1 text-right font-bold text-[12px] text-nge">{t.passant ?? '—'}</td>
                  <td className="px-1 py-1 text-center">
                    {allowEdit && !!onRemove && (
                      <button onClick={() => onRemove(t.d)} className="text-[10px] text-text-muted hover:text-danger" tabIndex={-1}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {allowEdit && !!onAdd && (
          <div className="mt-2">
            {showAdd ? (
              <div className="flex items-center gap-2">
                <select value={tamisToAdd} onChange={e => setTamisToAdd(e.target.value)} className="px-2 py-1 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}>
                  <option value="">— Tamis —</option>
                  {availableTamis.map(d => <option key={d} value={d}>{d} mm</option>)}
                </select>
                <Button size="sm" onClick={handleAdd} disabled={!tamisToAdd} tabIndex={0}>+</Button>
                <Button size="sm" onClick={() => { setShowAdd(false); setTamisToAdd('') }} tabIndex={0}>✕</Button>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)} className="text-[12px] text-nge hover:underline" tabIndex={0}>+ Ajouter un tamis</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function GranulometrieForm({ res, onChange, readOnly }) {
  const initialModePreparation = res.mode_preparation || 'directe'
  const [modePreparation, setModePreparation] = useState(initialModePreparation)
  const [modele, setModele] = useState(res.modele || 'Sols GTR')

  const [m1, setM1] = useState(res.m1 || '')
  const [m2, setM2] = useState(res.m2 || '')
  const [m3, setM3] = useState(res.m3 || '')
  const [mh, setMh] = useState(res.mh || '')
  const [tamis, setTamis] = useState(() => initGRTamis(res))
  const [showAdd, setShowAdd] = useState(false)
  const [tamisToAdd, setTamisToAdd] = useState('')
  const [showPassantEditor, setShowPassantEditor] = useState(false)

  const initialCutoff = initGRCutoffState(res, modele)
  const [d1, setD1] = useState(initialCutoff.d1)
  const [hasD2, setHasD2] = useState(initialCutoff.has_d2)
  const [d2, setD2] = useState(initialCutoff.d2)
  const [coarseTamis, setCoarseTamis] = useState(initialCutoff.coarse)
  const [frac1, setFrac1] = useState(initialCutoff.frac1)
  const [frac2, setFrac2] = useState(initialCutoff.frac2)
  const [coarseAdd, setCoarseAdd] = useState('')
  const [frac1Add, setFrac1Add] = useState('')
  const [frac2Add, setFrac2Add] = useState('')

  const directWater = calcWaterInputs(m1, m2, m3, mh)
  const calcs = calcGR(tamis, directWater.ms)
  const p80 = calcs.find(t => t.d === 0.08 || t.d === 0.063)?.passant ?? null
  const dmax = [...calcs].sort((a, b) => b.d - a.d).find(t => t.passant !== null && t.passant < 100)?.d ?? null
  const coeffVBS = calcCoeffVBSFromCalcs(calcs)

  const frac1Water = calcWaterInputs(frac1.m1, frac1.m2, frac1.m3, frac1.mh)
  const frac2Water = calcWaterInputs(frac2.m1, frac2.m2, frac2.m3, frac2.mh)
  const frac1Calcs = calcGR(frac1.tamis, frac1Water.ms)
  const frac2Calcs = calcGR(frac2.tamis, frac2Water.ms)
  const cutoffGlobal = reconstructGlobalGR({
    d1,
    d2,
    hasD2,
    coarseTamis,
    frac1Calcs,
    frac2Calcs,
    ms1: frac1Water.ms,
    ms2: frac2Water.ms,
  })

  const cutoffCuCc = calcCuCc(cutoffGlobal.rows)

  function emitDirect(next = {}) {
    const nextModele = next.modele ?? modele
    const nextM1 = next.m1 ?? m1
    const nextM2 = next.m2 ?? m2
    const nextM3 = next.m3 ?? m3
    const nextMh = next.mh ?? mh
    const nextTamis = next.tamis ?? tamis
    const water = calcWaterInputs(nextM1, nextM2, nextM3, nextMh)
    const nextCalcs = calcGR(nextTamis, water.ms)
    const p80_ = nextCalcs.find(x => x.d === 0.08 || x.d === 0.063)?.passant ?? null
    const dmax_ = [...nextCalcs].sort((a, b) => b.d - a.d).find(x => x.passant !== null && x.passant < 100)?.d ?? null
    const coeffVBS_ = calcCoeffVBSFromCalcs(nextCalcs)
    const p20_ = nextCalcs.find(x => Number(x.d) === 20)?.passant ?? null
    onChange(JSON.stringify({
      mode_preparation: 'directe',
      modele: nextModele,
      m1: nextM1,
      m2: nextM2,
      m3: nextM3,
      mh: nextMh,
      w: water.w,
      ms: water.ms,
      tamis: nextTamis,
      passant_80: p80_,
      passant_20: p20_,
      dmax: dmax_,
      coeff_vbs: coeffVBS_,
    }))
  }

  function emitCutoff(override = {}) {
    const nextModele = override.modele ?? modele
    const nextD1 = num(override.d1 ?? d1) ?? 20
    const nextHasD2 = override.has_d2 ?? hasD2
    const nextD2 = num(override.d2 ?? d2) ?? 5
    const nextCoarse = override.coarse_tamis ?? coarseTamis
    const nextFrac1 = override.frac1 ?? frac1
    const nextFrac2 = override.frac2 ?? frac2
    const nextFrac1Water = calcWaterInputs(nextFrac1.m1, nextFrac1.m2, nextFrac1.m3, nextFrac1.mh)
    const nextFrac2Water = calcWaterInputs(nextFrac2.m1, nextFrac2.m2, nextFrac2.m3, nextFrac2.mh)
    const nextFrac1Calcs = calcGR(nextFrac1.tamis, nextFrac1Water.ms)
    const nextFrac2Calcs = calcGR(nextFrac2.tamis, nextFrac2Water.ms)
    const nextGlobal = reconstructGlobalGR({
      d1: nextD1,
      d2: nextD2,
      hasD2: nextHasD2,
      coarseTamis: nextCoarse,
      frac1Calcs: nextFrac1Calcs,
      frac2Calcs: nextFrac2Calcs,
      ms1: nextFrac1Water.ms,
      ms2: nextFrac2Water.ms,
    })
    const nextGlobalSimple = nextGlobal.rows.map(row => ({ d: row.d, r: row.retained_g ?? '' }))
    onChange(JSON.stringify({
      mode_preparation: 'coupures',
      modele: nextModele,
      d1: nextD1,
      has_d2: nextHasD2,
      d2: nextHasD2 ? nextD2 : null,
      coarse_tamis: nextCoarse,
      frac1: { ...nextFrac1, w: nextFrac1Water.w, ms: nextFrac1Water.ms },
      frac2: nextHasD2 ? { ...nextFrac2, w: nextFrac2Water.w, ms: nextFrac2Water.ms } : null,
      tamis: nextGlobalSimple,
      tamis_global: nextGlobal.rows,
      ms_total: nextGlobal.msTotal,
      mass_gt_d1: nextGlobal.massGtD1,
      mass_lt_d1: nextGlobal.massLtD1,
      passant_d1: nextGlobal.passingD1,
      passant_d2: nextGlobal.passingD2,
      passant_20: nextGlobal.rows.find(x => Number(x.d) === 20)?.passant ?? null,
      passant_5: nextGlobal.rows.find(x => Number(x.d) === 5)?.passant ?? null,
      passant_80: nextGlobal.p80,
      dmax: nextGlobal.dmax,
      coeff_vbs: nextGlobal.coeffVBS,
    }))
  }

  function applyModele(nextModele) {
    setModele(nextModele)
    if (modePreparation === 'directe') {
      const ex = Object.fromEntries(tamis.map(t => [t.d, t.r]))
      const nt = GR_MODELES[nextModele].map(d => ({ d, r: ex[d] || '' }))
      setTamis(nt)
      emitDirect({ modele: nextModele, tamis: nt })
      return
    }
    const nextCoarse = buildSegmentTamis(nextModele, d1, null).map(row => ({ d: row.d, r: coarseTamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac1Tamis = buildSegmentTamis(nextModele, hasD2 ? d2 : 0.08, d1).map(row => ({ d: row.d, r: frac1.tamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac2Tamis = buildSegmentTamis(nextModele, 0.08, d2).map(row => ({ d: row.d, r: frac2.tamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac1 = { ...frac1, tamis: nextFrac1Tamis }
    const nextFrac2 = { ...frac2, tamis: nextFrac2Tamis }
    setCoarseTamis(nextCoarse)
    setFrac1(nextFrac1)
    setFrac2(nextFrac2)
    emitCutoff({ modele: nextModele, coarse_tamis: nextCoarse, frac1: nextFrac1, frac2: nextFrac2 })
  }

  function setR(d, v) {
    const nt = tamis.map(t => (t.d === d ? { ...t, r: v } : t))
    setTamis(nt)
    emitDirect({ tamis: nt })
  }
  function onM1(v) { setM1(v); emitDirect({ m1: v }) }
  function onM2(v) { setM2(v); emitDirect({ m2: v }) }
  function onM3(v) { setM3(v); emitDirect({ m3: v }) }
  function onMh(v) { setMh(v); emitDirect({ mh: v }) }
  function addTamis() {
    const d = parseFloat(tamisToAdd)
    if (!d || tamis.find(t => t.d === d)) { setShowAdd(false); return }
    const nt = [...tamis, { d, r: '' }].sort((a, b) => a.d - b.d)
    setTamis(nt)
    setShowAdd(false)
    setTamisToAdd('')
    emitDirect({ tamis: nt })
  }
  function removeTamis(d) {
    const nt = tamis.filter(t => t.d !== d)
    setTamis(nt)
    emitDirect({ tamis: nt })
  }
  function setPassant(d, newPassant) {
    if (!directWater.ms || directWater.ms <= 0) return
    const newPassantNum = parseFloat(newPassant)
    if (isNaN(newPassantNum)) return
    const targetRc = ((100 - newPassantNum) / 100) * directWater.ms
    const sortedTamis = [...tamis].sort((a, b) => b.d - a.d)
    const newTamis = tamis.map(t => {
      if (t.d === d) {
        const pos = sortedTamis.findIndex(st => st.d === d)
        const prevRefus = sortedTamis.slice(0, pos).reduce((sum, st) => sum + (parseFloat(st.r) || 0), 0)
        const newRefusVal = Math.max(0, targetRc - prevRefus)
        return { ...t, r: rnd(newRefusVal, 2) }
      }
      return t
    })
    setTamis(newTamis)
    emitDirect({ tamis: newTamis })
  }

  function addSegmentTamis(kind, d) {
    if (!d) return
    const val = parseFloat(d)
    if (!val) return
    if (kind === 'coarse') {
      if (coarseTamis.find(t => t.d === val)) return
      const nt = [...coarseTamis, { d: val, r: '' }].sort((a, b) => a.d - b.d)
      setCoarseTamis(nt)
      setCoarseAdd('')
      emitCutoff({ coarse_tamis: nt })
      return
    }
    if (kind === 'frac1') {
      if (frac1.tamis.find(t => t.d === val)) return
      const nt = [...frac1.tamis, { d: val, r: '' }].sort((a, b) => a.d - b.d)
      const nextFrac1 = { ...frac1, tamis: nt }
      setFrac1(nextFrac1)
      setFrac1Add('')
      emitCutoff({ frac1: nextFrac1 })
      return
    }
    if (frac2.tamis.find(t => t.d === val)) return
    const nt = [...frac2.tamis, { d: val, r: '' }].sort((a, b) => a.d - b.d)
    const nextFrac2 = { ...frac2, tamis: nt }
    setFrac2(nextFrac2)
    setFrac2Add('')
    emitCutoff({ frac2: nextFrac2 })
  }

  function removeSegmentTamis(kind, d) {
    if (kind === 'coarse') {
      const nt = coarseTamis.filter(t => t.d !== d)
      setCoarseTamis(nt)
      emitCutoff({ coarse_tamis: nt })
      return
    }
    if (kind === 'frac1') {
      const nt = frac1.tamis.filter(t => t.d !== d)
      const nextFrac1 = { ...frac1, tamis: nt }
      setFrac1(nextFrac1)
      emitCutoff({ frac1: nextFrac1 })
      return
    }
    const nt = frac2.tamis.filter(t => t.d !== d)
    const nextFrac2 = { ...frac2, tamis: nt }
    setFrac2(nextFrac2)
    emitCutoff({ frac2: nextFrac2 })
  }

  function setSegmentRefus(kind, d, v) {
    if (kind === 'coarse') {
      const nt = coarseTamis.map(t => (t.d === d ? { ...t, r: v } : t))
      setCoarseTamis(nt)
      emitCutoff({ coarse_tamis: nt })
      return
    }
    if (kind === 'frac1') {
      const nt = frac1.tamis.map(t => (t.d === d ? { ...t, r: v } : t))
      const nextFrac1 = { ...frac1, tamis: nt }
      setFrac1(nextFrac1)
      emitCutoff({ frac1: nextFrac1 })
      return
    }
    const nt = frac2.tamis.map(t => (t.d === d ? { ...t, r: v } : t))
    const nextFrac2 = { ...frac2, tamis: nt }
    setFrac2(nextFrac2)
    emitCutoff({ frac2: nextFrac2 })
  }

  function updateFrac(kind, field, value) {
    if (kind === 'frac1') {
      const next = { ...frac1, [field]: value }
      setFrac1(next)
      emitCutoff({ frac1: next })
      return
    }
    const next = { ...frac2, [field]: value }
    setFrac2(next)
    emitCutoff({ frac2: next })
  }

  function applyCutoffMode(nextMode) {
    setModePreparation(nextMode)
    if (nextMode === 'directe') {
      emitDirect()
      return
    }
    emitCutoff()
  }

  function updateD1(nextD1) {
    const val = parseFloat(nextD1)
    if (!val) return
    setD1(val)
    const nextCoarse = buildSegmentTamis(modele, val, null).map(row => ({ d: row.d, r: coarseTamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac1Tamis = buildSegmentTamis(modele, hasD2 ? d2 : 0.08, val).map(row => ({ d: row.d, r: frac1.tamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac1 = { ...frac1, tamis: nextFrac1Tamis }
    setCoarseTamis(nextCoarse)
    setFrac1(nextFrac1)
    emitCutoff({ d1: val, coarse_tamis: nextCoarse, frac1: nextFrac1 })
  }

  function updateD2Enabled(enabled) {
    setHasD2(enabled)
    const nextFrac1Tamis = buildSegmentTamis(modele, enabled ? d2 : 0.08, d1).map(row => ({ d: row.d, r: frac1.tamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac1 = { ...frac1, tamis: nextFrac1Tamis }
    setFrac1(nextFrac1)
    emitCutoff({ has_d2: enabled, frac1: nextFrac1 })
  }

  function updateD2(nextD2) {
    const val = parseFloat(nextD2)
    if (!val) return
    setD2(val)
    const nextFrac1Tamis = buildSegmentTamis(modele, val, d1).map(row => ({ d: row.d, r: frac1.tamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac2Tamis = buildSegmentTamis(modele, 0.08, val).map(row => ({ d: row.d, r: frac2.tamis.find(t => t.d === row.d)?.r || '' }))
    const nextFrac1 = { ...frac1, tamis: nextFrac1Tamis }
    const nextFrac2 = { ...frac2, tamis: nextFrac2Tamis }
    setFrac1(nextFrac1)
    setFrac2(nextFrac2)
    emitCutoff({ d2: val, frac1: nextFrac1, frac2: nextFrac2 })
  }

  if (readOnly) {
    if ((res.mode_preparation || 'directe') === 'coupures') {
      const globalRows = Array.isArray(res.tamis_global) ? res.tamis_global : cutoffGlobal.rows
      const chartRows = globalRows.map(row => ({ d: row.d, r: row.retained_g ?? row.r ?? '' }))
      const chartCalcs = globalRows.map(row => ({ d: row.d, r: row.retained_g ?? row.r ?? '', rc_g: row.rc_g ?? null, rc_pct: row.rc_pct ?? null, passant: row.passant ?? null }))
      return (
        <div className="flex flex-col gap-4">
          <Card title="Paramètres">
            <div className="grid grid-cols-5 gap-3">
              <FR label="Mode" value="Avec coupure(s)" />
              <FR label="Modèle" value={res.modele || modele} />
              <FR label="D1" value={res.d1 != null ? `${res.d1} mm` : `${d1} mm`} />
              <FR label="D2" value={res.has_d2 ? `${res.d2} mm` : '—'} />
              <FR label="Ms totale" value={res.ms_total != null ? `${res.ms_total} g` : cutoffGlobal.msTotal != null ? `${cutoffGlobal.msTotal} g` : null} />
            </div>
          </Card>
          <Card title="Reconstitution globale">
            <div className="flex gap-2 mb-3 flex-wrap">
              {(res.passant_20 ?? cutoffGlobal.rows.find(x => Number(x.d) === 20)?.passant) != null && (
                <div className="px-4 py-2 bg-[#e6f1fb] border border-[#90bfe8] rounded text-center">
                  <div className="text-[20px] font-bold text-[#185fa5]">{res.passant_20 ?? cutoffGlobal.rows.find(x => Number(x.d) === 20)?.passant}%</div>
                  <div className="text-[10px] text-[#185fa5]">Passant 20 mm</div>
                </div>
              )}
              {(res.passant_5 ?? cutoffGlobal.rows.find(x => Number(x.d) === 5)?.passant) != null && (
                <div className="px-4 py-2 bg-[#eaf3de] border border-[#b5d88a] rounded text-center">
                  <div className="text-[20px] font-bold text-[#3b6d11]">{res.passant_5 ?? cutoffGlobal.rows.find(x => Number(x.d) === 5)?.passant}%</div>
                  <div className="text-[10px] text-[#5a8f30]">Passant 5 mm</div>
                </div>
              )}
            </div>
            <GRChart tamis={chartRows} calcs={chartCalcs} />
          </Card>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-4">
        <Card title="Paramètres">
          <div className="grid grid-cols-4 gap-3">
            <FR label="Mode" value="Directe" />
            <FR label="Modèle" value={res.modele} />
            <FR label="w (%)" value={res.w != null ? `${res.w} %` : null} />
            <FR label="Mh (g)" value={res.mh ? `${res.mh} g` : null} />
            <FR label="Ms (g)" value={res.ms ? `${res.ms} g` : null} />
          </div>
        </Card>
        <Card title="Courbe granulométrique">
          <div className="flex gap-2 mb-3 flex-wrap">
            {p80 !== null && <div className="px-4 py-2 bg-[#eaf3de] border border-[#b5d88a] rounded text-center">
              <div className="text-[20px] font-bold text-[#3b6d11]">{p80}%</div>
              <div className="text-[10px] text-[#5a8f30]">Passant 80µm</div>
            </div>}
            {dmax !== null && <div className="px-4 py-2 bg-[#e6f1fb] border border-[#90bfe8] rounded text-center">
              <div className="text-[20px] font-bold text-[#185fa5]">{dmax} mm</div>
              <div className="text-[10px] text-[#185fa5]">Dmax</div>
            </div>}
            {(() => {
              const { cu, cc: ccv } = calcCuCc(calcs)
              return <>
                {cu !== null && <div className="px-4 py-2 bg-[#9EA700] border border-[#757a00] rounded text-center">
                  <div className="text-[20px] font-bold text-white">{cu}</div>
                  <div className="text-[10px] text-white">Cu = D60/D10</div>
                </div>}
                {ccv !== null && <div className="px-4 py-2 bg-[#A09074] border border-[#7a6d56] rounded text-center">
                  <div className="text-[20px] font-bold text-white">{ccv}</div>
                  <div className="text-[10px] text-white">Cc = D30²/(D10·D60)</div>
                </div>}
                {coeffVBS !== null && <div className="px-4 py-2 bg-[#7b3f00] border border-[#5b2f00] rounded text-center">
                  <div className="text-[20px] font-bold text-white">{coeffVBS}</div>
                  <div className="text-[10px] text-white">Coeff C (0/5 sur 0/50)</div>
                </div>}
              </>
            })()}
          </div>
          <GRChart tamis={tamis} calcs={calcs} />
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Méthode de préparation">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={modePreparation}
            onChange={e => applyCutoffMode(e.target.value)}
            className="px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge font-medium"
            tabIndex={0}
          >
            <option value="directe">Directe</option>
            <option value="coupures">Avec coupure(s)</option>
          </select>
          <select value={modele} onChange={e => applyModele(e.target.value)} className="px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge font-medium" tabIndex={0}>
            {Object.keys(GR_MODELES).map(m => <option key={m}>{m}</option>)}
          </select>
          <span className="text-[12px] text-text-muted">{GR_MODELES[modele].length} tamis de base</span>
        </div>
      </Card>

      {modePreparation === 'directe' ? (
        <>
          <Card title="Teneur en eau — NF P 94-050">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <FG label="M1 — Récipient vide (g)">
                <input type="number" step="0.01" value={m1} onChange={e => onM1(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
              </FG>
              <FG label="M2 — +Sol humide (g)">
                <input type="number" step="0.01" value={m2} onChange={e => onM2(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
              </FG>
              <FG label="M3 — +Sol sec (g)">
                <input type="number" step="0.01" value={m3} onChange={e => onM3(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
              </FG>
              <FG label="w calculé (%)">
                <input readOnly value={directWater.w ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
              </FG>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <FG label="Masse humide totale Mh (g)">
                <input type="number" step="0.01" value={mh} onChange={e => onMh(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
              </FG>
              <FG label="Masse sèche Ms — calculée (g)">
                <input readOnly value={directWater.ms ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
              </FG>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Refus par tamis — du plus grand au plus petit</span>
                {directWater.ms && <button onClick={() => setShowPassantEditor(!showPassantEditor)} className="text-[11px] text-text-muted hover:text-text p-1" tabIndex={0} title="Éditeur passant inverse">⚙️</button>}
              </div>
              <div className="p-4">
                {!directWater.ms && <p className="text-[11px] text-text-muted italic mb-2">Saisir Mh et WE pour activer.</p>}
                <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0">
                      <tr className="bg-bg border-b border-border">
                        <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis</th>
                        <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Refus (g)</th>
                        <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Rc%</th>
                        <th className="px-2 py-2 text-right text-[11px] font-bold text-nge">Pass%</th>
                        <th className="w-5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...calcs].reverse().map(t => (
                        <tr key={t.d} className="border-b border-border">
                          <td className="px-2 py-1 font-mono text-[12px] font-bold">{t.d}</td>
                          <td className="px-1 py-1">
                            <input type="number" step="0.01" value={t.r} onChange={e => setR(t.d, e.target.value)} disabled={!directWater.ms}
                              className="w-[80px] px-2 py-0.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge text-right disabled:opacity-30" tabIndex={0} />
                          </td>
                          <td className="px-2 py-1 text-right text-[11px] text-text-muted">{t.rc_pct ?? '—'}</td>
                          <td className={`px-2 py-1 text-right font-bold text-[12px] ${t.passant !== null ? 'text-nge' : 'text-text-muted'}`}>
                            {showPassantEditor && t.passant !== null && directWater.ms ? (
                              <input type="number" step="0.1" min="0" max="100" value={t.passant} onChange={e => setPassant(t.d, e.target.value)}
                                className="w-[60px] px-1 py-0.5 border border-nge rounded text-[12px] bg-bg outline-none text-right" tabIndex={0} />
                            ) : (
                              t.passant ?? '—'
                            )}
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => removeTamis(t.d)} className="text-[10px] text-text-muted hover:text-danger" tabIndex={-1}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2">
                  {showAdd ? (
                    <div className="flex items-center gap-2">
                      <select value={tamisToAdd} onChange={e => setTamisToAdd(e.target.value)} className="px-2 py-1 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}>
                        <option value="">— Tamis —</option>
                        {ALL_TAMIS.filter(d => !tamis.find(t => t.d === d)).map(d => <option key={d} value={d}>{d} mm</option>)}
                      </select>
                      <Button size="sm" onClick={addTamis} disabled={!tamisToAdd} tabIndex={0}>+</Button>
                      <Button size="sm" onClick={() => setShowAdd(false)} tabIndex={0}>✕</Button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAdd(true)} className="text-[12px] text-nge hover:underline" tabIndex={0}>+ Ajouter un tamis</button>
                  )}
                </div>
              </div>
            </div>
            <Card title="Courbe granulométrique">
              <GRChart tamis={tamis} calcs={calcs} />
              {directWater.ms && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {p80 !== null && <div className="px-3 py-2 bg-[#f6be00] border border-[#d4a200] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{p80}%</div>
                    <div className="text-[10px] text-white">Passant 80µm</div>
                  </div>}
                  {dmax !== null && <div className="px-3 py-2 bg-[#002C77] border border-[#001a48] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{dmax} mm</div>
                    <div className="text-[10px] text-white">Dmax</div>
                  </div>}
                  {(() => {
                    const { d10, d30, d60, cu, cc: ccv } = calcCuCc(calcs)
                    return <>
                      {d10 !== null && <div className="px-3 py-2 bg-[#A20067] border border-[#7d004d] rounded text-center">
                        <div className="text-[15px] font-bold text-white">{d10} mm</div>
                        <div className="text-[10px] text-white">D10</div>
                      </div>}
                      {d30 !== null && <div className="px-3 py-2 bg-[#00A5BD] border border-[#007a8a] rounded text-center">
                        <div className="text-[15px] font-bold text-white">{d30} mm</div>
                        <div className="text-[10px] text-white">D30</div>
                      </div>}
                      {d60 !== null && <div className="px-3 py-2 bg-[#6068B2] border border-[#454583] rounded text-center">
                        <div className="text-[15px] font-bold text-white">{d60} mm</div>
                        <div className="text-[10px] text-white">D60</div>
                      </div>}
                      {cu !== null && <div className="px-3 py-2 bg-[#9EA700] border border-[#757a00] rounded text-center">
                        <div className="text-[15px] font-bold text-white">{cu}</div>
                        <div className="text-[10px] text-white">Cu = D60/D10</div>
                      </div>}
                      {ccv !== null && <div className="px-3 py-2 bg-[#A09074] border border-[#7a6d56] rounded text-center">
                        <div className="text-[15px] font-bold text-white">{ccv}</div>
                        <div className="text-[10px] text-white">Cc = D30²/(D10·D60)</div>
                      </div>}
                      {coeffVBS !== null && <div className="px-3 py-2 bg-[#7b3f00] border border-[#5b2f00] rounded text-center">
                        <div className="text-[15px] font-bold text-white">{coeffVBS}</div>
                        <div className="text-[10px] text-white">Coeff C (0/5 sur 0/50)</div>
                      </div>}
                    </>
                  })()}
                </div>
              )}
            </Card>
          </div>
        </>
      ) : (
        <>
          <Card title="Paramètres des coupures">
            <div className="grid grid-cols-4 gap-3">
              <FG label="Coupure D1 (mm)">
                <select value={d1} onChange={e => updateD1(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}>
                  {ALL_TAMIS.filter(d => d >= 0.08).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FG>
              <FG label="2ème coupure">
                <div className="flex items-center gap-2 h-[42px]">
                  <input type="checkbox" checked={hasD2} onChange={e => updateD2Enabled(e.target.checked)} />
                  <select value={d2} onChange={e => updateD2(e.target.value)} disabled={!hasD2} className="flex-1 px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge disabled:opacity-50" tabIndex={0}>
                    {ALL_TAMIS.filter(d => Number(d) < Number(d1 || 0)).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </FG>
              <FG label="Massa > D1 calculée (g sec)">
                <input readOnly value={cutoffGlobal.massGtD1 ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
              </FG>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              <FG label="Masse < D1 calculée (g sec)">
                <input readOnly value={cutoffGlobal.massLtD1 ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
              </FG>
              <FG label="Masse totale calculée (g sec)">
                <input readOnly value={cutoffGlobal.msTotal ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
              </FG>
              <FG label="Passant D1 (%)">
                <input readOnly value={cutoffGlobal.passingD1 ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
              </FG>
              <FG label="Passant D2 (%)">
                <input readOnly value={hasD2 ? (cutoffGlobal.passingD2 ?? '') : ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
              </FG>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <GRTamisTable
              title={`Partie > ${d1} mm`}
              rows={coarseTamis}
              ms={cutoffGlobal.msTotal || cutoffGlobal.massGtD1 || 1}
              onSetR={(d, v) => setSegmentRefus('coarse', d, v)}
              onAdd={d => addSegmentTamis('coarse', d)}
              addOptions={ALL_TAMIS.filter(d => Number(d) >= Number(d1))}
              onRemove={d => removeSegmentTamis('coarse', d)}
            />

            <Card title={`Fraction passante < ${d1} mm — WE / masse de travail`}>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <FG label="M1 — Récipient vide (g)">
                  <input type="number" step="0.01" value={frac1.m1} onChange={e => updateFrac('frac1', 'm1', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                </FG>
                <FG label="M2 — +Sol humide (g)">
                  <input type="number" step="0.01" value={frac1.m2} onChange={e => updateFrac('frac1', 'm2', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                </FG>
                <FG label="M3 — +Sol sec (g)">
                  <input type="number" step="0.01" value={frac1.m3} onChange={e => updateFrac('frac1', 'm3', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                </FG>
                <FG label="w calculé (%)">
                  <input readOnly value={frac1Water.w ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
                </FG>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FG label={`Masse humide de la fraction < ${d1} (g)`}>
                  <input type="number" step="0.01" value={frac1.mh} onChange={e => updateFrac('frac1', 'mh', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                </FG>
                <FG label={`Masse sèche de la fraction < ${d1} (g)`}>
                  <input readOnly value={frac1Water.ms ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
                </FG>
              </div>
            </Card>
          </div>

          <GRTamisTable
            title={hasD2 ? `Travail local ${d1} → ${d2} mm sur fraction < ${d1}` : `Travail local ${d1} → fond sur fraction < ${d1}`}
            rows={frac1.tamis}
            ms={frac1Water.ms}
            onSetR={(d, v) => setSegmentRefus('frac1', d, v)}
            onAdd={d => addSegmentTamis('frac1', d)}
            addOptions={ALL_TAMIS.filter(d => Number(d) <= Number(d1) && Number(d) >= Number(hasD2 ? d2 : 0.08))}
            onRemove={d => removeSegmentTamis('frac1', d)}
          />

          {hasD2 && (
            <>
              <Card title={`Fraction passante < ${d2} mm — WE / masse de travail`}>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <FG label="M1 — Récipient vide (g)">
                    <input type="number" step="0.01" value={frac2.m1} onChange={e => updateFrac('frac2', 'm1', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                  </FG>
                  <FG label="M2 — +Sol humide (g)">
                    <input type="number" step="0.01" value={frac2.m2} onChange={e => updateFrac('frac2', 'm2', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                  </FG>
                  <FG label="M3 — +Sol sec (g)">
                    <input type="number" step="0.01" value={frac2.m3} onChange={e => updateFrac('frac2', 'm3', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                  </FG>
                  <FG label="w calculé (%)">
                    <input readOnly value={frac2Water.w ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
                  </FG>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FG label={`Masse humide de la fraction < ${d2} (g)`}>
                    <input type="number" step="0.01" value={frac2.mh} onChange={e => updateFrac('frac2', 'mh', e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0} />
                  </FG>
                  <FG label={`Masse sèche de la fraction < ${d2} (g)`}>
                    <input readOnly value={frac2Water.ms ?? ''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1} />
                  </FG>
                </div>
              </Card>

              <GRTamisTable
                title={`Travail local ${d2} → fond sur fraction < ${d2}`}
                rows={frac2.tamis}
                ms={frac2Water.ms}
                onSetR={(d, v) => setSegmentRefus('frac2', d, v)}
                onAdd={d => addSegmentTamis('frac2', d)}
                addOptions={ALL_TAMIS.filter(d => Number(d) <= Number(d2) && Number(d) >= 0.08)}
                onRemove={d => removeSegmentTamis('frac2', d)}
              />
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-bg">
                <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Tableau global reconstitué</span>
              </div>
              <div className="p-4">
                <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0">
                      <tr className="bg-bg border-b border-border">
                        <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis</th>
                        <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Rc total %</th>
                        <th className="px-2 py-2 text-right text-[11px] font-bold text-nge">Passant total %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...cutoffGlobal.rows].reverse().map(row => (
                        <tr key={row.d} className="border-b border-border">
                          <td className="px-2 py-1 font-mono text-[12px] font-bold">{row.d}</td>
                          <td className="px-2 py-1 text-right text-[11px] text-text-muted">{row.rc_pct ?? '—'}</td>
                          <td className="px-2 py-1 text-right font-bold text-[12px] text-nge">{row.passant ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <Card title="Courbe globale reconstituée">
              <GRChart
                tamis={cutoffGlobal.rows.map(row => ({ d: row.d, r: row.retained_g ?? '' }))}
                calcs={cutoffGlobal.rows.map(row => ({ d: row.d, r: row.retained_g ?? '', rc_g: row.rc_g, rc_pct: row.rc_pct, passant: row.passant }))}
              />
              <div className="flex gap-2 mt-3 flex-wrap">
                {cutoffGlobal.rows.find(x => Number(x.d) === d1)?.passant !== null && (
                  <div className="px-3 py-2 bg-[#002C77] border border-[#001a48] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{cutoffGlobal.rows.find(x => Number(x.d) === d1)?.passant}%</div>
                    <div className="text-[10px] text-white">Passant D1</div>
                  </div>
                )}
                {hasD2 && cutoffGlobal.rows.find(x => Number(x.d) === d2)?.passant !== null && (
                  <div className="px-3 py-2 bg-[#6068B2] border border-[#454583] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{cutoffGlobal.rows.find(x => Number(x.d) === d2)?.passant}%</div>
                    <div className="text-[10px] text-white">Passant D2</div>
                  </div>
                )}
                {cutoffGlobal.p80 !== null && (
                  <div className="px-3 py-2 bg-[#f6be00] border border-[#d4a200] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{cutoffGlobal.p80}%</div>
                    <div className="text-[10px] text-white">Passant 80µm</div>
                  </div>
                )}
                {cutoffGlobal.dmax !== null && (
                  <div className="px-3 py-2 bg-[#00A5BD] border border-[#007a8a] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{cutoffGlobal.dmax} mm</div>
                    <div className="text-[10px] text-white">Dmax</div>
                  </div>
                )}
                {cutoffCuCc.cu !== null && (
                  <div className="px-3 py-2 bg-[#9EA700] border border-[#757a00] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{cutoffCuCc.cu}</div>
                    <div className="text-[10px] text-white">Cu</div>
                  </div>
                )}
                {cutoffCuCc.cc !== null && (
                  <div className="px-3 py-2 bg-[#A09074] border border-[#7a6d56] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{cutoffCuCc.cc}</div>
                    <div className="text-[10px] text-white">Cc</div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
