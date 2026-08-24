import { num, rnd } from '@/components/essais/essaiFormUi'
import { extractPassantAt, unwrapGrResultats } from '@/lib/grEssai'
import { buildProctorCurve } from '@/lib/pnEssai'
import { computeEsResultats, unwrapEsResultats } from '@/lib/esEssai'

const HYDRIC_LABELS = {
  ts: 'très sec',
  s: 'sec',
  m: 'moyen',
  h: 'humide',
  th: 'très humide',
}

function text(value) {
  if (value == null) return ''
  return String(value).trim()
}

function pushStep(steps, message) {
  if (message) steps.push(message)
}

function aLineIp(wl) {
  const liquid = num(wl)
  if (liquid == null) return null
  return rnd(0.73 * (liquid - 20), 1)
}

export function hydricLabel(code) {
  return HYDRIC_LABELS[code] || ''
}

const GTR_ANCIENNE_LABELS = {
  A: 'sols fins',
  A1: 'sols fins peu plastiques (limons)',
  A2: 'sols fins de plasticité moyenne',
  A3: 'sols fins de plasticité élevée (argiles)',
  A4: 'sols fins très plastiques (argiles)',
  B: 'sables et graves avec fines',
  B1: 'sables et graves sableuses propres',
  B2: 'sables et graves sableuses peu argileux',
  B3: 'sables et graves argileux',
  B4: 'sables et graves très argileux',
  B5: 'sables argileux',
  B6: 'sables et graves très argileux',
  C: 'sols à éléments grossiers (Dmax > 50 mm)',
  C1: 'sols à éléments grossiers, fraction 0/50 peu argileuse',
  C2: 'sols à éléments grossiers, fraction 0/50 argileuse',
  D1: 'sables propres insensibles à l’eau',
  D2: 'graves propres insensibles à l’eau',
  D3: 'matériaux rocheux insensibles à l’eau',
}

const EN16907_NATURE_LABELS = {
  F: 'sol fin',
  Sa: 'sable',
  SaF: 'sable avec fines',
  Gr: 'grave',
  GrF: 'grave avec fines',
  Ro: 'matériau rocheux',
}

export function gtrAncienneDescription(classe, hydrique) {
  const base = GTR_ANCIENNE_LABELS[classe] || ''
  if (!base) return ''
  const hyd = hydricLabel(hydrique)
  return hyd ? `${base}, état ${hyd}` : base
}

export function gtrNouvelleDescription(nature, sensibilite, hydrique) {
  const parts = []
  const natureLabel = EN16907_NATURE_LABELS[nature] || ''
  if (natureLabel) parts.push(natureLabel)
  if (sensibilite === '0') parts.push('insensible à l’eau')
  else if (sensibilite !== '' && sensibilite != null) parts.push(`sensibilité à l’eau ${sensibilite}`)
  const hyd = hydricLabel(hydrique)
  if (hyd) parts.push(`état ${hyd}`)
  return parts.join(', ')
}

export function formatGtrCode(classe, hydrique) {
  if (!classe) return ''
  return hydrique ? `${classe}${hydrique}` : classe
}

export function buildGtrChartCalcs(raw) {
  const draft = unwrapIdResultats(raw)
  const fromGr = (Array.isArray(draft.courbe_gr) ? draft.courbe_gr : [])
    .map((row) => ({ d: num(row?.d), passant: num(row?.passant) }))
    .filter((row) => row.d != null && row.passant != null)
    .sort((a, b) => a.d - b.d)
  if (fromGr.length >= 2) return fromGr
  const pts = [
    { d: 0.08, passant: num(draft.passant_80) },
    { d: 2, passant: num(draft.passant_2) },
    { d: 20, passant: num(draft.passant_20) },
    { d: 50, passant: num(draft.passant_50) },
  ].filter((row) => row.passant != null)
  const dmax = num(draft.dmax)
  if (dmax != null && dmax > 0 && !pts.some((row) => Math.abs(row.d - dmax) < 1e-9)) {
    pts.push({ d: dmax, passant: 100 })
  }
  return pts.sort((a, b) => a.d - b.d)
}

export function emptyIdPayload() {
  return {
    wn: null,
    dmax: null,
    passant_80: null,
    passant_63: null,
    passant_2: null,
    passant_20: null,
    passant_50: null,
    courbe_gr: [],
    wl: null,
    wp: null,
    ip: null,
    vbs: null,
    es: null,
    w_opn: null,
    classification_gtr: '',
    gtr_class: '',
    sous_classe: '',
    gtr_state: '',
    gtr_ancienne: { classe: '', hydrique: '', code: '', description: '', chemin: [] },
    gtr_nouvelle: { code: '', nature: '', sensibilite: '', hydrique: '', description: '', chemin: [] },
    eurocode: { iso_14688: '', uscs: '', description: '', chemin: [] },
    description_visuelle: '',
    commentaire: '',
  }
}

