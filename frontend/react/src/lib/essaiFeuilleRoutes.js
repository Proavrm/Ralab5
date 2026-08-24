import { buildPathWithReturnTo } from '@/lib/detailNavigation'

export const DEDICATED_ESSAI_FEUILLE_CODES = {
  MVA: {
    code: 'MVA',
    feuilleBase: '/modeles/mva',
    rapportPath: '/rapports/mva/view',
    label: 'Masse volumique des enrobés',
    typeEssai: 'Masse volumique des enrobés',
    norme: 'NF EN 12697-6',
  },
  CFE: {
    code: 'CFE',
    feuilleBase: '/modeles/cfe',
    rapportPath: '/rapports/cfe/view',
    label: 'Contrôle de fabrication des enrobés',
    typeEssai: 'Contrôle de fabrication enrobés',
    norme: '',
  },
  EL: {
    code: 'EL',
    feuilleBase: '/modeles/el',
    rapportPath: '/rapports/el/view',
    label: 'Extraction de liant',
    typeEssai: 'Extraction de liant',
    norme: 'NF EN 12697-1',
  },
  WE: {
    code: 'WE',
    feuilleBase: '/modeles/we',
    rapportPath: '/rapports/we/view',
    label: 'Teneur en eau pondérale',
    typeEssai: 'Teneur en eau',
    norme: 'NF P 94-050',
  },
  GR: {
    code: 'GR',
    feuilleBase: '/modeles/gr',
    rapportPath: '/rapports/gr/view',
    label: 'Granulométrie',
    typeEssai: 'Granulométrie',
    norme: 'NF P 94-056',
  },
  LCP: {
    code: 'LCP',
    feuilleBase: '/modeles/lcp',
    rapportPath: '/rapports/lcp/view',
    label: "Limites d'Atterberg",
    typeEssai: "Limites d'Atterberg",
    norme: 'NF P 94-051',
  },
  VBS: {
    code: 'VBS',
    feuilleBase: '/modeles/vbs',
    rapportPath: '/rapports/vbs/view',
    label: 'Valeur de bleu',
    typeEssai: 'Bleu de méthylène',
    norme: 'NF P 94-068',
  },
  BM: {
    code: 'BM',
    feuilleBase: '/modeles/vbs',
    rapportPath: '/rapports/vbs/view',
    label: 'Bleu de méthylène',
    typeEssai: 'Bleu de méthylène',
    norme: 'NF EN 933-9',
  },
  MB: {
    code: 'MB',
    feuilleBase: '/modeles/mb',
    rapportPath: '/rapports/mb/view',
    label: 'Valeur au bleu 0/2',
    typeEssai: 'Valeur au bleu 0/2',
    norme: 'NF EN 933-9',
  },
  MBF: {
    code: 'MBF',
    feuilleBase: '/modeles/mbf',
    rapportPath: '/rapports/mbf/view',
    label: 'Valeur au bleu 0/0.125',
    typeEssai: 'Valeur au bleu 0/0.125',
    norme: 'NF EN 933-9',
  },
  ID: {
    code: 'ID',
    feuilleBase: '/modeles/id',
    rapportPath: '/rapports/id/view',
    label: 'Identification GTR',
    typeEssai: 'Identification GTR',
    norme: 'NF P 11-300',
  },
  PN: {
    code: 'PN',
    feuilleBase: '/modeles/pn',
    rapportPath: '/rapports/pn/view',
    label: 'Proctor',
    typeEssai: 'Proctor Normal',
    norme: 'NF P 94-093',
  },
  IPI: {
    code: 'IPI',
    feuilleBase: '/modeles/ipi',
    rapportPath: '/rapports/ipi/view',
    label: 'Indice Portant Immédiat',
    typeEssai: 'IPI — Indice Portant Immédiat',
    norme: 'NF P 94-078',
  },
  CBRI: {
    code: 'CBRI',
    feuilleBase: '/modeles/cbri',
    rapportPath: '/rapports/cbri/view',
    label: 'CBR immédiat',
    typeEssai: 'CBRi — CBR immédiat',
    norme: 'NF P 94-090-1',
  },
  IM: {
    code: 'IM',
    feuilleBase: '/modeles/cbri',
    rapportPath: '/rapports/cbri/view',
    label: 'CBR immédiat',
    typeEssai: 'CBRi — CBR immédiat',
    norme: 'NF P 94-090-1',
  },
  CBR: {
    code: 'CBR',
    feuilleBase: '/modeles/cbr',
    rapportPath: '/rapports/cbr/view',
    label: 'CBR après immersion',
    typeEssai: 'CBR — après immersion 4 jours',
    norme: 'NF P 94-090-1',
  },
  ES: {
    code: 'ES',
    feuilleBase: '/modeles/es',
    rapportPath: '/rapports/es/view',
    label: 'Équivalent de sable',
    typeEssai: 'Équivalent de sable',
    norme: 'NF EN 933-8',
  },
  TX: {
    code: 'TX',
    feuilleBase: '/modeles/tx',
    rapportPath: '/rapports/tx/view',
    label: 'Texture / granulométrie pédologique',
    typeEssai: 'Texture / granulométrie pédologique',
    norme: '',
  },
  PH: {
    code: 'PH',
    feuilleBase: '/modeles/ph',
    rapportPath: '/rapports/ph/view',
    label: 'pH',
    typeEssai: 'pH',
    norme: '',
  },
  MO: {
    code: 'MO',
    feuilleBase: '/modeles/mo',
    rapportPath: '/rapports/mo/view',
    label: 'Matière organique',
    typeEssai: 'Matière organique',
    norme: '',
  },
  CA: {
    code: 'CA',
    feuilleBase: '/modeles/ca',
    rapportPath: '/rapports/ca/view',
    label: 'Calcaire actif',
    typeEssai: 'Calcaire actif',
    norme: '',
  },
}

