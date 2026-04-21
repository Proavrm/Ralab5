/**
 * EssaiPage.jsx — Fiche de saisie des essais laboratoire
 * Route: /essai/:uid
 *
 * ARCHITECTURE:
 * ─────────────────────────────────────────────────────────────────────────────
 * Détecte type_essai et affiche le bon formulaire de saisie.
 * Les résultats sont calculés en temps réel et sauvegardés en JSON.
 *
 * Pour ajouter un nouveau type:
 *   1. Créer un composant function MonEssai({ res, onChange, readOnly })
 *   2. L'ajouter dans ESSAI_FORMS avec la clé = type_essai exact en BD
 *
 * Types prévus (à implémenter):
 *   'GR'   — Granulométrie (tamis + sédimentation)
 *   'LCP'  — Limites d'Atterberg (wL, wP, Ip, Ic)
 *   'BM'   — Bleu de méthylène (VBS)
 *   'ES'   — Équivalent de sable
 *   'PN'   — Proctor Normal (WOPN, ρdOPN)
 *   'IPI'  — Indice Portant Immédiat
 *   'ID'   — Identification GTR (agrège les autres)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react'
import { useLocation, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'
import { buildLocationTarget, navigateBackWithFallback, navigateWithReturnTo, resolveReturnTo } from '@/lib/detailNavigation'

// ── UI helpers ────────────────────────────────────────────────────────────────
function Card({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
      {title && (
        <div className="px-4 py-2.5 border-b border-border bg-bg">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{title}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
function FG({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-text-muted">{label}</label>
      {children}
    </div>
  )
}
function FR({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 mb-2">
      <span className="text-[10px] text-text-muted">{label}</span>
      <span className={`text-[13px] font-medium ${!value && value !== 0 ? 'text-text-muted italic font-normal' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}
const STAT_CLS = {
  'Programmé': 'bg-[#e6f1fb] text-[#185fa5]',
  'En cours':  'bg-[#faeeda] text-[#854f0b]',
  'Terminé':   'bg-[#eaf3de] text-[#3b6d11]',
  'Annulé':    'bg-[#f1efe8] text-[#5f5e5a]',
}
const STAT_SELECT_CLS = {
  'Programmé': 'bg-[#eef6fd] border-[#b7d5f1] text-[#185fa5] focus:border-[#6ea9dd]',
  'En cours':  'bg-[#fff7ea] border-[#e6cf9b] text-[#854f0b] focus:border-[#d2a84c]',
  'Terminé':   'bg-[#eef6e8] border-[#b8d49a] text-[#3b6d11] focus:border-[#78a14a]',
  'Annulé':    'bg-[#f5f3ee] border-[#d5d0c2] text-[#5f5e5a] focus:border-[#a39d90]',
}
function Badge({ s }) {
  return s ? <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${STAT_CLS[s] || 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span> : null
}
function parseRes(r) {
  try { return typeof r === 'string' ? JSON.parse(r || '{}') : (r || {}) }
  catch { return {} }
}
function num(v) {
  const s = typeof v === 'string' ? v.trim().replace(',', '.') : v
  const x = parseFloat(s)
  return Number.isNaN(x) ? null : x
}
function rnd(v, d = 2) { return v === null ? null : parseFloat(v.toFixed(d)) }

function toDateInputValue(value) {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) return isoMatch[1]
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function formatDateDisplay(value) {
  const normalized = toDateInputValue(value)
  if (!normalized) return null
  const [year, month, day] = normalized.split('-')
  if (!year || !month || !day) return normalized
  return `${day}/${month}/${year}`
}

function buildMetaFromEssai(essaiLike, fallback = {}) {
  return {
    type_essai: essaiLike?.type_essai || fallback.type_essai || '',
    norme: essaiLike?.norme || fallback.norme || '',
    statut: essaiLike?.statut || fallback.statut || 'Programmé',
    operateur: essaiLike?.operateur || '',
    date_debut: toDateInputValue(essaiLike?.date_debut),
    date_fin: toDateInputValue(essaiLike?.date_fin),
  }
}

function formatEssaiDateRange(startValue, endValue) {
  const start = formatDateDisplay(startValue)
  const end = formatDateDisplay(endValue)
  if (start && end) return `${start} → ${end}`
  return start || end || null
}

function getStatusFromMeta(metaLike) {
  if (toDateInputValue(metaLike?.date_fin)) return 'Terminé'
  return metaLike?.statut || 'Programmé'
}

function getStatusSelectClass(statut) {
  return STAT_SELECT_CLS[statut] || 'bg-surface border-border text-text'
}

// ═══════════════════════════════════════════════════════════════════════════════
// WE — TENEUR EN EAU PONDÉRALE
// NF P 94-050 (étuvage 105°C ou 50°C)
// NF P 94-049-1 (micro-ondes) / NF P 94-049-2 (plaque chauffante)
//
// Protocole: peser récipient vide (M1), récipient+sol humide (M2),
//            récipient+sol sec après étuvage (M3)
// Formule: w = (M2-M3) / (M3-M1) × 100
//
// Contextes d'usage (selector — sans liaisons pour l'instant):
//   wn         → Teneur en eau naturelle (résultat principal → CRE, ID GTR)
//   vbs        → Prise d'essai pour VBS
//   coupure_20 → Fraction 0/20mm
//   coupure_5  → Fraction 0/5mm
//   proctor    → Point de compactage Proctor
//   traitement → Étude traitement de sols
//   wl         → Limite de liquidité (Atterberg)
//   wp         → Limite de plasticité (Atterberg)
//
// TODO: lier w_moyen automatiquement au CRE et à l'ID GTR
// TODO: adapter nb_det et structure selon le contexte (ex: Proctor = 5 points)
// ═══════════════════════════════════════════════════════════════════════════════

const WE_USAGES = [
  { value: 'wn',           label: 'Wn — Teneur en eau naturelle' },
  { value: 'vbs',          label: 'VBS — Prise d\'essai au bleu (fraction < 5mm)' },
  { value: 'coupure_20',   label: 'Coupure 0/20mm' },
  { value: 'coupure_5',    label: 'Coupure 0/5mm' },
  { value: 'coupure_0250', label: 'MB — Fraction 0/0.250mm (pour MB 0/2)' },
  { value: 'coupure_0125', label: 'MBF — Fraction 0/0.125mm (pour MBF)' },
  { value: 'proctor',    label: 'Proctor (point de compactage)' },
  { value: 'traitement', label: 'Étude traitement de sols' },
  { value: 'wl',         label: 'wL — Limite de liquidité' },
  { value: 'wp',         label: 'wP — Limite de plasticité' },
]

const WE_METHODES = [
  { value: '105', label: 'Étuvage 105°C — NF P 94-050' },
  { value: '50',  label: 'Étuvage 50°C (matériaux sensibles)' },
  { value: 'mw',  label: 'Micro-ondes — NF P 94-049-1' },
  { value: 'pc',  label: 'Plaque chauffante — NF P 94-049-2' },
]

function initDets(res) {
  if (res.determinations?.length) return res.determinations
  return Array.from({ length: 3 }, (_, i) => ({
    id: i + 1, boite: '', m1: '', m2: '', m3: '', actif: i < 2,
  }))
}

function calcDet(d) {
  const m1 = num(d.m1), m2 = num(d.m2), m3 = num(d.m3)
  if (m1 === null || m2 === null || m3 === null)
    return { m_eau: null, m_sol_sec: null, w: null }
  const m_eau    = m2 - m3
  const m_sol_sec = m3 - m1
  const w = m_sol_sec > 0 ? rnd((m_eau / m_sol_sec) * 100) : null
  return { m_eau: rnd(m_eau), m_sol_sec: rnd(m_sol_sec), w }
}

function TeneurEnEau({ res, onChange, readOnly }) {
  const [usage,   setUsage]   = useState(res.usage   || 'wn')
  const [methode, setMethode] = useState(res.methode || '105')
  const [dets,    setDets]    = useState(() => initDets(res))

  function emit(d, u, m) {
    const calcs  = d.map(calcDet)
    const valides = calcs.filter((c, i) => d[i].actif && c.w !== null)
    const w_moyen = valides.length
      ? rnd(valides.reduce((a, c) => a + c.w, 0) / valides.length)
      : null
    onChange(JSON.stringify({ usage: u, methode: m, determinations: d, w_moyen, nb_det: valides.length }))
  }

  function setDet(i, key, val) {
    const upd = dets.map((d, idx) => idx === i ? { ...d, [key]: val } : d)
    setDets(upd); emit(upd, usage, methode)
  }
  function onUsage(v)   { setUsage(v);   emit(dets, v, methode) }
  function onMethode(v) { setMethode(v); emit(dets, usage, v) }

  const calcs   = dets.map(calcDet)
  const valides = calcs.filter((c, i) => dets[i].actif && c.w !== null)
  const w_moyen = valides.length
    ? rnd(valides.reduce((a, c) => a + c.w, 0) / valides.length)
    : null
  const ecart = valides.length >= 2
    ? rnd(Math.max(...valides.map(c => c.w)) - Math.min(...valides.map(c => c.w)))
    : null
  const conforme = ecart !== null ? ecart <= 1.0 : null

  return (
    <div className="flex flex-col gap-4">

      {/* Contexte + méthode */}
      <Card title="Contexte et méthode">
        {readOnly ? (
          <div className="grid grid-cols-2 gap-4">
            <FR label="Usage" value={WE_USAGES.find(u => u.value === usage)?.label} />
            <FR label="Méthode" value={WE_METHODES.find(m => m.value === methode)?.label} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <FG label="Usage / contexte">
              <Select value={usage} onChange={e => onUsage(e.target.value)} className="w-full" tabIndex={-1}>
                {WE_USAGES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </Select>
            </FG>
            <FG label="Méthode de dessiccation">
              <Select value={methode} onChange={e => onMethode(e.target.value)} className="w-full" tabIndex={0}>
                {WE_METHODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </FG>
          </div>
        )}
      </Card>

      {/* Tableau de saisie */}
      <Card title="Pesées — NF P 94-050">
        {!readOnly && (
          <p className="text-[11px] text-text-muted italic mb-3">
            Minimum 2 déterminations. Masses en grammes. M1 = récipient vide, M2 = +sol humide, M3 = +sol sec (après étuvage).
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-2 py-2 text-[11px] font-medium text-text-muted w-6">✓</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">N°</th>
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Boîte</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M1<br/><span className="font-normal opacity-60">Récipient (g)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M2<br/><span className="font-normal opacity-60">+Humide (g)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M3<br/><span className="font-normal opacity-60">+Sec (g)</span></th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M eau (g)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">M sol sec (g)</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-accent">w (%)</th>
              </tr>
            </thead>
            <tbody>
              {dets.map((d, i) => {
                const c = calcs[i]
                return (
                  <tr key={i} className={`border-b border-border ${!d.actif ? 'opacity-30' : ''}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={d.actif}
                        onChange={e => setDet(i, 'actif', e.target.checked)}
                        disabled={readOnly} className="accent-accent" tabIndex={0} />
                    </td>
                    <td className="px-2 py-1.5 text-[12px] text-text-muted">{d.id}</td>
                    <td className="px-1 py-1.5">
                      {readOnly
                        ? <span className="text-[12px]">{d.boite || '—'}</span>
                        : <input value={d.boite} onChange={e => setDet(i, 'boite', e.target.value)}
                            disabled={!d.actif} placeholder="ex: B-12"
                            className="w-[65px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent disabled:opacity-40" tabIndex={0} />
                      }
                    </td>
                    {['m1','m2','m3'].map(k => (
                      <td key={k} className="px-1 py-1.5">
                        {readOnly
                          ? <span className="text-[12px] block text-right pr-3">{d[k] || '—'}</span>
                          : <input type="number" step="0.01" value={d[k]}
                              onChange={e => setDet(i, k, e.target.value)}
                              disabled={!d.actif}
                              className="w-[90px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right disabled:opacity-40" tabIndex={0} />
                        }
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{c.m_eau ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{c.m_sol_sec ?? '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${c.w !== null && d.actif ? 'text-accent text-[14px]' : 'text-text-muted text-[12px]'}`}>
                      {c.w ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Résultats */}
        <div className="mt-4 flex items-start gap-3 flex-wrap">
          {w_moyen !== null && (
            <div className="flex items-center gap-3 px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg">
              <div>
                <div className="text-[30px] font-bold text-[#3b6d11] leading-none">{w_moyen} %</div>
                <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">
                  w moyen — {valides.length} détermination{valides.length > 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )}
          {ecart !== null && (
            <div className={`px-4 py-3 rounded-lg border text-[12px] ${conforme
              ? 'bg-[#eaf3de] border-[#b5d88a] text-[#3b6d11]'
              : 'bg-[#fcebeb] border-[#f0a0a0] text-[#a32d2d]'}`}>
              <div className="font-bold">{conforme ? '✓ Conformes' : '⚠ Écart excessif'}</div>
              <div className="opacity-80">Écart: {ecart} % (seuil: 1,0 %)</div>
              {/* TODO: adapter le seuil selon le type de sol */}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// GR — ANALYSE GRANULOMÉTRIQUE PAR TAMISAGE
// NF P 94-056 (sols) / NF EN 933-1 (granulats)
//
// Version actuelle: sans coupure
// TODO: ajouter coupure(s) — chaque fraction aura son propre WE + facteur b
// TODO: ajouter sédimentométrie NF P 94-057 pour fines < 0.08mm
// ═══════════════════════════════════════════════════════════════════════════════

const GR_MODELES = {
  'Sols GTR':  [0.08, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 31.5, 40, 50, 63, 80, 100, 150],
  'Granulats': [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 5, 6.3, 8, 10, 12.5, 14, 16, 20, 25, 31.5, 40, 50, 63, 80, 100, 150],
  'Enrobés':   [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 6.3, 8, 10, 12.5, 14, 16, 20],
  'Béton':     [0.063, 0.125, 0.25, 0.5, 1, 2, 4, 5, 6.3, 8, 10, 12.5, 16, 20, 25, 31.5],
  'LA / MDE':  [4, 6.3, 8, 10, 11.2, 12.5, 14, 16],
}

const ALL_TAMIS = [...new Set([
  0.063, 0.08, 0.1, 0.125, 0.16, 0.2, 0.25, 0.315, 0.4, 0.5, 0.63, 0.8,
  1, 1.25, 1.6, 2, 2.5, 3.15, 4, 5, 6.3, 8, 10, 11.2, 12.5, 14, 16, 20,
  25, 31.5, 40, 50, 63, 80, 100, 125, 150, 200,
])].sort((a, b) => a - b)

function initGRTamis(res) {
  if (res.tamis?.length) return res.tamis
  return GR_MODELES['Sols GTR'].map(d => ({ d, r: '' }))
}

function calcGR(tamis, ms) {
  if (!ms || ms <= 0) return tamis.map(t => ({ ...t, rc_g: null, rc_pct: null, passant: null }))
  let rc = 0
  return [...tamis]
    .sort((a, b) => b.d - a.d)
    .map(t => {
      const rp = parseFloat(t.r) || 0
      rc += rp
      const rc_pct = rnd(rc / ms * 100)
      return { ...t, rc_g: rnd(rc), rc_pct, passant: rnd(Math.max(0, 100 - rc_pct)) }
    })
    .sort((a, b) => a.d - b.d)
}

// Interpolation log-linéaire pour D10, D30, D60
function interpolateDp(calcs, p) {
  const pts = calcs.filter(t => t.passant !== null).sort((a, b) => a.d - b.d)
  if (pts.length < 2) return null
  for (let i = 0; i < pts.length - 1; i++) {
    const lo = pts[i], hi = pts[i + 1]
    if (lo.passant <= p && hi.passant >= p) {
      if (hi.passant === lo.passant) return lo.d
      const t = (p - lo.passant) / (hi.passant - lo.passant)
      return rnd(Math.pow(10, Math.log10(lo.d) + t * (Math.log10(hi.d) - Math.log10(lo.d))), 3)
    }
  }
  return null
}

function calcCuCc(calcs) {
  const d10 = interpolateDp(calcs, 10)
  const d30 = interpolateDp(calcs, 30)
  const d60 = interpolateDp(calcs, 60)
  const cu  = d10 && d60 ? rnd(d60 / d10, 2) : null
  const cc  = d10 && d30 && d60 ? rnd((d30 * d30) / (d10 * d60), 2) : null
  return { d10, d30, d60, cu, cc }
}

function calcCoeffVBSFromCalcs(calcs) {
  const p5 = num(calcs.find(t => Number(t.d) === 5)?.passant)
  const p50 = num(calcs.find(t => Number(t.d) === 50)?.passant)
  if (p5 === null || p50 === null || p50 <= 0) return null
  return rnd(p5 / p50, 3)
}

function GRChart({ tamis, calcs }) {
  const W = 560, H = 300, PL = 45, PR = 15, PT = 15, PB = 45
  const iW = W - PL - PR, iH = H - PT - PB
  // Couleurs explicites — CSS vars ne fonctionnent pas dans SVG inline
  const BG = '#ffffff', GRID = '#d4d2ca', TXT = '#888', ACC = '#3b82f6'
  const { d10, d30, d60 } = calcCuCc(calcs)
  const points = calcs.filter(t => t.passant !== null)
  if (points.length < 2) return (
    <div className="flex items-center justify-center bg-bg border border-border rounded-lg" style={{height: H}}>
      <span className="text-[12px] text-text-muted italic">Saisir les refus pour afficher la courbe</span>
    </div>
  )
  const xMin = Math.log10(0.063), xMax = Math.log10(200)
  const xScale = d => PL + (Math.log10(d) - xMin) / (xMax - xMin) * iW
  const yScale = p => PT + iH - (p / 100) * iH
  const xTicks = [0.08, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200]
  // Complete logarithmic scale
  const allLogValues = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const logGridlines = allLogValues.filter(d => !xTicks.includes(d) && d >= 0.063 && d <= 200)
  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  const linePoints = points.map(t => `${xScale(t.d).toFixed(1)},${yScale(t.passant).toFixed(1)}`).join(' ')
  const dLines = [
    { d: d10, p: 10, color: '#7c3aed', label: 'D10' },
    { d: d30, p: 30, color: '#ca8a04', label: 'D30' },
    { d: d60, p: 60, color: '#16a34a', label: 'D60' },
  ].filter(x => x.d !== null)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg overflow-visible">
      <rect x={PL} y={PT} width={iW} height={iH} fill={BG} stroke={GRID} strokeWidth="1"/>
      {yTicks.map(p => (
        <g key={p}>
          <line x1={PL} y1={yScale(p)} x2={PL+iW} y2={yScale(p)}
            stroke={GRID} strokeWidth={p===0||p===100?1:0.5} strokeDasharray={p%20===0?'none':'2,3'}/>
          <text x={PL-5} y={yScale(p)+4} textAnchor="end" fontSize="9" fill={TXT}>{p}</text>
        </g>
      ))}
      {/* Intermediate log scale gridlines (lighter) */}
      {logGridlines.map(d => (
        <line key={`log-${d}`} x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT+iH} stroke={GRID} strokeWidth="0.5" opacity="0.5"/>
      ))}
      {xTicks.map(d => (
        <g key={d}>
          <line x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT+iH} stroke={GRID} strokeWidth="1" strokeDasharray="none" opacity="0.6"/>
          <text x={xScale(d)} y={PT+iH+14} textAnchor="middle" fontSize="8" fill="#999999">{d}</text>
        </g>
      ))}
      <text x={PL+iW/2} y={H-2} textAnchor="middle" fontSize="10" fill={TXT}>Tamis (mm) — échelle log</text>
      <text x={10} y={PT+iH/2} textAnchor="middle" fontSize="10" fill={TXT} transform={`rotate(-90, 10, ${PT+iH/2})`}>Passant (%)</text>
      {/* Courbe */}
      <polyline points={linePoints} fill="none" stroke={ACC} strokeWidth="2.5" strokeLinejoin="round"/>
      {/* Valeurs de passant */}
      {points.map(t => (
        <text key={t.d} x={xScale(t.d)} y={yScale(t.passant)-7} textAnchor="middle" fontSize="8" fill={ACC}>{t.passant}</text>
      ))}
      {/* Ligne 80µm */}
      <line x1={xScale(0.08)} y1={PT} x2={xScale(0.08)} y2={PT+iH} stroke="#dc2626" strokeWidth="1" strokeDasharray="4,2"/>
      <text x={xScale(0.08)+3} y={PT+12} fontSize="8" fill="#dc2626">80µm</text>
      {/* Lignes D10, D30, D60 */}
      {dLines.map(({ d, p, color, label }) => (
        <g key={label}>
          <line x1={xScale(d)} y1={yScale(p)} x2={xScale(d)} y2={PT+iH} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.8"/>
          <line x1={PL} y1={yScale(p)} x2={xScale(d)} y2={yScale(p)} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.8"/>
          <text x={xScale(d)} y={PT+iH+26} textAnchor="middle" fontSize="8" fill={color} fontWeight="bold">{label}</text>
        </g>
      ))}
    </svg>
  )
}

function Granulometrie({ res, onChange, readOnly }) {
  const [modele, setModele] = useState(res.modele || 'Sols GTR')
  const [m1, setM1] = useState(res.m1 || '')
  const [m2, setM2] = useState(res.m2 || '')
  const [m3, setM3] = useState(res.m3 || '')
  const [mh, setMh] = useState(res.mh || '')
  const [tamis, setTamis] = useState(() => initGRTamis(res))
  const [showAdd, setShowAdd] = useState(false)
  const [tamisToAdd, setTamisToAdd] = useState('')
  const [showPassantEditor, setShowPassantEditor] = useState(false)

  const n1 = num(m1)
  const n2 = num(m2)
  const n3 = num(m3)
  const mhNum = num(mh)
  const m_eau = n1 !== null && n2 !== null && n3 !== null ? rnd(n2 - n3) : null
  const m_sol_sec = n1 !== null && n3 !== null ? rnd(n3 - n1) : null
  const w = m_sol_sec !== null && m_sol_sec > 0 ? rnd(m_eau / m_sol_sec * 100) : null
  const ms = w !== null && mhNum !== null ? rnd(mhNum / (1 + w / 100)) : null
  const calcs = calcGR(tamis, ms)
  const p80 = calcs.find(t=>t.d===0.08||t.d===0.063)?.passant??null
  const dmax = [...calcs].sort((a,b)=>b.d-a.d).find(t=>t.passant!==null&&t.passant<100)?.d??null
  const coeffVBS = calcCoeffVBSFromCalcs(calcs)

  function emitAll(t,_m1,_m2,_m3,_mh,_mod) {
    const a = num(_m1)
    const b_ = num(_m2)
    const cc = num(_m3)
    const mhNum = num(_mh)
    const w_ = a !== null && b_ !== null && cc !== null && (cc - a) > 0 ? rnd((b_ - cc) / (cc - a) * 100) : null
    const ms_ = w_ !== null && mhNum !== null ? rnd(mhNum / (1 + w_ / 100)) : null
    const calced = calcGR(t, ms_)
    const p80_=calced.find(x=>x.d===0.08||x.d===0.063)?.passant??null
    const dm_=[...calced].sort((a,b)=>b.d-a.d).find(x=>x.passant!==null&&x.passant<100)?.d??null
    const coeffVBS_ = calcCoeffVBSFromCalcs(calced)
    const p20_=calced.find(x=>Number(x.d)===20)?.passant??null
    onChange(JSON.stringify({modele:_mod,m1:_m1,m2:_m2,m3:_m3,mh:_mh,w:w_,ms:ms_,tamis:t,passant_80:p80_,passant_20:p20_,dmax:dm_,coeff_vbs:coeffVBS_}))
  }

  function applyModele(m) {
    setModele(m)
    const ex=Object.fromEntries(tamis.map(t=>[t.d,t.r]))
    const nt=GR_MODELES[m].map(d=>({d,r:ex[d]||''}))
    setTamis(nt);emitAll(nt,m1,m2,m3,mh,m)
  }
  function setR(d,v){const nt=tamis.map(t=>t.d===d?{...t,r:v}:t);setTamis(nt);emitAll(nt,m1,m2,m3,mh,modele)}
  function onM1(v){setM1(v);emitAll(tamis,v,m2,m3,mh,modele)}
  function onM2(v){setM2(v);emitAll(tamis,m1,v,m3,mh,modele)}
  function onM3(v){setM3(v);emitAll(tamis,m1,m2,v,mh,modele)}
  function onMh(v){setMh(v);emitAll(tamis,m1,m2,m3,v,modele)}
  function addTamis(){
    const d=parseFloat(tamisToAdd)
    if(!d||tamis.find(t=>t.d===d)){setShowAdd(false);return}
    const nt=[...tamis,{d,r:''}].sort((a,b)=>a.d-b.d)
    setTamis(nt);setShowAdd(false);setTamisToAdd('');emitAll(nt,m1,m2,m3,mh,modele)
  }
  function removeTamis(d){const nt=tamis.filter(t=>t.d!==d);setTamis(nt);emitAll(nt,m1,m2,m3,mh,modele)}
  function setPassant(d,newPassant){
    if(!ms||ms<=0) return
    const newPassantNum = parseFloat(newPassant)
    if(isNaN(newPassantNum)) return
    // Calculate cumulative refus needed for this passant
    const targetRc = ((100 - newPassantNum) / 100) * ms
    // Sort tamis by size descending to find cumulative position
    const sortedTamis = [...tamis].sort((a,b)=>b.d-a.d)
    let cumulativeRefus = 0
    const newTamis = tamis.map(t => {
      if(t.d === d) {
        // Find position and calculate needed refus
        const pos = sortedTamis.findIndex(st=>st.d===d)
        const prevRefus = sortedTamis.slice(0, pos).reduce((sum, st) => sum + (parseFloat(st.r)||0), 0)
        const newRefusVal = Math.max(0, targetRc - prevRefus)
        return {...t, r: rnd(newRefusVal)}
      }
      return t
    })
    setTamis(newTamis)
    emitAll(newTamis, m1, m2, m3, mh, modele)
  }

  if (readOnly) return (
    <div className="flex flex-col gap-4">
      <Card title="Paramètres">
        <div className="grid grid-cols-4 gap-3">
          <FR label="Modèle" value={res.modele}/>
          <FR label="w (%)" value={res.w!=null?`${res.w} %`:null}/>
          <FR label="Mh (g)" value={res.mh?`${res.mh} g`:null}/>
          <FR label="Ms (g)" value={res.ms?`${res.ms} g`:null}/>
        </div>
      </Card>
      <Card title="Courbe granulométrique">
        <div className="flex gap-2 mb-3 flex-wrap">
          {p80!==null&&<div className="px-4 py-2 bg-[#eaf3de] border border-[#b5d88a] rounded text-center">
            <div className="text-[20px] font-bold text-[#3b6d11]">{p80}%</div>
            <div className="text-[10px] text-[#5a8f30]">Passant 80µm</div>
          </div>}
          {dmax!==null&&<div className="px-4 py-2 bg-[#e6f1fb] border border-[#90bfe8] rounded text-center">
            <div className="text-[20px] font-bold text-[#185fa5]">{dmax} mm</div>
            <div className="text-[10px] text-[#185fa5]">Dmax</div>
          </div>}
          {(() => {
            const { cu, cc: ccv } = calcCuCc(calcs)
            return <>
              {cu!==null&&<div className="px-4 py-2 bg-[#9EA700] border border-[#757a00] rounded text-center">
                <div className="text-[20px] font-bold text-white">{cu}</div>
                <div className="text-[10px] text-white">Cu = D60/D10</div>
              </div>}
              {ccv!==null&&<div className="px-4 py-2 bg-[#A09074] border border-[#7a6d56] rounded text-center">
                <div className="text-[20px] font-bold text-white">{ccv}</div>
                <div className="text-[10px] text-white">Cc = D30²/(D10·D60)</div>
              </div>}
              {coeffVBS!==null&&<div className="px-4 py-2 bg-[#7b3f00] border border-[#5b2f00] rounded text-center">
                <div className="text-[20px] font-bold text-white">{coeffVBS}</div>
                <div className="text-[10px] text-white">Coeff C (0/5 sur 0/50)</div>
              </div>}
            </>
          })()}
        </div>
        <GRChart tamis={tamis} calcs={calcs}/>
      </Card>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <Card title="Modèle de tamis">
        <div className="flex items-center gap-3">
          <select value={modele} onChange={e=>applyModele(e.target.value)}
            className="px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent font-medium" tabIndex={0}>
            {Object.keys(GR_MODELES).map(m=><option key={m}>{m}</option>)}
          </select>
          <span className="text-[12px] text-text-muted">{GR_MODELES[modele].length} tamis · {GR_MODELES[modele][0]} → {GR_MODELES[modele].at(-1)} mm</span>
        </div>
      </Card>
      <Card title="Teneur en eau — NF P 94-050">
        <div className="grid grid-cols-4 gap-3 mb-3">
          <FG label="M1 — Récipient vide (g)">
            <input type="number" step="0.01" value={m1} onChange={e=>onM1(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="M2 — +Sol humide (g)">
            <input type="number" step="0.01" value={m2} onChange={e=>onM2(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="M3 — +Sol sec (g)">
            <input type="number" step="0.01" value={m3} onChange={e=>onM3(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="w calculé (%)">
            <input readOnly value={w??''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-accent font-bold" tabIndex={-1}/>
          </FG>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <FG label="Masse humide totale Mh (g)">
            <input type="number" step="0.01" value={mh} onChange={e=>onMh(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Masse sèche Ms — calculée (g)">
            <input readOnly value={ms??''} placeholder="—" className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-accent font-bold" tabIndex={-1}/>
          </FG>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Refus par tamis — du plus grand au plus petit</span>
            {!readOnly && ms && <button onClick={() => setShowPassantEditor(!showPassantEditor)} className="text-[11px] text-text-muted hover:text-text p-1" tabIndex={0} title="Éditeur passant inverse">⚙️</button>}
          </div>
          <div className="p-4">
            {!ms&&<p className="text-[11px] text-text-muted italic mb-2">Saisir Mh et WE pour activer.</p>}
            <div className="overflow-y-auto" style={{maxHeight:'400px'}}>
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-bg border-b border-border">
                    <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis</th>
                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Refus (g)</th>
                    <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Rc%</th>
                    <th className="px-2 py-2 text-right text-[11px] font-bold text-accent">Pass%</th>
                    <th className="w-5"></th>
                  </tr>
                </thead>
                <tbody>
                  {[...calcs].reverse().map(t=>(
                    <tr key={t.d} className="border-b border-border">
                      <td className="px-2 py-1 font-mono text-[12px] font-bold">{t.d}</td>
                      <td className="px-1 py-1">
                        <input type="number" step="0.01" value={t.r} onChange={e=>setR(t.d,e.target.value)} disabled={!ms}
                          className="w-[80px] px-2 py-0.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right disabled:opacity-30" tabIndex={0}/>
                      </td>
                      <td className="px-2 py-1 text-right text-[11px] text-text-muted">{t.rc_pct??'—'}</td>
                      <td className={`px-2 py-1 text-right font-bold text-[12px] ${t.passant!==null?'text-accent':'text-text-muted'}`}>
                        {showPassantEditor && t.passant !== null && ms ? (
                          <input type="number" step="0.1" min="0" max="100" value={t.passant} onChange={e=>setPassant(t.d,e.target.value)}
                            className="w-[60px] px-1 py-0.5 border border-accent rounded text-[12px] bg-bg outline-none text-right" tabIndex={0}/>
                        ) : (
                          t.passant??'—'
                        )}
                      </td>
                      <td className="px-1 py-1 text-center">
                      <button onClick={()=>removeTamis(t.d)} className="text-[10px] text-text-muted hover:text-danger" tabIndex={-1}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2">
            {showAdd?(
              <div className="flex items-center gap-2">
                <select value={tamisToAdd} onChange={e=>setTamisToAdd(e.target.value)}
                  className="px-2 py-1 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}>
                  <option value="">— Tamis —</option>
                  {ALL_TAMIS.filter(d=>!tamis.find(t=>t.d===d)).map(d=><option key={d} value={d}>{d} mm</option>)}
                </select>
                <Button size="sm" onClick={addTamis} disabled={!tamisToAdd} tabIndex={0}>+</Button>
                <Button size="sm" onClick={()=>setShowAdd(false)} tabIndex={0}>✕</Button>
              </div>
            ):(
              <button onClick={()=>setShowAdd(true)} className="text-[12px] text-accent hover:underline" tabIndex={0}>+ Ajouter un tamis</button>
            )}
          </div>
          </div>
        </div>
        <Card title="Courbe granulométrique">
          <GRChart tamis={tamis} calcs={calcs}/>
          {ms&&(
            <div className="flex gap-2 mt-3 flex-wrap">
              {p80!==null&&<div className="px-3 py-2 bg-[#f6be00] border border-[#d4a200] rounded text-center">
                <div className="text-[15px] font-bold text-white">{p80}%</div>
                <div className="text-[10px] text-white">Passant 80µm</div>
              </div>}
              {dmax!==null&&<div className="px-3 py-2 bg-[#002C77] border border-[#001a48] rounded text-center">
                <div className="text-[15px] font-bold text-white">{dmax} mm</div>
                <div className="text-[10px] text-white">Dmax</div>
              </div>}
              {(() => {
                const { d10, d30, d60, cu, cc: ccv } = calcCuCc(calcs)
                return <>
                  {d10!==null&&<div className="px-3 py-2 bg-[#A20067] border border-[#7d004d] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{d10} mm</div>
                    <div className="text-[10px] text-white">D10</div>
                  </div>}
                  {d30!==null&&<div className="px-3 py-2 bg-[#00A5BD] border border-[#007a8a] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{d30} mm</div>
                    <div className="text-[10px] text-white">D30</div>
                  </div>}
                  {d60!==null&&<div className="px-3 py-2 bg-[#6068B2] border border-[#454583] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{d60} mm</div>
                    <div className="text-[10px] text-white">D60</div>
                  </div>}
                  {cu!==null&&<div className="px-3 py-2 bg-[#9EA700] border border-[#757a00] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{cu}</div>
                    <div className="text-[10px] text-white">Cu = D60/D10</div>
                  </div>}
                  {ccv!==null&&<div className="px-3 py-2 bg-[#A09074] border border-[#7a6d56] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{ccv}</div>
                    <div className="text-[10px] text-white">Cc = D30²/(D10·D60)</div>
                  </div>}
                  {coeffVBS!==null&&<div className="px-3 py-2 bg-[#7b3f00] border border-[#5b2f00] rounded text-center">
                    <div className="text-[15px] font-bold text-white">{coeffVBS}</div>
                    <div className="text-[10px] text-white">Coeff C (0/5 sur 0/50)</div>
                  </div>}
                </>
              })()}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VBS — Bleu de méthylène / Prise d'essai au bleu
// ═══════════════════════════════════════════════════════════════════════════════
// Recherche WE par usage exact — utilisé par MB et MBF pour trouver le bon WE

const VBS_TYPES = [
  { value: 'granulats',   label: 'VBS — Granulats (NF EN 933-9)' },
  { value: 'sols',        label: 'VBS — Sols (NF P 94-068)' },
  { value: 'mb_0_2',     label: 'MB — Granulats fraction 0/2 mm' },
  { value: 'mbf_0_0125', label: 'MBF — Granulats fraction 0/0.125 mm' },
]

const VBS_METHODES = [
  { value: 'nf_en_933_9',     label: 'NF EN 933-9 — Granulats' },
  { value: 'nf_p_94_068',     label: 'NF P 94-068 — Sols' },
  { value: 'nf_en_933_9_mb',  label: 'NF EN 933-9 — MB agrégats 0/2' },
  { value: 'nf_en_933_9_mbf', label: 'NF EN 933-9 — MBF agrégats 0/0.125' },
]

function initVBSDets(res) {
  if (res.determinations?.length) return res.determinations
  return [{ actif: true, numero: 1, m_echantillon: '', m_humide: '', v_bleu: '', c_bleu: '', m_seche: '' }]
}

function pickWEForUsage(essais, currentUid, usageKey) {
  return (Array.isArray(essais) ? essais : []).find(e => {
    const code = e?.essai_code || e?.code_essai
    if (code !== 'WE') return false
    if (String(e?.uid || '') === String(currentUid || '')) return false
    const rr = parseRes(e?.resultats)
    return String(rr?.usage || '') === usageKey
  }) || null
}

function extractWFromWE(resultats) {
  const rr = parseRes(resultats)
  if (rr?.w_moyen != null) return String(rr.w_moyen)
  // fallback: calculer depuis m1/m2/m3
  const n1 = num(rr?.m1), n2 = num(rr?.m2), n3 = num(rr?.m3)
  if (n1 !== null && n2 !== null && n3 !== null && (n3-n1) > 0)
    return String(rnd((n2-n3)/(n3-n1)*100, 2))
  return null
}


function calcDryMassFromHumidity(mHumide, humidityPercent) {
  const mh = num(mHumide), w = num(humidityPercent)
  if (mh === null || w === null) return null
  const denom = 100 + w
  if (denom <= 0) return null
  return rnd((100 * mh) / denom, 2)
}

function calcVBS(determinations, type, humidityPercent = null, coeffCFromGR = null, useManualDryMass = false) {
  return determinations.map(det => {
    const m_echantillon = num(type === 'granulats' ? det.m_echantillon : det.m_humide)
    const v_bleu = num(det.v_bleu)
    const c_bleu = num(det.c_bleu)
    if (type === 'granulats') {
      if (m_echantillon !== null && v_bleu !== null && c_bleu !== null)
        return { ...det, vbs: rnd((v_bleu * c_bleu) / m_echantillon, 1) }
      return { ...det, vbs: null }
    }
    const m0 = useManualDryMass ? num(det.m_seche) : calcDryMassFromHumidity(det.m_humide, humidityPercent)
    const mSeche = m0 !== null && m0 >= 0 ? rnd(m0, 2) : null
    const c = num(coeffCFromGR) !== null ? num(coeffCFromGR) : (c_bleu !== null ? c_bleu : 1)
    if (m0 !== null && m0 > 0 && v_bleu !== null) {
      const vbs = rnd((v_bleu * c) / m0, 2)
      return { ...det, c_bleu: c, m_seche: mSeche, vbs, vb: vbs }
    }
    return { ...det, c_bleu: c, m_seche: mSeche, vbs: null, vb: null }
  })
}

function calcWaterMoisture({ m1, m2, m3 }) {
  const n1 = num(m1), n2 = num(m2), n3 = num(m3)
  if (n1 === null || n2 === null || n3 === null) return { w: null, ms: null, meau: null }
  const meau = rnd(n2 - n3)
  const ms   = rnd(n3 - n1)
  const w    = ms !== null && ms > 0 ? rnd((meau / ms) * 100, 1) : null
  return {
    meau: meau !== null && meau >= 0 ? meau : null,
    ms:   ms   !== null && ms   >= 0 ? ms   : null,
    w:    w    !== null && w    >= 0 ? w    : null,
  }
}

function pickWEForVBS(essais, currentUid, preferredUsage = 'vbs') {
  const candidates = (Array.isArray(essais) ? essais : []).filter(e => {
    const code = e?.essai_code || e?.code_essai
    return code === 'WE' && String(e?.uid || '') !== String(currentUid || '')
  })
  if (candidates.length === 0) return null
  const withPriority = candidates.map(e => {
    const rr = parseRes(e?.resultats)
    const usage = String(rr?.usage || '')
    const hasDirectMasses = num(rr?.m1) !== null && num(rr?.m2) !== null && num(rr?.m3) !== null
    const hasDetMasses = Array.isArray(rr?.determinations)
      && rr.determinations.some(d => num(d?.m1) !== null && num(d?.m2) !== null && num(d?.m3) !== null)
    return { e, rankUsage: usage === preferredUsage ? 0 : 1, rankMasses: (hasDirectMasses || hasDetMasses) ? 0 : 1 }
  }).sort((a, b) => (a.rankUsage - b.rankUsage) || (a.rankMasses - b.rankMasses))
  return withPriority[0]?.e || null
}

function extractWEMasses(resultats) {
  const rr = parseRes(resultats)
  if (num(rr?.m1) !== null && num(rr?.m2) !== null && num(rr?.m3) !== null)
    return { m1: String(rr.m1), m2: String(rr.m2), m3: String(rr.m3) }
  const d = Array.isArray(rr?.determinations)
    ? rr.determinations.find(x => num(x?.m1) !== null && num(x?.m2) !== null && num(x?.m3) !== null)
    : null
  if (!d) return null
  return { m1: String(d.m1), m2: String(d.m2), m3: String(d.m3) }
}

function pickGRForVBS(essais, currentUid) {
  return (Array.isArray(essais) ? essais : []).find(e => {
    const code = e?.essai_code || e?.code_essai
    return code === 'GR' && String(e?.uid || '') !== String(currentUid || '')
  }) || null
}

function extractCoeffCFromGR(resultats) {
  const rr = parseRes(resultats)
  const ms = num(rr?.ms)
  const tamis = Array.isArray(rr?.tamis) ? rr.tamis : []
  if (ms === null || ms <= 0 || tamis.length === 0) return null
  const calcs = calcGR(tamis, ms)
  const p5  = calcs.find(t => Number(t.d) === 5)?.passant
  const p50 = calcs.find(t => Number(t.d) === 50)?.passant
  const n5 = num(p5), n50 = num(p50)
  if (n5 === null || n50 === null || n50 <= 0) return null
  const cc = n5 / n50
  return cc > 0 ? rnd(cc, 3) : null
}

// ── MB / MBF — Valeur au bleu pour granulats (NF EN 933-9) ──────────────────
// MB  = (V1 × 10) / Ms   fraction 0/2mm     — g/kg — arrondi 0.1
// MBF = (V1 × 10) / Ms   fraction 0/0.125mm — g/kg — arrondi 0.1
// Correction kaolinite optionnelle: MB = ((V1 − V') × 10) / Ms
// Humidité: même protocole que VBS — M1 récipient, M2 +humide, M3 +sec
// NE PAS utiliser le coefficient C sol ici
function calcMBResult({ m1, m2, m3, ms_manual, use_manual_ms, v1, v_prime, use_kaolinite }) {
  const v  = num(v1)
  const vp = use_kaolinite ? (num(v_prime) || 0) : 0

  let ms = null
  let w = null
  let meau = null

  if (use_manual_ms) {
    const manualMs = num(ms_manual)
    ms = manualMs !== null && manualMs >= 0 ? rnd(manualMs, 2) : null
  } else {
    const n1 = num(m1), n2 = num(m2), n3 = num(m3)
    if (n1 !== null && n2 !== null && n3 !== null) {
      meau = rnd(n2 - n3, 2)
      ms = rnd(n3 - n1, 2)
      w = ms > 0 ? rnd(meau / ms * 100, 2) : null
    }
  }

  if (v === null || ms === null || ms <= 0) return { ms, w, meau, result: null }
  return { ms, w, meau, result: rnd(((v - vp) * 10) / ms, 1) }
}

function BleuMethylene({ res, onChange, readOnly, essai }) {
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
                  <input type="checkbox" checked={useManualDryMass} onChange={e=>onManualDryMassMode(e.target.checked)} className="accent-accent"/>
                    Saisir directement la masse sèche pour chaque détermination sans utiliser la teneur en eau
                </label>
              </div>
            )}
            {isMB && (
              <div className="col-span-4 flex items-center gap-4 px-3 py-2 bg-bg border border-border rounded-lg flex-wrap">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={useManualMs} onChange={e=>onManualMode(e.target.checked)} className="accent-accent"/>
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
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-accent font-bold" tabIndex={-1}/>
                </FG>
                <FG label="w — calculé (%)">
                  <input readOnly value={moisture.w??''} placeholder="—"
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg text-accent font-bold" tabIndex={-1}/>
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
                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
                </FG>
              </div>
              <div className="flex items-center gap-4 px-3 py-2 bg-bg border border-border rounded-lg flex-wrap">
                <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                  <input type="checkbox" checked={useKao} onChange={e=>onKao(e.target.checked)} className="accent-accent"/>
                  Correction kaolinite — {mbLabel} = ((V1−V&apos;) × 10) / Ms
                </label>
                {useKao && (
                  <FG label="V' — Volume kaolinite (mL)">
                    <input type="number" step="0.5" value={vPrime} onChange={e=>onVp(e.target.value)}
                      className="w-[90px] px-2 py-1 border border-border rounded text-sm bg-bg outline-none focus:border-accent"/>
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
                    <span className={`text-sm font-bold ${result ? 'text-accent' : 'text-text-muted'}`}>
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
                <td className="px-3 py-2"><span className="text-sm font-bold text-accent">{type === 'granulats' ? det.vbs : det.vb}</span></td>
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


function polyFit2(pts) {
  // Régression polynomiale degré 2 (moindres carrés): y = c0 + c1·x + c2·x²
  const n = pts.length
  if (n < 3) return null
  let s1=0, s2=0, s3=0, s4=0, sy=0, sw1y=0, sw2y=0
  for (const {x, y} of pts) {
    s1+=x; s2+=x**2; s3+=x**3; s4+=x**4
    sy+=y; sw1y+=x*y; sw2y+=x**2*y
  }
  const M = [[n,s1,s2],[s1,s2,s3],[s2,s3,s4]]
  const R = [sy, sw1y, sw2y]
  for (let i=0; i<3; i++) {
    let mx=i
    for (let j=i+1;j<3;j++) if (Math.abs(M[j][i])>Math.abs(M[mx][i])) mx=j
    ;[M[i],M[mx]]=[M[mx],M[i]];[R[i],R[mx]]=[R[mx],R[i]]
    if (Math.abs(M[i][i])<1e-12) return null
    for (let j=i+1;j<3;j++) {
      const f=M[j][i]/M[i][i]
      R[j]-=f*R[i]
      for (let k=i;k<3;k++) M[j][k]-=f*M[i][k]
    }
  }
  const c2=R[2]/M[2][2]
  const c1=(R[1]-M[1][2]*c2)/M[1][1]
  const c0=(R[0]-M[0][1]*c1-M[0][2]*c2)/M[0][0]
  if (isNaN(c0)||isNaN(c1)||isNaN(c2)) return null
  if (c2 >= 0) return null // pas de maximum → pas d'OPN
  return {c0, c1, c2}
}
function evalPoly2({c0, c1, c2}, x) { return c0 + c1*x + c2*x*x }

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

// ── MouleSelect ───────────────────────────────────────────────────────────────
// Dropdown qui liste les moules de la page Matériel (qualite_equipment)
// avec m_tare et/ou volume_cm3 renseignés.
// Props:
//   value       — moule_ref actuel (string)
//   onSelect    — fn({ code, m_tare, volume_cm3 }) appelée au choix
//   disabled    — boolean
//   placeholder — texte vide
function MouleSelect({ value, onSelect, disabled, placeholder = 'Choisir…' }) {
  const { data: equipRaw = [] } = useQuery({
    queryKey: ['qualite-equipment-moules'],
    queryFn:  () => api.get('/qualite/equipment'),
    staleTime: 5 * 60 * 1000,
  })
  const moules = (Array.isArray(equipRaw) ? equipRaw : [])
    .filter(e => e.m_tare != null || e.volume_cm3 != null)
    .sort((a, b) => a.code.localeCompare(b.code))

  function handleChange(e) {
    const code = e.target.value
    if (!code) { onSelect({ code: '', m_tare: null, volume_cm3: null }); return }
    const found = moules.find(m => m.code === code)
    onSelect({ code, m_tare: found?.m_tare ?? null, volume_cm3: found?.volume_cm3 ?? null, label: found?.label ?? '' })
  }

  return (
    <select value={value || ''} onChange={handleChange} disabled={disabled}
      className="w-full px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent disabled:opacity-40"
      title="Choisir un moule depuis Matériel">
      <option value="">{moules.length === 0 ? '— aucun équipement —' : placeholder}</option>
      {moules.map(m => (
        <option key={m.code} value={m.code}>
          {m.code}{m.label ? ` — ${m.label}` : ''}{m.m_tare != null ? ` · ${m.m_tare}g` : ''}{m.volume_cm3 != null ? ` / ${m.volume_cm3}cm³` : ''}
        </option>
      ))}
    </select>
  )
}


const MOULE_PRESETS = [
  { key: 'petit_pn',  label: 'Petit moule PN — Ø101.6 mm',  v: 944,  info: 'PN: 3 couches × 25 coups · PM: 5 couches × 25 coups' },
  { key: 'grand_cbr', label: 'Grand moule CBR — Ø152.4 mm', v: 2131, info: 'PM: 5 couches × 55 coups · compatible IPI / CBRi / CBR' },
  { key: 'custom',    label: 'Personnalisé',                 v: null, info: null },
]

function extractPassant20FromGR(grResultats) {
  const r = parseRes(grResultats)
  // Cas 1: passant_20 stocké directement (nouveaux essais GR)
  if (r.passant_20 !== undefined && r.passant_20 !== null) return r.passant_20
  // Cas 2: recalcul depuis les tamis stockés
  if (!r.tamis?.length || !r.ms) return null
  const calcs = calcGR(r.tamis, num(r.ms))
  return calcs.find(t => Number(t.d) === 20)?.passant ?? null
}

function calcGTRCorrection(rhoOPN, wOPN, pRefus20, gsGros) {
  if (pRefus20 === null || rhoOPN === null || wOPN === null) return null
  if (pRefus20 > 30)
    return { applicable: false, pRefus: pRefus20 }
  const a = pRefus20 / 100
  const gs = gsGros || 2.65
  const rho_corr = rnd(rhoOPN / (1 - a * (1 - rhoOPN / gs)), 3)
  const w_corr   = rnd(wOPN * (1 - a), 2)
  return { applicable: true, pRefus: pRefus20, a, rho_corr, w_corr }
}

function initPNPoints(res) {
  if (res.points?.length) {
    // Migrate old points that don't have moule fields
    return res.points.map(p => ({
      moule_ref: '', m_moule: '', v_moule: '',
      ...p,
    }))
  }
  return Array.from({length: 6}, (_, i) => ({
    id: i + 1, actif: true,
    moule_ref: '', m_moule: '', v_moule: '',
    w: '', m1: '', m2: '', m3: '', m_tot: '',
  }))
}

function calcPNPoint(pt, mMouleDefault, vMouleDefault) {
  // Par-point moule values have priority over global defaults
  const mm = (num(pt.m_moule) !== null && num(pt.m_moule) > 0) ? num(pt.m_moule) : num(mMouleDefault)
  const vv = (num(pt.v_moule) !== null && num(pt.v_moule) > 0) ? num(pt.v_moule) : num(vMouleDefault)
  const mt = num(pt.m_tot)
  const directRhoH = num(pt.rho_h)
  const directRhoD = num(pt.rho_d)
  // w depuis pesée M1/M2/M3 en priorité, sinon valeur directe
  let w = null
  const n1=num(pt.m1), n2=num(pt.m2), n3=num(pt.m3)
  if (n1!==null && n2!==null && n3!==null && (n3-n1)>0)
    w = rnd((n2-n3)/(n3-n1)*100, 2)
  else if (pt.w !== '')
    w = num(pt.w)
  let rho_h=null, rho_d=null
  if (mt!==null && mm!==null && vv!==null && vv>0)
    rho_h = rnd((mt-mm)/vv, 3)
  else if (directRhoH !== null)
    rho_h = directRhoH
  if (rho_h!==null && w!==null && (100+w)>0)
    rho_d = rnd(rho_h/(1+w/100), 3)
  else if (directRhoD !== null)
    rho_d = directRhoD
  if (rho_h===null && rho_d!==null && w!==null && (100+w)>0)
    rho_h = rnd(rho_d * (1 + w/100), 3)
  return {w, rho_h, rho_d}
}

// ── AnnauSelect ───────────────────────────────────────────────────────────────
// Dropdown qui liste les anneaux/capteurs depuis Matériel (facteur_k renseigné)
function AnnauSelect({ value, onSelect, disabled, placeholder = 'Anneau…' }) {
  const { data: equipRaw = [] } = useQuery({
    queryKey: ['qualite-equipment-anneaux'],
    queryFn:  () => api.get('/qualite/equipment'),
    staleTime: 5 * 60 * 1000,
  })
  const anneaux = (Array.isArray(equipRaw) ? equipRaw : [])
    .filter(e => e.facteur_k != null)
    .sort((a, b) => a.code.localeCompare(b.code))

  return (
    <select value={value || ''} onChange={e => {
      const code = e.target.value
      const found = anneaux.find(a => a.code === code)
      onSelect({ code, facteur_k: found?.facteur_k ?? null, capacite: found?.capacite ?? null, label: found?.label ?? '' })
    }} disabled={disabled}
      className="w-full px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent disabled:opacity-40">
      <option value="">{anneaux.length === 0 ? '— aucun anneau —' : placeholder}</option>
      {anneaux.map(a => (
        <option key={a.code} value={a.code}>
          {a.code}{a.label ? ` — ${a.label}` : ''}{a.facteur_k != null ? ` · k=${a.facteur_k}` : ''}{a.capacite != null ? ` / ${a.capacite}kN` : ''}
        </option>
      ))}
    </select>
  )
}

// ── ProctorChart — Dual Y-axis ────────────────────────────────────────────────
// Eixo Y esquerdo : ρd (Mg/m³) — courbe Proctor
// Eixo Y direito  : F (kN)     — résultats IPI/CBR à w% du point Proctor
// Eixo X          : w (%)      — partagé
function ProctorChart({ points, calcs, poly, wOPN, rhoOPN, correction, gs, ipiPoints = [] }) {
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
function Proctor({ res, onChange, readOnly, essai }) {
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
                <th className="px-3 py-2 text-right text-[11px] font-bold text-accent">ρd (Mg/m³)</th>
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
                  <td className={`px-3 py-1.5 text-right font-bold ${p.rho_d!==null?'text-accent text-[14px]':'text-text-muted text-[12px]'}`}>{p.rho_d??'—'}</td>
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
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="V_moule (cm³)">
            <input type="number" step="1" value={vMoule} onChange={e=>onVM(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
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
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Gs éléments grossiers (correction)">
            <input type="number" step="0.01" value={gsGros} onChange={e=>onGsGros(e.target.value)} placeholder="2.65"
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
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
                <th className="px-3 py-2 text-right text-[11px] font-bold text-accent">ρd (Mg/m³)</th>
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
                      <input type="checkbox" checked={p.actif} onChange={e=>setP(i,'actif',e.target.checked)} className="accent-accent" tabIndex={0}/>
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
                        className="w-[72px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" step="1" value={p.v_moule} onChange={e=>setP(i,'v_moule',e.target.value)}
                        disabled={!p.actif} placeholder={vMoule||'—'}
                        className="w-[62px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" step="0.1" value={p.w} onChange={e=>setP(i,'w',e.target.value)}
                        disabled={!p.actif} placeholder="—"
                        className="w-[64px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    {['m1','m2','m3'].map(k=>(
                      <td key={k} className="px-1 py-1.5">
                        <input type="number" step="0.01" value={p[k]} onChange={e=>setP(i,k,e.target.value)}
                          disabled={!p.actif} placeholder="—"
                          className="w-[76px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right disabled:opacity-40" tabIndex={0}/>
                      </td>
                    ))}
                    <td className={`px-3 py-1.5 text-right font-medium text-[12px] ${wFromPesee!==null?'text-accent':'text-text-muted opacity-50'}`}>
                      {wFromPesee!==null ? wFromPesee : (c.w!==null ? c.w : '—')}
                    </td>
                    <td className="px-1 py-1.5">
                      <input type="number" step="0.1" value={p.m_tot} onChange={e=>setP(i,'m_tot',e.target.value)}
                        disabled={!p.actif} placeholder="—"
                        className="w-[86px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right disabled:opacity-40" tabIndex={0}/>
                    </td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{c.rho_h??'—'}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${c.rho_d!==null&&p.actif?'text-accent text-[14px]':'text-text-muted text-[12px]'}`}>{c.rho_d??'—'}</td>
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

// ═══════════════════════════════════════════════════════════════════════════════
// IPI / CBRi / CBR — Portance des sols compactés
// IPI:  NF P 94-078 — Indice Portant Immédiat (1 moule, sans immersion)
// CBRi: NF P 94-090-1 — CBR immédiat (3 moules, sans immersion)
// CBR:  NF P 94-090-1 — CBR après immersion (3 moules, 4 jours)
//
// Protocole commun:
//   Grand moule CBR — Ø152.4mm, V≈2131 cm³, H=127mm
//   Piston Ø50mm (surface 19.635 cm²), vitesse 1.27 mm/min
//   Lectures de force à 2.5mm et 5.0mm
//
// Calcul CBR:
//   CBR_2.5 = (F_2.5 [kN] / 13.24) × 100
//   CBR_5.0 = (F_5.0 [kN] / 19.96) × 100
//   CBR = max(CBR_2.5, CBR_5.0)
//   Si CBR_5 > CBR_2.5 : vérifier l'essai (piston incliné ?)
//
// CBR avec immersion (NF P 94-090-1):
//   Gonflement (%) = (δ_fin − δ_ini) / H_moule × 100
//   H_moule standard = 127mm
//
// Liaison Proctor:
//   ρd_95 = 0.95 × ρdOPN (valeur corrigée en priorité)
//   CBR à 95% OPN = interpolation linéaire sur courbe CBR vs ρd
// ═══════════════════════════════════════════════════════════════════════════════

const F_REF_2_5 = 13.24   // kN — force étalon à 2.5mm (NF P 94-090-1)
const F_REF_5_0 = 19.96   // kN — force étalon à 5.0mm
const H_MOULE_CBR = 127   // mm — hauteur standard grand moule CBR

function calcCBRPoint(f25, f50) {
  const n25 = num(f25), n50 = num(f50)
  const cbr25 = n25 !== null ? rnd(n25 / F_REF_2_5 * 100, 1) : null
  const cbr50 = n50 !== null ? rnd(n50 / F_REF_5_0 * 100, 1) : null
  if (cbr25 === null && cbr50 === null) return { cbr25, cbr50, cbr: null, controlling: null, suspect: false }
  const cbr = Math.max(cbr25 ?? -Infinity, cbr50 ?? -Infinity)
  const suspect = cbr25 !== null && cbr50 !== null && cbr50 > cbr25 * 1.1
  const controlling = (cbr50 !== null && cbr25 !== null && cbr50 >= cbr25) ? '5.0mm' : '2.5mm'
  return { cbr25, cbr50, cbr: rnd(cbr, 1), controlling, suspect }
}

function calcRhoFromMoule(m_tot, m_moule, v_moule, w) {
  const mt = num(m_tot), mm = num(m_moule), vv = num(v_moule), ww = num(w)
  if (mt === null || mm === null || vv === null || vv <= 0) return { rho_h: null, rho_d: null }
  const rho_h = rnd((mt - mm) / vv, 3)
  if (ww === null || (100 + ww) <= 0) return { rho_h, rho_d: null }
  return { rho_h, rho_d: rnd(rho_h / (1 + ww / 100), 3) }
}

function interpCBRAt95(pts, rho95) {
  // pts: [{rho_d, cbr}] — interpolation linéaire
  const valid = pts.filter(p => p.rho_d !== null && p.cbr !== null)
    .sort((a, b) => a.rho_d - b.rho_d)
  if (valid.length < 2) return null
  // extrapolation incluse (au-delà des bornes)
  for (let i = 0; i < valid.length - 1; i++) {
    const lo = valid[i], hi = valid[i + 1]
    if (lo.rho_d <= rho95 + 0.001 && hi.rho_d >= rho95 - 0.001) {
      if (hi.rho_d === lo.rho_d) return rnd(lo.cbr, 1)
      const t = (rho95 - lo.rho_d) / (hi.rho_d - lo.rho_d)
      return rnd(lo.cbr + t * (hi.cbr - lo.cbr), 1)
    }
  }
  // extrapolation hors bornes
  if (rho95 < valid[0].rho_d) {
    const lo = valid[0], hi = valid[1]
    const t = (rho95 - lo.rho_d) / (hi.rho_d - lo.rho_d)
    return rnd(lo.cbr + t * (hi.cbr - lo.cbr), 1)
  }
  const lo = valid.at(-2), hi = valid.at(-1)
  const t = (rho95 - lo.rho_d) / (hi.rho_d - lo.rho_d)
  return rnd(lo.cbr + t * (hi.cbr - lo.cbr), 1)
}

const CBR_DEPTHS = [1.25, 2.0, 2.5, 3.0, 5.0, 7.5, 10.0, 12.0]

function initCBRLectures(saved, f_2_5_legacy, f_5_0_legacy) {
  if (saved?.length) {
    const byDepth = Object.fromEntries(saved.map(l => [l.depth, l.force]))
    return CBR_DEPTHS.map(d => ({
      depth: d,
      force: byDepth[d] ?? (d === 2.5 ? (f_2_5_legacy ?? '') : d === 5.0 ? (f_5_0_legacy ?? '') : '')
    }))
  }
  return CBR_DEPTHS.map(d => ({
    depth: d,
    force: d === 2.5 ? (f_2_5_legacy ?? '') : d === 5.0 ? (f_5_0_legacy ?? '') : ''
  }))
}


function initIPIMoules(res, mode) {
  if (res.moules?.length) return res.moules.map((m, idx) => ({
    id: m.id ?? idx + 1,
    actif: m.actif !== false,
    nb_coups: m.nb_coups ?? 25,
    moule_ref: m.moule_ref ?? '',
    m_moule: m.m_moule ?? '',
    v_moule: m.v_moule ?? '2131',
    m_tot: m.m_tot ?? '',
    w: m.w ?? '',
    m1: m.m1 ?? '',
    m2: m.m2 ?? '',
    m3: m.m3 ?? '',
    lectures: initCBRLectures(m.lectures, m.f_2_5, m.f_5_0),
    delta0: m.delta0 ?? 0,
    correction_mode: m.correction_mode ?? (num(m.delta0) > 0 ? 'delta0' : 'auto'),
    delta0_manual: m.delta0_manual ?? m.delta0 ?? '',
    correction_low: m.correction_low ?? 1.0,
    correction_high: m.correction_high ?? 3.0,
    gonf_ini: m.gonf_ini ?? '',
    gonf_fin: m.gonf_fin ?? '',
    h_moule: m.h_moule ?? String(H_MOULE_CBR),
    surcharge_kg: m.surcharge_kg ?? '',
    pn_point_id: m.pn_point_id ?? '',
    pn_point_w: m.pn_point_w ?? null,
    pn_point_rho_d: m.pn_point_rho_d ?? null,
  }))
  return [{
    id: 1,
    actif: true,
    nb_coups: 25,
    moule_ref: '',
    m_moule: '',
    v_moule: '2131',
    m_tot: '',
    w: '',
    m1: '',
    m2: '',
    m3: '',
    lectures: initCBRLectures(null, '', ''),
    delta0: 0,
    correction_mode: 'auto',
    delta0_manual: '',
    correction_low: 1.0,
    correction_high: 3.0,
    gonf_ini: '',
    gonf_fin: '',
    h_moule: String(H_MOULE_CBR),
    surcharge_kg: '',
    pn_point_id: '',
    pn_point_w: null,
    pn_point_rho_d: null,
  }]
}

function getPenetrationForcePoints(lectures) {
  return (Array.isArray(lectures) ? lectures : [])
    .map(l => ({ d: num(l?.depth), f: num(l?.force) }))
    .filter(p => p.d !== null && p.f !== null)
    .sort((a, b) => a.d - b.d)
}

function interpolatePenetrationForce(pts, depth) {
  if (!pts.length) return null
  if (depth <= pts[0].d) return pts[0].f
  if (depth >= pts.at(-1).d) return pts.at(-1).f
  for (let i = 0; i < pts.length - 1; i += 1) {
    const lo = pts[i]
    const hi = pts[i + 1]
    if (lo.d <= depth && hi.d >= depth) {
      const span = hi.d - lo.d
      if (span <= 0) return lo.f
      const t = (depth - lo.d) / span
      return lo.f + t * (hi.f - lo.f)
    }
  }
  return null
}

function detectAutoCorrectionLine(lectures) {
  const pts = getPenetrationForcePoints(lectures)
  if (pts.length < 3) return { mode: 'none', delta0: 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }

  let best = null
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1]
    const m = pts[i]
    const b = pts[i + 1]
    const span = b.d - a.d
    if (span < 0.8 || span > 3.2) continue
    if (m.d < 0.75 || m.d > 4.0) continue
    if (b.d > 5.5) continue

    const s1 = (m.f - a.f) / Math.max(m.d - a.d, 1e-9)
    const s2 = (b.f - m.f) / Math.max(b.d - m.d, 1e-9)
    const slope = (b.f - a.f) / span
    if (!Number.isFinite(slope) || slope <= 0) continue
    if (s1 < -0.05 || s2 < -0.05) continue

    const raw = m.d - (m.f / slope)
    if (!Number.isFinite(raw) || raw <= 0 || raw > 3.0) continue

    const curvaturePenalty = Math.abs(s2 - s1)
    const centerBonus = m.d >= 1.0 && m.d <= 3.0 ? 1.0 : 0.85
    const spanBonus = 0.8 + Math.min(span, 2.4) / 3.0
    const score = (slope * centerBonus * spanBonus) - (curvaturePenalty * 0.35)

    if (!best || score > best.score) {
      best = { a, b, m, slope, score, raw }
    }
  }

  if (!best) return { mode: 'none', delta0: 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }
  const delta0 = rnd(best.raw, 2)
  return {
    mode: delta0 > 0 ? 'auto' : 'none',
    delta0,
    x1: best.a.d,
    y1: best.a.f,
    x2: best.b.d,
    y2: best.b.f,
    slope: rnd(best.slope, 4),
    low: rnd(best.a.d, 2),
    high: rnd(best.b.d, 2),
  }
}

function resolveCorrectionInfo(lectures, raw) {
  const pts = getPenetrationForcePoints(lectures)
  const legacyDelta = num(raw?.delta0)
  const mode = String(raw?.correction_mode || (num(raw?.delta0_manual) > 0 || legacyDelta > 0 ? 'delta0' : 'auto'))
  if (!pts.length) {
    return { mode: 'none', source: 'none', delta0: 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }
  }
  if (mode === 'delta0') {
    const delta0 = num(raw?.delta0_manual) ?? legacyDelta ?? 0
    return { mode, source: delta0 > 0 ? 'manual_delta0' : 'none', delta0: delta0 > 0 ? rnd(delta0, 2) : 0, x1: null, y1: null, x2: null, y2: null, slope: null, low: null, high: null }
  }
  if (mode === 'line') {
    const low = num(raw?.correction_low)
    const high = num(raw?.correction_high)
    if (low !== null && high !== null && high > low) {
      const y1 = interpolatePenetrationForce(pts, low)
      const y2 = interpolatePenetrationForce(pts, high)
      if (y1 !== null && y2 !== null && y2 > y1) {
        const slope = (y2 - y1) / (high - low)
        const rawDelta = low - (y1 / slope)
        const delta0 = rawDelta > 0 ? rnd(Math.min(rawDelta, 3), 2) : 0
        return { mode, source: delta0 > 0 ? 'manual_line' : 'none', delta0, x1: low, y1: y1, x2: high, y2: y2, slope: rnd(slope, 4), low, high }
      }
    }
    return { mode, source: 'none', delta0: 0, x1: low, y1: null, x2: high, y2: null, slope: null, low, high }
  }
  const auto = detectAutoCorrectionLine(lectures)
  return { ...auto, source: auto.mode === 'auto' ? 'auto' : 'none', low: null, high: null }
}

function calcCBRFromLectures(lectures, correction = 0) {
  const pts = getPenetrationForcePoints(lectures)
  const corr = typeof correction === 'object' && correction !== null ? resolveCorrectionInfo(lectures, correction) : resolveCorrectionInfo(lectures, { delta0: correction })
  const d0 = corr.delta0 || 0
  const f25r = interpolatePenetrationForce(pts, 2.5)
  const f50r = interpolatePenetrationForce(pts, 5.0)
  const f25c = d0 > 0 ? interpolatePenetrationForce(pts, 2.5 + d0) : f25r
  const f50c = d0 > 0 ? interpolatePenetrationForce(pts, 5.0 + d0) : f50r
  const cbr25  = f25r !== null ? rnd(f25r / F_REF_2_5 * 100, 1) : null
  const cbr50  = f50r !== null ? rnd(f50r / F_REF_5_0 * 100, 1) : null
  const cbr25c = f25c !== null ? rnd(f25c / F_REF_2_5 * 100, 1) : null
  const cbr50c = f50c !== null ? rnd(f50c / F_REF_5_0 * 100, 1) : null
  const cbrRaw  = (cbr25 !== null || cbr50 !== null) ? rnd(Math.max(cbr25 ?? -Infinity, cbr50 ?? -Infinity), 1) : null
  const cbrCorr = (cbr25c !== null || cbr50c !== null) ? rnd(Math.max(cbr25c ?? -Infinity, cbr50c ?? -Infinity), 1) : null
  const cbr = d0 > 0 ? cbrCorr : cbrRaw
  const ctrlRaw = cbr25 !== null && cbr50 !== null ? (cbr50 >= cbr25 ? '5.0mm' : '2.5mm') : (cbr25 !== null ? '2.5mm' : cbr50 !== null ? '5.0mm' : null)
  const ctrlCorr = cbr25c !== null && cbr50c !== null ? (cbr50c >= cbr25c ? '5.0mm' : '2.5mm') : ctrlRaw
  const controlling = d0 > 0 ? ctrlCorr : ctrlRaw
  const f_kn = controlling === '2.5mm' ? (d0 > 0 ? f25c : f25r) : controlling === '5.0mm' ? (d0 > 0 ? f50c : f50r) : null
  return {
    cbr25, cbr50, cbr25c, cbr50c, cbrRaw, cbrCorr, cbr,
    controlling,
    f_kn: f_kn !== null ? rnd(f_kn, 3) : null,
    delta0_auto: corr.source === 'auto' ? corr.delta0 : null,
    delta0_used: corr.delta0 || 0,
    delta0_source: corr.source,
    correction_line: corr,
  }
}

function calcIPIFromLectures(lectures, correction = 0) {
  const c = calcCBRFromLectures(lectures, correction)
  return {
    cbr25: c.cbr25,
    cbr50: c.cbr50,
    cbr25c: c.cbr25c,
    cbr50c: c.cbr50c,
    ipiRaw: c.cbrRaw,
    ipiCorr: c.cbrCorr,
    ipi: c.cbr,
    controlling: c.controlling,
    f_kn: c.f_kn,
    delta0_auto: c.delta0_auto,
    delta0_used: c.delta0_used,
    delta0_source: c.delta0_source,
    correction_line: c.correction_line,
  }
}

const IPI_DEPTHS = [1.25, 2.0, 2.5, 3.0, 5.0, 7.5, 10.0, 12.0]
const IPI_COLORS = ['#3b82f6','#ea580c','#16a34a','#7c3aed','#dc2626','#0891b2']

function IPIChart({ tests, testCalcs, height=820, readOnly=false }) {
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

function calcStoredIPIResult(test) {
  const c = calcIPIFromLectures(test.lectures || [], test)
  return c
}

function calcIPITestResult(test) {
  const fk = num(test.facteur_k)
  const lectures = test.mode_saisie === 'mm' && fk !== null
    ? (Array.isArray(test.lectures)
        ? test.lectures.map(l => ({ ...l, force: num(l.force) !== null ? String(rnd(num(l.force) * fk, 4)) : l.force }))
        : [])
    : (Array.isArray(test.lectures) ? test.lectures : [])
  if (getPenetrationForcePoints(lectures).length) return { lectures, ...calcIPIFromLectures(lectures, test) }
  return { lectures, ...calcStoredIPIResult({ ...test, lectures }) }
}

function calcCBRTestResult(test, defaults = {}) {
  const fk = num(test.facteur_k ?? defaults.facteur_k)
  const modeSaisie = test.mode_saisie ?? defaults.mode_saisie ?? 'kn'
  const lectures = modeSaisie === 'mm' && fk !== null
    ? (Array.isArray(test.lectures)
        ? test.lectures.map(l => ({ ...l, force: num(l.force) !== null ? String(rnd(num(l.force) * fk, 4)) : l.force }))
        : [])
    : (Array.isArray(test.lectures) ? test.lectures : [])
  const calc = calcCBRFromLectures(lectures, test)
  const n1 = num(test.m1), n2 = num(test.m2), n3 = num(test.m3)
  let w = null
  if (n1 !== null && n2 !== null && n3 !== null && (n3 - n1) > 0) w = rnd((n2 - n3) / (n3 - n1) * 100, 2)
  else if (test.w !== '') w = num(test.w)
  const { rho_h, rho_d } = calcRhoFromMoule(test.m_tot, num(test.m_moule), num(test.v_moule), w)
  const gi = num(test.gonf_ini), gf = num(test.gonf_fin), hm = num(test.h_moule) ?? H_MOULE_CBR
  const gonf = gi !== null && gf !== null && hm > 0 ? rnd((gf - gi) / hm * 100, 2) : null
  return {
    lectures,
    ...calc,
    w_calc: w,
    rho_h,
    rho_d,
    gonf,
    surcharge_kg: num(test.surcharge_kg ?? defaults.surcharge_kg),
    soak_days: num(test.soak_days ?? defaults.soak_days),
    delta0: calc.delta0_used,
  }
}

function getPNPoints(pnRes) {
  if (!pnRes?.points) return []
  return pnRes.points.map((p, idx) => {
    const c = calcPNPoint(p, pnRes.m_moule, pnRes.v_moule)
    return { id: p.id??idx+1, actif: p.actif!==false, w: c.w, rho_d: c.rho_d, moule_ref: p.moule_ref||'' }
  }).filter(p => p.actif && p.w !== null)
}

// Helper — rebuild Proctor curve from pnRes
function buildProctorCurve(pnRes) {
  if (!pnRes?.points) return { pnCalcs: [], poly: null, wOPN: null, rhoOPN: null }
  const pnCalcs = pnRes.points.map(p => calcPNPoint(p, pnRes.m_moule, pnRes.v_moule))
  const validForPoly = pnCalcs.filter(c => c.w!==null && c.rho_d!==null)
  let poly=null, wOPN=null, rhoOPN=null
  try {
    if (validForPoly.length>=3) {
      poly = polyFit2(validForPoly.map(c=>({x:c.w,y:c.rho_d})))
      if (poly) {
        wOPN = rnd(-poly.c1/(2*poly.c2),2)
        rhoOPN = wOPN!==null ? rnd(evalPoly2(poly,wOPN),3) : null
      }
    }
  } catch {}
  wOPN   = wOPN   ?? pnRes.wOPN_corr   ?? pnRes.wOPN   ?? null
  rhoOPN = rhoOPN ?? pnRes.rho_d_OPN_corr ?? pnRes.rho_d_OPN ?? null
  return { pnCalcs, poly, wOPN, rhoOPN }
}

function initIPILectures(saved) {
  if (Array.isArray(saved) && saved.length) {
    const byDepth = Object.fromEntries(saved.map(l => [l.depth, l.force]))
    return IPI_DEPTHS.map(d => ({ depth: d, force: byDepth[d] ?? '' }))
  }
  return IPI_DEPTHS.map(d => ({ depth: d, force: '' }))
}

function initIPITests(res) {
  if (Array.isArray(res?.tests) && res.tests.length) {
    return res.tests.map((t, idx) => ({
      id: t.id ?? idx + 1,
      actif: t.actif !== false,
      pn_point_id: t.pn_point_id ?? '',
      pn_point_w: t.pn_point_w ?? null,
      pn_point_rho_d: t.pn_point_rho_d ?? null,
      moule_ref: t.moule_ref ?? '',
      anneau_ref: t.anneau_ref ?? '',
      facteur_k: t.facteur_k ?? null,
      mode_saisie: t.mode_saisie ?? 'kn',
      delta0: t.delta0 ?? 0,
      correction_mode: t.correction_mode ?? (num(t.delta0) > 0 ? 'delta0' : 'auto'),
      delta0_manual: t.delta0_manual ?? t.delta0 ?? '',
      correction_low: t.correction_low ?? 1.0,
      correction_high: t.correction_high ?? 3.0,
      lectures: initIPILectures(t.lectures),
    }))
  }
  return [{ id: 1, actif: true, pn_point_id: '', pn_point_w: null, pn_point_rho_d: null, moule_ref: '', anneau_ref: '', facteur_k: null, mode_saisie: 'kn', delta0: 0, correction_mode: 'auto', delta0_manual: '', correction_low: 1.0, correction_high: 3.0, lectures: initIPILectures(null) }]
}

function IPIForm({ res, onChange, readOnly, essai }) {
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
                <th className="px-3 py-2 text-right text-[11px] font-bold text-accent">IPI (%)</th>
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
                    <td className={`px-3 py-1.5 text-right font-bold text-[14px] ${c.ipi!==null?'text-accent':'text-text-muted'}`}>{c.ipi??'—'}</td>
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
                            className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}>
                            <option value="">— choisir —</option>
                            {pnPoints.map(p=>(
                              <option key={p.id} value={String(p.id)}>
                                P{p.id} — w={p.w}%{p.rho_d?` · ρd=${p.rho_d}`:''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input value={t.pn_point_id} onChange={e=>setTestField(testIdx,'pn_point_id',e.target.value)}
                            placeholder="N° point" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
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
                          className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${(t.mode_saisie||'kn')==='kn'?'bg-accent text-white border-accent':'border-border text-text-muted'}`}>
                          kN direct
                        </button>
                        <button onClick={()=>setTestField(testIdx,'mode_saisie','mm')}
                          className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${t.mode_saisie==='mm'?'bg-accent text-white border-accent':'border-border text-text-muted'}`}
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
                          className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}>
                          <option value="auto">Auto</option>
                          <option value="delta0">δ₀ manuel</option>
                          <option value="line">Droite manuelle</option>
                        </select>
                      </FG>
                      {(t.correction_mode||'auto')==='delta0' && (
                        <FG label="δ₀ manuel (mm)">
                          <input type="number" step="0.01" min="0" value={t.delta0_manual||''} placeholder="0"
                            onChange={e=>setTestField(testIdx,'delta0_manual',e.target.value)}
                            className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                        </FG>
                      )}
                      {(t.correction_mode||'auto')==='line' && (
                        <div className="grid grid-cols-2 gap-2">
                          <FG label="Point bas (mm)">
                            <input type="number" step="0.1" min="0" value={t.correction_low ?? ''}
                              onChange={e=>setTestField(testIdx,'correction_low',e.target.value)}
                              className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                          </FG>
                          <FG label="Point haut (mm)">
                            <input type="number" step="0.1" min="0" value={t.correction_high ?? ''}
                              onChange={e=>setTestField(testIdx,'correction_high',e.target.value)}
                              className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
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
                                <td className={`px-2 py-0.5 text-[11px] ${isKey?'font-bold text-accent':isKeyCorr?'text-[#854f0b]':isCorrHelper?'text-text-muted italic':'text-text-muted'}`}>
                                  {l.depth}{isKey&&<span className="ml-0.5 text-[9px]">★</span>}{isCorrHelper&&<span className="ml-0.5 text-[9px] opacity-50">c</span>}
                                </td>
                                <td className="px-1 py-0.5">
                                  <input type="number" step="0.01" value={rawVal}
                                    onChange={e=>setLecture(testIdx,depthIdx,e.target.value)}
                                    placeholder="—"
                                    className={`w-full px-2 py-1 border rounded text-[12px] bg-bg outline-none text-right ${isKey?'border-accent':'border-border'} focus:border-accent`}
                                    tabIndex={0}/>
                                </td>
                                <td className={`px-2 py-0.5 text-right text-[11px] font-bold ${cbr!==null?'text-accent':'text-text-muted opacity-30'}`}>
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
// ═══════════════════════════════════════════════════════════════════════════════
// CBRi / CBR — NF P 94-078
//
// CBRi (immédiat) : poinçonnement après compactage, surcharges annulaires
// CBR (après immersion) : 4 jours dans l'eau, mesure du gonflement, puis poinçon
//
// Même logique métier que l'IPI : choix du Proctor associé, puis poinçonnements liés aux points Proctor
// 1 anneau dynamométrique sur la presse, partagé par tous les essais
// Lectures aux profondeurs : 1.25 / 2.0 / 2.5★ / 5.0★ / 7.5 / 10.0 mm
// CBR = max(F_2.5/13.24, F_5.0/19.96) × 100
// Correction d'origine δ₀ par moule si concavité initiale (même principe IPI)
// ═══════════════════════════════════════════════════════════════════════════════


function IPICBRForm({ res, onChange, readOnly, essai, forcedMode = null }) {
  const mode = forcedMode || (() => {
    const code = String(essai?.essai_code || essai?.code_essai || '').toUpperCase()
    if (code === 'CBRI' || code === 'IM') return 'CBRi'
    return 'CBR'
  })()
  const isImmersed = mode === 'CBR'
  const [tests, setTests] = useState(() => initIPIMoules(res, mode))
  const [selectedPNUid, setSelectedPNUid] = useState(res.pn_uid ?? '')
  const [surchargeKg, setSurchargeKg] = useState(res.surcharge_kg ?? '')
  const [soakDays, setSoakDays] = useState(res.soak_days ?? '4')

  const echantillonId = essai?.echantillon_id
  const { data: siblingRaw } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled: Boolean(echantillonId),
  })
  const siblings = Array.isArray(siblingRaw) ? siblingRaw : (siblingRaw?.items || siblingRaw?.results || [])
  const pnSiblings = siblings.filter(e => {
    const c = String(e?.essai_code || e?.code_essai || '').toUpperCase()
    return c === 'PN' && String(e?.uid || '') !== String(essai?.uid || '')
  })
  const pnSibling = pnSiblings.length > 0
    ? (selectedPNUid ? pnSiblings.find(e => String(e.uid) === String(selectedPNUid)) ?? pnSiblings[0] : pnSiblings[0])
    : null
  const pnRes = pnSibling ? parseRes(pnSibling.resultats) : null
  const pnPoints = getPNPoints(pnRes)
  const { pnCalcs, poly: pnPoly, wOPN: pnWOPN, rhoOPN: pnRhoOPN } = buildProctorCurve(pnRes)
  const rhoRef = pnRes ? (pnRes.rho_d_OPN_corr ?? pnRes.rho_d_OPN ?? pnRhoOPN ?? null) : null

  const testCalcs = tests.map(t => calcCBRTestResult(t, { surcharge_kg: surchargeKg, soak_days: soakDays }))
  const bestValue = testCalcs.reduce((best, c) => c.cbr !== null && (best === null || c.cbr > best) ? c.cbr : best, null)

  function enrichTests(nextTests) {
    return nextTests.map(t => ({
      ...t,
      surcharge_kg: t.surcharge_kg === '' || t.surcharge_kg === null || t.surcharge_kg === undefined ? surchargeKg : t.surcharge_kg,
      soak_days: isImmersed ? (t.soak_days === '' || t.soak_days === null || t.soak_days === undefined ? soakDays : t.soak_days) : null,
      ...calcCBRTestResult(t, { surcharge_kg: surchargeKg, soak_days: soakDays }),
    }))
  }

  function emit(nextTests, nextPnUid = selectedPNUid, nextSurchargeKg = surchargeKg, nextSoakDays = soakDays) {
    const results = nextTests.map(t => ({
      ...t,
      surcharge_kg: t.surcharge_kg === '' || t.surcharge_kg === null || t.surcharge_kg === undefined ? nextSurchargeKg : t.surcharge_kg,
      soak_days: isImmersed ? (t.soak_days === '' || t.soak_days === null || t.soak_days === undefined ? nextSoakDays : t.soak_days) : null,
      ...calcCBRTestResult(t, { surcharge_kg: nextSurchargeKg, soak_days: nextSoakDays }),
    }))
    const active = results.filter(t => t.actif !== false)
    const best = active.reduce((acc, t) => t.cbr !== null && (acc === null || t.cbr > acc) ? t.cbr : acc, null)
    onChange(JSON.stringify({
      mode,
      pn_uid: nextPnUid ?? (pnSibling ? String(pnSibling.uid) : ''),
      surcharge_kg: nextSurchargeKg === '' ? null : num(nextSurchargeKg),
      soak_days: isImmersed ? (nextSoakDays === '' ? null : num(nextSoakDays)) : null,
      tests: results,
      moules: results,
      cbr: best,
    }))
  }

  function setTestField(i, k, v) {
    const u = tests.map((t, idx) => idx === i ? { ...t, [k]: v } : t)
    setTests(u)
    emit(u)
  }
  function setTestBatch(i, updates) {
    const u = tests.map((t, idx) => idx === i ? { ...t, ...updates } : t)
    setTests(u)
    emit(u)
  }
  function setLecture(ti, di, force) {
    const u = tests.map((t, i) => i !== ti ? t : { ...t, lectures: t.lectures.map((l, j) => j === di ? { ...l, force } : l) })
    setTests(u)
    emit(u)
  }
  function addTest() {
    const basePoint = pnPoints.length > 0 ? pnPoints[Math.min(tests.length, pnPoints.length - 1)] : null
    const u = [...tests, {
      id: tests.length + 1,
      actif: true,
      pn_point_id: basePoint ? String(basePoint.id) : '',
      pn_point_w: basePoint?.w ?? null,
      pn_point_rho_d: basePoint?.rho_d ?? null,
      moule_ref: basePoint?.moule_ref || '',
      m_moule: '',
      v_moule: '2131',
      m_tot: '',
      w: '',
      m1: '',
      m2: '',
      m3: '',
      anneau_ref: '',
      facteur_k: null,
      mode_saisie: 'kn',
      correction_mode: 'auto',
      delta0_manual: '',
      correction_low: 1.0,
      correction_high: 3.0,
      delta0: 0,
      gonf_ini: '',
      gonf_fin: '',
      h_moule: String(H_MOULE_CBR),
      surcharge_kg: surchargeKg,
      soak_days: isImmersed ? soakDays : null,
      lectures: initCBRLectures(null, '', ''),
    }]
    setTests(u)
    emit(u)
  }
  function removeTest(i) {
    if (tests.length <= 1) return
    const u = tests.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, id: idx + 1 }))
    setTests(u)
    emit(u)
  }
  function onSelectPN(uid) {
    setSelectedPNUid(uid)
    emit(tests, uid)
  }
  function onChangeGlobalSurcharge(value) {
    setSurchargeKg(value)
    const u = tests.map(t => ({ ...t, surcharge_kg: value }))
    setTests(u)
    emit(u, selectedPNUid, value)
  }
  function onChangeGlobalSoakDays(value) {
    setSoakDays(value)
    const u = tests.map(t => ({ ...t, soak_days: value }))
    setTests(u)
    emit(u, selectedPNUid, surchargeKg, value)
  }

  const overlayPoints = testCalcs
    .filter((t, idx) => tests[idx]?.pn_point_w !== null && tests[idx]?.pn_point_rho_d !== null && t.f_kn !== null)
    .map((t, idx) => ({
      w: num(tests[idx].pn_point_w),
      rho_d: num(tests[idx].pn_point_rho_d),
      label: `P${tests[idx].pn_point_id || idx + 1}`,
      ipi: t.cbr,
      f_kn: t.f_kn,
    }))

  const pnBlock = pnSiblings.length > 0 ? (
    <div className="px-4 py-3 rounded-lg border bg-[#e6f1fb] border-[#90bfe8] text-[12px] text-[#185fa5]">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-semibold">Proctor lié :</span>
        {pnSiblings.length === 1 ? (
          <span className="font-mono">{pnSibling?.reference || `#${pnSibling?.uid}`}</span>
        ) : (
          <select value={selectedPNUid || String(pnSiblings[0]?.uid || '')} onChange={e => onSelectPN(e.target.value)} className="px-2 py-0.5 border border-[#90bfe8] rounded text-[12px] bg-[#e6f1fb] text-[#185fa5] outline-none font-mono">
            {pnSiblings.map(e => <option key={e.uid} value={String(e.uid)}>{e.reference || `PN #${e.uid}`}</option>)}
          </select>
        )}
        <span className="opacity-70 font-normal">{isImmersed ? 'immergé + surcharge' : 'immédiat + surcharge'}</span>
      </div>
      <div className="flex gap-5 flex-wrap">
        {pnWOPN !== null && <span>wOPN=<strong>{pnWOPN}%</strong></span>}
        {rhoRef !== null && <span>ρd ref=<strong>{rhoRef} Mg/m³</strong></span>}
      </div>
      {pnPoints.length > 0 && (
        <div className="flex gap-3 flex-wrap text-[11px] opacity-80 mt-2">
          {pnPoints.map(p => (
            <span key={p.id}>P{p.id}: w={p.w}%{p.rho_d ? ` · ρd=${p.rho_d}` : ''}{p.moule_ref ? ` · ${p.moule_ref}` : ''}</span>
          ))}
        </div>
      )}
    </div>
  ) : (
    <div className="px-4 py-3 rounded-lg border border-dashed border-border text-[12px] text-text-muted">
      <span className="font-medium">Proctor (PN) non trouvé</span> — Créez d'abord un essai Proctor pour cet échantillon.
    </div>
  )

  const conditionsBlock = readOnly ? (
    <div className="px-4 py-3 rounded-lg border border-border bg-surface text-[12px] text-text">
      <div className="flex gap-6 flex-wrap">
        <span>Surcharge : <strong>{surchargeKg || '—'} kg</strong></span>
        {isImmersed ? <span>Immersion : <strong>{soakDays || '4'} jours</strong></span> : <span>Essai immédiat avec surcharge</span>}
      </div>
    </div>
  ) : (
    <Card title="Conditions d'essai">
      <div className="grid grid-cols-3 gap-3">
        <FG label="Surcharge (kg)">
          <input type="number" step="0.1" value={surchargeKg} onChange={e => onChangeGlobalSurcharge(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
        </FG>
        {isImmersed ? (
          <FG label="Immersion (jours)">
            <input type="number" step="1" min="1" value={soakDays} onChange={e => onChangeGlobalSoakDays(e.target.value)} className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
        ) : (
          <div className="flex items-end pb-2 text-[12px] text-text-muted">Essai immédiat avec surcharge, sans immersion.</div>
        )}
      </div>
    </Card>
  )

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        {pnBlock}
        {conditionsBlock}
        {bestValue !== null && (
          <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center">
            <div className="text-[32px] font-bold text-[#3b6d11] leading-none">{bestValue}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">{mode} (%) — valeur retenue</div>
          </div>
        )}
        {pnRes && pnPoints.length > 0 && overlayPoints.length > 0 && (
          <Card title={`Courbe Proctor — ${pnSibling?.reference || 'PN'} avec points ${mode}`}>
            <ProctorChart points={pnRes.points.map(p => ({ ...p, actif: p.actif !== false }))} calcs={pnCalcs} poly={pnPoly} wOPN={pnWOPN} rhoOPN={pnRhoOPN} correction={null} gs={pnRes.gs_fin ?? '2.70'} ipiPoints={overlayPoints} />
          </Card>
        )}
        <Card title="Courbes poinçonnement F = f(profondeur)">
          <IPIChart tests={tests} testCalcs={testCalcs} height={500} readOnly={true}/>
        </Card>
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Poinç.</th>
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Point PN</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w (%)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">δ0 (mm)</th>
                {isImmersed && <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">Gonfl. (%)</th>}
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 2.5</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 5.0</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 2.5 corr.</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">CBR 5.0 corr.</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-accent">{mode} (%)</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t, i) => {
                const c = testCalcs[i]
                const color = IPI_COLORS[i % IPI_COLORS.length]
                return (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-1.5 text-[12px] font-bold" style={{ color }}>P{i + 1}</td>
                    <td className="px-3 py-1.5 text-[12px]">P{t.pn_point_id || '?'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{t.pn_point_w ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.delta0_used ?? 0}</td>
                    {isImmersed && <td className="px-3 py-1.5 text-right text-[12px]">{c.gonf ?? '—'}</td>}
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr25 ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr50 ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{(c.delta0_used || 0) > 0 ? c.cbr25c ?? '—' : '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{(c.delta0_used || 0) > 0 ? c.cbr50c ?? '—' : '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-bold text-[14px] ${c.cbr !== null ? 'text-accent' : 'text-text-muted'}`}>{c.cbr ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {pnBlock}
      {conditionsBlock}
      {bestValue !== null && (
        <div className="flex items-center gap-3 px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start">
          <div>
            <div className="text-[30px] font-bold text-[#3b6d11] leading-none">{bestValue}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1">{mode} (%) — valeur retenue (max des poinçonnements)</div>
          </div>
        </div>
      )}

      <div className="flex gap-4 items-start">
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto">
            <div className="flex gap-3" style={{ minWidth: `${tests.length * 182}px` }}>
              {tests.map((t, testIdx) => {
                const c = testCalcs[testIdx]
                const color = IPI_COLORS[testIdx % IPI_COLORS.length]
                const facteurK = num(t.facteur_k)
                return (
                  <div key={testIdx} className="w-[200px] shrink-0 border border-border rounded-[10px] overflow-hidden" style={{ borderColor: color + '44' }}>
                    <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: color + '44', background: color + '11' }}>
                      <span className="text-[11px] font-bold uppercase" style={{ color }}>Poinç. {testIdx + 1}</span>
                      {tests.length > 1 && <button onClick={() => removeTest(testIdx)} className="text-[11px] text-text-muted hover:text-danger" tabIndex={0}>×</button>}
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      <FG label="Point Proctor">
                        {pnPoints.length > 0 ? (
                          <select value={t.pn_point_id || ''} onChange={e => {
                            const pid = e.target.value
                            const pt = pnPoints.find(p => String(p.id) === pid)
                            setTestBatch(testIdx, {
                              pn_point_id: pid,
                              pn_point_w: pt?.w ?? null,
                              pn_point_rho_d: pt?.rho_d ?? null,
                              moule_ref: pt?.moule_ref || t.moule_ref,
                            })
                          }} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}>
                            <option value="">— choisir —</option>
                            {pnPoints.map(p => (
                              <option key={p.id} value={String(p.id)}>
                                P{p.id} — w={p.w}%{p.rho_d ? ` · ρd=${p.rho_d}` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input value={t.pn_point_id} onChange={e => setTestField(testIdx, 'pn_point_id', e.target.value)} placeholder="N° point" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                        )}
                      </FG>
                      {t.pn_point_w !== null && (
                        <div className="text-[10px] text-text-muted px-1">w={t.pn_point_w}%{t.pn_point_rho_d ? ` · ρd=${t.pn_point_rho_d}` : ''}{t.moule_ref ? ` · ${t.moule_ref}` : ''}</div>
                      )}

                      <FG label="Anneau / capteur">
                        <AnnauSelect value={t.anneau_ref || ''} disabled={false} onSelect={({ code, facteur_k }) => setTestBatch(testIdx, {
                          anneau_ref: code,
                          facteur_k: facteur_k ?? t.facteur_k ?? null,
                        })}/>
                      </FG>
                      {facteurK !== null && (
                        <div className="text-[10px] text-text-muted px-1">k = {facteurK} kN/div</div>
                      )}

                      <div className="flex gap-1">
                        <button onClick={() => setTestField(testIdx, 'mode_saisie', 'kn')} className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${(t.mode_saisie || 'kn') === 'kn' ? 'bg-accent text-white border-accent' : 'border-border text-text-muted'}`}>kN direct</button>
                        <button onClick={() => setTestField(testIdx, 'mode_saisie', 'mm')} className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${t.mode_saisie === 'mm' ? 'bg-accent text-white border-accent' : 'border-border text-text-muted'}`} disabled={facteurK === null} title={facteurK === null ? 'Sélectionner un anneau avec facteur k' : undefined}>mm (comparateur)</button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <FG label="M_tot (g)"><input type="number" step="0.1" value={t.m_tot} onChange={e => setTestField(testIdx, 'm_tot', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
                        <FG label="w (%)"><input type="number" step="0.1" value={t.w} onChange={e => setTestField(testIdx, 'w', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
                      </div>
                      <div className="text-[10px] text-text-muted px-1">ρh={c.rho_h ?? '—'} · ρd={c.rho_d ?? '—'}</div>

                      {isImmersed ? (
                        <div className="grid grid-cols-2 gap-2">
                          <FG label="Gonf. ini (mm)"><input type="number" step="0.01" value={t.gonf_ini} onChange={e => setTestField(testIdx, 'gonf_ini', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" /></FG>
                          <FG label="Gonf. fin (mm)"><input type="number" step="0.01" value={t.gonf_fin} onChange={e => setTestField(testIdx, 'gonf_fin', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" /></FG>
                        </div>
                      ) : (
                        <div className="text-[10px] text-text-muted px-1">Essai immédiat avec surcharge, sans immersion.</div>
                      )}

                      <FG label="Mode correction">
                        <select value={t.correction_mode || 'auto'} onChange={e => {
                            const newMode = e.target.value
                            if (newMode === 'line') {
                              const lects = testCalcs.find((_,i) => i === testIdx)?.lectures || t.lectures
                              const autoCorr = detectAutoCorrectionLine(lects)
                              const low  = autoCorr?.x1 != null ? autoCorr.x1 : (t.correction_low ?? 1.0)
                              const high = autoCorr?.x2 != null ? autoCorr.x2 : (t.correction_high ?? 3.0)
                              setTestBatch(testIdx, { correction_mode: newMode, correction_low: low, correction_high: high })
                            } else {
                              setTestField(testIdx, 'correction_mode', newMode)
                            }
                          }} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}>
                          <option value="auto">Auto</option>
                          <option value="delta0">δ₀ manuel</option>
                          <option value="line">Droite manuelle</option>
                        </select>
                      </FG>
                      {(t.correction_mode || 'auto') === 'delta0' && (
                        <FG label="δ₀ manuel (mm)">
                          <input type="number" step="0.01" min="0" value={t.delta0_manual || ''} onChange={e => setTestField(testIdx, 'delta0_manual', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                        </FG>
                      )}
                      {(t.correction_mode || 'auto') === 'line' && (
                        <div className="grid grid-cols-2 gap-2">
                          <FG label="Point bas (mm)"><input type="number" step="0.1" min="0" value={t.correction_low ?? ''} onChange={e => setTestField(testIdx, 'correction_low', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
                          <FG label="Point haut (mm)"><input type="number" step="0.1" min="0" value={t.correction_high ?? ''} onChange={e => setTestField(testIdx, 'correction_high', e.target.value)} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
                        </div>
                      )}
                      {(c?.correction_line?.x1 !== null && c?.correction_line?.x2 !== null) && (
                        <div className="text-[10px] text-text-muted px-1">droite: bas={rnd(c.correction_line.x1, 2)} mm / {c.correction_line.y1 !== null ? rnd(c.correction_line.y1, 3) : '—'} kN · haut={rnd(c.correction_line.x2, 2)} mm / {c.correction_line.y2 !== null ? rnd(c.correction_line.y2, 3) : '—'} kN</div>
                      )}
                      {(c?.delta0_used || 0) > 0 && (
                        <div className="text-[10px] text-[#854f0b] bg-[#faeeda] border border-[#e0c070] rounded px-2 py-1">δ₀ utilisé={c.delta0_used} mm · source={c.delta0_source || 'auto'}</div>
                      )}

                      <table className="w-full border-collapse text-sm mt-1">
                        <thead>
                          <tr className="bg-bg border-b border-border">
                            <th className="px-2 py-1 text-left text-[10px] font-medium text-text-muted">d (mm)</th>
                            <th className="px-2 py-1 text-right text-[10px] font-medium text-text-muted">{(t.mode_saisie || 'kn') === 'mm' ? 'Div.' : 'F (kN)'}</th>
                            <th className="px-2 py-1 text-right text-[10px] font-medium text-text-muted">CBR%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(t.lectures || []).map((l, depthIdx) => {
                            const isKey = l.depth === 2.5 || l.depth === 5.0
                            const isCorrHelper = l.depth === 3.0 || l.depth === 12.0
                            const d0v = num(c?.delta0_used) || 0
                            const isKeyCorr = d0v > 0 && (Math.abs(l.depth - (2.5 + d0v)) < 0.05 || Math.abs(l.depth - (5.0 + d0v)) < 0.05)
                            const rawVal = l.force
                            const fKn = (t.mode_saisie || 'kn') === 'mm' && facteurK !== null && num(rawVal) !== null ? rnd(num(rawVal) * facteurK, 4) : num(rawVal)
                            const localCbr = l.depth === 2.5 && fKn !== null ? rnd(fKn / F_REF_2_5 * 100, 1)
                              : l.depth === 5.0 && fKn !== null ? rnd(fKn / F_REF_5_0 * 100, 1) : null
                            return (
                              <tr key={depthIdx} className={`border-b border-border ${isKey ? 'bg-[#f0f7ff]' : isKeyCorr ? 'bg-[#fef3c7]' : isCorrHelper ? 'bg-[#f8f8f6]' : ''}`}>
                                <td className={`px-2 py-0.5 text-[11px] ${isKey ? 'font-bold text-accent' : isKeyCorr ? 'text-[#854f0b]' : isCorrHelper ? 'text-text-muted italic' : 'text-text-muted'}`}>
                                  {l.depth}{isKey && <span className="ml-0.5 text-[9px]">★</span>}
                                </td>
                                <td className="px-1 py-0.5">
                                  <input type="number" step="0.01" value={rawVal} onChange={e => setLecture(testIdx, depthIdx, e.target.value)} placeholder="—" className={`w-full px-2 py-1 border rounded text-[12px] bg-bg outline-none text-right ${isKey ? 'border-accent' : 'border-border'} focus:border-accent`} tabIndex={0}/>
                                </td>
                                <td className={`px-2 py-0.5 text-right text-[11px] font-bold ${localCbr !== null ? 'text-accent' : 'text-text-muted opacity-30'}`}>{localCbr ?? ''}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>

                      {c.cbr !== null && (
                        <div className="mt-2 p-2 rounded-lg border text-center" style={{ background: color + '11', borderColor: color + '44' }}>
                          <div className="text-[22px] font-bold leading-none" style={{ color }}>{c.cbr}</div>
                          <div className="text-[10px] mt-0.5 text-text-muted">{mode}% ({c.controlling}){(c?.delta0_used || 0) > 0 ? ' corr.' : ''}</div>
                          {(c?.delta0_used || 0) > 0 && c.cbrRaw !== null && c.cbrRaw !== c.cbr && <div className="text-[10px] text-text-muted">brut: {c.cbrRaw}</div>}
                          {isImmersed && c.gonf !== null && <div className="text-[10px] text-text-muted">gonfl.: {c.gonf}%</div>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <button onClick={addTest} className="self-start text-[12px] text-text-muted hover:text-text border border-dashed border-border rounded px-4 py-2 transition-colors" tabIndex={0}>
            + Ajouter un poinçonnement
          </button>
        </div>

        <div className="flex-1 flex flex-col" style={{ minWidth: '260px', alignSelf: 'stretch' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">F = f(profondeur) — temps réel</div>
          <div className="flex-1" style={{ minHeight: '300px' }}>
            <IPIChart tests={tests} testCalcs={testCalcs} height={null}/>
          </div>
          <p className="text-[10px] text-text-muted italic mt-1">★ = 2.5 et 5.0mm. Pointillé = δ₀.</p>
        </div>
      </div>

      {pnRes && pnPoints.length > 0 && overlayPoints.length > 0 && (
        <Card title={`Courbe Proctor — ${pnSibling?.reference || 'PN'} avec points ${mode}`}>
          <ProctorChart points={pnRes.points.map(p => ({ ...p, actif: p.actif !== false }))} calcs={pnCalcs} poly={pnPoly} wOPN={pnWOPN} rhoOPN={pnRhoOPN} correction={null} gs={pnRes.gs_fin ?? '2.70'} ipiPoints={overlayPoints}/>
        </Card>
      )}
    </div>
  )
}

function CBRIForm(props) {
  return <IPICBRForm {...props} forcedMode="CBRi" />
}

function CBRForm(props) {
  return <IPICBRForm {...props} forcedMode="CBR" />
}

function CompatibilityPanel({ title, fields, readOnly, values, onFieldChange, summary = null }) {
    return (
        <div className="flex flex-col gap-4">
            {summary ? (
                <div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg">
                    <div className="text-[12px] font-medium text-[#185fa5]">{summary}</div>
                </div>
            ) : null}
            <Card title={title}>
                <div className="grid grid-cols-2 gap-3">
                    {fields.map(field => (
                        <FG key={field.key} label={field.label}>
                            {field.type === 'textarea' ? (
                                <textarea
                                    value={values[field.key] ?? ''}
                                    onChange={event => onFieldChange(field.key, event.target.value, field.type)}
                                    rows={field.rows || 3}
                                    disabled={readOnly}
                                    className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent resize-y disabled:opacity-60"
                                />
                            ) : (
                                <Input
                                    type={field.type || 'text'}
                                    value={values[field.key] ?? ''}
                                    onChange={event => onFieldChange(field.key, event.target.value, field.type)}
                                    disabled={readOnly}
                                />
                            )}
                        </FG>
                    ))}
                </div>
            </Card>
        </div>
    )
}

function buildCompatibilityForm(defaults, fields, title, summary = null) {
    return function CompatibilityForm({ res, onChange, readOnly }) {
        const initial = (() => {
            if (res && typeof res === 'object' && !Array.isArray(res)) {
                return { ...defaults, ...res }
            }
            return { ...defaults }
        })()
        const [values, setValues] = useState(initial)

        useEffect(() => {
            if (res && typeof res === 'object' && !Array.isArray(res)) {
                setValues({ ...defaults, ...res })
            } else {
                setValues({ ...defaults })
            }
        }, [res])

        function handleFieldChange(key, rawValue, type) {
            const nextValue = type === 'number'
                ? (rawValue === '' ? '' : rawValue)
                : rawValue
            const next = { ...values, [key]: nextValue }
            setValues(next)
            const payload = {}
            Object.keys(next).forEach(currentKey => {
                const field = fields.find(item => item.key === currentKey)
                if (field?.type === 'number') {
                    payload[currentKey] = next[currentKey] === '' ? null : num(next[currentKey])
                } else {
                    payload[currentKey] = next[currentKey]
                }
            })
            onChange(JSON.stringify(payload))
        }

        return (
            <CompatibilityPanel
                title={title}
                fields={fields}
                readOnly={readOnly}
                values={values}
                onFieldChange={handleFieldChange}
                summary={summary}
            />
        )
    }
}

function LimitesAtterberg({ res, onChange, readOnly }) {
    const initial = {
        wl: res?.wl ?? '',
        wp: res?.wp ?? '',
        ip: res?.ip ?? '',
        wnat: res?.wnat ?? '',
    }
    const [values, setValues] = useState(initial)

    useEffect(() => {
        setValues({
            wl: res?.wl ?? '',
            wp: res?.wp ?? '',
            ip: res?.ip ?? '',
            wnat: res?.wnat ?? '',
        })
    }, [res])

    const wlNum = num(values.wl)
    const wpNum = num(values.wp)
    const computedIp = wlNum !== null && wpNum !== null ? rnd(wlNum - wpNum, 3) : num(values.ip)

    function emit(nextValues) {
        onChange(JSON.stringify({
            wl: nextValues.wl === '' ? null : num(nextValues.wl),
            wp: nextValues.wp === '' ? null : num(nextValues.wp),
            ip: computedIp,
            wnat: nextValues.wnat === '' ? null : num(nextValues.wnat),
        }))
    }

    function updateField(key, rawValue) {
        const next = { ...values, [key]: rawValue }
        if ((key === 'wl' || key === 'wp') && num(next.wl) !== null && num(next.wp) !== null) {
            next.ip = String(rnd(num(next.wl) - num(next.wp), 3))
        }
        setValues(next)
        onChange(JSON.stringify({
            wl: next.wl === '' ? null : num(next.wl),
            wp: next.wp === '' ? null : num(next.wp),
            ip: next.ip === '' ? null : num(next.ip),
            wnat: next.wnat === '' ? null : num(next.wnat),
        }))
    }

    if (readOnly) {
        return (
            <div className="flex flex-col gap-4">
                <div className="flex gap-3 flex-wrap">
                    {wlNum !== null ? (
                        <div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center">
                            <div className="text-[26px] font-bold text-[#185fa5] leading-none">{wlNum} %</div>
                            <div className="text-[11px] text-[#185fa5] mt-1 font-medium">wL</div>
                        </div>
                    ) : null}
                    {wpNum !== null ? (
                        <div className="px-5 py-3 bg-[#f5efe5] border border-[#d5c2a4] rounded-lg text-center">
                            <div className="text-[26px] font-bold text-[#7a5c2e] leading-none">{wpNum} %</div>
                            <div className="text-[11px] text-[#7a5c2e] mt-1 font-medium">wP</div>
                        </div>
                    ) : null}
                    {computedIp !== null ? (
                        <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center">
                            <div className="text-[26px] font-bold text-[#3b6d11] leading-none">{computedIp} %</div>
                            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">Ip</div>
                        </div>
                    ) : null}
                </div>
                <Card title="Limites d'Atterberg">
                    <div className="grid grid-cols-4 gap-4">
                        <FR label="wL" value={wlNum !== null ? `${wlNum} %` : null} />
                        <FR label="wP" value={wpNum !== null ? `${wpNum} %` : null} />
                        <FR label="Ip" value={computedIp !== null ? `${computedIp} %` : null} />
                        <FR label="Wn" value={num(values.wnat) !== null ? `${num(values.wnat)} %` : null} />
                    </div>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <Card title="Limites d'Atterberg">
                <div className="grid grid-cols-4 gap-3">
                    <FG label="wL (%)">
                        <Input type="number" step="0.01" value={values.wl} onChange={event => updateField('wl', event.target.value)} />
                    </FG>
                    <FG label="wP (%)">
                        <Input type="number" step="0.01" value={values.wp} onChange={event => updateField('wp', event.target.value)} />
                    </FG>
                    <FG label="Ip (%)">
                        <Input type="number" step="0.01" value={values.ip} onChange={event => updateField('ip', event.target.value)} />
                    </FG>
                    <FG label="Wn (%)">
                        <Input type="number" step="0.01" value={values.wnat} onChange={event => updateField('wnat', event.target.value)} />
                    </FG>
                </div>
            </Card>
        </div>
    )
}

const ExtractionLiant = buildCompatibilityForm(
    {
        heure: '',
        teneur_liant_percent: '',
        teneur_liant_ext_percent: '',
        module_richesse: '',
        module_richesse_ext: '',
        surface_specifique: '',
        commentaires: '',
    },
    [
        { key: 'heure', label: 'Heure', type: 'text' },
        { key: 'teneur_liant_percent', label: 'Liant (%)', type: 'number' },
        { key: 'teneur_liant_ext_percent', label: 'Liant extrait (%)', type: 'number' },
        { key: 'module_richesse', label: 'Module de richesse', type: 'number' },
        { key: 'module_richesse_ext', label: 'Module de richesse extrait', type: 'number' },
        { key: 'surface_specifique', label: 'Surface spécifique', type: 'number' },
        { key: 'commentaires', label: 'Commentaires', type: 'textarea', rows: 3 },
    ],
    'Extraction de liant',
    'Shim de compatibilité réintroduit pour éviter le crash du runtime.'
)

const ControleFabricationEnrobes = buildCompatibilityForm(
    {
        heure: '',
        temperature: '',
        teneur_liant_percent: '',
        module_richesse: '',
        remarques: '',
    },
    [
        { key: 'heure', label: 'Heure', type: 'text' },
        { key: 'temperature', label: 'Température (°C)', type: 'number' },
        { key: 'teneur_liant_percent', label: 'Liant (%)', type: 'number' },
        { key: 'module_richesse', label: 'Module de richesse', type: 'number' },
        { key: 'remarques', label: 'Remarques', type: 'textarea', rows: 3 },
    ],
    'Contrôle fabrication enrobés',
    'Shim de compatibilité réintroduit pour éviter le crash du runtime.'
)

const IdentificationGTR = buildCompatibilityForm(
    {
        classification_gtr: '',
        sous_classe: '',
        commentaire: '',
    },
    [
        { key: 'classification_gtr', label: 'Classe GTR', type: 'text' },
        { key: 'sous_classe', label: 'Sous-classe', type: 'text' },
        { key: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 3 },
    ],
    'Identification GTR',
    'Shim de compatibilité réintroduit pour éviter le crash du runtime.'
)

const MasseVolumiqueEnrobes = buildCompatibilityForm(
    {
        masse_air: '',
        masse_eau: '',
        masse_surface_saturee: '',
        masse_volumique: '',
        commentaire: '',
    },
    [
        { key: 'masse_air', label: 'Masse à l’air (g)', type: 'number' },
        { key: 'masse_eau', label: 'Masse dans l’eau (g)', type: 'number' },
        { key: 'masse_surface_saturee', label: 'Masse SSD (g)', type: 'number' },
        { key: 'masse_volumique', label: 'Masse volumique', type: 'number' },
        { key: 'commentaire', label: 'Commentaire', type: 'textarea', rows: 3 },
    ],
    'Masse volumique des enrobés',
    'Shim de compatibilité réintroduit pour éviter le crash du runtime.'
)

const ESSAI_FORMS = {
  'WE': TeneurEnEau,
  'GR': Granulometrie,
  'EL': ExtractionLiant,
  'CFE': ControleFabricationEnrobes,
  'VBS': BleuMethylene,
  'BM': BleuMethylene,
  'MB':  BleuMethylene,
  'MBF': BleuMethylene,
  'LCP': LimitesAtterberg,
  // 'ES':  EquivalentSable,
  'PN':  Proctor,
  'IPI':  IPIForm,
  'IM':  CBRIForm,
  'CBRI': CBRIForm,
  'CBR':  CBRForm,
  'ID':  IdentificationGTR,
  'MVA': MasseVolumiqueEnrobes,
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function EssaiPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const isNew = uid === 'new'
  const echantillonIdParam = searchParams.get('echantillon_id') || ''
  const echantillonId = Number.parseInt(echantillonIdParam, 10)
  const linkedEchantillonId = Number.isInteger(echantillonId) && echantillonId > 0 ? echantillonId : null
  const initialEssaiCode = searchParams.get('essai_code') || ''

  const initResultats = searchParams.get('init_resultats') || '{}'
  const initMeta = {
    type_essai: searchParams.get('type_essai') || '',
    norme:      searchParams.get('norme')      || '',
    statut:     'Programmé', operateur: '', date_debut: '', date_fin: '',
  }

  const [editing,  setEditing]  = useState(isNew)
  const [resJson,  setResJson]  = useState(isNew ? initResultats : null)
  const [metaForm, setMetaForm] = useState(isNew ? initMeta : {})
  function setMeta(k, v) {
    setMetaForm(f => {
      const next = { ...f, [k]: v }
      if (k === 'date_fin') next.statut = v ? 'Terminé' : (next.statut || 'Programmé')
      return next
    })
  }

  const { data: essai, isLoading, isError } = useQuery({
    queryKey: ['essai', String(uid)],
    queryFn:  () => api.get(`/essais/${uid}`),
    enabled:  !isNew,
  })
  const {
    data: linkedEchantillon,
    isLoading: isLinkedEchantillonLoading,
    isError: isLinkedEchantillonError,
  } = useQuery({
    queryKey: ['echantillon', String(linkedEchantillonId)],
    queryFn:  () => api.get(`/essais/echantillons/${linkedEchantillonId}`),
    enabled:  isNew && !!linkedEchantillonId,
  })
  const { data: meta } = useQuery({
    queryKey: ['essais-meta'],
    queryFn:  () => api.get('/essais/meta'),
    staleTime: Infinity,
  })

  const saveMut = useMutation({
    mutationFn: (d) => isNew
      ? api.post('/essais', {
          ...d,
          echantillon_id: linkedEchantillonId,
          essai_code: initialEssaiCode,
        })
      : api.put(`/essais/${uid}`, d),
    onSuccess: (saved) => {
      const echId = saved.echantillon_id || linkedEchantillonId
      if (echId) qc.invalidateQueries({ queryKey: ['essais-ech', String(echId)] })
      if (isNew) {
        qc.setQueryData(['essai', String(saved.uid)], saved)
        setEditing(false)
        setResJson(null)
        navigateWithReturnTo(navigate, `/essais/${saved.uid}`, resolveReturnTo(searchParams, saved.echantillon_id ? `/echantillons/${saved.echantillon_id}` : ''), { replace: true })
      } else {
        qc.setQueryData(['essai', String(uid)], saved)
        setEditing(false); setResJson(null)
      }
    },
  })

  function openEdit() {
    if (isNew) return
    setMetaForm(buildMetaFromEssai(currentEssai, initMeta))
    setResJson(essai.resultats || '{}')
    setEditing(true)
  }

  function handleSave() {
    if (isNew && !linkedEchantillonId) return
    saveMut.mutate({
      ...metaForm,
      statut: getStatusFromMeta(metaForm),
      date_debut: toDateInputValue(metaForm.date_debut) || null,
      date_fin: toDateInputValue(metaForm.date_fin) || null,
      resultats: resJson ?? currentEssai?.resultats ?? initResultats,
    })
  }

  if (!isNew && isLoading) return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  if (!isNew && (isError || !essai)) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Essai introuvable</p>
      <Button onClick={() => navigateBackWithFallback(navigate, searchParams, linkedEchantillonId ? `/echantillons/${linkedEchantillonId}` : '')} tabIndex={0}>← Retour</Button>
    </div>
  )

  if (isNew && !linkedEchantillonId) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Échantillon manquant</p>
      <Button onClick={() => navigateBackWithFallback(navigate, searchParams, linkedEchantillonId ? `/echantillons/${linkedEchantillonId}` : '')} tabIndex={0}>← Retour</Button>
    </div>
  )

  if (isNew && isLinkedEchantillonLoading) {
    return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  }

  if (isNew && (isLinkedEchantillonError || !linkedEchantillon)) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Échantillon introuvable</p>
      <Button onClick={() => navigateBackWithFallback(navigate, searchParams, linkedEchantillonId ? `/echantillons/${linkedEchantillonId}` : '')} tabIndex={0}>← Retour</Button>
    </div>
  )

  const currentEssai = isNew
    ? {
        uid: 'new',
        reference: '',
        echantillon_id: linkedEchantillonId,
        essai_code: initialEssaiCode,
        code_essai: initialEssaiCode,
        type_essai: metaForm.type_essai || initMeta.type_essai,
        norme: metaForm.norme || initMeta.norme,
        statut: getStatusFromMeta(metaForm),
        operateur: metaForm.operateur || '',
        date_debut: metaForm.date_debut || '',
        date_fin: metaForm.date_fin || '',
        resultats: resJson ?? initResultats,
        ech_ref: linkedEchantillon?.reference || '',
        echantillon_reference: linkedEchantillon?.reference || '',
        designation: linkedEchantillon?.designation || '',
        demande_ref: linkedEchantillon?.demande_ref || '',
        demande_reference: linkedEchantillon?.demande_reference || '',
        affaire_ref: linkedEchantillon?.affaire_ref || '',
        affaire_reference: linkedEchantillon?.affaire_reference || '',
      }
    : essai

  const editingMeta = editing
    ? {
        statut: getStatusFromMeta({
          statut: metaForm.statut ?? currentEssai?.statut,
          date_fin: metaForm.date_fin ?? currentEssai?.date_fin,
        }),
        operateur: metaForm.operateur ?? currentEssai?.operateur ?? '',
        date_debut: metaForm.date_debut ?? toDateInputValue(currentEssai?.date_debut),
        date_fin: metaForm.date_fin ?? toDateInputValue(currentEssai?.date_fin),
      }
    : null
  const childReturnTo = buildLocationTarget(location)
  const parentEchantillonUid = Number.parseInt(String(currentEssai?.echantillon_id || linkedEchantillonId || ''), 10) || null
  const fallbackReturnTo = resolveReturnTo(
    searchParams,
    parentEchantillonUid ? `/echantillons/${parentEchantillonUid}` : ''
  )
  const readOnlyDates = formatEssaiDateRange(currentEssai?.date_debut, currentEssai?.date_fin)
  const displayStatus = editing ? editingMeta?.statut : getStatusFromMeta(currentEssai)

  const res       = parseRes(editing ? (resJson ?? currentEssai?.resultats) : currentEssai?.resultats)
  const EssaiForm = ESSAI_FORMS[currentEssai?.essai_code] || ESSAI_FORMS[currentEssai?.code_essai]

  // Résultat principal à afficher dans le header (par type)
  // TODO: chaque nouveau type exposera son résultat principal ici
  const heroResult = (() => {
    if ((currentEssai?.essai_code === 'WE' || currentEssai?.code_essai === 'WE') && res.w_moyen != null)
      return { value: `${res.w_moyen} %`, label: 'w moyen' }
    if ((currentEssai?.essai_code === 'PN' || currentEssai?.code_essai === 'PN') && res.rho_d_OPN != null)
      return { value: `${res.rho_d_OPN_corr ?? res.rho_d_OPN} Mg/m³`, label: res.rho_d_OPN_corr ? `ρdOPN corr. — wOPN=${res.wOPN_corr??'?'}%` : `ρdOPN — wOPN=${res.wOPN??'?'}%` }
    if ((currentEssai?.essai_code === 'IPI' || currentEssai?.code_essai === 'IPI') && res.ipi != null)
      return { value: `${res.ipi}`, label: 'IPI (%)' }
    if (['CBRI','CBR','IM'].includes(currentEssai?.essai_code || currentEssai?.code_essai || '') && res.cbr_95 != null)
      return { value: `${res.cbr_95}`, label: `${res.mode || 'CBR'} à 95% OPN (%)` }
    if ((currentEssai?.essai_code === 'EL' || currentEssai?.code_essai === 'EL')) {
      const liant = extractLiantMetrics(res)
      if (liant.binderExt !== null) return { value: `${formatCompactNumber(liant.binderExt)} %`, label: 'Liant extrait' }
      if (liant.binder !== null) return { value: `${formatCompactNumber(liant.binder)} %`, label: 'Liant' }
    }
    if ((currentEssai?.essai_code === 'CFE' || currentEssai?.code_essai === 'CFE')) {
      const moyenne = res?.moyenne && typeof res.moyenne === 'object' ? res.moyenne : {}
      const temp = num(res?.temperature_prelevement_c ?? moyenne.temperature_c)
      const binderExt = num(moyenne.teneur_liant_ext_percent ?? res?.teneur_liant_ext_percent)
      if (temp !== null) return { value: `${formatCompactNumber(temp, 1)} °C`, label: 'Température prélèvement' }
      if (binderExt !== null) return { value: `${formatCompactNumber(binderExt)} %`, label: 'Liant extrait' }
    }
    return null
  })()

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Topbar */}
      <div className="flex items-center gap-3 px-6 py-3 bg-surface border-b border-border shrink-0 flex-wrap">
        <button onClick={() => navigateBackWithFallback(navigate, searchParams, fallbackReturnTo)}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors" tabIndex={0}>
          ← Retour
        </button>
        <span className="text-[13px] text-text-muted">
          {(currentEssai.demande_ref || currentEssai.demande_reference) && `${currentEssai.demande_ref || currentEssai.demande_reference} › `}
          {currentEssai.ech_ref && `${currentEssai.ech_ref} › `}
        </span>
        <span className="text-[14px] font-semibold flex-1">{currentEssai.type_essai || (isNew ? 'Nouvel essai' : `Essai #${uid}`)}</span>
        <Badge s={displayStatus} />
        {parentEchantillonUid ? (
          <Button size="sm" variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/echantillons/${parentEchantillonUid}`, childReturnTo)} tabIndex={0}>
            🧪 Échantillon
          </Button>
        ) : null}
        {editing ? (
          <>
            <Button onClick={() => {
              if (isNew) { navigateBackWithFallback(navigate, searchParams, fallbackReturnTo) }
              else { setEditing(false); setResJson(null) }
            }} tabIndex={0}>Annuler</Button>
            <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending} tabIndex={0}>
              {saveMut.isPending ? '…' : '✓ Enregistrer'}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="primary" onClick={openEdit} tabIndex={0}>✏️ Modifier</Button>
        )}
      </div>

      <div className="p-5 max-w-[1400px] mx-auto w-full flex flex-col gap-4">

        {/* Card infos — référence + échantillon */}
        <Card>
          {editing ? (
            <div className="grid grid-cols-3 gap-3">
              <FG label="Échantillon lié">
                <Input value={currentEssai.ech_ref || currentEssai.echantillon_reference || ''} readOnly className="text-text-muted" tabIndex={-1} />
              </FG>
              <FG label="Statut">
                <Select value={editingMeta.statut} onChange={e => setMeta('statut', e.target.value)} className={`w-full font-medium ${getStatusSelectClass(editingMeta.statut)}`} tabIndex={0}>
                  {['Programmé','En cours','Terminé','Annulé'].map(s => <option key={s}>{s}</option>)}
                </Select>
              </FG>
              <FG label="Opérateur">
                <Input value={editingMeta.operateur} onChange={e => setMeta('operateur', e.target.value)} tabIndex={0} />
              </FG>
              <FG label="Date début">
                <Input type="date" value={editingMeta.date_debut} onChange={e => setMeta('date_debut', e.target.value)} tabIndex={0} />
              </FG>
              <FG label="Date fin">
                <Input type="date" value={editingMeta.date_fin} onChange={e => setMeta('date_fin', e.target.value)} tabIndex={0} />
              </FG>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[18px] font-bold text-accent font-mono">
                  {currentEssai.reference || (isNew ? 'Brouillon non enregistré' : `ESSAI-${String(uid).padStart(4,'0')}`)}
                </div>
                <div className="flex flex-col gap-0.5 mt-1">
                  {(currentEssai.ech_ref || currentEssai.echantillon_reference) && (
                    <span className="text-[12px] text-text-muted">
                      Échantillon : <span className="font-medium text-text font-mono">{currentEssai.ech_ref || currentEssai.echantillon_reference}</span>
                      {currentEssai.designation ? ` — ${currentEssai.designation}` : ''}
                      {parentEchantillonUid ? (
                        <button
                          type="button"
                          onClick={() => navigateWithReturnTo(navigate, `/echantillons/${parentEchantillonUid}`, childReturnTo)}
                          className="ml-2 text-accent hover:underline"
                        >
                          Ouvrir
                        </button>
                      ) : null}
                    </span>
                  )}
                  {currentEssai.type_essai && (
                    <span className="text-[12px] text-text-muted">
                      {currentEssai.type_essai}{currentEssai.norme ? ` — ${currentEssai.norme}` : ''}
                    </span>
                  )}
                  {currentEssai.operateur && <span className="text-[12px] text-text-muted">Opérateur : {currentEssai.operateur}</span>}
                  {readOnlyDates && <span className="text-[12px] text-text-muted">Dates : {readOnlyDates}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge s={currentEssai.statut} />
                {heroResult && (
                  <div className="text-right">
                    <div className="text-[26px] font-bold text-accent leading-none">{heroResult.value}</div>
                    <div className="text-[11px] text-text-muted">{heroResult.label}</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Formulaire de saisie */}
        {EssaiForm ? (
          <EssaiForm res={res} onChange={setResJson} readOnly={!editing} essai={currentEssai} />
        ) : (
          <Card>
            <div className="text-center py-6">
              <p className="text-text-muted text-sm">
                Formulaire non disponible pour <strong>{currentEssai.type_essai || 'ce type'}</strong>.
              </p>
              <p className="text-[12px] text-text-muted mt-1">
                Types disponibles : {Object.keys(ESSAI_FORMS).join(', ')}
              </p>
            </div>
          </Card>
        )}

      </div>
    </div>
  )
}
