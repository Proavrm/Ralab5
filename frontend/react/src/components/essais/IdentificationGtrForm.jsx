import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, FG, FR, num, parseRes, rnd } from '@/components/essais/essaiFormUi'
import { api } from '@/services/api'
import { pickWEForUsage } from '@/lib/vbsEssai'
import { weWMoyenFromResultats } from '@/lib/weEssai'
import {
  buildGtrChartCalcs,
  computeIdResultats,
  extractEsFromResultats,
  extractGrIdentification,
  extractPnWopn,
  extractVbsFromResultats,
  hydricLabel,
  serializeIdResultats,
} from '@/lib/gtrEssai'
import { extractGrCurve } from '@/lib/grEssai'
import GtrGranuloChart from '@/components/essais/GtrGranuloChart'

const HYDRIC_STEPS = ['ts', 's', 'm', 'h', 'th']

function siblingList(raw) {
  return Array.isArray(raw) ? raw : (raw?.items || raw?.results || [])
}

function essaiCode(row) {
  return String(row?.essai_code || row?.code_essai || '').toUpperCase()
}

function overlayNonNull(base, extra) {
  const out = { ...(base || {}) }
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value == null || value === '') return
    if (Array.isArray(value) && value.length === 0) return
    out[key] = value
  })
  return out
}

function pulledValues(siblings, currentUid) {
  const list = Array.isArray(siblings) ? siblings : []
  const others = list.filter((row) => String(row?.uid || '') !== String(currentUid || ''))
  const weWn = pickWEForUsage(others, currentUid, 'wn')
  const gr = others.find((row) => essaiCode(row) === 'GR')
  const lcp = others.find((row) => essaiCode(row) === 'LCP')
  const vbs = others.find((row) => ['VBS', 'BM'].includes(essaiCode(row)))
  const pn = others.find((row) => essaiCode(row) === 'PN')
  const es = others.find((row) => essaiCode(row) === 'ES')
  const grMetrics = extractGrIdentification(gr?.resultats)
  const lcpR = parseRes(lcp?.resultats)
  return {
    wn: weWn ? weWMoyenFromResultats(weWn.resultats) : null,
    dmax: grMetrics.dmax,
    passant_80: grMetrics.passant_80,
    passant_63: grMetrics.passant_63,
    passant_2: grMetrics.passant_2,
    passant_20: grMetrics.passant_20,
    passant_50: grMetrics.passant_50,
    wl: num(lcpR?.wl),
    wp: num(lcpR?.wp),
    ip: num(lcpR?.ip) ?? (num(lcpR?.wl) != null && num(lcpR?.wp) != null ? rnd(num(lcpR.wl) - num(lcpR.wp), 3) : null),
    vbs: vbs ? extractVbsFromResultats(parseRes(vbs.resultats)) : null,
    es: es ? extractEsFromResultats(parseRes(es.resultats)) : null,
    w_opn: pn ? extractPnWopn(pn.resultats) : null,
    courbe_gr: gr ? extractGrCurve(gr.resultats) : [],
  }
}

function pulledSources(siblings, currentUid) {
  const list = Array.isArray(siblings) ? siblings : []
  const others = list.filter((row) => String(row?.uid || '') !== String(currentUid || ''))
  const found = (codes) => others.some((row) => codes.includes(essaiCode(row)))
  return {
    wn: pickWEForUsage(others, currentUid, 'wn') ? 'WE' : '',
    dmax: found(['GR']) ? 'GR' : '',
    passant_80: found(['GR']) ? 'GR' : '',
    passant_2: found(['GR']) ? 'GR' : '',
    passant_20: found(['GR']) ? 'GR' : '',
    passant_50: found(['GR']) ? 'GR' : '',
    wl: found(['LCP']) ? 'LCP' : '',
    wp: found(['LCP']) ? 'LCP' : '',
    ip: found(['LCP']) ? 'LCP' : '',
    vbs: found(['VBS', 'BM']) ? 'VBS' : '',
    w_opn: found(['PN']) ? 'PN' : '',
    es: found(['ES']) ? 'ES' : '',
  }
}

