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

function SidebarSection({ label, first = false }) {
    return (
        <div className={`px-5 ${first ? 'pt-2' : 'pt-3.5'} pb-1`}>
            <div className="flex items-center gap-2">
                <span className="h-3.5 w-[2px] shrink-0 rounded-full bg-nge-yellow" />
                <p className="text-[9px] font-black uppercase tracking-[.18em] text-nge-yellow">{label}</p>
            </div>
        </div>
    )
}

function SidebarSectionDivider() {
    return (
        <div
            className="mx-5 my-2 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,204,0,0.28) 18%, rgba(255,255,255,0.08) 82%, transparent)' }}
        />
    )
}

function SidebarNavItem({ item }) {
    const Icon = item.icon

    if (item.disabled) {
        return (
            <div className="flex w-full cursor-not-allowed select-none items-center gap-2.5 border-l-[3px] border-transparent px-5 py-2 text-[13px] text-[#c5d4ea]/35">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-[#c5d4ea]/35">
                    <Icon size={15} strokeWidth={2} aria-hidden />
                </span>
                <span className="truncate">{item.label}</span>
            </div>
        )
    }

    return (
        <NavLink
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
                `group flex w-full items-center gap-2.5 border-l-[3px] px-5 py-2 text-[13px] font-medium transition-all duration-150 ${
                    isActive
                        ? 'border-nge-yellow bg-white/10 text-white'
                        : 'border-transparent text-[#c5d4ea] hover:border-nge-yellow/35 hover:bg-white/5 hover:text-white'
                }`
            }
        >
            {({ isActive }) => (
                <>
                    <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                            isActive
                                ? 'bg-nge-yellow text-nge shadow-[0_0_0_1px_rgba(255,204,0,0.35)]'
                                : 'bg-white/5 text-[#c5d4ea] group-hover:bg-nge-yellow/12 group-hover:text-nge-yellow'
                        }`}
                    >
                        <Icon size={15} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="truncate">{item.label}</span>
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
            section: 'Accueil',
            items: [
                { to: home.path, icon: LayoutDashboard, label: home.navLabel, end: home.path !== '/dashboard', permission: homePermission },
                ...(ownLegacyDashboard ? [{ ...ownLegacyDashboard, label: `Dashboard · ${ownLegacyDashboard.label}` }] : []),
                ...(dashboardCatalogLink ? [dashboardCatalogLink] : []),
                { to: '/planning', icon: Calendar, label: 'Planning', permission: 'view_planning' },
            ],
        },
        {
            section: 'Dossiers RST',
            items: [
                { to: '/affaires', icon: Briefcase, label: 'Affaires RST' },
                { to: '/demandes', icon: FolderOpen, label: 'Demandes', permission: 'view_demandes' },
                { to: '/passations', icon: Handshake, label: 'Passations' },
                { to: '/contacts', icon: Contact, label: 'Contacts' },
            ],
        },
        {
            section: 'Chantier & études',
            items: [
                { to: '/dst', icon: Archive, label: 'DST' },
                { to: '/etudes', icon: BookOpen, label: 'Études', permission: 'view_etudes' },
                { to: '/g3/notes-techniques', icon: FileText, label: 'Notes techniques' },
            ],
        },
        {
            section: 'G3 EXE',
            items: [
                { to: '/g3', icon: MapPin, label: 'Hub G3', end: true },
                { to: '/g3/missions', icon: FolderKanban, label: 'Missions G3 EXE' },
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
            section: 'Référentiel NGE',
            items: [
                { to: '/affaires-nge', icon: Building2, label: 'Affaires NGE' },
            ],
        },
        {
            section: 'Administration',
            items: [
                { to: '/rapports/validation', icon: CheckCircle2, label: 'Validation rapports', permission: 'view_tools' },
                { to: '/tools', icon: Wrench, label: 'Outils', permission: 'view_tools' },
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
                className={`app-sidebar flex flex-col shrink-0 overflow-hidden transition-[width,min-width] duration-200 ease-in-out ${
                    sidebarOpen ? 'w-[220px] min-w-[220px]' : 'w-0 min-w-0'
                }`}
            >
                <div className="w-[220px] min-w-[220px] h-full flex flex-col">
                    <div className="relative px-5 py-5 border-b border-white/10">
                        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-nge-yellow via-nge-yellow/55 to-transparent" />
                        <div className="inline-flex items-center gap-1.5 mb-2 rounded-full border border-nge-yellow/55 bg-nge-yellow/12 px-2 py-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-nge-yellow shadow-[0_0_0_3px_rgba(255,204,0,0.18)]" />
                            <span className="text-[9px] font-black uppercase tracking-[.14em] text-nge-yellow">NGE</span>
                        </div>
                        <h1 className="text-white font-black text-lg leading-none tracking-tight">RaLab5</h1>
                        <span className="mt-1.5 block text-[11px] text-[#c5d4ea]">Laboratoire géotechnique</span>
                    </div>

                    <nav className="flex-1 overflow-y-auto py-2">
                        {visibleNav.map((group, groupIndex) => (
                            <div key={group.section}>
                                {groupIndex > 0 ? <SidebarSectionDivider /> : null}
                                <SidebarSection label={group.section} first={groupIndex === 0} />
                                {group.items.map((item) => (
                                    <SidebarNavItem key={item.to || item.label} item={item} />
                                ))}
                            </div>
                        ))}
                    </nav>

                    <div className="relative border-t border-white/10 px-5 py-4">
                        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-nge-yellow/70 to-transparent" />
                        <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-9 h-9 rounded-lg bg-nge-yellow flex items-center justify-center text-nge text-xs font-black shrink-0 shadow-[0_0_0_1px_rgba(255,204,0,0.45)]">
                                {initials}
                            </div>
                            <div className="min-w-0">
                                <p className="text-white text-[13px] font-semibold truncate">
                                    {user?.display_name || user?.email || '—'}
                                </p>
                                <p className="text-[#c5d4ea] text-[11px]">
                                    {regionalRst ? getRegionalRstShortLabel() : (user?.role || '')}
                                </p>
                                {regionalRst ? (
                                    <p className="text-nge-yellow text-[10px] font-bold truncate">{user?.service_code || 'ARS'}</p>
                                ) : user?.service_code ? (
                                    <p className="text-[#c5d4ea]/75 text-[10px] truncate">{user.service_code}</p>
                                ) : null}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={logout}
                            className="w-full py-1.5 border border-nge-yellow/25 rounded-md text-[#c5d4ea] text-xs font-medium hover:bg-nge-yellow/10 hover:text-white hover:border-nge-yellow/45 transition-colors flex items-center justify-center gap-1.5"
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
                    className="shrink-0 border-b border-border bg-surface/96 backdrop-blur-sm"
                    style={{ boxShadow: '0 4px 18px rgba(0,49,112,0.06)' }}
                >
                    <div className="app-chrome-stripe" />
                    <div className="flex items-center gap-2 px-3 py-1.5">
                        <button
                            type="button"
                            onClick={() => setSidebarOpen((value) => !value)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors leading-none hover:border-nge-yellow/35 hover:bg-nge-yellow/10 hover:text-nge"
                            title={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
                            aria-label={sidebarOpen ? 'Masquer le menu' : 'Afficher le menu'}
                            aria-expanded={sidebarOpen}
                        >
                            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
                            <span>{sidebarOpen ? 'Masquer le menu' : 'Menu'}</span>
                        </button>
                    </div>
                </div>
                <main className="app-main flex-1 overflow-y-auto overflow-x-clip px-6 pt-6 pb-0">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
