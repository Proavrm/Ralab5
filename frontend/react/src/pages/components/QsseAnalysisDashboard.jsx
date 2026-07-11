import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import PptxGenJS from 'pptxgenjs'
import { useChartFilter } from './useChartFilter'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  LabelList,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts'
import { qualiteApi } from '@/services/api'

const FMT_EURO = (v) => (v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`)

const NGE_BLUE = '#003170'
const NGE_YELLOW = '#ffcc00'
const NGE_BLUE_MID = '#4A7DB5'
const NGE_BLUE_LIGHT = '#eef5ff'
const NGE_BLUE_DARK = '#00224f'
const NGE_YELLOW_LIGHT = '#fff3cc'
const NGE_YELLOW_DARK = '#e6b900'

const CODIR_THEME = {
  fontFamily: 'Segoe UI Variable, Segoe UI, Inter, Roboto, sans-serif',
  text: '#253041',
  muted: '#5b6b82',
  grid: '#dce3ec',
  fnc: NGE_BLUE,
  fncSoft: NGE_BLUE_MID,
  ngeYellow: NGE_YELLOW,
  ngeYellowSoft: NGE_YELLOW_LIGHT,
  pasd: NGE_YELLOW,
  at: NGE_BLUE_MID,
  bp: '#8FA9CC',
  blueDark: NGE_BLUE_DARK,
  blueLight: NGE_BLUE_LIGHT,
  yellowDark: NGE_YELLOW_DARK,
  accent: NGE_BLUE,
}

const CHART_TICK = {
  fontSize: 12,
  fill: CODIR_THEME.muted,
  fontWeight: 700,
  fontFamily: CODIR_THEME.fontFamily,
}

const LEGEND_STYLE = {
  fontSize: 12,
  color: CODIR_THEME.muted,
  fontFamily: CODIR_THEME.fontFamily,
  fontWeight: 700,
}

const PPTX_SLIDE_WIDTH = 13.333
const PPTX_SLIDE_HEIGHT = 7.5

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

async function waitForFontsReady() {
  try {
    await document.fonts?.ready
  } catch {
    // Ignore font readiness failures and continue with export.
  }
}

function collectExportTargets(root, yearLabel) {
  const targets = []
  const kpiStrip = root.querySelector('.qad-kpi-strip')
  if (kpiStrip) {
    targets.push({
      kind: 'kpi',
      title: `KPI FNC — ${yearLabel}`,
      node: kpiStrip,
    })
  }

  for (const node of root.querySelectorAll('.qad-chart-card')) {
    if (!node.querySelector('.recharts-wrapper')) continue
    const title = String(node.querySelector('.qad-section-title')?.textContent || '').trim() || 'Graphique QSSE'
    targets.push({ kind: 'chart', title, node })
  }

  return targets
}

function loadImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
    image.onerror = () => reject(new Error('Impossible de lire l’image exportée.'))
    image.src = dataUrl
  })
}

function fitIntoBox(boxWidth, boxHeight, imageWidth, imageHeight) {
  const safeImageWidth = Math.max(1, Number(imageWidth || 1))
  const safeImageHeight = Math.max(1, Number(imageHeight || 1))
  const scale = Math.min(boxWidth / safeImageWidth, boxHeight / safeImageHeight)
  const width = safeImageWidth * scale
  const height = safeImageHeight * scale
  return {
    width,
    height,
    offsetX: (boxWidth - width) / 2,
    offsetY: (boxHeight - height) / 2,
  }
}

function buildExportFileName(year) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const scope = year ? String(year) : 'ALL'
  return `QSSE_analyse_${scope}_${stamp}.pptx`
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="qad-tooltip">
      {label != null && <div className="qad-tooltip-label">{label}</div>}
      {payload.map((entry) => (
        <div key={entry.dataKey || entry.name} className="qad-tooltip-row">
          <span className="qad-tooltip-dot" style={{ background: entry.color || CODIR_THEME.muted }} />
          <span>{entry.name}</span>
          <strong>
            {entry.dataKey === 'cost' ? FMT_EURO(Number(entry.value || 0)) : Number(entry.value || 0)}
          </strong>
        </div>
      ))}
    </div>
  )
}

function KpiCard({ label, value, sub }) {
  return (
    <div className="qad-kpi-card">
      <div className="qad-kpi-value">{value}</div>
      <div className="qad-kpi-label">{label}</div>
      {sub && <div className="qad-kpi-sub">{sub}</div>}
    </div>
  )
}

function SectionHead({ title, count }) {
  return (
    <div className="qad-section-head">
      <span className="qad-section-title">{title}</span>
      {count != null && <span className="qad-section-count">{count}</span>}
    </div>
  )
}

function ChartFilterPanel({ items, visibleItems, toggleItem, moveItem, label = "Filtres" }) {
  return (
    <div className="qad-filter-panel">
      <div className="qad-filter-title">{label}</div>
      <div className="qad-filter-list">
        {items.map((item, idx) => (
          <div key={item} className="qad-filter-item">
            <label>
              <input
                type="checkbox"
                checked={visibleItems.includes(item)}
                onChange={() => toggleItem(item)}
              />
              <span>{item}</span>
            </label>
            <div className="qad-filter-buttons">
              <button
                title="Haut"
                onClick={() => moveItem(item, 'up')}
                disabled={idx === 0}
                className="qad-filter-btn"
              >
                ↑
              </button>
              <button
                title="Bas"
                onClick={() => moveItem(item, 'down')}
                disabled={idx === items.length - 1}
                className="qad-filter-btn"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const AGENCY_COLORS = [
  '#003170', '#1f4f95', '#3266aa', '#4a7db5', '#7098ca',
  '#ffcc00', '#e6b900', '#c49f2f', '#9a7b13', '#83680d',
  '#8FA9CC', '#eef5ff', '#fff3cc',
]

const INDICATOR_COLORS = {
  FNC: CODIR_THEME.fnc,
  PASD: CODIR_THEME.pasd,
  AT: CODIR_THEME.at,
  BP: CODIR_THEME.bp,
  FAE: CODIR_THEME.fncSoft,
}

export default function QsseAnalysisDashboard({ year, includeBacklog = true, backlogYear }) {
  const rootRef = useRef(null)
  const params = year
    ? { year, include_backlog: includeBacklog }
    : { include_backlog: includeBacklog, backlog_year: backlogYear }
  const [visibleCharts, setVisibleCharts] = useState({
    mix: true,
    closure: true,
    costAnalysis: true,
    fncByAgency: true,
    fncCost: true,
    pasdMonthly: true,
    quarterly: true,
    yoy: year ? true : false,
    safety: true,
    bp: true,
    fae: true,
    pasdByAgency: true,
    atByAgency: true,
  })
  const [isExporting, setIsExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState(null)

  const toggleChart = (key) => {
    setVisibleCharts((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'qsse-analysis-stats',
      year ?? 'ALL',
      includeBacklog ? 'WITH_BACKLOG' : 'WITHOUT_BACKLOG',
      backlogYear ?? 'NO_BACKLOG_YEAR',
    ],
    queryFn: () => qualiteApi.qsse.analysisStats(params),
    staleTime: 60_000,
  })

  const safeData = data || {}
  const fnc = safeData.fnc || { total: 0, closed: 0, open: 0, cost_total: 0, with_cost_analysis: 0, without_cost_analysis: 0, by_agency: [], by_quarter: [] }
  const pasd = safeData.pasd || { total: 0, by_agency: [], by_month: [], by_quarter: [] }
  const at = safeData.at || { total: 0, by_agency: [], by_quarter: [] }
  const bp = safeData.bp || { total: 0, by_agency: [], by_quarter: [] }
  const fae = safeData.fae || { total: 0, by_agency: [], by_quarter: [] }
  const by_agency_all = safeData.by_agency_all || []
  const year_over_year = safeData.year_over_year || null

  // Filtres para indicadores
  const quarterlyFilter = useChartFilter('qad-quarterly-indicators', ['FNC', 'PASD', 'AT', 'BP', 'FAE'])
  const yoyFilter = useChartFilter('qad-yoy-indicators', ['FNC', 'PASD', 'AT', 'BP', 'FAE'])

  // Filtres para agências (top 12)
  const fncAgencyNames = (fnc.by_agency || []).slice(0, 12).map((d) => d.agency)
  const fncAgencyFilter = useChartFilter('qad-fnc-agencies', fncAgencyNames)

  const pasdAgencyNames = (pasd.by_agency || []).slice(0, 10).map((d) => d.agency)
  const pasdAgencyFilter = useChartFilter('qad-pasd-agencies', pasdAgencyNames)

  const atAgencyNames = (at.by_agency || []).slice(0, 10).map((d) => d.agency)
  const atAgencyFilter = useChartFilter('qad-at-agencies', atAgencyNames)

  const bpAgencyNames = (bp.by_agency || []).slice(0, 10).map((d) => d.agency)
  const bpAgencyFilter = useChartFilter('qad-bp-agencies', bpAgencyNames)

  const faeAgencyNames = (fae?.by_agency || []).slice(0, 10).map((d) => d.agency)
  const faeAgencyFilter = useChartFilter('qad-fae-agencies', faeAgencyNames)

  if (isLoading) return <div className="qad-loading">Chargement des statistiques…</div>
  if (isError || !data) return <div className="qad-error">Impossible de charger les statistiques.</div>

  const closureRate = fnc.total ? Math.round((fnc.closed / fnc.total) * 100) : 0
  const costAnalysisRate = fnc.total ? Math.round((Number(fnc.with_cost_analysis || 0) / fnc.total) * 100) : 0
  const yearLabel = year ? String(year) : 'toutes années'
  const costAnalysisData = [
    { name: 'Avec analyse', total: Number(fnc.with_cost_analysis || 0), fill: CODIR_THEME.fnc },
    { name: 'Sans analyse', total: Number(fnc.without_cost_analysis || 0), fill: CODIR_THEME.ngeYellow },
  ]
  const registerMixData = [
    { name: 'FNC', value: Number(fnc.total || 0), fill: INDICATOR_COLORS.FNC },
    { name: 'PASD', value: Number(pasd.total || 0), fill: INDICATOR_COLORS.PASD },
    { name: 'AT', value: Number(at.total || 0), fill: INDICATOR_COLORS.AT },
    { name: 'BP', value: Number(bp.total || 0), fill: INDICATOR_COLORS.BP },
    { name: 'FAE', value: Number(fae?.total || 0), fill: INDICATOR_COLORS.FAE },
  ].filter((item) => item.value > 0)

  const closureGaugeData = [{ name: 'Clôture', value: closureRate, fill: CODIR_THEME.ngeYellow }]
  
  // Quarterly data — all indicators
  const quarterlyData = (fnc.by_quarter || []).map((q, i) => {
    const pasdQ = (pasd.by_quarter || []).find(pq => pq.quarter === q.quarter)?.total ?? 0
    const atQ = (at.by_quarter || []).find(aq => aq.quarter === q.quarter)?.total ?? 0
    const bpQ = (bp.by_quarter || []).find(bq => bq.quarter === q.quarter)?.total ?? 0
    const faeQ = (fae.by_quarter || []).find(fq => fq.quarter === q.quarter)?.total ?? 0
    return {
      quarter: q.quarter.split('-')[1], // "Q1", "Q2", etc.
      FNC: q.total,
      PASD: pasdQ,
      AT: atQ,
      BP: bpQ,
      FAE: faeQ,
    }
  })
  
  // Year-over-year comparison
  const yoyComparison = year_over_year && year_over_year.previous_year ? [
    { indicator: 'FNC', current: fnc.total, previous: year_over_year.fnc_total_prev || 0 },
    { indicator: 'PASD', current: pasd.total, previous: year_over_year.pasd_total_prev || 0 },
    { indicator: 'AT', current: at.total, previous: year_over_year.at_total_prev || 0 },
    { indicator: 'BP', current: bp.total, previous: year_over_year.bp_total_prev || 0 },
    { indicator: 'FAE', current: fae?.total || 0, previous: year_over_year.fae_total_prev || 0 },
  ] : null

  // FNC by agency — top 12
  const fncAgencyData = (fnc.by_agency || []).slice(0, 12).map((d) => ({
    name: d.agency,
    Clôturées: d.closed,
    'En cours': d.open,
    cost: d.cost,
  }))

  // Keep full cost coverage (no top-N cut) to avoid hiding agencies in the cost chart.
  const fncCostData = (fnc.by_agency || [])
    .filter((d) => Number(d.cost || 0) > 0)
    .map((d) => ({ name: d.agency, cost: d.cost }))
  const fncCostChartHeight = Math.max(220, fncCostData.length * 34)

  // PASD monthly
  const pasdMonthData = (pasd.by_month || []).slice(-18).map((d) => ({
    name: d.month.slice(2), // "26-01"
    PASD: d.total,
  }))

  // Safety per agency (PASD + AT) — top 10
  const safetyData = (pasd.by_agency || [])
    .slice(0, 10)
    .map((d) => {
      const atCount = (at.by_agency || []).find((a) => a.agency === d.agency)?.total ?? 0
      return { name: d.agency, PASD: d.total, AT: atCount }
    })

  // BP per agency
  const bpData = (bp.by_agency || []).slice(0, 10).map((d) => ({ name: d.agency, BP: d.total }))
  const faeData = (fae?.by_agency || []).slice(0, 10).map((d) => ({ name: d.agency, FAE: d.total }))

  // PASD by agency
  const pasdByAgencyData = (pasd.by_agency || []).slice(0, 10).map((d) => ({ name: d.agency, PASD: d.total }))

  // AT by agency
  const atByAgencyData = (at.by_agency || []).slice(0, 10).map((d) => ({ name: d.agency, AT: d.total }))

  // ──── Dados filtrados por preferência do utilizador ────

  // Quarterly data — filtered indicators
  const quarterlyDataFiltered = quarterlyData
    .map((q) => {
      const filtered = { quarter: q.quarter }
      if (quarterlyFilter.isVisible('FNC')) filtered.FNC = q.FNC
      if (quarterlyFilter.isVisible('PASD')) filtered.PASD = q.PASD
      if (quarterlyFilter.isVisible('AT')) filtered.AT = q.AT
      if (quarterlyFilter.isVisible('BP')) filtered.BP = q.BP
      if (quarterlyFilter.isVisible('FAE')) filtered.FAE = q.FAE
      return filtered
    })

  // YoY data — filtered indicators
  const yoyComparisonFiltered = yoyComparison
    ? yoyComparison.filter((item) => yoyFilter.isVisible(item.indicator))
    : null

  // Agency-filtered data
  const fncAgencyDataFiltered = fncAgencyData.filter((d) => fncAgencyFilter.isVisible(d.name))
  const pasdByAgencyDataFiltered = pasdByAgencyData.filter((d) => pasdAgencyFilter.isVisible(d.name))
  const atByAgencyDataFiltered = atByAgencyData.filter((d) => atAgencyFilter.isVisible(d.name))
  const bpDataFiltered = bpData.filter((d) => bpAgencyFilter.isVisible(d.name))
  const faeDataFiltered = faeData.filter((d) => faeAgencyFilter.isVisible(d.name))

  const handleExportPptx = async () => {
    if (!rootRef.current || isExporting) return

    setExportNotice(null)
    setIsExporting(true)

    try {
      await waitForFontsReady()
      await waitForPaint()

      const targets = collectExportTargets(rootRef.current, yearLabel)
      if (!targets.length) {
        throw new Error('Aucun visuel visible à exporter.')
      }

      const pptx = new PptxGenJS()
      pptx.layout = 'LAYOUT_WIDE'
      pptx.author = 'GitHub Copilot'
      pptx.company = 'RaLab5'
      pptx.subject = 'Export QSSE'
      pptx.title = `Analyse QSSE ${yearLabel}`
      pptx.lang = 'fr-FR'

      for (const target of targets) {
        const dataUrl = await toPng(target.node, {
          cacheBust: true,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
        })
        const { width, height } = await loadImageDimensions(dataUrl)
        const slide = pptx.addSlide()
        slide.background = { color: 'F8FAFC' }

        let imageBoxX = 0.35
        let imageBoxY = 0.35
        let imageBoxWidth = PPTX_SLIDE_WIDTH - 0.7
        let imageBoxHeight = PPTX_SLIDE_HEIGHT - 0.7

        if (target.kind === 'kpi') {
          slide.addText(target.title, {
            x: 0.4,
            y: 0.18,
            w: PPTX_SLIDE_WIDTH - 0.8,
            h: 0.3,
            fontFace: 'Segoe UI',
            fontSize: 22,
            bold: true,
            color: '002C77',
          })
          imageBoxY = 0.75
          imageBoxHeight = PPTX_SLIDE_HEIGHT - 1.1
        }

        const fitted = fitIntoBox(imageBoxWidth, imageBoxHeight, width, height)
        slide.addImage({
          data: dataUrl,
          x: imageBoxX + fitted.offsetX,
          y: imageBoxY + fitted.offsetY,
          w: fitted.width,
          h: fitted.height,
        })
      }

      const fileName = buildExportFileName(year)
      await pptx.writeFile({ fileName })
      setExportNotice({ type: 'success', text: `${targets.length} visuels exportés dans ${fileName}.` })
    } catch (error) {
      setExportNotice({
        type: 'error',
        text: error instanceof Error ? error.message : 'Export PPTX impossible.',
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div ref={rootRef} className={`qad-root qad-root-codir${isExporting ? ' qad-exporting' : ''}`}>
      {/* ── Visibilité des graphiques ──────────────────────── */}
      <div className="qad-chart-controls">
        <div className="qad-control-header">
          <div className="qad-control-title">Affichage des graphiques</div>
          <div className="qad-export-actions">
            <span className="qad-export-note">PPTX générique: KPI + graphiques visibles</span>
            <button type="button" className="qad-export-btn" onClick={handleExportPptx} disabled={isExporting}>
              {isExporting ? 'Export en cours…' : 'Exporter vers PPTX'}
            </button>
          </div>
        </div>
        <div className="qad-control-grid">
          <label><input type="checkbox" checked={visibleCharts.mix} onChange={() => toggleChart('mix')} /> Mix QSSE</label>
          <label><input type="checkbox" checked={visibleCharts.closure} onChange={() => toggleChart('closure')} /> Clôture FNC</label>
          <label><input type="checkbox" checked={visibleCharts.costAnalysis} onChange={() => toggleChart('costAnalysis')} /> Analyse coûts</label>
          <label><input type="checkbox" checked={visibleCharts.fncByAgency} onChange={() => toggleChart('fncByAgency')} /> FNC par agence</label>
          <label><input type="checkbox" checked={visibleCharts.fncCost} onChange={() => toggleChart('fncCost')} /> Coût FNC</label>
          <label><input type="checkbox" checked={visibleCharts.pasdMonthly} onChange={() => toggleChart('pasdMonthly')} /> PASD mensuel</label>
          <label><input type="checkbox" checked={visibleCharts.quarterly} onChange={() => toggleChart('quarterly')} /> Analyse trimestrielle</label>
          {year && <label><input type="checkbox" checked={visibleCharts.yoy} onChange={() => toggleChart('yoy')} /> Comparaison année N-1</label>}
          <label><input type="checkbox" checked={visibleCharts.pasdByAgency} onChange={() => toggleChart('pasdByAgency')} /> PASD par agence</label>
          <label><input type="checkbox" checked={visibleCharts.atByAgency} onChange={() => toggleChart('atByAgency')} /> AT par agence</label>
          <label><input type="checkbox" checked={visibleCharts.safety} onChange={() => toggleChart('safety')} /> Sécurité</label>
          <label><input type="checkbox" checked={visibleCharts.bp} onChange={() => toggleChart('bp')} /> Bonnes pratiques</label>
          <label><input type="checkbox" checked={visibleCharts.fae} onChange={() => toggleChart('fae')} /> FAE</label>
        </div>
        {exportNotice && (
          <div className={`qad-export-feedback ${exportNotice.type === 'error' ? 'error' : 'success'}`}>
            {exportNotice.text}
          </div>
        )}
      </div>

      {/* ── KPIs FNC ─────────────────────────────────────────── */}
      <SectionHead title={`FNC — ${yearLabel}`} />
      <div className="qad-kpi-strip">
        <KpiCard label="Total FNC" value={fnc.total} />
        <KpiCard label="Clôturées" value={fnc.closed} sub={`${closureRate}%`} />
        <KpiCard label="En cours" value={fnc.open} />
        <KpiCard label="Coût déclaré" value={FMT_EURO(fnc.cost_total)} />
        <KpiCard label="PASD" value={pasd.total} />
        <KpiCard label="AT" value={at.total} />
        <KpiCard label="BP" value={bp.total} />
        <KpiCard label="FAE" value={fae?.total || 0} />
      </div>

      {(registerMixData.length > 0 || fnc.total > 0) && (
        <div className="qad-indicators-grid">
          {visibleCharts.mix && registerMixData.length > 0 && (
            <div className="qad-chart-card">
              <SectionHead title="Mix indicateurs QSSE" count="FNC / PASD / AT / BP / FAE" />
              <div className="qad-indicator-donut">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={registerMixData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {registerMixData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="qad-donut-legend">
                  {registerMixData.map((item) => (
                    <div key={item.name} className="qad-donut-legend-item">
                      <span className="qad-donut-dot" style={{ background: item.fill }} />
                      <span>{item.name}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {visibleCharts.closure && fnc.total > 0 && (
            <div className="qad-chart-card">
              <SectionHead title="Performance clôture FNC" count="objectif: 90%" />
              <div className="qad-gauge-wrap">
                <ResponsiveContainer width="100%" height={220}>
                  <RadialBarChart
                    cx="50%"
                    cy="56%"
                    innerRadius="68%"
                    outerRadius="92%"
                    barSize={16}
                    data={closureGaugeData}
                    startAngle={180}
                    endAngle={0}
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                    <RadialBar background dataKey="value" cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="qad-gauge-center">
                  <div className="qad-gauge-value">{closureRate}%</div>
                  <div className={`qad-gauge-status ${closureRate >= 90 ? 'ok' : closureRate >= 75 ? 'mid' : 'low'}`}>
                    {closureRate >= 90 ? 'Objectif atteint' : closureRate >= 75 ? 'À consolider' : 'Sous cible'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {visibleCharts.costAnalysis && fnc.total > 0 && (
            <div className="qad-chart-card">
              <SectionHead title="Analyse de coûts (quantité)" count={`${fnc.total} FNC • ${costAnalysisRate}% avec analyse`} />
              <div className="qad-indicator-donut">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={costAnalysisData}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {costAnalysisData.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="qad-donut-legend">
                  {costAnalysisData.map((item) => (
                    <div key={item.name} className="qad-donut-legend-item">
                      <span className="qad-donut-dot" style={{ background: item.fill }} />
                      <span>{item.name}</span>
                      <strong>{item.total}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FNC par agence ───────────────────────────────────── */}
      {visibleCharts.fncByAgency && fncAgencyData.length > 0 && (
        <div className="qad-chart-card qad-wide">
          <SectionHead title="FNC par agence" count={`${fnc.total} événements`} />
          {fncAgencyNames.length > 0 && (
            <ChartFilterPanel
              items={fncAgencyNames}
              visibleItems={fncAgencyFilter.visibleItems}
              toggleItem={fncAgencyFilter.toggleItem}
              moveItem={fncAgencyFilter.moveItem}
              label="Agences"
            />
          )}
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={fncAgencyDataFiltered} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <defs>
                <linearGradient id="qadClosed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4e86d0" />
                  <stop offset="100%" stopColor={CODIR_THEME.fnc} />
                </linearGradient>
                <linearGradient id="qadOpen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CODIR_THEME.ngeYellowSoft} />
                  <stop offset="100%" stopColor={CODIR_THEME.ngeYellow} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} angle={-30} textAnchor="end" interval={0} height={58} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="top" height={28} wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="Clôturées" stackId="a" fill="url(#qadClosed)" radius={[0, 0, 0, 0]} barSize={26} />
              <Bar dataKey="En cours" stackId="a" fill="url(#qadOpen)" radius={[6, 6, 0, 0]} barSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Coût FNC par agence ──────────────────────────────── */}
      {visibleCharts.fncCost && fncCostData.length > 0 && (
        <div className="qad-chart-card qad-wide">
          <SectionHead title="Coût FNC par agence (déclaré)" />
          <ResponsiveContainer width="100%" height={fncCostChartHeight}>
            <BarChart
              data={fncCostData}
              layout="vertical"
              margin={{ top: 10, right: 78, bottom: 8, left: 74 }}
            >
              <defs>
                <linearGradient id="qadCost" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={CODIR_THEME.fncSoft} />
                  <stop offset="100%" stopColor={CODIR_THEME.fnc} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={FMT_EURO} tick={CHART_TICK} />
              <YAxis type="category" dataKey="name" tick={CHART_TICK} width={92} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="cost" name="Coût" fill="url(#qadCost)" radius={[0, 7, 7, 0]} barSize={20}>
                {fncCostData.map((_, i) => (
                  <Cell key={i} fill={AGENCY_COLORS[i % AGENCY_COLORS.length]} />
                ))}
                <LabelList dataKey="cost" position="right" formatter={(v) => FMT_EURO(Number(v || 0))} className="qad-label" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── PASD mensuel ─────────────────────────────────────── */}
      {visibleCharts.pasdMonthly && pasdMonthData.length > 0 && (
        <div className="qad-chart-card qad-wide">
          <SectionHead title="Évolution mensuelle PASD" count={`${pasd.total} presqu'accidents`} />
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={pasdMonthData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="qadPasd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CODIR_THEME.pasd} stopOpacity="0.9" />
                  <stop offset="100%" stopColor={CODIR_THEME.pasd} stopOpacity="0.2" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="PASD" stroke={CODIR_THEME.pasd} strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Analyse trimestrielle ────────────────────────────── */}
      {visibleCharts.quarterly && quarterlyData.length > 0 && (
        <div className="qad-chart-card qad-wide">
          <SectionHead title="Analyse trimestrielle" count="Tous les indicateurs" />
          <ChartFilterPanel
            items={['FNC', 'PASD', 'AT', 'BP', 'FAE']}
            visibleItems={quarterlyFilter.visibleItems}
            toggleItem={quarterlyFilter.toggleItem}
            moveItem={quarterlyFilter.moveItem}
            label="Indicateurs"
          />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={quarterlyDataFiltered} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="quarter" tick={CHART_TICK} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '16px' }} />
              {quarterlyFilter.isVisible('FNC') && <Bar dataKey="FNC" fill={INDICATOR_COLORS.FNC} />}
              {quarterlyFilter.isVisible('PASD') && <Bar dataKey="PASD" fill={INDICATOR_COLORS.PASD} />}
              {quarterlyFilter.isVisible('AT') && <Bar dataKey="AT" fill={INDICATOR_COLORS.AT} />}
              {quarterlyFilter.isVisible('BP') && <Bar dataKey="BP" fill={INDICATOR_COLORS.BP} />}
              {quarterlyFilter.isVisible('FAE') && <Bar dataKey="FAE" fill={INDICATOR_COLORS.FAE} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Comparaison Année N-1 ───────────────────────────── */}
      {visibleCharts.yoy && yoyComparison && yoyComparison.length > 0 && (
        <div className="qad-chart-card qad-wide">
          <SectionHead title={`Comparaison ${year - 1} vs ${year}`} count="Année sur année" />
          <ChartFilterPanel
            items={['FNC', 'PASD', 'AT', 'BP', 'FAE']}
            visibleItems={yoyFilter.visibleItems}
            toggleItem={yoyFilter.toggleItem}
            moveItem={yoyFilter.moveItem}
            label="Indicateurs"
          />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={yoyComparisonFiltered} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="indicator" tick={CHART_TICK} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ paddingTop: '16px' }} />
              <Bar dataKey="previous" name={`${year - 1}`} fill={CODIR_THEME.blueLight} radius={[8, 8, 0, 0]} />
              <Bar dataKey="current" name={`${year}`} fill={CODIR_THEME.fnc} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── PASD par agence ──────────────────────────────────── */}
      {visibleCharts.pasdByAgency && pasdByAgencyData.length > 0 && (
        <div className="qad-chart-card">
          <SectionHead title="PASD par agence" count={`${pasd.total} presqu'accidents`} />
          {pasdAgencyNames.length > 0 && (
            <ChartFilterPanel
              items={pasdAgencyNames}
              visibleItems={pasdAgencyFilter.visibleItems}
              toggleItem={pasdAgencyFilter.toggleItem}
              moveItem={pasdAgencyFilter.moveItem}
              label="Agences"
            />
          )}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={pasdByAgencyDataFiltered} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} angle={-30} textAnchor="end" interval={0} height={58} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="PASD" fill={CODIR_THEME.pasd} radius={[8, 8, 0, 0]} barSize={24}>
                {pasdByAgencyDataFiltered.map((_, i) => (
                  <Cell key={i} fill={AGENCY_COLORS[i % AGENCY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── AT par agence ────────────────────────────────────── */}
      {visibleCharts.atByAgency && atByAgencyData.length > 0 && (
        <div className="qad-chart-card">
          <SectionHead title="AT par agence" count={`${at.total} accidents`} />
          {atAgencyNames.length > 0 && (
            <ChartFilterPanel
              items={atAgencyNames}
              visibleItems={atAgencyFilter.visibleItems}
              toggleItem={atAgencyFilter.toggleItem}
              moveItem={atAgencyFilter.moveItem}
              label="Agences"
            />
          )}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={atByAgencyDataFiltered} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} angle={-30} textAnchor="end" interval={0} height={58} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="AT" fill={CODIR_THEME.at} radius={[8, 8, 0, 0]} barSize={24}>
                {atByAgencyDataFiltered.map((_, i) => (
                  <Cell key={i} fill={AGENCY_COLORS[i % AGENCY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Sécurité par agence ──────────────────────────────── */}
      {visibleCharts.safety && safetyData.length > 0 && (
        <div className="qad-chart-card">
          <SectionHead title="Sécurité par agence" count="PASD + AT" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={safetyData} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} angle={-30} textAnchor="end" interval={0} height={58} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend verticalAlign="top" height={28} wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="PASD" fill={CODIR_THEME.pasd} radius={[6, 6, 0, 0]} barSize={22} />
              <Bar dataKey="AT" fill={CODIR_THEME.at} radius={[6, 6, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── BP par agence ────────────────────────────────────── */}
      {visibleCharts.bp && bpData.length > 0 && (
        <div className="qad-chart-card">
          <SectionHead title="Bonnes pratiques (BP)" count={`${bp.total} remontées`} />
          {bpAgencyNames.length > 0 && (
            <ChartFilterPanel
              items={bpAgencyNames}
              visibleItems={bpAgencyFilter.visibleItems}
              toggleItem={bpAgencyFilter.toggleItem}
              moveItem={bpAgencyFilter.moveItem}
              label="Agences"
            />
          )}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bpDataFiltered} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} angle={-30} textAnchor="end" interval={0} height={58} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="BP" fill={CODIR_THEME.bp} radius={[8, 8, 0, 0]} barSize={24}>
                {bpDataFiltered.map((_, i) => (
                  <Cell key={i} fill={AGENCY_COLORS[i % AGENCY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── FAE par agence ───────────────────────────────────── */}
      {visibleCharts.fae && faeData.length > 0 && (
        <div className="qad-chart-card">
          <SectionHead title="FAE par agence" count={`${fae?.total || 0} événements`} />
          {faeAgencyNames.length > 0 && (
            <ChartFilterPanel
              items={faeAgencyNames}
              visibleItems={faeAgencyFilter.visibleItems}
              toggleItem={faeAgencyFilter.toggleItem}
              moveItem={faeAgencyFilter.moveItem}
              label="Agences"
            />
          )}
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={faeDataFiltered} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="2 3" stroke={CODIR_THEME.grid} vertical={false} />
              <XAxis dataKey="name" tick={CHART_TICK} angle={-30} textAnchor="end" interval={0} height={58} />
              <YAxis tick={CHART_TICK} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="FAE" fill={CODIR_THEME.fncSoft} radius={[8, 8, 0, 0]} barSize={24}>
                {faeDataFiltered.map((_, i) => (
                  <Cell key={i} fill={AGENCY_COLORS[i % AGENCY_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tableau multi-registre ───────────────────────────── */}
      {by_agency_all.length > 0 && (
        <div className="qad-chart-card qad-wide">
          <SectionHead title="Vue globale par agence" />
          <div className="qad-table-wrap">
            <table className="qad-table">
              <thead>
                <tr>
                  <th>Agence</th>
                  <th>FNC total</th>
                  <th>FNC en cours</th>
                  <th>PASD</th>
                  <th>AT</th>
                  <th>BP</th>
                  <th>FAE</th>
                </tr>
              </thead>
              <tbody>
                {by_agency_all.map((row) => (
                  <tr key={row.agency}>
                    <td className="qad-td-ag">{row.agency}</td>
                    <td>{row.fnc || '—'}</td>
                    <td className={row.fnc_open > 0 ? 'qad-td-open' : ''}>{row.fnc_open || '—'}</td>
                    <td>{row.pasd || '—'}</td>
                    <td className={row.at > 0 ? 'qad-td-at' : ''}>{row.at || '—'}</td>
                    <td>{row.bp || '—'}</td>
                    <td className={row.fae > 0 ? 'qad-td-fae' : ''}>{row.fae || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
