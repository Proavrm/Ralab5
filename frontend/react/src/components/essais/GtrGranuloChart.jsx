import { useId } from 'react'

const NGE = '#003170'
const MUTED = '#69758a'
const GRID = '#e6ebf2'
const GRID_MAJOR = '#d0d7e2'
const INK = '#172033'
const PAPER = '#ffffff'

function xOf(d, PL, iW, xMin, xMax) {
  const safe = Math.max(d, 0.063)
  return PL + ((Math.log10(safe) - xMin) / (xMax - xMin)) * iW
}

function yOf(p, PT, iH) {
  return PT + iH - (Math.max(0, Math.min(100, p)) / 100) * iH
}

function densify(points) {
  const sorted = [...points].sort((a, b) => a.d - b.d)
  if (sorted.length < 2) return sorted
  const out = []
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]
    const b = sorted[i + 1]
    const logA = Math.log10(a.d)
    const logB = Math.log10(b.d)
    const steps = 18
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      out.push({
        d: 10 ** (logA + (logB - logA) * t),
        passant: a.passant + (b.passant - a.passant) * t,
      })
    }
  }
  out.push(sorted[sorted.length - 1])
  return out
}

export default function GtrGranuloChart({ calcs }) {
  const clipId = `gtr-granulo-${useId().replace(/:/g, '')}`
  const W = 840
  const H = 420
  const PL = 58
  const PR = 86
  const PT = 28
  const PB = 62
  const iW = W - PL - PR
  const iH = H - PT - PB
  const xMin = Math.log10(0.063)
  const xMax = Math.log10(200)
  const xScale = (d) => xOf(d, PL, iW, xMin, xMax)
  const yScale = (p) => yOf(p, PT, iH)

  const points = (Array.isArray(calcs) ? calcs : [])
    .map((row) => ({ d: Number(row?.d), passant: Number(row?.passant) }))
    .filter((row) => Number.isFinite(row.d) && Number.isFinite(row.passant))
    .sort((a, b) => a.d - b.d)

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center rounded-[12px] border border-border bg-bg" style={{ height: 280 }}>
        <span className="text-[12px] italic text-text-muted">La feuille GR du même échantillon est nécessaire pour tracer la courbe.</span>
      </div>
    )
  }

  const smooth = densify(points)
  const line = smooth.map((row) => `${xScale(row.d).toFixed(1)},${yScale(row.passant).toFixed(1)}`).join(' ')
  const area = [
    `${xScale(points[0].d).toFixed(1)},${yScale(0).toFixed(1)}`,
    ...smooth.map((row) => `${xScale(row.d).toFixed(1)},${yScale(row.passant).toFixed(1)}`),
    `${xScale(points[points.length - 1].d).toFixed(1)},${yScale(0).toFixed(1)}`,
  ].join(' ')

  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const xMajor = [0.08, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200]
  const xMinor = [0.1, 0.3, 0.4, 0.6, 0.8, 3, 4, 6, 8, 30, 40, 60, 80]
  const gtrCuts = [
    { p: 35, label: '35 %  A / B' },
    { p: 12, label: '12 %' },
    { p: 5, label: '5 %  D' },
  ]
  const workSieves = [0.08, 2, 20, 50]

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible" role="img" aria-label="Courbe granulométrique GTR">
      <defs>
        <clipPath id={clipId}>
          <rect x={PL} y={PT} width={iW} height={iH} />
        </clipPath>
      </defs>

      <rect x={PL} y={PT} width={iW} height={iH} fill={PAPER} stroke={GRID_MAJOR} />

      <rect x={xScale(0.08)} y={PT} width={Math.max(0, xScale(2) - xScale(0.08))} height={iH} fill={NGE} opacity="0.035" />
      <rect x={xScale(2)} y={PT} width={Math.max(0, xScale(50) - xScale(2))} height={iH} fill={NGE} opacity="0.018" />

      {yTicks.map((p) => (
        <g key={`y-${p}`}>
          <line
            x1={PL}
            y1={yScale(p)}
            x2={PL + iW}
            y2={yScale(p)}
            stroke={p === 0 || p === 50 || p === 100 ? GRID_MAJOR : GRID}
            strokeWidth={p === 0 || p === 100 ? 1 : 0.8}
          />
          <text x={PL - 8} y={yScale(p) + 3.5} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="system-ui, sans-serif">{p}</text>
        </g>
      ))}

      {xMinor.map((d) => (
        <line key={`xm-${d}`} x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT + iH} stroke={GRID} strokeWidth="0.7" />
      ))}
      {xMajor.map((d) => (
        <g key={`x-${d}`}>
          <line x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT + iH} stroke={GRID_MAJOR} strokeWidth="0.9" />
          <text x={xScale(d)} y={PT + iH + 16} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="system-ui, sans-serif">{d === 0.08 ? '0,08' : d}</text>
        </g>
      ))}

      {gtrCuts.map((cut) => (
        <g key={`cut-${cut.p}`}>
          <line x1={PL} y1={yScale(cut.p)} x2={PL + iW} y2={yScale(cut.p)} stroke={NGE} strokeWidth={cut.p === 35 ? 1.1 : 0.8} strokeDasharray="4 4" opacity={cut.p === 35 ? 0.55 : 0.28} />
          <text x={PL + iW + 8} y={yScale(cut.p) + 3.5} fontSize="9" fill={NGE} opacity={cut.p === 35 ? 0.9 : 0.55} fontFamily="system-ui, sans-serif">{cut.label}</text>
        </g>
      ))}

      {workSieves.map((d) => (
        <line key={`ws-${d}`} x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT + iH} stroke={NGE} strokeWidth={d === 0.08 ? 1.2 : 0.8} strokeDasharray={d === 0.08 ? '5 3' : '2 4'} opacity={d === 0.08 ? 0.45 : 0.18} />
      ))}

      <g clipPath={`url(#${clipId})`}>
        <polygon points={area} fill={NGE} opacity="0.10" />
        <polyline points={line} fill="none" stroke={NGE} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      </g>

      {points.map((row) => {
        const work = workSieves.some((d) => Math.abs(d - row.d) < 1e-9)
        return (
          <g key={`pt-${row.d}`}>
            <circle cx={xScale(row.d)} cy={yScale(row.passant)} r={work ? 5.5 : 3.2} fill={PAPER} stroke={NGE} strokeWidth={work ? 2 : 1.4} />
          </g>
        )
      })}

      <text x={(xScale(0.08) + xScale(2)) / 2} y={H - 14} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="system-ui, sans-serif" letterSpacing="0.12em">SABLES</text>
      <text x={xScale(2) + (xScale(50) - xScale(2)) / 2} y={H - 14} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="system-ui, sans-serif" letterSpacing="0.12em">GRAVES</text>
      <text x={PL + iW / 2} y={H - 1} textAnchor="middle" fontSize="11" fill={INK} fontFamily="system-ui, sans-serif">Ouverture de tamis (mm) — échelle logarithmique</text>
      <text x="16" y={PT + iH / 2} textAnchor="middle" fontSize="11" fill={INK} fontFamily="system-ui, sans-serif" transform={`rotate(-90 16 ${PT + iH / 2})`}>Passant (%)</text>
      <text x={xScale(0.08) + 6} y={PT + 14} fontSize="10" fill={NGE} fontFamily="system-ui, sans-serif">80 µm</text>
    </svg>
  )
}