export function unwrapIdResultats(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    ...emptyIdPayload(),
    ...source,
    description_visuelle: text(
      source.description_visuelle
      || source.identification_visuelle
      || source.description_echantillon,
    ),
    commentaire: text(source.commentaire),
    gtr_ancienne: { ...emptyIdPayload().gtr_ancienne, ...(source.gtr_ancienne || {}) },
    gtr_nouvelle: { ...emptyIdPayload().gtr_nouvelle, ...(source.gtr_nouvelle || {}) },
    eurocode: { ...emptyIdPayload().eurocode, ...(source.eurocode || {}) },
  }
}

function classifyAByVbsOrIp(vbs, ip, steps) {
  if (vbs != null) {
    if (vbs <= 2.5) { pushStep(steps, `VBS = ${vbs} ≤ 2,5 → A1`); return 'A1' }
    if (vbs <= 6) { pushStep(steps, `2,5 < VBS = ${vbs} ≤ 6 → A2`); return 'A2' }
    if (vbs <= 8) { pushStep(steps, `6 < VBS = ${vbs} ≤ 8 → A3`); return 'A3' }
    pushStep(steps, `VBS = ${vbs} > 8 → A4`)
    return 'A4'
  }
  if (ip != null) {
    if (ip <= 12) { pushStep(steps, `Ip = ${ip} ≤ 12 → A1`); return 'A1' }
    if (ip <= 25) { pushStep(steps, `12 < Ip = ${ip} ≤ 25 → A2`); return 'A2' }
    if (ip <= 40) { pushStep(steps, `25 < Ip = ${ip} ≤ 40 → A3`); return 'A3' }
    pushStep(steps, `Ip = ${ip} > 40 → A4`)
    return 'A4'
  }
  pushStep(steps, 'VBS et Ip manquants : sous-classe A non tranchée')
  return 'A'
}

function classifyB(p80, vbs, steps) {
  const fines = p80 <= 12
  if (vbs == null) {
    pushStep(steps, fines
      ? 'P80 ≤ 12 % mais VBS manquant : B1/B2/B5 non tranché'
      : '12 % < P80 ≤ 35 % mais VBS manquant : B3/B4/B6 non tranché')
    return fines ? 'B' : 'B'
  }
  if (fines) {
    if (vbs <= 0.1) { pushStep(steps, `P80 ≤ 12 % et VBS = ${vbs} ≤ 0,1 → B1`); return 'B1' }
    if (vbs <= 0.2) { pushStep(steps, `P80 ≤ 12 % et 0,1 < VBS = ${vbs} ≤ 0,2 → B2`); return 'B2' }
    pushStep(steps, `P80 ≤ 12 % et VBS = ${vbs} > 0,2 → B5`)
    return 'B5'
  }
  if (vbs <= 0.1) { pushStep(steps, `12 % < P80 ≤ 35 % et VBS = ${vbs} ≤ 0,1 → B3`); return 'B3' }
  if (vbs <= 0.2) { pushStep(steps, `12 % < P80 ≤ 35 % et 0,1 < VBS = ${vbs} ≤ 0,2 → B4`); return 'B4' }
  pushStep(steps, `12 % < P80 ≤ 35 % et VBS = ${vbs} > 0,2 → B6`)
  return 'B6'
}

export function classifyHydric({ wn, wl, wp, ip, wOpn }) {
  const steps = []
  const water = num(wn)
  const opn = num(wOpn)
  if (water != null && opn != null) {
    const delta = rnd(water - opn, 2)
    pushStep(steps, `État hydrique par wnat − wOPN = ${delta} %`)
    if (delta <= -3) return { code: 'ts', steps }
    if (delta <= -1) return { code: 's', steps }
    if (delta <= 1) return { code: 'm', steps }
    if (delta <= 3) return { code: 'h', steps }
    return { code: 'th', steps }
  }
  const liquid = num(wl)
  const plastic = num(ip) ?? (liquid != null && num(wp) != null ? rnd(liquid - num(wp), 2) : null)
  if (water != null && liquid != null && plastic != null && plastic > 0) {
    const ic = rnd((liquid - water) / plastic, 2)
    pushStep(steps, `État hydrique par Ic = (wL − wn) / Ip = ${ic}`)
    if (ic >= 1.25) return { code: 'ts', steps }
    if (ic >= 1) return { code: 's', steps }
    if (ic >= 0.75) return { code: 'm', steps }
    if (ic >= 0.5) return { code: 'h', steps }
    return { code: 'th', steps }
  }
  pushStep(steps, 'État hydrique non calculable (wOPN ou wL/Ip manquants)')
  return { code: '', steps }
}

