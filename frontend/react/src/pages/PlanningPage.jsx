/**
 * PlanningPage.jsx
 * React port of the planning module.
 * Current scope: Organiser + Agenda Demandes faithfully migrated first.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { planningApi } from '@/services/api'
import './planning.css'

const D7 = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const ACTIVE = ['À qualifier', 'Demande', 'En Attente', 'En Cours']
const ARCHIVED = ['Répondu', 'Fini', 'Envoyé - Perdu']
const STATUS_META = {
    'À qualifier': { dot: '#888780', bg: '#f1efe8', fg: '#5f5e5a' },
    Demande: { dot: '#4A7DB5', bg: '#E8EFF8', fg: '#002C77' },
    'En Attente': { dot: '#e67e22', bg: '#fef3e5', fg: '#854f0b' },
    'En Cours': { dot: '#1d9e75', bg: '#eaf3de', fg: '#3b6d11' },
    'Répondu': { dot: '#534ab7', bg: '#eeedfe', fg: '#534ab7' },
    Fini: { dot: '#0f6e56', bg: '#E1F5EE', fg: '#0f6e56' },
    'Envoyé - Perdu': { dot: '#e24b4a', bg: '#fcebeb', fg: '#a32d2d' },
}
const LABS = ['', 'Saint-Priest', 'Pont-du-Ch.', 'Chambéry', 'Clermont']

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
    const status = STATUS_META[item.stat] || STATUS_META['À qualifier']
    return {
        bg: status.bg,
        border: itemBorderColor(item),
        text: status.fg,
    }
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

function Popup({ item, anchor, onClose, onSave, onOpenDemande }) {
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
                <div className="ip-ref">{item.ref}</div>
                <div className="ip-stat" style={{ background: STATUS_META[item.stat]?.bg, color: STATUS_META[item.stat]?.fg }}>{item.stat}</div>
                <button className="ip-close" onClick={onClose}>×</button>
            </div>
            <div className="ip-tit">{item.tit}</div>
            <div className="ip-row">
                <div className="ip-lbl">Début</div>
                <input className="ip-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="ip-row">
                <div className="ip-lbl">Échéance</div>
                <input className="ip-input" type="date" value={ech} onChange={(e) => setEch(e.target.value)} />
            </div>
            <div className="ip-btns">
                <button className="ip-btn" onClick={onClose}>Fermer</button>
                <button className="ip-btn link" onClick={onOpenDemande}>Ouvrir</button>
                <button className="ip-btn primary" onClick={() => onSave({ start, ech })}>Enregistrer</button>
            </div>
        </div>
    )
}

function AgendaDemandes({ data, calYear, calMonth, calSel, onCalSelect, onPrevMonth, onNextMonth, popupOpen, onPopupOpen, onPopupClose, onPopupSave, onOpenDemande }) {
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
        .sort((a, b) => a.uid - b.uid), [data, wsStr, weStr])

    const weekNumber = useMemo(() => {
        const startOfYear = new Date(ws.getFullYear(), 0, 1)
        return Math.ceil(((ws - startOfYear) / 86400000) / 7) + 1
    }, [ws])

    function handleCalSelect(day) {
        forceWeekFromSelection.current = day != null
        onCalSelect(day)
    }

    function beginDrag(ev, item, mode) {
        ev.preventDefault()
        ev.stopPropagation()
        const rect = gridRef.current?.getBoundingClientRect()
        const cellWidth = rect ? (rect.width - 92) / 7 : 110
        dragRef.current = {
            uid: item.uid,
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
        const item = data.find((d) => d.uid === state.uid)
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
        await onPopupSave(item.uid, { start: nextStart, ech: nextEch }, false)
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
                    <div className="ag-period">{period} — {events.length} dem.</div>
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
                            const activePopup = popupOpen?.uid === ev.uid

                            return [
                                <div key={`lab-${ev.uid}`} className="ag-label" style={{ gridRow: ri + 2, gridColumn: 1 }} onClick={() => onOpenDemande(ev.uid)} title="Ouvrir la demande">
                                    <div className="ag-lref" style={{ color: colors.border }}>{ev.ref}</div>
                                    <div className="ag-llabo">{ev.labo || '—'}</div>
                                </div>,
                                <div key={`bar-wrap-${ev.uid}`} style={{ gridRow: ri + 2, gridColumn: `${colS}/${colE}`, position: 'relative', borderBottom: '0.5px solid var(--border)' }}>
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
                                            onPopupOpen(ev.uid, e.currentTarget.getBoundingClientRect())
                                        }}
                                    >
                                        <span className="ag-bar-ref">{ev.ref}</span>
                                        {ev.urg === 'late' ? <span className="ag-urg">🔴</span> : ev.urg === 'soon' ? <span className="ag-urg">🟡</span> : null}
                                        <span className="ag-bar-tit">{ev.tit}</span>
                                        <span className="ag-bar-dates">{fmtShort(ev.start)} → {fmtShort(ev.ech)}</span>
                                        {ev.dst ? <span className="bd bn">DST</span> : null}
                                        <div className="ag-rh" style={{ background: `${colors.border}55` }} onMouseDown={(e) => beginDrag(e, ev, 'resize')} />
                                    </div>
                                    {activePopup ? <Popup item={ev} anchor={popupOpen.anchor} onClose={onPopupClose} onSave={(values) => onPopupSave(ev.uid, values, true)} onOpenDemande={() => onOpenDemande(ev.uid)} /> : null}
                                </div>,
                            ]
                        })}
                        {!events.length ? <div style={{ gridRow: 2, gridColumn: '1/9', padding: '30px', textAlign: 'center', fontSize: '12px', color: 'var(--th)', fontStyle: 'italic' }}>Aucune demande cette semaine</div> : null}
                    </div>
                </div>
            </div>
        </div>
    )
}

function Organiser({ data, calYear, calMonth, calSel, onCalSelect, onPrevMonth, onNextMonth, popupOpen, onPopupOpen, onPopupClose, onPopupSave, onOpenDemande }) {
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
                                        const isPopup = popupOpen?.uid === item.uid
                                        return (
                                            <div key={item.uid} className={`t1-card${isMatch ? ' match' : ''}${dim ? ' dim' : ''}`} style={{ borderLeftColor: itemBorderColor(item) }} draggable onDragStart={() => setDragUid(item.uid)} onDragEnd={() => setDragUid(null)} onClick={(e) => onPopupOpen(item.uid, e.currentTarget.getBoundingClientRect())}>
                                                <div className="t1-cref">{item.ref}{item.ech ? ` · ${fmtShort(item.ech)}` : ''}</div>
                                                <div className="t1-ctit">{item.tit}</div>
                                                <div className="t1-cft">
                                                    {item.urg === 'late' ? <span className="bd br">Ret.</span> : null}
                                                    {item.urg === 'soon' ? <span className="bd by">Urg.</span> : null}
                                                    {item.dst ? <span className="bd bn">DST</span> : null}
                                                    {item.labo ? <span className="bd neutral">{item.labo}</span> : null}
                                                </div>
                                                {isPopup ? <Popup item={item} anchor={popupOpen.anchor} onClose={onPopupClose} onSave={(values) => onPopupSave(item.uid, values, true)} onOpenDemande={() => onOpenDemande(item.uid)} /> : null}
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
                                            {cards.map((item) => <div key={item.uid} className="t1-card compact" style={{ borderLeftColor: itemBorderColor(item) }} draggable onDragStart={() => setDragUid(item.uid)} onDragEnd={() => setDragUid(null)} onClick={(e) => onPopupOpen(item.uid, e.currentTarget.getBoundingClientRect())}><div className="t1-cref">{item.ref}</div><div className="t1-ctit">{item.tit}</div></div>)}
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
                const rows = await planningApi.list()
                const normalized = rows.map((r) => ({ ...r, urg: r.urg || urgencyFromEch(r.ech) }))
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
            if (demandeContextId && String(d.uid) !== String(demandeContextId)) return false
            if (laboFilter && d.labo !== laboFilter) return false
            if (globalFilter === 'late') return d.urg === 'late'
            if (globalFilter === 'soon') return d.urg === 'soon' || d.urg === 'late'
            if (globalFilter === 'dst') return d.dst
            return true
        })
    }, [items, demandeContextId, globalFilter, laboFilter])

    const counts = useMemo(() => ({
        all: filtered.length,
        late: filtered.filter((d) => d.urg === 'late').length,
        soon: filtered.filter((d) => d.urg === 'soon' || d.urg === 'late').length,
        dst: filtered.filter((d) => d.dst).length,
    }), [filtered])

    async function patchItem(uid, patch, closeAfter) {
        const current = items.find((i) => i.uid === uid)
        if (!current) return
        const optimistic = {
            ...current,
            ...patch,
        }
        if ('ech' in patch) optimistic.urg = urgencyFromEch(patch.ech)
        if ('stat' in patch && ARCHIVED.includes(patch.stat)) optimistic.urg = 'done'
        setItems((prev) => prev.map((item) => item.uid === uid ? optimistic : item))
        try {
            const saved = await planningApi.update(uid, patch)
            setItems((prev) => prev.map((item) => item.uid === uid ? { ...saved, urg: saved.urg || urgencyFromEch(saved.ech) } : item))
            if (closeAfter) setPopupOpen(null)
        } catch (err) {
            setItems((prev) => prev.map((item) => item.uid === uid ? current : item))
            setError(err.message || 'Erreur de mise à jour')
        }
    }

    function openPopup(uid, anchor) {
        setPopupOpen({ uid, anchor })
    }

    function openDemande(uid) {
        navigate(`/demandes/${uid}`)
    }

    const currentContext = demandeContextId ? filtered.find((d) => String(d.uid) === String(demandeContextId)) : null

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
                        <button className="ctx-btn" onClick={() => currentContext && openDemande(currentContext.uid)}>Ouvrir la demande</button>
                    </div>
                </div>
            ) : null}

            {loading ? <div className="planning-loading">Chargement du planning…</div> : null}
            {error ? <div className="planning-error">{error}</div> : null}

            {!loading && tab === 1 ? (
                <Organiser
                    data={filtered}
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
                    onOpenDemande={openDemande}
                />
            ) : null}

            {!loading && tab === 2 ? (
                <AgendaDemandes
                    data={filtered}
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
                    onOpenDemande={openDemande}
                />
            ) : null}

            {!loading && (tab === 3 || tab === 4) ? (
                <div className="planning-placeholder">
                    <div className="planning-placeholder-icon">🛠️</div>
                    <div className="planning-placeholder-title">Vue en attente de portage</div>
                    <div className="planning-placeholder-text">On garde le même cap: Agenda Labo et Analyser seront portés ensuite, sans changer la logique métier.</div>
                </div>
            ) : null}
        </div>
    )
}
