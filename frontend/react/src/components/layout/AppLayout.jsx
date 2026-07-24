import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
    Archive,
    BookOpen,
    Briefcase,
    Building2,
    Calendar,
    CheckCircle2,
    ChevronDown,
    Compass,
    Contact,
    FileText,
    FlaskConical,
    FolderKanban,
    FolderOpen,
    Handshake,
    LayoutDashboard,
    LayoutGrid,
    LogOut,
    MapPin,
    PanelLeft,
    PanelLeftClose,
    Search,
    Settings,
    Wrench,
} from 'lucide-react'
import { getUserHomeConfig } from '@/lib/userHome'
import { getRegionalRstShortLabel, isRegionalRstUser } from '@/lib/userOrgScope'
import { hasPermission } from '@/lib/permissions'
import {
    findResponsibleLaboProfileByUser,
    getResponsibleLaboHomeRoute,
} from '@/lib/responsibleLaboProfiles'
import {
    findTechnicianProfileByUser,
    getTechnicianHomeRoute,
} from '@/lib/technicianProfiles'
import {
    UI_DENSITY_AUTO_MQ,
    cycleUiDensityPreference,
    loadUiDensityPreference,
    resolveUiDensity,
    uiDensityPreferenceLabel,
} from '@/lib/uiDensity'

const SIDEBAR_WIDTH = 'var(--app-sidebar-w)'
const SIDEBAR_SECTIONS_KEY = 'ralab5.sidebarSections'

function loadCollapsedSections() {
    if (typeof window === 'undefined') {
        return new Set()
    }

    try {
        const raw = window.localStorage.getItem(SIDEBAR_SECTIONS_KEY)
        if (raw) {
            return new Set(JSON.parse(raw))
        }
    } catch {
        // ignore invalid persisted state
    }

    return new Set()
}

function navItemMatchesPath(pathname, item) {
    const target = String(item.to || '').split('#')[0]
    if (!target) return false
    if (item.end) return pathname === target
    return pathname === target || pathname.startsWith(`${target}/`)
}

function SidebarSection({ label, first = false, open, onToggle }) {
    const handleToggle = (event) => {
        onToggle()
        event.currentTarget.blur()
    }

    return (
        <button
            type="button"
            onClick={handleToggle}
            aria-expanded={open}
            className={`app-sidebar-section mx-3 flex w-[calc(100%-24px)] items-center gap-2 bg-transparent py-1.5 pl-0 pr-0 text-left ${
                first ? 'mt-1' : 'mt-3'
            }`}
        >
            <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-[#ffcc00]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-[.14em] text-[#ffcc00]">
                {label}
            </span>
            <ChevronDown
                size={13}
                strokeWidth={2.5}
                aria-hidden
                className={`shrink-0 text-[#ffcc00] transition-transform duration-150 ${open ? '' : '-rotate-90'}`}
            />
        </button>
    )
}

function SidebarNavItem({ item }) {
    const Icon = item.icon

    if (item.disabled) {
        return (
            <div className="mx-2 flex cursor-not-allowed select-none items-center gap-2.5 rounded-lg px-3 py-2 opacity-35">
                <Icon size={16} strokeWidth={2} aria-hidden className="shrink-0" />
                <span className="truncate text-[13px]">{item.label}</span>
            </div>
        )
    }

    return (
        <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
                `mx-2 flex items-center gap-2.5 rounded-lg border-l-[3px] px-3 py-2 text-[13px] transition-colors ${
                    isActive
                        ? 'border-[#ffcc00] bg-white/12 font-semibold !text-white'
                        : 'border-transparent font-medium hover:bg-white/[0.06]'
                }`
            }
        >
            {({ isActive }) => (
                <>
                    <Icon
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                        className={`shrink-0 ${isActive ? 'text-[#ffcc00]' : 'text-[#ffcc00]/80'}`}
                    />
                    <span className="min-w-0 flex-1 truncate leading-snug">{item.label}</span>
                </>
            )}
        </NavLink>
    )
}