export function classifyGtrAncienne(params) {
  const steps = []
  const dmax = num(params.dmax)
  const p80 = num(params.passant_80)
  const vbs = num(params.vbs)
  const ip = num(params.ip)
  if (p80 == null && dmax == null) {
    pushStep(steps, 'Dmax et P80 manquants : classification GTR 1992 impossible')
    return { classe: '', hydrique: '', code: '', description: '', chemin: steps }
  }
  let classe = ''
  if (dmax != null && dmax > 50) {
    pushStep(steps, `Dmax = ${dmax} mm > 50 mm → famille C (fraction 0/50 classée comme A ou B)`)
    if (p80 == null) {
      pushStep(steps, 'P80 de la fraction 0/50 manquant')
      classe = 'C'
    } else if (p80 > 35) {
      pushStep(steps, `P80 = ${p80} % > 35 % sur 0/50 → sols fins`)
      const sub = classifyAByVbsOrIp(vbs, ip, steps)
      classe = ['A3', 'A4'].includes(sub) ? 'C2' : 'C1'
      pushStep(steps, `Fraction 0/50 = ${sub} → ${classe}`)
    } else {
      const sub = classifyB(p80, vbs, steps)
      if (p80 <= 5 && vbs != null && vbs <= 0.1) {
        classe = dmax > 250 ? 'D3' : 'D2'
        pushStep(steps, classe === 'D3'
          ? 'Dmax > 250 mm, P80 ≤ 5 % et VBS ≤ 0,1 → matériaux rocheux D3'
          : '50 < Dmax ≤ 250 mm, P80 ≤ 5 % et VBS ≤ 0,1 → graves propres D2')
      } else if (['B5', 'B6'].includes(sub)) {
        classe = 'C2'
        pushStep(steps, `Fraction 0/50 = ${sub} → ${classe}`)
      } else {
        classe = sub && sub !== 'B' ? 'C1' : 'C'
        pushStep(steps, `Fraction 0/50 = ${sub || 'B'} → ${classe}`)
      }
    }
  } else {
    if (dmax != null) pushStep(steps, `Dmax = ${dmax} mm ≤ 50 mm`)
    if (p80 == null) {
      pushStep(steps, 'P80 manquant')
    } else if (p80 > 35) {
      pushStep(steps, `P80 = ${p80} % > 35 % → sols fins, famille A`)
      classe = classifyAByVbsOrIp(vbs, ip, steps)
    } else if (p80 <= 5 && vbs != null && vbs <= 0.1) {
      pushStep(steps, `P80 = ${p80} % ≤ 5 % et VBS = ${vbs} ≤ 0,1 → sables propres D1`)
      classe = 'D1'
    } else {
      pushStep(steps, `P80 = ${p80} % ≤ 35 % → sables/graves avec fines, famille B`)
      classe = classifyB(p80, vbs, steps)
    }
  }
  const needsHydric = /^(A|B5|B6|C2)/.test(classe)
  const hydric = needsHydric ? classifyHydric(params) : { code: '', steps: [] }
  if (hydric.steps?.length) steps.push(...hydric.steps)
  const hydrique = hydric.code || ''
  return {
    classe,
    hydrique,
    code: formatGtrCode(classe, hydrique),
    description: gtrAncienneDescription(classe, hydrique),
    chemin: steps,
  }
}

const ANCIENNE_TO_EN16907 = {
  A1: { nature: 'F', sensibilite: '1', code: 'F1' },
  A2: { nature: 'F', sensibilite: '2', code: 'F2' },
  A3: { nature: 'F', sensibilite: '3', code: 'F3' },
  A4: { nature: 'F', sensibilite: '4', code: 'F4' },
  B1: { nature: 'Sa', sensibilite: '1', code: 'Sa1' },
  B2: { nature: 'Sa', sensibilite: '2', code: 'Sa2' },
  B3: { nature: 'SaF', sensibilite: '1', code: 'SaF1' },
  B4: { nature: 'SaF', sensibilite: '2', code: 'SaF2' },
  B5: { nature: 'Sa', sensibilite: '3', code: 'Sa3' },
  B6: { nature: 'SaF', sensibilite: '3', code: 'SaF3' },
  C1: { nature: 'GrF', sensibilite: '1', code: 'GrF1' },
  C2: { nature: 'GrF', sensibilite: '3', code: 'GrF3' },
  D1: { nature: 'Sa', sensibilite: '0', code: 'Sa0' },
  D2: { nature: 'Gr', sensibilite: '0', code: 'Gr0' },
  D3: { nature: 'Ro', sensibilite: '0', code: 'Ro' },
  A: { nature: 'F', sensibilite: '', code: 'F' },
  B: { nature: 'Sa', sensibilite: '', code: 'Sa' },
  C: { nature: 'GrF', sensibilite: '', code: 'GrF' },
}

