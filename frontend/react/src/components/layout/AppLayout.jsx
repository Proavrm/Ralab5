import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { LogOut, PanelLeft, PanelLeftClose } from 'lucide-react'
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

export default function AppLayout() {
    const { user, logout } = useAuth()
    const location = useLocation()
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        if (typeof window === 'undefined') {
            return true
        }

        return window.localStorage.getItem('ralab5.sidebarOpen') !== '0'
    })
    const chromeBarRef = useRef(null)
    const [chromeBarHeight, setChromeBarHeight] = useState(0)
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
            icon: '🧭',
            label: `Mon dashboard métier · ${ownResponsibleLaboProfile.title}`,
        }
        : ownTechnicianProfile
            ? {
                to: getTechnicianHomeRoute(ownTechnicianProfile),
                icon: '🧭',
                label: `Mon dashboard métier · ${ownTechnicianProfile.displayName}`,
            }
            : null
    const canBrowseUserDashboards = hasPermission(user, 'manage_users')
    const dashboardCatalogLink = canBrowseUserDashboards
        ? {
            to: '/tools#dashboards-metier',
            icon: '🗂️',
            label: 'Catalogue vues métier',
        }
        : null
    const initials = user?.display_name
        ?.split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '?'

    const nav = [
        {
            section: 'Navigation',
            items: [
                { to: home.path, icon: '🏠', label: home.navLabel, end: home.path !== '/dashboard', permission: 'view_dashboard' },
                { to: '/affaires', icon: '📋', label: 'Affaires RST' },
                { to: '/contacts', icon: '📇', label: 'Contacts' },
                { to: '/passations', icon: '🤝', label: 'Passations' },
                { to: '/demandes', icon: '📂', label: 'Demandes', permission: 'view_demandes' },
                { to: '/dst', icon: '📁', label: 'DST' },
                { to: '/affaires-nge', icon: '🏗️', label: 'Affaires NGE' },
                { to: '/etudes', icon: '📚', label: 'Études', permission: 'view_etudes' },
                { to: '/planning', icon: '📅', label: 'Planning', permission: 'view_planning' },
                { to: '/labo', icon: '🔬', label: 'Laboratoire', permission: 'view_labo' },
                { to: '/qualite', icon: '🔍', label: 'Audits / Qualité' },
                { to: '/g3', icon: '📍', label: 'G3', end: true },
                { to: '/g3/missions', icon: '📂', label: 'Missions G3 EXE' },
                { to: '/g3/notes-techniques', icon: '📝', label: 'Notes techniques' },
            ]
        },
        {
            section: 'Administration',
            items: [
                { to: '/rapports/validation', icon: '✅', label: 'Validation rapports', permission: 'view_tools' },
                { to: '/tools', icon: '🔧', label: 'Outils', permission: 'view_tools' },
                { to: '/admin', icon: '⚙️', label: 'Administration', permission: 'manage_users' },
            ]
        },
        ...((ownLegacyDashboard || dashboardCatalogLink)
            ? [{
                section: 'Accès métier',
                items: [ownLegacyDashboard, dashboardCatalogLink].filter(Boolean),
            }]
            : []),
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
            style={{
                '--app-sidebar-width': sidebarOpen ? '220px' : '0px',
                '--app-chrome-top': `${chromeBarHeight}px`,
            }}
        >
            <aside
                className={`app-sidebar bg-sidebar flex flex-col shrink-0 overflow-hidden transition-[width,min-width] duration-200 ease-in-out ${
                    sidebarOpen ? 'w-[220px] min-w-[220px]' : 'w-0 min-w-0'
                }`}
            >
                <div className="w-[220px] min-w-[220px] h-full flex flex-col">
                    <div className="px-5 py-5 border-b border-white/5">
                        <h1 className="text-white font-bold text-lg">RaLab5</h1>
                        <span className="text-[11px] text-[#a0a0b8]">Laboratoire géotechnique</span>
                    </div>

                    <nav className="flex-1 py-3 overflow-y-auto">
                    {visibleNav.map((group) => (
                        <div key={group.section}>
                            <p className="px-5 py-3 text-[10px] uppercase tracking-widest text-white/25 font-medium">
                                {group.section}
                            </p>
                            {group.items.map((item) => (
                                item.disabled ? (
                                    <div
                                        key={item.label}
                                        className="flex items-center gap-2.5 w-full px-5 py-2.5 text-[13px] text-[#a0a0b8]/35 border-l-[3px] border-transparent cursor-not-allowed select-none"
                                    >
                                        <span className="text-[15px] w-5 text-center">{item.icon}</span>
                                        {item.label}
                                    </div>
                                ) : (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        end={item.end}
                                        className={({ isActive }) =>
                                            `flex items-center gap-2.5 w-full px-5 py-2.5 text-[13px] border-l-[3px] transition-all duration-150 ${
                                                isActive
                                                    ? 'bg-white/10 text-white border-accent'
                                                    : 'text-[#a0a0b8] border-transparent hover:bg-white/5 hover:text-white'
                                            }`
                                        }
                                    >
                                        <span className="text-[15px] w-5 text-center">{item.icon}</span>
                                        {item.label}
                                    </NavLink>
                                )
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="px-5 py-4 border-t border-white/5">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {initials}
                        </div>
                        <div className="min-w-0">
                            <p className="text-white text-[13px] font-medium truncate">
                                {user?.display_name || user?.email || '—'}
                            </p>
                            <p className="text-[#a0a0b8] text-[11px]">
                              {regionalRst ? getRegionalRstShortLabel() : (user?.role || '')}
                            </p>
                            {regionalRst ? (
                              <p className="text-[#ffcc00] text-[10px] truncate">{user?.service_code || 'ARS'}</p>
                            ) : user?.service_code ? (
                              <p className="text-[#a0a0b8] text-[10px] truncate">{user.service_code}</p>
                            ) : null}
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full py-1.5 border border-white/10 rounded text-[#a0a0b8] text-xs hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-1.5"
                    >
                        <LogOut size={12} />
                        Déconnexion
                    </button>
                </div>
                </div>
            </aside>

            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <div
                    ref={chromeBarRef}
                    className="shrink-0 flex items-center gap-2 px-3 py-1 border-b border-border bg-surface"
                >
                    <button
                        type="button"
                        onClick={() => setSidebarOpen((value) => !value)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-muted hover:text-text hover:bg-bg transition-colors leading-none"
                        title={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
                        aria-label={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
                        aria-expanded={sidebarOpen}
                    >
                        {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
                        <span>{sidebarOpen ? 'Masquer le menu' : 'Menu'}</span>
                    </button>
                </div>
                <main className="app-main flex-1 overflow-y-auto overflow-x-clip px-6 pt-6 pb-0">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
