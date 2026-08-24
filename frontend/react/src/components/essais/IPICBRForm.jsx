import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Card, FG, num, rnd, parseRes } from '@/components/essais/essaiFormUi'
import { getPNPoints, buildProctorCurve } from '@/lib/pnEssai'
import {
  calcCBRTestResult,
  initIPIMoules,
  H_MOULE_CBR,
  IPI_COLORS,
  F_REF_2_5,
  F_REF_5_0,
} from '@/lib/cbrEssai'
import { AnnauSelect } from '@/components/essais/MouleSelect'
import ProctorChart from '@/components/essais/ProctorChart'
import IPIChart from '@/components/essais/IPIChart'

// ═══════════════════════════════════════════════════════════════════════════════
// CBRi / CBR — NF P 94-078
//
// CBRi (immédiat) : poinçonnement après compactage, surcharges annulaires
// CBR (après immersion) : 4 jours dans l'eau, mesure du gonflement, puis poinçon
//
// Même logique métier que l'IPI : choix du Proctor associé, puis poinçonnements liés aux points Proctor
// 1 anneau dynamométrique sur la presse, partagé par tous les essais
// Lectures aux profondeurs : 1.25 / 2.0 / 2.5★ / 5.0★ / 7.5 / 10.0 mm
// CBR = max(F_2.5/13.24, F_5.0/19.96) × 100
// Correction d'origine δ₀ par moule si concavité initiale (même principe IPI)
// ═══════════════════════════════════════════════════════════════════════════════