export default function AppLayout() {
    const { user, logout } = useAuth()
    const location = useLocation()
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') {
            return true
        }

        return window.localStorage.getItem('ralab5.sidebarOpen') !== '0'
    })
    const [collapsedSections, setCollapsedSections] = useState(loadCollapsedSections)
    const [densityPref, setDensityPref] = useState(loadUiDensityPreference)
    const [compactViewport, setCompactViewport] = useState(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false
        return window.matchMedia(UI_DENSITY_AUTO_MQ).matches
    })
    const chromeBarRef = useRef(null)
    const prevPathRef = useRef(location.pathname)
    const [chromeBarHeight, setChromeBarHeight] = useState(0)
    const density = resolveUiDensity(densityPref, compactViewport)
    const isEmbeddedView = new URLSearchParams(location.search).get('embed') === '1' && (
        location.pathname.startsWith('/rapports/')
        || location.pathname.startsWith('/qualite/qsse/documents/view')
    )
    const home = getUserHomeConfig(user)
    const regionalRst = isRegionalRstUser(user)
    const ownResponsibleLaboProfile = findResponsibleLaboProfileByUser(user)
    const ownTechnicianProfile = ownResponsibleLaboProfile ? null : findTechnicianProfileByUser(user)
    const ownLegacyDashboard = ownResponsibleLaboProfile
        ? {
            to: getResponsibleLaboHomeRoute(ownResponsibleLaboProfile),
            icon: Compass,
            label: ownResponsibleLaboProfile.title,
        }
        : ownTechnicianProfile
            ? {
                to: getTechnicianHomeRoute(ownTechnicianProfile),
                icon: Compass,
                label: ownTechnicianProfile.displayName,
            }
            : null
    const canBrowseUserDashboards = hasPermission(user, 'manage_users')
    const dashboardCatalogLink = canBrowseUserDashboards
        ? {
            to: '/tools#dashboards-metier',
            icon: LayoutGrid,
            label: 'Catalogue vues métier',
        }
        : null
    const initials = user?.display_name
        ?.split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'

    const homePermission = home.path === '/labo' ? 'view_labo' : 'view_dashboard'

    const nav = [
        {
            section: 'Pilotage',
            items: [
                { to: home.path, icon: LayoutDashboard, label: home.navLabel, end: home.path !== '/dashboard', permission: homePermission },
                { to: '/planning', icon: Calendar, label: 'Planning', permission: 'view_planning' },
                ...(ownLegacyDashboard ? [{ ...ownLegacyDashboard, label: `Dashboard · ${ownLegacyDashboard.label}` }] : []),
            ],
        },
        {
            section: 'Affaires RST',
            items: [
                { to: '/affaires', icon: Briefcase, label: 'Affaires' },
                { to: '/demandes', icon: FolderOpen, label: 'Demandes', permission: 'view_demandes' },
                { to: '/passations', icon: Handshake, label: 'Passations' },
            ],
        },
        {
            section: 'Affaires NGE & études',
            items: [
                { to: '/affaires-nge', icon: Building2, label: 'Affaires NGE' },
                { to: '/dst', icon: Archive, label: 'DST' },
                { to: '/etudes', icon: BookOpen, label: 'Études', permission: 'view_etudes' },
            ],
        },
        {
            section: 'G3',
            items: [
                { to: '/g3', icon: MapPin, label: 'Hub G3', end: true },
                { to: '/g3/missions', icon: FolderKanban, label: 'Missions EXE' },
                { to: '/g3/notes-techniques', icon: FileText, label: 'Notes techniques' },
            ],
        },
        {
            section: 'Laboratoire',
            items: home.path === '/labo'
                ? []
                : [{ to: '/labo', icon: FlaskConical, label: 'Portail laboratoire', permission: 'view_labo' }],
        },
        {
            section: 'Qualité',
            items: [
                { to: '/qualite', icon: Search, label: 'Audits / Qualité' },
            ],
        },
        {
            section: 'Administration',
            items: [
                { to: '/contacts', icon: Contact, label: 'Contacts' },
                { to: '/rapports/validation', icon: CheckCircle2, label: 'Validation rapports', permission: 'view_tools' },
                { to: '/tools', icon: Wrench, label: 'Outils', permission: 'view_tools' },
                ...(dashboardCatalogLink ? [dashboardCatalogLink] : []),
                { to: '/admin', icon: Settings, label: 'Administration', permission: 'manage_users' },
            ],
        },
    ]

    const visibleNav = nav
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => !item.permission || hasPermission(user, item.permission)),
        }))
        .filter((group) => group.items.length > 0)

    useEffect(() => {
        window.localStorage.setItem('ralab5.sidebarOpen', sidebarOpen ? '1' : '0')
    }, [sidebarOpen])

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined
        const mq = window.matchMedia(UI_DENSITY_AUTO_MQ)
        const onChange = () => setCompactViewport(mq.matches)
        onChange()
        if (mq.addEventListener) mq.addEventListener('change', onChange)
        else mq.addListener(onChange)
        return () => {
            if (mq.removeEventListener) mq.removeEventListener('change', onChange)
            else mq.removeListener(onChange)
        }
    }, [])

    useEffect(() => {
        window.localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify([...collapsedSections]))
    }, [collapsedSections])

    useEffect(() => {
        if (prevPathRef.current === location.pathname) return
        prevPathRef.current = location.pathname

        const activeSection = visibleNav.find((group) =>
            group.items.some((item) => navItemMatchesPath(location.pathname, item)),
        )
        if (!activeSection) return

        setCollapsedSections((current) => {
            if (!current.has(activeSection.section)) return current
            const next = new Set(current)
            next.delete(activeSection.section)
            return next
        })
    }, [location.pathname, visibleNav])

    const toggleSection = (section) => {
        setCollapsedSections((current) => {
            const next = new Set(current)
            if (next.has(section)) {
                next.delete(section)
            } else {
                next.add(section)
            }
            return next
        })
    }

    const collapseAllSections = () => {
        setCollapsedSections(new Set(visibleNav.map((group) => group.section)))
    }

    const expandAllSections = () => {
        setCollapsedSections(new Set())
    }

    const allSectionsCollapsed = visibleNav.length > 0
        && visibleNav.every((group) => collapsedSections.has(group.section))

    useLayoutEffect(() => {
        const node = chromeBarRef.current
        if (!node) return undefined
        const update = () => setChromeBarHeight(node.offsetHeight)
        update()
        const observer = new ResizeObserver(update)
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    if (isEmbeddedView) {
        return <Outlet />
    }

    return (
        <div
            className="app-shell flex h-screen overflow-hidden"
            data-density={density}
            style={{
                '--app-sidebar-width': sidebarOpen ? SIDEBAR_WIDTH : '0px',
                '--app-chrome-top': `${chromeBarHeight}px`,
            }}
        >
            <aside
                className={`app-sidebar flex shrink-0 flex-col overflow-hidden transition-[width,min-width] duration-200 ease-in-out ${
                    sidebarOpen ? 'app-sidebar-open' : 'w-0 min-w-0'
                }`}
                style={sidebarOpen ? {
                    width: 'var(--app-sidebar-w)',
                    minWidth: 'var(--app-sidebar-w)',
                } : undefined}
            >
                <div className="app-sidebar-panel flex h-full flex-col">
                    <div className="shrink-0 border-b border-white/10 px-4 pb-4 pt-3">
                        <div className="app-chrome-stripe mb-3" />
                        <h1 className="text-[17px] font-black leading-none tracking-tight text-white">RaLab5</h1>
                        <p className="mt-1 text-[11px] font-semibold text-[#ffcc00]">Laboratoire géotechnique</p>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-1 border-b border-white/10 px-3 py-2">
                        <button
                            type="button"
                            onClick={expandAllSections}
                            disabled={collapsedSections.size === 0}
                            className="rounded px-2 py-1 text-[10px] font-semibold text-white/75 transition-colors hover:bg-white/[0.06] hover:text-[#ffcc00] disabled:pointer-events-none disabled:opacity-35"
                        >
                            Tout ouvrir
                        </button>
                        <span className="text-white/20">·</span>
                        <button
                            type="button"
                            onClick={collapseAllSections}
                            disabled={allSectionsCollapsed}
                            className="rounded px-2 py-1 text-[10px] font-semibold text-white/75 transition-colors hover:bg-white/[0.06] hover:text-[#ffcc00] disabled:pointer-events-none disabled:opacity-35"
                        >
                            Tout replier
                        </button>
                    </div>

                    <nav className="flex-1 overflow-y-auto pb-3 pt-1">
                        {visibleNav.map((group, groupIndex) => {
                            const isOpen = !collapsedSections.has(group.section)

                            return (
                                <div key={group.section}>
                                    <SidebarSection
                                        label={group.section}
                                        first={groupIndex === 0}
                                        open={isOpen}
                                        onToggle={() => toggleSection(group.section)}
                                    />
                                    {isOpen ? group.items.map((item) => (
                                        <SidebarNavItem key={item.to || item.label} item={item} />
                                    )) : null}
                                </div>
                            )
                        })}
                    </nav>

                    <div className="shrink-0 border-t border-white/10 px-4 py-3">
                        <div className="mb-3 flex items-center gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ffcc00] text-xs font-black text-[#003170]">
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-[13px] font-semibold text-white">
                                    {user?.display_name || user?.email || '—'}
                                </p>
                                <p className="truncate text-[11px] text-white/75">
                                    {regionalRst ? getRegionalRstShortLabel() : (user?.role || '')}
                                </p>
                                {user?.service_code ? (
                                    <p className="truncate text-[10px] font-bold text-[#ffcc00]">{user.service_code}</p>
                                ) : null}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={logout}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 py-2 text-xs font-semibold text-white/85 transition-colors hover:border-[#ffcc00]/50 hover:bg-white/[0.06] hover:text-white"
                        >
                            <LogOut size={13} />
                            Déconnexion
                        </button>
                    </div>
                </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div
                    ref={chromeBarRef}
                    className="shrink-0 border-b border-border bg-surface/96 backdrop-blur-sm"
                    style={{ boxShadow: '0 4px 18px rgba(0,49,112,0.06)' }}
                >
                    <div className="app-chrome-stripe" />
                    <div className="flex items-center gap-2 px-3 py-1.5">
                        <button
                            type="button"
                            onClick={() => setSidebarOpen((value) => !value)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-xs font-semibold leading-none text-text-muted transition-colors hover:border-[#ffcc00]/35 hover:bg-[#ffcc00]/10 hover:text-[#003170]"
                            title={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
                            aria-label={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
                            aria-expanded={sidebarOpen}
                        >
                            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
                            <span>{sidebarOpen ? 'Masquer le menu' : 'Menu'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setDensityPref(cycleUiDensityPreference(densityPref))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-xs font-semibold leading-none text-text-muted transition-colors hover:border-[#ffcc00]/35 hover:bg-[#ffcc00]/10 hover:text-[#003170]"
                            title="Densité d’affichage : Auto (selon écran), Compact ou Confort"
                            aria-label="Changer la densité d’affichage"
                        >
                            Affichage · {uiDensityPreferenceLabel(densityPref)}
                            {densityPref === 'auto' ? ` (${density === 'compact' ? 'compact' : 'confort'})` : ''}
                        </button>
                    </div>
                </div>
                <main className="app-main flex-1 overflow-y-auto overflow-x-clip pb-0">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
