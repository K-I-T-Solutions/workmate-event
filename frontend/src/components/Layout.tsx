import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Ticket, ShoppingCart, Package, Users,
  ListMusic, Radio, BarChart2, LogOut, Menu, X
} from 'lucide-react'
import { useState } from 'react'

const nav = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tickets',    icon: Ticket,          label: 'Ticketing' },
  { to: '/kasse',      icon: ShoppingCart,    label: 'Kasse' },
  { to: '/equipment',  icon: Package,         label: 'Equipment' },
  { to: '/staff',      icon: Users,           label: 'Personal' },
  { to: '/program',    icon: ListMusic,       label: 'Programm' },
  { to: '/livestream', icon: Radio,           label: 'Livestream' },
  { to: '/reporting',  icon: BarChart2,       label: 'Reporting' },
]

export default function Layout() {
  const { username, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function handleLogout() { logout(); navigate('/login') }

  return (
    <div className="flex h-screen overflow-hidden bg-wm-bg">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-20 bg-black/70 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-30 flex flex-col
        w-60 bg-wm-surface border-r border-wm-border
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Sign (Wortmarke) – aufgeklappte Sidebar */}
        <div className="flex items-center justify-center px-3 py-4 border-b border-wm-border">
          <img src="/sign-event.png" alt="WORKMATE EVENT" className="w-full h-auto" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to} to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border
                 ${isActive
                   ? 'bg-wm-green/10 text-wm-green border-wm-green/20 shadow-glow-green-sm'
                   : 'text-wm-muted hover:text-white hover:bg-white/5 border-transparent'
                 }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-wm-border px-3 py-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-wm-green/15 border border-wm-green/30 flex items-center justify-center text-wm-green text-xs font-bold shrink-0">
              {username?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="text-sm text-white flex-1 truncate">{username}</span>
            <button onClick={handleLogout} className="text-wm-muted hover:text-red-400 transition-colors">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-wm-surface border-b border-wm-border">
          <button onClick={() => setOpen(true)} className="text-wm-muted hover:text-white">
            <Menu size={22} />
          </button>
          <img src="/logo-event.png" alt="WORKMATE EVENT" className="h-7 w-auto" />
          {open && (
            <button onClick={() => setOpen(false)} className="ml-auto text-wm-muted">
              <X size={22} />
            </button>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
