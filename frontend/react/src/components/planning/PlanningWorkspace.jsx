import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2 } from 'lucide-react'
import {
  ACTIVE,
  ARCHIVED,
  AGENDA_DEFAULT_DATA_ROW_HEIGHT,
  AGENDA_HEADER_ROW_HEIGHT,
  AGENDA_LABEL_COL_WIDTH,
  D7,
  MS,
  STATUS_META,
  addDays,
  agendaItemsFromPlanning,
  affaireWeekDays,
  affaireWeekOffsetForDate,
  affaireWeekPeriodLabel,
  AGENDA_WORK_DAYS,
  buildPreparationAgendaRows,
  canAdvanceAffaireWeek,
  campagneAgendaRowHeight,
  campagneMarkerTop,
  campagneRowOverlapsWeek,
  campagneWeekMarkers,
  comfortableAgendaCellHeight,
  groupAgendaDayCells,
  interventionMarkerMeta,
  interventionMarkerTitle,
  interventionWeekMarkers,
  collectPlanningJourneesFromRows,
  colorClass,
  dateStr,
  fmtShort,
  itemBorderColor,
  itemColor,
  monthHeatmap,
  planningAffaireRefLabel,
  planningDistanceCaption,
  parseDate,
  shiftCalendarMonth,
  weekStart,
} from '@/lib/planningShared'
import SiteAccessRapportButton from '@/components/site/SiteAccessRapportButton'
import { MISSION_JOURNEE_BUTTON_LABEL } from '@/lib/siteAccessRapport'
import PlanningItemPopupActions from '@/components/planning/PlanningItemPopupActions'
import '@/pages/planning.css'

function Sidebar({ data, calYear, calMonth, calSel, onCalSelect, onPrevMonth, onNextMonth, note }) {
  const { counts, urgency } = monthHeatmap(data, calYear, calMonth)
  const first = new Date(calYear, calMonth, 1)
  const last = new Date(calYear, calMonth + 1, 0).getDate()
  const off = (first.getDay() + 6) % 7
  const late = data.filter((d) => d.urg === 'late').length
  const soon = data.filter((d) => d.urg === 'soon').length
  const ok = data.filter((d) => d.urg === 'ok').length

  return (
    <div className="lsb">
      <div>
        <div className="lsb-hdr">
          <button type="button" className="lsb-nb" onClick={onPrevMonth}>‹</button>
          <div className="lsb-title">{MS[calMonth]} {calYear}</div>
          <button type="button" className="lsb-nb" onClick={onNextMonth}>›</button>
          {calSel != null ? <button type="button" className="lsb-clr" onClick={() => onCalSelect(null)}>✕</button> : null}
        </div>
        <div className="hmg">
          {D7.map((d, idx) => <div key={`h-${idx}`} className="hmdh">{d}</div>)}
          {Array.from({ length: off }).map((_, idx) => <div key={`e1-${idx}`} className="hmd hme" />)}
          {Array.from({ length: last }, (_, idx) => idx + 1).map((day) => {
            const today = new Date()
            const isToday = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear
            const n = counts[day] || 0
            const u = urgency[day]
            return (
              <button
                key={day}
                type="button"
                className={`hmd ${colorClass(n, u)}${calSel === day ? ' sel' : ''}`}
                onClick={() => onCalSelect(calSel === day ? null : day)}
              >
                {isToday ? <div className="todayr" /> : null}
                <div className="hmdn">{day}</div>
                {n > 0 ? <div className="hmdn2">{n}</div> : null}
              </button>
            )
          })}
          {Array.from({ length: (7 - ((off + last) % 7)) % 7 }).map((_, idx) => <div key={`e2-${idx}`} className="hmd hme" />)}
        </div>
      </div>
      <div className="lsb-div" />
      <div className="lsb-sg">
        <div className="lsb-stat"><div className="lsb-sn danger">{late}</div><div className="lsb-sl">Retard</div></div>
        <div className="lsb-stat"><div className="lsb-sn warn">{soon}</div><div className="lsb-sl">Urgent</div></div>
        <div className="lsb-stat"><div className="lsb-sn ok">{ok}</div><div className="lsb-sl">En cours</div></div>
        <div className="lsb-stat"><div className="lsb-sn nge">{data.length}</div><div className="lsb-sl">Total</div></div>
      </div>
      <div className="lsb-div" />
      <div className="lsb-sec">Par statut</div>
      {Object.keys(STATUS_META).map((s) => (
        <div key={s} className="lsb-row">
          <div className="lsb-rdot" style={{ background: STATUS_META[s].dot }} />
          <div className="lsb-rname">{s}</div>
          <div className="lsb-rn">{data.filter((d) => d.stat === s).length}</div>
        </div>
      ))}
      {note ? <><div className="lsb-div" /><div className="lsb-note">{note}</div></> : null}
    </div>
  )
}

