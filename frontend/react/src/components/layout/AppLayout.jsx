import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { LogOut } from 'lucide-react'
import { getUserHomeConfig } from '@/lib/userHome'
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
    const home = getUserHomeConfig(user)
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
                { to: '/passations', icon: '🤝', label: 'Passations' },
                { to: '/demandes', icon: '📂', label: 'Demandes', permission: 'view_demandes' },
                { to: '/dst', icon: '📁', label: 'DST' },
                { to: '/affaires-nge', icon: '🏗️', label: 'Affaires NGE' },
                { to: '/etudes', icon: '📚', label: 'Études', permission: 'view_etudes' },
                { to: '/planning', icon: '📅', label: 'Planning', permission: 'view_planning' },
                { to: '/labo', icon: '🔬', label: 'Laboratoire', permission: 'view_labo' },
                { to: '/qualite', icon: '🔍', label: 'Audits / Qualité' },
            ]
        },
        {
            section: 'À venir',
            items: [
                { to: null, icon: '📍', label: 'G3', disabled: true },
            ]
        },
        {
            section: 'Administration',
            items: [
                { to: '/tools', icon: '🔧', label: 'Outils', permission: 'view_tools' },
                { to: '/admin', icon: '⚙️', label: 'Utilisateurs', permission: 'manage_users' },
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

    return (
        <div className="app-shell flex h-screen overflow-hidden">
            <aside className="app-sidebar w-[220px] min-w-[220px] bg-sidebar flex flex-col">
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
                            <p className="text-[#a0a0b8] text-[11px]">{user?.role || ''}</p>
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
            </aside>

            <div className="flex-1 flex flex-col overflow-hidden">
                <main className="app-main flex-1 overflow-y-auto p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
