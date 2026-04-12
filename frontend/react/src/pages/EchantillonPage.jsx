/**
 * EchantillonPage.jsx — Fiche échantillon laboratoire
 * Route: /echantillons/:uid
 *       /echantillons/new?demande_id=123
 *       /echantillons/new?demande_id=123&prelevement_id=456
 *       /echantillons/new?demande_id=123&intervention_reelle_id=789
 *
 * Fonctions:
 *  - Créer un échantillon lié à une demande
 *  - Voir / modifier le groupe d'essais
 *  - Lister les essais associés et naviguer vers chacun
 *  - Renvoyer vers le prélèvement lié pour la réception labo
 *  - Créer un nouvel essai → navigate vers EssaiPage (/essais/:uid)
 */
import { useEffect, useState } from 'react'
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
      <span className={`text-[13px] font-medium ${!value ? 'text-text-muted italic font-normal' : ''}`}>{value || '—'}</span>
    </div>
  )
}
const STAT_CLS = {
  'Reçu':      'bg-[#e6f1fb] text-[#185fa5]',
  'En attente':'bg-[#faeeda] text-[#854f0b]',
  'En cours':  'bg-[#faeeda] text-[#854f0b]',
  'Terminé':   'bg-[#eaf3de] text-[#3b6d11]',
  'Rejeté':    'bg-[#fcebeb] text-[#a32d2d]',
}
const ESSAI_STAT_CLS = {
  'Programmé': 'bg-[#e6f1fb] text-[#185fa5]',
  'En cours':  'bg-[#faeeda] text-[#854f0b]',
  'Terminé':   'bg-[#eaf3de] text-[#3b6d11]',
  'Annulé':    'bg-[#f1efe8] text-[#5f5e5a]',
}
function Badge({ s, map }) {
  return s ? (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${(map||{})[s]||'bg-[#f1efe8] text-[#5f5e5a]'}`}>{s}</span>
  ) : null
}

function getEssaiDisplayStatus(e) {
  return e?.date_fin ? 'Terminé' : (e?.statut || '')
}

function getEssaiTone(status) {
  if (status === 'Terminé') {
    return {
      row: 'border-[#cfe0ba] bg-[#f6fbf2] hover:border-[#9fbe78] hover:bg-[#eef6e8]',
      label: 'text-[#3b6d11] bg-[#eef6e8] border border-[#c6dca8] px-2 py-0.5 rounded-full',
      result: 'text-[#3b6d11]',
    }
  }

  return {
    row: 'border-border hover:border-accent hover:bg-bg',
    label: 'text-accent',
    result: 'text-accent',
  }
}

// Types d'essais disponibles dans EssaiPage
// ÉVOLUTION: ajouter ici quand un nouveau type est implémenté dans EssaiPage
const TYPES_ESSAI = [
  { code: 'WE',  label: 'Teneur en eau naturelle',       norme: 'Détermination de la Teneur en Eau (NF P 94 049 et NF P 94 050)' },
  { code: 'GR',  label: 'Granulométrie',                norme: 'NF P 94-056' },
  { code: 'EL',  label: 'Extraction de liant',          norme: 'NF EN 12697-1' },
  { code: 'CFE', label: 'Contrôle de fabrication enrobés', norme: '' },
  { code: 'LCP', label: "Limites d'Atterberg",        norme: 'NF P 94-051' },
  { code: 'VBS', label: 'Prise d\'essai au bleu (sols)',    norme: 'NF P 94-068', init_resultats: '{"type_materiau":"sols"}' },
  { code: 'MB',  label: 'Valeur au bleu 0/2mm',           norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mb_0_2"}' },
  { code: 'MBF', label: 'MValeur au bleu 0/0.125mm',      norme: 'NF EN 933-9', init_resultats: '{"type_materiau":"mbf_0_0125"}' },
  { code: 'ES',  label: 'Équivalent de sable',          norme: 'NF P 94-055' },
  { code: 'PN',  label: 'Proctor Normal',              norme: 'NF P 94-093' },
  { code: 'IPI',  label: 'IPI — Indice Portant Immédiat',   norme: 'NF P 94-078' },
  { code: 'CBRI', label: 'CBRi — CBR immédiat',               norme: 'NF P 94-090-1' },
  { code: 'CBR',  label: 'CBR — après immersion 4 jours',     norme: 'NF P 94-090-1' },
  { code: 'ID',   label: 'Identification GTR',                norme: 'NF P 11-300' },
  { code: 'MVA',  label: 'Masse volumique des enrobés',       norme: 'NF EN 12697-6' },
  { code: 'LCC',  label: "Limites d'Atterberg — Coupelle",    norme: 'NF P 94-051' },
  { code: 'LPC',  label: "Limites d'Atterberg — Cône",        norme: 'NF P 94-051' },
  { code: 'ET',   label: 'Étude de traitement (CaO / liant)', norme: 'GTS 2000' },
  { code: 'REA',  label: 'Réactivité de la chaux',            norme: 'EN 459-2' },
  { code: 'STS',  label: 'Suivi de traitement des sols',      norme: 'GTS 2000' },
  { code: 'IM',   label: 'Gonflement après immersion',        norme: 'NF P 94-078' },
  { code: 'DS',   label: 'Densité sols — Gammadensimètre',    norme: 'NF P 98-241-1' },
  { code: 'DE',   label: 'Densité enrobés — Gammadensimètre', norme: 'NF P 98-241-3' },
  { code: 'QS',   label: 'Contrôle du compactage (GTR)',      norme: 'GTR 2000' },
  { code: 'PL',   label: 'Portances EV1/EV2',                 norme: 'NF P 94-117-1' },
  { code: 'PLD',  label: 'Dynaplaque EVd',                    norme: 'NF P 98-167' },
  { code: 'PDL',  label: 'Plaque dynamique légère EVd',       norme: 'XP P 94-063' },
  { code: 'PA',   label: 'Pénétromètre / PANDA',              norme: 'NF P 94-063' },
  { code: 'PMT',  label: 'Profondeur de macrotexture',        norme: 'NF EN 13036-1' },
  { code: 'DF',   label: 'Déflexions',                        norme: 'NF P 98-200' },
  { code: 'R3M',  label: 'Règle de 3 m',                      norme: 'NF EN 13036-7' },
  { code: 'RFU',  label: 'Los Angeles + Micro-Deval',         norme: 'NF EN 1097-1/2' },
  { code: 'MVR',  label: 'Masse volumique réelle + WA24',     norme: 'NF EN 1097-6' },
  { code: 'MVv',  label: 'Masse volumique en vrac',           norme: 'NF EN 1097-3' },
  { code: 'DV',   label: 'Densité vrac / porosité',           norme: 'NF EN 1097-3' },
  { code: 'EA',   label: 'Étanchéité réseau (eau / air)',     norme: '' },
  { code: 'INF',  label: 'Infiltration / Perméabilité',       norme: '' },
  { code: 'PER',  label: 'Percolation Porchet',               norme: '' },
  { code: 'SO',   label: 'Coupe de sondage',                  norme: 'NF P 11-300' },
  { code: 'SC',   label: 'Coupe de sondage carotté',          norme: 'NF P 11-300' },
  { code: 'GEN',  label: 'Essai générique',                   norme: '' },
]

function parseResults(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw

  let value = raw
  for (let i = 0; i < 3; i++) {
    if (typeof value !== 'string') break
    const s = value.trim()
    if (!s) return {}
    try {
      value = JSON.parse(s)
    } catch {
      break
    }
  }
  return typeof value === 'object' && value !== null ? value : {}
}

function parseResultNumber(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isNaN(v) ? null : v
  const s = String(v).trim().replace(',', '.')
  const direct = Number(s)
  if (!Number.isNaN(direct)) return direct
  const m = s.match(/-?\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isNaN(n) ? null : n
}

function parseEchantillonObservations(raw) {
  if (!raw) return { notes: '', temperature_prelevement_c: '', meta: {} }

  let payload = null
  if (typeof raw === 'object' && raw !== null) {
    payload = raw
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('{')) return { notes: raw, temperature_prelevement_c: '', meta: {} }
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') payload = parsed
    } catch {
      return { notes: raw, temperature_prelevement_c: '', meta: {} }
    }
  }

  if (!payload) return { notes: '', temperature_prelevement_c: '', meta: {} }

  const notes = [payload.notes, payload.notes_terrain, payload.observations_text, payload.text]
    .find(value => typeof value === 'string' && value.trim()) || ''
  const temperature = parseResultNumber(
    payload.temperature_prelevement_c ?? payload.temperature_enrobes_c ?? payload.temperature_c
  )

  const meta = { ...payload }
  delete meta.notes
  delete meta.notes_terrain
  delete meta.observations_text
  delete meta.text
  delete meta.temperature_prelevement_c
  delete meta.temperature_enrobes_c
  delete meta.temperature_c

  return {
    notes,
    temperature_prelevement_c: temperature != null ? String(temperature) : '',
    meta,
  }
}

function getEchantillonTemperature(echantillon) {
  const apiValue = parseResultNumber(echantillon?.temperature_prelevement_c)
  if (apiValue != null) return apiValue
  return parseResultNumber(parseEchantillonObservations(echantillon?.observations).temperature_prelevement_c)
}

function getDisplayedEchantillonObservations(echantillon) {
  if (echantillon?.observations_text) return echantillon.observations_text
  return parseEchantillonObservations(echantillon?.observations).notes || ''
}

function buildFormFromEchantillon(echantillon) {
  return {
    demande_id: echantillon?.demande_id || '',
    designation: echantillon?.designation || '',
    profondeur_haut: echantillon?.profondeur_haut ?? '',
    profondeur_bas: echantillon?.profondeur_bas ?? '',
    date_prelevement: echantillon?.date_prelevement || '',
    localisation: echantillon?.localisation || '',
    statut: echantillon?.statut || 'Reçu',
  }
}

function extractIsoDate(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function hasLegacyReceptionContext(echantillon) {
  if (!echantillon || echantillon?.prelevement_id) return false
  return Boolean(
    echantillon?.date_reception_labo
    || getEchantillonTemperature(echantillon) != null
    || getDisplayedEchantillonObservations(echantillon)
  )
}

function computeBlueDeterminationValue(det, material, root, coeffFromGR = null) {
  const stored = parseResultNumber(material === 'granulats' ? det?.vbs : (det?.vbs ?? det?.vb))
  if (stored != null && stored > 0) return stored

  const v = parseResultNumber(det?.v_bleu)
  if (v == null) return stored

  if (material === 'granulats') {
    const m = parseResultNumber(det?.m_echantillon)
    const c = parseResultNumber(det?.c_bleu)
    if (m != null && m > 0 && c != null) return (v * c) / m
    return stored
  }

  const mh = parseResultNumber(det?.m_humide)
  const w = parseResultNumber(root?.w)
  const m0FromW = (mh != null && w != null && (100 + w) > 0) ? (100 * mh) / (100 + w) : null
  const m0 = parseResultNumber(det?.m_seche) ?? m0FromW
  const c = parseResultNumber(root?.coeff_vbs) ?? parseResultNumber(coeffFromGR) ?? 1
  if (m0 != null && m0 > 0) return (c * v) / m0
  return stored
}

function meanFromDeterminations(r, material, coeffFromGR = null) {
  const dets = Array.isArray(r?.determinations) ? r.determinations : []
  const vals = dets
    .filter(d => d?.actif !== false)
    .map(d => computeBlueDeterminationValue(d, material, r, coeffFromGR))
    .filter(v => v !== null)
  if (!vals.length) return null
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return mean
}

function getCoeffFromSiblingGR(currentEssai, allEssais) {
  const list = Array.isArray(allEssais) ? allEssais : []
  const currentUid = String(currentEssai?.uid || '')
  const gr = list.find(x => String(x?.uid || '') !== currentUid && String(x?.essai_code || x?.code_essai || '').toUpperCase() === 'GR')
  if (!gr) return null
  const rr = parseResults(gr.resultats)
  return parseResultNumber(rr?.coeff_vbs)
}

function formatFixed2(n) {
  return Number(n).toFixed(2)
}

function averageDefinedResults(values) {
  const cleaned = values.map(value => parseResultNumber(value)).filter(value => value !== null)
  if (!cleaned.length) return null
  return cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length
}

function extractLiantMetricsSummary(raw) {
  const r = parseResults(raw)
  const moyenne = r?.moyenne && typeof r.moyenne === 'object' ? r.moyenne : {}
  return {
    binder: parseResultNumber(r?.teneur_liant_percent ?? moyenne.teneur_liant_percent),
    binderExt: parseResultNumber(r?.teneur_liant_ext_percent ?? moyenne.teneur_liant_ext_percent),
  }
}

function getCfeAverageLiantFromSiblingEssais(currentEssai, allEssais) {
  const siblings = (Array.isArray(allEssais) ? allEssais : []).filter(item => {
    if (String(item?.uid || '') === String(currentEssai?.uid || '')) return false
    const code = String(item?.essai_code || item?.code_essai || '').toUpperCase()
    const type = String(item?.type_essai || '').toLowerCase()
    return code === 'EL' || (type.includes('liant') && type.includes('enrob'))
  })
  if (!siblings.length) return { binder: null, binderExt: null }

  const metrics = siblings.map(item => extractLiantMetricsSummary(item.resultats))
  return {
    binder: averageDefinedResults(metrics.map(metric => metric.binder)),
    binderExt: averageDefinedResults(metrics.map(metric => metric.binderExt)),
  }
}

function formatEssaiDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!raw) return null

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toLocaleDateString('fr-FR')
}

function getEssaiDateLabel(e) {
  return formatEssaiDate(e?.date_debut || e?.date_fin || e?.created_at)
}

function computeMBValue(r, codeUpper) {
  const material = String(r?.type_materiau || '').toLowerCase()
  const isMBF = codeUpper === 'MBF' || material === 'mbf_0_0125'
  let value = parseResultNumber(isMBF ? r?.mbf : r?.mb)

  if (value == null) {
    const ms = parseResultNumber(r?.ms)
    const v1 = parseResultNumber(r?.v1)
    const useKaolinite = Boolean(r?.use_kaolinite)
    const vPrime = useKaolinite ? (parseResultNumber(r?.v_prime) ?? 0) : 0
    if (ms != null && ms > 0 && v1 != null) {
      value = ((v1 - vPrime) * 10) / ms
    }
  }

  if (value == null) return null
  return {
    label: isMBF ? 'MBF' : 'MB',
    value,
  }
}

function getAssayLabel(e) {
  const code = e.essai_code || e.code_essai || ''
  const type = TYPES_ESSAI.find(t => t.code === code || t.label === e.type_essai)
  const rawLabel = type?.label || e.type_essai || ''
  const replicateLabel = String(parseResults(e?.resultats)?.replicate_label || '').trim()

  if (['MB','MBF'].includes(code)) {
    const r = parseResults(e.resultats)
    if (r.type_materiau === 'mb_0_2')     return 'MB — Valeur au bleu 0/2mm'
    if (r.type_materiau === 'mbf_0_0125') return 'MBF — Valeur au bleu 0/0.125mm'
    return code === 'MB' ? 'MB — Valeur au bleu 0/2mm' : 'MBF — Valeur au bleu 0/0.125mm'
  }
  if (code === 'WE' || e.type_essai?.includes('Teneur en eau') || e.type_essai?.includes('eau naturelle')) {
    const r = parseResults(e.resultats)
    const usageLabels = {
      'wn':           'Wn — Teneur en eau naturelle',
      'vbs':          'VBS — Prise d\'essai au bleu (< 5mm)',
      'coupure_20':   'Coupure 0/20mm',
      'coupure_5':    'Coupure 0/5mm',
      'coupure_0250': 'MB — Fraction 0/0.250mm',
      'coupure_0125': 'MBF — Fraction 0/0.125mm',
      'proctor':      'Proctor — teneur en eau',
      'traitement':   'Traitement — teneur en eau',
      'wl':           'wL — Limite de liquidité',
      'wp':           'wP — Limite de plasticité',
    }
    if (r.usage && usageLabels[r.usage]) return usageLabels[r.usage]
  }

  if (code && replicateLabel) return `${code} — ${rawLabel || code} (${replicateLabel})`
  if (code) return `${code} — ${rawLabel || code}`
  if (replicateLabel && rawLabel) return `${rawLabel} (${replicateLabel})`
  return rawLabel || '—'
}

// Résultat principal de chaque type d'essai — affiché dans la liste
// ÉVOLUTION: ajouter ici quand un nouveau type est implémenté
function getResultat(e, allEssais = [], echantillon = null) {
  try {
    if (e?.resultat_label) return String(e.resultat_label)
    const r = parseResults(e.resultats)
    const code = e.essai_code || e.code_essai || ''
    const codeUpper = String(code).toUpperCase()
    const type = e.type_essai || ''
    const label = e.essai_label || ''
    const normType = `${type} ${label}`.toLowerCase()
    const mbResult = computeMBValue(r, codeUpper)
    const isBlue = ['VBS', 'BM', 'VB'].includes(codeUpper)
      || normType.includes('bleu')
      || normType.includes('vbs')
      || normType.includes('prise d\'essai au bleu')
    if (code === 'WE' || type === 'Teneur en eau' || type === 'Teneur en eau naturelle')
      return r.w_moyen != null ? `w = ${r.w_moyen} %` : null
    if (code === 'GR' || type === 'Granulométrie')
      return r.passant_80 != null ? `P80µm = ${r.passant_80} %` : null
    if (mbResult)
      return `${mbResult.label} = ${formatFixed2(mbResult.value)} g/kg`
    if (isBlue) {
      const coeffFromGR = getCoeffFromSiblingGR(e, allEssais)
      const material = r.type_materiau
        || (normType.includes('granulat') ? 'granulats' : null)
        || (normType.includes('sol') ? 'sols' : null)
        || (codeUpper === 'BM' ? 'granulats' : codeUpper === 'VBS' ? 'sols' : null)
      const vbsMean = parseResultNumber(r.vbs_moyen)
      const vbMean = parseResultNumber(r.vb_moyen)
      const directValue = parseResultNumber(r.vbs ?? r.vb ?? r.valeur ?? r.value ?? r.resultat)
      const detMean = meanFromDeterminations(r, material, coeffFromGR)

      if (material === 'granulats') {
        const value = vbsMean != null ? vbsMean : detMean
        return value != null ? `VBS = ${formatFixed2(value)} g/kg` : null
      }

      if (material === 'sols') {
        const preferred = (vbsMean != null && vbsMean > 0) ? vbsMean
          : (vbMean != null && vbMean > 0) ? vbMean
          : (detMean != null && detMean > 0) ? detMean
          : (vbsMean != null) ? vbsMean
          : (vbMean != null) ? vbMean
          : detMean
        if (preferred != null) return `VBS = ${formatFixed2(preferred)} g/100g`
      }

      const fallback = (vbsMean != null) ? vbsMean : (vbMean != null) ? vbMean : (directValue != null) ? directValue : detMean
      if (fallback != null) {
        const unit = codeUpper === 'BM' ? 'g/kg' : 'g/100g'
        return `VBS = ${formatFixed2(fallback)} ${unit}`
      }

      return null
    }
    if (code === 'PN' || type === 'Proctor Normal' || type === 'Proctor Modifié') {
      if (r.rho_d_OPN_corr != null)
        return `ρdOPN = ${r.rho_d_OPN_corr} Mg/m³ (corr. — wOPN=${r.wOPN_corr??'?'}%)`
      if (r.rho_d_OPN != null)
        return `ρdOPN = ${r.rho_d_OPN} Mg/m³${r.wOPN!=null?` (wOPN=${r.wOPN}%)`:''}` 
      return null
    }
    if (code === 'IPI' || type === 'IPI — Indice Portant Immédiat') {
      if (r.ipi != null) return `IPI = ${r.ipi} %`
      return null
    }
    if (['CBRI','CBR','IM'].includes(codeUpper) || type?.startsWith('CBR')) {
      const lbl = r.mode || codeUpper
      if (r.cbr_95 != null) return `${lbl} = ${r.cbr_95} % (95% OPN)`
      return null
    }
    if (codeUpper === 'LCP' || normType.includes('atterberg')) {
      const wl = parseResultNumber(r.wl)
      const wp = parseResultNumber(r.wp)
      const ip = parseResultNumber(r.ip) ?? (wl != null && wp != null ? wl - wp : null)
      if (ip != null) return `Ip = ${formatFixed2(ip)} %`
      if (wl != null) return `wL = ${formatFixed2(wl)} %`
      if (wp != null) return `wP = ${formatFixed2(wp)} %`
      return null
    }
    if (codeUpper === 'ID' || normType.includes('identification')) {
      const gtrClass = String(r.gtr_class || '').trim()
      const gtrState = String(r.gtr_state || '').trim()
      if (gtrClass) return `GTR = ${gtrClass}${gtrState ? ` (${gtrState})` : ''}`
      const ipiValue = parseResultNumber(r.ipi)
      if (ipiValue != null) return `IPI = ${formatFixed2(ipiValue)} %`
      const vbsValue = parseResultNumber(r.vbs)
      if (vbsValue != null) return `VBS = ${formatFixed2(vbsValue)} g/100g`
      return null
    }
    if (codeUpper === 'MVA' || normType.includes('masse volumique')) {
      const density = parseResultNumber(r.masse_volumique_eprouvette_kg_m3)
      const compacity = parseResultNumber(r.compacite_percent)
      const voids = parseResultNumber(r.vides_percent)
      if (density != null) return `ρ = ${density.toFixed(1)} kg/m³`
      if (compacity != null) return `Compacité = ${formatFixed2(compacity)} %`
      if (voids != null) return `Vides = ${formatFixed2(voids)} %`
      return null
    }
    if (codeUpper === 'EL' || (normType.includes('liant') && normType.includes('enrob'))) {
      const moyenne = r.moyenne && typeof r.moyenne === 'object' ? r.moyenne : {}
      const binderExt = parseResultNumber(r.teneur_liant_ext_percent ?? moyenne.teneur_liant_ext_percent)
      const binder = parseResultNumber(r.teneur_liant_percent ?? moyenne.teneur_liant_percent)
      const richnessExt = parseResultNumber(r.module_richesse_ext ?? moyenne.module_richesse_ext)
      const richness = parseResultNumber(r.module_richesse ?? moyenne.module_richesse)
      if (binderExt != null) return `Liant ext = ${formatFixed2(binderExt)} %`
      if (binder != null) return `Liant = ${formatFixed2(binder)} %`
      if (richnessExt != null) return `Mr ext = ${formatFixed2(richnessExt)}`
      if (richness != null) return `Mr = ${formatFixed2(richness)}`
      return null
    }
    if (codeUpper === 'CFE' || (normType.includes('fabrication') && normType.includes('enrob'))) {
      const moyenne = r.moyenne && typeof r.moyenne === 'object' ? r.moyenne : {}
      let binderExt = parseResultNumber(moyenne.teneur_liant_ext_percent ?? r.teneur_liant_ext_percent)
      let binder = parseResultNumber(moyenne.teneur_liant_percent ?? r.teneur_liant_percent)
      const siblingAverages = getCfeAverageLiantFromSiblingEssais(e, allEssais)
      if (siblingAverages.binderExt != null) binderExt = siblingAverages.binderExt
      if (siblingAverages.binder != null) binder = siblingAverages.binder

      let temperature = parseResultNumber(r.temperature_prelevement_c ?? moyenne.temperature_c)
      if (temperature == null) temperature = getEchantillonTemperature(echantillon)

      const binderValue = binderExt != null ? binderExt : binder
      const binderLabel = binderExt != null ? 'Liant ext' : 'Liant'
      if (binderValue != null && temperature != null) return `T = ${temperature} °C · ${binderLabel} = ${formatFixed2(binderValue)} %`
      if (binderValue != null) return `${binderLabel} = ${formatFixed2(binderValue)} %`
      if (temperature != null) return `T = ${temperature} °C`

      const formulaCode = String(r.formula_code || '').trim()
      return formulaCode || null
    }
    if (['LCC','LPC'].includes(codeUpper)) {
      const ip = parseResultNumber(r.ip)
      const wl = parseResultNumber(r.wl)
      if (ip != null) return `IP = ${formatFixed2(ip)} %`
      if (wl != null) return `WL = ${formatFixed2(wl)} %`
      return null
    }
    if (codeUpper === 'ET') {
      const ipi = parseResultNumber(r.ipi_max)
      if (ipi != null) return `IPI max = ${ipi}% (${r.dosage_optimal ?? '?'}% ${r.produit ?? ''})`
      return null
    }
    if (codeUpper === 'REA') {
      const t = parseResultNumber(r.t_max)
      return t != null ? `T max = ${t} °C` : null
    }
    if (codeUpper === 'STS') {
      const c = parseResultNumber(r.compacite_moy)
      return c != null ? `Comp. moy = ${formatFixed2(c)} %` : null
    }
    if (['DS','DE'].includes(codeUpper)) {
      const c = parseResultNumber(r.compacite_moy)
      return c != null ? `Comp. moy = ${formatFixed2(c)} %` : null
    }
    if (codeUpper === 'QS') {
      const pts = Array.isArray(r.rows) ? r.rows : []
      const nb = pts.filter(p => p.pos).length
      const c = pts.filter(p => p.ok === 'C').length
      const nc = pts.filter(p => p.ok === 'NC').length
      return nb > 0 ? `${nb} pts — C:${c} NC:${nc}` : null
    }
    if (['PL','PL2','PLW2'].includes(codeUpper)) {
      const ev2 = parseResultNumber(r.ev2_moy)
      return ev2 != null ? `EV2 moy = ${ev2} MPa` : null
    }
    if (['PLD','PDL','PDL1','PDL2'].includes(codeUpper)) {
      const evd = parseResultNumber(r.evd_moy)
      return evd != null ? `EVd moy = ${evd} MPa` : null
    }
    if (codeUpper === 'PA') {
      const qd = parseResultNumber(r.qd_moy)
      return qd != null ? `qd moy = ${qd} MPa` : null
    }
    if (codeUpper === 'PMT') {
      const pmt = parseResultNumber(r.pmt_moy)
      return pmt != null ? `PMT = ${pmt} mm` : null
    }
    if (codeUpper === 'DF') {
      const d = parseResultNumber(r.defl_moy)
      return d != null ? `D0 moy = ${d} (1/100mm)` : null
    }
    if (codeUpper === 'R3M') {
      const e2 = parseResultNumber(r.ecart_moy)
      return e2 != null ? `Écart moy = ${e2} mm` : null
    }
    if (codeUpper === 'RFU') {
      const la = parseResultNumber(r.coef_la)
      const mde = parseResultNumber(r.coef_mde)
      return [la!=null?`LA=${la}`:null, mde!=null?`MDE=${mde}`:null].filter(Boolean).join(' / ') || null
    }
    if (['LA','MDE'].includes(codeUpper)) {
      const v = parseResultNumber(r.coef_la ?? r.coef_mde)
      return v != null ? `${codeUpper} = ${v}` : null
    }
    if (['MVR','WA24','MV-GRA'].includes(codeUpper)) {
      const mvr = parseResultNumber(r.mvr_moy)
      const wa = parseResultNumber(r.wa24_moy)
      if (mvr != null) return `MVR = ${mvr} Mg/m³${wa != null ? ` — WA24=${wa}%` : ''}`
      return null
    }
    if (['MVv','DV-VRAC','DV'].includes(codeUpper)) {
      const mv = parseResultNumber(r.mvv_moy ?? r.mv_vrac)
      return mv != null ? `MVv = ${mv} Mg/m³` : null
    }
    if (['DV-VIDE','IV'].includes(codeUpper)) {
      const e3 = parseResultNumber(r.indice_vide)
      const n = parseResultNumber(r.porosite)
      if (e3 != null) return `e = ${e3}${n != null ? ` — n=${n}%` : ''}`
      return null
    }
    if (['EA','EA-EAU','EA-AIR'].includes(codeUpper)) {
      const p = parseResultNumber(r.perte)
      const ok = r.conforme
      if (p != null) return `Perte = ${p}${ok != null ? ` — ${ok ? 'C' : 'NC'}` : ''}`
      return null
    }
    if (['INF','INF-FOR','INF-MAT','PER','PER-PO','PO-PER'].includes(codeUpper)) {
      return r.k != null ? `k = ${r.k} m/s` : null
    }
    if (['SO','SC'].includes(codeUpper)) {
      const nb = parseResultNumber(r.nb_couches)
      return nb != null ? `${nb} couches${r.profondeur_finale != null ? ` — ${r.profondeur_finale}m` : ''}` : null
    }
    if (codeUpper === 'GEN') {
      const val = r.valeur_retenue
      if (val != null) return `${r.titre ? r.titre + ' = ' : ''}${val} ${r.unite_res ?? ''}`.trim()
      return null
    }
    // AJOUTER ICI: résultat principal des autres types
  } catch {}
  return null
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
export default function EchantillonPage() {
  const { uid }          = useParams()
  const navigate         = useNavigate()
  const location         = useLocation()
  const [searchParams]   = useSearchParams()
  const qc               = useQueryClient()
  const isNew            = uid === 'new'
  const demandeIdFromUrl = searchParams.get('demande_id')
  const linkedPrelevementId = Number.parseInt(searchParams.get('prelevement_id') || '', 10)
  const hasLinkedPrelevementId = Number.isInteger(linkedPrelevementId) && linkedPrelevementId > 0
  const linkedInterventionReelleId = Number.parseInt(searchParams.get('intervention_reelle_id') || '', 10)
  const hasLinkedInterventionReelleId = Number.isInteger(linkedInterventionReelleId) && linkedInterventionReelleId > 0
  const linkedInterventionReference = searchParams.get('intervention_reference') || ''
  const linkedInterventionDate = searchParams.get('date_intervention') || ''
  const linkedInterventionZone = searchParams.get('zone') || ''
  const childReturnTo = buildLocationTarget(location)
  const createFallbackReturnTo = resolveReturnTo(
    searchParams,
    hasLinkedPrelevementId ? `/prelevements/${linkedPrelevementId}` : (demandeIdFromUrl ? `/demandes/${demandeIdFromUrl}` : '')
  )

  const [editing, setEditing] = useState(isNew)
  const [deleteMode, setDeleteMode] = useState(false)
  const [form, setForm] = useState({
    demande_id:          demandeIdFromUrl || '',
    designation:         '',
    profondeur_haut:     '',
    profondeur_bas:      '',
    date_prelevement:    '',
    localisation:        '',
    statut:              'Reçu',
  })
  const [hasLoadedForm, setHasLoadedForm] = useState(isNew)
  const [newEssaiCode, setNewEssaiCode] = useState('WE')

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // ── Données ────────────────────────────────────────────────────────────────
  const { data: ech, isLoading, isError } = useQuery({
    queryKey: ['echantillon', uid],
    queryFn:  () => api.get(`/essais/echantillons/${uid}`),
    enabled:  !isNew,
  })

  const { data: essais = [] } = useQuery({
    queryKey: ['essais-ech', uid],
    queryFn:  () => api.get(`/essais?echantillon_id=${uid}`),
    enabled:  !isNew,
  })

  const demandeId = ech?.demande_id || form.demande_id
  const { data: demande } = useQuery({
    queryKey: ['demande-light', String(demandeId)],
    queryFn:  () => api.get(`/demandes_rst/${demandeId}`),
    enabled:  !!demandeId,
  })

  const { data: linkedPrelevement } = useQuery({
    queryKey: ['prelevement', String(linkedPrelevementId)],
    queryFn: () => api.get(`/intervention-requalification/prelevements/${linkedPrelevementId}`),
    enabled: isNew && hasLinkedPrelevementId,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (data) => isNew
      ? api.post('/essais/echantillons', data)
      : api.put(`/essais/echantillons/${uid}`, data),
    onSuccess: (saved) => {
      if (isNew) navigateWithReturnTo(navigate, `/echantillons/${saved.uid}`, createFallbackReturnTo, { replace: true })
      else { qc.invalidateQueries({ queryKey: ['echantillon', uid] }); setEditing(false) }
    },
  })

  const deleteEssaiMut = useMutation({
    mutationFn: (essaiId) => api.delete(`/essais/${essaiId}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['essais-ech', uid] }),
  })

  function handleSave() {
    saveMut.mutate({
      demande_id:          parseInt(form.demande_id) || ech?.demande_id,
      prelevement_id:      hasLinkedPrelevementId ? linkedPrelevementId : (ech?.prelevement_id ?? undefined),
      intervention_reelle_id:
        (hasLinkedPrelevementId || ech?.prelevement_id)
          ? undefined
          : (hasLinkedInterventionReelleId ? linkedInterventionReelleId : (ech?.intervention_reelle_id ?? undefined)),
      designation:         form.designation,
      profondeur_haut:     form.profondeur_haut !== '' ? parseFloat(form.profondeur_haut) : null,
      profondeur_bas:      form.profondeur_bas  !== '' ? parseFloat(form.profondeur_bas)  : null,
      date_prelevement:    form.date_prelevement    || null,
      localisation:        form.localisation,
      statut:              form.statut,
    })
  }

  function handleCreateEssai() {
    const type = TYPES_ESSAI.find(t => t.code === newEssaiCode)
    // Ne pas créer dans la BD tout de suite — l'essai est créé au Enregistrer
    const params = new URLSearchParams({
      echantillon_id: uid,
      essai_code:     newEssaiCode,
      type_essai:     type?.label || newEssaiCode,
      norme:          type?.norme || '',
      init_resultats: type?.init_resultats || '{}',
    })
    navigate(`/essais/new?${params.toString()}`)
  }

  useEffect(() => {
    setHasLoadedForm(isNew)
  }, [uid, isNew])

  useEffect(() => {
    if (isNew || !ech || !editing || hasLoadedForm) return
    setForm(buildFormFromEchantillon(ech))
    setHasLoadedForm(true)
  }, [isNew, ech, editing, hasLoadedForm])

  useEffect(() => {
    if (!isNew || !linkedPrelevement) return
    setForm((current) => ({
      ...current,
      demande_id: current.demande_id || String(linkedPrelevement.demande_id || demandeIdFromUrl || ''),
      date_prelevement: current.date_prelevement || extractIsoDate(linkedPrelevement.date_prelevement),
      localisation: current.localisation || linkedPrelevement.zone || '',
    }))
  }, [isNew, linkedPrelevement, demandeIdFromUrl])

  useEffect(() => {
    if (!isNew || hasLinkedPrelevementId || !hasLinkedInterventionReelleId) return
    setForm((current) => ({
      ...current,
      date_prelevement: current.date_prelevement || extractIsoDate(linkedInterventionDate),
      localisation: current.localisation || linkedInterventionZone || '',
    }))
  }, [
    isNew,
    hasLinkedPrelevementId,
    hasLinkedInterventionReelleId,
    linkedInterventionDate,
    linkedInterventionZone,
  ])

  if (!isNew && isLoading) return <div className="text-xs text-text-muted text-center py-16">Chargement…</div>
  if (!isNew && (isError || !ech)) return (
    <div className="text-center py-16">
      <p className="text-text-muted text-sm mb-3">Échantillon introuvable</p>
      <Button onClick={() => navigateBackWithFallback(navigate, searchParams, createFallbackReturnTo)}>← Retour</Button>
    </div>
  )

  const d = isNew ? null : ech

  return (
    <div className={`flex flex-col h-full overflow-y-auto ${deleteMode ? 'bg-red-50' : ''}`}>

      {/* Topbar */}
      <div className={`flex items-center gap-3 px-6 py-3 border-b border-border shrink-0 flex-wrap ${deleteMode ? 'bg-red-100' : 'bg-surface'}`}>
        <button onClick={() => navigateBackWithFallback(navigate, searchParams, createFallbackReturnTo)}
          className="text-text-muted text-[13px] hover:text-text px-2 py-1 rounded transition-colors">
          ← Retour
        </button>
        {demande && <span className="text-[13px] text-text-muted">{demande.reference} › </span>}
        <span className="text-[14px] font-semibold flex-1 font-mono">
          {isNew ? 'Nouvel échantillon' : (d?.reference || `ECH #${uid}`)}
        </span>
        {!isNew && <Badge s={d?.statut} map={STAT_CLS} />}
        {editing && !isNew ? (
          <>
            <Button onClick={() => setEditing(false)}>Annuler</Button>
            <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? '…' : '✓ Enregistrer'}
            </Button>
          </>
        ) : isNew ? (
          <Button variant="primary" onClick={handleSave} disabled={saveMut.isPending || !form.demande_id}>
            {saveMut.isPending ? '…' : "✓ Créer l'échantillon"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant={deleteMode ? "danger" : "secondary"} onClick={() => {
              setDeleteMode(!deleteMode)
              if (editing) setEditing(false)
            }}>
              {deleteMode ? '✗ Annuler suppression' : '🗑️ Supprimer essais'}
            </Button>
            <Button size="sm" variant="primary" onClick={() => {
              setForm(buildFormFromEchantillon(d))
              setEditing(true)
              if (deleteMode) setDeleteMode(false)
            }}>✏️ Modifier</Button>
          </div>
        )}
      </div>

      <div className={`p-5 max-w-[860px] mx-auto w-full flex flex-col gap-4 ${deleteMode ? 'bg-red-50' : ''}`}>

        {deleteMode && (
          <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 text-red-800">
              <span className="text-lg">⚠️</span>
              <span className="font-semibold">Mode suppression activé</span>
            </div>
            <p className="text-red-700 text-sm mt-1">
              Cliquez sur "Supprimer" pour supprimer un essai. Cette action est irréversible.
            </p>
          </div>
        )}

        {d?.prelevement_id || (isNew && linkedPrelevement) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#cfe4f6] bg-[#eef6fd] px-4 py-3 text-sm text-[#185fa5]">
            <div>
              La réception labo et les informations d'arrivée se pilotent désormais au niveau du prélèvement lié {d?.prelevement_reference || linkedPrelevement?.reference || `#${d?.prelevement_id || linkedPrelevementId}`}. L’échantillon reste le groupe opérationnel des essais.
            </div>
            <Button size="sm" variant="secondary" onClick={() => navigateWithReturnTo(navigate, `/prelevements/${d?.prelevement_id || linkedPrelevementId}`, childReturnTo)}>
              Ouvrir le prélèvement
            </Button>
          </div>
        ) : null}

        {!d?.prelevement_id && !(isNew && linkedPrelevement) && (d?.intervention_reelle_id || (isNew && hasLinkedInterventionReelleId)) ? (
          <div className="rounded-lg border border-[#dfe6d3] bg-[#f4f7ed] px-4 py-3 text-sm text-[#4d6632]">
            Ce groupe d’essais est rattaché directement à l’intervention {d?.intervention_reelle_reference || linkedInterventionReference || `#${d?.intervention_reelle_id || linkedInterventionReelleId}`}. Il reste le point d’entrée pour créer et suivre les essais.
          </div>
        ) : null}

        {/* Infos */}
        <Card title={editing || isNew ? "Groupe d'essais" : "Échantillon / groupe d'essais"}>
          {editing || isNew ? (
            <div className="grid grid-cols-2 gap-3">
              {isNew && (
                <FG label="ID Demande *">
                  <Input type="number" value={form.demande_id}
                    onChange={e => setF('demande_id', e.target.value)}
                    placeholder="ID de la demande parente" />
                </FG>
              )}
              <FG label="Désignation">
                <Input value={form.designation} onChange={e => setF('designation', e.target.value)}
                  placeholder="ex: Argile beige, Sable gris…" />
              </FG>
              <FG label="Profondeur haut (m)">
                <Input type="number" step="0.01" value={form.profondeur_haut}
                  onChange={e => setF('profondeur_haut', e.target.value)} placeholder="ex: 1.50" />
              </FG>
              <FG label="Profondeur bas (m)">
                <Input type="number" step="0.01" value={form.profondeur_bas}
                  onChange={e => setF('profondeur_bas', e.target.value)} placeholder="ex: 2.00" />
              </FG>
              <FG label="Date prélèvement">
                <Input type="date" value={form.date_prelevement}
                  onChange={e => setF('date_prelevement', e.target.value)} />
              </FG>
              <FG label="Localisation">
                <Input value={form.localisation} onChange={e => setF('localisation', e.target.value)}
                  placeholder="ex: SP1 à 1.50m" />
              </FG>
              <FG label="Statut">
                <Select value={form.statut} onChange={e => setF('statut', e.target.value)} className="w-full">
                  {['Reçu','En attente','En cours','Terminé','Rejeté'].map(s => <option key={s}>{s}</option>)}
                </Select>
              </FG>
              {isNew && linkedPrelevement ? (
                <FG label="Prélèvement lié">
                  <Input value={linkedPrelevement.reference || `#${linkedPrelevementId}`} readOnly className="text-text-muted" />
                </FG>
              ) : null}
              {isNew && !linkedPrelevement && hasLinkedInterventionReelleId ? (
                <FG label="Intervention liée">
                  <Input value={linkedInterventionReference || `#${linkedInterventionReelleId}`} readOnly className="text-text-muted" />
                </FG>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <FR label="Référence"        value={d?.reference} />
                <FR label="Désignation"      value={d?.designation} />
                <FR label="Profondeur"       value={d?.profondeur_haut != null ? `${d.profondeur_haut} — ${d?.profondeur_bas ?? '?'} m` : null} />
                <FR label="Localisation"     value={d?.localisation} />
              </div>
              <div>
                <FR label="Demande"          value={demande?.reference} />
                <FR label="Prélèvement lié"  value={d?.prelevement_reference || (d?.prelevement_id ? `#${d.prelevement_id}` : null)} />
                <FR label="Intervention liée" value={d?.intervention_reelle_reference || (d?.intervention_reelle_id ? `#${d.intervention_reelle_id}` : null)} />
                <FR label="Date prélèvement" value={d?.date_prelevement} />
                <FR label="Statut groupe"    value={d?.statut} />
              </div>
            </div>
          )}
        </Card>

        {!editing && !isNew && hasLegacyReceptionContext(d) ? (
          <Card title="Réception héritée">
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-text-muted">
                Ces informations historiques restent visibles ici parce que cet échantillon n'est pas encore rattaché à un prélèvement. Elles ne sont plus modifiables depuis cette fiche.
              </p>
              <div className="grid grid-cols-2 gap-x-8">
                <div>
                  <FR label="Réception labo" value={d?.date_reception_labo} />
                  <FR label="Température prélèvement" value={getEchantillonTemperature(d) != null ? `${getEchantillonTemperature(d)} °C` : null} />
                </div>
                <div>
                  {getDisplayedEchantillonObservations(d) ? <FR label="Observations" value={getDisplayedEchantillonObservations(d)} /> : null}
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Essais */}
        {!isNew && (
          <Card title={`Essais (${essais.length})`}>
            <div className="flex items-center gap-3 mb-4 pb-4 border-b border-border flex-wrap">
              <Select value={newEssaiCode} onChange={e => setNewEssaiCode(e.target.value)} className="text-sm">
                {TYPES_ESSAI.map(t => (
                  <option key={t.code} value={t.code}>{t.code} — {t.label}</option>
                ))}
              </Select>
              <Button variant="primary" size="sm" onClick={handleCreateEssai}>
                + Créer cet essai
              </Button>
            </div>
            {essais.length === 0 ? (
              <p className="text-[13px] text-text-muted italic text-center py-4">Aucun essai</p>
            ) : (
              <div className="flex flex-col gap-2">
                {essais.map(e => {
                  const resultat = getResultat(e, essais, d)
                  const essaiDate = getEssaiDateLabel(e)
                  const displayStatus = getEssaiDisplayStatus(e)
                  const tone = getEssaiTone(displayStatus)
                  return (
                    <div key={e.uid} className={`flex items-center justify-between gap-3 px-4 py-3 border rounded-lg transition-colors ${
                      deleteMode 
                        ? 'border-red-300 bg-red-50 cursor-default' 
                        : `${tone.row} cursor-pointer`
                    }`}>
                      <div onClick={deleteMode ? undefined : () => {
                        navigate(`/essais/${e.uid}`)
                      }} className={deleteMode ? '' : 'flex-1'}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[12px] font-bold font-mono ${tone.label}`}>{getAssayLabel(e)}</span>
                          {essaiDate && <span className="text-[11px] font-medium text-text-muted">· {essaiDate}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {e.reference && <span className="text-[11px] text-text-muted font-mono">{e.reference}</span>}
                          {e.norme     && <span className="text-[11px] text-text-muted">{e.norme}</span>}
                          {e.operateur && <span className="text-[11px] text-text-muted">· {e.operateur}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {resultat && <span className={`text-[12px] font-bold ${tone.result}`}>{resultat}</span>}
                        <Badge s={displayStatus} map={ESSAI_STAT_CLS} />
                        {deleteMode ? (
                          <Button size="sm" variant="danger" 
                            onClick={() => {
                              if (confirm(`Supprimer l'essai "${e.type_essai}" (${e.reference || e.uid}) ?`)) {
                                deleteEssaiMut.mutate(e.uid)
                              }
                            }}
                            disabled={deleteEssaiMut.isPending}>
                            🗑️ Supprimer
                          </Button>
                        ) : (
                          <span className="text-text-muted text-[12px]">→</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {saveMut.error && (
          <p className="text-danger text-xs px-3 py-2 bg-[#fcebeb] border border-[#f0a0a0] rounded">
            {saveMut.error.message}
          </p>
        )}

      </div>
    </div>
  )
}