function Popup({ item, anchor, onClose, onSave, onOpenItem, onOpenPreparation, datesOnly = false }) {
  const [start, setStart] = useState(item?.start || '')
  const [ech, setEch] = useState(item?.ech || '')

  useEffect(() => {
    setStart(item?.start || '')
    setEch(item?.ech || '')
  }, [item])

  if (!item) return null

  const style = anchor ? {
    top: `${Math.min(window.innerHeight - 290, anchor.bottom + 6)}px`,
    left: `${Math.min(window.innerWidth - 310, anchor.left)}px`,
  } : undefined

  return createPortal(
    <div className="item-popup open" style={style}>
      <div className="ip-hdr">
        <div className="ip-ref">{item.kind_label} · {item.ref}</div>
        {!datesOnly ? (
          <div className="ip-stat" style={{ background: STATUS_META[item.stat]?.bg, color: STATUS_META[item.stat]?.fg }}>{item.stat}</div>
        ) : null}
        <button type="button" className="ip-close" onClick={onClose}>×</button>
      </div>
      {!datesOnly ? <div className="ip-tit">{item.tit}</div> : null}
      {item.subtitle ? <div className="ip-sub">{item.subtitle}</div> : null}
      {planningDistanceCaption(item) ? (
        <div className="ip-sub">{planningDistanceCaption(item)}</div>
      ) : null}
      {item.programme_terrain ? (
        <div className="ip-sub ip-prog">À faire · {item.programme_terrain}</div>
      ) : null}
      {item.wbs ? <div className="ip-sub ip-wbs">WBS: {item.wbs}</div> : null}
      {item.editable_start ? (
        <div className="ip-row">
          <div className="ip-lbl">{item.editable_ech ? 'Début' : 'Date'}</div>
          <input className="ip-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
      ) : null}
      {item.editable_ech ? (
        <div className="ip-row">
          <div className="ip-lbl">Échéance / fin</div>
          <input className="ip-input" type="date" value={ech} onChange={(e) => setEch(e.target.value)} />
        </div>
      ) : null}
      {item.is_demande_scope ? (
        <div className="ip-sub" style={{ marginBottom: 8 }}>
          Document G3 — visible sur le planning, rédigé dans l&apos;espace G3.
        </div>
      ) : null}
      <PlanningItemPopupActions item={item} onOpenPreparation={onOpenPreparation} />
      <div className="ip-btns">
        <button type="button" className="ip-btn" onClick={onClose}>Fermer</button>
        <button type="button" className="ip-btn link" onClick={onOpenItem}>{item.open_label || 'Ouvrir'}</button>
        {(item.editable_start || item.editable_ech) ? (
          <button type="button" className="ip-btn primary" onClick={() => onSave(item, { start, ech }, true)}>Enregistrer</button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function OrganiserView({
  data, calYear, calMonth, calSel, onCalSelect, onPrevMonth, onNextMonth,
  popupOpen, onPopupOpen, onPopupClose, onPopupSave, onOpenItem,
}) {
  const [dragUid, setDragUid] = useState(null)
  const [archivesOpen, setArchivesOpen] = useState(false)
  const activeData = useMemo(() => data.filter((d) => ACTIVE.includes(d.stat)), [data])
  const archivedData = useMemo(() => data.filter((d) => ARCHIVED.includes(d.stat)), [data])

  return (
    <div className="view-body">
      <Sidebar
        data={activeData}
        calYear={calYear}
        calMonth={calMonth}
        calSel={calSel}
        onCalSelect={onCalSelect}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        note={calSel ? `${calSel} ${MS[calMonth]} · surlignage dans les colonnes` : 'Cliquer un jour pour filtrer'}
      />
      <div className="t1-shell">
        <div className="t1-board">
          {ACTIVE.map((status) => {
            const cards = activeData.filter((d) => d.stat === status)
            const matched = calSel ? new Set(cards.filter((d) => {
              const target = parseDate(d.ech || d.start)
              return target?.getDate() === calSel && target?.getMonth() === calMonth && target?.getFullYear() === calYear
            }).map((d) => d.uid)) : new Set()
            return (
              <div
                key={status}
                className="t1-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={async () => {
                  if (!dragUid) return
                  await onPopupSave(dragUid, { stat: status }, false)
                  setDragUid(null)
                }}
              >
                <div className="t1-chdr">
                  <div className="t1-cdot" style={{ background: STATUS_META[status].dot }} />
                  <span className="t1-cname">{status}</span>
                  <span className={`t1-ccnt${calSel && matched.size ? ' m' : ''}`}>{calSel ? `${matched.size}/${cards.length}` : cards.length}</span>
                </div>
                <div className="t1-cbody">
                  {cards.map((item) => {
                    const isMatch = matched.has(item.uid)
                    const dim = calSel && !isMatch
                    const isPopup = popupOpen?.key === item.key
                    return (
                      <div
                        key={item.key}
                        className={`t1-card${isMatch ? ' match' : ''}${dim ? ' dim' : ''}`}
                        style={{ borderLeftColor: itemBorderColor(item), cursor: item.editable_stat ? 'grab' : 'pointer' }}
                        draggable={item.editable_stat}
                        onDragStart={() => item.editable_stat && setDragUid(item)}
                        onDragEnd={() => setDragUid(null)}
                        onClick={(e) => onPopupOpen(item, e.currentTarget.getBoundingClientRect())}
                      >
                        <div className="t1-cref">{item.ref}{item.ech ? ` · ${fmtShort(item.ech)}` : item.start ? ` · ${fmtShort(item.start)}` : ''}</div>
                        <div className="t1-ctit">{item.tit}</div>
                        <div className="t1-cft">
                          <span className="bd neutral">{item.kind_label}</span>
                          {item.urg === 'late' ? <span className="bd br">Ret.</span> : null}
                          {item.urg === 'soon' ? <span className="bd by">Urg.</span> : null}
                        </div>
                        {item.subtitle ? <div className="t1-csub">{item.subtitle}</div> : null}
                        {planningDistanceCaption(item) ? (
                          <div className="t1-csub t1-cdist">{planningDistanceCaption(item)}</div>
                        ) : null}
                        {item.programme_terrain ? (
                          <div className="t1-cprog">À faire · {item.programme_terrain}</div>
                        ) : null}
                        {isPopup ? <Popup item={item} anchor={popupOpen.anchor} onClose={onPopupClose} onSave={onPopupSave} onOpenItem={() => onOpenItem(item)} /> : null}
                      </div>
                    )
                  })}
                  {!cards.length ? <div className="t1-empty-drop">Déposer ici</div> : null}
                </div>
              </div>
            )
          })}
        </div>
        <div className="t1-archives-wrap">
          <button type="button" className="t1-archives-toggle" onClick={() => setArchivesOpen((v) => !v)}>
            {archivesOpen ? '▴' : '▾'} Archives {archivedData.length > 0 ? `(${archivedData.length})` : ''}
          </button>
          {archivesOpen ? (
            <div className="t1-archives-grid">
              {ARCHIVED.map((status) => {
                const cards = archivedData.filter((d) => d.stat === status)
                return (
                  <div
                    key={status}
                    className="t1-arch-col"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async () => {
                      if (!dragUid) return
                      await onPopupSave(dragUid, { stat: status }, false)
                      setDragUid(null)
                    }}
                  >
                    <div className="t1-chdr">
                      <div className="t1-cdot" style={{ background: STATUS_META[status].dot }} />
                      <span className="t1-cname">{status}</span>
                      <span className="t1-ccnt">{cards.length}</span>
                    </div>
                    <div className="t1-cbody mini">
                      {cards.map((item) => (
                        <div
                          key={item.key}
                          className="t1-card compact"
                          style={{ borderLeftColor: itemBorderColor(item), cursor: item.editable_stat ? 'grab' : 'pointer' }}
                          draggable={item.editable_stat}
                          onDragStart={() => item.editable_stat && setDragUid(item)}
                          onDragEnd={() => setDragUid(null)}
                          onClick={(e) => onPopupOpen(item, e.currentTarget.getBoundingClientRect())}
                        >
                          <div className="t1-cref">{item.ref}</div>
                          <div className="t1-ctit">{item.tit}</div>
                          <div className="t1-csub">{item.kind_label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function visibleDateBar(startIso, endIso, wsStr, weStr, { openEnd = false } = {}) {
  if (!startIso) return null
  const rangeEnd = endIso || (openEnd ? weStr : startIso)
  if (rangeEnd < wsStr || startIso > weStr) return null
  const visibleStart = startIso > wsStr ? startIso : wsStr
  const visibleEnd = rangeEnd < weStr ? rangeEnd : weStr
  return {
    start: visibleStart,
    ech: visibleEnd,
    fullStart: startIso,
    fullEnd: endIso || '',
    isClipL: startIso < wsStr,
    isClipR: openEnd ? (!endIso || endIso > weStr) : endIso > weStr,
  }
}

function agendaBarColumns(bar, ws, dayCount) {
  const evS = parseDate(bar.start)
  const evE = parseDate(bar.ech)
  const colS = Math.min(dayCount + 1, Math.max(2, Math.round((evS - ws) / 86400000) + 2))
  const colE = Math.min(dayCount + 2, Math.max(colS + 1, Math.round((evE - ws) / 86400000) + 3))
  return { colS, colE }
}

function InterventionAgendaBarContent({ marker, label }) {
  return (
    <span className="ag-bar-intervention-content">
      <span className="ag-bar-intervention-ref">{label}</span>
      {marker.meta ? <span className="ag-bar-intervention-meta">{marker.meta}</span> : null}
      {marker.programme ? (
        <span className="ag-bar-intervention-prog">À faire · {marker.programme}</span>
      ) : null}
    </span>
  )
}

function AgendaView({
  title, emptyText, data, rows = null, showSidebar = true, agendaDatesOnly = false,
  planningStartDate = '', planningFocusDate = '', planningEndDate = '', dossierContext = null, embedded = false,
  demandeUid = '',
  calYear, calMonth, calSel, onCalSelect, onPrevMonth, onNextMonth,
  popupOpen, onPopupOpen, onPopupClose, onPopupSave, onOpenItem, onDeleteCampagne, deletingCampagneUid = null,
  onOpenPreparation,
}) {
  const campagneRows = rows
  const useCampagneRows = Array.isArray(campagneRows)
  const useAffaireTimeline = Boolean(planningStartDate)
  const comfortable = embedded && agendaDatesOnly
  const labelColWidth = comfortable ? 320 : (showSidebar ? AGENDA_LABEL_COL_WIDTH : 260)
  const headerRowHeight = comfortable ? 56 : AGENDA_HEADER_ROW_HEIGHT
  const [refDate, setRefDate] = useState(() => new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const dragRef = useRef(null)
  const gridRef = useRef(null)
  const forceWeekFromSelection = useRef(false)
  const defaultWeekOffset = useMemo(
    () => affaireWeekOffsetForDate(
      planningStartDate,
      planningFocusDate || planningStartDate,
      planningEndDate,
    ),
    [planningStartDate, planningFocusDate, planningEndDate],
  )

  useEffect(() => {
    setWeekOffset(defaultWeekOffset)
  }, [defaultWeekOffset, planningStartDate, planningEndDate])

  useEffect(() => {
    if (!useAffaireTimeline && calSel != null && forceWeekFromSelection.current) {
      setRefDate(new Date(calYear, calMonth, calSel))
      forceWeekFromSelection.current = false
    }
  }, [useAffaireTimeline, calSel, calMonth, calYear])

  const days = useMemo(() => {
    if (useAffaireTimeline) return affaireWeekDays(planningStartDate, weekOffset, planningEndDate)
    const ws = weekStart(refDate)
    return Array.from({ length: AGENDA_WORK_DAYS }, (_, index) => addDays(ws, index))
  }, [useAffaireTimeline, planningStartDate, planningEndDate, weekOffset, refDate])

  const ws = days[0] || weekStart(refDate)
  const wsStr = days.length ? dateStr(days[0]) : dateStr(ws)
  const weStr = days.length ? dateStr(days[days.length - 1]) : dateStr(addDays(ws, AGENDA_WORK_DAYS - 1))
  const dayCount = Math.max(days.length, 1)
  const dayColTemplate = comfortable
    ? `repeat(${dayCount}, minmax(0, 1fr))`
    : `repeat(${dayCount}, minmax(90px, 1fr))`

  const displayRows = useMemo(() => {
    if (useCampagneRows) return campagneRows
    return data
      .filter((d) => d.start && d.ech && d.ech >= wsStr && d.start <= weStr)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((ev) => ({ key: ev.key, campagne: ev }))
  }, [useCampagneRows, campagneRows, data, wsStr, weStr])

  const weekNumber = useMemo(() => {
    if (useAffaireTimeline) return weekOffset + 1
    const startOfYear = new Date(ws.getFullYear(), 0, 1)
    return Math.ceil(((ws - startOfYear) / 86400000) / 7) + 1
  }, [useAffaireTimeline, weekOffset, ws])

  function handleCalSelect(day) {
    if (useAffaireTimeline) return
    forceWeekFromSelection.current = day != null
    onCalSelect(day)
  }

  function goPrevWeek() {
    if (useAffaireTimeline) {
      setWeekOffset((current) => Math.max(0, current - 1))
      return
    }
    setRefDate(addDays(refDate, -7))
  }

  function goNextWeek() {
    if (useAffaireTimeline) {
      if (canAdvanceAffaireWeek(planningStartDate, weekOffset, planningEndDate)) {
        setWeekOffset((current) => current + 1)
      }
      return
    }
    setRefDate(addDays(refDate, 7))
  }

  function goPlanningStart() {
    if (useAffaireTimeline) {
      setWeekOffset(0)
      return
    }
    setRefDate(new Date())
  }

  function findItemByKey(key) {
    const fromRows = displayRows.map((row) => row.campagne).find((item) => item.key === key)
    if (fromRows) return fromRows
    return data.find((item) => item.key === key)
  }

  function beginDrag(ev, item, mode) {
    if (mode === 'resize' && !item.editable_ech) return
    ev.preventDefault()
    ev.stopPropagation()
    const rect = gridRef.current?.getBoundingClientRect()
    const cellWidth = rect ? (rect.width - labelColWidth) / Math.max(1, dayCount) : (comfortable ? 220 : 110)
    dragRef.current = {
      key: item.key,
      mode,
      startX: ev.clientX,
      originalStart: item.start,
      originalEch: item.ech,
      cellWidth,
      lastOffset: 0,
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function onMove(ev) {
    if (!dragRef.current) return
    const state = dragRef.current
    const offset = Math.round((ev.clientX - state.startX) / Math.max(20, state.cellWidth))
    if (offset === state.lastOffset) return
    state.lastOffset = offset
  }

  async function onUp() {
    const state = dragRef.current
    dragRef.current = null
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    if (!state || state.lastOffset === 0) return
    const item = findItemByKey(state.key)
    if (!item) return
    let nextStart = state.originalStart
    let nextEch = state.originalEch
    if (state.mode === 'move') {
      nextStart = dateStr(addDays(parseDate(state.originalStart), state.lastOffset))
      nextEch = dateStr(addDays(parseDate(state.originalEch), state.lastOffset))
    } else {
      nextEch = dateStr(addDays(parseDate(state.originalEch), state.lastOffset))
      if (nextEch < nextStart) nextEch = nextStart
    }
    await onPopupSave(item, { start: nextStart, ech: nextEch }, false)
  }

  const period = useAffaireTimeline
    ? affaireWeekPeriodLabel(planningStartDate, weekOffset, days)
    : `Sem. ${weekNumber} — ${days[0]?.getDate()} ${MS[days[0]?.getMonth()]} – ${days[days.length - 1]?.getDate()} ${MS[days[days.length - 1]?.getMonth()]} ${days[days.length - 1]?.getFullYear()}`
  const canGoPrev = useAffaireTimeline ? weekOffset > 0 : true
  const canGoNext = useAffaireTimeline
    ? canAdvanceAffaireWeek(planningStartDate, weekOffset, planningEndDate)
    : true
  const sidebarData = useCampagneRows
    ? displayRows.flatMap((row) => {
      const entries = []
      if (row.campagne?.start || row.campagne?.ech) entries.push(row.campagne)
      for (const intervention of row.interventions || []) {
        if (intervention.start) entries.push(intervention)
      }
      return entries
    })
    : data
  const dossierTimelineBars = useMemo(() => {
    if (!dossierContext) return []
    return [
      {
        key: 'passation',
        layer: 'passation',
        item: dossierContext.passation,
        colors: { bg: '#f3f4f6', border: '#69758a', text: '#475569' },
      },
      {
        key: 'demande',
        layer: 'demande',
        item: dossierContext.demande,
        colors: { bg: '#eef5ff', border: '#4A7DB5', text: '#003170' },
      },
      {
        key: 'affaire',
        layer: 'affaire',
        item: dossierContext.affaire,
        colors: { bg: '#eef5ff', border: '#003170', text: '#003170' },
      },
      {
        key: 'debutTravaux',
        layer: 'travaux',
        item: dossierContext.debutTravaux,
        colors: { bg: '#fffdf2', border: '#e6b900', text: '#8a6410' },
      },
    ]
      .filter((entry) => entry.item?.reference && entry.item?.created && entry.key !== 'affaire')
      .map((entry) => {
        const created = entry.item.created
        const bar = visibleDateBar(created, created, wsStr, weStr)
        if (!bar) return null
        return {
          ...entry,
          bar,
          refLabel: entry.item.reference || entry.key,
        }
      })
      .filter(Boolean)
  }, [dossierContext, wsStr, weStr])

  const dossierLayerCount = dossierTimelineBars.length
  const rowHeights = displayRows.map((row) => {
    const campagneMarkers = campagneWeekMarkers(row.campagne, wsStr, weStr)
    const interventionMarkers = interventionWeekMarkers(row.interventions, wsStr, weStr)
    const timelineMarkers = [...campagneMarkers, ...interventionMarkers]
    if (comfortable) {
      const cells = groupAgendaDayCells(
        dossierTimelineBars,
        timelineMarkers,
        ws,
        wsStr,
        weStr,
        dayCount,
        visibleDateBar,
        agendaBarColumns,
      )
      const cellHeight = cells.length
        ? Math.max(...cells.map((cell) => comfortableAgendaCellHeight(
          cell.dossier.length,
          cell.markers.map((entry) => entry.marker),
        )))
        : 88
      return Math.max(cellHeight, 72)
    }
    return campagneAgendaRowHeight(
      row.interventions,
      dossierLayerCount,
      comfortable,
      timelineMarkers.length,
      timelineMarkers,
    )
  })
  const rowCount = Math.max(displayRows.length, 1)
  const rowHeight = rowHeights[0] || (comfortable ? 88 : AGENDA_DEFAULT_DATA_ROW_HEIGHT)
  const dataRowTemplate = rowHeights.length
    ? rowHeights.map((height) => (comfortable ? `minmax(${height}px, auto)` : `${height}px`)).join(' ')
    : (comfortable ? `minmax(${rowHeight}px, auto)` : `${rowHeight}px`)
  const gridTemplateRows = comfortable
    ? `${headerRowHeight}px ${dataRowTemplate}`
    : `${headerRowHeight}px ${dataRowTemplate} 1fr`
  const visibleBarCount = displayRows.filter((row) => (
    campagneRowOverlapsWeek(row.campagne, row.interventions, wsStr, weStr)
  )).length

  const journees = useMemo(() => {
    if (!demandeUid || !useCampagneRows) return []
    return collectPlanningJourneesFromRows(displayRows, wsStr, weStr)
  }, [demandeUid, useCampagneRows, displayRows, wsStr, weStr])

  function campagneGridRow(index) {
    return index + 2
  }

  return (
    <div className={`view-body${showSidebar ? '' : ' view-body-full'}`}>
      {showSidebar ? (
        <Sidebar
          data={sidebarData}
          calYear={calYear}
          calMonth={calMonth}
          calSel={calSel}
          onCalSelect={handleCalSelect}
          onPrevMonth={onPrevMonth}
          onNextMonth={onNextMonth}
          note="Cliquer = modifier · Glisser barre = déplacer · Handle → = étendre"
        />
      ) : null}
      <div className="ag-main">
        <div className="ag-nav">
          <div className="ag-nav-prev">
            <button type="button" className="ag-nbtn" onClick={goPrevWeek} disabled={!canGoPrev}>‹</button>
          </div>
          <div className="ag-period">
            {title} · {period}
            {useCampagneRows
              ? ` — ${displayRows.length} campagne(s), ${displayRows.reduce((sum, row) => sum + (row.interventions?.length || 0), 0)} intervention(s)`
              : ` — ${visibleBarCount} élément(s)`}
          </div>
          <div className="ag-nav-next">
            <button type="button" className="ag-nbtn" onClick={goNextWeek} disabled={!canGoNext}>›</button>
          </div>
          <button type="button" className="ag-tdb" onClick={goPlanningStart}>
            {useAffaireTimeline ? 'Début affaire' : 'Aujourd\u2019hui'}
          </button>
        </div>
        {journees.length ? (
          <div className="ag-journee-bar">
            <span className="ag-journee-bar-label">Journées terrain</span>
            <div className="ag-journee-list">
              {journees.map((journee) => (
                <div key={journee.key} className="ag-journee-chip">
                  <span className="ag-journee-chip-meta">
                    {fmtShort(journee.date)} · {journee.technicienLabel} · {journee.interventions.length} int.
                  </span>
                  <SiteAccessRapportButton
                    demandeUid={demandeUid}
                    missionDate={journee.date}
                    technicien={journee.technicien || 'Sans technicien'}
                    interventions={journee.interventions}
                    label={MISSION_JOURNEE_BUTTON_LABEL}
                    size="sm"
                    variant="secondary"
                    className="ag-journee-chip-btn"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="ag-grid-wrap">
          <div className="ag-grid" ref={gridRef} style={{ gridTemplateColumns: `${labelColWidth}px ${dayColTemplate}`, gridTemplateRows }}>
            <div className="ag-corner">
              {useCampagneRows ? 'Campagne' : null}
            </div>
            {days.map((day) => {
              const isToday = dateStr(day) === dateStr(new Date())
              const weekdayLabel = D7[(day.getDay() + 6) % 7]
              const dateLabel = `${day.getDate()} ${MS[day.getMonth()]}`
              return (
                <div key={dateStr(day)} className={`ag-dh${isToday ? ' today' : ''}`}>
                  <div className="ag-dh-name">{weekdayLabel}</div>
                  <div className={`ag-dh-num${isToday ? ' today' : ''}`}>{dateLabel}</div>
                </div>
              )
            })}
            {Array.from({ length: rowCount }).flatMap((_, ri) => [
              <div key={`lbl-${ri}`} className="ag-bg-lbl" style={{ gridRow: ri + 2, gridColumn: 1 }} />,
              ...days.map((day, ci) => {
                const isToday = dateStr(day) === dateStr(new Date())
                return <div key={`bg-${ri}-${ci}`} className={`ag-bg${isToday ? ' today' : ''}`} style={{ gridRow: ri + 2, gridColumn: ci + 2 }} />
              }),
            ])}
            {displayRows.map((row, ri) => {
              const ev = row.campagne
              const campagneMarkers = campagneWeekMarkers(ev, wsStr, weStr)
              const interventionMarkers = interventionWeekMarkers(row.interventions, wsStr, weStr)
              const timelineMarkers = [...campagneMarkers, ...interventionMarkers]
              const hasBar = timelineMarkers.length > 0 || dossierTimelineBars.length > 0
              const colors = agendaDatesOnly
                ? { bg: '#eef5ff', border: '#003170', text: '#003170' }
                : itemColor(ev)
              const rowLabel = row.campaignLabel || ev.tit || 'Campagne'
              const affaireRefLabel = planningAffaireRefLabel(ev, dossierContext?.affaire?.reference || '')
              return [
                <div
                  key={`lab-${row.key}`}
                  className="ag-label ag-label-campagne"
                  style={{ gridRow: campagneGridRow(ri), gridColumn: 1 }}
                >
                  <div className="ag-label-body">
                    <button
                      type="button"
                      className="ag-label-open ag-label-campagne-open"
                      onClick={() => onOpenItem(ev)}
                      disabled={row.isOrphanGroup}
                      title={ev.open_label || 'Ouvrir campagne'}
                    >
                      <div className="ag-lref" style={{ color: colors.border }}>{ev.ref}</div>
                      {affaireRefLabel ? <div className="ag-laffaire">{affaireRefLabel}</div> : null}
                      <div className="ag-llabo">{rowLabel}</div>
                    </button>
                  </div>
                  {onDeleteCampagne && !row.isOrphanGroup ? (
                    <button
                      type="button"
                      className="ag-row-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteCampagne(row)
                      }}
                      disabled={deletingCampagneUid === row.campagneUid}
                      title={
                        row.interventionCount > 0
                          ? 'Campagne avec interventions rattachées'
                          : 'Supprimer la campagne'
                      }
                      aria-label={`Supprimer ${ev.ref}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>,
                ...(comfortable
                  ? groupAgendaDayCells(
                    dossierTimelineBars,
                    timelineMarkers,
                    ws,
                    wsStr,
                    weStr,
                    dayCount,
                    visibleDateBar,
                    agendaBarColumns,
                  ).flatMap((cell, cellIndex, cells) => [(
                    <div
                      key={`cell-${row.key}-${cell.colS}-${cell.colE}`}
                      className="ag-bar-layer-wrap ag-bar-cell-stack"
                      style={{
                        gridRow: campagneGridRow(ri),
                        gridColumn: `${cell.colS}/${cell.colE}`,
                        borderBottom: cellIndex === cells.length - 1 ? '0.5px solid var(--border)' : undefined,
                        zIndex: 20 + cellIndex,
                      }}
                    >
                      {cell.dossier.map((layer) => (
                        <div key={`${layer.key}-dossier-${row.key}`} className="ag-bar-stack-item">
                          <button
                            type="button"
                            className={`ag-bar ag-bar-stacked ag-bar-dossier-chip ag-bar-dossier-${layer.layer}`}
                            style={{
                              background: layer.colors.bg,
                              borderColor: layer.colors.border,
                              color: layer.colors.text,
                              cursor: layer.item.route ? 'pointer' : 'default',
                            }}
                            disabled={!layer.item.route}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (!layer.item.route) return
                              onOpenItem?.({ route: layer.item.route, open_label: `Ouvrir ${layer.key}` })
                            }}
                            title={layer.refLabel}
                          >
                            <span className="ag-bar-dates-only">{layer.refLabel}</span>
                          </button>
                        </div>
                      ))}
                      {cell.markers.map(({ marker }) => {
                        const isIntervention = Boolean(marker.intervention)
                        const markerItem = marker.intervention || ev
                        const markerColors = isIntervention ? itemColor(markerItem) : colors
                        return (
                          <div key={`${marker.key}-stack-${row.key}`} className="ag-bar-stack-item">
                            <button
                              type="button"
                              className={`ag-bar ag-bar-dossier ag-bar-stacked ${isIntervention ? 'ag-bar-intervention-marker' : 'ag-bar-campagne-marker'}${marker.layer === 'intervention-nt' ? ' ag-bar-intervention-nt' : ''}`}
                              style={{
                                background: markerColors.bg,
                                borderColor: markerColors.border,
                                color: markerColors.text,
                                cursor: 'pointer',
                              }}
                              onClick={(event) => {
                                event.stopPropagation()
                                onPopupOpen(markerItem, event.currentTarget.getBoundingClientRect())
                              }}
                              title={marker.title || (isIntervention ? interventionMarkerTitle(markerItem) : `${ev.ref} — ${marker.label}`)}
                            >
                              {isIntervention ? (
                                <InterventionAgendaBarContent marker={marker} label={marker.label} />
                              ) : (
                                <span className="ag-bar-dates-only">{marker.label}</span>
                              )}
                            </button>
                            {popupOpen?.key === markerItem.key ? (
                              <Popup
                                item={markerItem}
                                anchor={popupOpen.anchor}
                                onClose={onPopupClose}
                                onSave={onPopupSave}
                                onOpenItem={() => onOpenItem(markerItem)}
                                onOpenPreparation={onOpenPreparation}
                                datesOnly={agendaDatesOnly}
                              />
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )])
                  : [
                    ...dossierTimelineBars.map((layer, layerIndex) => {
                  const { colS, colE } = agendaBarColumns(layer.bar, ws, dayCount)
                  return (
                    <div
                      key={`${layer.key}-bar-${row.key}`}
                      className={`ag-bar-layer-wrap ag-bar-layer-${layer.layer}`}
                      style={{
                        gridRow: campagneGridRow(ri),
                        gridColumn: `${colS}/${colE}`,
                        position: 'relative',
                        borderBottom: layerIndex === dossierTimelineBars.length - 1 && !hasBar ? '0.5px solid var(--border)' : undefined,
                        zIndex: layerIndex + 1,
                      }}
                    >
                      <button
                        type="button"
                        className={`ag-bar ag-bar-dossier ag-bar-dossier-${layer.layer}`}
                        style={{
                          left: layer.bar.isClipL ? '-2px' : '2px',
                          right: layer.bar.isClipR ? '-2px' : '2px',
                          background: layer.colors.bg,
                          borderColor: layer.colors.border,
                          borderLeftWidth: layer.bar.isClipL ? '4px' : '1.5px',
                          borderRadius: layer.bar.isClipL ? '0 5px 5px 0' : '5px',
                          color: layer.colors.text,
                          cursor: layer.item.route ? 'pointer' : 'default',
                        }}
                        disabled={!layer.item.route}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (!layer.item.route) return
                          onOpenItem?.({ route: layer.item.route, open_label: `Ouvrir ${layer.key}` })
                        }}
                        title={layer.refLabel}
                      >
                        <span className="ag-bar-dates-only">{layer.refLabel}</span>
                      </button>
                    </div>
                  )
                }),
                    ...timelineMarkers.flatMap((marker, markerIndex) => {
                  const bar = marker.isRange
                    ? visibleDateBar(marker.dateStart, marker.dateEnd, wsStr, weStr)
                    : visibleDateBar(marker.date, marker.date, wsStr, weStr)
                  if (!bar) return []
                  const { colS, colE } = agendaBarColumns(bar, ws, dayCount)
                  const isIntervention = Boolean(marker.intervention)
                  const markerItem = marker.intervention || ev
                  const markerColors = isIntervention ? itemColor(markerItem) : colors
                  const isLastMarker = markerIndex === timelineMarkers.length - 1
                  return [(
                    <div
                      key={`${marker.key}-bar-${row.key}`}
                      className={`ag-bar-layer-wrap ag-bar-layer-${marker.layer}`}
                      style={{
                        gridRow: campagneGridRow(ri),
                        gridColumn: `${colS}/${colE}`,
                        position: 'relative',
                        borderBottom: isLastMarker ? '0.5px solid var(--border)' : undefined,
                        zIndex: 10 + markerIndex,
                      }}
                    >
                      <button
                        type="button"
                        className={`ag-bar ag-bar-dossier ${isIntervention ? 'ag-bar-intervention-marker' : 'ag-bar-campagne-marker'}${marker.layer === 'intervention-nt' ? ' ag-bar-intervention-nt' : ''}`}
                        style={{
                          top: campagneMarkerTop(marker, { dossierLayerCount, stackIndex: marker.stackIndex || 0, comfortable }),
                          left: '2px',
                          right: '2px',
                          background: markerColors.bg,
                          borderColor: markerColors.border,
                          color: markerColors.text,
                          cursor: 'pointer',
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          onPopupOpen(markerItem, event.currentTarget.getBoundingClientRect())
                        }}
                        title={marker.title || (isIntervention ? interventionMarkerTitle(markerItem) : `${ev.ref} — ${marker.label}`)}
                      >
                        {isIntervention ? (
                          <InterventionAgendaBarContent marker={marker} label={marker.label} />
                        ) : (
                          <span className="ag-bar-dates-only">{marker.label}</span>
                        )}
                      </button>
                      {popupOpen?.key === markerItem.key ? (
                        <Popup
                          item={markerItem}
                          anchor={popupOpen.anchor}
                          onClose={onPopupClose}
                          onSave={onPopupSave}
                          onOpenItem={() => onOpenItem(markerItem)}
                          onOpenPreparation={onOpenPreparation}
                          datesOnly={agendaDatesOnly}
                        />
                      ) : null}
                    </div>
                  )]
                }),
                  ]
                ),
                !hasBar && !dossierTimelineBars.length ? (
                  <div
                    key={`empty-${row.key}`}
                    style={{
                      gridRow: campagneGridRow(ri),
                      gridColumn: '2 / -1',
                      borderBottom: '0.5px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 10px',
                      fontSize: '11px',
                      color: 'var(--th)',
                      fontStyle: 'italic',
                    }}
                  >
                    {ev.start || ev.ech || (row.interventions || []).some((item) => item.start)
                      ? 'Hors semaine'
                      : 'Dates à planifier'}
                  </div>
                ) : null,
              ]
            })}
            {!displayRows.length ? <div style={{ gridRow: 2, gridColumn: `1 / ${dayCount + 2}`, padding: '30px', textAlign: 'center', fontSize: '12px', color: 'var(--th)', fontStyle: 'italic' }}>{emptyText}</div> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlanningWorkspace({
  items = [],
  campaigns = [],
  demandeUid = '',
  loading = false,
  error = '',
  toolbar = null,
  onPatchItem,
  onOpenItem,
  onDeleteCampagne,
  deletingCampagneUid = null,
  onOpenPreparation,
  planningStartDate = '',
  planningFocusDate = '',
  planningEndDate = '',
  dossierContext = null,
  embedded = true,
  viewMode = 'both',
  agendaRowMode = 'item',
  showSidebar = true,
}) {
  const agendaOnly = viewMode === 'agenda'
  const campagneAgenda = agendaRowMode === 'campagne'
  const [tab, setTab] = useState(agendaOnly ? 2 : 1)
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calSel, setCalSel] = useState(null)
  const [popupOpen, setPopupOpen] = useState(null)

  const agendaRows = useMemo(() => {
    if (!campagneAgenda) return null
    return buildPreparationAgendaRows(campaigns, items, demandeUid)
  }, [campagneAgenda, campaigns, items, demandeUid])

  const agendaItems = useMemo(() => {
    if (campagneAgenda) {
      return (agendaRows || []).flatMap((row) => [
        row.campagne,
        ...(row.interventions || []),
      ])
    }
    return agendaItemsFromPlanning(items)
  }, [campagneAgenda, agendaRows, items])

  const counts = useMemo(() => {
    if (campagneAgenda) {
      const entries = agendaItems
      return {
        all: entries.length,
        late: entries.filter((d) => d.urg === 'late').length,
        soon: entries.filter((d) => d.urg === 'soon' || d.urg === 'late').length,
      }
    }
    return {
      all: items.length,
      late: items.filter((d) => d.urg === 'late').length,
      soon: items.filter((d) => d.urg === 'soon' || d.urg === 'late').length,
    }
  }, [campagneAgenda, agendaItems, items])

  useEffect(() => {
    function onDocClick(ev) {
      if (ev.target.closest('.item-popup') || ev.target.closest('.t1-card') || ev.target.closest('.ag-bar')) return
      setPopupOpen(null)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function prevMonth() {
    const next = shiftCalendarMonth(calYear, calMonth, -1)
    setCalYear(next.calYear)
    setCalMonth(next.calMonth)
  }

  function nextMonth() {
    const next = shiftCalendarMonth(calYear, calMonth, 1)
    setCalYear(next.calYear)
    setCalMonth(next.calMonth)
  }

  async function patchItem(target, patch, closeAfter) {
    await onPatchItem?.(target, patch, closeAfter)
    if (closeAfter) setPopupOpen(null)
  }

  return (
    <div className={`planning-page${embedded ? ' planning-embedded' : ''}`}>
      <div className="planning-topbar">
        {!agendaOnly ? (
          <div className="tb-tabs">
            <button type="button" className={`tb-tab ${tab === 1 ? 'on' : ''}`} onClick={() => setTab(1)}>Organiser</button>
            <button type="button" className={`tb-tab ${tab === 2 ? 'on' : ''}`} onClick={() => setTab(2)}>Agenda</button>
          </div>
        ) : (
          <div className="tb-tabs">
            <div className="tb-tab on">Agenda</div>
          </div>
        )}
        {!(campagneAgenda && embedded) ? (
          <div className="tb-right">
            <button type="button" className="tb-stat on"><div className="tb-sn">{counts.all}</div><div className="tb-sl">Total</div></button>
            <button type="button" className="tb-stat"><div className="tb-sn">{counts.late}</div><div className="tb-sl">Retard</div></button>
            <button type="button" className="tb-stat"><div className="tb-sn">{counts.soon}</div><div className="tb-sl">Urgent</div></button>
          </div>
        ) : null}
      </div>

      {toolbar ? <div className="px-3 py-2 bg-white border-b border-[#dbe1ea] flex flex-wrap gap-2">{toolbar}</div> : null}

      {loading ? <div className="planning-loading">Chargement du planning…</div> : null}
      {error ? <div className="planning-error">{error}</div> : null}

      {!loading && !agendaOnly && tab === 1 ? (
        <OrganiserView
          data={items}
          calYear={calYear}
          calMonth={calMonth}
          calSel={calSel}
          onCalSelect={setCalSel}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          popupOpen={popupOpen}
          onPopupOpen={(item, anchor) => setPopupOpen({ key: item.key, anchor })}
          onPopupClose={() => setPopupOpen(null)}
          onPopupSave={patchItem}
          onOpenItem={onOpenItem}
        />
      ) : null}

      {!loading && (agendaOnly || tab === 2) ? (
        <AgendaView
          title={campagneAgenda ? 'Agenda campagne' : 'Agenda demande'}
          emptyText={campagneAgenda ? 'Aucune campagne ni intervention' : 'Aucun élément planifié cette semaine'}
          data={agendaItems}
          rows={agendaRows}
          showSidebar={showSidebar}
          agendaDatesOnly={campagneAgenda}
          planningStartDate={planningStartDate}
          planningFocusDate={planningFocusDate}
          planningEndDate={planningEndDate}
          dossierContext={dossierContext}
          embedded={embedded}
          demandeUid={demandeUid}
          calYear={calYear}
          calMonth={calMonth}
          calSel={calSel}
          onCalSelect={setCalSel}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          popupOpen={popupOpen}
          onPopupOpen={(item, anchor) => setPopupOpen({ key: item.key, anchor })}
          onPopupClose={() => setPopupOpen(null)}
          onPopupSave={patchItem}
          onOpenItem={onOpenItem}
          onDeleteCampagne={campagneAgenda ? onDeleteCampagne : undefined}
          deletingCampagneUid={deletingCampagneUid}
          onOpenPreparation={onOpenPreparation}
        />
      ) : null}
    </div>
  )
}
