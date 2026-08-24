import { rnd } from '@/components/essais/essaiFormUi'
import {
  IPI_DEPTHS,
  IPI_COLORS,
  getPenetrationForcePoints,
  interpolatePenetrationForce,
  resolveCorrectionInfo,
  calcIPIFromLectures,
} from '@/lib/cbrEssai'

export default function IPIChart({ tests, testCalcs, height=820, readOnly=false }) {
  const W=480, H=height??820, PL=58, PR=90, PT=32, PB=60
  const iW=W-PL-PR, iH=H-PT-PB
  const BG='#ffffff', GRID='#d4d2ca', TXT='#888'
  const CLIP='ipi-chart-clip'
  const allTests = Array.isArray(tests) ? tests : []
  const hasData = allTests.some(t => getPenetrationForcePoints(t.lectures).length > 0)
  if (!hasData) return (
    <div className="flex items-center justify-center bg-bg border border-border rounded-lg" style={{height:300}}>
      <span className="text-[12px] text-text-muted italic">Aucun relevé de force disponible pour cette fiche historique</span>
    </div>
  )
  const allF = allTests.flatMap((t, ti) => getPenetrationForcePoints(testCalcs?.[ti]?.lectures || t.lectures).map(p => p.f))
  const fMax = allF.length ? Math.max(...allF) * 1.18 : 10
  const dMax = 12
  const xScale = d => PL + (d / dMax) * iW
  const yScale = f => PT + iH - (f / fMax) * iH
  const yClip = f => Math.max(PT, Math.min(PT+iH, yScale(f)))
  const xTicks = [0, ...IPI_DEPTHS]
  const fStep = fMax > 50 ? 10 : fMax > 20 ? 5 : fMax > 10 ? 2 : 1
  const yTicks = []
  for (let f=0; f<=fMax+0.01; f+=fStep) yTicks.push(rnd(f,1))
  return (
    <svg width="100%" height={height===null ? '100%' : undefined} viewBox={`0 0 ${W} ${H}`} className="rounded-lg">
      <defs><clipPath id={CLIP}><rect x={PL} y={PT} width={iW} height={iH}/></clipPath></defs>
      <rect x={PL} y={PT} width={iW} height={iH} fill={BG} stroke={GRID} strokeWidth="1"/>
      {yTicks.map(f => <g key={f}><line x1={PL} y1={yScale(f)} x2={PL+iW} y2={yScale(f)} stroke={GRID} strokeWidth="0.5" strokeDasharray="2,3"/><text x={PL-5} y={yScale(f)+4} textAnchor="end" fontSize="10" fill={TXT}>{f}</text></g>)}
      {xTicks.map(d => <g key={d}><line x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT+iH} stroke={d===2.5||d===5.0?'#94a3b8':GRID} strokeWidth={d===2.5||d===5.0?1.2:0.5} strokeDasharray="2,3"/><text x={xScale(d)} y={PT+iH+20} textAnchor="middle" fontSize="10" fill={d===2.5||d===5.0?'#475569':TXT} fontWeight={d===2.5||d===5.0?'bold':'normal'}>{d}</text></g>)}
      <line x1={PL} y1={PT+iH} x2={PL+iW} y2={PT+iH} stroke="#999" strokeWidth="1"/>
      <text x={PL+iW/2} y={H-10} textAnchor="middle" fontSize="11" fill={TXT}>Profondeur de pénétration (mm)</text>
      <text x={14} y={PT+iH/2} textAnchor="middle" fontSize="11" fill={TXT} transform={`rotate(-90,14,${PT+iH/2})`}>Force F (kN)</text>
      <text x={xScale(2.5)} y={PT+16} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="bold">2.5★</text>
      <text x={xScale(5.0)} y={PT+16} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="bold">5.0★</text>
      {allTests.map((t, ti) => {
        const color = IPI_COLORS[ti % IPI_COLORS.length]
        // Utiliser les lectures converties (kN) depuis testCalcs quand disponibles
        const calc = testCalcs?.[ti] || calcIPIFromLectures(t.lectures, t)
        const lectures = calc?.lectures || t.lectures
        const pts = getPenetrationForcePoints(lectures)
        if (pts.length < 2) return null
        // Courbe brute — commence à l'origine (0,0) sauf en log (log(0) invalide)
        const drawPts = [{d:0, f:0}, ...pts]
        const lineStr = drawPts.map(p => `${xScale(p.d).toFixed(1)},${yClip(p.f).toFixed(1)}`).join(' ')
        const corr = calc?.correction_line || resolveCorrectionInfo(lectures, t)
        const d0 = calc?.delta0_used || corr.delta0 || 0
        // Courbe corrigée = courbe originale décalée de -δ₀ sur l'axe X (norme NF P 94-078)
        let corrPts = null
        if (d0 > 0.01) {
          const shiftedPts = drawPts
            .map(p => ({ d: p.d - d0, f: p.f }))
            .filter(p => p.d >= 0)
          if (shiftedPts.length > 0 && shiftedPts[0].d > 0) {
            shiftedPts.unshift({ d: 0, f: 0 })
          }
          if (shiftedPts.length >= 2) {
            corrPts = shiftedPts.map(p => `${xScale(p.d).toFixed(1)},${yClip(p.f).toFixed(1)}`).join(' ')
          }
        }
        const f25r = interpolatePenetrationForce(pts, 2.5)
        const f50r = interpolatePenetrationForce(pts, 5.0)
        // Valeurs corrigées: lire à 2.5+d0 et 5.0+d0 sur la courbe originale
        const f25c = d0 > 0 ? interpolatePenetrationForce(pts, 2.5 + d0) : null
        const f50c = d0 > 0 ? interpolatePenetrationForce(pts, 5.0 + d0) : null
        const labelY = 24 + ti * 22
        // Droite de correction: depuis (d0,0) prolongée au-delà de x2
        // En mode line: passe exactement par (x1,y1) et (x2,y2), prolongée des deux côtés
        // En mode auto: depuis (d0,0) jusqu'à un point visible
        let tangentPts = null
        if (corr?.slope && d0 > 0.01) {
          const xEnd = corr?.x2 !== null ? Math.min(dMax, corr.x2 + 1.5) : Math.min(dMax, (corr?.x1 ?? 2) + 3)
          const yEnd = corr.slope * (xEnd - d0)
          tangentPts = `${xScale(d0).toFixed(1)},${yScale(0).toFixed(1)} ${xScale(xEnd).toFixed(1)},${yClip(Math.max(0,yEnd)).toFixed(1)}`
        }
        // Points de la droite manuelle sur la courbe (low/high)
        const hasManualLine = corr?.mode === 'line' && corr?.x1 !== null && corr?.x2 !== null && corr?.y1 !== null && corr?.y2 !== null
        // En readOnly: courbe corrigée uniquement (ou brute si pas de correction)
        const displayPts = (readOnly && corrPts) ? corrPts : lineStr
        const show25 = readOnly ? (d0>0.01 ? f25c : f25r) : f25r
        const show50 = readOnly ? (d0>0.01 ? f50c : f50r) : f50r
        return <g key={ti}>
          {/* Courbe principale */}
          <polyline clipPath={`url(#${CLIP})`} points={displayPts} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/>
          {/* En mode édition: courbe brute + correction */}
          {!readOnly && corrPts && <polyline clipPath={`url(#${CLIP})`} points={corrPts} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4,3" opacity="0.6"/>}
          {!readOnly && tangentPts && <polyline clipPath={`url(#${CLIP})`} points={tangentPts} fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="8,4" opacity="0.7"/>}
          {!readOnly && hasManualLine && <circle cx={xScale(corr.x1)} cy={yClip(corr.y1)} r="4" fill="white" stroke={color} strokeWidth="2" clipPath={`url(#${CLIP})`}/>}
          {!readOnly && hasManualLine && <circle cx={xScale(corr.x2)} cy={yClip(corr.y2)} r="4" fill="white" stroke={color} strokeWidth="2" clipPath={`url(#${CLIP})`}/>}
          {!readOnly && d0 > 0.01 && <g>
            <line x1={xScale(d0)} y1={PT+iH-4} x2={xScale(d0)} y2={PT+iH+6} stroke={color} strokeWidth="2"/>
            <text x={xScale(d0)} y={PT+iH+(26+ti*10)} textAnchor="middle" fontSize="9" fill={color} fontWeight="bold">δ₀={rnd(d0,2)}</text>
          </g>}
          {/* Marqueurs 2.5★ et 5.0★ */}
          {show25!==null && <circle cx={xScale(2.5)} cy={yClip(show25)} r="4" fill={color} stroke="white" strokeWidth="1.5" clipPath={`url(#${CLIP})`}/>}
          {show50!==null && <circle cx={xScale(5.0)} cy={yClip(show50)} r="4" fill={color} stroke="white" strokeWidth="1.5" clipPath={`url(#${CLIP})`}/>}
          {/* En édition: marqueurs corrigés en carrés */}
          {!readOnly && d0 > 0.01 && f25c!==null && <rect x={xScale(2.5)-4} y={yClip(f25c)-4} width="8" height="8" fill="none" stroke={color} strokeWidth="2" clipPath={`url(#${CLIP})`}/>}
          {!readOnly && d0 > 0.01 && f50c!==null && <rect x={xScale(5.0)-4} y={yClip(f50c)-4} width="8" height="8" fill="none" stroke={color} strokeWidth="2" clipPath={`url(#${CLIP})`}/>}
          <text x={PL+iW+6} y={PT+labelY} fontSize="10" fill={color} fontWeight="bold">P{t.pn_point_id||ti+1}{d0>0.01?' ✓':''}</text>
        </g>
      })}
    </svg>
  )
}
