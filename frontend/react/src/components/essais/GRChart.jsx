import { calcCuCc } from '@/lib/grEssai'

export default function GRChart({ calcs }) {
  const W = 560, H = 300, PL = 45, PR = 15, PT = 15, PB = 45
  const iW = W - PL - PR, iH = H - PT - PB
  const BG = '#ffffff', GRID = '#d4d2ca', TXT = '#888', ACC = '#3b82f6'
  const { d10, d30, d60 } = calcCuCc(calcs)
  const points = (Array.isArray(calcs) ? calcs : []).filter((t) => t.passant !== null && t.d != null)
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center bg-bg border border-border rounded-lg" style={{ height: H }}>
        <span className="text-[12px] text-text-muted italic">Saisir les refus pour afficher la courbe</span>
      </div>
    )
  }
  const xMin = Math.log10(0.063), xMax = Math.log10(200)
  const xScale = (d) => PL + ((Math.log10(d) - xMin) / (xMax - xMin)) * iW
  const yScale = (p) => PT + iH - (p / 100) * iH
  const xTicks = [0.08, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200]
  const allLogValues = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const logGridlines = allLogValues.filter((d) => !xTicks.includes(d) && d >= 0.063 && d <= 200)
  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const linePoints = points.map((t) => `${xScale(t.d).toFixed(1)},${yScale(t.passant).toFixed(1)}`).join(' ')
  const dLines = [
    { d: d10, p: 10, color: '#7c3aed', label: 'D10' },
    { d: d30, p: 30, color: '#ca8a04', label: 'D30' },
    { d: d60, p: 60, color: '#16a34a', label: 'D60' },
  ].filter((x) => x.d !== null)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg overflow-visible">
      <rect x={PL} y={PT} width={iW} height={iH} fill={BG} stroke={GRID} strokeWidth="1" />
      {yTicks.map((p) => (
        <g key={p}>
          <line x1={PL} y1={yScale(p)} x2={PL + iW} y2={yScale(p)} stroke={GRID} strokeWidth={p === 0 || p === 100 ? 1 : 0.5} strokeDasharray={p % 20 === 0 ? 'none' : '2,3'} />
          <text x={PL - 5} y={yScale(p) + 4} textAnchor="end" fontSize="9" fill={TXT}>{p}</text>
        </g>
      ))}
      {logGridlines.map((d) => (
        <line key={`log-${d}`} x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT + iH} stroke={GRID} strokeWidth="0.5" opacity="0.5" />
      ))}
      {xTicks.map((d) => (
        <g key={d}>
          <line x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT + iH} stroke={GRID} strokeWidth="1" strokeDasharray="none" opacity="0.6" />
          <text x={xScale(d)} y={PT + iH + 14} textAnchor="middle" fontSize="8" fill="#999999">{d}</text>
        </g>
      ))}
      <text x={PL + iW / 2} y={H - 2} textAnchor="middle" fontSize="10" fill={TXT}>Tamis (mm) — échelle log</text>
      <text x={10} y={PT + iH / 2} textAnchor="middle" fontSize="10" fill={TXT} transform={`rotate(-90, 10, ${PT + iH / 2})`}>Passant (%)</text>
      <polyline points={linePoints} fill="none" stroke={ACC} strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((t) => (
        <text key={t.d} x={xScale(t.d)} y={yScale(t.passant) - 7} textAnchor="middle" fontSize="8" fill={ACC}>{t.passant}</text>
      ))}
      <line x1={xScale(0.08)} y1={PT} x2={xScale(0.08)} y2={PT + iH} stroke="#dc2626" strokeWidth="1" strokeDasharray="4,2" />
      <text x={xScale(0.08) + 3} y={PT + 12} fontSize="8" fill="#dc2626">80µm</text>
      {dLines.map(({ d, p, color, label }) => (
        <g key={label}>
          <line x1={xScale(d)} y1={yScale(p)} x2={xScale(d)} y2={PT + iH} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
          <line x1={PL} y1={yScale(p)} x2={xScale(d)} y2={yScale(p)} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
          <text x={xScale(d)} y={PT + iH + 26} textAnchor="middle" fontSize="8" fill={color} fontWeight="bold">{label}</text>
        </g>
      ))}
    </svg>
  )
}
