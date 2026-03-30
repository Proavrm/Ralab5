/**
 * pages/PlanningPage.jsx
 * Planning React port of the legacy RaLab planning module.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { planningApi, demandesApi } from '@/services/api'
import './planning.css'

const TODAY = new Date(2026, 2, 18)
const ACTIVE_STATUSES = ['À qualifier', 'Demande', 'En Attente', 'En Cours']
const ARCHIVED_STATUSES = ['Répondu', 'Fini', 'Envoyé - Perdu']
const STATUSES = [
    { s: 'À qualifier', dot: '#888780' },
    { s: 'Demande', dot: '#4A7DB5' },
    { s: 'En Attente', dot: '#e67e22' },
    { s: 'En Cours', dot: '#1d9e75' },
    { s: 'Répondu', dot: '#534ab7' },
    { s: 'Fini', dot: '#0f6e56' },
    { s: 'Envoyé - Perdu', dot: '#e24b4a' },
]
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jui', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAYS_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Sam.', 'Dim.']
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_PX = 48
const ITEM_COLORS = [
    { bg: '#E8EFF8', border: '#4A7DB5', text: '#002C77' },
    { bg: '#EAF3DE', border: '#1d9e75', text: '#3b6d11' },
    { bg: '#FEF5E0', border: '#E6A817', text: '#8A6410' },
    { bg: '#EEEDFE', border: '#534ab7', text: '#26215C' },
    { bg: '#FCE8E8', border: '#e24b4a', text: '#791F1F' },
    { bg: '#E1F5EE', border: '#0f6e56', text: '#04342C' },
]
const LABO_DATA_INITIAL = [
    { id: 'L01', label: 'Essais triaxiaux', labo: 'Saint-Priest', date: '2026-03-18', dateEnd: '2026-03-18', th: 8, te: 12, col: 0 },
    { id: 'L02', label: 'Granulométrie', labo: 'Chambéry', date: '2026-03-18', dateEnd: '2026-03-18', th: 13, te: 16, col: 1 },
    { id: 'L03', label: 'Essai Proctor', labo: 'Saint-Priest', date: '2026-03-19', dateEnd: '2026-03-19', th: 9, te: 11, col: 2 },
    { id: 'L04', label: 'Cisaillement dir.', labo: 'Chambéry', date: '2026-03-19', dateEnd: '2026-03-19', th: 14, te: 17, col: 3 },
    { id: 'L05', label: 'CBR + Atterberg', labo: 'Saint-Priest', date: '2026-03-20', dateEnd: '2026-03-20', th: 8, te: 15, col: 0 },
    { id: 'L06', label: 'Plaque de charge', labo: 'Pont-du-Ch.', date: '2026-03-21', dateEnd: '2026-03-21', th: 10, te: 13, col: 4 },
    { id: 'L07', label: 'Triaxial CU', labo: 'Saint-Priest', date: '2026-03-24', dateEnd: '2026-03-24', th: 8, te: 14, col: 1 },
    { id: 'L08', label: 'Analyse GTR', labo: 'Chambéry', date: '2026-03-25', dateEnd: '2026-03-25', th: 9, te: 11, col: 2 },
]
const STATUS_BG = {
    'À qualifier': ['#f1efe8', '#5f5e5a'],
    'Demande': ['#E8EFF8', '#002C77'],
    'En Attente': ['#fef3e5', '#854f0b'],
    'En Cours': ['#eaf3de', '#3b6d11'],
    'Répondu': ['#eeedfe', '#534ab7'],
    'Fini': ['#e1f5ee', '#0f6e56'],
    'Envoyé - Perdu': ['#fcebeb', '#a32d2d'],
}
const DEMO_DATA = [
    { uid: 1, ref: '2026-RA-006', tit: 'G3 muret soutènement', stat: 'À qualifier', start: '2026-03-03', ech: '2026-03-14', dst: false, urg: 'late', labo: 'Saint-Priest', th: 9, te: 12 },
    { uid: 2, ref: '2026-RA-014', tit: 'SNCF Firminy', stat: 'Demande', start: '2026-03-06', ech: '2026-03-15', dst: true, urg: 'late', labo: 'Pont-du-Ch.', th: 8, te: 11 },
    { uid: 3, ref: '2026-RA-012', tit: 'Carrefour RD35a', stat: 'À qualifier', start: '2026-03-16', ech: '2026-03-22', dst: true, urg: 'soon', labo: 'Saint-Priest', th: 13, te: 16 },
    { uid: 4, ref: '2026-RA-011', tit: "Planche d'essai Bugey", stat: 'Demande', start: '2026-03-16', ech: '2026-03-23', dst: true, urg: 'soon', labo: 'Chambéry', th: 8, te: 14 },
    { uid: 5, ref: '2026-RA-007', tit: 'SASCA Saint Exupery', stat: 'En Cours', start: '2026-03-12', ech: '2026-03-21', dst: false, urg: 'soon', labo: 'Chambéry', th: 10, te: 12 },
    { uid: 6, ref: '2026-RA-001', tit: 'BIOMERIEUX TWINS', stat: 'En Cours', start: '2026-03-04', ech: '2026-03-25', dst: false, urg: 'ok', labo: 'Saint-Priest', th: 8, te: 17 },
    { uid: 7, ref: '2026-RA-009', tit: 'Déviation RN88', stat: 'En Cours', start: '2026-03-10', ech: '2026-03-27', dst: true, urg: 'ok', labo: 'Saint-Priest', th: 7, te: 16 },
    { uid: 8, ref: '2026-RA-015', tit: 'STEP Moussettes', stat: 'Demande', start: '2026-03-12', ech: '2026-03-28', dst: false, urg: 'ok', labo: 'Pont-du-Ch.', th: 9, te: 13 },
    { uid: 9, ref: '2026-RA-013', tit: 'Safran Domérat', stat: 'À qualifier', start: '2026-03-18', ech: '2026-03-31', dst: true, urg: 'ok', labo: null, th: 14, te: 17 },
    { uid: 10, ref: '2026-RA-016', tit: 'REVEYRON Miribel', stat: 'En Cours', start: '2026-03-25', ech: '2026-04-02', dst: false, urg: 'ok', labo: null, th: 8, te: 12 },
    { uid: 11, ref: '2026-RA-003', tit: 'Michelin Gravanches', stat: 'Répondu', start: null, ech: null, dst: false, urg: 'done', labo: 'Pont-du-Ch.', th: 9, te: 11 },
    { uid: 12, ref: '2026-RA-010', tit: 'STEP Trois Rivières', stat: 'Répondu', start: null, ech: null, dst: false, urg: 'done', labo: 'Pont-du-Ch.', th: 13, te: 15 },
    { uid: 13, ref: '2026-RA-004', tit: "RN88 PI Croix de l'Horme", stat: 'Fini', start: null, ech: null, dst: false, urg: 'done', labo: 'Chambéry', th: 8, te: 10 },
    { uid: 14, ref: '2026-RA-005', tit: 'Plateforme Isère', stat: 'En Cours', start: '2026-03-09', ech: '2026-03-25', dst: true, urg: 'ok', labo: 'Saint-Priest', th: 10, te: 18 },
]

function toIsoDate(value) {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(date, days) {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    return d
}

function weekStart(date) {
    const d = new Date(date)
    const offset = (d.getDay() + 6) % 7
    d.setDate(d.getDate() - offset)
    d.setHours(0, 0, 0, 0)
    return d
}

function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatShortDate(value) {
    if (!value) return ''
    const parts = value.split('-')
    if (parts.length !== 3) return value
    return `${parts[2]}/${parts[1]}`
}

function urgencyForDate(ech) {
    if (!ech) return 'done'
    const diff = Math.round((new Date(ech) - TODAY) / 86400000)
    if (diff < 0) return 'late'
    if (diff <= 7) return 'soon'
    return 'ok'
}

function urgencyBadgeClass(urg) {
    if (urg === 'late') return 'pp-badge danger'
    if (urg === 'soon') return 'pp-badge warn'
    return ''
}

function dayClass(count, urg) {
    if (urg === 'late') return 'clate'
    if (urg === 'soon') return 'cwarn'
    return ['c0', 'c1', 'c2', 'c3', 'c4'][Math.min(count, 4)]
}

function itemColor(uid) {
    return ITEM_COLORS[(uid - 1) % ITEM_COLORS.length]
}

function buildFilteredData(data, globalFilter, laboFilter) {
    return data.filter(item => {
        if (laboFilter && item.labo !== laboFilter) return false
        if (globalFilter === 'late') return item.urg === 'late'
        if (globalFilter === 'soon') return item.urg === 'soon' || item.urg === 'late'
        if (globalFilter === 'dst') return item.dst
        return true
    })
}

function buildHeatmapStats(data, year, month) {
    const counts = {}
    const urgencies = {}
    data.forEach(item => {
        if (!item.ech) return
        const d = new Date(item.ech)
        if (d.getFullYear() !== year || d.getMonth() !== month) return
        const day = d.getDate()
        counts[day] = (counts[day] || 0) + 1
        if (!urgencies[day] || urgencies[day] === 'ok') urgencies[day] = item.urg
        if (urgencies[day] === 'soon' && item.urg === 'late') urgencies[day] = 'late'
    })
    return { counts, urgencies }
}

function Heatmap({ data, year, month, selectedDay, onSelectDay }) {
    const { counts, urgencies } = useMemo(() => buildHeatmapStats(data, year, month), [data, year, month])
    const first = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0).getDate()
    const offset = (first.getDay() + 6) % 7
    const cells = []

    for (let i = 0; i < offset; i += 1) cells.push({ empty: true, key: `e-${i}` })
    for (let d = 1; d <= lastDay; d += 1) {
        cells.push({
            key: `d-${d}`,
            day: d,
            count: counts[d] || 0,
            urg: urgencies[d],
            today: sameDay(new Date(year, month, d), TODAY),
        })
    }
    while (cells.length % 7 !== 0) cells.push({ empty: true, key: `x-${cells.length}` })

    return (
        <div className="pp-heatmap">
            {DAYS.map((d, i) => <div key={`hdr-${i}`} className="pp-heatmap-hdr">{d}</div>)}
            {cells.map(cell => cell.empty ? (
                <div key={cell.key} className="pp-heatmap-cell empty" />
            ) : (
                <button
                    key={cell.key}
                    type="button"
                    className={`pp-heatmap-cell ${dayClass(cell.count, cell.urg)} ${selectedDay === cell.day ? 'sel' : ''}`}
                    onClick={() => onSelectDay(selectedDay === cell.day ? null : cell.day)}
                >
                    {cell.today && <div className="todayr" />}
                    <div className="pp-heatmap-day">{cell.day}</div>
                    {!!cell.count && <div className="pp-heatmap-count">{cell.count}</div>}
                </button>
            ))}
        </div>
    )
}

function Sidebar({ data, year, month, selectedDay, onSelectDay, onPrevMonth, onNextMonth, extra }) {
    const late = data.filter(d => d.urg === 'late').length
    const soon = data.filter(d => d.urg === 'soon').length
    const ok = data.filter(d => d.urg === 'ok').length

    return (
        <aside className="pp-sidebar">
            <div>
                <div className="pp-sidebar-hdr">
                    <button type="button" className="pp-mini-btn" onClick={onPrevMonth}>‹</button>
                    <div className="pp-sidebar-title">{MONTHS_SHORT[month]} {year}</div>
                    <button type="button" className="pp-mini-btn" onClick={onNextMonth}>›</button>
                    {selectedDay != null && <button type="button" className="pp-clear-btn" onClick={() => onSelectDay(null)}>✕</button>}
                </div>
                <Heatmap data={data} year={year} month={month} selectedDay={selectedDay} onSelectDay={onSelectDay} />
                <div className="pp-legend">
                    <span><span className="pp-lb c0" />0</span>
                    <span><span className="pp-lb c1" />1</span>
                    <span><span className="pp-lb c2" />2</span>
                    <span><span className="pp-lb c4" />4+</span>
                    <span><span className="pp-lb clate" />Ret.</span>
                    <span><span className="pp-lb cwarn" />Urg.</span>
                </div>
            </div>

            <div className="pp-divider" />

            <div className="pp-sidebar-stats-grid">
                <div className="pp-sidebar-stat"><div className="n danger">{late}</div><div className="l">Retard</div></div>
                <div className="pp-sidebar-stat"><div className="n warn">{soon}</div><div className="l">Urgent</div></div>
                <div className="pp-sidebar-stat"><div className="n success">{ok}</div><div className="l">En cours</div></div>
                <div className="pp-sidebar-stat"><div className="n primary">{data.length}</div><div className="l">Total</div></div>
            </div>

            <div className="pp-divider" />
            <div className="pp-sidebar-sec">Par statut</div>
            {STATUSES.map(({ s, dot }) => (
                <div key={s} className="pp-status-row">
                    <div className="pp-status-dot" style={{ background: dot }} />
                    <div className="pp-status-name">{s}</div>
                    <div className="pp-status-count">{data.filter(d => d.stat === s).length}</div>
                </div>
            ))}
            {extra}
        </aside>
    )
}

function DemandePopup({ item, onClose, onSave, onGoToDemande }) {
    const [start, setStart] = useState(item?.start || '')
    const [ech, setEch] = useState(item?.ech || '')
    const [th, setTh] = useState(item?.th ?? 8)
    const [te, setTe] = useState(item?.te ?? 12)

    useEffect(() => {
        setStart(item?.start || '')
        setEch(item?.ech || '')
        setTh(item?.th ?? 8)
        setTe(item?.te ?? 12)
    }, [item])

    if (!item) return null
    const colors = STATUS_BG[item.stat] || ['#f1efe8', '#888']

    return (
        <div className="pp-popup-backdrop" onClick={onClose}>
            <div className="pp-popup" onClick={e => e.stopPropagation()}>
                <div className="pp-popup-hdr">
                    <div className="pp-popup-ref">{item.ref}</div>
                    <div className="pp-popup-stat" style={{ background: colors[0], color: colors[1] }}>{item.stat}</div>
                    <button type="button" className="pp-popup-close" onClick={onClose}>×</button>
                </div>
                <div className="pp-popup-title">{item.tit}</div>

                <div className="pp-popup-row">
                    <div className="pp-popup-label">Début</div>
                    <input className="pp-popup-input" type="date" value={start} onChange={e => setStart(e.target.value)} />
                </div>
                <div className="pp-popup-row">
                    <div className="pp-popup-label">Échéance</div>
                    <input className="pp-popup-input" type="date" value={ech} onChange={e => setEch(e.target.value)} />
                </div>
                <div className="pp-popup-row">
                    <div className="pp-popup-label">Heures</div>
                    <div className="pp-hour-row">
                        <input className="pp-popup-input" type="number" min="0" max="23" value={th} onChange={e => setTh(Number(e.target.value))} />
                        <span>→</span>
                        <input className="pp-popup-input" type="number" min="1" max="24" value={te} onChange={e => setTe(Number(e.target.value))} />
                    </div>
                </div>

                <div className="pp-popup-actions">
                    <button type="button" className="pp-popup-btn" onClick={onGoToDemande}>Ouvrir</button>
                    <button
                        type="button"
                        className="pp-popup-btn primary"
                        onClick={() => onSave({ ...item, start: start || null, ech: ech || null, th, te })}
                    >
                        Enregistrer
                    </button>
                </div>
            </div>
        </div>
    )
}

function KanbanView({ data, selectedDay, calendarYear, calendarMonth, onSelectDay, onPrevMonth, onNextMonth, onOpenPopup, onMoveStatus, onShowAgenda }) {
    const hint = selectedDay != null
        ? `${selectedDay} ${MONTHS_SHORT[calendarMonth].toLowerCase()} · ${data.filter(d => d.ech && Number(d.ech.split('-')[2]) === selectedDay).length} surlignées`
        : 'Cliquer un jour pour filtrer'

    return (
        <div className="pp-view on">
            <Sidebar
                data={data}
                year={calendarYear}
                month={calendarMonth}
                selectedDay={selectedDay}
                onSelectDay={onSelectDay}
                onPrevMonth={onPrevMonth}
                onNextMonth={onNextMonth}
                extra={<><div className="pp-divider" /><div className="pp-hint">{hint}</div></>}
            />

            <div className="pp-board-wrap">
                <div className="pp-board">
                    {ACTIVE_STATUSES.map(status => {
                        const dot = STATUSES.find(x => x.s === status)?.dot || '#888'
                        const cards = data.filter(d => d.stat === status)
                        const matched = new Set(selectedDay != null ? cards.filter(d => d.ech && Number(d.ech.split('-')[2]) === selectedDay).map(d => d.uid) : [])
                        return (
                            <div
                                key={status}
                                className="pp-col"
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => {
                                    const uid = Number(e.dataTransfer.getData('text/plain'))
                                    if (uid) onMoveStatus(uid, status)
                                }}
                            >
                                <div className="pp-col-hdr">
                                    <div className="pp-col-dot" style={{ background: dot }} />
                                    <span className="pp-col-name">{status}</span>
                                    <span className={`pp-col-count ${selectedDay != null && matched.size ? 'mark' : ''}`}>
                                        {selectedDay != null ? `${matched.size}/${cards.length}` : cards.length}
                                    </span>
                                </div>
                                <div className="pp-col-body">
                                    {cards.map(item => (
                                        <div
                                            key={item.uid}
                                            className={`pp-card ${selectedDay != null && !matched.has(item.uid) ? 'dim' : ''} ${matched.has(item.uid) ? 'match' : ''}`}
                                            style={{ borderLeftColor: item.urg === 'late' ? '#e24b4a' : item.urg === 'soon' ? '#E6A817' : '#1d9e75' }}
                                            draggable
                                            onDragStart={e => e.dataTransfer.setData('text/plain', String(item.uid))}
                                            onClick={() => onOpenPopup(item)}
                                        >
                                            <div className="pp-card-ref">{item.ref}{item.ech ? ` · ${formatShortDate(item.ech)}` : ''}</div>
                                            <div className="pp-card-title">{item.tit}</div>
                                            <div className="pp-card-ft">
                                                {item.urg === 'late' && <span className="pp-badge danger">Ret.</span>}
                                                {item.urg === 'soon' && <span className="pp-badge warn">Urg.</span>}
                                                {item.dst && <span className="pp-badge primary">DST</span>}
                                                {item.labo && <span className="pp-badge neutral">{item.labo}</span>}
                                                <button type="button" className="pp-badge-link" onClick={(e) => { e.stopPropagation(); onShowAgenda(item) }}>⟺</button>
                                            </div>
                                        </div>
                                    ))}
                                    {!cards.length && <div className="pp-empty-drop">Déposer ici</div>}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <ArchiveStrip data={data} onOpenPopup={onOpenPopup} onMoveStatus={onMoveStatus} />
            </div>
        </div>
    )
}

function ArchiveStrip({ data, onOpenPopup, onMoveStatus }) {
    const [open, setOpen] = useState(false)
    const total = ARCHIVED_STATUSES.reduce((sum, status) => sum + data.filter(d => d.stat === status).length, 0)

    return (
        <div className="pp-archive-wrap">
            <div className="pp-archive-shell">
                <div className="pp-archive-top">
                    <div className="flex-1" />
                    <button type="button" className="pp-archive-toggle" onClick={() => setOpen(v => !v)}>
                        {open ? '▴' : '▾'} Archives {total > 0 ? `(${total})` : ''}
                    </button>
                </div>
                {open && (
                    <div className="pp-archive-grid">
                        {ARCHIVED_STATUSES.map(status => {
                            const dot = STATUSES.find(x => x.s === status)?.dot || '#888'
                            const cards = data.filter(d => d.stat === status)
                            return (
                                <div
                                    key={status}
                                    className="pp-archive-col"
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => {
                                        const uid = Number(e.dataTransfer.getData('text/plain'))
                                        if (uid) onMoveStatus(uid, status)
                                    }}
                                >
                                    <div className="pp-col-hdr">
                                        <div className="pp-col-dot" style={{ background: dot }} />
                                        <span className="pp-col-name">{status}</span>
                                        <span className="pp-col-count">{cards.length}</span>
                                    </div>
                                    <div className="pp-col-body archive">
                                        {cards.map(item => (
                                            <div
                                                key={item.uid}
                                                className="pp-card archive"
                                                style={{ borderLeftColor: item.urg === 'late' ? '#e24b4a' : item.urg === 'soon' ? '#E6A817' : '#1d9e75' }}
                                                draggable
                                                onDragStart={e => e.dataTransfer.setData('text/plain', String(item.uid))}
                                                onClick={() => onOpenPopup(item)}
                                            >
                                                <div className="pp-card-ref">{item.ref}</div>
                                                <div className="pp-card-title">{item.tit}</div>
                                            </div>
                                        ))}
                                        {!cards.length && <div className="pp-empty-drop small">Déposer ici</div>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

function AgendaDemandesView({ data, agDate, setAgDate, agDay, setAgDay, agCalYear, setAgCalYear, agCalMonth, setAgCalMonth, onOpenPopup, onMoveDates }) {
    const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart(agDate), i)), [agDate])
    const filtered = useMemo(() => {
        if (agDay == null) return data.filter(d => !!d.start && !!d.ech)
        return data.filter(d => d.ech && Number(d.ech.split('-')[2]) === agDay)
    }, [data, agDay])
    const period = `${week[0].getDate()} ${MONTHS_SHORT[week[0].getMonth()]} – ${week[6].getDate()} ${MONTHS_SHORT[week[6].getMonth()]} ${week[6].getFullYear()}`

    return (
        <div className="pp-view on">
            <Sidebar
                data={filtered}
                year={agCalYear}
                month={agCalMonth}
                selectedDay={agDay}
                onSelectDay={setAgDay}
                onPrevMonth={() => {
                    const next = agCalMonth === 0 ? 11 : agCalMonth - 1
                    const year = agCalMonth === 0 ? agCalYear - 1 : agCalYear
                    setAgCalMonth(next)
                    setAgCalYear(year)
                }}
                onNextMonth={() => {
                    const next = agCalMonth === 11 ? 0 : agCalMonth + 1
                    const year = agCalMonth === 11 ? agCalYear + 1 : agCalYear
                    setAgCalMonth(next)
                    setAgCalYear(year)
                }}
                extra={<><div className="pp-divider" /><div className="pp-note">Glisser horizontalement une demande pour décaler les dates</div></>}
            />

            <div className="pp-ag-main">
                <div className="pp-ag-nav">
                    <button type="button" className="pp-nav-btn" onClick={() => { const next = addDays(agDate, -7); setAgDate(next); setAgCalMonth(next.getMonth()); setAgCalYear(next.getFullYear()) }}>‹</button>
                    <div className="pp-ag-period">{period} — {filtered.length} dem.</div>
                    <button type="button" className="pp-nav-btn" onClick={() => { const next = addDays(agDate, 7); setAgDate(next); setAgCalMonth(next.getMonth()); setAgCalYear(next.getFullYear()) }}>›</button>
                    <button type="button" className="pp-today-btn" onClick={() => { setAgDate(TODAY); setAgCalMonth(TODAY.getMonth()); setAgCalYear(TODAY.getFullYear()) }}>Aujourd'hui</button>
                </div>
                <div className="pp-ag-grid-wrap">
                    <div className="pp-ag-grid">
                        <div className="pp-ag-corner" />
                        {week.map((day, idx) => (
                            <div key={idx} className={`pp-ag-day-hdr ${sameDay(day, TODAY) ? 'today' : ''}`}>
                                <div>{DAYS_LONG[idx]}</div>
                                <div className="num">{day.getDate()}</div>
                            </div>
                        ))}

                        {filtered.map(item => {
                            const start = item.start ? new Date(item.start) : null
                            const end = item.ech ? new Date(item.ech) : null
                            if (!start || !end) return null
                            const gridStart = weekStart(agDate)
                            const offset = Math.round((weekStart(start) - gridStart) / 86400000)
                            const duration = Math.max(1, Math.round((end - start) / 86400000) + 1)
                            const itemIndex = filtered.findIndex(x => x.uid === item.uid)
                            const colStart = Math.max(1, offset + 1)
                            const colEnd = Math.min(8, colStart + duration)
                            const color = itemColor(item.uid)
                            return (
                                <div key={item.uid} className="pp-ag-row-fragment">
                                    <div className="pp-ag-label">
                                        <div className="pp-ag-ref">{item.ref}</div>
                                        <div className="pp-ag-title">{item.tit}</div>
                                    </div>
                                    {week.map((_, i) => <div key={i} className="pp-ag-cell" />)}
                                    <div
                                        className={`pp-ag-item ${urgencyBadgeClass(item.urg)}`}
                                        style={{
                                            gridColumn: `${colStart + 1} / ${colEnd + 1}`,
                                            gridRow: `${itemIndex + 2} / ${itemIndex + 3}`,
                                            background: color.bg,
                                            borderColor: color.border,
                                            color: color.text,
                                        }}
                                        draggable
                                        onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ uid: item.uid, start: item.start, ech: item.ech }))}
                                        onDoubleClick={() => onOpenPopup(item)}
                                    >
                                        <div className="pp-ag-item-ref">{item.ref}</div>
                                        <div className="pp-ag-item-title">{item.tit}</div>
                                        <div className="pp-ag-item-ft">{item.dst && 'DST · '}{item.labo || 'Labo à définir'}</div>
                                        <div className="pp-ag-resizers">
                                            <button type="button" onClick={() => onMoveDates(item.uid, -1, false)}>←</button>
                                            <button type="button" onClick={() => onMoveDates(item.uid, 1, false)}>→</button>
                                            <button type="button" onClick={() => onMoveDates(item.uid, -1, true)}>- fin</button>
                                            <button type="button" onClick={() => onMoveDates(item.uid, 1, true)}>+ fin</button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

function AgendaLaboView({ data, laboSlots, setLaboSlots, alDate, setAlDate, alCalYear, setAlCalYear, alCalMonth, setAlCalMonth, alDay, setAlDay, alView, setAlView, onOpenPopup }) {
    const visibleDays = alView === 'day' ? [new Date(alDate)] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(alDate), i))
    const period = alView === 'day'
        ? `${DAYS_LONG[(alDate.getDay() + 6) % 7]} ${alDate.getDate()} ${MONTHS_SHORT[alDate.getMonth()]} ${alDate.getFullYear()}`
        : `${visibleDays[0].getDate()} ${MONTHS_SHORT[visibleDays[0].getMonth()]} – ${visibleDays[visibleDays.length - 1].getDate()} ${MONTHS_SHORT[visibleDays[visibleDays.length - 1].getMonth()]} ${visibleDays[visibleDays.length - 1].getFullYear()}`

    const moveSlot = (id, changes) => {
        setLaboSlots(prev => prev.map(slot => slot.id === id ? { ...slot, ...changes } : slot))
    }

    return (
        <div className="pp-view on">
            <Sidebar
                data={data}
                year={alCalYear}
                month={alCalMonth}
                selectedDay={alDay}
                onSelectDay={(day) => {
                    setAlDay(day)
                    if (day) {
                        const next = new Date(alCalYear, alCalMonth, day)
                        setAlDate(next)
                    }
                }}
                onPrevMonth={() => {
                    const next = alCalMonth === 0 ? 11 : alCalMonth - 1
                    const year = alCalMonth === 0 ? alCalYear - 1 : alCalYear
                    setAlCalMonth(next)
                    setAlCalYear(year)
                }}
                onNextMonth={() => {
                    const next = alCalMonth === 11 ? 0 : alCalMonth + 1
                    const year = alCalMonth === 11 ? alCalYear + 1 : alCalYear
                    setAlCalMonth(next)
                    setAlCalYear(year)
                }}
                extra={<><div className="pp-divider" /><div className="pp-note">Planning labo — interventions & équipements</div></>}
            />
            <div className="pp-al-main">
                <div className="pp-ag-nav">
                    <button type="button" className="pp-nav-btn" onClick={() => { const next = addDays(alDate, alView === 'day' ? -1 : -7); setAlDate(next); setAlCalMonth(next.getMonth()); setAlCalYear(next.getFullYear()) }}>‹</button>
                    <div className="pp-ag-period">{period}</div>
                    <button type="button" className="pp-nav-btn" onClick={() => { const next = addDays(alDate, alView === 'day' ? 1 : 7); setAlDate(next); setAlCalMonth(next.getMonth()); setAlCalYear(next.getFullYear()) }}>›</button>
                    <button type="button" className="pp-today-btn" onClick={() => { setAlDate(TODAY); setAlCalMonth(TODAY.getMonth()); setAlCalYear(TODAY.getFullYear()) }}>Aujourd'hui</button>
                    <div className="spacer" />
                    <div className="pp-switches">
                        <button type="button" className={alView === 'day' ? 'on' : ''} onClick={() => setAlView('day')}>Jour</button>
                        <button type="button" className={alView === 'week' ? 'on' : ''} onClick={() => setAlView('week')}>Semaine</button>
                    </div>
                </div>

                <div className="pp-al-header-row">
                    <div className="pp-al-hour-corner" />
                    <div className="pp-al-days-row">
                        {visibleDays.map(day => (
                            <div key={day.toISOString()} className={`pp-al-day-hdr ${sameDay(day, TODAY) ? 'today' : ''}`}>
                                <div className="name">{DAYS[(day.getDay() + 6) % 7]}</div>
                                <div className="num">{day.getDate()}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pp-al-body">
                    <div className="pp-al-hours-col">
                        {HOURS.map(h => <div key={h} className="pp-al-hour">{h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</div>)}
                    </div>
                    <div className="pp-al-days-row body">
                        {visibleDays.map((day, colIndex) => {
                            const ds = toIsoDate(day)
                            return (
                                <div key={ds} className="pp-al-day-col">
                                    {HOURS.map(h => <div key={h} className={`pp-al-grid-cell ${sameDay(day, TODAY) ? 'today' : ''}`} />)}
                                    {laboSlots.filter(slot => slot.date === ds).map(slot => {
                                        const top = slot.th * HOUR_PX + 2
                                        const height = Math.max(20, (slot.te - slot.th) * HOUR_PX - 4)
                                        const palette = ITEM_COLORS[slot.col % ITEM_COLORS.length]
                                        const spanDays = Math.max(1, Math.round((new Date(slot.dateEnd) - new Date(slot.date)) / 86400000) + 1)
                                        const visibleSpan = Math.min(spanDays, visibleDays.length - colIndex)
                                        return (
                                            <div
                                                key={slot.id}
                                                className="pp-al-slot"
                                                style={{
                                                    top,
                                                    height,
                                                    width: visibleSpan > 1 ? `calc(${visibleSpan * 100}% - 4px)` : 'calc(100% - 4px)',
                                                    background: palette.bg,
                                                    borderColor: palette.border,
                                                    color: palette.text,
                                                }}
                                                onDoubleClick={() => onOpenPopup({ uid: -1, ref: slot.id, tit: slot.label, stat: slot.labo, start: slot.date, ech: slot.dateEnd, th: slot.th, te: slot.te })}
                                            >
                                                <div className="pp-al-slot-ref">{slot.id}</div>
                                                <div className="pp-al-slot-title">{slot.label}</div>
                                                <div className="pp-al-slot-time">{String(slot.th).padStart(2, '0')}:00–{String(slot.te).padStart(2, '0')}:00{spanDays > 1 ? ` · ${spanDays}j` : ''}</div>
                                                <div className="pp-al-slot-labo">{slot.labo}</div>
                                                <div className="pp-al-slot-actions">
                                                    <button type="button" onClick={() => moveSlot(slot.id, { th: Math.max(0, slot.th - 1), te: Math.max(slot.th, slot.te - 1) })}>↑</button>
                                                    <button type="button" onClick={() => moveSlot(slot.id, { th: Math.min(22, slot.th + 1), te: Math.min(24, slot.te + 1) })}>↓</button>
                                                    <button type="button" onClick={() => moveSlot(slot.id, { te: Math.min(24, slot.te + 1) })}>+h</button>
                                                    <button type="button" onClick={() => moveSlot(slot.id, { dateEnd: toIsoDate(addDays(new Date(slot.dateEnd), 1)) })}>+j</button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

function AnalyserView({ data, zoom, setZoom, refDate, setRefDate }) {
    const year = refDate.getFullYear()
    const month = refDate.getMonth()
    const late = data.filter(d => d.urg === 'late').length
    const soon = data.filter(d => d.urg === 'soon').length
    const total = Math.max(1, data.length)
    const spark = Array.from({ length: 6 }, (_, i) => {
        const m = new Date(year, month - (5 - i), 1)
        const n = data.filter(x => x.ech && new Date(x.ech).getMonth() === m.getMonth() && new Date(x.ech).getFullYear() === m.getFullYear()).length
        return { l: MONTHS_SHORT[m.getMonth()], n }
    })
    const sparkMax = Math.max(...spark.map(x => x.n), 1)

    let period = ''
    let content = null

    if (zoom === 'week') {
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart(refDate), i))
        period = `${days[0].getDate()}/${days[0].getMonth() + 1} – ${days[6].getDate()}/${days[6].getMonth() + 1}/${days[6].getFullYear()}`
        const labs = ['Saint-Priest', 'Chambéry', 'Pont-du-Ch.', 'À définir']
        content = (
            <div className="pp-t4-week-grid">
                <div className="pp-t4-week-hdr empty" />
                {days.map((d, i) => <div key={i} className="pp-t4-week-hdr">{DAYS[i]} {d.getDate()}/{d.getMonth() + 1}</div>)}
                {labs.flatMap(lab => {
                    const labData = data.filter(d => lab === 'À définir' ? !d.labo : d.labo === lab)
                    return [
                        <div key={`${lab}-lbl`} className="pp-t4-week-lab">{lab}</div>,
                        ...days.map((d, i) => {
                            const items = labData.filter(x => x.ech && sameDay(new Date(x.ech), d))
                            return (
                                <div key={`${lab}-${i}`} className={`pp-t4-week-cell ${dayClass(items.length, items.find(x => x.urg === 'late') ? 'late' : items.find(x => x.urg === 'soon') ? 'soon' : items.length ? 'ok' : null)}`}>
                                    {items.slice(0, 3).map(x => <div key={x.uid} className={`pp-t4-chip ${x.urg}`}>{x.ref}</div>)}
                                    {items.length > 3 && <div className="pp-t4-more">+{items.length - 3}</div>}
                                </div>
                            )
                        })
                    ]
                })}
            </div>
        )
    } else if (zoom === 'month') {
        period = `${MONTHS[month]} ${year}`
        const first = new Date(year, month, 1)
        const last = new Date(year, month + 1, 0).getDate()
        const offset = (first.getDay() + 6) % 7
        const cells = []
        for (let i = 0; i < offset; i += 1) cells.push(<div key={`e-${i}`} className="pp-t4-month-cell other" />)
        for (let d = 1; d <= last; d += 1) {
            const day = new Date(year, month, d)
            const items = data.filter(x => x.ech && sameDay(new Date(x.ech), day))
            cells.push(
                <div key={d} className={`pp-t4-month-cell ${sameDay(day, TODAY) ? 'today' : ''}`}>
                    <div className="pp-t4-month-day">{d}</div>
                    {items.slice(0, 2).map(x => <div key={x.uid} className={`pp-t4-month-evt ${x.urg}`}>{x.ref}</div>)}
                    {items.length > 2 && <div className="pp-t4-more">+{items.length - 2}</div>}
                </div>
            )
        }
        while (cells.length % 7 !== 0) cells.push(<div key={`x-${cells.length}`} className="pp-t4-month-cell other" />)
        content = (
            <div className="pp-t4-month-grid">
                {DAYS.map((d, i) => <div key={`h-${i}`} className="pp-t4-month-hdr">{d}</div>)}
                {cells}
            </div>
        )
    } else {
        period = `Année ${year}`
        content = (
            <div className="pp-t4-year-grid">
                {Array.from({ length: 12 }, (_, mi) => {
                    const first = new Date(year, mi, 1)
                    const last = new Date(year, mi + 1, 0).getDate()
                    const offset = (first.getDay() + 6) % 7
                    const stats = buildHeatmapStats(data, year, mi)
                    const cells = []
                    for (let i = 0; i < offset; i += 1) cells.push(<div key={`e-${i}`} className="pp-t4-year-day empty" />)
                    for (let d = 1; d <= last; d += 1) {
                        cells.push(<div key={d} className={`pp-t4-year-day ${dayClass(stats.counts[d] || 0, stats.urgencies[d])}`} />)
                    }
                    while (cells.length % 7 !== 0) cells.push(<div key={`x-${cells.length}`} className="pp-t4-year-day empty" />)
                    return (
                        <div key={mi} className="pp-t4-year-month">
                            <div className="pp-t4-year-title">{MONTHS_SHORT[mi]}</div>
                            <div className="pp-t4-year-mini-grid">
                                {DAYS.map((d, i) => <div key={`h-${i}`} className="pp-t4-year-hdr">{d}</div>)}
                                {cells}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div className="pp-view on">
            <Sidebar
                data={data}
                year={refDate.getFullYear()}
                month={refDate.getMonth()}
                selectedDay={null}
                onSelectDay={() => {}}
                onPrevMonth={() => {}}
                onNextMonth={() => {}}
                extra={(
                    <>
                        <div className="pp-divider" />
                        <div className="pp-sidebar-stats-grid compact">
                            <div className="pp-sidebar-stat"><div className="n danger">{late}</div><div className="l">Retard</div></div>
                            <div className="pp-sidebar-stat"><div className="n warn">{soon}</div><div className="l">Urgent</div></div>
                        </div>
                        <div className="pp-progress"><div className="pp-progress-bar" style={{ width: `${Math.round((late / total) * 100)}%` }} /></div>
                        <div className="pp-divider" />
                        <div className="pp-sidebar-sec">Charge 6 mois</div>
                        <div className="pp-spark">
                            {spark.map(item => <div key={item.l} className="pp-spark-bar" style={{ height: `${Math.max(3, Math.round((item.n / sparkMax) * 20))}px` }} />)}
                        </div>
                        <div className="pp-spark-labels">{spark.map(item => <span key={item.l}>{item.l}</span>)}</div>
                    </>
                )}
            />
            <div className="pp-t4-wrap">
                <div className="pp-t4-toolbar">
                    <div className="pp-switches">
                        <button type="button" className={zoom === 'week' ? 'on' : ''} onClick={() => setZoom('week')}>Semaine</button>
                        <button type="button" className={zoom === 'month' ? 'on' : ''} onClick={() => setZoom('month')}>Mois</button>
                        <button type="button" className={zoom === 'year' ? 'on' : ''} onClick={() => setZoom('year')}>Année</button>
                    </div>
                    <div className="pp-t4-nav">
                        <button type="button" className="pp-nav-btn" onClick={() => setRefDate(prev => zoom === 'week' ? addDays(prev, -7) : zoom === 'month' ? new Date(prev.getFullYear(), prev.getMonth() - 1, 1) : new Date(prev.getFullYear() - 1, prev.getMonth(), 1))}>‹</button>
                        <div className="pp-ag-period">{period}</div>
                        <button type="button" className="pp-nav-btn" onClick={() => setRefDate(prev => zoom === 'week' ? addDays(prev, 7) : zoom === 'month' ? new Date(prev.getFullYear(), prev.getMonth() + 1, 1) : new Date(prev.getFullYear() + 1, prev.getMonth(), 1))}>›</button>
                    </div>
                    <button type="button" className="pp-today-btn" onClick={() => setRefDate(new Date(2026, 2, 1))}>Aujourd'hui</button>
                    <div className="spacer" />
                    <div className="pp-legend">
                        <span><span className="pp-lb c0" />0</span>
                        <span><span className="pp-lb c1" />1</span>
                        <span><span className="pp-lb c2" />2</span>
                        <span><span className="pp-lb c3" />3</span>
                        <span><span className="pp-lb c4" />4+</span>
                        <span><span className="pp-lb clate" />Ret.</span>
                        <span><span className="pp-lb cwarn" />Urg.</span>
                    </div>
                </div>
                <div className="pp-t4-content">{content}</div>
            </div>
        </div>
    )
}

export default function PlanningPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const demandeContextUid = Number(searchParams.get('demande_id') || 0) || 0

    const [data, setData] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [activeTab, setActiveTab] = useState(1)
    const [globalFilter, setGlobalFilter] = useState('all')
    const [laboFilter, setLaboFilter] = useState('')
    const [calendarYear, setCalendarYear] = useState(2026)
    const [calendarMonth, setCalendarMonth] = useState(2)
    const [selectedDay, setSelectedDay] = useState(null)
    const [agDate, setAgDate] = useState(TODAY)
    const [agDay, setAgDay] = useState(null)
    const [agCalYear, setAgCalYear] = useState(2026)
    const [agCalMonth, setAgCalMonth] = useState(2)
    const [alDate, setAlDate] = useState(TODAY)
    const [alDay, setAlDay] = useState(null)
    const [alCalYear, setAlCalYear] = useState(2026)
    const [alCalMonth, setAlCalMonth] = useState(2)
    const [alView, setAlView] = useState('week')
    const [analyserZoom, setAnalyserZoom] = useState('month')
    const [analyserRefDate, setAnalyserRefDate] = useState(new Date(2026, 2, 1))
    const [popupItem, setPopupItem] = useState(null)
    const [laboSlots, setLaboSlots] = useState(LABO_DATA_INITIAL)
    const [context, setContext] = useState(null)
    const [contextLocked, setContextLocked] = useState(false)

    const saveTimer = useRef(new Map())

    useEffect(() => {
        let alive = true
        async function loadContextAndData() {
            setLoading(true)
            setError('')
            try {
                let currentContext = null
                let locked = false
                if (demandeContextUid) {
                    const [demande, nav] = await Promise.all([
                        demandesApi.get(demandeContextUid).catch(() => null),
                        apiSafeNavigation(demandeContextUid),
                    ])
                    currentContext = demande
                    locked = !!(demandeContextUid && !nav?.visibility?.planning)
                }

                const raw = await planningApi.list().catch(() => DEMO_DATA)
                let scoped = raw
                if (demandeContextUid) {
                    scoped = raw.filter(d => Number(d.uid) === demandeContextUid)
                    if (locked) scoped = []
                }
                const prepared = scoped.map(item => ({
                    ...item,
                    start: item.start || null,
                    ech: item.ech || null,
                    th: item.th || (8 + (item.uid % 3) * 2),
                    te: item.te || ((item.th || 8) + 2),
                    urg: urgencyForDate(item.ech),
                }))
                if (!alive) return
                setContext(currentContext)
                setContextLocked(locked)
                setData(prepared)
            } catch (err) {
                if (!alive) return
                setError(err.message || 'Erreur de chargement du planning')
                setData(DEMO_DATA)
            } finally {
                if (alive) setLoading(false)
            }
        }
        loadContextAndData()
        return () => { alive = false }
    }, [demandeContextUid])

    const filteredData = useMemo(() => buildFilteredData(data, globalFilter, laboFilter), [data, globalFilter, laboFilter])
    const activeCount = filteredData.filter(d => ACTIVE_STATUSES.includes(d.stat)).length
    const lateCount = filteredData.filter(d => d.urg === 'late').length
    const soonCount = filteredData.filter(d => d.urg === 'soon' || d.urg === 'late').length
    const dstCount = filteredData.filter(d => d.dst).length
    const labs = useMemo(() => [...new Set(data.map(d => d.labo).filter(Boolean))], [data])

    const patchItem = (uid, patch, silent = false) => {
        if (contextLocked) return
        setData(prev => prev.map(item => {
            if (item.uid !== uid) return item
            const updated = { ...item, ...patch }
            updated.urg = urgencyForDate(updated.ech)
            return updated
        }))
        if (!silent) scheduleSave(uid, patch)
    }

    const scheduleSave = (uid, patch) => {
        const existing = saveTimer.current.get(uid)
        if (existing) clearTimeout(existing.timeout)
        const merged = { ...(existing?.patch || {}), ...patch }
        const timeout = setTimeout(async () => {
            try {
                await planningApi.update(uid, { start: merged.start, ech: merged.ech, stat: merged.stat })
            } catch (_err) {}
            saveTimer.current.delete(uid)
        }, 250)
        saveTimer.current.set(uid, { patch: merged, timeout })
    }

    const moveStatus = (uid, status) => {
        patchItem(uid, { stat: status })
    }

    const moveDates = (uid, offset, resizeEnd = false) => {
        const item = data.find(d => d.uid === uid)
        if (!item || !item.start || !item.ech) return
        if (resizeEnd) {
            const nextEnd = addDays(new Date(item.ech), offset)
            if (nextEnd < new Date(item.start)) return
            patchItem(uid, { ech: toIsoDate(nextEnd) })
            return
        }
        patchItem(uid, {
            start: toIsoDate(addDays(new Date(item.start), offset)),
            ech: toIsoDate(addDays(new Date(item.ech), offset)),
        })
    }

    const savePopup = (updated) => {
        if (updated.uid > 0) {
            patchItem(updated.uid, { start: updated.start, ech: updated.ech })
            setData(prev => prev.map(item => item.uid === updated.uid ? { ...item, th: updated.th, te: updated.te } : item))
        }
        setPopupItem(null)
    }

    const contextBanner = demandeContextUid ? (
        <div className={`pp-context-banner ${demandeContextUid ? 'show' : ''}`}>
            <div>
                <strong>{contextLocked ? `Planning non activé pour ${context?.reference || `Demande #${demandeContextUid}`}` : `Planning ciblé sur ${context?.reference || `Demande #${demandeContextUid}`}`}</strong>
                <span>
                    {contextLocked
                        ? "Cette demande n'ouvre pas le bloc planning pour le moment."
                        : `${context?.chantier || context?.client || '—'} · cette vue est filtrée sur la demande courante.`}
                </span>
            </div>
            <div className="actions">
                <button type="button" onClick={() => navigate(`/demandes/${demandeContextUid}`)}>← Retour demande</button>
                {!contextLocked && <button type="button" onClick={() => navigate('/planning')}>Planning global</button>}
            </div>
        </div>
    ) : null

    return (
        <div className="ralab-planning-page -m-6 h-[calc(100vh-0px)] overflow-hidden">
            <div className="pp-shell">
                <div className="pp-topbar">
                    <div className="pp-brand"><div className="pp-logo">RaLab<span>5</span></div></div>
                    <div className="pp-sep" />
                    <div className="pp-tabs">
                        <button type="button" className={`pp-tab ${activeTab === 1 ? 'on' : ''}`} onClick={() => setActiveTab(1)}>🗂 Organiser</button>
                        <button type="button" className={`pp-tab ${activeTab === 2 ? 'on' : ''}`} onClick={() => setActiveTab(2)}>📋 Agenda Demandes</button>
                        <button type="button" className={`pp-tab ${activeTab === 3 ? 'on' : ''}`} onClick={() => setActiveTab(3)}>🏗 Agenda Labo</button>
                        <button type="button" className={`pp-tab ${activeTab === 4 ? 'on' : ''}`} onClick={() => setActiveTab(4)}>🔥 Analyser</button>
                    </div>
                    <div className="pp-topbar-right">
                        <select className="pp-filter-select" value={laboFilter} onChange={e => setLaboFilter(e.target.value)}>
                            <option value="">Tous les labos</option>
                            {labs.map(lab => <option key={lab} value={lab}>{lab}</option>)}
                        </select>
                        {[
                            ['all', activeCount, 'Total'],
                            ['late', lateCount, 'Retard'],
                            ['soon', soonCount, 'Urgent'],
                            ['dst', dstCount, 'DST'],
                        ].map(([key, count, label]) => (
                            <button key={key} type="button" className={`pp-stat-btn ${globalFilter === key ? 'on' : ''}`} onClick={() => setGlobalFilter(key)}>
                                <div className="num">{count}</div>
                                <div className="lab">{label}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {contextBanner}

                {loading ? (
                    <div className="pp-loading">Chargement du planning…</div>
                ) : (
                    <>
                        {error && <div className="pp-error-banner">{error}</div>}

                        {activeTab === 1 && (
                            <KanbanView
                                data={filteredData.filter(d => ACTIVE_STATUSES.includes(d.stat) || ARCHIVED_STATUSES.includes(d.stat))}
                                selectedDay={selectedDay}
                                calendarYear={calendarYear}
                                calendarMonth={calendarMonth}
                                onSelectDay={setSelectedDay}
                                onPrevMonth={() => {
                                    const next = calendarMonth === 0 ? 11 : calendarMonth - 1
                                    const year = calendarMonth === 0 ? calendarYear - 1 : calendarYear
                                    setCalendarMonth(next)
                                    setCalendarYear(year)
                                }}
                                onNextMonth={() => {
                                    const next = calendarMonth === 11 ? 0 : calendarMonth + 1
                                    const year = calendarMonth === 11 ? calendarYear + 1 : calendarYear
                                    setCalendarMonth(next)
                                    setCalendarYear(year)
                                }}
                                onOpenPopup={setPopupItem}
                                onMoveStatus={moveStatus}
                                onShowAgenda={(item) => { setActiveTab(2); setAgDate(item.start ? new Date(item.start) : TODAY) }}
                            />
                        )}

                        {activeTab === 2 && (
                            <AgendaDemandesView
                                data={filteredData}
                                agDate={agDate}
                                setAgDate={setAgDate}
                                agDay={agDay}
                                setAgDay={setAgDay}
                                agCalYear={agCalYear}
                                setAgCalYear={setAgCalYear}
                                agCalMonth={agCalMonth}
                                setAgCalMonth={setAgCalMonth}
                                onOpenPopup={setPopupItem}
                                onMoveDates={moveDates}
                            />
                        )}

                        {activeTab === 3 && (
                            <AgendaLaboView
                                data={filteredData}
                                laboSlots={laboSlots}
                                setLaboSlots={setLaboSlots}
                                alDate={alDate}
                                setAlDate={setAlDate}
                                alCalYear={alCalYear}
                                setAlCalYear={setAlCalYear}
                                alCalMonth={alCalMonth}
                                setAlCalMonth={setAlCalMonth}
                                alDay={alDay}
                                setAlDay={setAlDay}
                                alView={alView}
                                setAlView={setAlView}
                                onOpenPopup={setPopupItem}
                            />
                        )}

                        {activeTab === 4 && (
                            <AnalyserView
                                data={filteredData}
                                zoom={analyserZoom}
                                setZoom={setAnalyserZoom}
                                refDate={analyserRefDate}
                                setRefDate={setAnalyserRefDate}
                            />
                        )}
                    </>
                )}
            </div>

            {popupItem && popupItem.uid > 0 && (
                <DemandePopup
                    item={popupItem}
                    onClose={() => setPopupItem(null)}
                    onSave={savePopup}
                    onGoToDemande={() => navigate(`/demandes/${popupItem.uid}`)}
                />
            )}
        </div>
    )
}

async function apiSafeNavigation(uid) {
    try {
        return await demandesApi.navigation(uid)
    } catch (_err) {
        return null
    }
}
