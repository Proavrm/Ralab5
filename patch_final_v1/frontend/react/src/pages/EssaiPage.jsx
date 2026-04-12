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
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/services/api'
import Button from '@/components/ui/Button'
import Input, { Select } from '@/components/ui/Input'

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

function parseJsonText(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw || {}
  try {
    const value = JSON.parse(String(raw))
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function extractImportContext(observations) {
  const payload = parseJsonText(observations)
  const importContext = payload.import_context
  return importContext && typeof importContext === 'object' ? importContext : null
}

function humanizeImportedKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatImportedPreviewValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non'
  return String(value)
}

function ImportedInterventionEssai({ essai, res }) {
  const importContext = extractImportContext(essai?.observations)
  const payload = Object.keys(res || {}).length ? res : (importContext?.grouped_payload || {})
  const rows = Array.isArray(payload?.points)
    ? payload.points
    : Array.isArray(payload?.rows)
      ? payload.rows
      : []
  const columns = rows.length ? Object.keys(rows.find((row) => row && typeof row === 'object') || {}) : []
  const scalarEntries = Object.entries(payload || {})
    .filter(([key, value]) => !['points', 'rows', 'source_sheets', 'source_files', 'header_snapshot'].includes(key) && value != null && value !== '' && typeof value !== 'object')

  return (
    <div className="flex flex-col gap-4">
      <Card title="Fiche importée / reprise manuelle">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FR label="Intervention" value={essai?.intervention_ref || essai?.intervention_reference || ''} />
            <FR label="Source" value={essai?.source_label || importContext?.source_label || ''} />
            <FR label="Code essai" value={essai?.essai_code || essai?.code_essai || ''} />
            <FR label="Référence affaire" value={essai?.affaire_ref || essai?.affaire_reference || ''} />
          </div>
          <div>
            <FR label="Demande" value={essai?.demande_ref || essai?.demande_reference || ''} />
            <FR label="Type intervention" value={essai?.intervention_type || ''} />
            <FR label="Sujet terrain" value={essai?.intervention_subject || ''} />
            <FR label="Sources groupées" value={importContext?.group_source_count || ''} />
          </div>
        </div>
        {importContext?.group_source_count > 1 && (!rows.length && !scalarEntries.length) ? (
          <div className="mt-2 text-[12px] leading-5 text-text-muted">
            Plusieurs feuilles historiques ont été regroupées sur cette intervention. Cette fiche d’essai sert de reprise métier dans `EssaiPage`, même si l’import d’origine ne détaille pas encore les valeurs séparées par feuille.
          </div>
        ) : null}
      </Card>

      {scalarEntries.length > 0 ? (
        <Card title="Synthèse importée">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            {scalarEntries.map(([key, value]) => (
              <FR key={key} label={humanizeImportedKey(key)} value={formatImportedPreviewValue(value)} />
            ))}
          </div>
        </Card>
      ) : null}

      {rows.length > 0 && columns.length > 0 ? (
        <Card title="Résultats importés">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg border-b border-border">
                  {columns.map((column) => (
                    <th key={column} className="px-2 py-2 text-left text-[11px] font-medium text-text-muted whitespace-nowrap">
                      {humanizeImportedKey(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`imported-row-${index}`} className="border-b border-border">
                    {columns.map((column) => (
                      <td key={column} className="px-2 py-1.5 text-[12px] text-text align-top whitespace-nowrap">
                        {formatImportedPreviewValue(row?.[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {!rows.length && !scalarEntries.length ? (
        <Card>
          <div className="text-[13px] text-text-muted">
            Aucun formulaire métier dédié n’est encore branché pour ce code d’essai. La fiche reste néanmoins centralisée dans `EssaiPage` et peut porter la reprise manuelle de l’essai terrain.
          </div>
        </Card>
      ) : null}
    </div>
  )
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
  const wExtras   = correction?.applicable && correction.w_corr!=null ? [correction.w_corr] : []
  const rhoExtras = correction?.applicable && correction.rho_corr!=null ? [correction.rho_corr] : []
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
                {p.label}{p.f_kn != null ? ` ${p.f_kn}kN` : ''}
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
  if (saved?.length) return saved
  // Migrate legacy f_2_5 / f_5_0 fields
  return CBR_DEPTHS.map(d => ({
    depth: d,
    force: d === 2.5 ? (f_2_5_legacy ?? '') : d === 5.0 ? (f_5_0_legacy ?? '') : ''
  }))
}

function initIPIMoules(res, mode) {
  if (res.moules?.length) return res.moules.map(m => ({
    ...m,
    lectures: initCBRLectures(m.lectures, m.f_2_5, m.f_5_0),
    delta0: m.delta0 ?? 0,
  }))
  const n = mode === 'IPI' ? 1 : 3
  const COUPS = [10, 25, 55]
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1, actif: true,
    nb_coups: mode === 'IPI' ? 25 : COUPS[i],
    moule_ref: '', m_moule: '', v_moule: '2131',
    m_tot: '', w: '', m1: '', m2: '', m3: '',
    lectures: initCBRLectures(null, '', ''),
    delta0: 0,
    gonf_ini: '', gonf_fin: '', h_moule: String(H_MOULE_CBR),
  }))
}

// calcCBRFromLectures — même logique que calcIPIFromLectures mais profondeurs CBR
// Correction d'origine δ₀ identique (NF P 94-078 §8)
function calcCBRFromLectures(lectures, delta0 = 0) {
  function interpF(d) {
    const pts = lectures.filter(l => num(l.force) !== null)
      .map(l => ({ d: l.depth, f: num(l.force) })).sort((a,b)=>a.d-b.d)
    if (!pts.length) return null
    if (d <= pts[0].d) return pts[0].f
    if (d >= pts.at(-1).d) return pts.at(-1).f
    for (let i=0; i<pts.length-1; i++) {
      if (pts[i].d <= d && pts[i+1].d >= d) {
        const t = (d-pts[i].d)/(pts[i+1].d-pts[i].d)
        return pts[i].f + t*(pts[i+1].f-pts[i].f)
      }
    }
    return null
  }
  const d0 = num(delta0) || 0
  const f25r = interpF(2.5), f50r = interpF(5.0)
  const f25c = d0 > 0 ? interpF(2.5+d0) : f25r
  const f50c = d0 > 0 ? interpF(5.0+d0) : f50r
  const cbr25  = f25r !== null ? rnd(f25r / F_REF_2_5 * 100, 1) : null
  const cbr50  = f50r !== null ? rnd(f50r / F_REF_5_0 * 100, 1) : null
  const cbr25c = f25c !== null ? rnd(f25c / F_REF_2_5 * 100, 1) : null
  const cbr50c = f50c !== null ? rnd(f50c / F_REF_5_0 * 100, 1) : null
  const cbrRaw  = (cbr25!==null||cbr50!==null) ? rnd(Math.max(cbr25??-Infinity,cbr50??-Infinity),1) : null
  const cbrCorr = (cbr25c!==null||cbr50c!==null) ? rnd(Math.max(cbr25c??-Infinity,cbr50c??-Infinity),1) : null
  const cbr = d0>0 ? cbrCorr : cbrRaw
  const ctrl = cbr25!==null&&cbr50!==null ? (cbr50>=cbr25?'5.0mm':'2.5mm') : (cbr25!==null?'2.5mm':cbr50!==null?'5.0mm':null)
  const ctrlC = cbr25c!==null&&cbr50c!==null ? (cbr50c>=cbr25c?'5.0mm':'2.5mm') : ctrl
  const f_kn = (d0>0?ctrlC:ctrl)==='2.5mm' ? (d0>0?f25c:f25r) : (d0>0?f50c:f50r)
  return { cbr25, cbr50, cbr25c, cbr50c, cbrRaw, cbrCorr, cbr, controlling: d0>0?ctrlC:ctrl, f_kn }
}

function CBRChart({ moules, calcs, rho95, cbr95, mode }) {
  const W = 500, H = 280, PL = 50, PR = 20, PT = 15, PB = 42
  const iW = W - PL - PR, iH = H - PT - PB
  const BG = '#ffffff', GRID = '#d4d2ca', TXT = '#888', ACC = '#3b82f6', REF = '#dc2626'

  const validPts = moules.map((m, i) => ({ ...m, ...calcs[i] }))
    .filter(m => m.actif && calcs[moules.indexOf(m)]?.rho_d !== null && calcs[moules.indexOf(m)]?.cbr !== null)
  const pts = moules.map((m, i) => ({ rho_d: calcs[i]?.rho_d, cbr: calcs[i]?.cbr, nb_coups: m.nb_coups, actif: m.actif }))
    .filter(p => p.actif && p.rho_d !== null && p.cbr !== null)

  if (pts.length < 1) return (
    <div className="flex items-center justify-center bg-bg border border-border rounded-lg" style={{ height: H }}>
      <span className="text-[12px] text-text-muted italic">Saisir ρd et F pour afficher la courbe</span>
    </div>
  )

  const allRho = pts.map(p => p.rho_d).concat(rho95 !== null ? [rho95] : [])
  const allCBR = pts.map(p => p.cbr).concat(cbr95 !== null ? [cbr95] : [])
  const rhoMin = Math.min(...allRho) - 0.04
  const rhoMax = Math.max(...allRho) + 0.04
  const cbrMin = 0
  const cbrMax = Math.max(...allCBR) * 1.25 + 3

  const xScale = r => PL + (r - rhoMin) / (rhoMax - rhoMin) * iW
  const yScale = c => PT + iH - (c - cbrMin) / (cbrMax - cbrMin) * iH

  const sorted = [...pts].sort((a, b) => a.rho_d - b.rho_d)
  const linePoints = sorted.map(p => `${xScale(p.rho_d).toFixed(1)},${yScale(p.cbr).toFixed(1)}`).join(' ')

  const rhoRange = rhoMax - rhoMin
  const rhoStep = rhoRange > 0.25 ? 0.05 : 0.02
  const xTicks = []
  for (let r = Math.ceil(rhoMin / rhoStep) * rhoStep; r <= rhoMax + 0.001; r += rhoStep)
    xTicks.push(rnd(r, 3))
  const cbrStep = cbrMax > 60 ? 10 : cbrMax > 25 ? 5 : 2
  const yTicks = []
  for (let c = 0; c <= cbrMax + 0.1; c += cbrStep) yTicks.push(c)

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg overflow-visible">
      <rect x={PL} y={PT} width={iW} height={iH} fill={BG} stroke={GRID} strokeWidth="1" />
      {yTicks.map(c => (
        <g key={c}>
          <line x1={PL} y1={yScale(c)} x2={PL + iW} y2={yScale(c)} stroke={GRID} strokeWidth="0.5" strokeDasharray="2,3" />
          <text x={PL - 5} y={yScale(c) + 4} textAnchor="end" fontSize="9" fill={TXT}>{c}</text>
        </g>
      ))}
      {xTicks.map(r => (
        <g key={r}>
          <line x1={xScale(r)} y1={PT} x2={xScale(r)} y2={PT + iH} stroke={GRID} strokeWidth="0.5" strokeDasharray="2,3" />
          <text x={xScale(r)} y={PT + iH + 14} textAnchor="middle" fontSize="9" fill={TXT}>{r.toFixed(2)}</text>
        </g>
      ))}
      <text x={PL + iW / 2} y={H - 2} textAnchor="middle" fontSize="10" fill={TXT}>ρd (Mg/m³)</text>
      <text x={12} y={PT + iH / 2} textAnchor="middle" fontSize="10" fill={TXT} transform={`rotate(-90,12,${PT + iH / 2})`}>CBR (%)</text>
      {/* Courbe */}
      {sorted.length >= 2 && <polyline points={linePoints} fill="none" stroke={ACC} strokeWidth="2.5" strokeLinejoin="round" />}
      {/* Points numérotés */}
      {sorted.map((p, i) => (
        <g key={i}>
          <circle cx={xScale(p.rho_d)} cy={yScale(p.cbr)} r="5" fill={ACC} stroke="white" strokeWidth="1.5" />
          <text x={xScale(p.rho_d)} y={yScale(p.cbr) - 9} textAnchor="middle" fontSize="8" fill={ACC} fontWeight="bold">{p.nb_coups}c</text>
        </g>
      ))}
      {/* Ligne ρd_95% et résultat */}
      {rho95 !== null && (
        <g>
          <line x1={xScale(Math.max(rhoMin, Math.min(rhoMax, rho95)))} y1={PT}
                x2={xScale(Math.max(rhoMin, Math.min(rhoMax, rho95)))} y2={PT + iH}
                stroke={REF} strokeWidth="1.5" strokeDasharray="4,2" />
          <text x={xScale(Math.max(rhoMin, Math.min(rhoMax, rho95)))} y={PT + iH + 30}
                textAnchor="middle" fontSize="8" fill={REF} fontWeight="bold">95% OPN</text>
          {cbr95 !== null && (
            <>
              <line x1={PL} y1={yScale(cbr95)}
                    x2={xScale(Math.max(rhoMin, Math.min(rhoMax, rho95)))} y2={yScale(cbr95)}
                    stroke={REF} strokeWidth="1" strokeDasharray="3,2" />
              <circle cx={xScale(Math.max(rhoMin, Math.min(rhoMax, rho95)))} cy={yScale(cbr95)}
                      r="4" fill={REF} stroke="white" strokeWidth="1.5" />
              <text x={PL - 5} y={yScale(cbr95) - 4} textAnchor="end" fontSize="8" fill={REF} fontWeight="bold">{cbr95}%</text>
            </>
          )}
        </g>
      )}
    </svg>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// IPI — Indice Portant Immédiat (NF P 94-078)
//
// Protocole France:
//   L'IPI est mesuré directement sur l'éprouvette compactée au Proctor
//   (même moule, même point de compactage).
//   Piston Ø50mm (A = 19.635 cm²), vitesse 1.27 mm/min.
//
//   On peut faire N poinçonnements (un par point Proctor choisi).
//   Chaque poinçonnement = lecture de force à plusieurs profondeurs :
//     0.5 / 1.0 / 1.5 / 2.0 / 2.5* / 3.0 / 4.0 / 5.0* / 7.5 / 10 mm
//   (* profondeurs clés pour IPI)
//
//   IPI_test = max(F_2.5/13.24, F_5.0/19.96) × 100
//   La profondeur dominante (2.5mm ou 5mm) est indiquée.
//
// Liaison Proctor:
//   Le poinçonnement référence un point du Proctor → w et ρd sont repris.
//   Le moule est celui du point Proctor choisi.
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// IPI — Indice Portant Immédiat (NF P 94-078)
//
// Présentation: poinçonnements côte à côte + graphique F=f(d) avec courbes
// et correction d'origine (si concavité initiale).
//
// Correction d'origine (NF P 94-078 §8):
//   Si la courbe F=f(d) présente une concavité initiale, prolonger la tangente
//   au point d'inflexion jusqu'à l'axe des abscisses → origine corrigée δ0.
//   IPI corrigé calculé aux profondeurs 2.5+δ0 et 5.0+δ0 mm (interpolation).
//
// IPI = max(F_2.5/13.24, F_5.0/19.96) × 100
// IPI corrigé = max(F_2.5corr/13.24, F_5.0corr/19.96) × 100
// ═══════════════════════════════════════════════════════════════════════════════

const IPI_DEPTHS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0]
const IPI_COLORS = ['#3b82f6','#ea580c','#16a34a','#7c3aed','#dc2626','#0891b2']

function initIPILectures(saved) {
  if (saved?.length) return saved
  return IPI_DEPTHS.map(d => ({ depth: d, force: '' }))
}

function calcIPIFromLectures(lectures, delta0 = 0) {
  // Interpolation linéaire de la force à une profondeur donnée
  function interpF(d) {
    const pts = lectures.filter(l => num(l.force) !== null).map(l => ({ d: l.depth, f: num(l.force) })).sort((a,b)=>a.d-b.d)
    if (!pts.length) return null
    if (d <= pts[0].d) return pts[0].f
    if (d >= pts.at(-1).d) return pts.at(-1).f
    for (let i=0; i<pts.length-1; i++) {
      if (pts[i].d <= d && pts[i+1].d >= d) {
        const t = (d - pts[i].d) / (pts[i+1].d - pts[i].d)
        return pts[i].f + t * (pts[i+1].f - pts[i].f)
      }
    }
    return null
  }

  const d0 = num(delta0) || 0
  // Valeurs aux profondeurs clés (avec correction d'origine)
  const f25_raw = interpF(2.5)
  const f50_raw = interpF(5.0)
  const f25_corr = d0 > 0 ? interpF(2.5 + d0) : f25_raw
  const f50_corr = d0 > 0 ? interpF(5.0 + d0) : f50_raw

  const cbr25 = f25_raw !== null ? rnd(f25_raw / F_REF_2_5 * 100, 1) : null
  const cbr50 = f50_raw !== null ? rnd(f50_raw / F_REF_5_0 * 100, 1) : null
  const cbr25c = f25_corr !== null ? rnd(f25_corr / F_REF_2_5 * 100, 1) : null
  const cbr50c = f50_corr !== null ? rnd(f50_corr / F_REF_5_0 * 100, 1) : null

  const ipiRaw = (cbr25 !== null || cbr50 !== null) ? rnd(Math.max(cbr25 ?? -Infinity, cbr50 ?? -Infinity), 1) : null
  const ipiCorr = (cbr25c !== null || cbr50c !== null) ? rnd(Math.max(cbr25c ?? -Infinity, cbr50c ?? -Infinity), 1) : null
  const ipi = d0 > 0 ? ipiCorr : ipiRaw
  const ctrlRaw = cbr25!==null&&cbr50!==null ? (cbr50>=cbr25?'5.0mm':'2.5mm') : (cbr25!==null?'2.5mm':cbr50!==null?'5.0mm':null)
  const ctrlCorr = cbr25c!==null&&cbr50c!==null ? (cbr50c>=cbr25c?'5.0mm':'2.5mm') : ctrlRaw

  // Force kN retenue (à la profondeur contrôlante, après correction d'origine)
  const ctrl = d0>0 ? ctrlCorr : ctrlRaw
  const f_kn = ctrl==='2.5mm' ? (d0>0?f25_corr:f25_raw) : ctrl==='5.0mm' ? (d0>0?f50_corr:f50_raw) : null
  return { cbr25, cbr50, cbr25c, cbr50c, ipiRaw, ipiCorr, ipi, controlling: ctrl, f_kn: f_kn!==null?rnd(f_kn,3):null }
}

// Graphique F = f(profondeur) — toutes les courbes IPI
// La ligne de correction est la tangente à l'inflexion prolongée jusqu'à l'axe X
// δ₀ = abscisse d'intersection = correction d'origine (NF P 94-078)
function IPIChart({ tests, testCalcs }) {
  const W=480, H=820, PL=58, PR=90, PT=32, PB=60
  const iW=W-PL-PR, iH=H-PT-PB
  const BG='#ffffff', GRID='#d4d2ca', TXT='#888'
  const CLIP='ipi-chart-clip'

  const hasData = tests.some(t => Array.isArray(t.lectures) && t.lectures.some(l => num(l.force) !== null))
  if (!hasData) return (
    <div className="flex items-center justify-center bg-bg border border-border rounded-lg" style={{height:300}}>
      <span className="text-[12px] text-text-muted italic">Aucun releve de force disponible pour cette fiche historique</span>
    </div>
  )

  const allF = tests.flatMap(t => (Array.isArray(t.lectures) ? t.lectures : []).map(l => num(l.force)).filter(f => f !== null))
  const fMax = allF.length ? Math.max(...allF) * 1.18 : 10
  const dMax = 12

  const xScale = d => PL + (d / dMax) * iW
  const yScale = f => PT + iH - (f / fMax) * iH
  const yClip  = f => Math.max(PT, Math.min(PT+iH, yScale(f)))

  const xTicks = IPI_DEPTHS
  const fStep = fMax > 50 ? 10 : fMax > 20 ? 5 : fMax > 10 ? 2 : 1
  const yTicks = []
  for (let f=0; f<=fMax+0.01; f+=fStep) yTicks.push(rnd(f,1))

  // Helper: interpolate force at depth d from sorted points array
  function interpF(pts, d) {
    if (!pts.length) return null
    if (d <= pts[0].d) return pts[0].f
    if (d >= pts.at(-1).d) return pts.at(-1).f
    for (let i=0; i<pts.length-1; i++) {
      if (pts[i].d <= d && pts[i+1].d >= d) {
        const t = (d-pts[i].d)/(pts[i+1].d-pts[i].d)
        return pts[i].f + t*(pts[i+1].f-pts[i].f)
      }
    }
    return null
  }

  // Helper: find tangent at max-slope point (inflection)
  function findTangent(pts) {
    if (pts.length < 3) return null
    let maxSlope = -Infinity, bestI = 1
    for (let i=1; i<pts.length-1; i++) {
      const slope = (pts[i+1].f - pts[i-1].f) / (pts[i+1].d - pts[i-1].d)
      if (slope > maxSlope) { maxSlope = slope; bestI = i }
    }
    // Tangent: f = maxSlope*(d - pts[bestI].d) + pts[bestI].f
    // → hits f=0 at: d0 = pts[bestI].d - pts[bestI].f/maxSlope
    const d0 = pts[bestI].d - pts[bestI].f / maxSlope
    return { slope: maxSlope, d0: Math.max(0, rnd(d0, 2)), pd: pts[bestI].d, pf: pts[bestI].f }
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg">
      <defs>
        <clipPath id={CLIP}><rect x={PL} y={PT} width={iW} height={iH}/></clipPath>
      </defs>
      <rect x={PL} y={PT} width={iW} height={iH} fill={BG} stroke={GRID} strokeWidth="1"/>
      {yTicks.map(f=>(
        <g key={f}>
          <line x1={PL} y1={yScale(f)} x2={PL+iW} y2={yScale(f)} stroke={GRID} strokeWidth="0.5" strokeDasharray="2,3"/>
          <text x={PL-5} y={yScale(f)+4} textAnchor="end" fontSize="10" fill={TXT}>{f}</text>
        </g>
      ))}
      {xTicks.map(d=>(
        <g key={d}>
          <line x1={xScale(d)} y1={PT} x2={xScale(d)} y2={PT+iH}
            stroke={d===2.5||d===5.0?'#94a3b8':GRID} strokeWidth={d===2.5||d===5.0?1.2:0.5} strokeDasharray="2,3"/>
          <text x={xScale(d)} y={PT+iH+20} textAnchor="middle" fontSize="10"
            fill={d===2.5||d===5.0?'#475569':TXT} fontWeight={d===2.5||d===5.0?'bold':'normal'}>{d}</text>
        </g>
      ))}
      {/* Axe X=0 */}
      <line x1={PL} y1={PT+iH} x2={PL+iW} y2={PT+iH} stroke="#999" strokeWidth="1"/>
      <text x={PL+iW/2} y={H-10} textAnchor="middle" fontSize="11" fill={TXT}>Profondeur de pénétration (mm)</text>
      <text x={14} y={PT+iH/2} textAnchor="middle" fontSize="11" fill={TXT} transform={`rotate(-90,14,${PT+iH/2})`}>Force F (kN)</text>
      <text x={xScale(2.5)} y={PT+16} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="bold">2.5★</text>
      <text x={xScale(5.0)} y={PT+16} textAnchor="middle" fontSize="10" fill="#475569" fontWeight="bold">5.0★</text>

      {/* Courbes */}
      {tests.map((t, ti) => {
        const color = IPI_COLORS[ti % IPI_COLORS.length]
        const pts = t.lectures.filter(l => num(l.force) !== null)
          .map(l => ({ d: l.depth, f: num(l.force) })).sort((a,b)=>a.d-b.d)
        if (pts.length < 2) return null
        const d0manual = num(t.delta0) || 0
        const lineStr = pts.map(p=>`${xScale(p.d).toFixed(1)},${yClip(p.f).toFixed(1)}`).join(' ')
        const tangent = findTangent(pts)
        // Correction line: from (d0, 0) through inflection point
        // Uses manual d0 if set, else auto-detected
        const d0 = d0manual > 0 ? d0manual : (tangent?.d0 > 0.05 ? tangent.d0 : 0)
        const isCorr = d0 > 0.05
        // Draw tangent line: from (d0, 0) to (pd, pf) extended
        let corrPts = null
        if (tangent && isCorr) {
          const dEnd = dMax  // tangente prolongée jusqu'à 12mm
          const fEnd = tangent.slope * (dEnd - d0)
          corrPts = `${xScale(d0).toFixed(1)},${yScale(0).toFixed(1)} ${xScale(dEnd).toFixed(1)},${yClip(Math.max(0,fEnd)).toFixed(1)}`
        }
        // Key markers
        const f25r = interpF(pts, 2.5), f50r = interpF(pts, 5.0)
        const f25c = isCorr ? interpF(pts, 2.5+d0) : f25r
        const f50c = isCorr ? interpF(pts, 5.0+d0) : f50r
        const c = testCalcs[ti]
        const labelY = 24 + ti * 22
        return (
          <g key={ti}>
            {/* Courbe brute */}
            <polyline clipPath={`url(#${CLIP})`} points={lineStr} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round"/>
            {/* Ligne de correction (tangente prolongée) */}
            {corrPts && (
              <polyline clipPath={`url(#${CLIP})`} points={corrPts}
                fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.8"/>
            )}
            {/* Marqueur δ₀ sur l'axe X */}
            {isCorr && (
              <g>
                <line x1={xScale(d0)} y1={PT+iH-4} x2={xScale(d0)} y2={PT+iH+6}
                  stroke={color} strokeWidth="2"/>
                <text x={xScale(d0)} y={PT+iH+26} textAnchor="middle" fontSize="9" fill={color} fontWeight="bold">
                  δ₀={d0}mm
                </text>
              </g>
            )}
            {/* Cercles aux profondeurs clés (brutes) */}
            {f25r!==null && <circle cx={xScale(2.5)} cy={yClip(f25r)} r="4" fill={color} stroke="white" strokeWidth="1.5" clipPath={`url(#${CLIP})`}/>}
            {f50r!==null && <circle cx={xScale(5.0)} cy={yClip(f50r)} r="4" fill={color} stroke="white" strokeWidth="1.5" clipPath={`url(#${CLIP})`}/>}
            {/* Cercles corrigés (carrés vides) */}
            {isCorr && f25c!==null && <rect x={xScale(2.5+d0)-4} y={yClip(f25c)-4} width="8" height="8" fill="none" stroke={color} strokeWidth="1.5" clipPath={`url(#${CLIP})`}/>}
            {isCorr && f50c!==null && <rect x={xScale(5.0+d0)-4} y={yClip(f50c)-4} width="8" height="8" fill="none" stroke={color} strokeWidth="1.5" clipPath={`url(#${CLIP})`}/>}
            {/* Label + statut */}
            <text x={PL+iW+6} y={PT+labelY} fontSize="10" fill={color} fontWeight="bold">
              P{t.pn_point_id||ti+1}{isCorr ? ' ✓' : ''}
            </text>
            {c?.ipi != null && (
              <text x={PL+iW+6} y={PT+labelY+13} fontSize="9" fill={color} opacity="0.9">
                IPI={c.ipi}{isCorr ? ` (δ₀=${d0})` : ''}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function initIPITests(res) {
  if (res.tests?.length) return res.tests.map(t => ({
    delta0: 0, anneau_ref: '', facteur_k: null, mode_saisie: 'kn', ...t,
    lectures: initIPILectures(t.lectures),
  }))
  return [{ id:1, actif:true, pn_point_id:'', pn_point_w:null, pn_point_rho_d:null, moule_ref:'', delta0:0, anneau_ref:'', facteur_k:null, mode_saisie:'kn', lectures:initIPILectures(null) }]
}

function hasIPILectureValues(lectures) {
  return Array.isArray(lectures) && lectures.some(l => num(l?.force) !== null)
}

function calcStoredIPIResult(test) {
  const cbr25 = num(test.cbr25)
  const cbr50 = num(test.cbr50)
  const cbr25c = num(test.cbr25c)
  const cbr50c = num(test.cbr50c)
  const delta0 = num(test.delta0) || 0

  const ipiRaw = num(test.ipiRaw)
    ?? ((cbr25 !== null || cbr50 !== null) ? rnd(Math.max(cbr25 ?? -Infinity, cbr50 ?? -Infinity), 1) : null)
    ?? num(test.ipi)
  const ipiCorr = num(test.ipiCorr)
    ?? ((cbr25c !== null || cbr50c !== null) ? rnd(Math.max(cbr25c ?? -Infinity, cbr50c ?? -Infinity), 1) : null)
    ?? num(test.ipi)
  const ipi = num(test.ipi) ?? (delta0 > 0 ? ipiCorr : ipiRaw)

  let controlling = test.controlling || null
  if (!controlling) {
    if (delta0 > 0 && cbr25c !== null && cbr50c !== null) controlling = cbr50c >= cbr25c ? '5.0mm' : '2.5mm'
    else if (cbr25 !== null && cbr50 !== null) controlling = cbr50 >= cbr25 ? '5.0mm' : '2.5mm'
    else if (cbr25 !== null || cbr25c !== null) controlling = '2.5mm'
    else if (cbr50 !== null || cbr50c !== null) controlling = '5.0mm'
  }

  return {
    cbr25,
    cbr50,
    cbr25c,
    cbr50c,
    ipiRaw,
    ipiCorr,
    ipi,
    controlling,
    f_kn: num(test.f_kn),
  }
}

function calcIPITestResult(test) {
  const fk = num(test.facteur_k)
  const lectures = test.mode_saisie === 'mm' && fk !== null
    ? (Array.isArray(test.lectures)
        ? test.lectures.map(l => ({ ...l, force: num(l.force) !== null ? String(rnd(num(l.force) * fk, 4)) : l.force }))
        : [])
    : (Array.isArray(test.lectures) ? test.lectures : [])

  if (hasIPILectureValues(lectures)) {
    return { lectures, ...calcIPIFromLectures(lectures, test.delta0) }
  }
  return { lectures, ...calcStoredIPIResult(test) }
}

// Helper — recalculate pnPoints from pnRes
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
    const u=[...tests,{id:tests.length+1,actif:true,pn_point_id:'',pn_point_w:null,pn_point_rho_d:null,moule_ref:'',delta0:0,anneau_ref:'',facteur_k:null,mode_saisie:'kn',lectures:initIPILectures(null)}]
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
          <IPIChart tests={tests} testCalcs={testCalcs}/>
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
                    <td className="px-3 py-1.5 text-right text-[12px]">{t.delta0||0}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr25??'—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{c.cbr50??'—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{num(t.delta0)>0?c.cbr25c??'—':'—'}</td>
                    <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{num(t.delta0)>0?c.cbr50c??'—':'—'}</td>
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
                  <div key={testIdx} className="w-[170px] shrink-0 border border-border rounded-[10px] overflow-hidden" style={{borderColor: color+'44'}}>
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
                      <FG label="δ₀ correction (mm)">
                        <input type="number" step="0.1" min="0" value={t.delta0||''} placeholder="0"
                          onChange={e=>setTestField(testIdx,'delta0',e.target.value===''?0:parseFloat(e.target.value))}
                          className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                      </FG>
                      {num(t.delta0)>0 && (
                        <div className="text-[10px] text-[#854f0b] bg-[#faeeda] border border-[#e0c070] rounded px-2 py-1">
                          2.5→{rnd(2.5+num(t.delta0),1)}mm · 5.0→{rnd(5.0+num(t.delta0),1)}mm
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
                            const d0v = num(t.delta0)||0
                            const isKeyCorr = d0v>0 && (Math.abs(l.depth-(2.5+d0v))<0.05||Math.abs(l.depth-(5.0+d0v))<0.05)
                            // Convert div→kN if needed
                            const rawVal = l.force
                            const fKn = t.mode_saisie==='mm' && facteurK!==null && num(rawVal)!==null
                              ? rnd(num(rawVal)*facteurK, 4) : num(rawVal)
                            const cbr = l.depth===2.5&&fKn!==null ? rnd(fKn/F_REF_2_5*100,1)
                                      : l.depth===5.0&&fKn!==null ? rnd(fKn/F_REF_5_0*100,1) : null
                            return (
                              <tr key={depthIdx} className={`border-b border-border ${isKey?'bg-[#f0f7ff]':isKeyCorr?'bg-[#fef3c7]':''}`}>
                                <td className={`px-2 py-0.5 text-[11px] ${isKey?'font-bold text-accent':isKeyCorr?'text-[#854f0b]':'text-text-muted'}`}>
                                  {l.depth}{isKey&&<span className="ml-0.5 text-[9px]">★</span>}
                                </td>
                                <td className="px-1 py-0.5">
                                  <input type="number" step="0.01" value={rawVal}
                                    onChange={e=>setLecture(testIdx,depthIdx,e.target.value)}
                                    placeholder="—"
                                    className={`w-full px-1.5 py-0.5 border rounded text-[11px] bg-bg outline-none text-right ${isKey?'border-accent':'border-border'} focus:border-accent`}
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
                          <div className="text-[10px] mt-0.5 text-text-muted">IPI% ({c.controlling}){num(t.delta0)>0?' corr.':''}</div>
                          {num(t.delta0)>0&&c.ipiRaw!==null&&c.ipiRaw!==c.ipi&&<div className="text-[10px] text-text-muted">brut: {c.ipiRaw}</div>}
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
        <div className="flex-1" style={{minWidth:'260px'}}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">F = f(profondeur) — temps réel</div>
          <IPIChart tests={tests} testCalcs={testCalcs}/>
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
// N moules (variable, défaut 3 : 10/25/55 coups/couche)
// 1 anneau dynamométrique sur la presse, partagé par tous les moules
// Lectures aux profondeurs : 1.25 / 2.0 / 2.5★ / 5.0★ / 7.5 / 10.0 mm
// CBR = max(F_2.5/13.24, F_5.0/19.96) × 100
// Correction d'origine δ₀ par moule si concavité initiale (même principe IPI)
// ═══════════════════════════════════════════════════════════════════════════════
function IPICBRForm({ res, onChange, readOnly, essai }) {
  const mode = (() => {
    const code = String(essai?.essai_code || essai?.code_essai || '').toUpperCase()
    if (code === 'CBRI' || code === 'IM') return 'CBRi'
    return 'CBR'
  })()

  const [moules,     setMoules]     = useState(() => initIPIMoules(res, 'CBR'))
  const [soakDays,   setSoakDays]   = useState(res.soak_days  ?? '4')
  const [anneauRef,  setAnneauRef]  = useState(res.anneau_ref ?? '')
  const [facteurK,   setFacteurK]   = useState(res.facteur_k  ?? null)
  const [modeSaisie, setModeSaisie] = useState(res.mode_saisie ?? 'kn')

  // Proctor frère
  const echantillonId = essai?.echantillon_id
  const [selectedPNUid, setSelectedPNUid] = useState(res.pn_uid ?? '')
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
  const pnRes  = pnSibling ? parseRes(pnSibling.resultats) : null
  const wOPN   = pnRes ? (pnRes.wOPN_corr ?? pnRes.wOPN ?? null) : null
  const rhoOPN = pnRes ? (pnRes.rho_d_OPN_corr ?? pnRes.rho_d_OPN ?? null) : null
  const rho95  = rhoOPN !== null ? rnd(rhoOPN * 0.95, 3) : null

  // Helper: lecture → kN
  const toKN = (raw, fk, ms) => {
    const v = num(raw)
    if (v === null) return null
    if ((ms ?? modeSaisie) === 'mm' && (fk ?? facteurK) !== null) return rnd(v * (fk ?? facteurK), 4)
    return v
  }

  // Per-moule calculations
  const calcs = moules.map(m => {
    const n1=num(m.m1),n2=num(m.m2),n3=num(m.m3)
    let w=null
    if(n1!==null&&n2!==null&&n3!==null&&(n3-n1)>0) w=rnd((n2-n3)/(n3-n1)*100,2)
    else if(m.w!=='') w=num(m.w)
    const mm=num(m.m_moule); const vv=num(m.v_moule)
    const {rho_h,rho_d}=calcRhoFromMoule(m.m_tot,mm,vv,w)
    const gi=num(m.gonf_ini),gf=num(m.gonf_fin),hm=num(m.h_moule)??H_MOULE_CBR
    const gonf=gi!==null&&gf!==null&&hm>0?rnd((gf-gi)/hm*100,2):null
    // Apply k conversion to lectures before CBR calc
    const lecs = (m.lectures||[]).map(l => ({
      ...l, force: l.force !== '' ? String(toKN(l.force, facteurK, modeSaisie) ?? '') : ''
    }))
    const cbrCalc = calcCBRFromLectures(lecs, m.delta0||0)
    return { w, rho_h, rho_d, gonf, ...cbrCalc }
  })

  const validPts = moules.map((m,i) => ({rho_d:calcs[i].rho_d, cbr:calcs[i].cbr}))
    .filter((p,i) => moules[i].actif && p.rho_d!==null && p.cbr!==null)
  const cbr95 = validPts.length>=2 && rho95!==null ? interpCBRAt95(validPts, rho95) : null

  // Emit
  function computeAndEmit(ms, sd, pn_uid, fk, ms2) {
    const fkv = fk ?? facteurK
    const msv = ms2 ?? modeSaisie
    const cc = ms.map(m => {
      const n1=num(m.m1),n2=num(m.m2),n3=num(m.m3); let w=null
      if(n1!==null&&n2!==null&&n3!==null&&(n3-n1)>0) w=rnd((n2-n3)/(n3-n1)*100,2)
      else if(m.w!=='') w=num(m.w)
      const {rho_d}=calcRhoFromMoule(m.m_tot,num(m.m_moule),num(m.v_moule),w)
      const lecs=(m.lectures||[]).map(l=>({...l,force:l.force!==''?String(toKN(l.force,fkv,msv)??''):'' }))
      const {cbr,f_kn,controlling}=calcCBRFromLectures(lecs,m.delta0||0)
      return {w,rho_d,cbr,f_kn,controlling}
    })
    const vp=ms.map((m,i)=>({rho_d:cc[i].rho_d,cbr:cc[i].cbr})).filter((p,i)=>ms[i].actif&&p.rho_d!==null&&p.cbr!==null)
    const cbr95_=vp.length>=2&&rho95!==null?interpCBRAt95(vp,rho95):null
    onChange(JSON.stringify({
      mode, soak_days:sd,
      anneau_ref:anneauRef, facteur_k:fkv, mode_saisie:msv,
      moules:ms.map((m,i)=>({...m,w_calc:cc[i].w,rho_d:cc[i].rho_d,f_kn_retenu:cc[i].f_kn,cbr:cc[i].cbr})),
      cbr_95:cbr95_,
      pn_uid:pn_uid??(pnSibling?String(pnSibling.uid):''),
      wOPN_ref:wOPN, rho_d_OPN_ref:rhoOPN, rho_d_95:rho95,
    }))
  }

  function setMBatch(i, updates) {
    const u=moules.map((m,idx)=>idx===i?{...m,...updates}:m)
    setMoules(u); computeAndEmit(u,soakDays,selectedPNUid,null,null)
  }
  function setM(i,k,v) {
    const u=moules.map((m,idx)=>idx===i?{...m,[k]:v}:m)
    setMoules(u); computeAndEmit(u,soakDays,selectedPNUid,null,null)
  }
  function setLecture(mi, di, force) {
    const u=moules.map((m,i)=>{
      if(i!==mi) return m
      const lecs=(m.lectures||[]).map((l,j)=>j===di?{...l,force}:l)
      return {...m,lectures:lecs}
    })
    setMoules(u); computeAndEmit(u,soakDays,selectedPNUid,null,null)
  }
  function addMoule() {
    const u=[...moules,{
      id:moules.length+1,actif:true,nb_coups:25,moule_ref:'',m_moule:'',v_moule:'2131',
      m_tot:'',w:'',m1:'',m2:'',m3:'',
      lectures:initCBRLectures(null,'',''),delta0:0,
      gonf_ini:'',gonf_fin:'',h_moule:String(H_MOULE_CBR),
    }]
    setMoules(u); computeAndEmit(u,soakDays,selectedPNUid,null,null)
  }
  function removeM(i) {
    if(moules.length<=1) return
    const u=moules.filter((_,idx)=>idx!==i).map((m,idx)=>({...m,id:idx+1}))
    setMoules(u); computeAndEmit(u,soakDays,selectedPNUid,null,null)
  }

  // Proctor block
  const pnBlock = pnSiblings.length>0 ? (
    <div className="px-4 py-3 rounded-lg border bg-[#e6f1fb] border-[#90bfe8] text-[12px] text-[#185fa5]">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-semibold">Proctor lié :</span>
        {pnSiblings.length===1 ? (
          <span className="font-mono">{pnSibling?.reference||`#${pnSibling?.uid}`}</span>
        ) : (
          <select value={selectedPNUid||String(pnSiblings[0]?.uid||'')}
            onChange={e=>{setSelectedPNUid(e.target.value);computeAndEmit(moules,soakDays,e.target.value,null,null)}}
            className="px-2 py-0.5 border border-[#90bfe8] rounded text-[12px] bg-[#e6f1fb] text-[#185fa5] outline-none font-mono">
            {pnSiblings.map(e=><option key={e.uid} value={String(e.uid)}>{e.reference||`PN #${e.uid}`}</option>)}
          </select>
        )}
        <span className="opacity-70 font-normal">(grand moule CBR Ø152.4mm)</span>
      </div>
      <div className="flex gap-5 flex-wrap">
        {wOPN!==null&&<span>wOPN=<strong>{wOPN}%</strong></span>}
        {rhoOPN!==null&&<span>ρdOPN=<strong>{rhoOPN} Mg/m³</strong></span>}
        {rho95!==null&&<span>ρd(95%)=<strong>{rho95} Mg/m³</strong></span>}
      </div>
    </div>
  ) : (
    <div className="px-4 py-3 rounded-lg border border-dashed border-border text-[12px] text-text-muted">
      <span className="font-medium">Proctor (PN) non trouvé</span> — Créez d'abord un essai PN.
    </div>
  )

  // Anneau + mode block
  const anneauBlock = (
    <div className="flex flex-wrap gap-3 items-end px-4 py-3 rounded-lg border border-border bg-surface">
      <div className="flex flex-col gap-1" style={{minWidth:'220px'}}>
        <label className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Anneau / Capteur (presse)</label>
        <AnnauSelect value={anneauRef} disabled={false}
          onSelect={({code,facteur_k:fk})=>{
            setAnneauRef(code); setFacteurK(fk)
            computeAndEmit(moules,soakDays,selectedPNUid,fk,null)
          }}/>
      </div>
      {facteurK!==null&&<div className="text-[11px] text-text-muted self-end pb-1">k = <strong>{facteurK}</strong> kN/div</div>}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Mode F</label>
        <div className="flex gap-1">
          <button onClick={()=>{setModeSaisie('kn');computeAndEmit(moules,soakDays,selectedPNUid,null,'kn')}}
            className={`px-3 py-1 text-[11px] border rounded ${modeSaisie==='kn'?'bg-accent text-white border-accent':'bg-bg border-border text-text-muted'}`}>
            kN direct
          </button>
          <button onClick={()=>{setModeSaisie('mm');computeAndEmit(moules,soakDays,selectedPNUid,null,'mm')}}
            className={`px-3 py-1 text-[11px] border rounded ${modeSaisie==='mm'?'bg-accent text-white border-accent':'bg-bg border-border text-text-muted'}`}
            disabled={facteurK===null}>
            mm (comparateur)
          </button>
        </div>
      </div>
      {modeSaisie==='mm'&&facteurK!==null&&(
        <div className="text-[10px] text-[#854f0b] bg-[#faeeda] border border-[#e0c070] rounded px-2 py-1 self-end">
          F [kN] = lecture × {facteurK}
        </div>
      )}
      {mode==='CBR'&&(
        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-[10px] font-bold uppercase tracking-wide text-text-muted">Durée immersion (j)</label>
          <input type="number" step="1" value={soakDays} onChange={e=>{setSoakDays(e.target.value);computeAndEmit(moules,e.target.value,selectedPNUid,null,null)}}
            className="w-[64px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" placeholder="4"/>
        </div>
      )}
    </div>
  )

  // ── readOnly ────────────────────────────────────────────────────────────────
  if (readOnly) {
    const activeMoules = moules.map((m,i)=>({...m,...calcs[i]})).filter(m=>m.actif)
    const ipiTests = moules.map((m,i)=>({
      ...m, lectures:(m.lectures||[]).map(l=>({...l,force:l.force!==''?String(toKN(l.force,facteurK,modeSaisie)??''):'' })),
      delta0:m.delta0||0, pn_point_id:m.id, pn_point_w:calcs[i].w,
    }))
    const cbrCalcs = ipiTests.map(t=>calcCBRFromLectures(t.lectures,t.delta0))
    return (
      <div className="flex flex-col gap-4">
        {pnBlock}
        {cbr95!==null&&(
          <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center">
            <div className="text-[30px] font-bold text-[#3b6d11] leading-none">{cbr95}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">{mode} à 95% OPN (%)</div>
          </div>
        )}
        <Card title="Courbes F = f(profondeur)">
          <IPIChart tests={ipiTests} testCalcs={cbrCalcs}/>
        </Card>
        <Card title={`Courbe ${mode} — portance vs densité`}>
          <CBRChart moules={moules} calcs={calcs} rho95={rho95} cbr95={cbr95} mode={mode}/>
        </Card>
        <Card title="Résultats par moule">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-3 py-2 text-left text-[11px] font-medium text-text-muted">Moule</th>
                <th className="px-3 py-2 text-[11px] font-medium text-text-muted">Coups</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w (%)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">ρd (Mg/m³)</th>
                {mode==='CBR'&&<th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">Gonfl. (%)</th>}
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">δ₀</th>
                <th className="px-3 py-2 text-right text-[11px] font-bold text-accent">{mode} (%)</th>
              </tr>
            </thead>
            <tbody>
              {activeMoules.map((m,i)=>(
                <tr key={i} className="border-b border-border">
                  <td className="px-3 py-1.5 text-[12px] font-mono">{m.moule_ref||`M${m.id}`}</td>
                  <td className="px-3 py-1.5 text-[12px] text-center">{m.nb_coups}</td>
                  <td className="px-3 py-1.5 text-right text-[12px]">{m.w??'—'}</td>
                  <td className="px-3 py-1.5 text-right text-[12px]">{m.rho_d??'—'}</td>
                  {mode==='CBR'&&<td className="px-3 py-1.5 text-right text-[12px]">{m.gonf??'—'}</td>}
                  <td className="px-3 py-1.5 text-right text-[12px] text-text-muted">{m.delta0||0}</td>
                  <td className={`px-3 py-1.5 text-right font-bold ${m.cbr!==null?'text-accent text-[14px]':'text-text-muted'}`}>{m.cbr??'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    )
  }

  // ── edit ────────────────────────────────────────────────────────────────────
  // Prepare tests for IPIChart (reuse)
  const ipiTests = moules.map((m,i)=>({
    ...m,
    lectures:(m.lectures||[]).map(l=>({...l,force:l.force!==''?String(toKN(l.force,facteurK,modeSaisie)??''):'' })),
    delta0:m.delta0||0,
    pn_point_id:m.id, pn_point_w:calcs[i].w,
  }))
  const cbrCalcs = ipiTests.map(t=>calcCBRFromLectures(t.lectures,t.delta0))
  const cbrGlobal = moules.reduce((best,m,i)=>calcs[i].cbr!==null&&m.actif&&(best===null||calcs[i].cbr>best)?calcs[i].cbr:best,null)

  return (
    <div className="flex flex-col gap-4">
      {pnBlock}
      {anneauBlock}

      {/* Résultat global */}
      {cbr95!==null&&(
        <div className="flex items-center gap-3 px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start">
          <div>
            <div className="text-[30px] font-bold text-[#3b6d11] leading-none">{cbr95}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1">{mode} à ρd(95% OPN)={rho95} Mg/m³</div>
          </div>
        </div>
      )}

      {/* Moules côte à côte + graphique F=f(d) */}
      <div className="flex gap-4 items-stretch">
        {/* Colonnes moules */}
        <div className="flex flex-col gap-2">
          <div className="overflow-x-auto">
            <div className="flex gap-3" style={{minWidth:`${moules.length*182}px`}}>
              {moules.map((m,mi)=>{
                const c=calcs[mi]
                const color=IPI_COLORS[mi%IPI_COLORS.length]
                const fk=facteurK
                const wFromPesee=(()=>{const n1=num(m.m1),n2=num(m.m2),n3=num(m.m3);if(n1!==null&&n2!==null&&n3!==null&&(n3-n1)>0)return rnd((n2-n3)/(n3-n1)*100,2);return null})()
                return (
                  <div key={mi} className="w-[170px] shrink-0 border border-border rounded-[10px] overflow-hidden" style={{borderColor:color+'44'}}>
                    {/* Header */}
                    <div className="px-3 py-2 border-b flex items-center justify-between" style={{borderColor:color+'44',background:color+'11'}}>
                      <span className="text-[11px] font-bold uppercase" style={{color}}>Moule {mi+1}</span>
                      {moules.length>1&&<button onClick={()=>removeM(mi)} className="text-[11px] text-text-muted hover:text-danger" tabIndex={0}>×</button>}
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      {/* Moule + coups */}
                      <FG label="Moule">
                        <MouleSelect value={m.moule_ref} disabled={false}
                          onSelect={({code,m_tare,volume_cm3})=>setMBatch(mi,{moule_ref:code,...(m_tare!=null&&{m_moule:String(m_tare)}),...(volume_cm3!=null&&{v_moule:String(volume_cm3)})})}/>
                      </FG>
                      <FG label="Coups / couche">
                        <input type="number" step="1" value={m.nb_coups} onChange={e=>setM(mi,'nb_coups',e.target.value)}
                          className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                      </FG>
                      {/* Pesées */}
                      <FG label="M_moule (g)">
                        <input type="number" step="0.1" value={m.m_moule} onChange={e=>setM(mi,'m_moule',e.target.value)}
                          placeholder="g" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                      </FG>
                      <FG label="V (cm³)">
                        <input type="number" step="1" value={m.v_moule} onChange={e=>setM(mi,'v_moule',e.target.value)}
                          placeholder="2131" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                      </FG>
                      <FG label="M_tot (g)">
                        <input type="number" step="0.1" value={m.m_tot} onChange={e=>setM(mi,'m_tot',e.target.value)}
                          placeholder="g" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                      </FG>
                      {/* Teneur en eau */}
                      <FG label="w (%)">
                        <input type="number" step="0.1" value={m.w} onChange={e=>setM(mi,'w',e.target.value)}
                          disabled={wFromPesee!==null} placeholder={wFromPesee!==null?String(wFromPesee):'%'}
                          className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent disabled:opacity-50" tabIndex={0}/>
                      </FG>
                      {/* Pesées hydriques M1/M2/M3 */}
                      {['m1','m2','m3'].map(k=>(
                        <FG key={k} label={k.toUpperCase()+" (g)"}>
                          <input type="number" step="0.01" value={m[k]} onChange={e=>setM(mi,k,e.target.value)}
                            placeholder="g" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                        </FG>
                      ))}
                      {/* ρd calculé */}
                      {c.rho_d!==null&&(
                        <div className="text-[11px] font-medium px-1" style={{color}}>ρd = {c.rho_d} Mg/m³</div>
                      )}
                      {/* Gonflement (CBR seulement) */}
                      {mode==='CBR'&&<>
                        <FG label="δ ini (mm)">
                          <input type="number" step="0.01" value={m.gonf_ini} onChange={e=>setM(mi,'gonf_ini',e.target.value)}
                            placeholder="mm" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                        </FG>
                        <FG label="δ fin (mm)">
                          <input type="number" step="0.01" value={m.gonf_fin} onChange={e=>setM(mi,'gonf_fin',e.target.value)}
                            placeholder="mm" className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                        </FG>
                        {c.gonf!==null&&<div className="text-[10px] text-text-muted px-1">Gonfl. = {c.gonf}%</div>}
                      </>}
                      {/* Correction d'origine */}
                      <FG label="δ₀ correction (mm)">
                        <input type="number" step="0.1" min="0" value={m.delta0||''} placeholder="0"
                          onChange={e=>setM(mi,'delta0',e.target.value===''?0:parseFloat(e.target.value))}
                          className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
                      </FG>
                      {(m.delta0||0)>0&&(
                        <div className="text-[10px] text-[#854f0b] bg-[#faeeda] border border-[#e0c070] rounded px-2 py-1">
                          2.5→{rnd(2.5+(m.delta0||0),2)}mm · 5.0→{rnd(5.0+(m.delta0||0),2)}mm
                        </div>
                      )}
                      {/* Tableau lectures F=f(d) */}
                      <table className="w-full border-collapse text-sm mt-1">
                        <thead>
                          <tr className="bg-bg border-b border-border">
                            <th className="px-1 py-1 text-left text-[10px] font-medium text-text-muted">d(mm)</th>
                            <th className="px-1 py-1 text-right text-[10px] font-medium text-text-muted">{modeSaisie==='mm'?'mm':'kN'}</th>
                            <th className="px-1 py-1 text-right text-[10px] font-medium text-text-muted">CBR%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(m.lectures||[]).map((l,di)=>{
                            const isKey=l.depth===2.5||l.depth===5.0
                            const fKN=toKN(l.force,facteurK,modeSaisie)
                            const cbr=l.depth===2.5&&fKN!==null?rnd(fKN/F_REF_2_5*100,1)
                                    :l.depth===5.0&&fKN!==null?rnd(fKN/F_REF_5_0*100,1):null
                            return (
                              <tr key={di} className={`border-b border-border ${isKey?'bg-[#f0f7ff]':''}`}>
                                <td className={`px-1 py-0.5 text-[11px] ${isKey?'font-bold text-accent':'text-text-muted'}`}>
                                  {l.depth}{isKey&&<span className="text-[9px]">★</span>}
                                </td>
                                <td className="px-1 py-0.5">
                                  <input type="number" step="0.01" value={l.force}
                                    onChange={e=>setLecture(mi,di,e.target.value)}
                                    placeholder="—"
                                    className={`w-full px-1 py-0.5 border rounded text-[11px] bg-bg outline-none text-right ${isKey?'border-accent':'border-border'} focus:border-accent`}
                                    tabIndex={0}/>
                                </td>
                                <td className={`px-1 py-0.5 text-right text-[11px] font-bold ${cbr!==null?'text-accent':'text-text-muted opacity-30'}`}>
                                  {cbr??''}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      {/* Résultat moule */}
                      {c.cbr!==null&&(
                        <div className="mt-1 p-2 rounded-lg border text-center" style={{background:color+'11',borderColor:color+'44'}}>
                          <div className="text-[20px] font-bold leading-none" style={{color}}>{c.cbr}</div>
                          <div className="text-[10px] mt-0.5 text-text-muted">
                            {mode}% ({c.controlling}){(m.delta0||0)>0?' corr.':''}
                          </div>
                          {(m.delta0||0)>0&&c.cbrRaw!==null&&c.cbrRaw!==c.cbr&&(
                            <div className="text-[9px] text-text-muted">brut: {c.cbrRaw}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <button onClick={addMoule}
            className="self-start text-[12px] text-text-muted hover:text-text border border-dashed border-border rounded px-4 py-2 transition-colors" tabIndex={0}>
            + Ajouter un moule
          </button>
        </div>

        {/* Graphique F=f(d) à droite */}
        <div className="flex-1 flex flex-col" style={{minWidth:'300px',maxWidth:'520px'}}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">F = f(profondeur) — temps réel</div>
          <IPIChart tests={ipiTests} testCalcs={cbrCalcs}/>
          <p className="text-[10px] text-text-muted italic mt-1">★ = 2.5 et 5.0mm. Pointillé = δ₀.</p>
        </div>
      </div>

      {/* Résultats intermédiaires + courbe CBR vs ρd */}
      {validPts.length>=1&&(
        <div className="flex gap-3 flex-wrap">
          {cbr95!==null&&(
            <div className="flex items-center gap-3 px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg">
              <div>
                <div className="text-[26px] font-bold text-[#3b6d11] leading-none">{cbr95}</div>
                <div className="text-[11px] text-[#5a8f30] mt-1">{mode} à ρd(95% OPN)={rho95}</div>
              </div>
            </div>
          )}
          {validPts.length<2&&rho95!==null&&(
            <div className="px-4 py-3 bg-[#faeeda] border border-[#e0c070] rounded-lg text-[12px] text-[#854f0b]">
              <div className="font-bold">⚠ Interpolation impossible</div>
              <div className="opacity-80">Minimum 2 moules actifs avec ρd et CBR</div>
            </div>
          )}
        </div>
      )}
      <Card title={`Courbe ${mode} — portance vs densité sèche`}>
        <CBRChart moules={moules} calcs={calcs} rho95={rho95} cbr95={cbr95} mode={mode}/>
      </Card>
    </div>
  )
}
// ═══════════════════════════════════════════════════════════════════════════════
// EssaiGenerique — fallback universel pour les essais sans form dédié
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// ES — Équivalent de sable (NF P 94-055 / NF EN 933-8)
// ═══════════════════════════════════════════════════════════════════════════════
function EquivalentSable({ res, onChange, readOnly }) {
  const initDets = s => s?.length ? s : [{h_sable:'',h_limon:''},{h_sable:'',h_limon:''},{h_sable:'',h_limon:''}]
  const [dets, setDets] = useState(() => initDets(res.dets))
  const [critere, setCritere] = useState(res.critere ?? '')

  function calcES(d) {
    const hs = num(d.h_sable), hl = num(d.h_limon)
    if (hs !== null && hl !== null && hl > 0) return rnd(hs / hl * 100, 0)
    return null
  }
  function emit(d) {
    const u = d || dets
    const vals = u.map(calcES).filter(v => v !== null)
    const moy = vals.length ? rnd(vals.reduce((a,b)=>a+b,0)/vals.length, 0) : null
    onChange(JSON.stringify({ dets: u, critere, es_moy: moy }))
  }
  function setD(i, k, v) {
    const u = dets.map((d,j) => j===i ? {...d,[k]:v} : d)
    setDets(u); emit(u)
  }
  const vals = dets.map(calcES).filter(v=>v!==null)
  const esMoy = vals.length ? rnd(vals.reduce((a,b)=>a+b,0)/vals.length, 0) : null
  const crit = num(critere)
  const conforme = esMoy!==null && crit!==null ? esMoy >= crit : null

  if (readOnly) return (
    <div className="flex gap-3 flex-wrap">
      {esMoy!==null&&<div className={`px-5 py-3 rounded-lg text-center border ${conforme===false?'bg-[#fcebeb] border-[#f0a0a0]':'bg-[#eaf3de] border-[#b5d88a]'}`}>
        <div className={`text-[28px] font-bold ${conforme===false?'text-danger':'text-[#3b6d11]'}`}>{esMoy}</div>
        <div className="text-[11px] mt-1 text-text-muted">ES moyen (%){crit!==null?` ≥ ${crit}?`:''}</div>
      </div>}
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <Card title="Équivalent de sable — 3 déterminations">
        <table className="border-collapse text-sm">
          <thead><tr className="bg-bg border-b border-border">
            <th className="px-3 py-2 text-[11px] font-medium text-text-muted">Déterm.</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">h sable (mm)</th>
            <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">h limons (mm)</th>
            <th className="px-3 py-2 text-right text-[11px] font-bold text-accent">ES (%)</th>
          </tr></thead>
          <tbody>{dets.map((d,i)=>{const es=calcES(d);return(
            <tr key={i} className="border-b border-border">
              <td className="px-3 py-1 text-[12px] text-text-muted">{i+1}</td>
              <td className="px-1 py-1"><input type="number" step="0.1" value={d.h_sable} onChange={e=>setD(i,'h_sable',e.target.value)} placeholder="mm" className="w-[90px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1"><input type="number" step="0.1" value={d.h_limon} onChange={e=>setD(i,'h_limon',e.target.value)} placeholder="mm" className="w-[90px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className={`px-3 py-1 text-right text-[12px] font-bold ${es!==null?'text-accent':'text-text-muted opacity-30'}`}>{es??'—'}</td>
            </tr>
          )})}
          <tr className="bg-bg border-t-2 border-border">
            <td colSpan={3} className="px-3 py-1.5 text-[12px] font-bold text-right">Moyenne</td>
            <td className="px-3 py-1.5 text-right text-[14px] font-bold text-accent">{esMoy??'—'}</td>
          </tr>
          </tbody>
        </table>
      </Card>
      <Card title="Critère">
        <FG label="ES ≥ (%)"><input type="number" step="1" value={critere} onChange={e=>{setCritere(e.target.value);emit(null)}} placeholder="optionnel" className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        {esMoy!==null&&crit!==null&&(
          <div className={`mt-2 px-3 py-1.5 rounded text-[12px] font-medium self-start ${conforme?'bg-[#eaf3de] text-[#3b6d11]':'bg-[#fcebeb] text-danger'}`}>
            {esMoy} {conforme?'≥':'<'} {crit} → {conforme?'Conforme':'Non conforme'}
          </div>
        )}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// R3M — Mesure à la règle de 3 m (NF EN 13036-7)
// ═══════════════════════════════════════════════════════════════════════════════
function RegleTroisMetres({ res, onChange, readOnly }) {
  const initMes = s => s?.length ? s : Array.from({length:6},()=>({pos:'',ecart:'',ok:''}))
  const [mes, setMes] = useState(() => initMes(res.mes))
  const [critere, setCritere] = useState(res.critere ?? '')
  const [couche, setCouche] = useState(res.couche ?? '')

  function emit(m) {
    const u = m || mes
    const vals = u.map(r=>num(r.ecart)).filter(v=>v!==null)
    const moy = vals.length ? rnd(vals.reduce((a,b)=>a+b,0)/vals.length,1) : null
    onChange(JSON.stringify({ mes:u, critere, couche, ecart_moy:moy }))
  }
  function setM(i,k,v) { const u=mes.map((r,j)=>j===i?{...r,[k]:v}:r); setMes(u); emit(u) }
  const vals = mes.map(r=>num(r.ecart)).filter(v=>v!==null)
  const ecartMoy = vals.length ? rnd(vals.reduce((a,b)=>a+b,0)/vals.length,1) : null
  const crit = num(critere)
  const conforme = ecartMoy!==null&&crit!==null ? ecartMoy <= crit : null

  if (readOnly) return (
    <div className="flex flex-col gap-4">
      {ecartMoy!==null&&<div className={`px-5 py-3 rounded-lg self-start text-center border ${conforme===false?'bg-[#fcebeb] border-[#f0a0a0]':'bg-[#eaf3de] border-[#b5d88a]'}`}>
        <div className={`text-[26px] font-bold ${conforme===false?'text-danger':'text-[#3b6d11]'}`}>{ecartMoy}</div>
        <div className="text-[11px] text-text-muted mt-1">Écart moyen (mm)</div>
      </div>}
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte">
        <div className="flex gap-3 flex-wrap">
          <FG label="Couche"><input value={couche} onChange={e=>{setCouche(e.target.value);emit(null)}} className="w-[180px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Critère écart ≤ (mm)"><input type="number" step="0.1" value={critere} onChange={e=>{setCritere(e.target.value);emit(null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <Card title="Mesures">
        <table className="border-collapse text-sm w-full">
          <thead><tr className="bg-bg border-b border-border">
            <th className="px-2 py-2 text-[11px] font-medium text-text-muted">Position / PK</th>
            <th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">Écart max (mm)</th>
            <th className="px-2 py-2 text-center text-[11px] font-medium text-text-muted">Statut</th>
          </tr></thead>
          <tbody>{mes.map((r,i)=>(
            <tr key={i} className={`border-b border-border ${!r.pos&&!r.ecart?'opacity-30':''}`}>
              <td className="px-1 py-1"><input value={r.pos} onChange={e=>setM(i,'pos',e.target.value)} placeholder={`P${i+1}`} className="w-[120px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1"><input type="number" step="0.1" value={r.ecart} onChange={e=>setM(i,'ecart',e.target.value)} placeholder="mm" className="w-[80px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1 text-center"><select value={r.ok} onChange={e=>setM(i,'ok',e.target.value)} className="px-1 py-1 border border-border rounded text-[11px] bg-bg" tabIndex={0}><option value="">—</option><option>C</option><option>R</option><option>NC</option></select></td>
            </tr>
          ))}</tbody>
        </table>
        {ecartMoy!==null&&<p className="mt-2 font-bold text-accent">Écart moyen = {ecartMoy} mm</p>}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// EA — Étanchéité réseau (eau / air) — Assainissement
// ═══════════════════════════════════════════════════════════════════════════════
function EtancheiteReseau({ res, onChange, readOnly, essai }) {
  const code = String(essai?.essai_code||essai?.code_essai||'').toUpperCase()
  const isAir = code==='EA-AIR'
  const [ouvrage, setOuvrage] = useState(res.ouvrage??'')
  const [troncon, setTroncon] = useState(res.troncon??'')
  const [diametre, setDiametre] = useState(res.diametre??'')
  const [longueur, setLongueur] = useState(res.longueur??'')
  const [pression, setPression] = useState(res.pression??'')
  const [duree, setDuree] = useState(res.duree??'30')
  const [valIni, setValIni] = useState(res.val_ini??'')
  const [valFin, setValFin] = useState(res.val_fin??'')
  const [critere, setCritere] = useState(res.critere??'')
  const [notes, setNotes] = useState(res.notes??'')

  function calcPerte() {
    const vi=num(valIni),vf=num(valFin)
    return vi!==null&&vf!==null?rnd(Math.abs(vi-vf),3):null
  }
  function emit() {
    const perte=calcPerte(); const crit=num(critere)
    const conforme=perte!==null&&crit!==null?perte<=crit:null
    onChange(JSON.stringify({ouvrage,troncon,diametre,longueur,pression,duree,val_ini:valIni,val_fin:valFin,critere,notes,perte,conforme}))
  }
  const perte=calcPerte(); const crit=num(critere)
  const conforme=perte!==null&&crit!==null?perte<=crit:null

  if(readOnly) return (
    <div className="flex flex-col gap-4">
      {perte!==null&&<div className={`px-5 py-3 rounded-lg self-start text-center border ${conforme===false?'bg-[#fcebeb] border-[#f0a0a0]':conforme?'bg-[#eaf3de] border-[#b5d88a]':'bg-[#e6f1fb] border-[#90bfe8]'}`}>
        <div className={`text-[24px] font-bold ${conforme===false?'text-danger':conforme?'text-[#3b6d11]':'text-[#185fa5]'}`}>{perte}</div>
        <div className="text-[11px] text-text-muted mt-1">{isAir?'Perte de pression (bar)':'Appoint d\'eau (L/m)'}</div>
        {conforme!==null&&<div className={`text-[11px] font-bold mt-1 ${conforme?'text-[#3b6d11]':'text-danger'}`}>{conforme?'Conforme':'Non conforme'}</div>}
      </div>}
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <Card title="Identification">
        <div className="flex gap-3 flex-wrap">
          <FG label="Ouvrage"><input value={ouvrage} onChange={e=>{setOuvrage(e.target.value);emit()}} className="w-[180px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Tronçon / section"><input value={troncon} onChange={e=>{setTroncon(e.target.value);emit()}} className="w-[130px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Ø (mm)"><input type="number" step="1" value={diametre} onChange={e=>{setDiametre(e.target.value);emit()}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Longueur (m)"><input type="number" step="0.1" value={longueur} onChange={e=>{setLongueur(e.target.value);emit()}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <Card title={isAir?"Essai d'étanchéité à l'air":"Essai d'étanchéité à l'eau"}>
        <div className="flex gap-3 flex-wrap">
          <FG label={isAir?"Pression d'essai (bar)":"Pression d'essai (bar)"}><input type="number" step="0.01" value={pression} onChange={e=>{setPression(e.target.value);emit()}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Durée (min)"><input type="number" step="1" value={duree} onChange={e=>{setDuree(e.target.value);emit()}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label={isAir?"P initiale (bar)":"Niveau initial"}><input type="number" step="0.001" value={valIni} onChange={e=>{setValIni(e.target.value);emit()}} className="w-[90px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label={isAir?"P finale (bar)":"Niveau final + appoint"}><input type="number" step="0.001" value={valFin} onChange={e=>{setValFin(e.target.value);emit()}} className="w-[90px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label={isAir?"Perte pression max (bar)":"Appoint max (L/m)"}><input type="number" step="0.001" value={critere} onChange={e=>{setCritere(e.target.value);emit()}} placeholder="critère" className="w-[90px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
        {perte!==null&&(
          <div className={`mt-3 px-4 py-2 rounded self-start text-[12px] font-bold border ${conforme===false?'bg-[#fcebeb] text-danger border-[#f0a0a0]':conforme?'bg-[#eaf3de] text-[#3b6d11] border-[#b5d88a]':'bg-[#e6f1fb] text-[#185fa5] border-[#90bfe8]'}`}>
            {isAir?`Perte = ${perte} bar`:`Appoint = ${perte} L/m`}{conforme!==null?` → ${conforme?'Conforme':'Non conforme'}`:''}
          </div>
        )}
      </Card>
      <FG label="Notes"><textarea value={notes} onChange={e=>{setNotes(e.target.value);emit()}} rows={2} className="w-full px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent resize-y" tabIndex={0}/></FG>
    </div>
  )
}


function LimitesAtterberg({ res, onChange, readOnly }) {
  const [wl, setWl] = useState(res.wl ?? '')
  const [wp, setWp] = useState(res.wp ?? '')
  const [ip, setIp] = useState(res.ip ?? '')
  const [wnat, setWnat] = useState(res.wnat ?? '')

  const wlNum = num(wl)
  const wpNum = num(wp)
  const computedIp = wlNum !== null && wpNum !== null ? rnd(wlNum - wpNum, 3) : num(ip)

  function emit(next = {}) {
    const nextWl = Object.prototype.hasOwnProperty.call(next, 'wl') ? next.wl : wl
    const nextWp = Object.prototype.hasOwnProperty.call(next, 'wp') ? next.wp : wp
    const nextIp = Object.prototype.hasOwnProperty.call(next, 'ip') ? next.ip : ip
    const nextWnat = Object.prototype.hasOwnProperty.call(next, 'wnat') ? next.wnat : wnat
    const nextWlNum = num(nextWl)
    const nextWpNum = num(nextWp)
    const nextComputedIp = nextWlNum !== null && nextWpNum !== null ? rnd(nextWlNum - nextWpNum, 3) : num(nextIp)
    onChange(JSON.stringify({
      wl: nextWlNum,
      wp: nextWpNum,
      ip: nextComputedIp,
      wnat: num(nextWnat),
    }))
  }

  function updateField(setter, key, value) {
    setter(value)
    emit({ [key]: value })
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 flex-wrap">
          {wlNum !== null && <div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#185fa5] leading-none">{wlNum} %</div>
            <div className="text-[11px] text-[#185fa5] mt-1 font-medium">wL</div>
          </div>}
          {wpNum !== null && <div className="px-5 py-3 bg-[#f5efe5] border border-[#d5c2a4] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#7a5c2e] leading-none">{wpNum} %</div>
            <div className="text-[11px] text-[#7a5c2e] mt-1 font-medium">wP</div>
          </div>}
          {computedIp !== null && <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#3b6d11] leading-none">{computedIp} %</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">Ip</div>
          </div>}
          {num(wnat) !== null && <div className="px-5 py-3 bg-[#ede9fe] border border-[#c4b5fd] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#5b21b6] leading-none">{num(wnat)} %</div>
            <div className="text-[11px] text-[#5b21b6] mt-1 font-medium">Wnat</div>
          </div>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Paramètres Atterberg">
        <div className="grid grid-cols-4 gap-3">
          <FG label="wL (%)">
            <input type="number" step="0.01" value={wl} onChange={e => updateField(setWl, 'wl', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="wP (%)">
            <input type="number" step="0.01" value={wp} onChange={e => updateField(setWp, 'wp', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Ip (%)">
            <input type="number" step="0.01" value={computedIp ?? ip} onChange={e => updateField(setIp, 'ip', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Wnat (%)">
            <input type="number" step="0.01" value={wnat} onChange={e => updateField(setWnat, 'wnat', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
        </div>
        {wlNum !== null && wpNum !== null && (
          <p className="text-[11px] text-text-muted italic mt-3">Ip est recalculé automatiquement à partir de wL − wP.</p>
        )}
      </Card>
    </div>
  )
}

const ID_PASSANTS_ORDER = ['0.08', '0.2', '0.5', '1', '2', '5', '10', '20', '25', '31.5', '40', '50', '63', '80']

function initIdentificationPassants(res) {
  const passants = res?.passants_percent && typeof res.passants_percent === 'object' ? res.passants_percent : {}
  const keys = Array.from(new Set([...ID_PASSANTS_ORDER, ...Object.keys(passants)])).sort((left, right) => num(left) - num(right))
  return keys.map(key => ({ d: key, passant: passants[key] ?? '' }))
}

function serializeIdentificationPassants(rows) {
  const payload = {}
  rows.forEach(row => {
    payload[String(row.d)] = row.passant === '' ? null : num(row.passant)
  })
  return payload
}



// ═══════════════════════════════════════════════════════════════════════════════
// LCC — Limites d'Atterberg à la coupelle (NF P 94-051)
// ═══════════════════════════════════════════════════════════════════════════════
function LimitesAtterbergCoupelle({ res, onChange, readOnly }) {
  const initPts = s => s?.length ? s : Array.from({length:4},()=>({n:'',w:''}))
  const [pts,   setPts]   = useState(() => initPts(res.pts_ll))
  const [wpDet, setWpDet] = useState(() => res.wp_det?.length ? res.wp_det : [{w:''},{w:''},{w:''}])
  const [wnat,  setWnat]  = useState(res.wnat ?? '')

  function calcWL(p) {
    const vPts=(p||pts).filter(r=>num(r.n)!==null&&num(r.w)!==null)
    if(vPts.length<2) return null
    const xs=vPts.map(r=>Math.log10(num(r.n))),ys=vPts.map(r=>num(r.w))
    const n=xs.length,sx=xs.reduce((a,b)=>a+b,0),sy=ys.reduce((a,b)=>a+b,0)
    const sxy=xs.reduce((a,x,i)=>a+x*ys[i],0),sxx=xs.reduce((a,x)=>a+x*x,0)
    const a=(n*sxy-sx*sy)/(n*sxx-sx*sx),b=(sy-a*sx)/n
    return rnd(a*Math.log10(25)+b,1)
  }
  function emit(p,wp) {
    const wl=calcWL(p)
    const wpVals=(wp||wpDet).map(d=>num(d.w)).filter(v=>v!==null)
    const wpMoy=wpVals.length?rnd(wpVals.reduce((a,b)=>a+b,0)/wpVals.length,1):null
    const ip=wl!==null&&wpMoy!==null?rnd(wl-wpMoy,1):null
    onChange(JSON.stringify({pts_ll:p||pts,wp_det:wp||wpDet,wnat,wl,wp:wpMoy,ip}))
  }
  function setP(i,k,v){const u=pts.map((r,j)=>j===i?{...r,[k]:v}:r);setPts(u);emit(u,null)}
  function setWP(i,v){const u=wpDet.map((r,j)=>j===i?{...r,w:v}:r);setWpDet(u);emit(null,u)}

  const wl=calcWL(pts)
  const wpVals=wpDet.map(d=>num(d.w)).filter(v=>v!==null)
  const wp=wpVals.length?rnd(wpVals.reduce((a,b)=>a+b,0)/wpVals.length,1):null
  const ip=wl!==null&&wp!==null?rnd(wl-wp,1):null

  if(readOnly) return (
    <div className="flex gap-3 flex-wrap">
      {wl!==null&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center"><div className="text-[26px] font-bold text-[#185fa5]">{wl}</div><div className="text-[11px] text-[#185fa5] mt-1">WL (%)</div></div>}
      {wp!==null&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[26px] font-bold text-text">{wp}</div><div className="text-[11px] text-text-muted mt-1">WP (%)</div></div>}
      {ip!==null&&<div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center"><div className="text-[26px] font-bold text-[#3b6d11]">{ip}</div><div className="text-[11px] text-[#5a8f30] mt-1">IP (%)</div></div>}
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <Card title="Limite de liquidité — Coupelle Casagrande (WL à N=25 par régression)">
        <table className="border-collapse text-sm"><thead><tr className="bg-bg border-b border-border">
          <th className="px-3 py-2 text-[11px] font-medium text-text-muted">Mesure</th>
          <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">N (coups)</th>
          <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">w (%)</th>
        </tr></thead><tbody>
          {pts.map((r,i)=>(
            <tr key={i} className="border-b border-border">
              <td className="px-3 py-1 text-[12px] text-text-muted">{i+1}</td>
              <td className="px-1 py-1"><input type="number" step="1" value={r.n} onChange={e=>setP(i,'n',e.target.value)} placeholder="—" className="w-[70px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1"><input type="number" step="0.1" value={r.w} onChange={e=>setP(i,'w',e.target.value)} placeholder="—" className="w-[70px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
            </tr>
          ))}
        </tbody></table>
        {wl!==null&&<div className="mt-3 text-[13px] font-bold text-accent">WL = {wl} %</div>}
      </Card>
      <Card title="Limite de plasticité WP (3 déterminations)">
        <div className="flex gap-3 items-end">
          {wpDet.map((d,i)=>(
            <FG key={i} label={`WP ${i+1} (%)`}>
              <input type="number" step="0.1" value={d.w} onChange={e=>setWP(i,e.target.value)} placeholder="—" className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
          ))}
          {wp!==null&&<div className="pb-2 text-[13px] font-bold text-text">moy = {wp} %</div>}
        </div>
      </Card>
      <Card title="Contexte">
        <FG label="Wnat (%)"><input type="number" step="0.1" value={wnat} onChange={e=>{setWnat(e.target.value);emit(null,null)}} placeholder="optionnel" className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
      </Card>
      {ip!==null&&<div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center"><div className="text-[28px] font-bold text-[#3b6d11]">{ip}</div><div className="text-[11px] text-[#5a8f30] mt-1">IP = WL − WP (%)</div></div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// IM — Gonflement après immersion (NF P 94-078)
// ═══════════════════════════════════════════════════════════════════════════════
function GonflementImmersion({ res, onChange, readOnly }) {
  const [hMoule,setHMoule] = useState(res.h_moule??'127')
  const [soakDays,setSoakDays] = useState(res.soak_days??'4')
  const [w_ini,setWIni] = useState(res.w_ini??'')
  const [rho_d_ini,setRhoDIni] = useState(res.rho_d_ini??'')
  const [rows,setRows] = useState(()=>res.rows?.length?res.rows:[{id:1,moule_ref:'',delta_ini:'',delta_fin:''}])

  function calc(r,hm){const hm_=num(hm||hMoule)||127;return(r||rows).map(row=>{const gi=num(row.delta_ini),gf=num(row.delta_fin);return{...row,gonflement:gi!==null&&gf!==null?rnd((gf-gi)/hm_*100,2):null}})}
  function emit(r,hm){const u=calc(r,hm);const gs=u.map(r=>r.gonflement).filter(v=>v!==null);const g=gs.length?rnd(gs.reduce((a,b)=>a+b,0)/gs.length,2):null;onChange(JSON.stringify({rows:u,h_moule:hm||hMoule,soak_days:soakDays,w_ini,rho_d_ini,gonflement:g}))}
  function setRow(i,k,v){const u=rows.map((r,j)=>j===i?{...r,[k]:v}:r);setRows(u);emit(u,null)}

  const rowsC=calc(rows,null);const gonfs=rowsC.map(r=>r.gonflement).filter(v=>v!==null);const gonf_moy=gonfs.length?rnd(gonfs.reduce((a,b)=>a+b,0)/gonfs.length,2):null

  const badge=<div className="px-5 py-3 bg-[#faeeda] border border-[#e0c070] rounded-lg self-start text-center"><div className="text-[28px] font-bold text-[#854f0b]">{gonf_moy??'—'}</div><div className="text-[11px] text-[#854f0b] mt-1">Gonflement moyen (%)</div></div>

  if(readOnly) return (<div className="flex flex-col gap-4">{gonf_moy!==null&&badge}<table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border">{['Moule','δ ini (mm)','δ fin (mm)','Gonfl. (%)'].map(h=><th key={h} className="px-3 py-2 text-right text-[11px] font-medium text-text-muted first:text-left">{h}</th>)}</tr></thead><tbody>{rowsC.map((r,i)=><tr key={i} className="border-b border-border"><td className="px-3 py-1.5 text-[12px] font-mono">{r.moule_ref||`M${r.id}`}</td><td className="px-3 py-1.5 text-right text-[12px]">{r.delta_ini||'—'}</td><td className="px-3 py-1.5 text-right text-[12px]">{r.delta_fin||'—'}</td><td className="px-3 py-1.5 text-right font-bold text-accent">{r.gonflement??'—'}</td></tr>)}</tbody></table></div>)

  return (
    <div className="flex flex-col gap-4">
      <Card title="Conditions">
        <div className="flex gap-3 flex-wrap">
          <FG label="Durée immersion (j)"><input type="number" step="1" value={soakDays} onChange={e=>{setSoakDays(e.target.value);emit(null,null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="H moule (mm)"><input type="number" step="1" value={hMoule} onChange={e=>{setHMoule(e.target.value);emit(null,e.target.value)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="w ini (%)"><input type="number" step="0.1" value={w_ini} onChange={e=>{setWIni(e.target.value);emit(null,null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="ρd ini (Mg/m³)"><input type="number" step="0.001" value={rho_d_ini} onChange={e=>{setRhoDIni(e.target.value);emit(null,null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <Card title="Mesures">
        <table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border"><th className="px-2 py-2 text-[11px] font-medium text-text-muted">Moule</th><th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">δ ini (mm)</th><th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">δ fin (mm)</th><th className="px-2 py-2 text-right text-[11px] font-bold text-accent">Gonfl. (%)</th></tr></thead>
          <tbody>{rowsC.map((r,i)=>(
            <tr key={i} className="border-b border-border">
              <td className="px-1 py-1"><input value={r.moule_ref} onChange={e=>setRow(i,'moule_ref',e.target.value)} placeholder={`M${r.id}`} className="w-[70px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1"><input type="number" step="0.01" value={r.delta_ini} onChange={e=>setRow(i,'delta_ini',e.target.value)} placeholder="mm" className="w-[80px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1"><input type="number" step="0.01" value={r.delta_fin} onChange={e=>setRow(i,'delta_fin',e.target.value)} placeholder="mm" className="w-[80px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className={`px-3 py-1 text-right text-[12px] font-bold ${r.gonflement!==null?'text-accent':'text-text-muted'}`}>{r.gonflement??'—'}</td>
            </tr>
          ))}</tbody>
        </table>
        <button onClick={()=>{const u=[...rows,{id:rows.length+1,moule_ref:'',delta_ini:'',delta_fin:''}];setRows(u);emit(u,null)}} className="mt-2 text-[12px] text-text-muted hover:text-text border border-dashed border-border rounded px-3 py-1" tabIndex={0}>+ Ajouter moule</button>
      </Card>
      {gonf_moy!==null&&badge}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ET — Étude de traitement à la chaux/liant (GTS 2000)
// ═══════════════════════════════════════════════════════════════════════════════
function EtudeTraitement({ res, onChange, readOnly }) {
  const initRows = s => s?.length?s:Array.from({length:5},()=>({dosage:'',wOPN:'',rhoOPN:'',ipi:'',rc:''}))
  const [rows,setRows]=useState(()=>initRows(res.rows))
  const [produit,setProduit]=useState(res.produit??'CaO')
  const [nature,setNature]=useState(res.nature??'')
  const [notes,setNotes]=useState(res.notes??'')

  function emit(r){const u=r||rows;const best=u.reduce((b,r)=>num(r.ipi)!==null&&(b===null||num(r.ipi)>num(b.ipi))?r:b,null);onChange(JSON.stringify({rows:u,produit,nature,notes,dosage_optimal:best?.dosage??null,ipi_max:best?.ipi??null}))}
  function setR(i,k,v){const u=rows.map((r,j)=>j===i?{...r,[k]:v}:r);setRows(u);emit(u)}
  const best=rows.reduce((b,r)=>num(r.ipi)!==null&&(b===null||num(r.ipi)>num(b.ipi))?r:b,null)

  if(readOnly) return (<div className="flex flex-col gap-4">{best?.ipi&&<div className="flex gap-3"><div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center"><div className="text-[24px] font-bold text-[#3b6d11]">{best.ipi}</div><div className="text-[11px] text-[#5a8f30] mt-1">IPI max</div></div><div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center"><div className="text-[24px] font-bold text-[#185fa5]">{best.dosage}%</div><div className="text-[11px] text-[#185fa5] mt-1">{produit} optimal</div></div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Identification"><div className="flex gap-3 flex-wrap"><FG label="Produit"><input value={produit} onChange={e=>{setProduit(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG><FG label="Nature matériau"><input value={nature} onChange={e=>{setNature(e.target.value);emit(null)}} className="w-[200px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG></div></Card>
      <Card title={`Résultats par dosage ${produit}`}>
        <table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border">{[`% ${produit}`,'wOPN (%)','ρdOPN','IPI','Rc 7j (kPa)'].map(h=><th key={h} className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=><tr key={i} className="border-b border-border">{['dosage','wOPN','rhoOPN','ipi','rc'].map(k=><td key={k} className="px-1 py-1"><input type="number" step="0.1" value={r[k]} onChange={e=>setR(i,k,e.target.value)} placeholder="—" className={`w-[80px] px-2 py-1 border rounded text-[12px] bg-bg outline-none text-right ${k==='ipi'?'border-accent':'border-border'} focus:border-accent`} tabIndex={0}/></td>)}</tr>)}</tbody>
        </table>
      </Card>
      <FG label="Notes"><TA value={notes} onChange={v=>{setNotes(v);emit(null)}}/></FG>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// REA — Réactivité de la chaux vive (EN 459-2)
// ═══════════════════════════════════════════════════════════════════════════════
function ReactiviteChaux({ res, onChange, readOnly }) {
  const initPts=s=>s?.length?s:Array.from({length:12},(_,i)=>({t:String((i+1)*5),T:''}))
  const [pts,setPts]=useState(()=>initPts(res.pts))
  const [fournisseur,setFournisseur]=useState(res.fournisseur??'')

  function emit(p){const u=p||pts;const temps=u.map(r=>({t:num(r.t),T:num(r.T)})).filter(r=>r.t!==null&&r.T!==null);const tmax=temps.length?rnd(Math.max(...temps.map(r=>r.T)),1):null;const t60=temps.find(r=>r.T>=60)?.t??null;onChange(JSON.stringify({pts:u,fournisseur,t_max:tmax,t_60:t60}))}
  function setP(i,k,v){const u=pts.map((r,j)=>j===i?{...r,[k]:v}:r);setPts(u);emit(u)}
  const temps=pts.map(r=>({t:num(r.t),T:num(r.T)})).filter(r=>r.t!==null&&r.T!==null)
  const tmax=temps.length?rnd(Math.max(...temps.map(r=>r.T)),1):null

  if(readOnly) return (<div className="flex flex-col gap-4">{tmax&&<div className="px-5 py-3 bg-[#fcebeb] border border-[#f0a0a0] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#a32d2d]">{tmax}</div><div className="text-[11px] text-[#a32d2d] mt-1">T max (°C)</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Fournisseur"><FG label="Fournisseur / référence"><input value={fournisseur} onChange={e=>{setFournisseur(e.target.value);emit(null)}} className="w-[250px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG></Card>
      <Card title="Mesures T=f(t)">
        <div className="grid grid-cols-4 gap-2">
          {pts.map((r,i)=>(
            <div key={i} className="flex items-center gap-1">
              <input type="number" step="1" value={r.t} onChange={e=>setP(i,'t',e.target.value)} placeholder="min" className="w-[45px] px-1 py-1 border border-border rounded text-[11px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/>
              <span className="text-[10px] text-text-muted">→</span>
              <input type="number" step="0.1" value={r.T} onChange={e=>setP(i,'T',e.target.value)} placeholder="°C" className="w-[50px] px-1 py-1 border border-border rounded text-[11px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/>
              <span className="text-[10px] text-text-muted">°C</span>
            </div>
          ))}
        </div>
        {tmax&&<p className="mt-3 text-[13px] font-bold text-accent">T max = {tmax} °C</p>}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// STS — Suivi de traitement des sols (GTS 2000)
// ═══════════════════════════════════════════════════════════════════════════════
function SuiviTraitementSols({ res, onChange, readOnly }) {
  const initRows=s=>s?.length?s:Array.from({length:6},()=>({zone:'',w_avant:'',w_apres:'',ds_apres:'',compacite:'',dosage_reel:'',ok:''}))
  const [rows,setRows]=useState(()=>initRows(res.rows))
  const [rhoOPN,setRhoOPN]=useState(res.rho_d_OPN??'')
  const [wOPN,setWOPN]=useState(res.w_OPN??'')
  const [dosageTheo,setDosageTheo]=useState(res.dosage_theorique??'')

  function emit(r){const u=r||rows;const comp=u.map(row=>num(row.compacite)).filter(v=>v!==null);const c=comp.length?rnd(comp.reduce((a,b)=>a+b,0)/comp.length,1):null;onChange(JSON.stringify({rows:u,rho_d_OPN:rhoOPN,w_OPN:wOPN,dosage_theorique:dosageTheo,compacite_moy:c}))}
  function setR(i,k,v){const u=rows.map((r,j)=>j===i?{...r,[k]:v}:r);setRows(u);emit(u)}
  const comp=rows.map(r=>num(r.compacite)).filter(v=>v!==null);const compMoy=comp.length?rnd(comp.reduce((a,b)=>a+b,0)/comp.length,1):null

  if(readOnly) return (<div className="flex flex-col gap-4">{compMoy!==null&&<div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#3b6d11]">{compMoy} %</div><div className="text-[11px] text-[#5a8f30] mt-1">Compacité moyenne</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Références OPN">
        <div className="flex gap-3 flex-wrap">
          <FG label="ρd OPN (Mg/m³)"><input type="number" step="0.001" value={rhoOPN} onChange={e=>{setRhoOPN(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="w OPN (%)"><input type="number" step="0.1" value={wOPN} onChange={e=>{setWOPN(e.target.value);emit(null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Dosage théorique (%)"><input type="number" step="0.1" value={dosageTheo} onChange={e=>{setDosageTheo(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <Card title="Suivi par zone">
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead><tr className="bg-bg border-b border-border">{['Zone','w avant','w après','ρd après','Compac. %','Dos. réel %','Stat.'].map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=>(
              <tr key={i} className="border-b border-border">
                {[['zone','text'],['w_avant','number'],['w_apres','number'],['ds_apres','number'],['compacite','number'],['dosage_reel','number']].map(([k,t])=><td key={k} className="px-1 py-1"><input type={t} step="0.1" value={r[k]} onChange={e=>setR(i,k,e.target.value)} placeholder="—" className="w-[68px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>)}
                <td className="px-1 py-1"><select value={r.ok} onChange={e=>setR(i,'ok',e.target.value)} className="px-1 py-1 border border-border rounded text-[11px] bg-bg outline-none" tabIndex={0}><option value="">—</option><option>C</option><option>R</option><option>NC</option></select></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {compMoy!==null&&<p className="mt-2 text-[13px] font-bold text-accent">Compacité moy = {compMoy} %</p>}
      </Card>
    </div>
  )
}



// ═══════════════════════════════════════════════════════════════════════════════
// DS/DE — Densité en place (Gammadensimètre) — sols (DS) ou enrobés (DE)
// ═══════════════════════════════════════════════════════════════════════════════
function GammaDensite({ res, onChange, readOnly, essai }) {
  const isDE = String(essai?.essai_code||essai?.code_essai||'').toUpperCase()==='DE'
  const initRows=s=>s?.length?s:Array.from({length:6},()=>({pos:'',rho_h:'',w:'',rho_d:'',compacite:'',ok:''}))
  const [rows,setRows]=useState(()=>initRows(res.rows))
  const [rhoOPN,setRhoOPN]=useState(res.rho_d_ref??'')
  const [critere,setCritere]=useState(res.critere??'')
  const [appareil,setAppareil]=useState(res.appareil??'')
  const [couche,setCouche]=useState(res.couche??'')

  function calcRow(r,ref){const rh=num(r.rho_h),w=num(r.w),rd=num(r.rho_d)||(rh!==null&&w!==null?rnd(rh/(1+w/100),3):null);const ref_=num(ref||rhoOPN);const comp=rd!==null&&ref_!==null?rnd(rd/ref_*100,1):null;return{...r,rho_d:String(rd??r.rho_d??''),compacite:comp!==null?String(comp):r.compacite}}
  function emit(r,ref){const u=(r||rows).map(row=>calcRow(row,ref));const comps=u.map(r=>num(r.compacite)).filter(v=>v!==null);const c=comps.length?rnd(comps.reduce((a,b)=>a+b,0)/comps.length,1):null;onChange(JSON.stringify({rows:u,rho_d_ref:ref||rhoOPN,critere,appareil,couche,compacite_moy:c}))}
  function setR(i,k,v){const u=rows.map((r,j)=>j===i?{...r,[k]:v}:r);setRows(u);emit(u,null)}

  const rowsC=rows.map(r=>calcRow(r,null))
  const comps=rowsC.map(r=>num(r.compacite)).filter(v=>v!==null)
  const compMoy=comps.length?rnd(comps.reduce((a,b)=>a+b,0)/comps.length,1):null

  const label=isDE?'Enrobés':'Sols'
  const badge=<div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#3b6d11]">{compMoy} %</div><div className="text-[11px] text-[#5a8f30] mt-1">Compacité moyenne</div></div>

  if(readOnly) return (<div className="flex flex-col gap-4">{compMoy!==null&&badge}<table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border">{['Position','ρh','w%','ρd','Comp.%','Stat.'].map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted">{h}</th>)}</tr></thead><tbody>{rowsC.filter(r=>r.pos||r.rho_h).map((r,i)=><tr key={i} className="border-b border-border"><td className="px-3 py-1.5 text-[12px]">{r.pos}</td><td className="px-3 py-1.5 text-right text-[12px]">{r.rho_h}</td><td className="px-3 py-1.5 text-right text-[12px]">{r.w}</td><td className="px-3 py-1.5 text-right text-[12px]">{r.rho_d}</td><td className="px-3 py-1.5 text-right font-bold text-accent text-[12px]">{r.compacite}</td><td className={`px-3 py-1.5 text-center text-[11px] font-bold ${r.ok==='C'?'text-green-600':r.ok==='NC'?'text-danger':''}`}>{r.ok}</td></tr>)}</tbody></table></div>)

  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte">
        <div className="flex gap-3 flex-wrap">
          <FG label="Couche"><input value={couche} onChange={e=>{setCouche(e.target.value);emit(null,null)}} className="w-[160px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Appareil"><input value={appareil} onChange={e=>{setAppareil(e.target.value);emit(null,null)}} className="w-[120px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label={`ρd référence (Mg/m³)`}><input type="number" step="0.001" value={rhoOPN} onChange={e=>{setRhoOPN(e.target.value);emit(null,e.target.value)}} placeholder="OPN/formule" className="w-[110px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Critère compacité (%)"><input type="number" step="0.1" value={critere} onChange={e=>{setCritere(e.target.value);emit(null,null)}} placeholder="ex: 95" className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <Card title={`Mesures ${label} — gammadensimètre`}>
        <div className="overflow-x-auto"><table className="border-collapse text-sm"><thead><tr className="bg-bg border-b border-border">{['Position','ρh (Mg/m³)','w (%)','ρd calculé','Comp. (%)','Statut'].map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=>{const c=calcRow(r,null);return(
            <tr key={i} className={`border-b border-border ${!r.pos&&!r.rho_h?'opacity-40':''}`}>
              <td className="px-1 py-1"><input value={r.pos} onChange={e=>setR(i,'pos',e.target.value)} placeholder={`P${i+1}`} className="w-[80px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1"><input type="number" step="0.001" value={r.rho_h} onChange={e=>setR(i,'rho_h',e.target.value)} placeholder="Mg/m³" className="w-[80px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className="px-1 py-1"><input type="number" step="0.1" value={r.w} onChange={e=>setR(i,'w',e.target.value)} placeholder="%" className="w-[70px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              <td className="px-3 py-1 text-right text-[12px] text-text-muted">{c.rho_d||'—'}</td>
              <td className={`px-3 py-1 text-right text-[12px] font-bold ${c.compacite?'text-accent':'text-text-muted'}`}>{c.compacite||'—'}</td>
              <td className="px-1 py-1"><select value={r.ok} onChange={e=>setR(i,'ok',e.target.value)} className="px-1 py-1 border border-border rounded text-[11px] bg-bg outline-none" tabIndex={0}><option value="">—</option><option>C</option><option>R</option><option>NC</option></select></td>
            </tr>
          )})}
        </tbody></table></div>
        {compMoy!==null&&badge}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// QS — Contrôle du compactage (fiche GTR)
// ═══════════════════════════════════════════════════════════════════════════════
function ControleCompactage({ res, onChange, readOnly }) {
  const initRows=s=>s?.length?s:Array.from({length:8},()=>({pos:'',nature:'',wn:'',classe:'',ds:'',compacite:'',we:'',ok:''}))
  const [rows,setRows]=useState(()=>initRows(res.rows))
  const [rhoOPN,setRhoOPN]=useState(res.rho_d_ref??'')
  const [couche,setCouche]=useState(res.couche??'')

  function emit(r){const u=r||rows;const comp=u.map(r=>num(r.compacite)).filter(v=>v!==null);const c=comp.length?rnd(comp.reduce((a,b)=>a+b,0)/comp.length,1):null;onChange(JSON.stringify({rows:u,rho_d_ref:rhoOPN,couche,nb_points:u.filter(r=>r.pos).length,compacite_moy:c}))}
  function setR(i,k,v){const u=rows.map((r,j)=>j===i?{...r,[k]:v}:r);setRows(u);emit(u)}
  const nbOK=rows.filter(r=>r.ok==='C').length, nbNC=rows.filter(r=>r.ok==='NC').length

  if(readOnly) return (<div className="flex flex-col gap-3">{<div className="flex gap-2"><div className="px-4 py-2 bg-[#eaf3de] border border-[#b5d88a] rounded text-center"><div className="text-[20px] font-bold text-[#3b6d11]">{nbOK}</div><div className="text-[10px] text-[#5a8f30]">Conformes</div></div>{nbNC>0&&<div className="px-4 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded text-center"><div className="text-[20px] font-bold text-[#a32d2d]">{nbNC}</div><div className="text-[10px] text-[#a32d2d]">Non conformes</div></div>}</div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte">
        <div className="flex gap-3"><FG label="Couche"><input value={couche} onChange={e=>{setCouche(e.target.value);emit(null)}} className="w-[160px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG><FG label="ρd ref (Mg/m³)"><input type="number" step="0.001" value={rhoOPN} onChange={e=>{setRhoOPN(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG></div>
      </Card>
      <Card title="Points de contrôle">
        <div className="overflow-x-auto"><table className="border-collapse text-sm"><thead><tr className="bg-bg border-b border-border">{['Position','Nature','wn%','Classe','ρd','Comp.%','WE%','Stat.'].map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i} className={`border-b border-border ${!r.pos?'opacity-30':''}`}>
              {['pos','nature','wn','classe','ds','compacite','we'].map(k=><td key={k} className="px-1 py-1"><input type={['wn','ds','compacite','we'].includes(k)?'number':'text'} step="0.1" value={r[k]} onChange={e=>setR(i,k,e.target.value)} placeholder="—" className="w-[68px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>)}
              <td className="px-1 py-1"><select value={r.ok} onChange={e=>setR(i,'ok',e.target.value)} className="px-1 py-1 border border-border rounded text-[11px] bg-bg outline-none" tabIndex={0}><option value="">—</option><option>C</option><option>R</option><option>NC</option></select></td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="flex gap-2 mt-2">
          <div className="px-4 py-2 bg-[#eaf3de] border border-[#b5d88a] rounded text-center"><div className="text-[18px] font-bold text-[#3b6d11]">{nbOK}</div><div className="text-[10px] text-[#5a8f30]">C</div></div>
          {nbNC>0&&<div className="px-4 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded text-center"><div className="text-[18px] font-bold text-[#a32d2d]">{nbNC}</div><div className="text-[10px] text-[#a32d2d]">NC</div></div>}
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PL — Portances EV1 / EV2 (NF P 94-117-1)
// ═══════════════════════════════════════════════════════════════════════════════
function PortancesPlaque({ res, onChange, readOnly, essai }) {
  const code=String(essai?.essai_code||essai?.code_essai||'').toUpperCase()
  const hasPLD=code==='PLD'||code==='PDL'
  const initRows=s=>s?.length?s:Array.from({length:6},()=>({pos:'',ev1:'',ev2:'',evd:'',ratio:'',ok:''}))
  const [rows,setRows]=useState(()=>initRows(res.rows))
  const [critEV2,setCritEV2]=useState(res.crit_ev2??'')
  const [critRatio,setCritRatio]=useState(res.crit_ratio??'')
  const [couche,setCouche]=useState(res.couche??'')

  function calcRatio(r){const e1=num(r.ev1),e2=num(r.ev2)||num(r.evd);return e1&&e2?rnd(e2/e1,1):null}
  function emit(r){const u=r||rows;const ev2s=u.map(r=>num(r.ev2)||num(r.evd)).filter(v=>v!==null);const moy=ev2s.length?rnd(ev2s.reduce((a,b)=>a+b,0)/ev2s.length,0):null;onChange(JSON.stringify({rows:u,crit_ev2:critEV2,crit_ratio:critRatio,couche,ev2_moy:moy,nb_points:u.filter(r=>r.pos).length}))}
  function setR(i,k,v){const u=rows.map((r,j)=>j===i?{...r,[k]:v}:r);setRows(u);emit(u)}
  const ev2s=rows.map(r=>num(r.ev2)||num(r.evd)).filter(v=>v!==null);const ev2Moy=ev2s.length?rnd(ev2s.reduce((a,b)=>a+b,0)/ev2s.length,0):null
  const badge=ev2Moy!==null&&<div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#3b6d11]">{ev2Moy}</div><div className="text-[11px] text-[#5a8f30] mt-1">{hasPLD?'EVd moyen (MPa)':'EV2 moyen (MPa)'}</div></div>
  const cols=hasPLD?['Position','EVd (MPa)','Statut']:['Position','EV1 (MPa)','EV2 (MPa)','EV2/EV1','Statut']

  if(readOnly) return (<div className="flex flex-col gap-4">{badge}<table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border">{cols.map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted">{h}</th>)}</tr></thead><tbody>{rows.filter(r=>r.pos).map((r,i)=><tr key={i} className="border-b border-border"><td className="px-3 py-1.5 text-[12px]">{r.pos}</td>{!hasPLD&&<td className="px-3 py-1.5 text-right text-[12px]">{r.ev1||'—'}</td>}<td className="px-3 py-1.5 text-right font-bold text-accent text-[12px]">{r.ev2||r.evd||'—'}</td>{!hasPLD&&<td className="px-3 py-1.5 text-right text-[12px]">{calcRatio(r)??'—'}</td>}<td className={`px-3 py-1.5 text-center text-[11px] font-bold ${r.ok==='C'?'text-green-600':r.ok==='NC'?'text-danger':''}`}>{r.ok}</td></tr>)}</tbody></table></div>)

  return (
    <div className="flex flex-col gap-4">
      <Card title="Critères">
        <div className="flex gap-3 flex-wrap">
          <FG label="Couche"><input value={couche} onChange={e=>{setCouche(e.target.value);emit(null)}} className="w-[160px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label={hasPLD?'EVd min (MPa)':'EV2 min (MPa)'}><input type="number" step="1" value={critEV2} onChange={e=>{setCritEV2(e.target.value);emit(null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          {!hasPLD&&<FG label="Ratio EV2/EV1 max"><input type="number" step="0.1" value={critRatio} onChange={e=>{setCritRatio(e.target.value);emit(null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>}
        </div>
      </Card>
      <Card title="Mesures">
        <div className="overflow-x-auto"><table className="border-collapse text-sm"><thead><tr className="bg-bg border-b border-border">{cols.map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i} className={`border-b border-border ${!r.pos?'opacity-30':''}`}>
              <td className="px-1 py-1"><input value={r.pos} onChange={e=>setR(i,'pos',e.target.value)} placeholder={`P${i+1}`} className="w-[90px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>
              {!hasPLD&&<td className="px-1 py-1"><input type="number" step="1" value={r.ev1} onChange={e=>setR(i,'ev1',e.target.value)} placeholder="MPa" className="w-[70px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>}
              <td className="px-1 py-1"><input type="number" step="1" value={hasPLD?r.evd:r.ev2} onChange={e=>setR(i,hasPLD?'evd':'ev2',e.target.value)} placeholder="MPa" className="w-[70px] px-2 py-1 border border-accent rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
              {!hasPLD&&<td className="px-3 py-1 text-right text-[12px] text-text-muted">{calcRatio(r)??'—'}</td>}
              <td className="px-1 py-1"><select value={r.ok} onChange={e=>setR(i,'ok',e.target.value)} className="px-1 py-1 border border-border rounded text-[11px] bg-bg outline-none" tabIndex={0}><option value="">—</option><option>C</option><option>R</option><option>NC</option></select></td>
            </tr>
          ))}</tbody>
        </table></div>
        {badge}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PA — Pénétromètre / PANDA (profil qd=f(z))
// ═══════════════════════════════════════════════════════════════════════════════
function Penetrometre({ res, onChange, readOnly }) {
  const initPts=s=>s?.length?s:Array.from({length:20},(_,i)=>({z:String((i+1)*0.1),qd:''}))
  const [pts,setPts]=useState(()=>initPts(res.pts))
  const [type,setType]=useState(res.type??'PANDA')
  const [appareil,setAppareil]=useState(res.appareil??'')
  const [refus,setRefus]=useState(res.refus??false)

  function emit(p){const u=p||pts;const vals=u.map(r=>({z:num(r.z),qd:num(r.qd)})).filter(r=>r.z!==null&&r.qd!==null);const qd_moy=vals.length?rnd(vals.reduce((a,b)=>a+b.qd,0)/vals.length,1):null;const z_max=vals.length?Math.max(...vals.map(r=>r.z)):null;onChange(JSON.stringify({pts:u,type,appareil,refus,qd_moy,z_max}))}
  function setP(i,k,v){const u=pts.map((r,j)=>j===i?{...r,[k]:v}:r);setPts(u);emit(u)}

  const W=400,H=320,PL=48,PR=20,PT=16,PB=36,iW=W-PL-PR,iH=H-PT-PB
  const validPts=pts.map(r=>({z:num(r.z),qd:num(r.qd)})).filter(r=>r.z!==null&&r.qd!==null)
  const zMax=validPts.length?Math.max(...validPts.map(r=>r.z)):4
  const qdMax=validPts.length?Math.max(...validPts.map(r=>r.qd))*1.15:10
  const xScale=qd=>PL+(qd/qdMax)*iW
  const yScale=z=>PT+(z/zMax)*iH
  const qd_moy=validPts.length?rnd(validPts.reduce((a,b)=>a+b.qd,0)/validPts.length,1):null

  const chart=validPts.length>1&&(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg">
      <rect x={PL} y={PT} width={iW} height={iH} fill="#fff" stroke="#d4d2ca" strokeWidth="1"/>
      <line x1={PL} y1={PT+iH} x2={PL+iW} y2={PT+iH} stroke="#999" strokeWidth="1"/>
      {[0,1,2,3,4].map(z=>z<=zMax&&<g key={z}><line x1={PL} y1={yScale(z)} x2={PL+iW} y2={yScale(z)} stroke="#d4d2ca" strokeWidth="0.5" strokeDasharray="2,3"/><text x={PL-5} y={yScale(z)+4} textAnchor="end" fontSize="9" fill="#888">{z}m</text></g>)}
      <text x={PL+iW/2} y={H-4} textAnchor="middle" fontSize="9" fill="#888">qd (MPa)</text>
      <text x={12} y={PT+iH/2} textAnchor="middle" fontSize="9" fill="#888" transform={`rotate(-90,12,${PT+iH/2})`}>Profondeur (m)</text>
      <polyline points={validPts.map(p=>`${xScale(p.qd).toFixed(1)},${yScale(p.z).toFixed(1)}`).join(' ')} fill="none" stroke="#3b82f6" strokeWidth="2"/>
    </svg>
  )

  if(readOnly) return (<div className="flex flex-col gap-4">{qd_moy!==null&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#185fa5]">{qd_moy}</div><div className="text-[11px] text-[#185fa5] mt-1">qd moyen (MPa)</div></div>}<Card title="Profil">{chart}</Card></div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Identification"><div className="flex gap-3 flex-wrap"><FG label="Type d'appareil"><select value={type} onChange={e=>{setType(e.target.value);emit(null)}} className="px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none" tabIndex={0}><option>PANDA</option><option>Pénétromètre statique</option><option>Pénétromètre dynamique</option></select></FG><FG label="Appareil N°"><input value={appareil} onChange={e=>{setAppareil(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG></div></Card>
      <div className="flex gap-4 items-start">
        <Card title="Lectures z (m) / qd (MPa)">
          <div className="grid grid-cols-2 gap-1 max-h-[400px] overflow-y-auto">
            {pts.map((r,i)=>(
              <div key={i} className="flex items-center gap-1">
                <input type="number" step="0.05" value={r.z} onChange={e=>setP(i,'z',e.target.value)} className="w-[50px] px-1 py-0.5 border border-border rounded text-[11px] bg-bg outline-none text-right" tabIndex={0}/>
                <span className="text-[10px] text-text-muted">→</span>
                <input type="number" step="0.01" value={r.qd} onChange={e=>setP(i,'qd',e.target.value)} placeholder="MPa" className="w-[60px] px-1 py-0.5 border border-border rounded text-[11px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/>
              </div>
            ))}
          </div>
          <button onClick={()=>{const last=pts.at(-1);const u=[...pts,{z:last?String(rnd(num(last.z)+0.1,2)):'',qd:''}];setPts(u);emit(u)}} className="mt-2 text-[11px] text-text-muted hover:text-text border border-dashed border-border rounded px-3 py-1" tabIndex={0}>+ Ajouter</button>
        </Card>
        <div className="flex-1"><Card title="Profil">{chart||<div className="text-[12px] text-text-muted italic p-4">Saisir les mesures</div>}</Card></div>
      </div>
    </div>
  )
}


function IdentificationGTR({ res, onChange, readOnly }) {
  const [passants, setPassants] = useState(() => initIdentificationPassants(res))
  const [wnPercent, setWnPercent] = useState(res.wn_percent ?? '')
  const [dmaxMm, setDmaxMm] = useState(res.dmax_mm ?? '')
  const [ip, setIp] = useState(res.ip ?? '')
  const [ic, setIc] = useState(res.ic ?? '')
  const [vbs, setVbs] = useState(res.vbs ?? '')
  const [es, setEs] = useState(res.es ?? '')
  const [ipi, setIpi] = useState(res.ipi ?? '')
  const [gtrClass, setGtrClass] = useState(res.gtr_class ?? '')
  const [gtrState, setGtrState] = useState(res.gtr_state ?? '')

  function emit(next = {}) {
    const nextPassants = Object.prototype.hasOwnProperty.call(next, 'passants') ? next.passants : passants
    onChange(JSON.stringify({
      passants_percent: serializeIdentificationPassants(nextPassants),
      wn_percent: num(Object.prototype.hasOwnProperty.call(next, 'wn_percent') ? next.wn_percent : wnPercent),
      dmax_mm: num(Object.prototype.hasOwnProperty.call(next, 'dmax_mm') ? next.dmax_mm : dmaxMm),
      ip: num(Object.prototype.hasOwnProperty.call(next, 'ip') ? next.ip : ip),
      ic: num(Object.prototype.hasOwnProperty.call(next, 'ic') ? next.ic : ic),
      vbs: num(Object.prototype.hasOwnProperty.call(next, 'vbs') ? next.vbs : vbs),
      es: num(Object.prototype.hasOwnProperty.call(next, 'es') ? next.es : es),
      ipi: num(Object.prototype.hasOwnProperty.call(next, 'ipi') ? next.ipi : ipi),
      gtr_class: Object.prototype.hasOwnProperty.call(next, 'gtr_class') ? String(next.gtr_class || '') : String(gtrClass || ''),
      gtr_state: Object.prototype.hasOwnProperty.call(next, 'gtr_state') ? String(next.gtr_state || '') : String(gtrState || ''),
    }))
  }

  function updateMetric(setter, key, value) {
    setter(value)
    emit({ [key]: value })
  }

  function setPassant(index, value) {
    const next = passants.map((row, rowIndex) => rowIndex === index ? { ...row, passant: value } : row)
    setPassants(next)
    emit({ passants: next })
  }

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 flex-wrap">
          {!!String(gtrClass || '').trim() && <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#3b6d11] leading-none">{gtrClass}{gtrState ? ` (${gtrState})` : ''}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">Classe GTR</div>
          </div>}
          {num(ipi) !== null && <div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#185fa5] leading-none">{num(ipi)} %</div>
            <div className="text-[11px] text-[#185fa5] mt-1 font-medium">IPI</div>
          </div>}
          {num(vbs) !== null && <div className="px-5 py-3 bg-[#f5efe5] border border-[#d5c2a4] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#7a5c2e] leading-none">{num(vbs)}</div>
            <div className="text-[11px] text-[#7a5c2e] mt-1 font-medium">VBS</div>
          </div>}
          {num(wnPercent) !== null && <div className="px-5 py-3 bg-[#ede9fe] border border-[#c4b5fd] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#5b21b6] leading-none">{num(wnPercent)} %</div>
            <div className="text-[11px] text-[#5b21b6] mt-1 font-medium">Wn</div>
          </div>}
        </div>
        <Card title="Synthèse identification">
          <div className="grid grid-cols-4 gap-4">
            <FR label="Dmax (mm)" value={dmaxMm || null}/>
            <FR label="Ip" value={ip || null}/>
            <FR label="Ic" value={ic || null}/>
            <FR label="ES" value={es || null}/>
          </div>
        </Card>
        <Card title="Passants (%)">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg border-b border-border">
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis (mm)</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">Passant (%)</th>
                </tr>
              </thead>
              <tbody>
                {passants.map((row, index) => (
                  <tr key={row.d} className="border-b border-border">
                    <td className="px-2 py-1.5 text-[12px] font-mono">{row.d}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{row.passant === '' ? '—' : row.passant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Synthèse GTR">
        <div className="grid grid-cols-5 gap-3">
          <FG label="Wn (%)">
            <input type="number" step="0.01" value={wnPercent} onChange={e => updateMetric(setWnPercent, 'wn_percent', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Dmax (mm)">
            <input type="number" step="0.01" value={dmaxMm} onChange={e => updateMetric(setDmaxMm, 'dmax_mm', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="VBS">
            <input type="number" step="0.01" value={vbs} onChange={e => updateMetric(setVbs, 'vbs', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="ES">
            <input type="number" step="0.01" value={es} onChange={e => updateMetric(setEs, 'es', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="IPI (%)">
            <input type="number" step="0.01" value={ipi} onChange={e => updateMetric(setIpi, 'ipi', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
        </div>
        <div className="grid grid-cols-4 gap-3 mt-3">
          <FG label="Ip">
            <input type="number" step="0.01" value={ip} onChange={e => updateMetric(setIp, 'ip', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Ic">
            <input type="number" step="0.01" value={ic} onChange={e => updateMetric(setIc, 'ic', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Classe GTR">
            <input value={gtrClass} onChange={e => updateMetric(setGtrClass, 'gtr_class', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="État GTR">
            <input value={gtrState} onChange={e => updateMetric(setGtrState, 'gtr_state', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
        </div>
      </Card>

      <Card title="Passants (%)">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis (mm)</th>
                <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">Passant (%)</th>
              </tr>
            </thead>
            <tbody>
              {passants.map((row, index) => (
                <tr key={row.d} className="border-b border-border">
                  <td className="px-2 py-1.5 text-[12px] font-mono">{row.d}</td>
                  <td className="px-1 py-1.5">
                    <input type="number" step="0.01" value={row.passant} onChange={e => setPassant(index, e.target.value)}
                      className="w-[110px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent text-right" tabIndex={0}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}


function MasseVolumiqueEnrobes({ res, onChange, readOnly }) {
  const [fields, setFields] = useState(() => ({
    water_temperature_c: res.water_temperature_c ?? '',
    paraffin_density_kg_m3: res.paraffin_density_kg_m3 ?? '',
    water_density_kg_m3: res.water_density_kg_m3 ?? '',
    mvr_kg_m3: res.mvr_kg_m3 ?? '',
    masse_seche_g: res.masse_seche_g ?? '',
    masse_seche_paraffinee_g: res.masse_seche_paraffinee_g ?? '',
    masse_dans_eau_g: res.masse_dans_eau_g ?? '',
    masse_volumique_eprouvette_kg_m3: res.masse_volumique_eprouvette_kg_m3 ?? '',
    compacite_percent: res.compacite_percent ?? '',
    vides_percent: res.vides_percent ?? '',
    hauteur_eprouvette_cm: res.hauteur_eprouvette_cm ?? '',
    nature_produit: res.nature_produit ?? '',
    couche: res.couche ?? '',
    provenance: res.provenance ?? '',
  }))

  const density = num(fields.masse_volumique_eprouvette_kg_m3)
  const mvr = num(fields.mvr_kg_m3)
  const derivedCompacity = num(fields.compacite_percent) ?? (density !== null && mvr !== null && mvr > 0 ? rnd(density / mvr * 100, 1) : null)
  const derivedVoids = num(fields.vides_percent) ?? (derivedCompacity !== null ? rnd(100 - derivedCompacity, 1) : null)

  function emit(nextFields) {
    const nextDensity = num(nextFields.masse_volumique_eprouvette_kg_m3)
    const nextMvr = num(nextFields.mvr_kg_m3)
    const nextCompacity = num(nextFields.compacite_percent) ?? (nextDensity !== null && nextMvr !== null && nextMvr > 0 ? rnd(nextDensity / nextMvr * 100, 1) : null)
    const nextVoids = num(nextFields.vides_percent) ?? (nextCompacity !== null ? rnd(100 - nextCompacity, 1) : null)
    onChange(JSON.stringify({
      water_temperature_c: num(nextFields.water_temperature_c),
      paraffin_density_kg_m3: num(nextFields.paraffin_density_kg_m3),
      water_density_kg_m3: num(nextFields.water_density_kg_m3),
      mvr_kg_m3: nextMvr,
      masse_seche_g: num(nextFields.masse_seche_g),
      masse_seche_paraffinee_g: num(nextFields.masse_seche_paraffinee_g),
      masse_dans_eau_g: num(nextFields.masse_dans_eau_g),
      masse_volumique_eprouvette_kg_m3: nextDensity,
      compacite_percent: nextCompacity,
      vides_percent: nextVoids,
      hauteur_eprouvette_cm: num(nextFields.hauteur_eprouvette_cm),
      nature_produit: String(nextFields.nature_produit || ''),
      couche: String(nextFields.couche || ''),
      provenance: String(nextFields.provenance || ''),
    }))
  }

  function updateField(key, value) {
    const next = { ...fields, [key]: value }
    setFields(next)
    emit(next)
  }

  const numericFields = [
    ['water_temperature_c', 'Température eau (°C)', '0.01'],
    ['paraffin_density_kg_m3', 'Densité paraffine (kg/m³)', '0.01'],
    ['water_density_kg_m3', 'Densité eau (kg/m³)', '0.01'],
    ['mvr_kg_m3', 'MVR (kg/m³)', '0.01'],
    ['masse_seche_g', 'Masse sèche (g)', '0.01'],
    ['masse_seche_paraffinee_g', 'Masse sèche paraffinée (g)', '0.01'],
    ['masse_dans_eau_g', 'Masse dans eau (g)', '0.01'],
    ['masse_volumique_eprouvette_kg_m3', 'Masse volumique éprouvette (kg/m³)', '0.01'],
    ['compacite_percent', 'Compacité (%)', '0.01'],
    ['vides_percent', 'Vides (%)', '0.01'],
    ['hauteur_eprouvette_cm', 'Hauteur éprouvette (cm)', '0.01'],
  ]

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 flex-wrap">
          {density !== null && <div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#185fa5] leading-none">{density}</div>
            <div className="text-[11px] text-[#185fa5] mt-1 font-medium">ρ éprouvette (kg/m³)</div>
          </div>}
          {derivedCompacity !== null && <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#3b6d11] leading-none">{derivedCompacity} %</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">Compacité</div>
          </div>}
          {derivedVoids !== null && <div className="px-5 py-3 bg-[#f5efe5] border border-[#d5c2a4] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#7a5c2e] leading-none">{derivedVoids} %</div>
            <div className="text-[11px] text-[#7a5c2e] mt-1 font-medium">Vides</div>
          </div>}
        </div>
        <Card title="Contexte enrobés">
          <div className="grid grid-cols-3 gap-4">
            <FR label="Nature produit" value={fields.nature_produit || null}/>
            <FR label="Couche" value={fields.couche || null}/>
            <FR label="Provenance" value={fields.provenance || null}/>
          </div>
        </Card>
        <Card title="Mesures">
          <div className="grid grid-cols-3 gap-4">
            {numericFields.map(([key, label]) => (
              <FR key={key} label={label} value={fields[key] || null}/>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte enrobés">
        <div className="grid grid-cols-3 gap-3">
          <FG label="Nature produit">
            <input value={fields.nature_produit} onChange={e => updateField('nature_produit', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Couche">
            <input value={fields.couche} onChange={e => updateField('couche', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Provenance">
            <input value={fields.provenance} onChange={e => updateField('provenance', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
        </div>
      </Card>
      <Card title="Mesures MVA">
        <div className="grid grid-cols-3 gap-3">
          {numericFields.map(([key, label, step]) => (
            <FG key={key} label={label}>
              <input type="number" step={step} value={fields[key]} onChange={e => updateField(key, e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
          ))}
        </div>
        {(derivedCompacity !== null || derivedVoids !== null) && (
          <p className="text-[11px] text-text-muted italic mt-3">
            Compacité et vides sont recalculés automatiquement à partir de la masse volumique éprouvette et du MVR si besoin.
          </p>
        )}
      </Card>
    </div>
  )
}

function formatCompactNumber(value, digits = 2) {
  const parsed = num(value)
  if (parsed === null) return null
  return parsed.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function extractLiantMetrics(payload) {
  const moyenne = payload?.moyenne && typeof payload.moyenne === 'object' ? payload.moyenne : {}
  return {
    hour: String(payload?.hour || ''),
    binder: num(payload?.teneur_liant_percent ?? moyenne.teneur_liant_percent),
    binderExt: num(payload?.teneur_liant_ext_percent ?? moyenne.teneur_liant_ext_percent),
    richness: num(payload?.module_richesse ?? moyenne.module_richesse),
    richnessExt: num(payload?.module_richesse_ext ?? moyenne.module_richesse_ext),
    surface: num(payload?.surface_specifique ?? moyenne.surface_specifique),
  }
}

function extractGranuloPassants(payload) {
  if (payload?.passants_percent && typeof payload.passants_percent === 'object') {
    return payload.passants_percent
  }
  if (payload?.granulometrie_passants_percent && typeof payload.granulometrie_passants_percent === 'object') {
    return payload.granulometrie_passants_percent
  }
  if (Array.isArray(payload?.tamis)) {
    const ms = num(payload?.ms)
    const calcs = calcGR(payload.tamis, ms !== null && ms > 0 ? ms : 100)
    return calcs.reduce((acc, row) => {
      if (row.passant !== null) acc[String(row.d)] = row.passant
      return acc
    }, {})
  }
  return {}
}

function hasMeaningfulNumber(value) {
  const parsed = num(value)
  return parsed !== null && Math.abs(parsed) > 1e-9
}

function hasCfeGranuloRow(row) {
  const passants = extractGranuloPassants(row)
  return Object.values(passants).some(value => num(value) !== null)
}

function hasCfeLiantRow(row) {
  return ['teneur_liant_percent', 'teneur_liant_ext_percent', 'module_richesse', 'module_richesse_ext']
    .some(key => hasMeaningfulNumber(row?.[key]))
}

function getCfeValidRows(payload) {
  const rows = Array.isArray(payload?.rows) ? payload.rows : []
  return rows.filter(row => row && typeof row === 'object' && (hasCfeGranuloRow(row) || hasCfeLiantRow(row)))
}

function pickPassantValue(passants, targets) {
  for (const target of targets) {
    for (const [diameter, passant] of Object.entries(passants || {})) {
      const diameterNum = num(diameter)
      const passantNum = num(passant)
      if (diameterNum === null || passantNum === null) continue
      if (Math.abs(diameterNum - target) < 1e-9) return passantNum
    }
  }
  return null
}

function averageDefinedNumbers(values, digits = null) {
  const cleaned = values.map(value => num(value)).filter(value => value !== null)
  if (!cleaned.length) return null
  const average = cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length
  return digits == null ? average : rnd(average, digits)
}

function averagePassantMaps(passantMaps) {
  const buckets = new Map()
  for (const passants of passantMaps) {
    for (const [diameter, passant] of Object.entries(passants || {})) {
      const diameterNum = num(diameter)
      const passantNum = num(passant)
      if (diameterNum === null || passantNum === null) continue
      const key = String(diameterNum)
      const values = buckets.get(key) || []
      values.push(passantNum)
      buckets.set(key, values)
    }
  }

  return Array.from(buckets.entries()).reduce((acc, [diameter, values]) => {
    const averaged = averageDefinedNumbers(values, 3)
    if (averaged !== null) acc[diameter] = averaged
    return acc
  }, {})
}

function summarizeGranuloPassants(passants) {
  const rows = toSortedPassantRows(passants)
  const p63 = rows.find(row => row.diameterNum !== null && Math.abs(row.diameterNum - 0.063) < 1e-9)?.passant ?? null
  const p80 = rows.find(row => row.diameterNum !== null && Math.abs(row.diameterNum - 0.08) < 1e-9)?.passant ?? null
  const dmax = [...rows].reverse().find(row => row.passant !== null && row.passant < 100)?.diameterNum ?? null
  return { rows, p63, p80, dmax }
}

function buildCfeGranuloDraftResultats(row, index, total) {
  const base = {
    historical_mode: 'passants_only',
    source_essai_code: 'CFE',
    modele: 'Enrobés',
    m1: '',
    m2: '',
    m3: '',
    mh: 100,
    w: 0,
    ms: 100,
    replicate_index: index,
    replicate_label: `Essai ${index}`,
    replicate_total: total,
  }
  const passants = extractGranuloPassants(row)
  const sortable = Object.entries(passants)
    .map(([diameter, passant]) => ({ diameter: num(diameter), label: String(diameter), passant: num(passant) }))
    .filter(entry => entry.diameter !== null && entry.passant !== null)
    .sort((left, right) => right.diameter - left.diameter)

  if (!sortable.length) return { ...base, tamis: [] }

  let previousPassant = 100
  const tamis = []
  let dmax = null
  for (const entry of sortable) {
    const refus = Math.max(0, previousPassant - entry.passant)
    tamis.push({ d: rnd(entry.diameter, 6), r: rnd(refus, 6) })
    previousPassant = entry.passant
    if (dmax === null && entry.passant < 100) dmax = rnd(entry.diameter, 6)
  }
  tamis.sort((left, right) => left.d - right.d)

  return {
    ...base,
    tamis,
    passants_percent: sortable.reduce((acc, entry) => {
      acc[entry.label] = rnd(entry.passant, 3)
      return acc
    }, {}),
    passant_80: pickPassantValue(passants, [0.08, 0.063]),
    passant_20: pickPassantValue(passants, [20]),
    dmax,
    source_row_no: String(row?.essai_no || ''),
  }
}

function buildCfeLiantDraftResultats(row, moyenne, theoretical, thresholds, index, total) {
  return {
    historical_mode: 'result_only',
    source_essai_code: 'CFE',
    hour: String(row?.hour || ''),
    teneur_liant_percent: num(row?.teneur_liant_percent) ?? num(moyenne?.teneur_liant_percent),
    teneur_liant_ext_percent: num(row?.teneur_liant_ext_percent) ?? num(moyenne?.teneur_liant_ext_percent),
    module_richesse: num(row?.module_richesse) ?? num(moyenne?.module_richesse),
    module_richesse_ext: num(row?.module_richesse_ext) ?? num(moyenne?.module_richesse_ext),
    surface_specifique: num(row?.surface_specifique) ?? num(moyenne?.surface_specifique),
    moyenne,
    theorique: theoretical,
    thresholds,
    replicate_index: index,
    replicate_label: `Essai ${index}`,
    replicate_total: total,
    source_row_no: String(row?.essai_no || ''),
  }
}

function getReplicateIndexFromPayload(payload) {
  const direct = num(payload?.replicate_index)
  if (direct !== null) return Math.max(1, Math.round(direct))
  const sourceRowNo = num(payload?.source_row_no)
  if (sourceRowNo !== null) return Math.max(1, Math.round(sourceRowNo))
  return null
}

function getReplicateIndexFromEssai(essai) {
  const resultats = parseRes(essai?.resultats)
  const observations = parseRes(essai?.observations)
  const direct = getReplicateIndexFromPayload(resultats) ?? getReplicateIndexFromPayload(observations)
  if (direct !== null) return direct

  const tokens = [String(observations?.subcode || ''), String(observations?.signature || '')]
  for (const token of tokens) {
    const match = token.match(/(?:SUB=)?CFE-(?:GRANULO|LIANT)-(\d+)/i)
    if (match) return Number.parseInt(match[1], 10)
  }
  return null
}

function buildCfeAssaySlots(existingEssais, fallbackRows, buildDraftPayload) {
  const indexedEssais = new Map()
  const unindexedEssais = []
  const sortedEssais = [...existingEssais].sort((left, right) => {
    const leftIndex = getReplicateIndexFromEssai(left) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = getReplicateIndexFromEssai(right) ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) return leftIndex - rightIndex
    return (num(left?.uid) ?? 0) - (num(right?.uid) ?? 0)
  })

  sortedEssais.forEach(essai => {
    const replicateIndex = getReplicateIndexFromEssai(essai)
    if (replicateIndex !== null && !indexedEssais.has(replicateIndex)) {
      indexedEssais.set(replicateIndex, essai)
      return
    }
    unindexedEssais.push(essai)
  })

  const fallbackByIndex = new Map(fallbackRows.map(entry => [entry.index, entry]))
  const indexedNumbers = [
    ...indexedEssais.keys(),
    ...fallbackRows.map(entry => entry.index),
    sortedEssais.length,
  ].filter(value => Number.isInteger(value) && value > 0)
  const slotCount = Math.max(2, indexedNumbers.length ? Math.max(...indexedNumbers) : 0)

  return Array.from({ length: slotCount }, (_, offset) => {
    const index = offset + 1
    const sibling = indexedEssais.get(index) || unindexedEssais.shift() || null
    const fallback = fallbackByIndex.get(index) || null
    const initPayload = buildDraftPayload(fallback?.row || null, index, slotCount)
    const payload = sibling ? parseRes(sibling.resultats) : initPayload
    return {
      index,
      label: `Essai ${index}`,
      sibling,
      fallback,
      initPayload,
      payload,
      source: sibling ? 'sibling' : (fallback ? 'historical' : 'empty'),
    }
  })
}

function toSortedPassantRows(passants) {
  return Object.entries(passants || {})
    .map(([diameter, passant]) => ({
      diameter: String(diameter),
      diameterNum: num(diameter),
      passant: num(passant),
    }))
    .filter(row => row.diameterNum !== null && row.passant !== null)
    .sort((left, right) => left.diameterNum - right.diameterNum)
}

function buildDraftEssaiUrl(echantillonId, essaiCode, typeEssai, norme = '', initResultats = '{}') {
  const params = new URLSearchParams({
    echantillon_id: String(echantillonId || ''),
    essai_code: essaiCode,
    type_essai: typeEssai,
    norme,
    init_resultats: initResultats,
  })
  return `/essais/new?${params.toString()}`
}


function ExtractionLiant({ res, onChange, readOnly }) {
  const metrics = extractLiantMetrics(res)
  const theoretical = res?.theorique && typeof res.theorique === 'object' ? res.theorique : {}
  const thresholds = res?.thresholds && typeof res.thresholds === 'object' ? res.thresholds : {}
  const replicateLabel = String(res?.replicate_label || '').trim()
  const sectionTitle = replicateLabel ? `Extraction de liant — ${replicateLabel}` : 'Extraction de liant'

  function updateTextField(key, value) {
    onChange(JSON.stringify({ ...res, [key]: value }))
  }

  function updateNumberField(key, value) {
    onChange(JSON.stringify({ ...res, [key]: value === '' ? null : num(value) }))
  }

  const referenceItems = [
    ['Liant théorique (%)', formatCompactNumber(theoretical.teneur_liant_percent)],
    ['Liant extrait théorique (%)', formatCompactNumber(theoretical.teneur_liant_ext_percent)],
    ['Mr théorique', formatCompactNumber(theoretical.module_richesse)],
    ['Mr extrait théorique', formatCompactNumber(theoretical.module_richesse_ext)],
    ['Surface spécifique théorique', formatCompactNumber(theoretical.surface_specifique)],
    ['Liant min (%)', formatCompactNumber(thresholds.teneur_liant_min_percent)],
    ['Liant max (%)', formatCompactNumber(thresholds.teneur_liant_max_percent)],
    ['Règle Mr', thresholds.module_richesse_rule || null],
  ].filter(([, value]) => value !== null && value !== '')

  if (readOnly) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex gap-3 flex-wrap">
          {metrics.binderExt !== null && <div className="px-5 py-3 bg-[#eaf3de] border border-[#b5d88a] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#3b6d11] leading-none">{formatCompactNumber(metrics.binderExt)}</div>
            <div className="text-[11px] text-[#5a8f30] mt-1 font-medium">Liant extrait (%)</div>
          </div>}
          {metrics.binder !== null && <div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#185fa5] leading-none">{formatCompactNumber(metrics.binder)}</div>
            <div className="text-[11px] text-[#185fa5] mt-1 font-medium">Liant (%)</div>
          </div>}
          {metrics.richnessExt !== null && <div className="px-5 py-3 bg-[#f5efe5] border border-[#d5c2a4] rounded-lg text-center">
            <div className="text-[26px] font-bold text-[#7a5c2e] leading-none">{formatCompactNumber(metrics.richnessExt)}</div>
            <div className="text-[11px] text-[#7a5c2e] mt-1 font-medium">Mr extrait</div>
          </div>}
        </div>
        <Card title={sectionTitle}>
          <div className="grid grid-cols-3 gap-4">
            <FR label="Heure" value={metrics.hour || null}/>
            <FR label="Module de richesse" value={formatCompactNumber(metrics.richness)}/>
            <FR label="Surface spécifique" value={formatCompactNumber(metrics.surface)}/>
          </div>
        </Card>
        {referenceItems.length > 0 && (
          <Card title="Références historiques CFE">
            <div className="grid grid-cols-3 gap-4">
              {referenceItems.map(([label, value]) => (
                <FR key={label} label={label} value={value}/>
              ))}
            </div>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title={sectionTitle}>
        <div className="grid grid-cols-3 gap-3">
          <FG label="Heure">
            <input value={metrics.hour} onChange={e => updateTextField('hour', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Teneur en liant (%)">
            <input type="number" step="0.01" value={res.teneur_liant_percent ?? ''} onChange={e => updateNumberField('teneur_liant_percent', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Teneur en liant extraite (%)">
            <input type="number" step="0.01" value={res.teneur_liant_ext_percent ?? ''} onChange={e => updateNumberField('teneur_liant_ext_percent', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Module de richesse">
            <input type="number" step="0.01" value={res.module_richesse ?? ''} onChange={e => updateNumberField('module_richesse', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Module de richesse extrait">
            <input type="number" step="0.01" value={res.module_richesse_ext ?? ''} onChange={e => updateNumberField('module_richesse_ext', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
          <FG label="Surface spécifique">
            <input type="number" step="0.0001" value={res.surface_specifique ?? ''} onChange={e => updateNumberField('surface_specifique', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
          </FG>
        </div>
      </Card>
      {referenceItems.length > 0 && (
        <Card title="Références historiques CFE">
          <div className="grid grid-cols-3 gap-4">
            {referenceItems.map(([label, value]) => (
              <FR key={label} label={label} value={value}/>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}


function ControleFabricationEnrobes({ res, onChange, readOnly, essai }) {
  const navigate = useNavigate()
  const echantillonId = essai?.echantillon_id
  const currentUid = String(essai?.uid || '')

  const { data: siblingRaw } = useQuery({
    queryKey: ['essais-by-echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais?echantillon_id=${echantillonId}`),
    enabled: Boolean(echantillonId),
  })
  const { data: echantillon } = useQuery({
    queryKey: ['echantillon', String(echantillonId || '')],
    queryFn: () => api.get(`/essais/echantillons/${echantillonId}`),
    enabled: Boolean(echantillonId),
  })

  const siblings = Array.isArray(siblingRaw) ? siblingRaw : (siblingRaw?.items || siblingRaw?.results || [])
  const grSiblings = siblings.filter(item => {
    const code = String(item?.essai_code || item?.code_essai || '').toUpperCase()
    return code === 'GR' && String(item?.uid || '') !== currentUid
  })
  const elSiblings = siblings.filter(item => {
    const code = String(item?.essai_code || item?.code_essai || '').toUpperCase()
    const type = String(item?.type_essai || '').toLowerCase()
    return (code === 'EL' || (type.includes('liant') && type.includes('enrob'))) && String(item?.uid || '') !== currentUid
  })

  const validRows = getCfeValidRows(res)
  const firstRow = validRows[0] || (Array.isArray(res?.rows) && res.rows.length > 0 && typeof res.rows[0] === 'object' ? res.rows[0] : {})
  const moyenne = res?.moyenne && typeof res.moyenne === 'object' ? res.moyenne : {}
  const theoretical = res?.theorique && typeof res.theorique === 'object' ? res.theorique : {}
  const thresholds = res?.thresholds && typeof res.thresholds === 'object' ? res.thresholds : {}

  const granuloFallbackRows = validRows.filter(hasCfeGranuloRow).slice(0, 2).map((row, index) => ({ index: index + 1, row }))
  const liantFallbackRows = validRows.filter(hasCfeLiantRow).slice(0, 2).map((row, index) => ({ index: index + 1, row }))

  const grSlots = buildCfeAssaySlots(grSiblings, granuloFallbackRows, buildCfeGranuloDraftResultats)
  const elSlots = buildCfeAssaySlots(
    elSiblings,
    liantFallbackRows,
    (row, index, total) => buildCfeLiantDraftResultats(row, moyenne, theoretical, thresholds, index, total),
  )

  const averagedPassants = averagePassantMaps(
    grSlots
      .map(slot => extractGranuloPassants(slot.payload))
      .filter(passants => Object.keys(passants).length > 0)
  )
  const granuloSummary = summarizeGranuloPassants(
    Object.keys(averagedPassants).length > 0 ? averagedPassants : extractGranuloPassants(firstRow)
  )
  const grRows = granuloSummary.rows
  const p63 = granuloSummary.p63
  const p80 = granuloSummary.p80
  const dmax = granuloSummary.dmax

  const ownLiant = extractLiantMetrics(res)
  const fallbackLiant = extractLiantMetrics(firstRow)
  const liantSlotMetrics = elSlots.map(slot => extractLiantMetrics(slot.payload))
  const binderExt = averageDefinedNumbers(liantSlotMetrics.map(metrics => metrics.binderExt), 6) ?? ownLiant.binderExt ?? fallbackLiant.binderExt
  const binder = averageDefinedNumbers(liantSlotMetrics.map(metrics => metrics.binder), 6) ?? ownLiant.binder ?? fallbackLiant.binder
  const richnessExt = averageDefinedNumbers(liantSlotMetrics.map(metrics => metrics.richnessExt), 6) ?? ownLiant.richnessExt ?? fallbackLiant.richnessExt
  const surface = averageDefinedNumbers(liantSlotMetrics.map(metrics => metrics.surface), 6) ?? ownLiant.surface ?? fallbackLiant.surface

  const temperature = num(echantillon?.temperature_prelevement_c)
    ?? num(res?.temperature_prelevement_c)
    ?? num(moyenne.temperature_c)
    ?? averageDefinedNumbers(validRows.map(row => row?.temperature_c), 1)
    ?? num(firstRow.temperature_c)

  function updateField(key, value) {
    onChange(JSON.stringify({ ...res, [key]: value }))
  }

  const referenceRows = [
    ['Liant moyen (%)', formatCompactNumber(moyenne.teneur_liant_percent)],
    ['Liant extrait moyen (%)', formatCompactNumber(moyenne.teneur_liant_ext_percent)],
    ['Température moyenne (°C)', formatCompactNumber(moyenne.temperature_c, 1)],
    ['Mr moyen', formatCompactNumber(moyenne.module_richesse)],
    ['Mr extrait moyen', formatCompactNumber(moyenne.module_richesse_ext)],
    ['Surface spécifique moyenne', formatCompactNumber(moyenne.surface_specifique)],
    ['Liant théorique (%)', formatCompactNumber(theoretical.teneur_liant_percent)],
    ['Liant extrait théorique (%)', formatCompactNumber(theoretical.teneur_liant_ext_percent)],
    ['Liant min (%)', formatCompactNumber(thresholds.teneur_liant_min_percent)],
    ['Liant max (%)', formatCompactNumber(thresholds.teneur_liant_max_percent)],
    ['Règle Mr', thresholds.module_richesse_rule || null],
  ].filter(([, value]) => value !== null && value !== '')

  function openOrCreateSibling(slot, code, typeEssai, norme = '') {
    if (slot?.sibling?.uid) {
      navigate(`/essais/${slot.sibling.uid}`)
      return
    }
    if (!echantillonId) return
    navigate(buildDraftEssaiUrl(echantillonId, code, typeEssai, norme, JSON.stringify(slot?.initPayload || {})))
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Regroupement CFE">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-bg p-4 flex flex-col gap-3">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">Granulométrie</div>
              <div className="text-[11px] text-text-muted mt-1">Deux essais GR servent à la moyenne CFE.</div>
            </div>
            {grSlots.map(slot => {
              const slotSummary = summarizeGranuloPassants(extractGranuloPassants(slot.payload))
              return (
                <div key={`gr-slot-${slot.index}`} className="rounded-lg border border-border bg-surface p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{slot.label}</div>
                      <div className="text-[13px] font-medium text-text mt-1">
                        {slot.sibling?.reference || (slot.fallback ? 'Préremplissage historique' : 'Essai GR à créer')}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => openOrCreateSibling(slot, 'GR', 'Granulométrie', 'NF EN 12697-2')}>
                      {slot.sibling ? 'Ouvrir' : 'Créer'}
                    </Button>
                  </div>
                  {slot.source === 'historical' && (
                    <div className="text-[11px] text-text-muted">Le formulaire sera prérempli depuis la ligne historique CFE.</div>
                  )}
                  <FR label={slotSummary.p63 !== null ? 'P63µm' : 'P80µm'} value={formatCompactNumber(slotSummary.p63 !== null ? slotSummary.p63 : slotSummary.p80)} />
                  <FR label="Dmax (mm)" value={formatCompactNumber(slotSummary.dmax, 3)} />
                </div>
              )
            })}
          </div>

          <div className="rounded-lg border border-border bg-bg p-4 flex flex-col gap-3">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">Extraction de liant</div>
              <div className="text-[11px] text-text-muted mt-1">Deux essais EL servent à la moyenne CFE.</div>
            </div>
            {elSlots.map(slot => {
              const metrics = extractLiantMetrics(slot.payload)
              return (
                <div key={`el-slot-${slot.index}`} className="rounded-lg border border-border bg-surface p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{slot.label}</div>
                      <div className="text-[13px] font-medium text-text mt-1">
                        {slot.sibling?.reference || (slot.fallback ? 'Préremplissage historique' : 'Essai EL à créer')}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => openOrCreateSibling(slot, 'EL', 'Extraction de liant', 'NF EN 12697-1')}>
                      {slot.sibling ? 'Ouvrir' : 'Créer'}
                    </Button>
                  </div>
                  {slot.source === 'historical' && (
                    <div className="text-[11px] text-text-muted">Le formulaire sera prérempli depuis la ligne historique CFE.</div>
                  )}
                  <FR label="Liant extrait (%)" value={formatCompactNumber(metrics.binderExt)} />
                  <FR label="Liant (%)" value={formatCompactNumber(metrics.binder)} />
                  <FR label="Mr extrait" value={formatCompactNumber(metrics.richnessExt)} />
                </div>
              )
            })}
          </div>

          <div className="rounded-lg border border-border bg-bg p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">Synthèse moyenne</div>
                <div className="text-[13px] font-medium text-text mt-1">Température portée par l'échantillon</div>
              </div>
              {echantillonId && <Button size="sm" onClick={() => navigate(`/echantillons/${echantillonId}`)}>Ouvrir</Button>}
            </div>
            <div className="text-[30px] font-bold text-accent leading-none">{temperature !== null ? `${formatCompactNumber(temperature, 1)} °C` : '—'}</div>
            <div className="text-[11px] text-text-muted">Échantillon {echantillon?.reference || essai?.ech_ref || ''}</div>
            <FR label={p63 !== null ? 'P63µm moyen' : 'P80µm moyen'} value={formatCompactNumber(p63 !== null ? p63 : p80)} />
            <FR label="Dmax moyen (mm)" value={formatCompactNumber(dmax, 3)} />
            <FR label="Liant extrait moyen (%)" value={formatCompactNumber(binderExt)} />
            <FR label="Liant moyen (%)" value={formatCompactNumber(binder)} />
            <FR label="Mr extrait moyen" value={formatCompactNumber(richnessExt)} />
            <FR label="Surface spécifique moyenne" value={formatCompactNumber(surface)} />
          </div>
        </div>
      </Card>

      {grRows.length > 0 && (
        <Card title="Granulométrie moyenne liée">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg border-b border-border">
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-text-muted">Tamis (mm)</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-text-muted">Passant (%)</th>
                </tr>
              </thead>
              <tbody>
                {grRows.map(row => (
                  <tr key={row.diameter} className="border-b border-border">
                    <td className="px-2 py-1.5 text-[12px] font-mono">{row.diameter}</td>
                    <td className="px-3 py-1.5 text-right text-[12px]">{formatCompactNumber(row.passant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {readOnly ? (
        <Card title="Contexte CFE">
          <div className="grid grid-cols-3 gap-4">
            <FR label="Appellation française" value={res.appellation_francaise || null}/>
            <FR label="Appellation européenne" value={res.appellation_europeenne || null}/>
            <FR label="Formule" value={res.formula_code || null}/>
            <FR label="Couche" value={res.couche || null}/>
            <FR label="Destination" value={res.destination || null}/>
            <FR label="Lieu fabrication" value={res.lieu_fabrication || null}/>
          </div>
        </Card>
      ) : (
        <Card title="Contexte CFE">
          <div className="grid grid-cols-3 gap-3">
            <FG label="Appellation française">
              <input value={res.appellation_francaise || ''} onChange={e => updateField('appellation_francaise', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
            <FG label="Appellation européenne">
              <input value={res.appellation_europeenne || ''} onChange={e => updateField('appellation_europeenne', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
            <FG label="Code formule">
              <input value={res.formula_code || ''} onChange={e => updateField('formula_code', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
            <FG label="Couche">
              <input value={res.couche || ''} onChange={e => updateField('couche', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
            <FG label="Destination">
              <input value={res.destination || ''} onChange={e => updateField('destination', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
            <FG label="Lieu fabrication">
              <input value={res.lieu_fabrication || ''} onChange={e => updateField('lieu_fabrication', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded text-sm bg-bg outline-none focus:border-accent" tabIndex={0}/>
            </FG>
          </div>
        </Card>
      )}

      {referenceRows.length > 0 && (
        <Card title="Références historiques">
          <div className="grid grid-cols-3 gap-4">
            {referenceRows.map(([label, value]) => (
              <FR key={label} label={label} value={value}/>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
// REGISTRE — ajouter ici chaque nouveau type quand implémenté
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// RFU — Los Angeles (LA) et/ou Micro-Deval (MDE)  NF EN 1097-1/2
// ═══════════════════════════════════════════════════════════════════════════════
function FragmentationUsure({ res, onChange, readOnly }) {
  const [fraction,setFraction]=useState(res.fraction??'10/14')
  const [m_ini,setMIni]=useState(res.m_ini??'5000')
  const [m_fin_la,setMFinLA]=useState(res.m_fin_la??'')
  const [m_fin_mde,setMFinMDE]=useState(res.m_fin_mde??'')
  const [crit_la,setCritLA]=useState(res.crit_la??'')
  const [crit_mde,setCritMDE]=useState(res.crit_mde??'')

  function emit(){
    const mi=num(m_ini)||5000,la=num(m_fin_la),mde=num(m_fin_mde)
    const coef_la=la!==null?rnd((mi-la)/mi*100,1):null
    const coef_mde=mde!==null?rnd((mi-mde)/mi*100,1):null
    onChange(JSON.stringify({fraction,m_ini,m_fin_la,m_fin_mde,coef_la,coef_mde,crit_la,crit_mde}))
  }
  const mi=num(m_ini)||5000
  const coef_la=num(m_fin_la)!==null?rnd((mi-num(m_fin_la))/mi*100,1):null
  const coef_mde=num(m_fin_mde)!==null?rnd((mi-num(m_fin_mde))/mi*100,1):null

  if(readOnly) return (<div className="flex gap-3 flex-wrap">{coef_la!==null&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center"><div className="text-[26px] font-bold text-[#185fa5]">{coef_la}</div><div className="text-[11px] text-[#185fa5] mt-1">LA (%)</div></div>}{coef_mde!==null&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[26px] font-bold text-text">{coef_mde}</div><div className="text-[11px] text-text-muted mt-1">MDE (%)</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Identification">
        <div className="flex gap-3 flex-wrap"><FG label="Fraction granulaire"><input value={fraction} onChange={e=>{setFraction(e.target.value);emit()}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG><FG label="Masse initiale (g)"><input type="number" step="1" value={m_ini} onChange={e=>{setMIni(e.target.value);emit()}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG></div>
      </Card>
      <Card title="Los Angeles (LA)">
        <div className="flex gap-3 items-end">
          <FG label="Masse finale passant 1.6mm (g)"><input type="number" step="0.1" value={m_fin_la} onChange={e=>{setMFinLA(e.target.value);emit()}} className="w-[120px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Critère LA ≤"><input type="number" step="1" value={crit_la} onChange={e=>{setCritLA(e.target.value);emit()}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          {coef_la!==null&&<div className={`pb-1 text-[16px] font-bold ${num(crit_la)&&coef_la>num(crit_la)?'text-danger':'text-accent'}`}>LA = {coef_la} %</div>}
        </div>
      </Card>
      <Card title="Micro-Deval (MDE)">
        <div className="flex gap-3 items-end">
          <FG label="Masse finale passant 1.6mm (g)"><input type="number" step="0.1" value={m_fin_mde} onChange={e=>{setMFinMDE(e.target.value);emit()}} className="w-[120px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Critère MDE ≤"><input type="number" step="1" value={crit_mde} onChange={e=>{setCritMDE(e.target.value);emit()}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          {coef_mde!==null&&<div className={`pb-1 text-[16px] font-bold ${num(crit_mde)&&coef_mde>num(crit_mde)?'text-danger':'text-accent'}`}>MDE = {coef_mde} %</div>}
        </div>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MVR — Masse volumique réelle + absorption WA24 (NF EN 1097-6)
// ═══════════════════════════════════════════════════════════════════════════════
function MasseVolumiqueReelle({ res, onChange, readOnly }) {
  const initDet=s=>s?.length?s:[{m_seche:'',m_immer:'',m_sat_essuye:'',t:'25'},{m_seche:'',m_immer:'',m_sat_essuye:'',t:'25'}]
  const [dets,setDets]=useState(()=>initDet(res.dets))

  function calcDet(d){const ms=num(d.m_seche),mi=num(d.m_immer),mse=num(d.m_sat_essuye),t=num(d.t)||25;const rhoW=999.7/(1+0.0003*(t-25));const mvr=ms&&mi&&mse&&(mse-mi)>0?rnd(ms/(mse-mi)*rhoW/1000,3):null;const wa24=ms&&mse?rnd((mse-ms)/ms*100,2):null;return{...d,mvr,wa24}}
  function emit(d){const u=(d||dets).map(calcDet);const mvrs=u.map(r=>r.mvr).filter(v=>v!==null);const was=u.map(r=>r.wa24).filter(v=>v!==null);onChange(JSON.stringify({dets:u,mvr_moy:mvrs.length?rnd(mvrs.reduce((a,b)=>a+b,0)/mvrs.length,3):null,wa24_moy:was.length?rnd(was.reduce((a,b)=>a+b,0)/was.length,2):null}))}
  function setD(i,k,v){const u=dets.map((d,j)=>j===i?{...d,[k]:v}:d);setDets(u);emit(u)}
  const detsC=dets.map(calcDet);const mvrs=detsC.map(r=>r.mvr).filter(v=>v!==null);const was=detsC.map(r=>r.wa24).filter(v=>v!==null)
  const mvrMoy=mvrs.length?rnd(mvrs.reduce((a,b)=>a+b,0)/mvrs.length,3):null;const waMoy=was.length?rnd(was.reduce((a,b)=>a+b,0)/was.length,2):null

  if(readOnly) return (<div className="flex gap-3">{mvrMoy&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center"><div className="text-[26px] font-bold text-[#185fa5]">{mvrMoy}</div><div className="text-[11px] text-[#185fa5] mt-1">MVR (Mg/m³)</div></div>}{waMoy&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[26px] font-bold text-text">{waMoy}</div><div className="text-[11px] text-text-muted mt-1">WA24 (%)</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      {detsC.map((d,i)=>(
        <Card key={i} title={`Détermination ${i+1}`}>
          <div className="flex gap-3 flex-wrap">
            {[['m_seche','Masse sèche (g)'],['m_sat_essuye','Masse sat. essuyée (g)'],['m_immer','Masse immergée (g)'],['t','T eau (°C)']].map(([k,lbl])=>(
              <FG key={k} label={lbl}><input type="number" step="0.01" value={d[k]||''} onChange={e=>setD(i,k,e.target.value)} className="w-[110px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
            ))}
          </div>
          {d.mvr&&<div className="flex gap-4 mt-2"><span className="text-[12px] font-bold text-accent">MVR = {d.mvr} Mg/m³</span>{d.wa24&&<span className="text-[12px] text-text-muted">WA24 = {d.wa24} %</span>}</div>}
        </Card>
      ))}
      {mvrMoy&&<div className="flex gap-3"><div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center"><div className="text-[22px] font-bold text-[#185fa5]">{mvrMoy}</div><div className="text-[11px] text-[#185fa5] mt-1">MVR moy (Mg/m³)</div></div>{waMoy&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[22px] font-bold text-text">{waMoy}</div><div className="text-[11px] text-text-muted mt-1">WA24 moy (%)</div></div>}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MVv — Masse volumique en vrac (NF EN 1097-3)
// ═══════════════════════════════════════════════════════════════════════════════
function MasseVolumiqueVrac({ res, onChange, readOnly }) {
  const [v_rec,setVRec]=useState(res.v_rec??'10')
  const [dets,setDets]=useState(()=>res.dets?.length?res.dets:[{m_rec:'',m_tot:'',mode:'déversée'},{m_rec:'',m_tot:'',mode:'déversée'},{m_rec:'',m_tot:'',mode:'vibrée'}])

  function calc(d){const mr=num(d.m_rec),mt=num(d.m_tot),vr=num(v_rec)||10;return{...d,mvv:mr!==null&&mt!==null?rnd((mt-mr)/vr,3):null}}
  function emit(d,v){const u=(d||dets).map(r=>calc(r));const mvvs=u.map(r=>r.mvv).filter(x=>x!==null);onChange(JSON.stringify({dets:u,v_rec:v||v_rec,mvv_moy:mvvs.length?rnd(mvvs.reduce((a,b)=>a+b,0)/mvvs.length,3):null}))}
  function setD(i,k,v2){const u=dets.map((d,j)=>j===i?{...d,[k]:v2}:d);setDets(u);emit(u,null)}
  const detsC=dets.map(calc);const mvvs=detsC.map(d=>d.mvv).filter(v=>v!==null)
  const mvvMoy=mvvs.length?rnd(mvvs.reduce((a,b)=>a+b,0)/mvvs.length,3):null

  if(readOnly) return (<div>{mvvMoy&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#185fa5]">{mvvMoy}</div><div className="text-[11px] text-[#185fa5] mt-1">MVv moy (Mg/m³)</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Récipient">
        <FG label="Volume récipient (L)"><input type="number" step="1" value={v_rec} onChange={e=>{setVRec(e.target.value);emit(null,e.target.value)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
      </Card>
      <Card title="Déterminations">
        <table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border"><th className="px-2 py-2 text-[11px] font-medium text-text-muted">Mode</th><th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">M récip. (g)</th><th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">M totale (g)</th><th className="px-2 py-2 text-right text-[11px] font-bold text-accent">MVv (Mg/m³)</th></tr></thead>
          <tbody>{detsC.map((d,i)=><tr key={i} className="border-b border-border">
            <td className="px-1 py-1"><select value={d.mode} onChange={e=>setD(i,'mode',e.target.value)} className="px-1 py-1 border border-border rounded text-[11px] bg-bg" tabIndex={0}><option>déversée</option><option>vibrée</option></select></td>
            <td className="px-1 py-1"><input type="number" step="1" value={d.m_rec} onChange={e=>setD(i,'m_rec',e.target.value)} className="w-[90px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
            <td className="px-1 py-1"><input type="number" step="1" value={d.m_tot} onChange={e=>setD(i,'m_tot',e.target.value)} className="w-[90px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>
            <td className={`px-3 py-1 text-right text-[12px] font-bold ${d.mvv?'text-accent':'text-text-muted'}`}>{d.mvv??'—'}</td>
          </tr>)}</tbody>
        </table>
        {mvvMoy&&<p className="mt-2 font-bold text-accent">MVv moy = {mvvMoy} Mg/m³</p>}
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PMT — Profondeur de macrotexture (NF EN 13036-1)
// ═══════════════════════════════════════════════════════════════════════════════
function ProfondeurMacrotexture({ res, onChange, readOnly }) {
  const initMes=s=>s?.length?s:Array.from({length:6},()=>({pos:'',pmt:''}))
  const [mes,setMes]=useState(()=>initMes(res.mes))
  const [critere,setCritere]=useState(res.critere??'')
  const [route,setRoute]=useState(res.route??'')

  function emit(m){const u=m||mes;const vals=u.map(r=>num(r.pmt)).filter(v=>v!==null);const moy=vals.length?rnd(vals.reduce((a,b)=>a+b,0)/vals.length,2):null;onChange(JSON.stringify({mes:u,critere,route,pmt_moy:moy}))}
  function setM(i,k,v){const u=mes.map((r,j)=>j===i?{...r,[k]:v}:r);setMes(u);emit(u)}
  const vals=mes.map(r=>num(r.pmt)).filter(v=>v!==null);const pmtMoy=vals.length?rnd(vals.reduce((a,b)=>a+b,0)/vals.length,2):null

  if(readOnly) return (<div>{pmtMoy&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#185fa5]">{pmtMoy}</div><div className="text-[11px] text-[#185fa5] mt-1">PMT moyen (mm)</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte"><div className="flex gap-3"><FG label="Route / section"><input value={route} onChange={e=>{setRoute(e.target.value);emit(null)}} className="w-[160px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG><FG label="Critère PMT ≥ (mm)"><input type="number" step="0.1" value={critere} onChange={e=>{setCritere(e.target.value);emit(null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG></div></Card>
      <Card title="Mesures"><table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border"><th className="px-2 py-2 text-[11px] font-medium text-text-muted">Position</th><th className="px-2 py-2 text-right text-[11px] font-medium text-text-muted">PMT (mm)</th></tr></thead>
        <tbody>{mes.map((r,i)=><tr key={i} className="border-b border-border"><td className="px-1 py-1"><input value={r.pos} onChange={e=>setM(i,'pos',e.target.value)} placeholder={`P${i+1}`} className="w-[120px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td><td className="px-1 py-1"><input type="number" step="0.01" value={r.pmt} onChange={e=>setM(i,'pmt',e.target.value)} className="w-[80px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td></tr>)}</tbody>
      </table>{pmtMoy&&<p className="mt-2 font-bold text-accent">PMT moy = {pmtMoy} mm</p>}</Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DF — Déflexions (poutre Benkelman ou équivalent)
// ═══════════════════════════════════════════════════════════════════════════════
function Deflexions({ res, onChange, readOnly }) {
  const initMes=s=>s?.length?s:Array.from({length:8},()=>({pos:'',d0:'',d25:'',rc:'',ok:''}))
  const [mes,setMes]=useState(()=>initMes(res.mes))
  const [critere,setCritere]=useState(res.critere??'')
  const [route,setRoute]=useState(res.route??'')

  function emit(m){const u=m||mes;const d0s=u.map(r=>num(r.d0)).filter(v=>v!==null);const moy=d0s.length?rnd(d0s.reduce((a,b)=>a+b,0)/d0s.length,2):null;onChange(JSON.stringify({mes:u,critere,route,defl_moy:moy}))}
  function setM(i,k,v){const u=mes.map((r,j)=>j===i?{...r,[k]:v}:r);setMes(u);emit(u)}
  const d0s=mes.map(r=>num(r.d0)).filter(v=>v!==null);const deflMoy=d0s.length?rnd(d0s.reduce((a,b)=>a+b,0)/d0s.length,2):null

  if(readOnly) return (<div>{deflMoy&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg self-start text-center"><div className="text-[26px] font-bold text-[#185fa5]">{deflMoy}</div><div className="text-[11px] text-[#185fa5] mt-1">Déflexion moy (1/100 mm)</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Contexte"><div className="flex gap-3"><FG label="Route / section"><input value={route} onChange={e=>{setRoute(e.target.value);emit(null)}} className="w-[160px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG><FG label="Critère D0 ≤"><input type="number" step="1" value={critere} onChange={e=>{setCritere(e.target.value);emit(null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG></div></Card>
      <Card title="Mesures"><div className="overflow-x-auto"><table className="border-collapse text-sm"><thead><tr className="bg-bg border-b border-border">{['Position','D0 (1/100mm)','D25 (1/100mm)','Rc (m)','Stat.'].map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted">{h}</th>)}</tr></thead>
        <tbody>{mes.map((r,i)=><tr key={i} className="border-b border-border">
          {['pos','d0','d25','rc'].map(k=><td key={k} className="px-1 py-1"><input type={k==='pos'?'text':'number'} step="0.01" value={r[k]} onChange={e=>setM(i,k,e.target.value)} placeholder="—" className="w-[80px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>)}
          <td className="px-1 py-1"><select value={r.ok} onChange={e=>setM(i,'ok',e.target.value)} className="px-1 py-1 border border-border rounded text-[11px] bg-bg" tabIndex={0}><option value="">—</option><option>C</option><option>R</option><option>NC</option></select></td>
        </tr>)}</tbody>
      </table></div>{deflMoy&&<p className="mt-2 font-bold text-accent">Déflexion moy = {deflMoy} (1/100 mm)</p>}</Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// INF — Infiltration / Perméabilité (charge constante ou variable)
// ═══════════════════════════════════════════════════════════════════════════════
function Infiltration({ res, onChange, readOnly }) {
  const [methode,setMethode]=useState(res.methode??'charge constante')
  const [pts,setPts]=useState(()=>res.pts?.length?res.pts:Array.from({length:10},()=>({t:'',h:'',Q:''})))
  const [L,setL]=useState(res.L??'')
  const [A,setA]=useState(res.A??'')
  const [notes,setNotes]=useState(res.notes??'')

  function calcK(){
    const lv=num(L),av=num(A);if(!lv||!av) return null
    const valid=pts.filter(p=>num(p.t)!==null&&(num(p.h)!==null||num(p.Q)!==null))
    if(valid.length<2) return null
    const ks=valid.map(p=>num(p.Q)!==null?rnd(num(p.Q)*lv/(av*100),6):null).filter(v=>v!==null)
    return ks.length?rnd(ks.reduce((a,b)=>a+b,0)/ks.length,8):null
  }
  function emit(p){const u=p||pts;const k=calcK();onChange(JSON.stringify({pts:u,methode,L,A,notes,k:k?String(k):null}))}
  function setP(i,k,v){const u=pts.map((r,j)=>j===i?{...r,[k]:v}:r);setPts(u);emit(u)}
  const k=calcK()

  if(readOnly) return (<div>{k&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg self-start text-center"><div className="text-[22px] font-bold font-mono text-[#185fa5]">{k}</div><div className="text-[11px] text-[#185fa5] mt-1">k (m/s)</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Paramètres">
        <div className="flex gap-3 flex-wrap">
          <FG label="Méthode"><select value={methode} onChange={e=>{setMethode(e.target.value);emit(null)}} className="px-2 py-1.5 border border-border rounded text-[12px] bg-bg" tabIndex={0}><option>charge constante</option><option>charge variable (Matsuo)</option><option>Porchet</option><option>anneau simple</option></select></FG>
          <FG label="L — longueur/épaisseur (m)"><input type="number" step="0.01" value={L} onChange={e=>{setL(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="A — section (cm²)"><input type="number" step="0.1" value={A} onChange={e=>{setA(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <Card title="Mesures t / h ou Q">
        <div className="grid grid-cols-3 gap-2 text-[11px] font-bold text-text-muted mb-1"><span>t (s)</span><span>h/lecture (mm)</span><span>Q (cm³/s)</span></div>
        <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
          {pts.map((p,i)=>(
            <div key={i} className="grid grid-cols-3 gap-2">
              {['t','h','Q'].map(k=><input key={k} type="number" step="0.01" value={p[k]} onChange={e=>setP(i,k,e.target.value)} placeholder="—" className="px-2 py-0.5 border border-border rounded text-[11px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/>)}
            </div>
          ))}
        </div>
        {k&&<div className="mt-3 font-bold text-accent font-mono">k = {k} m/s</div>}
      </Card>
      <FG label="Notes"><TA value={notes} onChange={v=>{setNotes(v);emit(null)}}/></FG>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SO/SC — Coupe de sondage (NF P 11-300) + sondage carotté
// ═══════════════════════════════════════════════════════════════════════════════
const HACHURES = {
  'Argile':       'hatching-clay',
  'Limon':        'hatching-silt',
  'Sable':        'hatching-sand',
  'Grave/GNT':    'hatching-gravel',
  'Roche':        'hatching-rock',
  'Remblai':      'hatching-fill',
  'Tourbe':       'hatching-peat',
  'Autre':        'hatching-other',
}
const NATURE_COLORS = {'Argile':'#c8a882','Limon':'#d4c09a','Sable':'#e8d88a','Grave/GNT':'#b8b8a0','Roche':'#9898a0','Remblai':'#c0a890','Tourbe':'#8a6a4a','Autre':'#cccccc'}

function CoupeLog({ couches, prof_max }) {
  const W=120, H=Math.min(400,Math.max(200,prof_max*40)), scale=H/prof_max
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="border border-border rounded">
      {couches.map((c,i)=>{const y1=(num(c.z_haut)||0)*scale,y2=(num(c.z_bas)||0)*scale,col=NATURE_COLORS[c.nature]||'#ccc';return(
        <g key={i}>
          <rect x={10} y={y1} width={60} height={Math.max(1,y2-y1)} fill={col} stroke="#888" strokeWidth="0.5"/>
          <text x={75} y={(y1+y2)/2+4} fontSize="9" fill="#444">{c.nature||''}</text>
          <text x={5} y={y1+9} fontSize="7" fill="#888" textAnchor="end">{c.z_haut||0}</text>
        </g>
      ))}
      {prof_max>0&&<text x={5} y={H-2} fontSize="7" fill="#888" textAnchor="end">{prof_max}m</text>}
    </svg>
  )
}

function CoupeSondage({ res, onChange, readOnly, essai }) {
  const isSC=String(essai?.essai_code||essai?.code_essai||'').toUpperCase()==='SC'
  const initCouches=s=>s?.length?s:[{z_haut:'0',z_bas:'',nature:'',couleur:'',consistance:'',humidite:'',description:'',eau:false,echantillon:''}]
  const [couches,setCouches]=useState(()=>initCouches(res.couches))
  const [type_sondage,setTypeSondage]=useState(res.type_sondage??'')
  const [profondeur_finale,setProfFin]=useState(res.profondeur_finale??'')
  const [diametre,setDiametre]=useState(res.diametre??'')
  const [notes,setNotes]=useState(res.notes??'')

  function emit(c){const u=c||couches;const nb=u.filter(r=>r.z_haut!==''||r.description).length;onChange(JSON.stringify({couches:u,type_sondage,profondeur_finale,diametre,notes,nb_couches:nb}))}
  function setC(i,k,v){const u=couches.map((r,j)=>j===i?{...r,[k]:v}:r);setCouches(u);emit(u)}
  function addCouche(){const last=couches.at(-1);const u=[...couches,{z_haut:last?.z_bas||'',z_bas:'',nature:'',couleur:'',consistance:'',humidite:'',description:'',eau:false,echantillon:''}];setCouches(u);emit(u)}
  const profMax=num(profondeur_finale)||Math.max(2,...couches.map(c=>num(c.z_bas)||0))
  const nbCouches=couches.filter(c=>c.z_bas||c.description).length

  if(readOnly) return (
    <div className="flex gap-4">
      <CoupeLog couches={couches} prof_max={profMax}/>
      <div className="flex-1 overflow-x-auto">
        <table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border">{['Z haut','Z bas','Nature','Description','Eau','Éch.'].map(h=><th key={h} className="px-2 py-1.5 text-[11px] font-medium text-text-muted">{h}</th>)}</tr></thead>
          <tbody>{couches.filter(c=>c.z_bas||c.description).map((c,i)=><tr key={i} className="border-b border-border"><td className="px-2 py-1 text-[12px]">{c.z_haut}</td><td className="px-2 py-1 text-[12px]">{c.z_bas}</td><td className="px-2 py-1 text-[12px] font-medium">{c.nature}</td><td className="px-2 py-1 text-[12px] max-w-[200px]">{c.description}</td><td className="px-2 py-1 text-center text-[12px]">{c.eau?'💧':''}</td><td className="px-2 py-1 text-[12px] font-mono text-text-muted">{c.echantillon}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
  return (
    <div className="flex flex-col gap-4">
      <Card title="Identification sondage">
        <div className="flex gap-3 flex-wrap">
          <FG label="Type sondage"><input value={type_sondage} onChange={e=>{setTypeSondage(e.target.value);emit(null)}} placeholder="tarière, carotté, tube..." className="w-[160px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Profondeur finale (m)"><input type="number" step="0.1" value={profondeur_finale} onChange={e=>{setProfFin(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          {isSC&&<FG label="Diamètre couronne (mm)"><input type="number" step="1" value={diametre} onChange={e=>{setDiametre(e.target.value);emit(null)}} className="w-[100px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>}
        </div>
      </Card>
      <div className="flex gap-4 items-start">
        <CoupeLog couches={couches} prof_max={profMax}/>
        <div className="flex-1 overflow-x-auto">
          <table className="border-collapse text-sm"><thead><tr className="bg-bg border-b border-border">{['Z haut (m)','Z bas (m)','Nature','Couleur','Consist.','Humidité','Description','Eau','Éch.','×'].map(h=><th key={h} className="px-1 py-2 text-[10px] font-medium text-text-muted whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{couches.map((c,i)=>(
              <tr key={i} className="border-b border-border">
                {['z_haut','z_bas'].map(k=><td key={k} className="px-1 py-1"><input type="number" step="0.1" value={c[k]} onChange={e=>setC(i,k,e.target.value)} className="w-[56px] px-1 py-0.5 border border-border rounded text-[11px] bg-bg outline-none text-right focus:border-accent" tabIndex={0}/></td>)}
                <td className="px-1 py-1"><select value={c.nature} onChange={e=>setC(i,'nature',e.target.value)} className="px-1 py-0.5 border border-border rounded text-[11px] bg-bg" tabIndex={0}><option value="">—</option>{Object.keys(NATURE_COLORS).map(n=><option key={n}>{n}</option>)}</select></td>
                {['couleur','consistance','humidite'].map(k=><td key={k} className="px-1 py-1"><input value={c[k]} onChange={e=>setC(i,k,e.target.value)} className="w-[62px] px-1 py-0.5 border border-border rounded text-[11px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>)}
                <td className="px-1 py-1"><input value={c.description} onChange={e=>setC(i,'description',e.target.value)} className="w-[160px] px-1 py-0.5 border border-border rounded text-[11px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>
                <td className="px-1 py-1 text-center"><input type="checkbox" checked={!!c.eau} onChange={e=>setC(i,'eau',e.target.checked)} className="accent-accent" tabIndex={0}/></td>
                <td className="px-1 py-1"><input value={c.echantillon} onChange={e=>setC(i,'echantillon',e.target.value)} className="w-[56px] px-1 py-0.5 border border-border rounded text-[11px] bg-bg outline-none font-mono focus:border-accent" tabIndex={0}/></td>
                <td className="px-1 py-1"><button onClick={()=>{const u=couches.filter((_,j)=>j!==i);setCouches(u);emit(u)}} className="text-[10px] text-danger hover:opacity-70" tabIndex={0}>×</button></td>
              </tr>
            ))}</tbody>
          </table>
          <button onClick={addCouche} className="mt-2 text-[12px] text-text-muted hover:text-text border border-dashed border-border rounded px-3 py-1" tabIndex={0}>+ Ajouter couche</button>
        </div>
      </div>
      <FG label="Notes / observations"><TA value={notes} onChange={v=>{setNotes(v);emit(null)}}/></FG>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DV — Densité apparente / porosité / indice de vide
// ═══════════════════════════════════════════════════════════════════════════════
function DensiteVrac({ res, onChange, readOnly }) {
  const [m_seche,setMS]=useState(res.m_seche??'')
  const [v_tot,setVT]=useState(res.v_tot??'')
  const [m_grain,setMG]=useState(res.m_grain??'')
  const [gs,setGs]=useState(res.gs??'2.70')

  function emit(){const ms=num(m_seche),vt=num(v_tot),mg=num(m_grain),gsv=num(gs)||2.70;const mva=ms&&vt?rnd(ms/vt,3):null;const n=ms&&vt&&mg?rnd((1-ms/(vt*gsv))*100,1):null;const e=n!==null?rnd(n/(100-n),3):null;onChange(JSON.stringify({m_seche,v_tot,m_grain,gs,mv_vrac:mva,porosite:n,indice_vide:e}))}
  const ms=num(m_seche),vt=num(v_tot),gsv=num(gs)||2.70
  const mva=ms&&vt?rnd(ms/vt,3):null,n=ms&&vt?rnd((1-ms/(vt*gsv))*100,1):null,e=n!==null?rnd(n/(100-n),3):null

  if(readOnly) return (<div className="flex gap-3">{mva&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center"><div className="text-[24px] font-bold text-[#185fa5]">{mva}</div><div className="text-[11px] text-[#185fa5] mt-1">MVA (Mg/m³)</div></div>}{n&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[24px] font-bold text-text">{n}%</div><div className="text-[11px] text-text-muted mt-1">Porosité</div></div>}{e&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[24px] font-bold text-text">{e}</div><div className="text-[11px] text-text-muted mt-1">Indice de vide</div></div>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Données">
        <div className="flex gap-3 flex-wrap">
          <FG label="Masse sèche (g)"><input type="number" step="0.1" value={m_seche} onChange={e=>{setMS(e.target.value);emit()}} className="w-[110px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Volume total (cm³)"><input type="number" step="0.1" value={v_tot} onChange={e=>{setVT(e.target.value);emit()}} className="w-[110px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Gs (Mg/m³)"><input type="number" step="0.01" value={gs} onChange={e=>{setGs(e.target.value);emit()}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      {(mva||n||e)&&<div className="flex gap-3">{mva&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg text-center"><div className="text-[22px] font-bold text-[#185fa5]">{mva}</div><div className="text-[11px] text-[#185fa5] mt-1">MVA (Mg/m³)</div></div>}{n&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[22px] font-bold text-text">{n}%</div><div className="text-[11px] text-text-muted mt-1">Porosité</div></div>}{e&&<div className="px-5 py-3 bg-surface border border-border rounded-lg text-center"><div className="text-[22px] font-bold text-text">{e}</div><div className="text-[11px] text-text-muted mt-1">Indice de vide</div></div>}</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEN — Essai générique (formulaire libre)
// ═══════════════════════════════════════════════════════════════════════════════
function EssaiGenerique({ res, onChange, readOnly }) {
  const initRows=s=>s?.length?s:Array.from({length:6},()=>({cle:'',valeur:'',unite:''}))
  const [rows,setRows]=useState(()=>initRows(res.rows))
  const [norme,setNorme]=useState(res.norme??'')
  const [titre,setTitre]=useState(res.titre??'')
  const [resultat,setResultat]=useState(res.valeur_retenue??'')
  const [unite_res,setUniteRes]=useState(res.unite_res??'')
  const [notes,setNotes]=useState(res.notes??'')

  function emit(r){const u=r||rows;onChange(JSON.stringify({titre,norme,rows:u,valeur_retenue:resultat,unite_res,notes}))}
  function setR(i,k,v){const u=rows.map((r,j)=>j===i?{...r,[k]:v}:r);setRows(u);emit(u)}

  if(readOnly) return (<div className="flex flex-col gap-4">{resultat&&<div className="px-5 py-3 bg-[#e6f1fb] border border-[#90bfe8] rounded-lg self-start text-center"><div className="text-[24px] font-bold text-[#185fa5]">{resultat} {unite_res}</div><div className="text-[11px] text-[#185fa5] mt-1">{titre||'Résultat retenu'}</div></div>}<table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border">{['Paramètre','Valeur','Unité'].map(h=><th key={h} className="px-3 py-2 text-[11px] font-medium text-text-muted text-left">{h}</th>)}</tr></thead><tbody>{rows.filter(r=>r.cle||r.valeur).map((r,i)=><tr key={i} className="border-b border-border"><td className="px-3 py-1.5 text-[12px] font-medium">{r.cle}</td><td className="px-3 py-1.5 text-[12px]">{r.valeur}</td><td className="px-3 py-1.5 text-[12px] text-text-muted">{r.unite}</td></tr>)}</tbody></table>{notes&&<p className="text-[12px] text-text-muted italic">{notes}</p>}</div>)
  return (
    <div className="flex flex-col gap-4">
      <Card title="Identification">
        <div className="flex gap-3 flex-wrap">
          <FG label="Intitulé essai"><input value={titre} onChange={e=>{setTitre(e.target.value);emit(null)}} className="w-[200px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Norme / procédure"><input value={norme} onChange={e=>{setNorme(e.target.value);emit(null)}} className="w-[160px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <Card title="Valeurs">
        <table className="border-collapse text-sm w-full"><thead><tr className="bg-bg border-b border-border">{['Paramètre','Valeur','Unité'].map(h=><th key={h} className="px-2 py-2 text-[11px] font-medium text-text-muted text-left">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i} className="border-b border-border">
              {['cle','valeur','unite'].map(k=><td key={k} className="px-1 py-1"><input value={r[k]} onChange={e=>setR(i,k,e.target.value)} placeholder="—" className="w-[140px] px-2 py-1 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></td>)}
            </tr>
          ))}</tbody>
        </table>
        <button onClick={()=>{const u=[...rows,{cle:'',valeur:'',unite:''}];setRows(u);emit(u)}} className="mt-2 text-[11px] text-text-muted hover:text-text border border-dashed border-border rounded px-3 py-1" tabIndex={0}>+ Ajouter ligne</button>
      </Card>
      <Card title="Résultat retenu">
        <div className="flex gap-3">
          <FG label="Valeur"><input value={resultat} onChange={e=>{setResultat(e.target.value);emit(null)}} className="w-[120px] px-2 py-1.5 border border-accent rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
          <FG label="Unité"><input value={unite_res} onChange={e=>{setUniteRes(e.target.value);emit(null)}} className="w-[80px] px-2 py-1.5 border border-border rounded text-[12px] bg-bg outline-none focus:border-accent" tabIndex={0}/></FG>
        </div>
      </Card>
      <FG label="Notes / commentaires"><TA value={notes} onChange={v=>{setNotes(v);emit(null)}}/></FG>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════════
// ESSAI_FORMS — mapping code essai → composant React
// Référentiel : RaLab v2 — section 46 — matrice de rattachement métier
//
// Famille 1 — Terrain direct (point terrain)
// Famille 2 — Terrain ouvrage/tronçon
// Famille 3 — Labo sur échantillon
// Famille 4 — Production / lot
// Famille 5 — Fiches synthèse
// ═══════════════════════════════════════════════════════════════════════════════
const ESSAI_FORMS = {

  // ── Famille 3 — Sols / Identification ──────────────────────────────────────
  'WE':        TeneurEnEau,           // Teneur en eau pondérale
  'GR':        Granulometrie,         // Granulométrie
  'GRANULO':   Granulometrie,         // alias générique granulométrie
  'GR-CHAUSS': Granulometrie,         // Gravillons pour chaussées
  'GR3':       Granulometrie,         // Gravillons pour chaussées type 3
  'SG':        Granulometrie,         // Sable et grave pour chaussées
  'SG3':       Granulometrie,         // Sable et grave pour chaussées type 3
  'VBS':       BleuMethylene,         // Valeur au bleu / bleu de méthylène sols
  'BM':        BleuMethylene,         // alias BM
  'MB':        BleuMethylene,         // Masse de bleu granulats
  'MBF':       BleuMethylene,         // Masse de bleu des fines
  'VB':        BleuMethylene,         // Valeur au bleu (code classique)
  'ES':        EquivalentSable,
  'LCC':    LimitesAtterbergCoupelle,
  'LPC':    LimitesAtterbergCoupelle,
  'LCP':    LimitesAtterberg,
  'ID':     IdentificationGTR,
  'SULF':      EssaiGenerique,        // Teneur en sulfate soluble

  // ── Famille 3 — Sols / Compactage / Portance ───────────────────────────────
  'PN':        Proctor,               // Proctor Normal
  'PM':        Proctor,               // Proctor Modifié (alias)
  'PR':        Proctor,               // Proctor ressuage
  'IPI':       IPIForm,              // Indice Portant Immédiat
  'IM':        IPICBRForm,            // Indice CBR après immersion
  'CBRI':      IPICBRForm,            // CBR immédiat
  'CBR':       IPICBRForm,            // CBR après immersion
  'PO-CBR':    IPICBRForm,            // Poinçonnement IPI/CBR (code complet)

  // ── Famille 3 — Sols / Traitement ──────────────────────────────────────────
  'ET':        EtudeTraitement,
  'REA':    ReactiviteChaux,
  'STS':    SuiviTraitementSols,

  // ── Famille 3 — Granulats ──────────────────────────────────────────────────
  'RFU':  FragmentationUsure,
  'LA':     FragmentationUsure,
  'MDE':    FragmentationUsure,
  'MVR':    MasseVolumiqueReelle,
  'WA24':   MasseVolumiqueReelle,
  'MVv':    MasseVolumiqueVrac,
  'IV':     DensiteVrac,
  'DV-VRAC': DensiteVrac,
  'DV-VIDE': DensiteVrac,
  'DV':     DensiteVrac,
  'AB':        EssaiGenerique,        // Abrasivité et broyabilité
  'CFS':       EssaiGenerique,        // Friabilité des sables
  'DG':        EssaiGenerique,        // Dégradabilité
  'FR':        EssaiGenerique,        // Fragmentabilité

  // ── Famille 3 — Enrobés labo ───────────────────────────────────────────────
  'MVA': MasseVolumiqueEnrobes,
  'MV-ENR': MasseVolumiqueEnrobes,
  'MV-GRA': MasseVolumiqueReelle,
  'EL':     ExtractionLiant,
  'CFE':    ControleFabricationEnrobes,

  // ── Famille 4 — Production / lot ───────────────────────────────────────────
  'TEL':       EssaiGenerique,        // Taux d'épandage liant
  'TEG':       EssaiGenerique,        // Taux d'épandage granulats
  'IFE':       EssaiGenerique,        // Identification filler d'apport
  'PEN':       EssaiGenerique,        // Pénétrabilité liant
  'TBA':       EssaiGenerique,        // Température bille-anneau

  // ── Famille 1 — Terrain direct (point terrain) ─────────────────────────────
  'DS':     GammaDensite,
  'DE':   GammaDensite,
  'QS':     ControleCompactage,
  'PL':     PortancesPlaque,
  'PL2':    PortancesPlaque,
  'PLW2':   PortancesPlaque,
  'PLD':    PortancesPlaque,
  'PDL':    PortancesPlaque,
  'PDL1':   PortancesPlaque,
  'PDL2':   PortancesPlaque,
  'PMT':    ProfondeurMacrotexture,
  'DF':     Deflexions,
  'R3M':    RegleTroisMetres,

  // ── Famille 1 — Pénétromètre / PANDA ──────────────────────────────────────
  'PA':     Penetrometre,

  // ── Famille 2 — Terrain ouvrage / tronçon ─────────────────────────────────
  'EA':     EtancheiteReseau,
  'EA-EAU': EtancheiteReseau,
  'EA-AIR': EtancheiteReseau,
  'ECA':       EssaiGenerique,        // Essai de conduite d'alimentation
  'PER':    Infiltration,
  'PER-PO': Infiltration,
  'PO-PER': Infiltration,
  'INF':    Infiltration,
  'INF-FOR': Infiltration,
  'INF-MAT': Infiltration,

  // ── Famille 2 — Géotechnique / sondages ───────────────────────────────────
  'SO':     CoupeSondage,
  'SC':     CoupeSondage,

  // ── Fallback universel ─────────────────────────────────────────────────────
  'GEN':       EssaiGenerique,        // Essai générique (formulaire libre)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function EssaiPage() {
  const { uid } = useParams()
  const navigate = useNavigate()
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
        navigate(`/essais/${saved.uid}`, { replace: true })
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
      <Button onClick={() => navigate(-1)} tabIndex={0}>← Retour</Button>
    </div>
  )

  if (isNew && !linkedEchantillonId) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Échantillon manquant</p>
      <Button onClick={() => navigate(-1)} tabIndex={0}>← Retour</Button>
    </div>
  )

  if (isNew && isLinkedEchantillonLoading) {
    return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  }

  if (isNew && (isLinkedEchantillonError || !linkedEchantillon)) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Échantillon introuvable</p>
      <Button onClick={() => navigate(-1)} tabIndex={0}>← Retour</Button>
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
        <button onClick={() => navigate(-1)}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors" tabIndex={0}>
          ← Retour
        </button>
        <span className="text-[13px] text-text-muted">
          {(currentEssai.demande_ref || currentEssai.demande_reference) && `${currentEssai.demande_ref || currentEssai.demande_reference} › `}
          {(currentEssai.ech_ref || currentEssai.intervention_ref) && `${currentEssai.ech_ref || currentEssai.intervention_ref} › `}
        </span>
        <span className="text-[14px] font-semibold flex-1">{currentEssai.type_essai || (isNew ? 'Nouvel essai' : `Essai #${uid}`)}</span>
        <Badge s={displayStatus} />
        {editing ? (
          <>
            <Button onClick={() => {
              if (isNew) { navigate(-1) }
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
              <FG label={currentEssai.ech_ref || currentEssai.echantillon_reference ? 'Échantillon lié' : 'Intervention liée'}>
                <Input value={currentEssai.ech_ref || currentEssai.echantillon_reference || currentEssai.intervention_ref || currentEssai.intervention_reference || ''} readOnly className="text-text-muted" tabIndex={-1} />
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
                    </span>
                  )}
                  {!(currentEssai.ech_ref || currentEssai.echantillon_reference) && (currentEssai.intervention_ref || currentEssai.intervention_reference) && (
                    <span className="text-[12px] text-text-muted">
                      Intervention : <span className="font-medium text-text font-mono">{currentEssai.intervention_ref || currentEssai.intervention_reference}</span>
                      {currentEssai.intervention_subject ? ` — ${currentEssai.intervention_subject}` : ''}
                    </span>
                  )}
                  {currentEssai.type_essai && (
                    <span className="text-[12px] text-text-muted">
                      {currentEssai.type_essai}{currentEssai.norme ? ` — ${currentEssai.norme}` : ''}
                    </span>
                  )}
                  {currentEssai.source_label && <span className="text-[12px] text-text-muted">Source : {currentEssai.source_label}</span>}
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
          <ImportedInterventionEssai essai={currentEssai} res={res} />
        )}

      </div>
    </div>
  )
}
