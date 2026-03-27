/**
 * components/layout/AppLayout.jsx
 * Layout principal — sidebar + header + content.
 * Equivalente ao sidebar.js do HTML legacy.
 */
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, Briefcase, ClipboardList, FileText,
  MapPin, FlaskConical, Calendar, Shield, Wrench,
  HandshakeIcon, LogOut, ChevronRight
} from 'lucide-react'

const NAV = [
  {
    section: 'Principal',
    items: [
      { to: '/',           icon: LayoutDashboard, label: 'Dashboard',   end: true },
      { to: '/affaires',   icon: Briefcase,        label: 'Affaires RST' },
      { to: '/demandes',   icon: ClipboardList,    label: 'Demandes' },
      { to: '/passations', icon: HandshakeIcon,    label: 'Passations' },
    ]
  },
  {
    section: 'Terrain & Labo',
    items: [
      { to: '/dst',      icon: FileText,    label: 'DST' },
      { to: '/planning', icon: Calendar,    label: 'Planning' },
    ]
  },
  {
    section: 'Qualité',
    items: [
      { to: '/qualite', icon: Shield, label: 'Qualité Labo' },
    ]
  },
  {
    section: 'Administration',
    items: [
      { to: '/admin', icon: Shield, label: 'Admin' },
      { to: '/tools', icon: Wrench, label: 'Outils' },
    ]
  },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const initials = user?.display_name
    ?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] min-w-[220px] bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/5">
          <h1 className="text-white font-bold text-lg">RaLab5</h1>
          <span className="text-xs text-sidebar-t opacity-60">Labo Géotechnique NGE</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(group => (
            <div key={group.section}>
              <p className="px-5 py-3 text-[10px] uppercase tracking-widest text-white/25 font-medium">
                {group.section}
              </p>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 w-full px-5 py-2.5 text-[13px] border-l-[3px] transition-all duration-150 ${
                      isActive
                        ? 'bg-white/10 text-white border-accent'
                        : 'text-sidebar-t border-transparent hover:bg-white/5 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={15} className="shrink-0 opacity-80" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-5 py-4 border-t border-white/5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-[13px] font-medium truncate">
                {user?.display_name || user?.username || '—'}
              </p>
              <p className="text-sidebar-t text-[11px] capitalize">{user?.role || ''}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full py-1.5 border border-white/10 rounded text-sidebar-t text-xs hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut size={12} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