export function classifyGtrNouvelle(ancienne) {
  const steps = []
  const mapped = ANCIENNE_TO_EN16907[ancienne?.classe] || null
  if (!mapped) {
    pushStep(steps, 'Correspondance EN 16907-2 indisponible tant que la GTR 1992 n’est pas tranchée')
    return { code: '', nature: '', sensibilite: '', hydrique: '', description: '', chemin: steps }
  }
  pushStep(steps, `NF P 11-300:2022 / EN 16907-2 : ${ancienne.classe} → ${mapped.code}`)
  const hydrique = ancienne.hydrique || ''
  const code = hydrique ? `${mapped.code} (${hydrique})` : mapped.code
  if (hydrique) pushStep(steps, `État hydrique repris de la GTR 1992 : ${hydrique} (${hydricLabel(hydrique)})`)
  return {
    ...mapped,
    hydrique,
    code,
    description: gtrNouvelleDescription(mapped.nature, mapped.sensibilite, hydrique),
    chemin: steps,
  }
}

function isoDescription(iso) {
  const map = {
    Cl: 'argile',
    ClH: 'argile de haute plasticité',
    Si: 'limon',
    SiH: 'limon de haute plasticité',
    saCl: 'argile sableuse',
    saSi: 'limon sableux',
    grCl: 'argile graveleuse',
    grSi: 'limon graveleux',
    Sa: 'sable',
    grSa: 'sable graveleux',
    clSa: 'sable argileux',
    siSa: 'sable limoneux',
    Gr: 'grave',
    saGr: 'grave sableuse',
    clGr: 'grave argileuse',
    siGr: 'grave limoneuse',
  }
  return map[iso] || ''
}

export function classifyEurocode(params) {
  const steps = []
  const p80 = num(params.passant_80)
  const p63 = num(params.passant_63) ?? p80
  const p2 = num(params.passant_2)
  const p20 = num(params.passant_20)
  const wl = num(params.wl)
  const ip = num(params.ip)
  const fines = p63 ?? p80
  if (fines == null) {
    pushStep(steps, 'Passant 63/80 µm manquant : ISO 14688-2 non calculable')
    return { iso_14688: '', uscs: '', description: '', chemin: steps }
  }
  const gravel = p2 != null ? rnd(Math.max(0, 100 - p2), 1) : (p20 != null ? rnd(Math.max(0, 100 - p20), 1) : null)
  const sand = (p2 != null && fines != null) ? rnd(Math.max(0, p2 - fines), 1) : null
  pushStep(steps, `Fines (< 63/80 µm) = ${fines} %${sand != null ? ` · sables = ${sand} %` : ''}${gravel != null ? ` · graves = ${gravel} %` : ''}`)

  let iso = ''
  let uscs = ''
  if (fines >= 35) {
    pushStep(steps, 'Fines ≥ 35 % → sol fin (ISO 14688-2)')
    const aLine = aLineIp(wl)
    const isClay = ip != null && aLine != null ? ip >= aLine && ip >= 4 : (ip != null ? ip >= 12 : null)
    const high = wl != null && wl >= 50
    if (isClay === true) {
      iso = high ? 'ClH' : 'Cl'
      uscs = high ? 'CH' : 'CL'
      pushStep(steps, `Ip = ${ip}${aLine != null ? ` ≥ droite A (${aLine})` : ''} → argile${high ? ' haute plasticité' : ''}`)
    } else if (isClay === false) {
      iso = high ? 'SiH' : 'Si'
      uscs = high ? 'MH' : 'ML'
      pushStep(steps, `Ip = ${ip ?? '—'} sous la droite A → limon${high ? ' haute plasticité' : ''}`)
    } else {
      iso = 'Si'
      uscs = 'ML'
      pushStep(steps, 'Ip / wL manquants : sol fin noté limon par défaut')
    }
    const clayish = iso.startsWith('Cl')
    if (sand != null && sand >= 15) {
      iso = clayish ? 'saCl' : 'saSi'
      pushStep(steps, 'Sables ≥ 15 % → préfixe sa')
    } else if (gravel != null && gravel >= 15) {
      iso = clayish ? 'grCl' : 'grSi'
      uscs = clayish ? 'GC' : 'GM'
      pushStep(steps, 'Graves ≥ 15 % → préfixe gr')
    }
  } else {
    pushStep(steps, 'Fines < 35 % → sol grenue (ISO 14688-2)')
    const gravelDom = gravel != null && sand != null ? gravel >= sand : (gravel != null && gravel >= 50)
    if (gravelDom) {
      iso = 'Gr'
      uscs = fines >= 12 ? (ip != null && ip >= 4 ? 'GC' : 'GM') : 'GP'
      pushStep(steps, 'Fraction grave dominante')
      if (sand != null && sand >= 15) { iso = 'saGr'; pushStep(steps, 'Sables ≥ 15 % → saGr') }
      if (fines >= 15) {
        const clayey = ip != null && ip >= 4
        iso = clayey ? 'clGr' : 'siGr'
        uscs = clayey ? 'GC' : 'GM'
        pushStep(steps, `Fines ≥ 15 % → ${iso}`)
      }
    } else {
      iso = 'Sa'
      uscs = fines >= 12 ? (ip != null && ip >= 4 ? 'SC' : 'SM') : 'SP'
      pushStep(steps, 'Fraction sable dominante')
      if (gravel != null && gravel >= 15) { iso = 'grSa'; pushStep(steps, 'Graves ≥ 15 % → grSa') }
      if (fines >= 15) {
        const clayey = ip != null && ip >= 4
        iso = clayey ? 'clSa' : 'siSa'
        uscs = clayey ? 'SC' : 'SM'
        pushStep(steps, `Fines ≥ 15 % → ${iso}`)
      }
    }
  }
  return {
    iso_14688: iso,
    uscs,
    description: isoDescription(iso),
    chemin: steps,
  }
}

