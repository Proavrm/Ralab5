import { useState } from 'react'
import { num, rnd } from '@/components/essais/essaiFormUi'
import { evalPoly2 } from '@/lib/pnEssai'
import { IPI_COLORS } from '@/lib/cbrEssai'

// ── ProctorChart — Dual Y-axis ────────────────────────────────────────────────
// Eixo Y esquerdo : ρd (Mg/m³) — courbe Proctor
// Eixo Y direito  : F (kN)     — résultats IPI/CBR à w% du point Proctor
// Eixo X          : w (%)      — partagé
export default function ProctorChart({ points, calcs, poly, wOPN, rhoOPN, correction, gs, ipiPoints = [] }) {
  const [yPad, setYPad] = useState(0.08)
  const [wPad, setWPad] = useState(1.5)
  const W=620, H=316, PL=52, PR=60, PT=18, PB=46
  const iW=W-PL-PR, iH=H-PT-PB
  const BG='#ffffff', GRID='#d4d2ca', TXT='#888', ACC='#3b82f6', OPT='#dc2626', CORR='#7c3aed', IPI_CLR='#ea580c'
  const CLIP_ID='proctor-clip'

  const validPts = points.map((p,i)=>({...p,...calcs[i]})).filter(p=>p.actif&&p.w!==null&&p.rho_d!==null)
  if (validPts.length < 1) return (
    <div className="flex items-center justify-center bg-bg border border-border rounded-lg" style={{ height: H }}>
      <span className="text-[12px] text-text-muted italic">Saisir les masses pour afficher la courbe</span>
    </div>
  )

  // ── Eixo Y esquerdo (ρd) ──────────────────────────────────────────────────
  const allW      = validPts.map(p => p.w)
  const allRho    = validPts.map(p => p.rho_d)
  const wExtras   = [
    ...(correction?.applicable && correction.w_corr!=null ? [correction.w_corr] : []),
    ...ipiPoints.filter(p=>p.w!=null).map(p=>p.w)
  ]
  const rhoExtras = [
    ...(correction?.applicable && correction.rho_corr!=null ? [correction.rho_corr] : []),
    ...ipiPoints.filter(p=>p.rho_d!=null).map(p=>p.rho_d)
  ]
  const wMin   = Math.min(...allW,  ...wExtras)   - wPad
  const wMax   = Math.max(...allW,  ...wExtras)   + wPad
  const rhoMin = Math.min(...allRho, ...rhoExtras) - yPad
  const rhoMax = Math.max(...allRho, ...rhoExtras) + yPad

  const xScale  = w => PL + (w-wMin)/(wMax-wMin)*iW
  const yScale  = r => PT + iH - (r-rhoMin)/(rhoMax-rhoMin)*iH
  const yClamp  = r => Math.max(PT, Math.min(PT+iH, yScale(r)))

  // ── Eixo Y direito (F kN) ─────────────────────────────────────────────────
  const ipiValid = ipiPoints.filter(p => p.w != null && p.f_kn != null)
  const fMax = ipiValid.length ? Math.max(...ipiValid.map(p=>p.f_kn)) * 1.3 : 10
  const fMin = 0
  const yScaleF = f => PT + iH - (f - fMin) / (fMax - fMin) * iH
  const fStep = fMax > 30 ? 5 : fMax > 10 ? 2 : 1
  const fTicks = []; for (let f=0; f<=fMax+0.01; f+=fStep) fTicks.push(rnd(f,1))

  // Sr curves
  const gsVal = num(gs) || 2.70
  function srPoints(sr) {
    const pts = []
    for (let w=wMin-1; w<=wMax+1; w+=0.2)
      pts.push({ w, rd: gsVal / (1 + gsVal*w/sr) })
    return pts
  }
  const sr100 = srPoints(100), sr80 = srPoints(80)
  const toLine = pts => pts.map(p=>`${xScale(p.w).toFixed(1)},${yScale(p.rd).toFixed(1)}`).join(' ')

  // Fit curve
  const fitPts = []
  if (poly) {
    const wDataMin = Math.min(...allW), wDataMax = Math.max(...allW)
    const minRho = Math.min(...allRho) - 0.01  // stop drawing when curve drops below lowest data point
    for (let w = wDataMin - 0.5; w <= wDataMax + 0.5; w += 0.05) {
      const rd = evalPoly2(poly, w)
      if (rd >= minRho) fitPts.push({w, rd})
    }
  }

  // Ticks Y gauche
  const rhoRange = rhoMax-rhoMin
  const yStep = rhoRange>0.45?0.1:rhoRange>0.2?0.05:0.02
  const yTicks=[]; for(let r=Math.ceil(rhoMin/yStep)*yStep; r<=rhoMax+0.001; r+=yStep) yTicks.push(rnd(r,3))
  // Ticks X
  const xRange = wMax-wMin
  const xStep = xRange>12?2:1
  const xTicks=[]; for(let w=Math.ceil(wMin/xStep)*xStep; w<=wMax+0.01; w+=xStep) xTicks.push(rnd(w,1))

  function srLabel(srPts) {
    const vis = srPts.filter(p=>p.rd>=rhoMin&&p.rd<=rhoMax&&p.w>=wMin&&p.w<=wMax)
    return vis.length ? vis.at(-1) : null
  }
  const lbl100=srLabel(sr100), lbl80=srLabel(sr80)
  const btnCls="px-1.5 py-0.5 text-[11px] border border-border rounded bg-bg hover:bg-surface text-text-muted leading-none select-none cursor-pointer"

  return (
    <div className="flex flex-col gap-1">
      {/* Boutons zoom */}
      <div className="flex items-center gap-3 justify-end pr-1 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">w (%) :</span>
          <button className={btnCls} onClick={()=>setWPad(p=>Math.max(0.3,rnd(p-0.5,1)))}>🔍+</button>
          <button className={btnCls} onClick={()=>setWPad(p=>Math.min(8,rnd(p+0.5,1)))}>🔍−</button>
          <span className="text-[10px] text-text-muted font-mono">±{wPad.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">ρd :</span>
          <button className={btnCls} onClick={()=>setYPad(p=>Math.max(0.02,rnd(p-0.04,2)))}>🔍+</button>
          <button className={btnCls} onClick={()=>setYPad(p=>Math.min(0.60,rnd(p+0.04,2)))}>🔍−</button>
          <span className="text-[10px] text-text-muted font-mono">±{yPad.toFixed(2)}</span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg">
        <defs>
          <clipPath id={CLIP_ID}><rect x={PL} y={PT} width={iW} height={iH}/></clipPath>
        </defs>
        <rect x={PL} y={PT} width={iW} height={iH} fill={BG} stroke={GRID} strokeWidth="1"/>

        {/* Grille Y gauche (ρd) */}
        {yTicks.map(r=>(
          <g key={r}>
            <line x1={PL} y1={yScale(r)} x2={PL+iW} y2={yScale(r)} stroke={GRID} strokeWidth="0.5" strokeDasharray="2,3"/>
            <text x={PL-5} y={yScale(r)+4} textAnchor="end" fontSize="9" fill={TXT}>{r.toFixed(2)}</text>
          </g>
        ))}
        {/* Grille X (w%) */}
        {xTicks.map(w=>(
          <g key={w}>
            <line x1={xScale(w)} y1={PT} x2={xScale(w)} y2={PT+iH} stroke={GRID} strokeWidth="0.5" strokeDasharray="2,3"/>
            <text x={xScale(w)} y={PT+iH+14} textAnchor="middle" fontSize="9" fill={TXT}>{w}</text>
          </g>
        ))}

        {/* Axe Y droit (F kN) — tirets + labels + ticks */}
        {ipiValid.length > 0 && fTicks.map(f=>(
          <g key={`f${f}`}>
            <text x={PL+iW+5} y={yScaleF(f)+4} textAnchor="start" fontSize="9" fill={IPI_CLR}>{f}</text>
          </g>
        ))}
        {ipiValid.length > 0 && (
          <>
            <line x1={PL+iW} y1={PT} x2={PL+iW} y2={PT+iH} stroke={IPI_CLR} strokeWidth="1" opacity="0.4"/>
            <text x={W-8} y={PT+iH/2} textAnchor="middle" fontSize="9" fill={IPI_CLR}
              transform={`rotate(90,${W-8},${PT+iH/2})`}>F (kN)</text>
          </>
        )}

        {/* Labels axes */}
        <text x={PL+iW/2} y={H-2} textAnchor="middle" fontSize="10" fill={TXT}>w (%)</text>
        <text x={12} y={PT+iH/2} textAnchor="middle" fontSize="10" fill={TXT} transform={`rotate(-90,12,${PT+iH/2})`}>ρd (Mg/m³)</text>

        {/* Sr=80% */}
        <polyline clipPath={`url(#${CLIP_ID})`} points={toLine(sr80)} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="5,3"/>
        {lbl80 && <text x={xScale(lbl80.w)-3} y={yScale(lbl80.rd)-5} fontSize="8" fill="#d97706" textAnchor="end">Sr=80%</text>}
        {/* Sr=100% */}
        <polyline clipPath={`url(#${CLIP_ID})`} points={toLine(sr100)} fill="none" stroke="#bbb" strokeWidth="1.5" strokeDasharray="6,3"/>
        {lbl100 && <text x={xScale(lbl100.w)-3} y={yScale(lbl100.rd)-5} fontSize="8" fill="#aaa" textAnchor="end">Sr=100%</text>}
        {/* Courbe ajustée */}
        {fitPts.length>1 && <polyline clipPath={`url(#${CLIP_ID})`} points={toLine(fitPts)} fill="none" stroke={ACC} strokeWidth="2.5" strokeLinejoin="round"/>}

        {/* OPN mesuré */}
        {wOPN!=null && rhoOPN!=null && (
          <g>
            <line clipPath={`url(#${CLIP_ID})`} x1={xScale(wOPN)} y1={yClamp(rhoOPN)} x2={xScale(wOPN)} y2={PT+iH} stroke={OPT} strokeWidth="1.5" strokeDasharray="4,2"/>
            <line clipPath={`url(#${CLIP_ID})`} x1={PL} y1={yClamp(rhoOPN)} x2={xScale(wOPN)} y2={yClamp(rhoOPN)} stroke={OPT} strokeWidth="1.5" strokeDasharray="4,2"/>
            <text x={xScale(wOPN)} y={PT+iH+30} textAnchor="middle" fontSize="8" fill={OPT} fontWeight="bold">wOPN={wOPN}%</text>
            <text x={PL-5} y={yClamp(rhoOPN)-4} textAnchor="end" fontSize="8" fill={OPT} fontWeight="bold">{rhoOPN}</text>
            <circle cx={xScale(wOPN)} cy={yClamp(rhoOPN)} r="5" fill={OPT} stroke="white" strokeWidth="1.5"/>
          </g>
        )}
        {/* OPN corrigé GTR */}
        {correction?.applicable && correction.w_corr!=null && correction.rho_corr!=null && (
          <g>
            <line clipPath={`url(#${CLIP_ID})`} x1={xScale(correction.w_corr)} y1={yClamp(correction.rho_corr)} x2={xScale(correction.w_corr)} y2={PT+iH} stroke={CORR} strokeWidth="1" strokeDasharray="3,2"/>
            <line clipPath={`url(#${CLIP_ID})`} x1={PL} y1={yClamp(correction.rho_corr)} x2={xScale(correction.w_corr)} y2={yClamp(correction.rho_corr)} stroke={CORR} strokeWidth="1" strokeDasharray="3,2"/>
            <circle cx={xScale(correction.w_corr)} cy={yClamp(correction.rho_corr)} r="4" fill={CORR} stroke="white" strokeWidth="1.5"/>
            <text x={xScale(correction.w_corr)} y={yClamp(correction.rho_corr)-9} textAnchor="middle" fontSize="7.5" fill={CORR} fontWeight="bold">OPN corr. 0/D</text>
          </g>
        )}
        {/* Points Proctor numérotés */}
        {validPts.map((p,i)=>(
          <g key={i}>
            <circle cx={xScale(p.w)} cy={yScale(p.rho_d)} r="5" fill={ACC} stroke="white" strokeWidth="1.5"/>
            <text x={xScale(p.w)} y={yScale(p.rho_d)-9} textAnchor="middle" fontSize="8" fill={ACC} fontWeight="bold">{p.id}</text>
          </g>
        ))}

        {/* Points IPI/CBR — ligne + diamants sur axe Y droit (F kN) */}
        {ipiValid.length >= 2 && (() => {
          const sorted = [...ipiValid].sort((a,b) => a.w - b.w)
          const linePts = sorted.map(p => {
            const cx = xScale(p.w)
            const cy = Math.max(PT, Math.min(PT+iH, yScaleF(p.f_kn)))
            return `${cx.toFixed(1)},${cy.toFixed(1)}`
          }).join(' ')
          return <polyline clipPath={`url(#${CLIP_ID})`} points={linePts}
            fill="none" stroke={IPI_CLR} strokeWidth="1.5" strokeDasharray="4,2" opacity="0.7"/>
        })()}
        {ipiValid.map((p, i) => {
          const cx = xScale(p.w)
          const cy = yScaleF(p.f_kn)
          const s = 6
          const cyC = Math.max(PT, Math.min(PT+iH, cy))
          const color = IPI_COLORS[i % IPI_COLORS.length]
          return (
            <g key={i}>
              <polygon
                points={`${cx},${cyC-s} ${cx+s},${cyC} ${cx},${cyC+s} ${cx-s},${cyC}`}
                fill={color} stroke="white" strokeWidth="1.5" clipPath={`url(#${CLIP_ID})`}/>
              <text x={cx} y={cyC-s-3} textAnchor="middle" fontSize="8" fill={color} fontWeight="bold">
                {p.label}{p.ipi != null ? ` ${p.ipi}%` : p.f_kn != null ? ` ${p.f_kn}kN` : ''}
              </text>
            </g>
          )
        })}
      </svg>

    </div>
  )
}