function fmt(value, unit = '') {
  if (value == null || value === '') return null
  return unit ? `${value} ${unit}` : String(value)
}

function Metric({ label, value, source }) {
  return (
    <div className="rounded-[10px] border border-border bg-bg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-muted">{label}</span>
        {source ? (
          <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-muted">
            {source}
          </span>
        ) : null}
      </div>
      <div className={`mt-1 text-[16px] font-semibold leading-none ${value ? 'text-text' : 'italic font-normal text-text-muted'}`}>
        {value || '—'}
      </div>
    </div>
  )
}

function HydricBar({ code }) {
  return (
    <div className="flex overflow-hidden rounded-[10px] border border-border">
      {HYDRIC_STEPS.map((step) => {
        const active = step === code
        return (
          <div
            key={step}
            className={`flex-1 px-2 py-2 text-center text-[11px] font-semibold ${
              active ? 'bg-[#3b6d11] text-white' : 'bg-bg text-text-muted'
            }`}
          >
            {step}
            <div className={`text-[9px] font-medium ${active ? 'text-white/80' : ''}`}>{hydricLabel(step)}</div>
          </div>
        )
      })}
    </div>
  )
}

function GrGtrTable({ computed }) {
  const rows = [
    { tamis: 'Dmax', value: fmt(computed.dmax, 'mm'), role: '≤ 50 mm → A / B / D1 · > 50 mm → C / D2 · > 250 mm → D3' },
    { tamis: '80 µm', value: fmt(computed.passant_80, '%'), role: '> 35 % → A · ≤ 35 % → B · ≤ 12 % → B1/B2/B5 · ≤ 5 % → D' },
    { tamis: '2 mm', value: fmt(computed.passant_2, '%'), role: 'Sables / graves (ISO 14688-2)' },
    { tamis: '20 mm', value: fmt(computed.passant_20, '%'), role: 'Fraction grave (ISO 14688-2)' },
    { tamis: '50 mm', value: fmt(computed.passant_50, '%'), role: 'Fraction 0/50 (famille C)' },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-bg">
            <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis</th>
            <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Passant</th>
            <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Rôle GTR / Eurocode</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tamis} className="border-b border-border">
              <td className="px-2 py-1.5 font-mono text-[12px] font-bold">{row.tamis}</td>
              <td className="px-2 py-1.5 text-right text-[13px] font-semibold">{row.value || '—'}</td>
              <td className="px-2 py-1.5 text-[11px] text-text-muted">{row.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClassCard({ eyebrow, title, code, detail, steps, tone = 'nge' }) {
  const tones = {
    nge: 'border-[#b5d88a] bg-[#eaf3de] text-[#3b6d11]',
    blue: 'border-[#90bfe8] bg-[#e6f1fb] text-[#185fa5]',
    sand: 'border-[#e6cf9b] bg-[#fff7ea] text-[#854f0b]',
  }
  return (
    <div className={`flex min-h-[220px] flex-col rounded-[12px] border px-4 py-4 ${tones[tone]}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{eyebrow}</div>
      <div className="mt-3 text-[34px] font-bold leading-none">{code || '—'}</div>
      <div className="mt-2 text-[12px] font-medium opacity-90">{detail || title}</div>
      {steps?.length ? (
        <ol className="mt-3 list-decimal space-y-1 pl-4 text-[11px] leading-snug opacity-90">
          {steps.map((step, index) => (
            <li key={`${index}-${step}`}>{step}</li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

export default function IdentificationGtrForm({ res = {}, onChange, readOnly, essai }) {
  const echantillonId = essai?.echantillon_id
  const { data: essaisByEchantillon, isFetched } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled: Boolean(echantillonId),
  })
  const { data: echantillon, isFetched: echantillonFetched } = useQuery({
    queryKey: ['echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais/echantillons/${echantillonId}`),
    enabled: Boolean(echantillonId),
  })
  const siblings = useMemo(() => siblingList(essaisByEchantillon), [essaisByEchantillon])
  const pulled = useMemo(() => pulledValues(siblings, essai?.uid), [siblings, essai?.uid])
  const sources = useMemo(() => pulledSources(siblings, essai?.uid), [siblings, essai?.uid])
  const commentaire = res?.commentaire || ''
  const descriptionVisuelle = res?.description_visuelle || ''
  const designation = String(essai?.designation || echantillon?.designation || '').trim()
  const computed = useMemo(
    () => computeIdResultats(overlayNonNull({ ...res, commentaire, description_visuelle: descriptionVisuelle }, pulled)),
    [pulled, commentaire, descriptionVisuelle, res],
  )
  const lastEmit = useRef('')
  const visuelleTouched = useRef(Boolean(String(res?.description_visuelle || '').trim()))
  const siblingsReady = !echantillonId || isFetched
  const echantillonReady = !echantillonId || echantillonFetched
  const sourcesReady = siblingsReady && echantillonReady

  useEffect(() => {
    if (readOnly || !sourcesReady) return
    let next = computed
    if (!String(next.description_visuelle || '').trim() && !visuelleTouched.current && designation) {
      next = { ...computed, description_visuelle: designation }
    }
    const payload = serializeIdResultats(next)
    const snap = JSON.stringify(payload)
    if (snap === lastEmit.current) return
    lastEmit.current = snap
    onChange?.(payload)
  }, [computed, designation, onChange, readOnly, sourcesReady])

  function setDescriptionVisuelle(value) {
    visuelleTouched.current = true
    onChange?.(serializeIdResultats({ ...computed, description_visuelle: value }))
  }

  function setCommentaire(value) {
    onChange?.(serializeIdResultats({ ...computed, commentaire: value }))
  }

  const displayedDescription = String(computed.description_visuelle || designation || '').trim()
  const ancienne = computed.gtr_ancienne || {}
  const nouvelle = computed.gtr_nouvelle || {}
  const euro = computed.eurocode || {}
  const missing = [
    computed.wn == null ? 'WE (Wn)' : null,
    computed.dmax == null || computed.passant_80 == null ? 'GR (Dmax / P80)' : null,
    computed.vbs == null && computed.ip == null ? 'VBS ou LCP (Ip)' : null,
    /^(A|B5|B6|C2)/.test(ancienne.classe || '') && computed.w_opn == null && (computed.wl == null || computed.ip == null)
      ? 'PN (wOPN) ou LCP pour l’état hydrique'
      : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-4">
      <Card title="Description visuelle de l’échantillon">
        <p className="mb-3 text-[11px] italic text-text-muted">
          Nature, couleur, D apparent, état, présence de matière organique… Prérempli avec la désignation de l’échantillon si le champ est vide.
        </p>
        {readOnly ? (
          <FR label="Description visuelle" value={displayedDescription} />
        ) : (
          <FG label="Description visuelle">
            <textarea
              value={computed.description_visuelle || ''}
              onChange={(event) => setDescriptionVisuelle(event.target.value)}
              rows={3}
              placeholder="Ex. : argile brune, humide, traces de graviers, Dmax apparent 20 mm"
              className="w-full resize-y rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge"
            />
          </FG>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-[12px] border border-[#e6cf9b] bg-[#fff7ea] px-4 py-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#854f0b]">GTR 1992</div>
          <div className="mt-2 text-[32px] font-bold leading-none text-[#854f0b]">{ancienne.code || ancienne.classe || '—'}</div>
          <div className="mt-2 text-[12px] font-medium leading-snug text-[#854f0b]">
            {ancienne.description || 'NF P 11-300:1992'}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#b5d88a] bg-[#eaf3de] px-4 py-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#3b6d11]">GTR 2022</div>
          <div className="mt-2 text-[32px] font-bold leading-none text-[#3b6d11]">{nouvelle.code || '—'}</div>
          <div className="mt-2 text-[12px] font-medium leading-snug text-[#3b6d11]">
            {nouvelle.description || 'NF P 11-300:2022 / EN 16907-2'}
          </div>
        </div>
        <div className="rounded-[12px] border border-[#90bfe8] bg-[#e6f1fb] px-4 py-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#185fa5]">Eurocode 7</div>
          <div className="mt-2 text-[32px] font-bold leading-none text-[#185fa5]">{euro.iso_14688 || '—'}</div>
          <div className="mt-2 text-[12px] font-medium leading-snug text-[#185fa5]">
            {[euro.description, euro.uscs ? `USCS ${euro.uscs}` : ''].filter(Boolean).join(' · ') || 'ISO 14688-2'}
          </div>
        </div>
      </div>

      <Card title="Granulométrie GTR — coupures utiles (feuille GR)">
        <p className="mb-3 text-[11px] italic text-text-muted">
          Courbe tracée avec tous les tamis de la feuille GR. Le tableau ne retient que les coupures utiles au classement GTR.
        </p>
        <GtrGranuloChart calcs={buildGtrChartCalcs(computed)} />
        <div className="mt-3">
          <GrGtrTable computed={computed} />
        </div>
      </Card>

      <Card title="Valeurs issues des essais du même échantillon">
        <p className="mb-3 text-[11px] italic text-text-muted">
          L’identification GTR lit les feuilles sœurs : WE (Wn), GR, LCP (wL, wP, Ip), VBS, PN (wOPN) et ES. Elle ne les remplace pas.
        </p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Metric label="Wn" value={fmt(computed.wn, '%')} source={sources.wn} />
          <Metric label="wL" value={fmt(computed.wl, '%')} source={sources.wl} />
          <Metric label="wP" value={fmt(computed.wp, '%')} source={sources.wp} />
          <Metric label="Ip" value={fmt(computed.ip, '%')} source={sources.ip} />
          <Metric label="VBS" value={fmt(computed.vbs)} source={sources.vbs} />
          <Metric label="wOPN" value={fmt(computed.w_opn, '%')} source={sources.w_opn} />
          <Metric label="ES" value={fmt(computed.es)} source={sources.es} />
          <Metric
            label="État hydrique"
            value={ancienne.hydrique ? `${ancienne.hydrique} — ${hydricLabel(ancienne.hydrique)}` : null}
          />
        </div>
        <div className="mt-3">
          <HydricBar code={ancienne.hydrique} />
        </div>
        {missing.length ? (
          <p className="mt-3 text-[11px] text-[#854f0b]">
            Paramètres manquants : {missing.join(' · ')}
          </p>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <ClassCard
          tone="sand"
          eyebrow="GTR ancienne · NF P 11-300:1992"
          title="Classification GTR 1992"
          code={ancienne.code || ancienne.classe}
          detail={ancienne.description || (ancienne.classe ? `Classe ${ancienne.classe}` : 'Paramètres insuffisants')}
          steps={ancienne.chemin}
        />
        <ClassCard
          tone="nge"
          eyebrow="GTR nouvelle · NF P 11-300:2022 / EN 16907-2"
          title="Classification EN 16907-2"
          code={nouvelle.code}
          detail={nouvelle.description || 'Correspondance depuis la GTR 1992'}
          steps={nouvelle.chemin}
        />
        <ClassCard
          tone="blue"
          eyebrow="Eurocode 7 · ISO 14688-2"
          title="Classification unifiée"
          code={euro.iso_14688}
          detail={[euro.description, euro.uscs ? `USCS ${euro.uscs}` : ''].filter(Boolean).join(' · ') || 'Classification unifiée'}
          steps={euro.chemin}
        />
      </div>

      <Card title="Commentaire">
        {readOnly ? (
          <FR label="Commentaire" value={computed.commentaire} />
        ) : (
          <FG label="Commentaire">
            <textarea
              value={computed.commentaire || ''}
              onChange={(event) => setCommentaire(event.target.value)}
              rows={3}
              className="w-full resize-y rounded border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-nge"
            />
          </FG>
        )}
      </Card>
    </div>
  )
}
