import { ReactNode } from 'react'

// --- Badge ---
const statusColors: Record<string, string> = {
  PLANNING:     'bg-[#444]/60 text-[#B3B3B3] border border-[#444]',
  ACTIVE:       'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30',
  COMPLETED:    'bg-[#0077FF]/15 text-[#0077FF] border border-[#0077FF]/30',
  CANCELLED:    'bg-red-500/15 text-red-400 border border-red-500/30',
  VALID:        'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30',
  SCANNED:      'bg-[#0077FF]/15 text-[#0077FF] border border-[#0077FF]/30',
  REFUNDED:     'bg-[#FFC400]/15 text-[#FFC400] border border-[#FFC400]/30',
  AVAILABLE:    'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30',
  IN_USE:       'bg-[#0077FF]/15 text-[#0077FF] border border-[#0077FF]/30',
  DEFECT:       'bg-red-500/15 text-red-400 border border-red-500/30',
  PENDING:      'bg-[#FFC400]/15 text-[#FFC400] border border-[#FFC400]/30',
  COMPLETED_TX: 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30',
  ACTIVE_STAFF: 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30',
}

export function Badge({ label }: { label: string }) {
  const cls = statusColors[label] ?? 'bg-[#444]/60 text-[#B3B3B3] border border-[#444]'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

// --- StatCard ---
export function StatCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-wm-muted uppercase tracking-wider font-semibold">{label}</span>
      <span className={`text-2xl font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-[#555]">{sub}</span>}
    </div>
  )
}

// --- ProgressBar ---
export function ProgressBar({ value, max, color = 'bg-wm-green' }: {
  value: number; max: number; color?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="w-full bg-wm-border rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
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
    <div className="flex flex-col items-center gap-3 py-12 text-wm-muted/50">
      {icon && <div className="text-4xl opacity-30">{icon}</div>}
      <p className="text-sm">{message}</p>
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
    success: 'bg-[#00E676]/10 border-[#00E676]/30 text-[#00E676]',
    error:   'bg-red-500/10 border-red-500/30 text-red-400',
    info:    'bg-[#0077FF]/10 border-[#0077FF]/30 text-[#0077FF]',
  }[type]
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${styles}`}>{message}</div>
  )
}
