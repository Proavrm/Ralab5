import { buildG3NotesTechniquesPath } from '@/lib/modeleNTContent'
import { missionFeuilleStatusMeta } from '@/lib/feuilleMissionJournee'
import { isNoteTechniqueIntervention } from '@/lib/noteTechniqueIntervention'
import { buildDistanceToLabCaption } from '@/lib/labGeo'

export const D7 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
export const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const ACTIVE = ['A planifier', 'Planifie', 'En cours']
export const ARCHIVED = ['Termine', 'Annule']
export const STATUS_META = {
  'A planifier': { dot: '#888780', bg: '#f1efe8', fg: '#5f5e5a' },
  Planifie: { dot: '#4A7DB5', bg: '#E8EFF8', fg: '#002C77' },
  'En cours': { dot: '#1d9e75', bg: '#eaf3de', fg: '#3b6d11' },
  Termine: { dot: '#0f6e56', bg: '#E1F5EE', fg: '#0f6e56' },
  Annule: { dot: '#e24b4a', bg: '#fcebeb', fg: '#a32d2d' },
}

export const AGENDA_LABEL_COL_WIDTH = 204
export const AGENDA_HEADER_ROW_HEIGHT = 40
export const AGENDA_DEFAULT_DATA_ROW_HEIGHT = 56

export const KIND_COLORS = {
  campagne: '#003170',
  intervention: '#1d9e75',
  essai: '#854f0b',
  demande: '#4A7DB5',
}

export function itemKey(item) {
  return `${item.kind}:${item.uid}`
}

export function normalizePlanningItem(row) {
  const normalized = {
    ...row,
    kind: row.kind || 'demande',
    kind_label: row.kind_label || 'Élément',
    ref: row.ref || row.reference || `Planning #${row.uid}`,
    tit: row.tit || row.title || '',
    subtitle: row.subtitle || '',
    stat: row.stat || 'A planifier',
    start: row.start || '',
    ech: row.ech || '',
    urg: row.urg || urgencyFromEch(row.ech || row.start),
    labo: row.labo || row.labo_code || '',
    labo_code: row.labo_code || '',
    route: row.route || `/demandes/${row.uid}`,
    open_label: row.open_label || 'Ouvrir',
    views: Array.isArray(row.views) ? row.views : [],
    editable_start: row.editable_start !== false,
    editable_ech: row.editable_ech !== false,
    editable_stat: row.editable_stat !== false,
    source_demande_id: row.source_demande_id ?? null,
    affaire_ref: row.affaire_ref || '',
    wbs: row.wbs || '',
    type_intervention: row.type_intervention || '',
    is_demande_scope: row.is_demande_scope === true,
    date_envoi: row.date_envoi || '',
    programme_terrain: row.programme_terrain || '',
    technicien: row.technicien || '',
    geotechnicien: row.geotechnicien || '',
    observations: row.observations || '',
    mission_feuille_status: row.mission_feuille_status || 'none',
    mission_feuille_generated_at: row.mission_feuille_generated_at || '',
    mission_feuille_printed_at: row.mission_feuille_printed_at || '',
    distance_to_lab: row.distance_to_lab || null,
    distance_to_lab_text: row.distance_to_lab_text || '',
  }
  return {
    ...normalized,
    key: itemKey(normalized),
  }
}

export function fmtShort(iso) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function planningAffaireRefLabel(item, fallbackAffaireRef = '') {
  const affaire = String(item?.affaire_ref || fallbackAffaireRef || '').trim()
  const ref = String(item?.ref || '').trim()
  if (!affaire || affaire === ref) return ''
  return affaire
}

export function planningDistanceCaption(item) {
  if (!item) return ''
  const fromObject = buildDistanceToLabCaption(item.distance_to_lab)
  if (fromObject) return fromObject
  const text = String(item.distance_to_lab_text || '').trim()
  if (!text) return ''
  const labLabel = String(item.labo || item.labo_code || '').trim()
  return labLabel ? `${text} du labo ${labLabel}` : text
}

export function parseDate(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date, n) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + n)
  return copy
}