/** Rapport regroupé terre végétale / substrat (par échantillon). */
export function buildTerreVegetaleRapportPath({ echantillonId = '', returnTo = '' } = {}) {
  const cleanId = String(echantillonId || '').trim()
  const feuilleReturn = returnTo || (cleanId ? `/echantillons/${encodeURIComponent(cleanId)}` : '/labo/workbench?tab=echantillons')
  return appendQuery('/rapports/tv/view', {
    mode: 'work',
    source_kind: 'echantillon',
    source_family: 'echantillon',
    source_uid: cleanId,
    echantillon_id: cleanId,
    return_to: feuilleReturn,
  })
}

export function normalizeEssaiCode(value) {
  return String(value || '').trim().toUpperCase()
}

export function isDedicatedEssaiFeuilleCode(code) {
  return Boolean(DEDICATED_ESSAI_FEUILLE_CODES[normalizeEssaiCode(code)])
}

export function getDedicatedEssaiFeuilleDef(code) {
  return DEDICATED_ESSAI_FEUILLE_CODES[normalizeEssaiCode(code)] || null
}

function appendQuery(path, query = {}) {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value == null) return
    const text = String(value).trim()
    if (!text) return
    params.set(key, text)
  })
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export function buildDedicatedEssaiFeuillePath({
  code,
  uid = '',
  isNew = false,
  query = {},
  returnTo = '',
} = {}) {
  const def = getDedicatedEssaiFeuilleDef(code)
  if (!def) return null

  const cleanUid = String(uid || '').trim()
  let path = def.feuilleBase
  if (isNew || cleanUid === 'new') {
    path = `${def.feuilleBase}/new`
  } else if (cleanUid) {
    path = `${def.feuilleBase}/${encodeURIComponent(cleanUid)}`
  }

  const withQuery = appendQuery(path, query)
  return returnTo ? buildPathWithReturnTo(withQuery, returnTo) : withQuery
}

export function buildDedicatedEssaiRapportPath({
  code,
  uid = '',
  returnTo = '',
  extra = {},
} = {}) {
  const def = getDedicatedEssaiFeuilleDef(code)
  if (!def) return null

  const cleanUid = String(uid || '').trim()
  const feuilleReturn = returnTo || (cleanUid
    ? buildDedicatedEssaiFeuillePath({ code, uid: cleanUid })
    : def.feuilleBase)

  return appendQuery(def.rapportPath, {
    mode: 'work',
    source_kind: 'essai',
    source_family: 'essai',
    source_uid: cleanUid,
    essai_id: cleanUid,
    return_to: feuilleReturn,
    ...extra,
  })
}

export function resolveEssaiCodeFromRecord(essai) {
  return normalizeEssaiCode(essai?.essai_code || essai?.code_essai || essai?.code || '')
}

export function buildEssaiOpenPath(essai, returnTo = '') {
  const code = resolveEssaiCodeFromRecord(essai)
  const uid = essai?.uid ?? essai?.id ?? ''
  if (isDedicatedEssaiFeuilleCode(code) && uid) {
    return buildDedicatedEssaiFeuillePath({ code, uid, returnTo })
  }
  if (!uid) return null
  const path = `/essais/${encodeURIComponent(String(uid))}`
  return returnTo ? buildPathWithReturnTo(path, returnTo) : path
}

export function stringifyEssaiResultats(payload) {
  if (payload == null) return '{}'
  if (typeof payload === 'string') return payload
  return JSON.stringify(payload)
}

export function parseEssaiResultats(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