export default function IPICBRForm({ res, onChange, readOnly, essai, forcedMode = null }) {
  const mode = forcedMode || (() => {
    const code = String(essai?.essai_code || essai?.code_essai || '').toUpperCase()
    if (code === 'CBRI' || code === 'IM') return 'CBRi'
    return 'CBR'
  })()
  const isImmersed = mode === 'CBR'
  const [tests, setTests] = useState(() => initIPIMoules(res, mode))
  const [selectedPNUid, setSelectedPNUid] = useState(res.pn_uid ?? '')
  const [surchargeKg, setSurchargeKg] = useState(res.surcharge_kg ?? '')
  const [soakDays, setSoakDays] = useState(res.soak_days ?? '4')

  const echantillonId = essai?.echantillon_id
  const { data: siblingRaw } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled: Boolean(echantillonId),
  })
  const siblings = Array.isArray(siblingRaw) ? siblingRaw : (siblingRaw?.items || siblingRaw?.results || [])
  const pnSiblings = siblings.filter(e => {
    const c = String(e?.essai_code || e?.code_essai || '').toUpperCase()
    return c === 'PN' && String(e?.uid || '') !== String(essai?.uid || '')
  })
  const pnSibling = pnSiblings.length > 0
    ? (selectedPNUid ? pnSiblings.find(e => String(e.uid) === String(selectedPNUid)) ?? pnSiblings[0] : pnSiblings[0])
    : null
  const pnRes = pnSibling ? parseRes(pnSibling.resultats) : null
  const pnPoints = getPNPoints(pnRes)
  const { pnCalcs, poly: pnPoly, wOPN: pnWOPN, rhoOPN: pnRhoOPN } = buildProctorCurve(pnRes)
  const rhoRef = pnRes ? (pnRes.rho_d_OPN_corr ?? pnRes.rho_d_OPN ?? pnRhoOPN ?? null) : null

  const testCalcs = tests.map(t => calcCBRTestResult(t, { surcharge_kg: surchargeKg, soak_days: soakDays }))
  const bestValue = testCalcs.reduce((best, c) => c.cbr !== null && (best === null || c.cbr > best) ? c.cbr : best, null)

  function enrichTests(nextTests) {
    return nextTests.map(t => ({
      ...t,
      surcharge_kg: t.surcharge_kg === '' || t.surcharge_kg === null || t.surcharge_kg === undefined ? surchargeKg : t.surcharge_kg,
      soak_days: isImmersed ? (t.soak_days === '' || t.soak_days === null || t.soak_days === undefined ? soakDays : t.soak_days) : null,
      ...calcCBRTestResult(t, { surcharge_kg: surchargeKg, soak_days: soakDays }),
    }))
  }

  function emit(nextTests, nextPnUid = selectedPNUid, nextSurchargeKg = surchargeKg, nextSoakDays = soakDays) {
    const results = nextTests.map(t => ({
      ...t,
      surcharge_kg: t.surcharge_kg === '' || t.surcharge_kg === null || t.surcharge_kg === undefined ? nextSurchargeKg : t.surcharge_kg,
      soak_days: isImmersed ? (t.soak_days === '' || t.soak_days === null || t.soak_days === undefined ? nextSoakDays : t.soak_days) : null,
      ...calcCBRTestResult(t, { surcharge_kg: nextSurchargeKg, soak_days: nextSoakDays }),
    }))
    const active = results.filter(t => t.actif !== false)
    const best = active.reduce((acc, t) => t.cbr !== null && (acc === null || t.cbr > acc) ? t.cbr : acc, null)
    onChange(JSON.stringify({
      mode,
      pn_uid: nextPnUid ?? (pnSibling ? String(pnSibling.uid) : ''),
      surcharge_kg: nextSurchargeKg === '' ? null : num(nextSurchargeKg),
      soak_days: isImmersed ? (nextSoakDays === '' ? null : num(nextSoakDays)) : null,
      tests: results,
      moules: results,
      cbr: best,
    }))
  }

  function setTestField(i, k, v) {
    const u = tests.map((t, idx) => idx === i ? { ...t, [k]: v } : t)
    setTests(u)
    emit(u)
  }
  function setTestBatch(i, updates) {
    const u = tests.map((t, idx) => idx === i ? { ...t, ...updates } : t)
    setTests(u)
    emit(u)
  }
  function setLecture(ti, di, force) {
    const u = tests.map((t, i) => i !== ti ? t : { ...t, lectures: t.lectures.map((l, j) => j === di ? { ...l, force } : l) })
    setTests(u)
    emit(u)
  }
  function addTest() {
    const basePoint = pnPoints.length > 0 ? pnPoints[Math.min(tests.length, pnPoints.length - 1)] : null
    const u = [...tests, {
      id: tests.length + 1,
      actif: true,
      pn_point_id: basePoint ? String(basePoint.id) : '',
      pn_point_w: basePoint?.w ?? null,
      pn_point_rho_d: basePoint?.rho_d ?? null,
      moule_ref: basePoint?.moule_ref || '',
      m_moule: '',
      v_moule: '2131',
      m_tot: '',
      w: '',
      m1: '',
      m2: '',
      m3: '',
      anneau_ref: '',
      facteur_k: null,
      mode_saisie: 'kn',
      correction_mode: 'auto',
      delta0_manual: '',
      correction_low: 1.0,
      correction_high: 3.0,
      delta0: 0,
      gonf_ini: '',
      gonf_fin: '',
      h_moule: String(H_MOULE_CBR),
      surcharge_kg: surchargeKg,
      soak_days: isImmersed ? soakDays : null,
      lectures: initCBRLectures(null, '', ''),
    }]
    setTests(u)
    emit(u)
  }
  function removeTest(i) {
    if (tests.length <= 1) return
    const u = tests.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, id: idx + 1 }))
    setTests(u)
    emit(u)
  }
  function onSelectPN(uid) {
    setSelectedPNUid(uid)
    emit(tests, uid)
  }
  function onChangeGlobalSurcharge(value) {
    setSurchargeKg(value)
    const u = tests.map(t => ({ ...t, surcharge_kg: value }))
    setTests(u)
    emit(u, selectedPNUid, value)
  }
  function onChangeGlobalSoakDays(value) {
    setSoakDays(value)
    const u = tests.map(t => ({ ...t, soak_days: value }))
    setTests(u)
    emit(u, selectedPNUid, surchargeKg, value)
  }

  const overlayPoints = testCalcs
    .filter((t, idx) => tests[idx]?.pn_point_w !== null && tests[idx]?.pn_point_rho_d !== null && t.f_kn !== null)
    .map((t, idx) => ({
      w: num(tests[idx].pn_point_w),
      rho_d: num(tests[idx].pn_point_rho_d),
      label: `P${tests[idx].pn_point_id || idx + 1}`,
      ipi: t.cbr,
      f_kn: t.f_kn,
    }))

  const pnBlock = pnSiblings.length > 0 ? (
    <div className="px-4 py-3 rounded-lg border bg-[#e6f1fb] border-[#90bfe8] text-[12px] text-[#185fa5]">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-semibold">Proctor lié :</span>
        {pnSiblings.length === 1 ? (
          <span className="font-mono">{pnSibling?.reference || `#${pnSibling?.uid}`}</span>
        ) : (
          <select value={selectedPNUid || String(pnSiblings[0]?.uid || '')} onChange={e => onSelectPN(e.target.value)} className="px-2 py-0.5 border border-[#90bfe8] rounded text-[12px] bg-[#e6f1fb] text-[#185fa5] outline-none font-mono">
            {pnSiblings.map(e => <option key={e.uid} value={String(e.uid)}>{e.reference || `PN #${e.uid}`}</option>)}
          </select>
        )}
        <span className="opacity-70 font-normal">{isImmersed ? 'immergé + surcharge' : 'immédiat + surcharge'}</span>
      </div>
      <div className="flex gap-5 flex-wrap">
        {pnWOPN !== null && <span>wOPN=<strong>{pnWOPN}%</strong></span>}
        {rhoRef !== null && <span>ρd ref=<strong>{rhoRef} Mg/m³</strong></span>}
      </div>
      {pnPoints.length > 0 && (
        <div className="flex gap-3 flex-wrap text-[11px] opacity-80 mt-2">
          {pnPoints.map(p => (
            <span key={p.id}>P{p.id}: w={p.w}%{p.rho_d ? ` · ρd=${p.rho_d}` : ''}{p.moule_ref ? ` · ${p.moule_ref}` : ''}</span>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="px-4 py-3 rounded-lg border border-dashed border-border text-[12px] text-text-muted">
      <span className="font-medium">Proctor (PN) non trouvé</span> — Créez d'abord un essai Proctor pour cet échantillon.
    </div>
  )

  const conditionsBlock = readOnly ? (
    <div className="px-4 py-3 rounded-lg border border-border bg-surface text-[12px] text-text">
      <div className="flex gap-6 flex-wrap">
        <span>Surcharge : <strong>{surchargeKg || '—'} kg</strong></span>
        {isImmersed ? <span>Immersion : <strong>{soakDays || '4'} jours</strong></span> : <span>Essai immédiat avec surcharge</span>}
      </div>
    </div>
  ) : (
    <Card title="Conditions d'essai">
      <div className="grid grid-cols-3 gap-3">
        <FG label="Surcharge (kg)">
          <input type="number" step="0.1" value={surchargeKg} onChange={e => onChangeGlobalSurcharge(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}/>
        </FG>
        {isImmersed ? (
          <FG label="Immersion (jours)">
            <input type="number" step="1" min="1" value={soakDays} onChange={e => onChangeGlobalSoakDays(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}/>
          </FG>
        ) : (
          <div className="flex items-end pb-2 text-[12px] text-text-muted">Essai immédiat avec surcharge, sans immersion.</div>
        )}
      </div>
    </Card>
  )

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        {pnBlock}
        {conditionsBlock}
        {bestValue !== null && (
          <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center">
            <div className="text-[32px] font-bold text-[#3b6d11] leading-none">{bestValue}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">{mode} (%) — valeur retenue</div>
          </div>
        )}
        {pnRes && pnPoints.length > 0 && overlayPoints.length > 0 && (
          <Card title={`Courbe Proctor — ${pnSibling?.reference || 'PN'} avec points ${mode}`}>
            <ProctorChart points={pnRes.points.map(p => ({ ...p, actif: p.actif !== false }))} calcs={pnCalcs} poly={pnPoly} wOPN={pnWOPN} rhoOPN={pnRhoOPN} correction={null} gs={pnRes.gs_fin ?? '2.70'} ipiPoints={overlayPoints} />
          </Card>
        )}
        <Card title="Courbes poinçonnement F = f(profondeur)">
          <IPIChart tests={tests} testCalcs={testCalcs} height={500} readOnly={true}/>
        </Card>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Poinç.</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Point PN</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w (%)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">δ0 (mm)</th>
                {isImmersed && <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">Gonfl. (%)</th>}
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 2.5</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 5.0</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 2.5 corr.</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 5.0 corr.</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-nge">{mode} (%)</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => {
                const c = testCalcs[i]
                const color = IPI_COLORS[i % IPI_COLORS.length]
                return (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-1.5 text-[12px] font-bold" style={{ color }}>P{i + 1}</td>
                    <td className="px-3 py-1.5 text-[12px]">P{t.pn_point_id || '?'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{t.pn_point_w ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.delta0_used ?? 0}</td>
                    {isImmersed && <td className="px-3 py-1.5 text-right text-[12px]">{c.gonf ?? '—'}</td>}
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr25 ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr50 ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{(c.delta0_used || 0) > 0 ? c.cbr25c ?? '—' : '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{(c.delta0_used || 0) > 0 ? c.cbr50c ?? '—' : '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-bold text-[14px] ${c.cbr !== null ? 'text-nge' : 'text-text-muted'}`}>{c.cbr ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {pnBlock}
      {conditionsBlock}
      {bestValue !== null && (
        <div className="flex items-center gap-3 px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start">
          <div>
            <div className="text-[30px] font-bold text-[#3b6d11] leading-none">{bestValue}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1">{mode} (%) — valeur retenue (max des poinçonnements)</div>
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start">
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto">
            <div className="flex gap-3" style={{ minWidth: `${tests.length * 182}px` }}>
              {tests.map((t, testIdx) => {
                const c = testCalcs[testIdx]
                const color = IPI_COLORS[testIdx % IPI_COLORS.length]
                const facteurK = num(t.facteur_k)
                return (
                  <div key={testIdx} className="w-[200px] shrink-0 border border-border rounded-[10px] overflow-hidden" style={{ borderColor: color + '44' }}>
                    <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: color + '44', background: color + '11' }}>
                      <span className="text-[11px] font-bold uppercase" style={{ color }}>Poinç. {testIdx + 1}</span>
                      {tests.length > 1 && <button onClick={() => removeTest(testIdx)} className="text-[11px] text-text-muted hover:text-danger" tabIndex={0}>×</button>}
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      <FG label="Point Proctor">
                        {pnPoints.length > 0 ? (
                          <select value={t.pn_point_id || ''} onChange={e => {
                            const pid = e.target.value
                            const pt = pnPoints.find(p => String(p.id) === pid)
                            setTestBatch(testIdx, {
                              pn_point_id: pid,
                              pn_point_w: pt?.w ?? null,
                              pn_point_rho_d: pt?.rho_d ?? null,
                              moule_ref: pt?.moule_ref || t.moule_ref,
                            })
                          }} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}>
                            <option value="">— choisir —</option>
                            {pnPoints.map(p => (
                              <option key={p.id} value={String(p.id)}>
                                P{p.id} — w={p.w}%{p.rho_d ? ` · ρd=${p.rho_d}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input value={t.pn_point_id} onChange={e => setTestField(testIdx, 'pn_point_id', e.target.value)} placeholder="N° point" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/>
                        )}
                      </FG>
                      {t.pn_point_w !== null && (
                        <div className="text-[10px] text-text-muted px-1">w={t.pn_point_w}%{t.pn_point_rho_d ? ` · ρd=${t.pn_point_rho_d}` : ''}{t.moule_ref ? ` · ${t.moule_ref}` : ''}</div>
                      )}

                      <FG label="Anneau / capteur">
                        <AnnauSelect value={t.anneau_ref || ''} disabled={false} onSelect={({ code, facteur_k }) => setTestBatch(testIdx, {
                          anneau_ref: code,
                          facteur_k: facteur_k ?? t.facteur_k ?? null,
                        })}/>
                      </FG>
                      {facteurK !== null && (
                        <div className="text-[10px] text-text-muted px-1">k = {facteurK} kN/div</div>
                      )}

                      <div className="flex gap-1">
                        <button onClick={() => setTestField(testIdx, 'mode_saisie', 'kn')} className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${(t.mode_saisie || 'kn') === 'kn' ? 'bg-nge text-white border-nge' : 'border-border text-text-muted'}`}>kN direct</button>
                        <button onClick={() => setTestField(testIdx, 'mode_saisie', 'mm')} className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${t.mode_saisie === 'mm' ? 'bg-nge text-white border-nge' : 'border-border text-text-muted'}`} disabled={facteurK === null} title={facteurK === null ? 'Sélectionner un anneau avec facteur k' : undefined}>mm (comparateur)</button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <FG label="M_tot (g)"><input type="number" step="0.1" value={t.m_tot} onChange={e => setTestField(testIdx, 'm_tot', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/></FG>
                        <FG label="w (%)"><input type="number" step="0.1" value={t.w} onChange={e => setTestField(testIdx, 'w', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/></FG>
                      </div>
                      <div className="text-[10px] text-text-muted px-1">ρh={c.rho_h ?? '—'} · ρd={c.rho_d ?? '—'}</div>

                      {isImmersed ? (
                        <div className="grid grid-cols-2 gap-2">
                          <FG label="Gonf. ini (mm)"><input type="number" step="0.01" value={t.gonf_ini} onChange={e => setTestField(testIdx, 'gonf_ini', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" /></FG>
                          <FG label="Gonf. fin (mm)"><input type="number" step="0.01" value={t.gonf_fin} onChange={e => setTestField(testIdx, 'gonf_fin', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" /></FG>
                        </div>
                      ) : (
                        <div className="text-[10px] text-text-muted px-1">Essai immédiat avec surcharge, sans immersion.</div>
                      )}

                      <FG label="Mode correction">
                        <select value={t.correction_mode || 'auto'} onChange={e => {
                            const newMode = e.target.value
                            if (newMode === 'line') {
                              const lects = testCalcs.find((_,i) => i === testIdx)?.lectures || t.lectures
                              const autoCorr = detectAutoCorrectionLine(lects)
                              const low  = autoCorr?.x1 != null ? autoCorr.x1 : (t.correction_low ?? 1.0)
                              const high = autoCorr?.x2 != null ? autoCorr.x2 : (t.correction_high ?? 3.0)
                              setTestBatch(testIdx, { correction_mode: newMode, correction_low: low, correction_high: high })
                            } else {
                              setTestField(testIdx, 'correction_mode', newMode)
                            }
                          }} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}>
                          <option value="auto">Auto</option>
                          <option value="delta0">δ₀ manuel</option>
                          <option value="line">Droite manuelle</option>
                        </select>
                      </FG>
                      {(t.correction_mode || 'auto') === 'delta0' && (
                        <FG label="δ₀ manuel (mm)">
                          <input type="number" step="0.01" min="0" value={t.delta0_manual || ''} onChange={e => setTestField(testIdx, 'delta0_manual', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/>
                        </FG>
                      )}
                      {(t.correction_mode || 'auto') === 'line' && (
                        <div className="grid grid-cols-2 gap-2">
                          <FG label="Point bas (mm)"><input type="number" step="0.1" min="0" value={t.correction_low ?? ''} onChange={e => setTestField(testIdx, 'correction_low', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/></FG>
                          <FG label="Point haut (mm)"><input type="number" step="0.1" min="0" value={t.correction_high ?? ''} onChange={e => setTestField(testIdx, 'correction_high', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/></FG>
                        </div>
                      )}
                      {(c?.correction_line?.x1 !== null && c?.correction_line?.x2 !== null) && (
                        <div className="text-[10px] text-text-muted px-1">droite: bas={rnd(c.correction_line.x1, 2)} mm / {c.correction_line.y1 !== null ? rnd(c.correction_line.y1, 3) : '—'} kN · haut={rnd(c.correction_line.x2, 2)} mm / {c.correction_line.y2 !== null ? rnd(c.correction_line.y2, 3) : '—'} kN</div>
                      )}
                      {(c?.delta0_used || 0) > 0 && (
                        <div className="text-[10px] text-[#854f0b] bg-[#faeeda] border border-[#e0c070] rounded px-2 py-1">δ₀ utilisé={c.delta0_used} mm · source={c.delta0_source || 'auto'}</div>
                      )}

                      <table className="w-full border-collapse text-sm mt-1">
                        <thead>
                          <tr className="bg-bg border-b border-border">
                            <th className="px-2 py-1 text-left text-[10px] font-medium text-text-muted">d (mm)</th>
                            <th className="px-2 py-1 text-right text-[10px] font-medium text-text-muted">{(t.mode_saisie || 'kn') === 'mm' ? 'Div.' : 'F (kN)'}</th>
                            <th className="px-2 py-1 text-right text-[10px] font-medium text-text-muted">CBR%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(t.lectures || []).map((l, depthIdx) => {
                            const isKey = l.depth === 2.5 || l.depth === 5.0
                            const isCorrHelper = l.depth === 3.0 || l.depth === 12.0
                            const d0v = num(c?.delta0_used) || 0
                            const isKeyCorr = d0v > 0 && (Math.abs(l.depth - (2.5 + d0v)) < 0.05 || Math.abs(l.depth - (5.0 + d0v)) < 0.05)
                            const rawVal = l.force
                            const fKn = (t.mode_saisie || 'kn') === 'mm' && facteurK !== null && num(rawVal) !== null ? rnd(num(rawVal) * facteurK, 4) : num(rawVal)
                            const localCbr = l.depth === 2.5 && fKn !== null ? rnd(fKn / F_REF_2_5 * 100, 1)
                              : l.depth === 5.0 && fKn !== null ? rnd(fKn / F_REF_5_0 * 100, 1) : null
                            return (
                              <tr key={depthIdx} className={`border-b border-border ${isKey ? 'bg-[#f0f7ff]' : isKeyCorr ? 'bg-[#fef3c7]' : isCorrHelper ? 'bg-[#f8f8f6]' : ''}`}>
                                <td className={`px-2 py-0.5 text-[11px] ${isKey ? 'font-bold text-nge' : isKeyCorr ? 'text-[#854f0b]' : isCorrHelper ? 'text-text-muted italic' : 'text-text-muted'}`}>
                                  {l.depth}{isKey && <span className="ml-0.5 text-[9px]">★</span>}
                                </td>
                                <td className="px-1 py-0.5">
                                  <input type="number" step="0.01" value={rawVal} onChange={e => setLecture(testIdx, depthIdx, e.target.value)} placeholder="—" className={`w-full px-2 py-1 border rounded text-[12px] bg-bg outline-none text-right ${isKey ? 'border-nge' : 'border-border'} focus:border-nge`} tabIndex={0}/>
                                </td>
                                <td className={`px-2 py-0.5 text-right text-[11px] font-bold ${localCbr !== null ? 'text-nge' : 'text-text-muted opacity-30'}`}>{localCbr ?? ''}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>

                      {c.cbr !== null && (
                        <div className="mt-2 p-2 rounded-lg border text-center" style={{ background: color + '11', borderColor: color + '44' }}>
                          <div className="text-[22px] font-bold leading-none" style={{ color }}>{c.cbr}</div>
                          <div className="text-[10px] mt-0.5 text-text-muted">{mode}% ({c.controlling}){(c?.delta0_used || 0) > 0 ? ' corr.' : ''}</div>
                          {(c?.delta0_used || 0) > 0 && c.cbrRaw !== null && c.cbrRaw !== c.cbr && <div className="text-[10px] text-text-muted">brut: {c.cbrRaw}</div>}
                          {isImmersed && c.gonf !== null && <div className="text-[10px] text-text-muted">gonfl.: {c.gonf}%</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <button onClick={addTest} className="self-start text-[12px] text-text-muted hover:text-text border border-dashed border-border rounded px-4 py-2 transition-colors" tabIndex={0}>
            + Ajouter un poinçonnement
          </button>
        </div>

        <div className="flex-1 flex flex-col" style={{ minWidth: '260px', alignSelf: 'stretch' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">F = f(profondeur) — temps réel</div>
          <div className="flex-1" style={{ minHeight: '300px' }}>
            <IPIChart tests={tests} testCalcs={testCalcs} height={null}/>
          </div>
          <p className="text-[10px] text-text-muted italic mt-1">★ = 2.5 et 5.0mm. Pointillé = δ₀.</p>
        </div>
      </div>

      {pnRes && pnPoints.length > 0 && overlayPoints.length > 0 && (
        <Card title={`Courbe Proctor — ${pnSibling?.reference || 'PN'} avec points ${mode}`}>
          <ProctorChart points={pnRes.points.map(p => ({ ...p, actif: p.actif !== false }))} calcs={pnCalcs} poly={pnPoly} wOPN={pnWOPN} rhoOPN={pnRhoOPN} correction={null} gs={pnRes.gs_fin ?? '2.70'} ipiPoints={overlayPoints}/>
        </Card>
      )}
    </div>
  )
}

export function CBRIForm(props) {
  return <IPICBRForm {...props} forcedMode="CBRi" />
}

export function CBRForm(props) {
  return <IPICBRForm {...props} forcedMode="CBR" />
}
