import { num, rnd } from '@/components/essais/essaiFormUi'

export const PL_EV2_EV1_NOTE = 'Le rapport EV2/EV1 est communiqué à titre indicatif. La NF P 94-117-1 ne prescrit plus le calcul de ce paramètre.'

function text(value) {
  if (value == null) return ''
  return String(value).trim()
}

function ratioEv2Ev1(ev1, ev2) {
  const first = num(ev1)
  const second = num(ev2)
  if (first == null || first === 0 || second == null) return null
  return rnd(second / first, 2)
}

export function emptyPlPoint(index = 0) {
  return {
    id: index + 1,
    point_no: String(index + 1),
    localisation: '',
    ev1_mpa: '',
    ev2_mpa: '',
    rapport_ev2_ev1: null,
    observation: '',
  }
}

export function emptyPlPayload() {
  return {
    operateur: '',
    date_essai: '',
    materiel: '',
    partie_ouvrage: '',
    nature_materiau: '',
    diametre_plaque_mm: '600',
    source_criteres: '',
    critere_ev2_min_mpa: '',
    critere_rapport_ev2_ev1_max: '',
    points: [emptyPlPoint(0), emptyPlPoint(1)],
    moyenne_ev1_mpa: null,
    moyenne_ev2_mpa: null,
    moyenne_rapport_ev2_ev1: null,
    valeur_min_mpa: null,
    valeur_max_mpa: null,
    taux_conformes_percent: null,
    conclusion: '',
  }
}

function normalizePoint(row, index) {
  const source = row && typeof row === 'object' ? row : {}
  const pointNo = text(source.point_no || source.point || source.essai_no || '') || String(index + 1)
  const ev1 = source.ev1_mpa ?? source.ev1 ?? ''
  const ev2 = source.ev2_mpa ?? source.ev2 ?? ''
  return {
    ...source,
    id: source.id ?? index + 1,
    point_no: pointNo,
    localisation: text(source.localisation),
    ev1_mpa: ev1,
    ev2_mpa: ev2,
    rapport_ev2_ev1: source.rapport_ev2_ev1 ?? source.ev2_ev1 ?? ratioEv2Ev1(ev1, ev2),
    observation: text(source.observation || source.observations),
  }
}

export function unwrapPlPayload(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const points = Array.isArray(source.points) && source.points.length
    ? source.points.map((row, index) => normalizePoint(row, index))
    : emptyPlPayload().points
  return {
    ...emptyPlPayload(),
    ...source,
    points,
  }
}

function average(values, digits) {
  if (!values.length) return null
  return rnd(values.reduce((sum, value) => sum + value, 0) / values.length, digits)
}

export function computePlResultats(raw) {
  const draft = unwrapPlPayload(raw)
  const points = draft.points.map((row) => ({
    ...row,
    rapport_ev2_ev1: ratioEv2Ev1(row.ev1_mpa, row.ev2_mpa) ?? num(row.rapport_ev2_ev1),
  }))
  const ev1Values = points.map((row) => num(row.ev1_mpa)).filter((value) => value != null)
  const ev2Values = points.map((row) => num(row.ev2_mpa)).filter((value) => value != null)
  const ratioValues = points.map((row) => num(row.rapport_ev2_ev1)).filter((value) => value != null)
  const ev2Min = num(draft.critere_ev2_min_mpa)
  const judged = points.filter((row) => num(row.ev2_mpa) != null)
  let taux = num(draft.taux_conformes_percent)
  if (ev2Min != null && judged.length) {
    const ok = judged.filter((row) => num(row.ev2_mpa) >= ev2Min).length
    taux = rnd((ok / judged.length) * 100, 0)
  } else if (!judged.length) {
    taux = null
  }
  return {
    ...draft,
    points,
    moyenne_ev1_mpa: average(ev1Values, 1),
    moyenne_ev2_mpa: average(ev2Values, 1),
    moyenne_rapport_ev2_ev1: average(ratioValues, 2),
    valeur_min_mpa: ev2Values.length ? rnd(Math.min(...ev2Values), 1) : null,
    valeur_max_mpa: ev2Values.length ? rnd(Math.max(...ev2Values), 1) : null,
    taux_conformes_percent: taux,
    nb_points: ev2Values.length,
  }
}

export function serializePlPayload(raw) {
  const computed = computePlResultats(raw)
  return {
    ...computed,
    points: computed.points.map((row, index) => ({
      ...row,
      point_no: text(row.point_no) || String(index + 1),
      point: text(row.point_no) || String(index + 1),
      ev1_mpa: num(row.ev1_mpa) ?? row.ev1_mpa,
      ev2_mpa: num(row.ev2_mpa) ?? row.ev2_mpa,
      rapport_ev2_ev1: num(row.rapport_ev2_ev1) ?? row.rapport_ev2_ev1,
      observation: text(row.observation),
    })),
  }
}