export function computeIdResultats(raw) {
  const draft = unwrapIdResultats(raw)
  const ancienne = classifyGtrAncienne(draft)
  const nouvelle = classifyGtrNouvelle(ancienne)
  const eurocode = classifyEurocode(draft)
  const classe = ancienne.classe || draft.classification_gtr || draft.gtr_class || ''
  const hydrique = ancienne.hydrique || draft.sous_classe || draft.gtr_state || ''
  return {
    ...draft,
    classification_gtr: classe,
    gtr_class: classe,
    sous_classe: hydrique,
    gtr_state: hydrique,
    gtr_ancienne: ancienne,
    gtr_nouvelle: nouvelle,
    eurocode,
  }
}

export function serializeIdResultats(raw) {
  return computeIdResultats(raw)
}

export function extractGrIdentification(grResultats) {
  const r = unwrapGrResultats(grResultats)
  const p80 = extractPassantAt(grResultats, 0.08) ?? extractPassantAt(grResultats, 0.063) ?? num(r?.passant_80)
  const p63 = extractPassantAt(grResultats, 0.063) ?? p80
  return {
    dmax: num(r?.dmax),
    passant_80: p80,
    passant_63: p63,
    passant_2: extractPassantAt(grResultats, 2),
    passant_20: extractPassantAt(grResultats, 20),
    passant_50: extractPassantAt(grResultats, 50),
  }
}

export function extractVbsFromResultats(resultats) {
  const r = resultats && typeof resultats === 'object' ? resultats : {}
  const direct = num(r?.vbs_moyen ?? r?.vb_moyen ?? r?.vbs ?? r?.vb)
  if (direct != null) return direct
  const dets = Array.isArray(r?.determinations) ? r.determinations : []
  const vals = dets.map((row) => num(row?.vbs ?? row?.vb)).filter((value) => value != null)
  if (!vals.length) return null
  return rnd(vals.reduce((sum, value) => sum + value, 0) / vals.length, 2)
}

export function extractEsFromResultats(resultats) {
  const raw = resultats && typeof resultats === 'object' && !Array.isArray(resultats) ? resultats : {}
  const computed = computeEsResultats(unwrapEsResultats(raw))
  return num(computed?.se_p ?? computed?.es ?? raw.se_p ?? raw.es)
}

export function extractPnWopn(pnResultats) {
  const r = typeof pnResultats === 'string'
    ? (() => { try { return JSON.parse(pnResultats || '{}') } catch { return {} } })()
    : (pnResultats || {})
  const curve = buildProctorCurve(r)
  return num(curve.wOPN)
}
