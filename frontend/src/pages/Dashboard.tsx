import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { events, tickets, Event, TicketStats } from '../api/client'
import { Badge, StatCard, Spinner, Empty, Alert } from '../components/ui'

import { useEventSocket } from '../hooks/useWebSocket'
import { CalendarDays, MapPin, Users, Plus, QrCode, X, Ticket, ChevronRight, Play, Square, CheckCheck, Ban } from 'lucide-react'

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('de-DE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const statusOrder = ['ACTIVE', 'PLANNING', 'COMPLETED', 'CANCELLED']

export default function Dashboard() {
  const [eventList, setEventList] = useState<Event[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, TicketStats>>({})
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [statusChanging, setStatusChanging] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '', date: '', location: '', description: '',
    capacity: '', organizer_name: '', organizer_email: '',
  })

  const load = useCallback(async () => {
    const list = await events.list()
    const sorted = [...list].sort((a, b) =>
      statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
    )
    setEventList(sorted)
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

  async function handleStatus(ev: Event, status: string) {
    setStatusChanging(ev.id)
    try {
      await events.setStatus(ev.id, status)
      await load()
    } finally {
      setStatusChanging(null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await events.create({
        name: form.name,
        date: new Date(form.date).toISOString(),
        location: form.location,
        description: form.description,
        capacity: parseInt(form.capacity) || 100,
        organizer_name: form.organizer_name,
        organizer_email: form.organizer_email,
      })
      await load()
      setShowForm(false)
      setForm({ name: '', date: '', location: '', description: '', capacity: '', organizer_name: '', organizer_email: '' })
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const active = eventList.find(e => e.status === 'ACTIVE')
  const stats = active ? statsMap[active.id] : null

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
          <Plus size={15} /> Neues Event
        </button>
      </div>

      {/* Live-Stats – aktives Event */}
      {active && stats && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-wm-green animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--wm-green)' }}>
              Live – {active.name}
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Tickets gesamt" value={stats.total} />
            <StatCard
              label="Eingecheckt"
              value={stats.scanned}
              sub={`${stats.total > 0 ? Math.round(stats.scanned / stats.total * 100) : 0}%`}
              color="text-wm-green"
            />
            <StatCard label="Noch gültig" value={stats.valid} color="text-wm-blue" />
            <StatCard label="Umsatz" value={`${stats.revenue.toFixed(2)} €`} color="text-wm-amber" />
          </div>
        </section>
      )}

      {/* Neues-Event-Formular Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Neues Event</h2>
              <button onClick={() => setShowForm(false)} className="text-wm-muted hover:text-white">
                <X size={18} />
              </button>
            </div>

            {error && <Alert type="error" message={error} />}

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="label">Name *</label>
                  <input className="input" required value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Datum *</label>
                  <input className="input" type="datetime-local" required value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Kapazität</label>
                  <input className="input" type="number" min="1" value={form.capacity}
                    onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Ort</label>
                  <input className="input" value={form.location}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Veranstalter</label>
                  <input className="input" value={form.organizer_name}
                    onChange={e => setForm(f => ({ ...f, organizer_name: e.target.value }))} />
                </div>
                <div>
                  <label className="label">E-Mail</label>
                  <input className="input" type="email" value={form.organizer_email}
                    onChange={e => setForm(f => ({ ...f, organizer_email: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Beschreibung</label>
                  <input className="input" value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-sm">
                  Abbrechen
                </button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">
                  {saving ? <Spinner size="sm" /> : 'Event anlegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event-Liste */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--wm-muted)' }}>
          Events
        </h2>
        {eventList.length === 0
          ? <Empty icon="📅" message="Noch keine Events angelegt" />
          : (
            <div className="space-y-2">
              {eventList.map(ev => {
                const isActive = ev.status === 'ACTIVE'
                return (
                  <Link
                    key={ev.id}
                    to={`/tickets?event=${ev.id}`}
                    className="card flex flex-col sm:flex-row sm:items-center gap-3 transition-all duration-150 hover:border-[#555] group"
                    style={isActive ? { borderColor: 'rgba(0,230,118,0.3)', boxShadow: '0 0 12px rgba(0,230,118,0.08)' } : {}}
                  >
                    {/* Status-Streifen */}
                    <div className={`hidden sm:block w-1 self-stretch rounded-full shrink-0 ${
                      isActive ? 'bg-wm-green' : 'bg-wm-border'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-semibold text-white truncate">{ev.name}</span>
                        <Badge label={ev.status} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--wm-muted)' }}>
                        <span className="flex items-center gap-1.5">
                          <CalendarDays size={12} />{fmtDate(ev.date)}
                        </span>
                        {ev.location && (
                          <span className="flex items-center gap-1.5">
                            <MapPin size={12} />{ev.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Users size={12} />{ev.capacity}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {/* Status-Aktionen */}
                      {ev.status === 'PLANNING' && (
                        <button onClick={e => { e.preventDefault(); handleStatus(ev, 'ACTIVE') }}
                          className="btn-success text-xs py-1 px-2.5" disabled={statusChanging === ev.id}>
                          {statusChanging === ev.id ? <Spinner size="sm" /> : <><Play size={12} /> Starten</>}
                        </button>
                      )}
                      {ev.status === 'ACTIVE' && (
                        <button onClick={e => { e.preventDefault(); handleStatus(ev, 'COMPLETED') }}
                          className="btn-ghost text-xs py-1 px-2.5" disabled={statusChanging === ev.id}>
                          {statusChanging === ev.id ? <Spinner size="sm" /> : <><CheckCheck size={12} /> Abschließen</>}
                        </button>
                      )}
                      {(ev.status === 'PLANNING' || ev.status === 'ACTIVE') && (
                        <button onClick={e => { e.preventDefault(); handleStatus(ev, 'CANCELLED') }}
                          className="btn-danger text-xs py-1 px-2.5" disabled={statusChanging === ev.id}>
                          <Ban size={12} />
                        </button>
                      )}
                      <Link to={`/scanner?event=${ev.id}`} onClick={e => e.stopPropagation()}
                        className="btn-ghost text-xs py-1 px-2.5">
                        <QrCode size={13} /> Scanner
                      </Link>
                      <Link to={`/tickets?event=${ev.id}`} onClick={e => e.stopPropagation()}
                        className="btn-ghost text-xs py-1 px-2.5">
                        <Ticket size={13} /> Tickets
                      </Link>
                      <ChevronRight size={16} className="text-wm-border group-hover:text-wm-muted transition-colors" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )
        }
      </section>
    </div>
  )
}