export function weekStart(date) {
  const copy = new Date(date)
  const dow = (copy.getDay() + 6) % 7
  copy.setDate(copy.getDate() - dow)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export function urgencyFromEch(ech) {
  if (!ech) return 'done'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((parseDate(ech) - today) / 86400000)
  if (diff < 0) return 'late'
  if (diff <= 7) return 'soon'
  return 'ok'
}

export function monthHeatmap(data, y, m) {
  const counts = {}
  const urgency = {}
  data.forEach((item) => {
    const target = item.ech || item.start
    if (!target) return
    const d = parseDate(target)
    if (!d || d.getFullYear() !== y || d.getMonth() !== m) return
    const day = d.getDate()
    counts[day] = (counts[day] || 0) + 1
    if (!urgency[day] || urgency[day] === 'ok') urgency[day] = item.urg
    if (urgency[day] === 'soon' && item.urg === 'late') urgency[day] = 'late'
  })
  return { counts, urgency }
}

export function colorClass(n, u) {
  if (u === 'late') return 'clate'
  if (u === 'soon') return 'cwarn'
  return ['c0', 'c1', 'c2', 'c3', 'c4'][Math.min(n, 4)]
}

export function itemBorderColor(item) {
  if (isNoteTechniqueIntervention(item)) return '#5b4b8a'
  if (item.urg === 'late') return '#e24b4a'
  if (item.urg === 'soon') return '#E6A817'
  return KIND_COLORS[item.kind] || '#4A7DB5'
}

export function itemColor(item) {
  const status = STATUS_META[item.stat] || STATUS_META['A planifier']
  return {
    bg: status.bg,
    border: itemBorderColor(item),
    text: status.fg,
  }
}

export function shiftCalendarMonth(calYear, calMonth, delta) {
  const month = calMonth + delta
  if (month < 0) return { calYear: calYear - 1, calMonth: 11 }
  if (month > 11) return { calYear: calYear + 1, calMonth: 0 }
  return { calYear, calMonth: month }
}

export const PREPARATION_PLANNING_KINDS = new Set(['campagne', 'intervention', 'essai'])

export function filterPreparationPlanningItems(items, demandeUid) {
  return (items || []).filter((item) => (
    PREPARATION_PLANNING_KINDS.has(item.kind)
    && String(item.source_demande_id) === String(demandeUid)
  ))
}

export function agendaItemsFromPlanning(items) {
  return items.filter((item) => {
    if (item.start && item.ech) return true
    if (item.start && !item.editable_ech) return true
    if (item.ech && item.editable_ech !== false) return true
    return false
  }).map((item) => {
    if (item.start && !item.ech) {
      return { ...item, ech: item.start }
    }
    if (!item.start && item.ech) {
      return { ...item, start: item.ech }
    }
    return item
  })
}

export function agendaWeekEvents(items, wsStr, weStr) {
  return agendaItemsFromPlanning(items)
    .filter((item) => {
      const start = item.start || item.ech
      const ech = item.ech || item.start
      if (!start || !ech) return false
      return ech >= wsStr && start <= weStr
    })
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function isDemandeAgendaItem(item) {
  return item?.views?.includes('demandes') || item?.kind === 'demande'
}

export function isTerrainAgendaItem(item) {
  return item?.views?.includes('terrain')
}

export function isLaboAgendaItem(item) {
  return item?.views?.includes('labo')
}

export function filterDemandeAgendaItems(items = []) {
  return (items || []).filter(isDemandeAgendaItem)
}

export function filterLaboAgendaItems(items = []) {
  return (items || []).filter((item) => isTerrainAgendaItem(item) || isLaboAgendaItem(item))
}

export const ORGANISER_KIND_FILTERS = [
  { id: '', label: 'Tous' },
  { id: 'demande', label: 'Demandes' },
  { id: 'campagne', label: 'Campagnes' },
  { id: 'intervention', label: 'Interventions' },
  { id: 'passation', label: 'Passations' },
  { id: 'prelevement', label: 'Prélèvements' },
  { id: 'echantillon', label: 'Échantillons' },
  { id: 'essai', label: 'Essais' },
]

function organiserSearchHaystack(item) {
  return [
    item?.ref,
    item?.tit,
    item?.subtitle,
    item?.affaire_ref,
    item?.kind_label,
    item?.labo,
    item?.wbs,
    item?.programme_terrain,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterOrganiserItems(items = [], { search = '', kind = '' } = {}) {
  const query = String(search || '').trim().toLowerCase()
  const kindFilter = String(kind || '').trim()

  return (items || []).filter((item) => {
    if (kindFilter && item.kind !== kindFilter) return false
    if (!query) return true
    return organiserSearchHaystack(item).includes(query)
  })
}

export function countOrganiserKindFilters(items = []) {
  const counts = { '': items.length }
  for (const item of items) {
    const kind = String(item?.kind || '').trim()
    if (!kind) continue
    counts[kind] = (counts[kind] || 0) + 1
  }
  return counts
}

function campagneItemFromNav(campaign, demandeUid) {
  return normalizePlanningItem({
    uid: campaign.uid,
    kind: 'campagne',
    kind_label: 'Campagne',
    ref: campaign.reference || campaign.code || `Campagne #${campaign.uid}`,
    tit: campaign.designation || campaign.label || campaign.code || '',
    subtitle: campaign.label || campaign.code || '',
    stat: campaign.statut || 'A planifier',
    start: campaign.date_debut_prevue || '',
    ech: campaign.date_fin_prevue || '',
    route: `/campagnes/${campaign.uid}`,
    open_label: 'Ouvrir la campagne',
    source_demande_id: demandeUid,
    editable_start: true,
    editable_ech: true,
    editable_stat: true,
  })
}

export function interventionProgrammeLine(intervention) {
  return String(intervention?.programme_terrain || '').trim()
}

export function interventionMarkerMeta(intervention) {
  const programme = interventionProgrammeLine(intervention)
  const context = [
    intervention.tit,
    intervention.type_intervention || intervention.subtitle,
    intervention.stat,
    intervention.technicien || intervention.geotechnicien,
  ].filter(Boolean).join(' · ')
  if (programme && context) return context
  if (programme) return ''
  return context
}

export function interventionMarkerTitle(intervention) {
  const statLabel = intervention.raw_stat || intervention.statut || intervention.stat || ''
  const programme = interventionProgrammeLine(intervention)
  return [
    intervention.ref,
    intervention.tit,
    intervention.type_intervention ? `Type : ${intervention.type_intervention}` : '',
    statLabel ? `Statut : ${statLabel}` : '',
    intervention.technicien ? `Technicien : ${intervention.technicien}` : '',
    intervention.geotechnicien ? `Géotechnicien : ${intervention.geotechnicien}` : '',
    programme ? `À faire : ${programme}` : '',
    intervention.start ? `Début : ${fmtShort(intervention.start)}` : '',
    intervention.ech ? `Fin : ${fmtShort(intervention.ech)}` : '',
    intervention.date_envoi ? `Envoi : ${fmtShort(intervention.date_envoi)}` : '',
  ].filter(Boolean).join('\n')
}

function interventionItemFromNav(intervention, demandeUid, planningByUid) {
  const planningItem = planningByUid.get(String(intervention.uid))
  const technicien = intervention.technicien || planningItem?.technicien || ''
  const geotechnicien = intervention.geotechnicien || planningItem?.geotechnicien || ''
  const typeIntervention = intervention.type_intervention || planningItem?.type_intervention || ''
  const demandeScope = Boolean(intervention.is_demande_scope)
    || (isNoteTechniqueIntervention(intervention) && !intervention.campagne_id)
  const base = planningItem || normalizePlanningItem({
    uid: intervention.uid,
    kind: 'intervention',
    kind_label: demandeScope ? 'Note technique' : 'Intervention',
    ref: intervention.reference || `Intervention #${intervention.uid}`,
    tit: intervention.sujet || typeIntervention || '',
    subtitle: [typeIntervention, technicien || geotechnicien].filter(Boolean).join(' · '),
    stat: intervention.statut || 'Planifie',
    start: intervention.date_intervention || '',
    ech: '',
    route: demandeScope
      ? buildG3NotesTechniquesPath({ demandeUid, interventionUid: intervention.uid })
      : `/interventions/${intervention.uid}`,
    open_label: demandeScope ? 'Ouvrir dans G3' : 'Ouvrir l\'intervention',
    source_demande_id: demandeUid,
    editable_start: !demandeScope,
    editable_ech: false,
    editable_stat: !demandeScope,
  })
  const start = base.start || intervention.date_intervention || ''
  const ech = demandeScope
    ? (intervention.date_fin || base.ech || intervention.date_envoi || itemDateEnvoi(base) || '')
    : (base.ech || intervention.date_fin || '')
  return {
    ...base,
    is_demande_scope: demandeScope,
    kind_label: demandeScope ? 'Note technique' : (base.kind_label || 'Intervention'),
    route: demandeScope
      ? buildG3NotesTechniquesPath({ demandeUid, interventionUid: intervention.uid })
      : base.route,
    open_label: demandeScope ? 'Ouvrir dans G3' : (base.open_label || 'Ouvrir l\'intervention'),
    editable_start: demandeScope ? false : base.editable_start,
    editable_ech: demandeScope ? false : base.editable_ech,
    editable_stat: demandeScope ? false : base.editable_stat,
    type_intervention: typeIntervention || base.type_intervention || '',
    technicien: technicien || base.technicien || '',
    geotechnicien: geotechnicien || base.geotechnicien || '',
    date_envoi: intervention.date_envoi || base.date_envoi || '',
    programme_terrain: planningItem?.programme_terrain || base.programme_terrain || '',
    start,
    ech,
    urg: urgencyFromEch(ech || start),
  }
}

function itemDateEnvoi(item) {
  return String(item?.date_envoi || '').slice(0, 10)
}

export function buildPreparationAgendaRows(campaigns = [], items = [], demandeUid = '') {
  const planningByUid = new Map(
    (items || [])
      .filter((item) => item.kind === 'campagne')
      .map((item) => [String(item.uid), item]),
  )
  const interventionPlanningByUid = new Map(
    (items || [])
      .filter((item) => item.kind === 'intervention')
      .map((item) => [String(item.uid), item]),
  )
  const rows = []
  const shownInterventionUids = new Set()

  for (const campaign of campaigns || []) {
    const planningItem = planningByUid.get(String(campaign.uid))
    const base = planningItem || campagneItemFromNav(campaign, demandeUid)
    const interventions = (campaign.interventions || []).map((intervention) => {
      shownInterventionUids.add(String(intervention.uid))
      return interventionItemFromNav(intervention, demandeUid, interventionPlanningByUid)
    })
    rows.push({
      key: `campagne-row:${campaign.uid}`,
      campagneUid: campaign.uid,
      interventionCount: interventions.length,
      campaignLabel: campaign.label || campaign.code || campaign.designation || '',
      campagne: {
        ...base,
        start: base.start || campaign.date_debut_prevue || '',
        ech: base.ech || campaign.date_fin_prevue || '',
      },
      interventions,
    })
  }

  const demandeScopeInterventions = []
  const otherOrphans = []
  for (const item of items || []) {
    if (item.kind !== 'intervention') continue
    if (String(item.source_demande_id) !== String(demandeUid)) continue
    if (shownInterventionUids.has(String(item.uid))) continue
    const mapped = isNoteTechniqueIntervention(item)
      ? interventionItemFromNav({
        uid: item.uid,
        reference: item.ref,
        sujet: item.tit,
        type_intervention: item.type_intervention || 'Note technique',
        statut: item.raw_stat || item.stat,
        date_intervention: item.start,
        date_fin: item.ech,
        date_envoi: item.date_envoi,
        is_demande_scope: true,
        technicien: item.technicien,
        geotechnicien: item.geotechnicien,
      }, demandeUid, interventionPlanningByUid)
      : {
        ...item,
        start: item.start || '',
        ech: item.ech || '',
        urg: urgencyFromEch(item.ech || item.start),
      }
    if (isNoteTechniqueIntervention(mapped)) {
      demandeScopeInterventions.push(mapped)
    } else {
      otherOrphans.push(mapped)
    }
  }

  if (demandeScopeInterventions.length) {
    rows.unshift({
      key: 'campagne-row:demande-notes',
      campagneUid: null,
      interventionCount: demandeScopeInterventions.length,
      campaignLabel: 'Note technique',
      isDemandeScopeGroup: true,
      campagne: normalizePlanningItem({
        uid: 0,
        kind: 'campagne',
        kind_label: 'Demande',
        ref: 'Demande',
        tit: 'Notes techniques',
        stat: 'Planifie',
        start: '',
        ech: '',
        route: buildG3NotesTechniquesPath({ demandeUid }),
        open_label: 'Portefeuille G3',
        source_demande_id: demandeUid,
      }),
      interventions: demandeScopeInterventions,
    })
  }

  if (otherOrphans.length) {
    if (rows.length === 1) {
      rows[0].interventions = [...(rows[0].interventions || []), ...otherOrphans]
      rows[0].interventionCount = rows[0].interventions.length
    } else {
      rows.push({
        key: 'campagne-row:orphans',
        campagneUid: null,
        interventionCount: otherOrphans.length,
        campaignLabel: 'Interventions',
        isOrphanGroup: true,
        campagne: normalizePlanningItem({
          uid: 0,
          kind: 'campagne',
          kind_label: 'Campagne',
          ref: 'Interventions',
          tit: 'Sans campagne',
          stat: 'A planifier',
          start: '',
          ech: '',
          route: '',
          open_label: '',
          source_demande_id: demandeUid,
          editable_start: false,
          editable_ech: false,
          editable_stat: false,
        }),
        interventions: otherOrphans,
      })
    }
  }

  return rows
}

export function buildCampagneAgendaRows(campaigns = [], items = [], demandeUid = '') {
  return buildPreparationAgendaRows(campaigns, items, demandeUid)
}

export function resolveCampagnePlanningStartDate(campaigns = [], fallback = '') {
  const dates = []
  for (const campaign of campaigns || []) {
    const start = String(campaign.date_debut_prevue || '').slice(0, 10)
    if (start) dates.push(start)
    for (const intervention of campaign.interventions || []) {
      const interventionDate = String(intervention.date_intervention || '').slice(0, 10)
      if (interventionDate) dates.push(interventionDate)
    }
  }
  dates.sort()
  return dates[0] || String(fallback || '').slice(0, 10)
}

export function resolvePlanningTimelineStartDate({
  campaigns = [],
  affaireOpeningDate = '',
  passationDate = '',
  demandeDate = '',
  debutTravauxDate = '',
  fallback = '',
} = {}) {
  const dates = [
    affaireOpeningDate,
    passationDate,
    demandeDate,
    debutTravauxDate,
    resolveCampagnePlanningStartDate(campaigns, ''),
    fallback,
  ]
    .map((value) => String(value || '').slice(0, 10))
    .filter(Boolean)
    .sort()
  return dates[0] || ''
}

export function interventionOverlapsWeek(intervention, wsStr, weStr) {
  const start = String(intervention?.start || '').slice(0, 10)
  const end = String(intervention?.ech || intervention?.date_fin || start || '').slice(0, 10)
  if (!start && !end) return false
  const effectiveStart = start || end
  const effectiveEnd = end || start
  return effectiveEnd >= wsStr && effectiveStart <= weStr
}

export function interventionWeekMarker(intervention, wsStr, weStr) {
  if (isNoteTechniqueIntervention(intervention)) {
    const start = String(intervention.start || '').slice(0, 10)
    const end = String(intervention.ech || intervention.date_fin || start || '').slice(0, 10)
    if (!start && !end) return null
    const effectiveStart = start || end
    const effectiveEnd = end || start
    if (effectiveEnd < wsStr || effectiveStart > weStr) return null
    return {
      key: 'range',
      dateStart: effectiveStart,
      dateEnd: effectiveEnd,
      isRange: true,
      date: effectiveStart,
      label: intervention.ref || 'Note technique',
      meta: interventionMarkerMeta(intervention),
      programme: interventionProgrammeLine(intervention),
      title: interventionMarkerTitle(intervention),
      layer: 'intervention-nt',
    }
  }
  const date = String(intervention?.start || '').slice(0, 10)
  if (!date || date < wsStr || date > weStr) return null
  return {
    key: 'date',
    date,
    label: intervention.ref || 'Intervention',
    meta: interventionMarkerMeta(intervention),
    programme: interventionProgrammeLine(intervention),
    title: interventionMarkerTitle(intervention),
    layer: 'intervention',
  }
}

export function interventionWeekMarkers(interventions = [], wsStr, weStr) {
  const sorted = [...(interventions || [])].sort((a, b) => {
    const aNt = isNoteTechniqueIntervention(a) ? 1 : 0
    const bNt = isNoteTechniqueIntervention(b) ? 1 : 0
    if (aNt !== bNt) return aNt - bNt
    return String(a.ref || '').localeCompare(String(b.ref || ''), 'fr')
  })
  let terrainStack = 0
  const markers = sorted
    .map((intervention) => {
      const marker = interventionWeekMarker(intervention, wsStr, weStr)
      if (!marker) return null
      const stackIndex = marker.layer === 'intervention' ? terrainStack++ : 0
      return {
        ...marker,
        key: `intervention-${intervention.uid}`,
        intervention,
        stackIndex,
      }
    })
    .filter(Boolean)
  const terrainCount = markers.filter((marker) => marker.layer === 'intervention').length
  return markers.map((marker) => (
    marker.layer === 'intervention-nt'
      ? { ...marker, terrainStackCount: terrainCount }
      : marker
  ))
}

export function campagneRowOverlapsWeek(campagne, interventions = [], wsStr, weStr) {
  if (campagneOverlapsWeek(campagne, wsStr, weStr)) return true
  return (interventions || []).some((item) => interventionOverlapsWeek(item, wsStr, weStr))
}

const COMFORTABLE_CELL_PAD = 8
const COMFORTABLE_CARD_GAP = 6
const COMFORTABLE_CARD_MIN = 56
const COMFORTABLE_DOSSIER_ROW = 24
const COMFORTABLE_INTERVENTION_CARD = 76
const COMFORTABLE_NT_CARD = 92
const COMFORTABLE_CAMPAGNE_CARD = 28
const COMFORTABLE_DOSSIER_CHIP = 28

function comfortableMarkerHeight(marker) {
  if (marker?.layer === 'intervention-nt') return COMFORTABLE_NT_CARD
  if (marker?.layer === 'intervention') return COMFORTABLE_INTERVENTION_CARD
  return COMFORTABLE_CAMPAGNE_CARD
}

export function comfortableMarkerStackHeight(markers = []) {
  if (!markers.length) return COMFORTABLE_CARD_MIN
  return markers.reduce((sum, marker, index) => (
    sum + comfortableMarkerHeight(marker) + (index > 0 ? COMFORTABLE_CARD_GAP : 0)
  ), 0)
}

export function campagneAgendaRowHeight(
  interventions = [],
  dossierLayerCount = 0,
  comfortable = false,
  timelineMarkerCount = 0,
  timelineMarkers = [],
) {
  const hasNt = (interventions || []).some(isNoteTechniqueIntervention)
  const interventionCount = (interventions || []).length
  const hasDossierTimeline = dossierLayerCount > 0

  if (!comfortable) {
    if (hasDossierTimeline && hasNt) return 150
    if (hasDossierTimeline && interventionCount > 1) return 140
    if (hasDossierTimeline) return 130
    if (hasNt || interventionCount > 1) return 88
    return 72
  }

  const dossierBand = dossierLayerCount > 0
    ? dossierLayerCount * COMFORTABLE_DOSSIER_ROW + COMFORTABLE_CARD_GAP
    : 0
  const markerCount = Math.max(timelineMarkerCount, timelineMarkers.length, 0)
  const stackHeight = timelineMarkers.length > 0
    ? comfortableMarkerStackHeight(timelineMarkers)
    : (markerCount > 0
      ? (markerCount * COMFORTABLE_INTERVENTION_CARD) + ((markerCount - 1) * COMFORTABLE_CARD_GAP)
      : COMFORTABLE_CARD_MIN)

  return COMFORTABLE_CELL_PAD + dossierBand + stackHeight + COMFORTABLE_CELL_PAD
}

export function campagneMarkerTop(marker, { dossierLayerCount = 0, stackIndex = 0, comfortable = false } = {}) {
  const hasDossierTimeline = dossierLayerCount > 0
  const dossierBand = comfortable
    ? (dossierLayerCount * COMFORTABLE_DOSSIER_ROW) + COMFORTABLE_CARD_GAP
    : dossierLayerCount * 20

  if (!comfortable) {
    if (marker.layer === 'campagne-debut') return hasDossierTimeline ? 88 : 8
    if (marker.layer === 'campagne-fin') return hasDossierTimeline ? 106 : 28
    if (marker.layer === 'intervention-nt') return hasDossierTimeline ? 112 : 40
    if (marker.layer === 'intervention') {
      const base = hasDossierTimeline ? 88 : 8
      return base + stackIndex * 22
    }
    return hasDossierTimeline ? 88 : 8
  }

  const base = COMFORTABLE_CELL_PAD + dossierBand
  if (marker.layer === 'campagne-debut') return base
  if (marker.layer === 'campagne-fin') return base + 24
  if (marker.layer === 'intervention-nt') {
    return base + (marker.terrainStackCount || 0) * (COMFORTABLE_CARD_MIN + COMFORTABLE_CARD_GAP)
  }
  if (marker.layer === 'intervention') {
    return base + stackIndex * (COMFORTABLE_CARD_MIN + COMFORTABLE_CARD_GAP)
  }
  return base
}

export function comfortableAgendaCellHeight(dossierCount = 0, markers = []) {
  const pad = COMFORTABLE_CELL_PAD
  const gap = COMFORTABLE_CARD_GAP
  const dossierHeight = dossierCount > 0
    ? (dossierCount * COMFORTABLE_DOSSIER_CHIP) + ((dossierCount - 1) * gap)
    : 0
  const markerHeight = markers.length > 0
    ? markers.reduce((sum, marker, index) => (
      sum + comfortableMarkerHeight(marker) + (index > 0 ? gap : 0)
    ), 0)
    : 0
  const bridge = dossierHeight > 0 && markerHeight > 0 ? gap : 0
  if (!dossierHeight && !markerHeight) return COMFORTABLE_CARD_MIN + (pad * 2)
  return pad + dossierHeight + bridge + markerHeight + pad
}

export function groupAgendaDayCells(
  dossierLayers,
  timelineMarkers,
  ws,
  wsStr,
  weStr,
  dayCount,
  visibleDateBarFn,
  agendaBarColumnsFn,
) {
  const cells = new Map()

  for (const layer of dossierLayers || []) {
    if (!layer?.bar) continue
    const { colS, colE } = agendaBarColumnsFn(layer.bar, ws, dayCount)
    const key = `${colS}-${colE}`
    if (!cells.has(key)) cells.set(key, { colS, colE, dossier: [], markers: [] })
    cells.get(key).dossier.push(layer)
  }

  for (const marker of timelineMarkers || []) {
    const bar = marker.isRange
      ? visibleDateBarFn(marker.dateStart, marker.dateEnd, wsStr, weStr)
      : visibleDateBarFn(marker.date, marker.date, wsStr, weStr)
    if (!bar) continue
    const { colS, colE } = agendaBarColumnsFn(bar, ws, dayCount)
    const key = `${colS}-${colE}`
    if (!cells.has(key)) cells.set(key, { colS, colE, dossier: [], markers: [] })
    cells.get(key).markers.push({ marker, bar })
  }

  return [...cells.values()].map((cell) => ({
    ...cell,
    dossier: [...cell.dossier].sort((a, b) => {
      const order = ['passation', 'demande', 'affaire', 'debutTravaux']
      return order.indexOf(a.key) - order.indexOf(b.key)
    }),
  }))
}

export function groupAgendaTimelineMarkers(timelineMarkers, ws, wsStr, weStr, dayCount, visibleDateBarFn, agendaBarColumnsFn) {
  return groupAgendaDayCells([], timelineMarkers, ws, wsStr, weStr, dayCount, visibleDateBarFn, agendaBarColumnsFn)
    .filter((cell) => cell.markers.length > 0)
    .map(({ colS, colE, markers }) => ({ colS, colE, entries: markers }))
}

export function campagneOverlapsWeek(campagne, wsStr, weStr) {
  const start = campagne?.start || ''
  const end = campagne?.ech || ''
  if (!start && !end) return false
  return (start && start >= wsStr && start <= weStr)
    || (end && end >= wsStr && end <= weStr)
}

export function campagneWeekMarkers(campagne, wsStr, weStr) {
  const markers = []
  if (campagne?.start && campagne.start >= wsStr && campagne.start <= weStr) {
    markers.push({ key: 'debut', date: campagne.start, label: 'Début', layer: 'campagne-debut' })
  }
  if (campagne?.ech && campagne.ech >= wsStr && campagne.ech <= weStr) {
    markers.push({ key: 'fin', date: campagne.ech, label: 'Fin', layer: 'campagne-fin' })
  }
  return markers
}

export const AGENDA_WORK_DAYS = 5

export function affaireWeekDays(originIso, weekOffset = 0, endIso = '') {
  const origin = parseDate(originIso)
  if (!origin) return []
  const weekMonday = weekStart(origin)
  const start = addDays(weekMonday, weekOffset * 7)
  const days = Array.from({ length: AGENDA_WORK_DAYS }, (_, index) => addDays(start, index))
  if (!endIso) return days
  const end = parseDate(endIso)
  if (!end) return days
  return days.filter((day) => day <= end)
}

export function affaireWeekOffsetForDate(originIso, targetIso, endIso = '') {
  const origin = parseDate(originIso)
  const target = parseDate(targetIso)
  if (!origin || !target) return 0
  const originMonday = weekStart(origin)
  const targetMonday = weekStart(target)
  const diffDays = Math.round((targetMonday - originMonday) / 86400000)
  let offset = Math.max(0, Math.floor(diffDays / 7))
  while (offset > 0 && affaireWeekDays(originIso, offset, endIso).length === 0) {
    offset -= 1
  }
  return offset
}

export function resolvePlanningFocusDate({
  campaigns = [],
  timelineOrigin = '',
  affaireOpeningDate = '',
  endDate = '',
} = {}) {
  const campaignStart = resolveCampagnePlanningStartDate(campaigns, affaireOpeningDate)
  if (campaignStart) return campaignStart
  const today = dateStr(new Date())
  const origin = String(timelineOrigin || '').slice(0, 10)
  const end = String(endDate || '').slice(0, 10)
  if (origin && today >= origin && (!end || today <= end)) return today
  return origin || today
}

export function affaireWeekPeriodLabel(originIso, weekOffset, days = []) {
  if (!days.length) return 'Hors période affaire'
  const startDay = days[0].getDate()
  const endDay = days[days.length - 1].getDate()
  const startMonth = MS[days[0].getMonth()]
  const endMonth = MS[days[days.length - 1].getMonth()]
  const year = days[days.length - 1].getFullYear()
  const range = startMonth === endMonth
    ? `${startDay}–${endDay} ${startMonth} ${year}`
    : `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`
  return `Sem. ${weekOffset + 1} depuis ouverture affaire · ${range}`
}

export function canAdvanceAffaireWeek(originIso, weekOffset, endIso = '') {
  const nextDays = affaireWeekDays(originIso, weekOffset + 1, endIso)
  return nextDays.length > 0
}

export function normalizeTechnicienKey(value) {
  return String(value || '').trim().toLowerCase()
}

export function resolveInterventionTechnicienLabel(intervention) {
  return String(intervention?.technicien || intervention?.geotechnicien || '').trim()
}

export function isTerrainPlanningIntervention(intervention) {
  if (!intervention) return false
  if (intervention.is_demande_scope) return false
  if (isNoteTechniqueIntervention(intervention)) return false
  return true
}

export function resolvePlanningItemMissionJournee(item) {
  if (!item || item.kind !== 'intervention') return null
  if (!isTerrainPlanningIntervention(item)) return null
  const demandeUid = String(item.source_demande_id || '').trim()
  if (!demandeUid) return null
  const missionDate = String(item.start || '').slice(0, 10)
  if (!missionDate) return null
  const technicienLabel = resolveInterventionTechnicienLabel(item) || 'Sans technicien'
  return {
    demandeUid,
    missionDate,
    technicien: technicienLabel === 'Sans technicien' ? '' : technicienLabel,
    technicienLabel,
  }
}

export function analyserPlanningChipContent(item) {
  if (!item) {
    return { ref: '', lines: [], badge: missionFeuilleStatusMeta('none') }
  }
  const technicien = resolveInterventionTechnicienLabel(item)
  if (item.kind === 'intervention') {
    const lines = [
      [item.type_intervention, technicien || 'Sans technicien'].filter(Boolean).join(' · '),
      item.programme_terrain ? `À faire · ${item.programme_terrain}` : '',
      item.affaire_ref ? `Affaire ${item.affaire_ref}` : '',
      item.stat ? `Statut · ${item.stat}` : '',
    ].filter(Boolean)
    return {
      ref: item.ref,
      lines,
      badge: missionFeuilleStatusMeta(item.mission_feuille_status),
    }
  }
  return {
    ref: item.ref,
    lines: [
      item.kind_label,
      item.tit,
      item.subtitle,
      item.stat ? `Statut · ${item.stat}` : '',
    ].filter(Boolean).slice(0, 3),
    badge: null,
  }
}

export function collectPlanningJourneesFromRows(rows = [], wsStr, weStr) {
  const map = new Map()
  for (const row of rows || []) {
    for (const intervention of row.interventions || []) {
      if (!isTerrainPlanningIntervention(intervention)) continue
      const date = String(intervention.start || '').slice(0, 10)
      if (!date || date < wsStr || date > weStr) continue
      const technicienLabel = resolveInterventionTechnicienLabel(intervention) || 'Sans technicien'
      const key = `${date}::${normalizeTechnicienKey(technicienLabel)}`
      if (!map.has(key)) {
        map.set(key, {
          key,
          date,
          technicien: technicienLabel === 'Sans technicien' ? '' : technicienLabel,
          technicienLabel,
          interventions: [],
          interventionUids: [],
        })
      }
      const group = map.get(key)
      group.interventions.push(intervention)
      group.interventionUids.push(String(intervention.uid))
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => a.date.localeCompare(b.date) || a.technicienLabel.localeCompare(b.technicienLabel, 'fr'),
  )
}
