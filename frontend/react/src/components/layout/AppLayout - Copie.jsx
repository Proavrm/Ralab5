import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { LogOut } from 'lucide-react'

const NAV = [
  {
    section: 'Navigation',
    items: [
      { to: '/',              icon: '🏠', label: 'Dashboard',     end: true },
      { to: '/affaires',      icon: '📋', label: 'Affaires RST' },
      { to: '/passations',    icon: '🤝', label: 'Passations' },
      { to: '/demandes',      icon: '📂', label: 'Demandes' },
      { to: '/dst',           icon: '📁', label: 'DST' },
      { to: '/affaires-nge',  icon: '🏗️', label: 'Affaires NGE' },
      { to: '/etudes',        icon: '📚', label: 'Études' },
      { to: '/planning',      icon: '📅', label: 'Planning' },
      { to: '/qualite',       icon: '🔍', label: 'Audits / Qualité' },
    ]
  },
  {
    section: 'À venir',
    items: [
      { to: null, icon: '📍', label: 'G3',          disabled: true },
      { to: null, icon: '🔬', label: 'Laboratoire', disabled: true },
    ]
  },
  {
    section: 'Administration',
    items: [
      { to: '/tools', icon: '🔧', label: 'Outils' },
      { to: '/admin', icon: '⚙️', label: 'Utilisateurs' },
    ]
  },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const initials = user?.display_name
    ?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[220px] min-w-[220px] bg-sidebar flex flex-col">
        <div className="px-5 py-5 border-b border-white/5">
          <h1 className="text-white font-bold text-lg">RaLab5</h1>
          <span className="text-[11px] text-[#a0a0b8]">Laboratoire géotechnique</span>
        </div>

        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(group => (
            <div key={group.section}>
              <p className="px-5 py-3 text-[10px] uppercase tracking-widest text-white/25 font-medium">
                {group.section}
              </p>
              {group.items.map(item => (
                item.disabled ? (
                  <div key={item.label}
                    className="flex items-center gap-2.5 w-full px-5 py-2.5 text-[13px] text-[#a0a0b8]/35 border-l-[3px] border-transparent cursor-not-allowed select-none">
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
          <button onClick={logout}
            className="w-full py-1.5 border border-white/10 rounded text-[#a0a0b8] text-xs hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-1.5">
            <LogOut size={12} />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}