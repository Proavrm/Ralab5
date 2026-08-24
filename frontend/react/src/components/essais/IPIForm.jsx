import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Card, FG, num, rnd, parseRes } from '@/components/essais/essaiFormUi'
import { getPNPoints, buildProctorCurve } from '@/lib/pnEssai'
import { calcIPITestResult, initIPITests, initIPILectures, IPI_COLORS, F_REF_2_5, F_REF_5_0 } from '@/lib/cbrEssai'
import { AnnauSelect } from '@/components/essais/MouleSelect'
import ProctorChart from '@/components/essais/ProctorChart'
import IPIChart from '@/components/essais/IPIChart'

export default function IPIForm({ res, onChange, readOnly, essai }) {
  const [tests, setTests] = useState(() => initIPITests(res))
  const [selectedPNUid, setSelectedPNUid] = useState(res.pn_uid ?? '')

  const echantillonId = essai?.echantillon_id
  const { data: siblingRaw } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn:  () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled:  Boolean(echantillonId),
  })
  const siblings = Array.isArray(siblingRaw) ? siblingRaw : (siblingRaw?.items || siblingRaw?.results || [])
  const pnSiblings = siblings.filter(e => {
    const c = String(e?.essai_code || e?.code_essai || '').toUpperCase()
    return c === 'PN' && String(e?.uid || '') !== String(essai?.uid || '')
  })
  const pnSibling = pnSiblings.length > 0
    ? (selectedPNUid ? pnSiblings.find(e=>String(e.uid)===selectedPNUid)??pnSiblings[0] : pnSiblings[0])
    : null
  const pnRes = pnSibling ? parseRes(pnSibling.resultats) : null
  const pnPoints = getPNPoints(pnRes)
  const { pnCalcs, poly: pnPoly, wOPN: pnWOPN, rhoOPN: pnRhoOPN } = buildProctorCurve(pnRes)

  const testCalcs = tests.map(t => calcIPITestResult(t))
  const ipiGlobal = testCalcs.reduce((best,c) => c.ipi!==null&&(best===null||c.ipi>best)?c.ipi:best, null)

  function emit(ts, pn_uid) {
    const results = ts.map(t => {
      const { lectures, ...c } = calcIPITestResult(t)
      return { ...t, lectures, ...c }
    })
    const ipi_g = results.reduce((b,t) => t.ipi!==null&&(b===null||t.ipi>b)?t.ipi:b, null)
    onChange(JSON.stringify({
      mode: 'IPI',
      pn_uid: pn_uid ?? (pnSibling?String(pnSibling.uid):''),
      tests: results,
      ipi: ipi_g,
    }))
  }

  function setTestField(i,k,v) { const u=tests.map((t,idx)=>idx===i?{...t,[k]:v}:t); setTests(u); emit(u,selectedPNUid) }
  function setTestBatch(i,updates) { const u=tests.map((t,idx)=>idx===i?{...t,...updates}:t); setTests(u); emit(u,selectedPNUid) }
  function setLecture(ti,di,force) {
    const u=tests.map((t,i)=>i!==ti?t:{...t,lectures:t.lectures.map((l,j)=>j===di?{...l,force}:l)})
    setTests(u); emit(u,selectedPNUid)
  }
  function addTest() {
    const u=[...tests,{id:tests.length+1,actif:true,pn_point_id:'',pn_point_w:null,pn_point_rho_d:null,moule_ref:'',delta0:0,correction_mode:'auto',delta0_manual:'',correction_low:1.0,correction_high:3.0,anneau_ref:'',facteur_k:null,mode_saisie:'kn',lectures:initIPILectures(null)}]
    setTests(u); emit(u,selectedPNUid)
  }
  function removeTest(i) {
    if (tests.length<=1) return
    const u=tests.filter((_,idx)=>idx!==i).map((t,idx)=>({...t,id:idx+1}))
    setTests(u); emit(u,selectedPNUid)
  }
  function onSelectPN(uid) { setSelectedPNUid(uid); emit(tests,uid) }

  // IPI overlay for Proctor chart
  const ipiOverlay = tests.map((t,i) => {
    const c = testCalcs[i]
    // Convert mm→kN if mode_saisie is mm (F = lecture_mm × k)
    const fk = c?.f_kn ?? null
    return {
      w:     t.pn_point_w     !== null && t.pn_point_w     !== undefined ? num(t.pn_point_w)     : null,
      rho_d: t.pn_point_rho_d !== null && t.pn_point_rho_d !== undefined ? num(t.pn_point_rho_d) : null,
      label: `P${t.pn_point_id||i+1}`,
      ipi:   c?.ipi ?? null,
      f_kn:  fk,
    }
  }).filter(p=>p.w!==null&&p.rho_d!==null)

  // ── Bloc Proctor ─────────────────────────────────────────────────────────────
  const pnBlock = pnSiblings.length > 0 ? (
    <div className="px-4 py-3 rounded-lg border bg-[#e6f1fb] border-[#90bfe8] text-[12px] text-[#185fa5]">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-semibold">Proctor lié :</span>
        {pnSiblings.length===1 ? (
          <span className="font-mono">{pnSibling?.reference||`#${pnSibling?.uid}`}</span>
        ) : (
          <select value={selectedPNUid||String(pnSiblings[0]?.uid||'')} onChange={e=>onSelectPN(e.target.value)}
            className="px-2 py-0.5 border border-[#90bfe8] rounded text-[12px] bg-[#e6f1fb] text-[#185fa5] outline-none font-mono">
            {pnSiblings.map(e=><option key={e.uid} value={String(e.uid)}>{e.reference||`PN #${e.uid}`}</option>)}
          </select>
        )}
      </div>
      {pnPoints.length>0 && (
        <div className="flex gap-3 flex-wrap text-[11px] opacity-80">
          {pnPoints.map(p=>(
            <span key={p.id}>P{p.id}: w={p.w}%{p.rho_d?` · ρd=${p.rho_d}`:''}{p.moule_ref?` · ${p.moule_ref}`:''}</span>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="px-4 py-3 rounded-lg border border-dashed border-border text-[12px] text-text-muted">
      <span className="font-medium">Proctor (PN) non trouvé</span> — Créez d'abord un essai Proctor pour cet échantillon.
    </div>
  )

  // ── readOnly ─────────────────────────────────────────────────────────────────
  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        {pnBlock}
        {/* Résultat global */}
        {ipiGlobal!==null && (
          <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center">
            <div className="text-[32px] font-bold text-[#3b6d11] leading-none">{ipiGlobal}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">IPI (%) — valeur retenue</div>
          </div>
        )}
        {/* Courbe Proctor + points IPI */}
        {pnRes && pnPoints.length>0 && ipiOverlay.length>0 && (
          <Card title={`Courbe Proctor — ${pnSibling?.reference||'PN'} avec points IPI`}>
            <ProctorChart
              points={pnRes.points.map(p=>({...p,actif:p.actif!==false}))}
              calcs={pnCalcs} poly={pnPoly}
              wOPN={pnWOPN} rhoOPN={pnRhoOPN}
              correction={null} gs={pnRes.gs_fin??'2.70'}
              ipiPoints={ipiOverlay}/>
          </Card>
        )}
        {/* Courbe F=f(d) */}
        <Card title="Courbes poinçonnement F = f(profondeur)">
          <IPIChart tests={tests} testCalcs={testCalcs} height={500} readOnly={true}/>
        </Card>
        {/* Tableau résultats */}
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Poinç.</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Point PN</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w (%)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">δ0 (mm)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 2.5</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 5.0</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 2.5 corr.</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 5.0 corr.</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-nge">IPI (%)</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t,i) => {
                const c = testCalcs[i]
                const color = IPI_COLORS[i % IPI_COLORS.length]
                return (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-1.5 text-[12px] font-bold" style={{color}}>{i+1}</td>
                    <td className="px-3 py-1.5 text-[12px]">P{t.pn_point_id||'?'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{t.pn_point_w??'—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.delta0_used ?? 0}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr25??'—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr50??'—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{(c.delta0_used||0)>0?c.cbr25c??'—':'—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{(c.delta0_used||0)>0?c.cbr50c??'—':'—'}</td>
                    <td className={`px-3 py-1.5 text-right font-bold text-[14px] ${c.ipi!==null?'text-nge':'text-text-muted'}`}>{c.ipi??'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── edit ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {pnBlock}

      {/* Résultat global */}
      {ipiGlobal!==null && (
        <div className="flex items-center gap-3 px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start">
          <div>
            <div className="text-[30px] font-bold text-[#3b6d11] leading-none">{ipiGlobal}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1">IPI (%) — valeur retenue (max des poinçonnements)</div>
          </div>
        </div>
      )}

      {/* Poinçonnements côte à côte + graphique F=f(d) à droite */}
      <div className="flex gap-4 items-start">

        {/* ── Colonne gauche: poinçonnements ── */}
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto">
            <div className="flex gap-3" style={{minWidth: `${tests.length * 182}px`}}>
              {tests.map((t, testIdx) => {
                const c = testCalcs[testIdx]
                const color = IPI_COLORS[testIdx % IPI_COLORS.length]
                const facteurK = num(t.facteur_k)
                return (
                  <div key={testIdx} className="w-[200px] shrink-0 border border-border rounded-[10px] overflow-hidden" style={{borderColor: color+'44'}}>
                    {/* Header */}
                    <div className="px-3 py-2 border-b flex items-center justify-between" style={{borderColor: color+'44', background: color+'11'}}>
                      <span className="text-[11px] font-bold uppercase" style={{color}}>Poinç. {testIdx+1}</span>
                      {tests.length>1 && <button onClick={()=>removeTest(testIdx)} className="text-[11px] text-text-muted hover:text-danger" tabIndex={0}>×</button>}
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      {/* Point Proctor */}
                      <FG label="Point Proctor">
                        {pnPoints.length>0 ? (
                          <select value={t.pn_point_id||''}
                            onChange={e => {
                              const pid=e.target.value
                              const pt=pnPoints.find(p=>String(p.id)===pid)
                              setTestBatch(testIdx,{pn_point_id:pid,pn_point_w:pt?.w??null,pn_point_rho_d:pt?.rho_d??null,moule_ref:pt?.moule_ref||t.moule_ref})
                            }}
                            className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}>
                            <option value="">— choisir —</option>
                            {pnPoints.map(p=>(
                              <option key={p.id} value={String(p.id)}>
                                P{p.id} — w={p.w}%{p.rho_d?` · ρd=${p.rho_d}`:''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input value={t.pn_point_id} onChange={e=>setTestField(testIdx,'pn_point_id',e.target.value)}
                            placeholder="N° point" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/>
                        )}
                      </FG>
                      {t.pn_point_w!==null && (
                        <div className="text-[10px] text-text-muted px-1">
                          w={t.pn_point_w}%{t.pn_point_rho_d?` · ρd=${t.pn_point_rho_d}`:''}{t.moule_ref?` · ${t.moule_ref}`:''}
                        </div>
                      )}

                      {/* Anneau dynamométrique */}
                      <FG label="Anneau / capteur">
                        <AnnauSelect value={t.anneau_ref||''} disabled={false}
                          onSelect={({code, facteur_k}) => setTestBatch(testIdx, {
                            anneau_ref: code,
                            facteur_k: facteur_k ?? t.facteur_k ?? null,
                          })}/>
                      </FG>
                      {facteurK !== null && (
                        <div className="text-[10px] text-text-muted px-1">k = {facteurK} kN/div</div>
                      )}

                      {/* Mode saisie: kN direct ou divisions */}
                      <div className="flex gap-1">
                        <button onClick={()=>setTestField(testIdx,'mode_saisie','kn')}
                          className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${(t.mode_saisie||'kn')==='kn'?'bg-nge text-white border-nge':'border-border text-text-muted'}`}>
                          kN direct
                        </button>
                        <button onClick={()=>setTestField(testIdx,'mode_saisie','mm')}
                          className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${t.mode_saisie==='mm'?'bg-nge text-white border-nge':'border-border text-text-muted'}`}
                          disabled={facteurK===null} title={facteurK===null?'Sélectionner un anneau avec facteur k':undefined}>
                          mm (comparateur)
                        </button>
                      </div>

                      {/* Correction d'origine */}
                      <FG label="Mode correction">
                        <select value={t.correction_mode||'auto'} onChange={e => {
                            const newMode = e.target.value
                            if (newMode === 'line') {
                              const autoCorr = detectAutoCorrectionLine(testCalcs[testIdx]?.lectures || t.lectures)
                              const low  = autoCorr?.x1 != null ? autoCorr.x1 : (t.correction_low ?? 1.0)
                              const high = autoCorr?.x2 != null ? autoCorr.x2 : (t.correction_high ?? 3.0)
                              setTestBatch(testIdx, { correction_mode: newMode, correction_low: low, correction_high: high })
                            } else {
                              setTestField(testIdx, 'correction_mode', newMode)
                            }
                          }}
                          className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}>
                          <option value="auto">Auto</option>
                          <option value="delta0">δ₀ manuel</option>
                          <option value="line">Droite manuelle</option>
                        </select>
                      </FG>
                      {(t.correction_mode||'auto')==='delta0' && (
                        <FG label="δ₀ manuel (mm)">
                          <input type="number" step="0.01" min="0" value={t.delta0_manual||''} placeholder="0"
                            onChange={e=>setTestField(testIdx,'delta0_manual',e.target.value)}
                            className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/>
                        </FG>
                      )}
                      {(t.correction_mode||'auto')==='line' && (
                        <div className="grid grid-cols-2 gap-2">
                          <FG label="Point bas (mm)">
                            <input type="number" step="0.1" min="0" value={t.correction_low ?? ''}
                              onChange={e=>setTestField(testIdx,'correction_low',e.target.value)}
                              className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/>
                          </FG>
                          <FG label="Point haut (mm)">
                            <input type="number" step="0.1" min="0" value={t.correction_high ?? ''}
                              onChange={e=>setTestField(testIdx,'correction_high',e.target.value)}
                              className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge" tabIndex={0}/>
                          </FG>
                        </div>
                      )}
                      {(c?.correction_line?.x1!==null && c?.correction_line?.x2!==null) && (
                        <div className="text-[10px] text-text-muted px-1">
                          droite: bas={rnd(c.correction_line.x1,2)} mm / {c.correction_line.y1!==null?rnd(c.correction_line.y1,3):'—'} kN · haut={rnd(c.correction_line.x2,2)} mm / {c.correction_line.y2!==null?rnd(c.correction_line.y2,3):'—'} kN
                        </div>
                      )}
                      {(c?.delta0_used||0)>0 && (
                        <div className="text-[10px] text-[#854f0b] bg-[#faeeda] border border-[#e0c070] rounded px-2 py-1">
                          δ₀ utilisé={c.delta0_used} mm · source={c.delta0_source||'auto'}
                        </div>
                      )}

                      {/* Tableau profondeur / force */}
                      <table className="w-full border-collapse text-sm mt-1">
                        <thead>
                          <tr className="bg-bg border-b border-border">
                            <th className="px-2 py-1 text-left text-[10px] font-medium text-text-muted">d (mm)</th>
                            <th className="px-2 py-1 text-right text-[10px] font-medium text-text-muted">
                              {t.mode_saisie==='mm' ? 'Div.' : 'F (kN)'}
                            </th>
                            <th className="px-2 py-1 text-right text-[10px] font-medium text-text-muted">CBR%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.lectures.map((l, depthIdx) => {
                            const isKey = l.depth===2.5||l.depth===5.0
                            const isCorrHelper = l.depth===3.0||l.depth===12.0
                            const d0v = num(c?.delta0_used)||0
                            const isKeyCorr = d0v>0 && (Math.abs(l.depth-(2.5+d0v))<0.05||Math.abs(l.depth-(5.0+d0v))<0.05)
                            // Convert div→kN if needed
                            const rawVal = l.force
                            const fKn = t.mode_saisie==='mm' && facteurK!==null && num(rawVal)!==null
                              ? rnd(num(rawVal)*facteurK, 4) : num(rawVal)
                            const cbr = l.depth===2.5&&fKn!==null ? rnd(fKn/F_REF_2_5*100,1)
                                      : l.depth===5.0&&fKn!==null ? rnd(fKn/F_REF_5_0*100,1) : null
                            return (
                              <tr key={depthIdx} className={`border-b border-border ${isKey?'bg-[#f0f7ff]':isKeyCorr?'bg-[#fef3c7]':isCorrHelper?'bg-[#f8f8f6]':''}`}>
                                <td className={`px-2 py-0.5 text-[11px] ${isKey?'font-bold text-nge':isKeyCorr?'text-[#854f0b]':isCorrHelper?'text-text-muted italic':'text-text-muted'}`}>
                                  {l.depth}{isKey&&<span className="ml-0.5 text-[9px]">★</span>}{isCorrHelper&&<span className="ml-0.5 text-[9px] opacity-50">c</span>}
                                </td>
                                <td className="px-1 py-0.5">
                                  <input type="number" step="0.01" value={rawVal}
                                    onChange={e=>setLecture(testIdx,depthIdx,e.target.value)}
                                    placeholder="—"
                                    className={`w-full px-2 py-1 border rounded text-[12px] bg-bg outline-none text-right ${isKey?'border-nge':'border-border'} focus:border-nge`}
                                    tabIndex={0}/>
                                </td>
                                <td className={`px-2 py-0.5 text-right text-[11px] font-bold ${cbr!==null?'text-nge':'text-text-muted opacity-30'}`}>
                                  {cbr??''}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>

                      {/* Résultat */}
                      {c.ipi!==null && (
                        <div className="mt-2 p-2 rounded-lg border text-center" style={{background:color+'11',borderColor:color+'44'}}>
                          <div className="text-[22px] font-bold leading-none" style={{color}}>{c.ipi}</div>
                          <div className="text-[10px] mt-0.5 text-text-muted">IPI% ({c.controlling}){(c?.delta0_used||0)>0?' corr.':''}</div>
                          {(c?.delta0_used||0)>0&&c.ipiRaw!==null&&c.ipiRaw!==c.ipi&&<div className="text-[10px] text-text-muted">brut: {c.ipiRaw}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <button onClick={addTest}
            className="self-start text-[12px] text-text-muted hover:text-text border border-dashed border-border rounded px-4 py-2 transition-colors" tabIndex={0}>
            + Ajouter un poinçonnement
          </button>
        </div>

        {/* ── Colonne droite: graphique F=f(d) ── */}
        <div className="flex-1 flex flex-col" style={{minWidth:'260px', alignSelf:'stretch'}}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">F = f(profondeur) — temps réel</div>
          <div className="flex-1" style={{minHeight:'300px'}}>
            <IPIChart tests={tests} testCalcs={testCalcs} height={null}/>
          </div>
          <p className="text-[10px] text-text-muted italic mt-1">★ = 2.5 et 5.0mm. Pointillé = δ₀.</p>
        </div>

      </div>{/* end flex row */}

      {/* Courbe Proctor + IPI overlay */}
      {pnRes && pnPoints.length>0 && ipiOverlay.length>0 && (
        <Card title={`Courbe Proctor — ${pnSibling?.reference||'PN'} avec points IPI`}>
          <ProctorChart
            points={pnRes.points.map(p=>({...p,actif:p.actif!==false}))}
            calcs={pnCalcs} poly={pnPoly}
            wOPN={pnWOPN} rhoOPN={pnRhoOPN}
            correction={null} gs={pnRes.gs_fin??'2.70'}
            ipiPoints={ipiOverlay}/>
        </Card>
      )}
    </div>
  )
}
