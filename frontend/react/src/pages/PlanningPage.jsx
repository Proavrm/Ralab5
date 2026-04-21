/**
 * PlanningPage.jsx
 * React port of the planning module.
 * Current scope: Organiser + Agenda Demandes + Analyser.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { planningApi } from '@/services/api'
import './planning.css'

const D7 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const ACTIVE = ['A planifier', 'Planifie', 'En cours']
const ARCHIVED = ['Termine', 'Annule']
const STATUS_META = {
    'A planifier': { dot: '#888780', bg: '#f1efe8', fg: '#5f5e5a' },
    Planifie: { dot: '#4A7DB5', bg: '#E8EFF8', fg: '#002C77' },
    'En cours': { dot: '#1d9e75', bg: '#eaf3de', fg: '#3b6d11' },
    Termine: { dot: '#0f6e56', bg: '#E1F5EE', fg: '#0f6e56' },
    Annule: { dot: '#e24b4a', bg: '#fcebeb', fg: '#a32d2d' },
}
const LABS = ['', 'Saint-Priest', 'Pont-du-Ch.', 'Chambéry', 'Clermont']

function itemKey(item) {
    return `${item.kind}:${item.uid}`
}

function normalizePlanningItem(row) {
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
    }
    return {
        ...normalized,
        key: itemKey(normalized),
    }
}

function fmtShort(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${d}/${m}`
}

function parseDate(iso) {
    if (!iso) return null
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
}

function dateStr(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function addDays(date, n) {
    const copy = new Date(date)
    copy.setDate(copy.getDate() + n)
    return copy
}

function weekStart(date) {
    const copy = new Date(date)
    const dow = (copy.getDay() + 6) % 7
    copy.setDate(copy.getDate() - dow)
    copy.setHours(0, 0, 0, 0)
    return copy
}

function urgencyFromEch(ech) {
    if (!ech) return 'done'
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diff = Math.round((parseDate(ech) - today) / 86400000)
    if (diff < 0) return 'late'
    if (diff <= 7) return 'soon'
    return 'ok'
}

function monthHeatmap(data, y, m) {
    const counts = {}
    const urgency = {}
    data.forEach((item) => {
        if (!item.ech) return
        const d = parseDate(item.ech)
        if (!d || d.getFullYear() !== y || d.getMonth() !== m) return
        const day = d.getDate()
        counts[day] = (counts[day] || 0) + 1
        if (!urgency[day] || urgency[day] === 'ok') urgency[day] = item.urg
        if (urgency[day] === 'soon' && item.urg === 'late') urgency[day] = 'late'
    })
    return { counts, urgency }
}

function colorClass(n, u) {
    if (u === 'late') return 'clate'
    if (u === 'soon') return 'cwarn'
    return ['c0', 'c1', 'c2', 'c3', 'c4'][Math.min(n, 4)]
}

function itemBorderColor(item) {
    if (item.urg === 'late') return '#e24b4a'
    if (item.urg === 'soon') return '#E6A817'
    return '#4A7DB5'
}

function itemColor(item) {
    const status = STATUS_META[item.stat] || STATUS_META['A planifier']
    return {
        bg: status.bg,
        border: itemBorderColor(item),
        text: status.fg,
    }
}

function isSameDay(left, right) {
    return Boolean(left && right)
        && left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate()
}

function itemsUrgency(items) {
    if (items.some((item) => item.urg === 'late')) return 'late'
    if (items.some((item) => item.urg === 'soon')) return 'soon'
    if (items.length > 0) return 'ok'
    return null
}

function itemsForDay(items, day, labo) {
    return items.filter((item) => {
        const itemDate = parseDate(item.ech || item.start)
        if (!itemDate || !isSameDay(itemDate, day)) return false
        if (labo === 'À définir') return !item.labo
        return item.labo === labo
    })
}

function sparkMonths(items, refDate) {
    return Array.from({ length: 6 }, (_, index) => {
        const monthDate = new Date(refDate.getFullYear(), refDate.getMonth() - (5 - index), 1)
        const count = items.filter((item) => {
            const itemDate = parseDate(item.ech || item.start)
            return itemDate && itemDate.getFullYear() === monthDate.getFullYear() && itemDate.getMonth() === monthDate.getMonth()
        }).length
        return { label: MS[monthDate.getMonth()], count }
    })
}

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
                    <button className="lsb-nb" onClick={onPrevMonth}>‹</button>
                    <div className="lsb-title">{MS[calMonth]} {calYear}</div>
                    <button className="lsb-nb" onClick={onNextMonth}>›</button>
                    {calSel != null && <button className="lsb-clr" onClick={() => onCalSelect(null)}>✕</button>}
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
                            <div
                                key={day}
                                className={`hmd ${colorClass(n, u)}${calSel === day ? ' sel' : ''}`}
                                onClick={() => onCalSelect(calSel === day ? null : day)}
                            >
                                {isToday && <div className="todayr" />}
                                <div className="hmdn">{day}</div>
                                {n > 0 && <div className="hmdn2">{n}</div>}
                            </div>
                        )
                    })}
                    {Array.from({ length: (7 - ((off + last) % 7)) % 7 }).map((_, idx) => <div key={`e2-${idx}`} className="hmd hme" />)}
                </div>
                <div className="lsb-leg">
                    <div className="lsb-lb c0 border" />0
                    <div className="lsb-lb c1" />1
                    <div className="lsb-lb c2" />2
                    <div className="lsb-lb c4" />4+
                    <div className="lsb-lb clate" />Ret.
                    <div className="lsb-lb cwarn" />Urg.
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

function Popup({ item, anchor, onClose, onSave, onOpenItem }) {
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

    return (
        <div className="item-popup open" style={style}>
            <div className="ip-hdr">
                <div className="ip-ref">{item.kind_label} · {item.ref}</div>
                <div className="ip-stat" style={{ background: STATUS_META[item.stat]?.bg, color: STATUS_META[item.stat]?.fg }}>{item.stat}</div>
                <button className="ip-close" onClick={onClose}>×</button>
            </div>
            <div className="ip-tit">{item.tit}</div>
            {item.subtitle ? <div className="ip-sub">{item.subtitle}</div> : null}
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
            <div className="ip-btns">
                <button className="ip-btn" onClick={onClose}>Fermer</button>
                <button className="ip-btn link" onClick={onOpenItem}>{item.open_label || 'Ouvrir'}</button>
                <button className="ip-btn primary" onClick={() => onSave(item, { start, ech })}>Enregistrer</button>
            </div>
        </div>
    )
}

function AgendaPlanning({ title, emptyText, data, calYear, calMonth, calSel, onCalSelect, onPrevMonth, onNextMonth, popupOpen, onPopupOpen, onPopupClose, onPopupSave, onOpenItem }) {
    const [refDate, setRefDate] = useState(() => new Date())
    const dragRef = useRef(null)
    const gridRef = useRef(null)
    const forceWeekFromSelection = useRef(false)

    useEffect(() => {
        if (calSel != null && forceWeekFromSelection.current) {
            setRefDate(new Date(calYear, calMonth, calSel))
            forceWeekFromSelection.current = false
        }
    }, [calSel, calMonth, calYear])

    const ws = useMemo(() => weekStart(refDate), [refDate])
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(ws, i)), [ws])
    const wsStr = dateStr(ws)
    const weStr = dateStr(days[6])
    const events = useMemo(() => data
        .filter((d) => d.start && d.ech && d.ech >= wsStr && d.start <= weStr)
        .sort((a, b) => a.key.localeCompare(b.key)), [data, wsStr, weStr])

    const weekNumber = useMemo(() => {
        const startOfYear = new Date(ws.getFullYear(), 0, 1)
        return Math.ceil(((ws - startOfYear) / 86400000) / 7) + 1
    }, [ws])

    function handleCalSelect(day) {
        forceWeekFromSelection.current = day != null
        onCalSelect(day)
    }

    function beginDrag(ev, item, mode) {
        if (mode === 'resize' && !item.editable_ech) return
        ev.preventDefault()
        ev.stopPropagation()
        const rect = gridRef.current?.getBoundingClientRect()
        const cellWidth = rect ? (rect.width - 92) / 7 : 110
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
        const item = data.find((d) => d.key === state.key)
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

    const period = `Sem. ${weekNumber} — ${days[0].getDate()} ${MS[days[0].getMonth()]} – ${days[6].getDate()} ${MS[days[6].getMonth()]} ${days[6].getFullYear()}`

    return (
        <div className="view-body">
            <Sidebar
                data={data}
                calYear={calYear}
                calMonth={calMonth}
                calSel={calSel}
                onCalSelect={handleCalSelect}
                onPrevMonth={onPrevMonth}
                onNextMonth={onNextMonth}
                note="Cliquer = modifier · Glisser barre = déplacer · Handle → = étendre"
            />
            <div className="ag-main">
                <div className="ag-nav">
                    <button className="ag-nbtn" onClick={() => setRefDate(addDays(refDate, -7))}>‹</button>
                    <div className="ag-period">{title} · {period} — {events.length} élément(s)</div>
                    <button className="ag-nbtn" onClick={() => setRefDate(addDays(refDate, 7))}>›</button>
                    <button className="ag-tdb" onClick={() => setRefDate(new Date())}>Aujourd&apos;hui</button>
                </div>
                <div className="ag-grid-wrap">
                    <div className="ag-grid" ref={gridRef} style={{ gridTemplateColumns: '92px repeat(7, minmax(90px, 1fr))', gridTemplateRows: `32px repeat(${Math.max(events.length, 1)}, 34px) 1fr` }}>
                        <div className="ag-corner" />
                        {days.map((day, idx) => {
                            const today = new Date()
                            const isToday = dateStr(day) === dateStr(today)
                            return (
                                <div key={dateStr(day)} className={`ag-dh${isToday ? ' today' : ''}`}>
                                    <div className="ag-dh-name">{D7[idx]}</div>
                                    <div className={`ag-dh-num${isToday ? ' today' : ''}`}>{day.getDate()}</div>
                                </div>
                            )
                        })}
                        {Array.from({ length: Math.max(events.length, 2) }).flatMap((_, ri) => {
                            return [
                                <div key={`lbl-${ri}`} className="ag-bg-lbl" style={{ gridRow: ri + 2, gridColumn: 1 }} />,
                                ...days.map((day, ci) => {
                                    const isToday = dateStr(day) === dateStr(new Date())
                                    return <div key={`bg-${ri}-${ci}`} className={`ag-bg${isToday ? ' today' : ''}`} style={{ gridRow: ri + 2, gridColumn: ci + 2 }} />
                                }),
                            ]
                        })}

                        {events.map((ev, ri) => {
                            const evS = parseDate(ev.start) < ws ? ws : parseDate(ev.start)
                            const evE = parseDate(ev.ech) > days[6] ? days[6] : parseDate(ev.ech)
                            const colS = Math.min(8, Math.max(2, Math.round((evS - ws) / 86400000) + 2))
                            const colE = Math.min(9, Math.max(colS + 1, Math.round((evE - ws) / 86400000) + 3))
                            const isClipL = ev.start < wsStr
                            const isClipR = ev.ech > weStr
                            const colors = itemColor(ev)
                            const activePopup = popupOpen?.key === ev.key

                            return [
                                <div key={`lab-${ev.key}`} className="ag-label" style={{ gridRow: ri + 2, gridColumn: 1 }} onClick={() => onOpenItem(ev)} title={ev.open_label || 'Ouvrir'}>
                                    <div className="ag-lref" style={{ color: colors.border }}>{ev.ref}</div>
                                    <div className="ag-llabo">{ev.kind_label}{ev.labo ? ` · ${ev.labo}` : ''}</div>
                                </div>,
                                <div key={`bar-wrap-${ev.key}`} style={{ gridRow: ri + 2, gridColumn: `${colS}/${colE}`, position: 'relative', borderBottom: '0.5px solid var(--border)' }}>
                                    <div
                                        className="ag-bar"
                                        style={{
                                            left: isClipL ? '-2px' : '2px',
                                            right: isClipR ? '-2px' : '2px',
                                            background: colors.bg,
                                            borderColor: colors.border,
                                            borderLeftWidth: isClipL ? '4px' : '1.5px',
                                            borderRadius: isClipL ? '0 5px 5px 0' : '5px',
                                            color: colors.text,
                                        }}
                                        onMouseDown={(e) => beginDrag(e, ev, 'move')}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onPopupOpen(ev, e.currentTarget.getBoundingClientRect())
                                        }}
                                    >
                                        <span className="ag-bar-ref">{ev.ref}</span>
                                        {ev.urg === 'late' ? <span className="ag-urg">🔴</span> : ev.urg === 'soon' ? <span className="ag-urg">🟡</span> : null}
                                        <span className="ag-bar-tit">{ev.tit}</span>
                                        <span className="ag-bar-dates">{fmtShort(ev.start)} → {fmtShort(ev.ech)}</span>
                                        <span className="bd neutral">{ev.kind_label}</span>
                                        {ev.dst ? <span className="bd bn">DST</span> : null}
                                        {ev.editable_ech ? <div className="ag-rh" style={{ background: `${colors.border}55` }} onMouseDown={(e) => beginDrag(e, ev, 'resize')} /> : null}
                                    </div>
                                    {activePopup ? <Popup item={ev} anchor={popupOpen.anchor} onClose={onPopupClose} onSave={onPopupSave} onOpenItem={() => onOpenItem(ev)} /> : null}
                                </div>,
                            ]
                        })}
                        {!events.length ? <div style={{ gridRow: 2, gridColumn: '1/9', padding: '30px', textAlign: 'center', fontSize: '12px', color: 'var(--th)', fontStyle: 'italic' }}>{emptyText}</div> : null}
                    </div>
                </div>
            </div>
        </div>
    )
}

function Organiser({ data, calYear, calMonth, calSel, onCalSelect, onPrevMonth, onNextMonth, popupOpen, onPopupOpen, onPopupClose, onPopupSave, onOpenItem }) {
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
                        const matched = calSel ? new Set(cards.filter((d) => d.ech && parseDate(d.ech)?.getDate() === calSel && parseDate(d.ech)?.getMonth() === calMonth && parseDate(d.ech)?.getFullYear() === calYear).map((d) => d.uid)) : new Set()
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
                                            <div key={item.key} className={`t1-card${isMatch ? ' match' : ''}${dim ? ' dim' : ''}`} style={{ borderLeftColor: itemBorderColor(item), cursor: item.editable_stat ? 'grab' : 'pointer' }} draggable={item.editable_stat} onDragStart={() => item.editable_stat && setDragUid(item)} onDragEnd={() => setDragUid(null)} onClick={(e) => onPopupOpen(item, e.currentTarget.getBoundingClientRect())}>
                                                <div className="t1-cref">{item.ref}{item.ech ? ` · ${fmtShort(item.ech)}` : ''}</div>
                                                <div className="t1-ctit">{item.tit}</div>
                                                <div className="t1-cft">
                                                    <span className="bd neutral">{item.kind_label}</span>
                                                    {item.urg === 'late' ? <span className="bd br">Ret.</span> : null}
                                                    {item.urg === 'soon' ? <span className="bd by">Urg.</span> : null}
                                                    {item.dst ? <span className="bd bn">DST</span> : null}
                                                    {item.labo ? <span className="bd neutral">{item.labo}</span> : null}
                                                </div>
                                                {item.subtitle ? <div className="t1-csub">{item.subtitle}</div> : null}
                                                {isPopup ? <Popup item={item} anchor={popupOpen.anchor} onClose={onPopupClose} onSave={onPopupSave} onOpenItem={() => onOpenItem(item)} /> : null}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="t1-archives-wrap">
                    <div className="t1-archives-toggle" onClick={() => setArchivesOpen((v) => !v)}>
                        {archivesOpen ? '▴' : '▾'} Archives {archivedData.length > 0 ? `(${archivedData.length})` : ''}
                    </div>
                    {archivesOpen ? (
                        <div className="t1-archives-grid">
                            {ARCHIVED.map((status) => {
                                const cards = archivedData.filter((d) => d.stat === status)
                                return (
                                    <div key={status} className="t1-arch-col" onDragOver={(e) => e.preventDefault()} onDrop={async () => {
                                        if (!dragUid) return
                                        await onPopupSave(dragUid, { stat: status }, false)
                                        setDragUid(null)
                                    }}>
                                        <div className="t1-chdr"><div className="t1-cdot" style={{ background: STATUS_META[status].dot }} /><span className="t1-cname">{status}</span><span className="t1-ccnt">{cards.length}</span></div>
                                        <div className="t1-cbody mini">
                                            {cards.map((item) => <div key={item.key} className="t1-card compact" style={{ borderLeftColor: itemBorderColor(item), cursor: item.editable_stat ? 'grab' : 'pointer' }} draggable={item.editable_stat} onDragStart={() => item.editable_stat && setDragUid(item)} onDragEnd={() => setDragUid(null)} onClick={(e) => onPopupOpen(item, e.currentTarget.getBoundingClientRect())}><div className="t1-cref">{item.ref}</div><div className="t1-ctit">{item.tit}</div><div className="t1-csub">{item.kind_label}</div></div>)}
                                            {!cards.length ? <div className="t1-empty-drop">Déposer ici</div> : null}
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

function Analyser({ data }) {
    const [zoom, setZoom] = useState('month')
    const [refDate, setRefDate] = useState(() => new Date())

    const labs = useMemo(() => [...LABS.filter(Boolean), 'À définir'], [])
    const late = useMemo(() => data.filter((item) => item.urg === 'late').length, [data])
    const soon = useMemo(() => data.filter((item) => item.urg === 'soon').length, [data])
    const ok = useMemo(() => data.filter((item) => item.urg === 'ok').length, [data])
    const spark = useMemo(() => sparkMonths(data, refDate), [data, refDate])
    const sparkMax = useMemo(() => Math.max(...spark.map((entry) => entry.count), 1), [spark])

    function navigateRange(step) {
        setRefDate((current) => {
            const next = new Date(current)
            if (zoom === 'week') {
                next.setDate(next.getDate() + step * 7)
            } else if (zoom === 'month') {
                next.setMonth(next.getMonth() + step)
            } else {
                next.setFullYear(next.getFullYear() + step)
            }
            return next
        })
    }

    function resetToday() {
        setRefDate(new Date())
    }

    const content = useMemo(() => {
        if (zoom === 'week') {
            const start = weekStart(refDate)
            const days = Array.from({ length: 7 }, (_, index) => addDays(start, index))
            const period = `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[6].getDate()}/${days[6].getMonth() + 1}/${days[6].getFullYear()}`
            const cells = [<div key="wk-empty" className="t4-wgh" />]

            days.forEach((day, index) => {
                cells.push(
                    <div key={`wk-head-${index}`} className="t4-wgh">
                        {D7[index]} {day.getDate()}/{day.getMonth() + 1}
                    </div>,
                )
            })

            labs.forEach((labo) => {
                cells.push(<div key={`wk-lab-${labo}`} className="t4-wl">{labo}</div>)
                days.forEach((day) => {
                    const itemsForCell = itemsForDay(data, day, labo)
                    const urgency = itemsUrgency(itemsForCell)
                    const className = colorClass(itemsForCell.length, urgency)
                    const todayClass = isSameDay(day, new Date()) ? ' tc' : ''
                    cells.push(
                        <div key={`wk-${labo}-${dateStr(day)}`} className={`t4-wc ${className}${todayClass}`}>
                            {itemsForCell.slice(0, 3).map((item) => (
                                <div key={item.uid} className={`t4-wchip ${item.urg}`}>{item.ref}</div>
                            ))}
                            {itemsForCell.length > 3 ? <div className="t4-mmore">+{itemsForCell.length - 3}</div> : null}
                        </div>,
                    )
                })
            })

            return {
                period,
                node: <div className="t4-wg">{cells}</div>,
            }
        }

        if (zoom === 'month') {
            const year = refDate.getFullYear()
            const month = refDate.getMonth()
            const { counts, urgency } = monthHeatmap(data, year, month)
            const first = new Date(year, month, 1)
            const last = new Date(year, month + 1, 0).getDate()
            const off = (first.getDay() + 6) % 7
            const cells = D7.map((day, index) => <div key={`mh-${index}`} className="t4-mgh">{day}</div>)

            Array.from({ length: off }).forEach((_, index) => {
                cells.push(<div key={`mo-empty-start-${index}`} className="t4-mc other" />)
            })

            Array.from({ length: last }, (_, index) => index + 1).forEach((dayNumber) => {
                const dayDate = new Date(year, month, dayNumber)
                const itemsForCell = data.filter((item) => {
                    const itemDate = parseDate(item.ech || item.start)
                    return itemDate && isSameDay(itemDate, dayDate)
                })
                const className = colorClass(counts[dayNumber] || 0, urgency[dayNumber])
                const todayClass = isSameDay(dayDate, new Date()) ? ' tc' : ''
                cells.push(
                    <div key={`mo-${dayNumber}`} className={`t4-mc ${className}${todayClass}`}>
                        <div className="t4-mcn">{dayNumber}</div>
                        {itemsForCell.slice(0, 2).map((item) => (
                            <div key={item.uid} className={`t4-mevt ${item.urg}`}>{item.ref}</div>
                        ))}
                        {itemsForCell.length > 2 ? <div className="t4-mmore">+{itemsForCell.length - 2}</div> : null}
                    </div>,
                )
            })

            const rest = (7 - ((off + last) % 7)) % 7
            Array.from({ length: rest }).forEach((_, index) => {
                cells.push(<div key={`mo-empty-end-${index}`} className="t4-mc other" />)
            })

            return {
                period: `${MS[month]} ${year}`,
                node: <div className="t4-mg">{cells}</div>,
            }
        }

        const year = refDate.getFullYear()
        return {
            period: `Année ${year}`,
            node: (
                <div className="t4-yg">
                    {Array.from({ length: 12 }, (_, month) => {
                        const { counts, urgency } = monthHeatmap(data, year, month)
                        const first = new Date(year, month, 1)
                        const last = new Date(year, month + 1, 0).getDate()
                        const off = (first.getDay() + 6) % 7
                        const cells = D7.map((day) => <div key={`yr-head-${month}-${day}`} className="t4-ydh">{day[0]}</div>)

                        Array.from({ length: off }).forEach((_, index) => {
                            cells.push(<div key={`yr-empty-start-${month}-${index}`} className="t4-yd t4-ye" />)
                        })

                        Array.from({ length: last }, (_, index) => index + 1).forEach((dayNumber) => {
                            const dayDate = new Date(year, month, dayNumber)
                            const className = colorClass(counts[dayNumber] || 0, urgency[dayNumber])
                            const todayStyle = isSameDay(dayDate, new Date()) ? { outline: '2px solid var(--nge-d)' } : undefined
                            cells.push(
                                <div
                                    key={`yr-day-${month}-${dayNumber}`}
                                    className={`t4-yd ${className}`}
                                    style={todayStyle}
                                    title={`${dayNumber}/${month + 1} : ${counts[dayNumber] || 0}`}
                                />,
                            )
                        })

                        const rest = (7 - ((off + last) % 7)) % 7
                        Array.from({ length: rest }).forEach((_, index) => {
                            cells.push(<div key={`yr-empty-end-${month}-${index}`} className="t4-yd t4-ye" />)
                        })

                        return (
                            <div key={`yr-month-${month}`} className="t4-ym">
                                <div className="t4-ymt">{MS[month]}</div>
                                <div className="t4-ycg">{cells}</div>
                            </div>
                        )
                    })}
                </div>
            ),
        }
    }, [data, labs, refDate, zoom])

    return (
        <div className="view-body">
            <div className="lsb">
                <div className="lsb-sec">Analyse rapide</div>
                <div className="lsb-sg">
                    <div className="lsb-stat"><div className="lsb-sn danger">{late}</div><div className="lsb-sl">Retard</div></div>
                    <div className="lsb-stat"><div className="lsb-sn warn">{soon}</div><div className="lsb-sl">Urgent</div></div>
                    <div className="lsb-stat"><div className="lsb-sn ok">{ok}</div><div className="lsb-sl">En cours</div></div>
                    <div className="lsb-stat"><div className="lsb-sn nge">{data.length}</div><div className="lsb-sl">Total</div></div>
                </div>
                <div className="lsb-div" />
                <div className="lsb-sec">Charge 6 mois</div>
                <div className="t4-spark">
                    {spark.map((entry) => (
                        <div key={`spark-${entry.label}`} className="t4-spb" style={{ height: `${Math.max(3, Math.round(entry.count / sparkMax * 20))}px` }} />
                    ))}
                </div>
                <div className="t4-spl">
                    {spark.map((entry) => <span key={`spark-label-${entry.label}`}>{entry.label}</span>)}
                </div>
                <div className="lsb-div" />
                <div className="lsb-note">Synthèse construite à partir du feed planning unifié: demandes, terrain, passations et labo.</div>
            </div>

            <div className="t4-wrap">
                <div className="t4-tb">
                    <div className="t4-zooms">
                        <button className={`t4-zb${zoom === 'week' ? ' on' : ''}`} onClick={() => setZoom('week')}>Semaine</button>
                        <button className={`t4-zb${zoom === 'month' ? ' on' : ''}`} onClick={() => setZoom('month')}>Mois</button>
                        <button className={`t4-zb${zoom === 'year' ? ' on' : ''}`} onClick={() => setZoom('year')}>Année</button>
                    </div>
                    <div className="t4-nav">
                        <button className="t4-nbtn" onClick={() => navigateRange(-1)}>‹</button>
                        <div className="t4-period">{content.period}</div>
                        <button className="t4-nbtn" onClick={() => navigateRange(1)}>›</button>
                    </div>
                    <button className="t4-tdb" onClick={resetToday}>Aujourd&apos;hui</button>
                    <div className="t4-leg">
                        <div className="t4-lb c0 border" />0
                        <div className="t4-lb c1" />1
                        <div className="t4-lb c2" />2
                        <div className="t4-lb c3" />3
                        <div className="t4-lb c4" />4+
                        <div className="t4-lb clate" />Ret.
                        <div className="t4-lb cwarn" />Urg.
                    </div>
                </div>
                <div className="t4-content">{content.node}</div>
            </div>
        </div>
    )
}

export default function PlanningPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [tab, setTab] = useState(1)
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [globalFilter, setGlobalFilter] = useState(() => {
        const filter = searchParams.get('filter')
        return ['all', 'late', 'soon', 'dst'].includes(filter) ? filter : 'all'
    })
    const [laboFilter, setLaboFilter] = useState('')
    const [calYear, setCalYear] = useState(() => new Date().getFullYear())
    const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
    const [calSel, setCalSel] = useState(null)
    const [popupOpen, setPopupOpen] = useState(null)

    const demandeContextId = searchParams.get('demande_id')

    useEffect(() => {
        let mounted = true
        async function load() {
            try {
                setLoading(true)
                setError('')
                const rows = await planningApi.listItems()
                const normalized = rows.map(normalizePlanningItem)
                if (mounted) setItems(normalized)
            } catch (err) {
                if (mounted) setError(err.message || 'Erreur de chargement du planning')
            } finally {
                if (mounted) setLoading(false)
            }
        }
        load()
        return () => { mounted = false }
    }, [])

    useEffect(() => {
        function onDocClick(ev) {
            if (ev.target.closest('.item-popup') || ev.target.closest('.t1-card') || ev.target.closest('.ag-bar')) return
            setPopupOpen(null)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [])

    const filtered = useMemo(() => {
        return items.filter((d) => {
            if (demandeContextId && String(d.source_demande_id) !== String(demandeContextId)) return false
            if (laboFilter && d.labo !== laboFilter) return false
            if (globalFilter === 'late') return d.urg === 'late'
            if (globalFilter === 'soon') return d.urg === 'soon' || d.urg === 'late'
            if (globalFilter === 'dst') return d.dst
            return true
        })
    }, [items, demandeContextId, globalFilter, laboFilter])

    const organiserItems = useMemo(() => filtered.filter((item) => item.views.includes('organiser')), [filtered])
    const terrainItems = useMemo(() => filtered.filter((item) => item.views.includes('terrain')), [filtered])
    const laboItems = useMemo(() => filtered.filter((item) => item.views.includes('labo')), [filtered])
    const analyserItems = useMemo(() => filtered.filter((item) => item.views.includes('analyser')), [filtered])

    const counts = useMemo(() => ({
        all: filtered.length,
        late: filtered.filter((d) => d.urg === 'late').length,
        soon: filtered.filter((d) => d.urg === 'soon' || d.urg === 'late').length,
        dst: filtered.filter((d) => d.dst).length,
    }), [filtered])

    async function patchItem(target, patch, closeAfter) {
        const current = typeof target === 'object' ? target : target
        const item = typeof target === 'object' ? target : items.find((i) => i.key === target?.key || i.key === target)
        const currentItem = item || current
        if (!currentItem) return
        const currentKey = currentItem.key
        if (!current) return
        const optimistic = {
            ...currentItem,
            ...patch,
        }
        if ('ech' in patch) optimistic.urg = urgencyFromEch(patch.ech)
        if ('stat' in patch && ARCHIVED.includes(patch.stat)) optimistic.urg = 'done'
        setItems((prev) => prev.map((entry) => entry.key === currentKey ? { ...entry, ...optimistic } : entry))
        try {
            const payload = { ...patch }
            if (!currentItem.editable_ech) delete payload.ech
            const saved = normalizePlanningItem(await planningApi.updateItem(currentItem.kind, currentItem.uid, payload))
            setItems((prev) => prev.map((entry) => entry.key === currentKey ? saved : entry))
            if (closeAfter) setPopupOpen(null)
        } catch (err) {
            setItems((prev) => prev.map((entry) => entry.key === currentKey ? currentItem : entry))
            setError(err.message || 'Erreur de mise à jour')
        }
    }

    function openPopup(item, anchor) {
        setPopupOpen({ key: item.key, anchor })
    }

    function openItem(item) {
        if (!item?.route) return
        navigate(item.route)
    }

    const currentContext = demandeContextId ? filtered.find((d) => d.kind === 'demande' && String(d.uid) === String(demandeContextId)) : null

    return (
        <div className="planning-page">
            <div className="planning-topbar">
                <div className="tb-tabs">
                    <button className={`tb-tab ${tab === 1 ? 'on' : ''}`} onClick={() => setTab(1)}>🗂 Organiser</button>
                    <button className={`tb-tab ${tab === 2 ? 'on' : ''}`} onClick={() => setTab(2)}>📋 Agenda Demandes</button>
                    <button className={`tb-tab ${tab === 3 ? 'on' : ''}`} onClick={() => setTab(3)}>🧪 Agenda Labo</button>
                    <button className={`tb-tab ${tab === 4 ? 'on' : ''}`} onClick={() => setTab(4)}>📈 Analyser</button>
                </div>
                <div className="tb-right">
                    <select className="tb-fsel" value={laboFilter} onChange={(e) => setLaboFilter(e.target.value)}>
                        {LABS.map((lab) => <option key={lab || 'all'} value={lab}>{lab || 'Tous labos'}</option>)}
                    </select>
                    <button className={`tb-stat ${globalFilter === 'all' ? 'on' : ''}`} onClick={() => setGlobalFilter('all')}><div className="tb-sn">{counts.all}</div><div className="tb-sl">Tous</div></button>
                    <button className={`tb-stat ${globalFilter === 'late' ? 'on' : ''}`} onClick={() => setGlobalFilter('late')}><div className="tb-sn">{counts.late}</div><div className="tb-sl">Retard</div></button>
                    <button className={`tb-stat ${globalFilter === 'soon' ? 'on' : ''}`} onClick={() => setGlobalFilter('soon')}><div className="tb-sn">{counts.soon}</div><div className="tb-sl">Urgent</div></button>
                    <button className={`tb-stat ${globalFilter === 'dst' ? 'on' : ''}`} onClick={() => setGlobalFilter('dst')}><div className="tb-sn">{counts.dst}</div><div className="tb-sl">DST</div></button>
                </div>
            </div>

            {demandeContextId ? (
                <div className={`ctx-banner show`}>
                    <div>
                        <strong>Contexte demande</strong>
                        <span>{currentContext ? `${currentContext.ref} · ${currentContext.tit}` : `Demande #${demandeContextId}`}</span>
                    </div>
                    <div className="ctx-actions">
                        <button className="ctx-btn" onClick={() => navigate('/planning')}>Voir tout</button>
                        <button className="ctx-btn" onClick={() => currentContext && openItem(currentContext)}>Ouvrir la demande</button>
                    </div>
                </div>
            ) : null}

            {loading ? <div className="planning-loading">Chargement du planning…</div> : null}
            {error ? <div className="planning-error">{error}</div> : null}

            {!loading && tab === 1 ? (
                <Organiser
                    data={organiserItems}
                    calYear={calYear}
                    calMonth={calMonth}
                    calSel={calSel}
                    onCalSelect={setCalSel}
                    onPrevMonth={() => {
                        const month = calMonth - 1
                        if (month < 0) {
                            setCalMonth(11)
                            setCalYear((y) => y - 1)
                        } else {
                            setCalMonth(month)
                        }
                    }}
                    onNextMonth={() => {
                        const month = calMonth + 1
                        if (month > 11) {
                            setCalMonth(0)
                            setCalYear((y) => y + 1)
                        } else {
                            setCalMonth(month)
                        }
                    }}
                    popupOpen={popupOpen}
                    onPopupOpen={openPopup}
                    onPopupClose={() => setPopupOpen(null)}
                    onPopupSave={patchItem}
                    onOpenItem={openItem}
                />
            ) : null}

            {!loading && tab === 2 ? (
                <AgendaPlanning
                    title="Agenda Terrain"
                    emptyText="Aucun élément terrain cette semaine"
                    data={terrainItems}
                    calYear={calYear}
                    calMonth={calMonth}
                    calSel={calSel}
                    onCalSelect={setCalSel}
                    onPrevMonth={() => {
                        const month = calMonth - 1
                        if (month < 0) {
                            setCalMonth(11)
                            setCalYear((y) => y - 1)
                        } else {
                            setCalMonth(month)
                        }
                    }}
                    onNextMonth={() => {
                        const month = calMonth + 1
                        if (month > 11) {
                            setCalMonth(0)
                            setCalYear((y) => y + 1)
                        } else {
                            setCalMonth(month)
                        }
                    }}
                    popupOpen={popupOpen}
                    onPopupOpen={openPopup}
                    onPopupClose={() => setPopupOpen(null)}
                    onPopupSave={patchItem}
                    onOpenItem={openItem}
                />
            ) : null}

            {!loading && tab === 3 ? (
                <AgendaPlanning
                    title="Agenda Labo"
                    emptyText="Aucun élément labo cette semaine"
                    data={laboItems}
                    calYear={calYear}
                    calMonth={calMonth}
                    calSel={calSel}
                    onCalSelect={setCalSel}
                    onPrevMonth={() => {
                        const month = calMonth - 1
                        if (month < 0) {
                            setCalMonth(11)
                            setCalYear((y) => y - 1)
                        } else {
                            setCalMonth(month)
                        }
                    }}
                    onNextMonth={() => {
                        const month = calMonth + 1
                        if (month > 11) {
                            setCalMonth(0)
                            setCalYear((y) => y + 1)
                        } else {
                            setCalMonth(month)
                        }
                    }}
                    popupOpen={popupOpen}
                    onPopupOpen={openPopup}
                    onPopupClose={() => setPopupOpen(null)}
                    onPopupSave={patchItem}
                    onOpenItem={openItem}
                />
            ) : null}

            {!loading && tab === 4 ? <Analyser data={analyserItems} /> : null}
        </div>
    )
}
