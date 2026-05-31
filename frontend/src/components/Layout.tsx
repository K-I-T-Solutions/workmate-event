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
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-30 flex flex-col
        w-64 bg-slate-900 border-r border-slate-800
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            WE
          </div>
          <div>
            <p className="font-semibold text-slate-100 text-sm">Workmate Event</p>
            <p className="text-xs text-slate-500">K.I.T. Solutions</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to} to={to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                 ${isActive
                   ? 'bg-blue-600 text-white'
                   : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                 }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 px-3 py-3">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold">
              {username?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <span className="text-sm text-slate-300 flex-1 truncate">{username}</span>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
          <button onClick={() => setOpen(true)} className="text-slate-400 hover:text-slate-100">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-slate-100">Workmate Event</span>
          {open && (
            <button onClick={() => setOpen(false)} className="ml-auto text-slate-400">
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
