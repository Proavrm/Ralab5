import { num, rnd } from '@/components/essais/essaiFormUi'

function text(value) {
  if (value == null) return ''
  return String(value).trim()
}

export function emptyPldPoint(index = 0) {
  return {
    id: index + 1,
    point_no: String(index + 1),
    localisation: '',
    ev2_mpa: '',
    observation: '',
  }
}

export function emptyPldPayload() {
  return {
    operateur: '',
    date_essai: '',
    materiel: '',
    partie_ouvrage: '',
    nature_materiau: '',
    diametre_plaque_mm: '',
    source_criteres: '',
    critere_ev2_min_mpa: '',
    points: [emptyPldPoint(0), emptyPldPoint(1)],
    moyenne_ev2_mpa: null,
    valeur_min_mpa: null,
    valeur_max_mpa: null,
    taux_conformes_percent: null,
    conclusion: '',
  }
}

function normalizePoint(row, index) {
  const source = row && typeof row === 'object' ? row : {}
  const pointNo = text(source.point_no || source.point || source.essai_no || '') || String(index + 1)
  return {
    ...source,
    id: source.id ?? index + 1,
    point_no: pointNo,
    localisation: text(source.localisation),
    ev2_mpa: source.ev2_mpa ?? source.ev2 ?? '',
    observation: text(source.observation || source.observations),
  }
}

export function unwrapPldPayload(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const points = Array.isArray(source.points) && source.points.length
    ? source.points.map((row, index) => normalizePoint(row, index))
    : emptyPldPayload().points
  return {
    ...emptyPldPayload(),
    ...source,
    points,
  }
}

export function computePldResultats(raw) {
  const draft = unwrapPldPayload(raw)
  const values = draft.points
    .map((row) => num(row.ev2_mpa))
    .filter((value) => value != null)
  const moyenne = values.length ? rnd(values.reduce((sum, value) => sum + value, 0) / values.length, 1) : null
  const min = values.length ? rnd(Math.min(...values), 1) : null
  const max = values.length ? rnd(Math.max(...values), 1) : null
  const criterion = num(draft.critere_ev2_min_mpa)
  let taux = num(draft.taux_conformes_percent)
  if (criterion != null && values.length) {
    const ok = values.filter((value) => value >= criterion).length
    taux = rnd((ok / values.length) * 100, 0)
  } else if (!values.length) {
    taux = null
  }
  return {
    ...draft,
    moyenne_ev2_mpa: moyenne,
    valeur_min_mpa: min,
    valeur_max_mpa: max,
    taux_conformes_percent: taux,
    nb_points: values.length,
  }
}

export function serializePldPayload(raw) {
  const computed = computePldResultats(raw)
  return {
    ...computed,
    points: computed.points.map((row, index) => ({
      ...row,
      point_no: text(row.point_no) || String(index + 1),
      point: text(row.point_no) || String(index + 1),
      ev2_mpa: num(row.ev2_mpa) ?? row.ev2_mpa,
      observation: text(row.observation),
    })),
  }
}
