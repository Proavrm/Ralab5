import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import Input, { Select } from '@/components/ui/Input'
import { Card, FG, FR, rnd } from '@/components/essais/essaiFormUi'
import {
  VBS_METHODES,
  VBS_TYPES,
  calcMBResult,
  calcVBS,
  calcWaterMoisture,
  extractCoeffCFromGR,
  extractWEMasses,
  initVBSDets,
  pickGRForVBS,
  pickWEForUsage,
  pickWEForVBS,
} from '@/lib/vbsEssai'

export default function BleuMethyleneForm({ res, onChange, readOnly, essai }) {
  const [type,    setType]    = useState(res.type_materiau || 'granulats')
  const [methode, setMethode] = useState(res.methode       || 'nf_en_933_9')
  // Humidité — même pour tous les types (VBS sols/granulats, MB, MBF)
  const [m1, setM1] = useState(res.m1 ?? '')
  const [m2, setM2] = useState(res.m2 ?? '')
  const [m3, setM3] = useState(res.m3 ?? '')
  // Déterminations VBS (sols + granulats uniquement)
  const [dets, setDets] = useState(() => initVBSDets(res))
  // MB / MBF
  const [v1,     setV1]     = useState(res.v1      ?? '')
  const [vPrime, setVPrime] = useState(res.v_prime  ?? '')
  const [useKao, setUseKao] = useState(res.use_kaolinite ?? false)
  const [useManualMs, setUseManualMs] = useState(Boolean(res.use_manual_ms ?? false))
  const [manualMs, setManualMs] = useState(
    res.ms_manual ?? ((res.use_manual_ms ?? false) ? (res.ms ?? '') : '')
  )
  const [useManualDryMass, setUseManualDryMass] = useState(Boolean(res.use_manual_dry_mass ?? false))

  const echantillonId = essai?.echantillon_id
  const { data: essaisByEchantillon } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled: Boolean(echantillonId),
  })
  const siblingEssais = Array.isArray(essaisByEchantillon)
    ? essaisByEchantillon
    : (essaisByEchantillon?.items || essaisByEchantillon?.results || [])

  // WE sibling selon le type — même logique pour tous
  const weUsageByType = { sols:'vbs', granulats:'vbs', mb_0_2:'coupure_0250', mbf_0_0125:'coupure_0125' }
  const currentWeUsage = weUsageByType[type] || 'vbs'
  const sourceWE    = (type === 'mb_0_2' || type === 'mbf_0_0125')
    ? pickWEForUsage(siblingEssais, essai?.uid, currentWeUsage)
    : pickWEForVBS(siblingEssais, essai?.uid, currentWeUsage)
  const sourceMasses = extractWEMasses(sourceWE?.resultats)
  const sourceGR    = pickGRForVBS(siblingEssais, essai?.uid)
  const coeffCFromGR = extractCoeffCFromGR(sourceGR?.resultats)

  useEffect(() => {
    setType(res.type_materiau || 'granulats')
    setMethode(res.methode || 'nf_en_933_9')
    setM1(res.m1 ?? ''); setM2(res.m2 ?? ''); setM3(res.m3 ?? '')
    setDets(initVBSDets(res))
    setV1(res.v1 ?? ''); setVPrime(res.v_prime ?? ''); setUseKao(res.use_kaolinite ?? false)
    setUseManualMs(Boolean(res.use_manual_ms ?? false))
    setManualMs(res.ms_manual ?? ((res.use_manual_ms ?? false) ? (res.ms ?? '') : ''))
    setUseManualDryMass(Boolean(res.use_manual_dry_mass ?? false))
  }, [res])

  // Auto-fill M1/M2/M3 depuis WE sibling si vides
  useEffect(() => {
    if (readOnly || !sourceMasses || useManualMs || (type === 'sols' && useManualDryMass)) return
    const hasMass = String(m1??'').trim()!=='' || String(m2??'').trim()!=='' || String(m3??'').trim()!==''
    if (hasMass) return
    setM1(sourceMasses.m1); setM2(sourceMasses.m2); setM3(sourceMasses.m3)
    emitAll(dets, type, methode, sourceMasses.m1, sourceMasses.m2, sourceMasses.m3, v1, vPrime, useKao, useManualMs, manualMs, useManualDryMass)
  }, [readOnly, sourceMasses, currentWeUsage, useManualMs, manualMs, useManualDryMass, type])

  useEffect(() => {
    if (readOnly) return
    // Ne pas recalculer pour MB/MBF — le coeffCFromGR ne les concerne pas
    if (type === 'mb_0_2' || type === 'mbf_0_0125') return
    emitAll(dets, type, methode, m1, m2, m3, v1, vPrime, useKao, useManualMs, manualMs, useManualDryMass)
  }, [readOnly, coeffCFromGR])

  const isMB = type === 'mb_0_2' || type === 'mbf_0_0125'
  const usesManualDryMass = type === 'sols' && useManualDryMass
  const waterMoisture = calcWaterMoisture({ m1, m2, m3 })
  const mbComputed = calcMBResult({
    m1,
    m2,
    m3,
    ms_manual: manualMs,
    use_manual_ms: isMB && useManualMs,
    v1,
    v_prime: vPrime,
    use_kaolinite: useKao,
  })
  const moisture = isMB ? { ms: mbComputed.ms, w: mbComputed.w, meau: mbComputed.meau } : waterMoisture
  const mbLabel    = type === 'mb_0_2' ? 'MB' : 'MBF'
  const mbFraction = type === 'mb_0_2' ? '0/2 mm' : '0/0.125 mm'

  function emitAll(_dets, _type, _met, _m1, _m2, _m3, _v1, _vp, _uk, _useManualMs, _manualMs, _useManualDryMass) {
    const isMB_ = _type === 'mb_0_2' || _type === 'mbf_0_0125'
    const mbData = calcMBResult({
      m1: _m1,
      m2: _m2,
      m3: _m3,
      ms_manual: _manualMs,
      use_manual_ms: isMB_ && _useManualMs,
      v1: _v1,
      v_prime: _vp,
      use_kaolinite: _uk,
    })
    const w = isMB_ ? { ms: mbData.ms, w: mbData.w, meau: mbData.meau } : calcWaterMoisture({ m1:_m1, m2:_m2, m3:_m3 })
    const result = {
      type_materiau: _type, methode: _met,
      m1:_m1, m2:_m2, m3:_m3, ms:w.ms, w:w.w, meau:w.meau,
    }
    if (isMB_) {
      // MB/MBF: calcul direct depuis Ms
      const lbl = _type === 'mb_0_2' ? 'mb' : 'mbf'
      result.v1=_v1; result.v_prime=_vp; result.use_kaolinite=_uk
      result.use_manual_ms = Boolean(_useManualMs)
      result.ms_manual = _useManualMs ? _manualMs : null
      result[lbl] = mbData.result
    } else {
      // VBS sols/granulats
      const calcs = calcVBS(_dets, _type, w.w, coeffCFromGR, _type === 'sols' && _useManualDryMass)
      const valides = calcs.filter(d => d.actif && (d.vbs !== null || d.vb !== null))
      result.determinations = calcs
      result.nb_determinations = valides.length
      result.use_manual_dry_mass = _type === 'sols' ? Boolean(_useManualDryMass) : false
      const vals = valides.map(d => d.vbs).filter(v => v !== null)
      if (vals.length > 0) {
        const mean = rnd(vals.reduce((a,b)=>a+b,0)/vals.length, _type==='granulats'?1:2)
        result.vbs_moyen = mean
        if (_type !== 'granulats') result.vb_moyen = mean
      }
    }
    onChange(JSON.stringify(result))
  }

  function onType(v)   { setType(v);    emitAll(dets,v,methode,m1,m2,m3,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function onMet(v)    { setMethode(v); emitAll(dets,type,v,m1,m2,m3,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function onM1(v)     { setM1(v);      emitAll(dets,type,methode,v,m2,m3,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function onM2(v)     { setM2(v);      emitAll(dets,type,methode,m1,v,m3,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function onM3(v)     { setM3(v);      emitAll(dets,type,methode,m1,m2,v,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function onV1(v)     { setV1(v);      emitAll(dets,type,methode,m1,m2,m3,v,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function onVp(v)     { setVPrime(v);  emitAll(dets,type,methode,m1,m2,m3,v1,v,useKao,useManualMs,manualMs,useManualDryMass) }
  function onKao(v)    { setUseKao(v);  emitAll(dets,type,methode,m1,m2,m3,v1,vPrime,v,useManualMs,manualMs,useManualDryMass) }
  function onManualMs(v) {
    setManualMs(v)
    emitAll(dets, type, methode, m1, m2, m3, v1, vPrime, useKao, useManualMs, v, useManualDryMass)
  }
  function onManualMode(v) {
    const nextManualMs = v && String(manualMs ?? '').trim() === '' && moisture.ms != null ? String(moisture.ms) : manualMs
    setUseManualMs(v)
    if (nextManualMs !== manualMs) setManualMs(nextManualMs)
    emitAll(dets, type, methode, m1, m2, m3, v1, vPrime, useKao, v, nextManualMs, useManualDryMass)
  }
  function onManualDryMassMode(v) {
    const nextDets = v
      ? dets.map(det => {
          if (String(det.m_seche ?? '').trim() !== '') return det
          const computed = calcVBS([det], type, moisture.w, coeffCFromGR, false)[0]
          return { ...det, m_seche: computed?.m_seche ?? '' }
        })
      : dets
    if (v) setDets(nextDets)
    setUseManualDryMass(v)
    emitAll(nextDets, type, methode, m1, m2, m3, v1, vPrime, useKao, useManualMs, manualMs, v)
  }
  function onDet(i,k,v){ const u=dets.map((d,idx)=>idx===i?{...d,[k]:v}:d); setDets(u); emitAll(u,type,methode,m1,m2,m3,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function addDet()    { const u=[...dets,{actif:true,numero:dets.length+1,m_echantillon:'',m_humide:'',v_bleu:'',c_bleu:'',m_seche:''}]; setDets(u); emitAll(u,type,methode,m1,m2,m3,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }
  function rmDet(i)    { const u=dets.filter((_,idx)=>idx!==i); setDets(u); emitAll(u,type,methode,m1,m2,m3,v1,vPrime,useKao,useManualMs,manualMs,useManualDryMass) }

  // Résultat MB/MBF
  const mbResult = isMB ? mbComputed.result : null

  const calcs   = isMB ? [] : calcVBS(dets, type, moisture.w, coeffCFromGR, usesManualDryMass)
  const vbsMean = calcs.filter(d=>d.actif&&d.vbs!==null).map(d=>d.vbs)
  const vbMean  = calcs.filter(d=>d.actif&&d.vb!==null).map(d=>d.vb)

  const weTitle = isMB && useManualMs
    ? 'Masse sèche — saisie manuelle'
    : usesManualDryMass
    ? 'Masse sèche — saisie manuelle'
    : sourceWE
    ? `Humidité — WE trouvé (${currentWeUsage})`
    : 'Humidité — saisie manuelle'

  return (
    <div className="flex flex-col gap-4">

      {/* 1. Contexte — identique pour tous */}
      <Card title="Contexte et méthode">
        {readOnly ? (
          <div className="grid grid-cols-2 gap-4">
            <FR label="Type"    value={VBS_TYPES.find(t=>t.value===type)?.label} />
            <FR label="Méthode" value={VBS_METHODES.find(m=>m.value===methode)?.label} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FG label="Type de matériau">
              <Select value={type} onChange={e=>onType(e.target.value)} className="w-full">
                {VBS_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </FG>
            <FG label="Méthode / Norme">
              <Select value={methode} onChange={e=>onMet(e.target.value)} className="w-full">
                {VBS_METHODES.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </FG>
          </div>
        )}
      </Card>

      {/* 2. Humidité / masse sèche */}
      <Card title={readOnly ? ((type === 'sols' && res.use_manual_dry_mass) ? 'Masse sèche' : 'Humidité') : weTitle}>
        {readOnly ? (
          type === 'sols' && res.use_manual_dry_mass ? (
            <div className="grid grid-cols-4 gap-3">
              <FR label="Mode" value="Masse sèche saisie manuellement" />
              <FR label="Saisie" value="Par détermination VBS" />
            </div>
          ) : res.use_manual_ms && isMB ? (
            <div className="grid grid-cols-4 gap-3">
              <FR label="Mode Ms" value="Saisie manuelle" />
              <FR label="Ms — Masse sèche (g)" value={res.ms_manual ?? res.ms} />
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              <FR label="M1 — Récipient vide (g)"      value={res.m1} />
              <FR label="M2 — +Sol humide (g)"          value={res.m2} />
              <FR label="M3 — +Sol sec (g)"             value={res.m3} />
              <FR label="Ms — Masse sèche (g)"          value={res.ms} />
              <FR label="w — Teneur en eau (%)"         value={res.w}  />
            </div>
          )
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {type === 'sols' && !isMB && (
              <div className="col-span-4 flex items-center gap-4 px-3 py-2 bg-bg border border-border rounded-lg flex-wrap">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={useManualDryMass} onChange={e=>onManualDryMassMode(e.target.checked)} className="accent-nge"/>
                    Saisir directement la masse sèche pour chaque détermination sans utiliser la teneur en eau
                </label>
              </div>
            )}
            {isMB && (
              <div className="col-span-4 flex items-center gap-4 px-3 py-2 bg-bg border border-border rounded-lg flex-wrap">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={useManualMs} onChange={e=>onManualMode(e.target.checked)} className="accent-nge"/>
                    Saisir directement la masse sèche Ms sans utiliser la teneur en eau
                </label>
              </div>
            )}
            {isMB && useManualMs ? (
              <>
                <FG label="Ms — Masse sèche (g)">
                  <Input type="number" step="0.01" value={manualMs} onChange={e=>onManualMs(e.target.value)} className="text-amber-700 border-amber-300 bg-amber-50 focus:border-amber-500" />
                </FG>
                <p className="col-span-4 text-[11px] text-text-muted italic">
                  Ms est saisie manuellement. Les champs M1, M2 et M3 ne sont pas utilisés dans le calcul de {mbLabel}.
                </p>
              </>
            ) : type === 'sols' && useManualDryMass ? (
              <p className="col-span-4 text-[11px] text-text-muted italic">
                La teneur en eau n'est pas utilisée. Saisir la masse sèche dans chaque détermination VBS ci-dessous.
              </p>
            ) : (
              <>
                <FG label="M1 — Récipient vide (g)">
                  <Input type="number" step="0.01" value={m1} onChange={e=>onM1(e.target.value)} className="text-sky-700 border-sky-300 bg-sky-50 focus:border-sky-500" />
                </FG>
                <FG label="M2 — +Sol humide (g)">
                  <Input type="number" step="0.01" value={m2} onChange={e=>onM2(e.target.value)} className="text-rose-700 border-rose-300 bg-rose-50 focus:border-rose-500" />
                </FG>
                <FG label="M3 — +Sol sec (g)">
                  <Input type="number" step="0.01" value={m3} onChange={e=>onM3(e.target.value)} className="text-emerald-700 border-emerald-300 bg-emerald-50 focus:border-emerald-500" />
                </FG>
                <FG label="Ms — calculée (g)">
                  <input readOnly value={moisture.ms??''} placeholder="—"
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1}/>
                </FG>
                <FG label="w — calculé (%)">
                  <input readOnly value={moisture.w??''} placeholder="—"
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-nge font-bold" tabIndex={-1}/>
                </FG>
                <p className="col-span-4 text-[11px] text-text-muted italic">
                  Meau = M2−M3 · Ms = M3−M1 · w = Meau/Ms × 100
                </p>
              </>
            )}
          </div>
        )}
      </Card>

      {/* 3. Calcul — différent selon le type */}
      {isMB ? (
        <Card title={`${mbLabel} — Valeur au bleu fraction ${mbFraction}`}>
          {readOnly ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-4">
                <FR label="V1 — Volume bleu (mL)"     value={res.v1} />
                {res.use_kaolinite && <FR label="V' kaolinite (mL)" value={res.v_prime} />}
              </div>
              {res[mbLabel.toLowerCase()] != null && (
                <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg inline-block">
                  <div className="text-[26px] font-bold text-[#3b6d11]">{res[mbLabel.toLowerCase()]} g/kg</div>
                  <div className="text-[11px] text-[#5a8f30]">{mbLabel} — fraction {mbFraction}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-[11px] text-text-muted italic">
                Formule: {mbLabel} = {useKao?"(V1−V')":"V1"} × 10 / Ms — résultat en g/kg
              </p>
              <div className="grid grid-cols-3 gap-3">
                <FG label="V1 — Volume bleu total (mL)">
                  <input type="number" step="0.5" value={v1} onChange={e=>onV1(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-nge" tabIndex={0}/>
                </FG>
              </div>
              <div className="flex items-center gap-4 px-3 py-2 bg-bg border border-border rounded-lg flex-wrap">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={useKao} onChange={e=>onKao(e.target.checked)} className="accent-nge"/>
                  Correction kaolinite — {mbLabel} = ((V1−V&apos;) × 10) / Ms
                </label>
                {useKao && (
                  <FG label="V' — Volume kaolinite (mL)">
                    <input type="number" step="0.5" value={vPrime} onChange={e=>onVp(e.target.value)}
                      className="w-[90px] px-2 py-1 border border-border rounded text-sm bg-bg outline-none focus:border-nge"/>
                  </FG>
                )}
              </div>
              {mbResult !== null && (
                <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg inline-block">
                  <div className="text-[26px] font-bold text-[#3b6d11]">{mbResult} g/kg</div>
                  <div className="text-[11px] text-[#5a8f30]">{mbLabel} — fraction {mbFraction}</div>
                </div>
              )}
            </div>
          )}
        </Card>
      ) : (
        <Card title={`Déterminations VBS (${dets.filter(d=>d.actif).length})`}>
          {type === 'sols' && (
            <p className="text-[11px] text-text-muted italic mb-2">
              {usesManualDryMass
                ? 'Formule sols: VBS = (C × V)/m0. m0 est saisi manuellement pour chaque détermination. C depuis GR (passant 0/5 sur 0/50).'
                : 'Formule sols: m0 = (100 × Mhumide)/(100+w%); VBS = (C × V)/m0. C depuis GR (passant 0/5 sur 0/50).'}
            </p>
          )}
          {type === 'sols' && coeffCFromGR === null && (
            <p className="text-[11px] text-amber-700 mb-2">
              Coefficient C non disponible (GR avec passants 5mm et 50mm requis).
            </p>
          )}
          {readOnly ? (
            <VBSDisplay type={type} determinations={calcs} useManualDryMass={type === 'sols' && res.use_manual_dry_mass} />
          ) : (
            <VBSForm type={type} determinations={dets} humidityPercent={moisture.w}
              coeffCFromGR={coeffCFromGR} useManualDryMass={usesManualDryMass}
              onChange={onDet} addDet={addDet} removeDet={rmDet} />
          )}
          {!readOnly && (
            <div className="mt-3 text-[12px] text-text-muted">
              {type === 'granulats'
                ? `VBS moyen: ${vbsMean.length ? `${rnd(vbsMean.reduce((a,b)=>a+b,0)/vbsMean.length,1)} g/kg` : '—'}`
                : `VBS moyen: ${vbMean.length  ? `${rnd(vbMean.reduce((a,b)=>a+b,0)/vbMean.length,2)} g/100g` : '—'}`}
            </div>
          )}
        </Card>
      )}

    </div>
  )
}


function VBSForm({ type, determinations, humidityPercent, coeffCFromGR, useManualDryMass, onChange, addDet, removeDet }) {
  const [dets, setDets] = useState(determinations.length ? determinations : [
    { actif: true, numero: 1, m_echantillon: '', m_humide: '', v_bleu: '', c_bleu: '', m_seche: '' }
  ])

  useEffect(() => {
    setDets(determinations.length ? determinations : [
      { actif: true, numero: 1, m_echantillon: '', m_humide: '', v_bleu: '', c_bleu: '', m_seche: '' }
    ])
  }, [determinations])

  function updateDet(index, field, value) {
    const updated = dets.map((det, i) => i === index ? { ...det, [field]: value } : det)
    setDets(updated)
    onChange(index, field, value)
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">#</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'Masse échantillon (g)' : useManualDryMass ? 'Masse sèche (g)' : 'Masse humide (g)'}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Volume bleu (mL)</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'Conc. bleu (g/L)' : 'Coeff. C (0/5 sur 0/50)'}
              </th>
              {type === 'sols' && !useManualDryMass && (
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Masse sèche (g)</th>
              )}
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'VBS (g/kg)' : 'VBS (g/100g)'}
              </th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {dets.map((det, index) => {
              const calcs = calcVBS([det], type, humidityPercent, coeffCFromGR, useManualDryMass)[0]
              const result = type === 'granulats' ? calcs.vbs : calcs.vb

              return (
                <tr key={index} className="border-b border-border">
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={det.actif}
                      onChange={e => updateDet(index, 'actif', e.target.checked)}
                      className="w-4 h-4" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.01"
                      value={type === 'granulats' ? det.m_echantillon : useManualDryMass ? det.m_seche : det.m_humide}
                      onChange={e => updateDet(index, type === 'granulats' ? 'm_echantillon' : useManualDryMass ? 'm_seche' : 'm_humide', e.target.value)}
                      className="w-24 px-2 py-1 border border-border rounded text-sm"
                      placeholder="0.00" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step="0.1" value={det.v_bleu}
                      onChange={e => updateDet(index, 'v_bleu', e.target.value)}
                      className="w-20 px-2 py-1 border border-border rounded text-sm"
                      placeholder="0.0" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" step={type === 'granulats' ? '0.1' : '0.01'}
                      value={type === 'sols' && coeffCFromGR !== null ? coeffCFromGR : det.c_bleu}
                      onChange={e => updateDet(index, 'c_bleu', e.target.value)}
                      readOnly={type === 'sols' && coeffCFromGR !== null}
                      className="w-20 px-2 py-1 border border-border rounded text-sm"
                      placeholder={type === 'granulats' ? '0.0' : '1.00'} />
                  </td>
                  {type === 'sols' && !useManualDryMass && (
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" value={calcs.m_seche ?? ''}
                        readOnly
                        className="w-24 px-2 py-1 border border-border rounded text-sm bg-yellow-50"
                        placeholder="0.00" />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <span className={`text-sm font-bold ${result ? 'text-nge' : 'text-text-muted'}`}>
                      {result || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeDet(index)} className="text-danger hover:text-danger-dark text-sm px-2">×</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Button onClick={addDet} size="sm" variant="secondary">+ Ajouter une détermination</Button>
    </div>
  )
}

function VBSDisplay({ type, determinations, useManualDryMass }) {
  const valides = determinations.filter(d => d.actif && (d.vbs !== null || d.vb !== null))

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">#</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'Masse échantillon (g)' : useManualDryMass ? 'Masse sèche (g)' : 'Masse humide (g)'}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Volume bleu (mL)</th>
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'Conc. bleu (g/L)' : 'Coeff. C (0/5 sur 0/50)'}
              </th>
              {type === 'sols' && !useManualDryMass && (
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Masse sèche (g)</th>
              )}
              <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">
                {type === 'granulats' ? 'VBS (g/kg)' : 'VBS (g/100g)'}
              </th>
            </tr>
          </thead>
          <tbody>
            {valides.map((det, index) => (
              <tr key={index} className="border-b border-border">
                <td className="px-3 py-2 text-sm">{det.numero || index + 1}</td>
                <td className="px-3 py-2 text-sm">{type === 'granulats' ? det.m_echantillon : useManualDryMass ? det.m_seche : (det.m_humide || det.m_seche)}</td>
                <td className="px-3 py-2 text-sm">{det.v_bleu}</td>
                <td className="px-3 py-2 text-sm">{det.c_bleu}</td>
                {type === 'sols' && !useManualDryMass && <td className="px-3 py-2 text-sm">{det.m_seche}</td>}
                <td className="px-3 py-2"><span className="text-sm font-bold text-nge">{type === 'granulats' ? det.vbs : det.vb}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {valides.length === 0 && (
        <p className="text-[13px] text-text-muted italic text-center py-4">Aucune détermination valide</p>
      )}
    </div>
  )
}
