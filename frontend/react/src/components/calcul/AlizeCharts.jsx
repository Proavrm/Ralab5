import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const NGE_BLUE = '#003170'
const NGE_YELLOW = '#ffcc00'
const OK = '#15803d'
const WARN = '#b45309'
const BAD = '#b91c1c'
const MUTED = '#94a3b8'

const LAYER_COLORS = ['#003170', '#1d4f91', '#4a7db5', '#7aa0c8', '#ffcc00', '#e6b900', '#94a3b8']

function toNum(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function statusColor(statut, conso) {
  const s = String(statut || '').toLowerCase()
  if (s.includes('non conforme')) return BAD
  if (s.includes('limite')) return WARN
  if (s.includes('conforme')) return OK
  if (conso == null) return MUTED
  if (conso <= 0.9) return OK
  if (conso <= 1) return WARN
  return BAD
}

/** Schéma vertical type Alizé (couches empilées). */
export function AlizeStructureStack({ layers = [], platform = {} }) {
  const items = layers
    .map((layer, index) => ({
      key: layer.id || `l-${index}`,
      label: layer.materiau || layer.fonction || `Couche ${index + 1}`,
      ep: toNum(layer.epaisseur),
      module: toNum(layer.module),
      color: LAYER_COLORS[index % LAYER_COLORS.length],
      isPf: String(layer.materiau || '').toUpperCase().startsWith('PF')
        || String(layer.fonction || '').toLowerCase() === 'plateforme',
    }))
    .filter((x) => x.label)

  const finite = items.filter((x) => x.ep != null && x.ep > 0 && !x.isPf)
  const total = finite.reduce((acc, x) => acc + x.ep, 0) || 1

  if (!items.length && !platform.classe) {
    return <p className="text-[13px] text-text-muted">Aucune couche à afficher.</p>
  }

  return (
    <div className="flex gap-4">
      <div className="w-full max-w-[220px] overflow-hidden rounded-xl border border-[#dbe1ea] bg-[#f8fafc]">
        {items.map((item) => {
          const h = item.isPf || item.ep == null
            ? 44
            : Math.max(28, Math.round((item.ep / total) * 180))
          return (
            <div
              key={item.key}
              style={{ height: h, background: item.color }}
              className="flex items-center justify-between px-3 text-[11px] font-semibold text-white"
              title={`${item.label} · ${item.ep ?? '∞'} cm · E=${item.module ?? '—'} MPa`}
            >
              <span className="truncate">{item.label}</span>
              <span className="shrink-0 opacity-90">{item.ep != null ? `${item.ep} cm` : '∞'}</span>
            </div>
          )
        })}
        {platform.classe && !items.some((x) => x.isPf) ? (
          <div
            className="flex h-11 items-center justify-between bg-[#64748b] px-3 text-[11px] font-semibold text-white"
            title={`Plateforme ${platform.classe}`}
          >
            <span>{platform.classe}</span>
            <span>{platform.module_pf ? `${platform.module_pf} MPa` : ''}</span>
          </div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-[12px] text-text-muted">
        <div className="font-semibold text-[#003170]">Schéma structure</div>
        <div>Épaisseur bit./liée : <strong className="text-text">{finite.reduce((a, x) => a + x.ep, 0) || 0} cm</strong></div>
        <div>Couches : {items.length}</div>
        {platform.classe ? <div>PF : {platform.classe} · {platform.module_pf || '—'} MPa</div> : null}
      </div>
    </div>
  )
}

/** Barres d'épaisseurs / modules. */
export function AlizeLayersChart({ layers = [] }) {
  const data = layers
    .map((layer, index) => ({
      name: layer.materiau || layer.fonction || `C${index + 1}`,
      epaisseur: toNum(layer.epaisseur) || 0,
      module: toNum(layer.module) || 0,
    }))
    .filter((row) => row.name)

  if (!data.length) {
    return <p className="text-[13px] text-text-muted">Pas de données pour le graphique couches.</p>
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: 'cm', position: 'insideTopLeft', offset: 0, fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: 'MPa', position: 'insideTopRight', offset: 0, fontSize: 10 }} />
          <Tooltip />
          <Legend />
          <Bar yAxisId="left" dataKey="epaisseur" name="Épaisseur (cm)" fill={NGE_BLUE} radius={[4, 4, 0, 0]} />
          <Bar yAxisId="right" dataKey="module" name="Module (MPa)" fill={NGE_YELLOW} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Consommation des critères (calc/adm). */
export function AlizeCriteriaChart({ criteria = [] }) {
  const data = criteria.map((c, index) => {
    const adm = toNum(c.valeur_admissible)
    const calc = toNum(c.valeur_calculee)
    let conso = toNum(c.consommation)
    if (conso == null && adm && calc != null) conso = calc / adm
    return {
      name: c.critere || c.materiau || `Crit. ${index + 1}`,
      consommation: conso != null ? Math.round(conso * 1000) / 10 : 0,
      admissible: adm,
      calcule: calc,
      color: statusColor(c.statut, conso),
    }
  }).filter((row) => row.name)

  if (!data.length) {
    return <p className="text-[13px] text-text-muted">Pas de critères à tracer.</p>
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip formatter={(v) => [`${v} %`, 'Consommation']} />
          <Bar dataKey="consommation" name="Consommation %" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[11px] text-text-muted">Vert ≤ 90 % · Orange ≤ 100 % · Rouge &gt; 100 % (non conforme)</p>
    </div>
  )
}

/** Comparaison εt / εz calc vs admissible. */
export function AlizeResultsCompareChart({ results = {}, criteria = [] }) {
  const fromResults = [
    {
      name: 'εt',
      admissible: toNum(results.epsT_adm),
      calcule: toNum(results.epsT_calc),
    },
    {
      name: 'εz',
      admissible: toNum(results.epsZ_adm),
      calcule: toNum(results.epsZ_calc),
    },
  ].filter((row) => row.admissible != null || row.calcule != null)

  const fromCriteria = criteria
    .filter((c) => toNum(c.valeur_admissible) != null || toNum(c.valeur_calculee) != null)
    .map((c, i) => ({
      name: c.critere || c.materiau || `C${i + 1}`,
      admissible: toNum(c.valeur_admissible),
      calcule: toNum(c.valeur_calculee),
    }))

  const data = fromResults.length ? fromResults : fromCriteria
  if (!data.length) {
    return <p className="text-[13px] text-text-muted">Pas de résultats numériques à comparer.</p>
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e9f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="admissible" name="Admissible" fill={NGE_BLUE} radius={[4, 4, 0, 0]} />
          <Bar dataKey="calcule" name="Calculé" fill={NGE_YELLOW} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
