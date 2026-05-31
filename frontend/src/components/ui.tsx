import { ReactNode } from 'react'

// --- Badge ---
const statusColors: Record<string, string> = {
  PLANNING:  'bg-slate-700 text-slate-300',
  ACTIVE:    'bg-emerald-900 text-emerald-300',
  COMPLETED: 'bg-blue-900 text-blue-300',
  CANCELLED: 'bg-red-900 text-red-300',
  VALID:     'bg-emerald-900 text-emerald-300',
  SCANNED:   'bg-blue-900 text-blue-300',
  REFUNDED:  'bg-amber-900 text-amber-300',
  AVAILABLE: 'bg-emerald-900 text-emerald-300',
  IN_USE:    'bg-blue-900 text-blue-300',
  DEFECT:    'bg-red-900 text-red-300',
  PENDING:   'bg-amber-900 text-amber-300',
  COMPLETED_TX: 'bg-emerald-900 text-emerald-300',
}

export function Badge({ label }: { label: string }) {
  const cls = statusColors[label] ?? 'bg-slate-700 text-slate-300'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

// --- StatCard ---
export function StatCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  )
}

// --- ProgressBar ---
export function ProgressBar({ value, max, color = 'bg-blue-500' }: {
  value: number; max: number; color?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="w-full bg-slate-700 rounded-full h-2">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// --- Spinner ---
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }[size]
  return (
    <div className={`${s} animate-spin rounded-full border-2 border-slate-600 border-t-blue-500`} />
  )
}

// --- Empty state ---
export function Empty({ icon, message }: { icon?: ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
      {icon && <div className="text-4xl opacity-40">{icon}</div>}
      <p>{message}</p>
    </div>
  )
}

// --- Section header ---
export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {action}
    </div>
  )
}

// --- Alert ---
export function Alert({ type, message }: { type: 'success' | 'error' | 'info'; message: string }) {
  const styles = {
    success: 'bg-emerald-900/50 border-emerald-600 text-emerald-300',
    error:   'bg-red-900/50 border-red-600 text-red-300',
    info:    'bg-blue-900/50 border-blue-600 text-blue-300',
  }[type]
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${styles}`}>{message}</div>
  )
}
