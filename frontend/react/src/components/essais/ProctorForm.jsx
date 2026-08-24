import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Card, FG, FR, num, rnd, parseRes } from '@/components/essais/essaiFormUi'
import { extractPassant20FromGR } from '@/lib/grEssai'
import {
  MOULE_PRESETS,
  calcGTRCorrection,
  initPNPoints,
  calcPNPoint,
  polyFit2,
  evalPoly2,
} from '@/lib/pnEssai'
import { MouleSelect } from '@/components/essais/MouleSelect'
import ProctorChart from '@/components/essais/ProctorChart'

// ═══════════════════════════════════════════════════════════════════════════════
// PN — ESSAI PROCTOR NORMAL / MODIFIÉ
// NF P 94-093
//
// Protocole: 6 points de compactage
//   PN: petit moule (Ø101.6, V≈944 cm³), 3 couches × 25 coups
//   PM: grand moule CBR (Ø152.4, V≈2131 cm³), 5 couches × 55 coups
//       (ou petit moule, 5 couches × 25 coups si quantité limitée)
//
// Calcul:
//   ρh = (M_tot − M_moule) / V_moule  [Mg/m³ = g/cm³]
//   ρd = ρh / (1 + w/100)
//
// Correction GTR éléments > 20mm (NF P 94-093 Annexe B):
//   p_refus_20 = 100 − passant_20  (depuis essai GR frère — tamis 20mm)
//   a = p_refus_20 / 100
//   Si a ≤ 0.30:
//     ρdOPN_corr = ρdOPN / (1 − a × (1 − ρdOPN / Gs_gros))
//     wOPN_corr  = wOPN × (1 − a)
//   Si a > 0.30: correction non applicable (matériau non représentatif)
//
// Liens: IPI, CBRi, CBR utilisent le grand moule CBR (même V=2131 cm³)
//        M_moule et V_moule → référencer dans page Matériel (qualite_equipment)
// ═══════════════════════════════════════════════════════════════════════════════
export default function ProctorForm({ res, onChange, readOnly, essai }) {
  const [moulePreset, setMoulePreset] = useState(res.moule_preset  ?? 'petit_pn')
  const [mouleRef,    setMouleRef]    = useState(res.moule_ref     ?? '')
  const [mMoule,      setMMoule]      = useState(res.m_moule       ?? '')
  const [vMoule,      setVMoule]      = useState(res.v_moule       ?? '944')
  const [typePN,      setTypePN]      = useState(res.type_proctor  ?? 'normal')
  const [gsFin,       setGsFin]       = useState(res.gs_fin        ?? '2.70')
  const [gsGros,      setGsGros]      = useState(res.gs_gros       ?? '2.65')
  const [points,      setPoints]      = useState(() => initPNPoints(res))

  const echantillonId = essai?.echantillon_id
  const { data: siblingEssaisRaw } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn:  () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled:  Boolean(echantillonId),
  })
  const siblingEssais = Array.isArray(siblingEssaisRaw)
    ? siblingEssaisRaw
    : (siblingEssaisRaw?.items || siblingEssaisRaw?.results || [])

  // ── GR frère → correction GTR 0/20mm ──────────────────────────────────────
  const grSibling = siblingEssais.find(e => {
    const code = String(e?.essai_code || e?.code_essai || '').toUpperCase()
    return code === 'GR' && String(e?.uid || '') !== String(essai?.uid || '')
  }) || null
  const passant20 = grSibling ? extractPassant20FromGR(grSibling.resultats) : null
  const pRefus20  = passant20 !== null ? rnd(100 - passant20, 1) : null

  // ── Essais IPI / CBR frères ────────────────────────────────────────────────
  const ipiCbrEssais = siblingEssais.filter(e => {
    const code = String(e?.essai_code || e?.code_essai || '').toUpperCase()
    return ['IPI', 'CBR', 'CBRI', 'IM'].includes(code)
  })

  // Points IPI à superposer sur la courbe Proctor
  const ipiOverlayPoints = siblingEssais
    .filter(e => String(e?.essai_code || e?.code_essai || '').toUpperCase() === 'IPI')
    .flatMap(e => {
      const r = parseRes(e.resultats)
      return (r.tests || []).map(t => ({
        w:     t.pn_point_w   !== null && t.pn_point_w   !== undefined ? num(t.pn_point_w)   : null,
        rho_d: t.pn_point_rho_d !== null && t.pn_point_rho_d !== undefined ? num(t.pn_point_rho_d) : null,
        label: `P${t.pn_point_id || '?'}`,
        ipi:   t.ipi ?? null,
        f_kn:  t.f_kn ?? null,
      }))
    })
    .filter(p => p.w !== null && p.rho_d !== null)

  // ── Calculs ────────────────────────────────────────────────────────────────
  const calcs    = points.map(pt => calcPNPoint(pt, mMoule, vMoule))
  const validPts = points.map((p,i)=>({...p,...calcs[i]})).filter(p=>p.actif&&p.w!==null&&p.rho_d!==null)
  const poly     = validPts.length >= 3 ? polyFit2(validPts.map(p=>({x:p.w, y:p.rho_d}))) : null
  const wOPN     = poly ? rnd(-poly.c1/(2*poly.c2), 2) : null
  const rhoOPN   = poly && wOPN!==null ? rnd(evalPoly2(poly, wOPN), 3) : null
  const correction = calcGTRCorrection(rhoOPN, wOPN, pRefus20, num(gsGros))

  const preset = MOULE_PRESETS.find(p => p.key === moulePreset)
  const PN_CONFIGS = {
    normal:  { couches: 3, coups: 25 },
    modifie: moulePreset === 'grand_cbr' ? { couches: 5, coups: 55 } : { couches: 5, coups: 25 },
  }
  const config = PN_CONFIGS[typePN] || PN_CONFIGS.normal

  function emit(pts, mm, vv, tp, gf, gg, mp, mr) {
    const cc = pts.map(pt => calcPNPoint(pt, mm, vv))
    const vp = pts.map((p,i)=>({...p,...cc[i]})).filter(p=>p.actif&&p.w!==null&&p.rho_d!==null)
    const po  = vp.length>=3 ? polyFit2(vp.map(p=>({x:p.w,y:p.rho_d}))) : null
    const wO  = po ? rnd(-po.c1/(2*po.c2), 2) : null
    const rdO = po && wO!==null ? rnd(evalPoly2(po, wO), 3) : null
    const corr = calcGTRCorrection(rdO, wO, pRefus20, num(gg))
    onChange(JSON.stringify({
      moule_preset: mp, moule_ref: mr,
      m_moule: mm, v_moule: vv,
      gs_fin: gf, gs_gros: gg,
      type_proctor: tp,
      points: pts,
      wOPN: wO,           rho_d_OPN: rdO,
      wOPN_corr: corr?.applicable ? corr.w_corr   : null,
      rho_d_OPN_corr: corr?.applicable ? corr.rho_corr : null,
    }))
  }

  function setP(i,k,v){ const u=points.map((p,idx)=>idx===i?{...p,[k]:v}:p); setPoints(u); emit(u,mMoule,vMoule,typePN,gsFin,gsGros,moulePreset,mouleRef) }
  function setPBatch(i, updates) {
    const u = points.map((p,idx) => idx===i ? {...p, ...updates} : p)
    setPoints(u); emit(u,mMoule,vMoule,typePN,gsFin,gsGros,moulePreset,mouleRef)
  }
  function onMM(v)      { setMMoule(v);    emit(points,v,vMoule,typePN,gsFin,gsGros,moulePreset,mouleRef) }
  function onVM(v)      { setVMoule(v);    emit(points,mMoule,v,typePN,gsFin,gsGros,moulePreset,mouleRef) }
  function onType(v)    { setTypePN(v);    emit(points,mMoule,vMoule,v,gsFin,gsGros,moulePreset,mouleRef) }
  function onGsFin(v)   { setGsFin(v);     emit(points,mMoule,vMoule,typePN,v,gsGros,moulePreset,mouleRef) }
  function onGsGros(v)  { setGsGros(v);    emit(points,mMoule,vMoule,typePN,gsFin,v,moulePreset,mouleRef) }
  function onMouleRef(v){ setMouleRef(v);  emit(points,mMoule,vMoule,typePN,gsFin,gsGros,moulePreset,v) }
  function onPreset(v)  {
    setMoulePreset(v)
    const p = MOULE_PRESETS.find(x => x.key === v)
    if (p?.v) { setVMoule(String(p.v)); emit(points,mMoule,String(p.v),typePN,gsFin,gsGros,v,mouleRef) }
    else       emit(points,mMoule,vMoule,typePN,gsFin,gsGros,v,mouleRef)
  }
  function addPoint() {
    const u = [...points, {id:points.length+1,actif:true,w:'',m1:'',m2:'',m3:'',m_tot:''}]
    setPoints(u); emit(u,mMoule,vMoule,typePN,gsFin,gsGros,moulePreset,mouleRef)
  }

  // ── readOnly ────────────────────────────────────────────────────────────────
  if (readOnly) {
    const pts = points.map((p,i)=>({...p,...calcs[i]})).filter(p => p.actif)
    return (
      <div className="flex flex-col gap-4">
        <Card title="Paramètres">
          <div className="grid grid-cols-3 gap-4">
            <FR label="Type" value={typePN==='normal'?'Proctor Normal':'Proctor Modifié'}/>
            <FR label="Moule" value={`${preset?.label||moulePreset}${mouleRef?` · N°${mouleRef}`:''}`}/>
            <FR label="V moule (cm³)" value={vMoule||null}/>
            <FR label="M moule (g)" value={mMoule||null}/>
            <FR label="Gs fins" value={gsFin||null}/>
            <FR label="Gs gros (correction)" value={gsGros||null}/>
          </div>
        </Card>
        {(wOPN!==null||rhoOPN!==null) && (
          <div className="flex gap-3 flex-wrap">
            {wOPN!==null && <div className="px-5 py-3 bg-[#fcebeb] border border-[#f0a0a0] rounded-lg text-center">
              <div className="text-[26px] font-bold text-[#a32d2d] leading-none">{wOPN} %</div>
              <div className="text-[11px] text-[#a32d2d] mt-1 font-medium">wOPN mesurée (0/20)</div>
            </div>}
            {rhoOPN!==null && <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center">
              <div className="text-[26px] font-bold text-[#3b6d11] leading-none">{rhoOPN}</div>
              <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">ρdOPN mesurée (Mg/m³)</div>
            </div>}
            {correction?.applicable && <>
              <div className="px-5 py-3 bg-[#ede9fe] border border-[#c4b5fd] rounded-lg text-center">
                <div className="text-[26px] font-bold text-[#5b21b6] leading-none">{correction.w_corr} %</div>
                <div className="text-[11px] text-[#5b21b6] mt-1 font-medium">wOPN corrigée 0/D</div>
              </div>
              <div className="px-5 py-3 bg-[#ede9fe] border border-[#c4b5fd] rounded-lg text-center">
                <div className="text-[26px] font-bold text-[#5b21b6] leading-none">{correction.rho_corr}</div>
                <div className="text-[11px] text-[#5b21b6] mt-1 font-medium">ρdOPN corrigée (Mg/m³)</div>
              </div>
            </>}
          </div>
        )}
        {correction && !correction.applicable && (
          <div className="px-4 py-3 bg-[#faeeda] border border-[#e0c070] rounded-lg text-[12px] text-[#854f0b]">
            ⚠ Refus 20mm = {correction.pRefus}% &gt; 30% — correction GTR non applicable (matériau non représentatif)
          </div>
        )}
        <Card title="Courbe Proctor">
          <ProctorChart points={points} calcs={calcs} poly={poly} wOPN={wOPN} rhoOPN={rhoOPN} correction={correction} gs={gsFin} ipiPoints={ipiOverlayPoints}/>
        </Card>
        <Card title="Points de compactage">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-2 py-2 text-[11px] font-medium text-text-muted text-left">N°</th>
                <th className="px-2 py-2 text-[11px] font-medium text-text-muted">Moule</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w (%)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M tot (g)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">ρh (g/cm³)</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-nge">ρd (Mg/m³)</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p,i)=>(
                <tr key={i} className="border-b border-border">
                  <td className="px-2 py-1.5 text-[12px] text-text-muted">{p.id}</td>
                  <td className="px-2 py-1.5 text-[12px] font-mono text-text-muted">{p.moule_ref||'—'}</td>
                  <td className="px-3 py-1.5 text-right text-[12px]">{p.w??'—'}</td>
                  <td className="px-3 py-1.5 text-right text-[12px]">{p.m_tot||'—'}</td>
                  <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{p.rho_h??'—'}</td>
                  <td className={`px-3 py-1.5 text-right font-bold ${p.rho_d!==null?'text-nge text-[14px]':'text-text-muted text-[12px]'}`}>{p.rho_d??'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    )
  }

  // ── edit ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* Moule */}
      <Card title="Identification du moule">
        <div className="grid grid-cols-4 gap-3 mb-3">
          <FG label="Moule standard">
            <Select value={moulePreset} onChange={e=>onPreset(e.target.value)} className="w-full" tabIndex={0}>
              {MOULE_PRESETS.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          </FG>
          <FG label="Moule — depuis Matériel">
            <MouleSelect value={mouleRef} disabled={false}
              onSelect={({code, m_tare, volume_cm3}) => {
                onMouleRef(code)
                if (m_tare != null) onMM(String(m_tare))
                if (volume_cm3 != null) onVM(String(volume_cm3))
              }}/>
          </FG>
          <FG label="M_moule (g)">
            <input type="number" step="0.1" value={mMoule} onChange={e=>onMM(e.target.value)} placeholder="peser"
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}/>
          </FG>
          <FG label="V_moule (cm³)">
            <input type="number" step="1" value={vMoule} onChange={e=>onVM(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}/>
          </FG>
        </div>
        <p className="text-[11px] text-text-muted italic">
          {preset?.info}
          {moulePreset==='grand_cbr' && <span className="ml-2 px-2 py-0.5 bg-[#e6f1fb] text-[#185fa5] rounded font-medium">→ compatible IPI / CBRi / CBR</span>}
        </p>
        <p className="text-[11px] text-text-muted mt-1.5">
          Sélectionner depuis Matériel remplit auto M_moule et V. Saisie manuelle possible.
        </p>
      </Card>

      {/* Paramètres */}
      <Card title="Paramètres de l'essai">
        <div className="grid grid-cols-4 gap-3">
          <FG label="Type d'essai">
            <Select value={typePN} onChange={e=>onType(e.target.value)} className="w-full" tabIndex={0}>
              <option value="normal">Proctor Normal</option>
              <option value="modifie">Proctor Modifié</option>
            </Select>
          </FG>
          <FG label="Gs matériau fin (ligne Sr)">
            <input type="number" step="0.01" value={gsFin} onChange={e=>onGsFin(e.target.value)} placeholder="2.70"
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}/>
          </FG>
          <FG label="Gs éléments grossiers (correction)">
            <input type="number" step="0.01" value={gsGros} onChange={e=>onGsGros(e.target.value)} placeholder="2.65"
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}/>
          </FG>
          <div className="flex flex-col justify-end pb-2">
            <p className="text-[11px] text-text-muted font-medium">{config.couches} couches × {config.coups} coups/couche</p>
          </div>
        </div>
      </Card>

      {/* Correction GTR — depuis GR frère */}
      {grSibling ? (
        <div className={`px-4 py-3 rounded-lg border text-[12px] ${
          passant20===null           ? 'bg-[#f1efe8] border-border text-text-muted' :
          pRefus20!==null&&pRefus20>30 ? 'bg-[#faeeda] border-[#e0c070] text-[#854f0b]' :
                                         'bg-[#ede9fe] border-[#c4b5fd] text-[#4c1d95]'
        }`}>
          <div className="font-semibold mb-1">
            Correction GTR — éléments &gt; 20mm
            <span className="text-[10px] font-normal ml-2 opacity-60">NF P 94-093 Annexe B · depuis essai GR</span>
          </div>
          {passant20===null ? (
            <span>Tamis 20mm non trouvé dans l'essai GR (réf : {grSibling?.reference || `#${grSibling?.uid}`}). Ajoutez le tamis 20mm dans la granulométrie.</span>
          ) : pRefus20!==null && pRefus20>30 ? (
            <span>Refus 20mm = <strong>{pRefus20}%</strong> (passant 20mm = {passant20}%) — Refus &gt; 30% : <strong>correction non applicable</strong>. Proctor non représentatif de la fraction totale.</span>
          ) : (
            <span>Passant 20mm = <strong>{passant20}%</strong> → Refus = <strong>{pRefus20}%</strong> ≤ 30% — Correction applicable. Les valeurs OPN corrigées (0/D) sont calculées automatiquement.</span>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 rounded-lg border border-dashed border-border text-[12px] text-text-muted">
          <span className="font-medium">Correction GTR 0/20mm</span> — Aucun essai GR trouvé pour cet échantillon.
          Créez un essai <strong>GR (Granulométrie)</strong> avec le tamis 20mm pour activer la correction automatique.
        </div>
      )}

      {/* 6 points de compactage */}
      <Card title="Points de compactage — 6 points">
        <p className="text-[11px] text-text-muted italic mb-3">
          M_tot = moule + sol compacté (g). Teneur en eau w : saisie directe (%) ou pesées M1/M2/M3 par étuvage (prioritaires).
          Minimum 3 points actifs pour ajuster la parabolique.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-2 py-2 text-[11px] font-medium text-text-muted w-6">✓</th>
                <th className="px-2 py-2 text-[11px] font-medium text-text-muted">N°</th>
                <th className="px-2 py-2 text-[11px] font-medium text-text-muted">Moule</th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">M_moule<br/><span className="font-normal opacity-60">(g)</span></th>
                <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">V<br/><span className="font-normal opacity-60">(cm³)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w (%)<br/><span className="font-normal opacity-60">direct</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M1 (g)<br/><span className="font-normal opacity-60">récip.</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M2 (g)<br/><span className="font-normal opacity-60">+humide</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M3 (g)<br/><span className="font-normal opacity-60">+sec</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w calc.<br/><span className="font-normal opacity-60">(%)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M_tot (g)<br/><span className="font-normal opacity-60">moule+sol</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">ρh<br/><span className="font-normal opacity-60">(g/cm³)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-nge">ρd (Mg/m³)</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p,i)=>{
                const c = calcs[i]
                const wFromPesee = (() => {
                  const n1=num(p.m1),n2=num(p.m2),n3=num(p.m3)
                  if(n1!==null&&n2!==null&&n3!==null&&(n3-n1)>0) return rnd((n2-n3)/(n3-n1)*100,2)
                  return null
                })()
                return (
                  <tr key={i} className={`border-b border-border ${!p.actif?'opacity-30':''}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={p.actif} onChange={e=>setP(i,'actif',e.target.checked)} className="accent-nge" tabIndex={0}/>
                    </td>
                    <td className="px-2 py-1.5 text-[12px] text-text-muted">{p.id}</td>
                    <td className="px-1 py-1.5" style={{minWidth:'120px'}}>
                      <MouleSelect value={p.moule_ref} disabled={!p.actif}
                        onSelect={({code, m_tare, volume_cm3}) => {
                          setPBatch(i, {
                            moule_ref: code,
                            ...(m_tare != null && { m_moule: String(m_tare) }),
                            ...(volume_cm3 != null && { v_moule: String(volume_cm3) }),
                          })
                        }}/>
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" step="0.1" value={p.m_moule} onChange={e=>setP(i,'m_moule',e.target.value)}
                        disabled={!p.actif} placeholder={mMoule||'—'}
                        className="w-[72px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" step="1" value={p.v_moule} onChange={e=>setP(i,'v_moule',e.target.value)}
                        disabled={!p.actif} placeholder={vMoule||'—'}
                        className="w-[62px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" step="0.1" value={p.w} onChange={e=>setP(i,'w',e.target.value)}
                        disabled={!p.actif} placeholder="—"
                        className="w-[64px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    {['m1','m2','m3'].map(k=>(
                      <td key={k} className="px-1 py-1.5">
                        <input type="number" step="0.01" value={p[k]} onChange={e=>setP(i,k,e.target.value)}
                          disabled={!p.actif} placeholder="—"
                          className="w-[76px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge text-right disabled:opacity-40" tabIndex={0}/>
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right font-medium text-[12px] ${wFromPesee!==null?'text-nge':'text-text-muted opacity-50'}`}>
                      {wFromPesee!==null ? wFromPesee : (c.w!==null ? c.w : '—')}
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" step="0.1" value={p.m_tot} onChange={e=>setP(i,'m_tot',e.target.value)}
                        disabled={!p.actif} placeholder="—"
                        className="w-[86px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-nge text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{c.rho_h??'—'}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${c.rho_d!==null&&p.actif?'text-nge text-[14px]':'text-text-muted text-[12px]'}`}>{c.rho_d??'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button onClick={addPoint}
          className="mt-3 text-[12px] text-text-muted hover:text-text border border-dashed border-border rounded px-3 py-1.5 transition-colors" tabIndex={0}>
          + Ajouter un point
        </button>
      </Card>

      {/* Courbe Proctor — toujours visible, mise à jour en temps réel */}
      <Card title="Courbe Proctor — temps réel">
        <ProctorChart points={points} calcs={calcs} poly={poly} wOPN={wOPN} rhoOPN={rhoOPN} correction={correction} gs={gsFin} ipiPoints={ipiOverlayPoints}/>
      </Card>

      {/* Résultats — affichés dès que disponibles */}
      {(wOPN!==null || rhoOPN!==null || (validPts.length>=2 && validPts.length<3)) && (
        <div className="flex gap-3 flex-wrap">
          {wOPN!==null && <div className="flex items-center gap-3 px-5 py-3 bg-[#fcebeb] border border-[#f0a0a0] rounded-lg">
            <div>
              <div className="text-[28px] font-bold text-[#a32d2d] leading-none">{wOPN} %</div>
              <div className="text-[11px] text-[#a32d2d] mt-1 font-medium">wOPN — fraction 0/20mm</div>
            </div>
          </div>}
          {rhoOPN!==null && <div className="flex items-center gap-3 px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg">
            <div>
              <div className="text-[28px] font-bold text-[#3b6d11] leading-none">{rhoOPN} Mg/m³</div>
              <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">ρdOPN — fraction 0/20mm</div>
            </div>
          </div>}
          {correction?.applicable && <>
            <div className="flex items-center gap-3 px-5 py-3 bg-[#ede9fe] border border-[#c4b5fd] rounded-lg">
              <div>
                <div className="text-[28px] font-bold text-[#5b21b6] leading-none">{correction.w_corr} %</div>
                <div className="text-[11px] text-[#5b21b6] mt-1 font-medium">wOPN corrigée 0/D ({correction.pRefus}% refus)</div>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-3 bg-[#ede9fe] border border-[#c4b5fd] rounded-lg">
              <div>
                <div className="text-[28px] font-bold text-[#5b21b6] leading-none">{correction.rho_corr} Mg/m³</div>
                <div className="text-[11px] text-[#5b21b6] mt-1 font-medium">ρdOPN corrigée 0/D</div>
              </div>
            </div>
          </>}
          {validPts.length >= 2 && validPts.length < 3 && (
            <div className="px-4 py-3 bg-[#faeeda] border border-[#e0c070] rounded-lg text-[12px] text-[#854f0b]">
              <div className="font-bold">⚠ Courbe non ajustée</div>
              <div className="opacity-80">Minimum 3 points actifs pour la parabolique</div>
            </div>
          )}
        </div>
      )}

      {/* IPI / CBR / CBRi */}
      <div className={`px-4 py-3 rounded-lg border text-[12px] ${
        moulePreset==='grand_cbr' ? 'bg-[#e6f1fb] border-[#90bfe8] text-[#185fa5]' : 'bg-[#f1efe8] border-border text-text-muted'
      }`}>
        <div className="font-semibold mb-1">Essais associés — IPI · CBRi · CBR</div>
        {moulePreset!=='grand_cbr' && (
          <p className="mb-1.5 text-[#854f0b] bg-[#faeeda] border border-[#e0c070] px-3 py-1.5 rounded">
            ⚠ IPI, CBRi et CBR requièrent le <strong>grand moule CBR (Ø152.4, V=2131 cm³)</strong>. Sélectionnez ce moule pour les lier au Proctor.
          </p>
        )}
        {ipiCbrEssais.length > 0 ? (
          <div className="flex flex-col gap-1">
            {ipiCbrEssais.map(e=>(
              <span key={e.uid} className="font-mono text-[11px]">
                {e.essai_code||e.code_essai} · {e.reference||`#${e.uid}`} — {e.statut||'?'}
              </span>
            ))}
          </div>
        ) : (
          <p className="opacity-80">
            Aucun essai IPI/CBR existant pour cet échantillon.
            Après enregistrement du Proctor, créez les essais IPI, CBRi et CBR depuis la fiche échantillon
            en utilisant le <strong>même moule</strong> (N° {mouleRef||'—'}).
          </p>
        )}
      </div>

    </div>
  )
}
