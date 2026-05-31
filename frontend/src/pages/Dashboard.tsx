import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { events, Event, TicketStats, tickets } from '../api/client'
import { Badge, StatCard, Spinner, Empty } from '../components/ui'
import { useEventSocket } from '../hooks/useWebSocket'
import { CalendarDays, MapPin, Users, Plus, QrCode } from 'lucide-react'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Dashboard() {
  const [eventList, setEventList] = useState<Event[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, TicketStats>>({})
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = await events.list()
    setEventList(list)
    setLoading(false)
    const active = list.find(e => e.status === 'ACTIVE')
    if (active) {
      setActiveId(active.id)
      const s = await tickets.stats(active.id)
      setStatsMap(m => ({ ...m, [active.id]: s }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEventSocket({
    'ticket.scanned': () => {
      if (activeId) tickets.stats(activeId).then(s => setStatsMap(m => ({ ...m, [activeId]: s })))
    },
    'transaction.completed': () => {
      if (activeId) tickets.stats(activeId).then(s => setStatsMap(m => ({ ...m, [activeId]: s })))
    },
  })

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const active = eventList.find(e => e.status === 'ACTIVE')
  const stats = active ? statsMap[active.id] : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <Link to="/tickets" className="btn-primary text-sm">
          <Plus size={16} /> Neues Event
        </Link>
      </div>

      {/* Live Stats für aktives Event */}
      {active && stats && (
        <section>
          <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-3">
            ● Live – {active.name}
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Tickets gesamt" value={stats.total} color="text-slate-100" />
            <StatCard label="Eingecheckt" value={stats.scanned}
              sub={`${stats.total > 0 ? Math.round((stats.scanned / stats.total) * 100) : 0}%`}
              color="text-emerald-400" />
            <StatCard label="Noch gültig" value={stats.valid} color="text-blue-400" />
            <StatCard label="Umsatz" value={`${stats.revenue.toFixed(2)} €`} color="text-amber-400" />
          </div>
        </section>
      )}

      {/* Event-Liste */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Events</h2>
        {eventList.length === 0
          ? <Empty icon="📅" message="Noch keine Events angelegt" />
          : (
            <div className="space-y-3">
              {eventList.map(ev => (
                <Link key={ev.id} to={`/tickets?event=${ev.id}`}
                  className="card flex flex-col sm:flex-row sm:items-center gap-3 hover:border-slate-600 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-slate-100 truncate">{ev.name}</span>
                      <Badge label={ev.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                      <span className="flex items-center gap-1"><CalendarDays size={13} />{fmtDate(ev.date)}</span>
                      <span className="flex items-center gap-1"><MapPin size={13} />{ev.location}</span>
                      <span className="flex items-center gap-1"><Users size={13} />{ev.capacity} Kapazität</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/scanner?event=${ev.id}`} onClick={e => e.stopPropagation()}
                      className="btn-ghost text-xs py-1 px-3">
                      <QrCode size={14} /> Scanner
                    </Link>
                  </div>
                </Link>
              ))}
            </div>
          )
        }
      </section>
    </div>
  )
}
