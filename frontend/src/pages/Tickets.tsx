import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { events, tickets, Event, Ticket, TicketStats } from '../api/client'
import { Badge, StatCard, Spinner, Empty, SectionHeader, Alert } from '../components/ui'
import { useEventSocket } from '../hooks/useWebSocket'
import { RefreshCw, Plus, Download, X } from 'lucide-react'

function fmtDate(d: string | null) {
  if (!d) return '–'
  return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Tickets() {
  const [params] = useSearchParams()
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [ticketList, setTicketList] = useState<Ticket[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [filter, setFilter] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ holder_name: '', holder_email: '', category: 'ABENDKASSE', price: '' })
  const [qrModal, setQrModal] = useState<{ url: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const loadData = useCallback(async (evId: string) => {
    const [tks, st] = await Promise.all([tickets.list(evId), tickets.stats(evId)])
    setTicketList(tks)
    setStats(st)
  }, [])

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const preselect = params.get('event')
      const ev = list.find(e => e.id === preselect) ?? list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      if (ev) loadData(ev.id).finally(() => setLoading(false))
      else setLoading(false)
    })
  }, [params, loadData])

  useEventSocket({
    'ticket.scanned': () => { if (activeEvent) loadData(activeEvent.id) },
  })

  async function handleSync() {
    if (!activeEvent) return
    setSyncing(true); setError('')
    try {
      const r = await tickets.sync(activeEvent.id)
      await loadData(activeEvent.id)
      setError(`Sync: ${r.new} neue, ${r.updated} aktualisiert`)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeEvent) return
    setSaving(true); setError('')
    try {
      const res = await tickets.create(activeEvent.id, {
        category: form.category,
        price: parseFloat(form.price) || 0,
        holder_name: form.holder_name,
        holder_email: form.holder_email,
      })
      setQrModal({ url: res.qr_image, name: form.holder_name || 'Ticket' })
      setShowForm(false)
      setForm({ holder_name: '', holder_email: '', category: 'ABENDKASSE', price: '' })
      await loadData(activeEvent.id)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const filtered = filter === 'ALL' ? ticketList : ticketList.filter(t => t.status === filter)

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Ticketing</h1>
        <div className="flex gap-2">
          {activeEvent?.ticketio_event_id && (
            <button onClick={handleSync} disabled={syncing} className="btn-ghost text-sm">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /> Ticket.io Sync
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            <Plus size={14} /> Abendkasse
          </button>
        </div>
      </div>

      {/* Event-Auswahl */}
      {eventList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {eventList.map(ev => (
            <button key={ev.id}
              onClick={() => { setActiveEvent(ev); loadData(ev.id) }}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                activeEvent?.id === ev.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-slate-100'
              }`}>
              {ev.name}
            </button>
          ))}
        </div>
      )}

      {error && <Alert type="info" message={error} />}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Gesamt" value={stats.total} color="text-slate-100" />
          <StatCard label="Eingecheckt" value={stats.scanned}
            sub={`${stats.total > 0 ? Math.round(stats.scanned / stats.total * 100) : 0}%`}
            color="text-emerald-400" />
          <StatCard label="Noch gültig" value={stats.valid} color="text-blue-400" />
          <StatCard label="Umsatz" value={`${stats.revenue.toFixed(2)} €`} color="text-amber-400" />
        </div>
      )}

      {/* Formular */}
      {showForm && (
        <form onSubmit={handleCreate} className="card space-y-3">
          <SectionHeader title="Neues Abendkasse-Ticket" action={
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300">
              <X size={18} />
            </button>
          } />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={form.holder_name} onChange={e => setForm(f => ({ ...f, holder_name: e.target.value }))} />
            </div>
            <div>
              <label className="label">E-Mail</label>
              <input className="input" type="email" value={form.holder_email} onChange={e => setForm(f => ({ ...f, holder_email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Kategorie</label>
              <input className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
            </div>
            <div>
              <label className="label">Preis (€)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-sm">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? <Spinner size="sm" /> : 'Ticket erstellen'}
            </button>
          </div>
        </form>
      )}

      {/* QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setQrModal(null)}>
          <div className="card max-w-xs w-full text-center space-y-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-slate-100">QR-Code – {qrModal.name}</p>
            <img src={qrModal.url} alt="QR" className="mx-auto w-48 h-48 rounded" />
            <div className="flex gap-2 justify-center">
              <a href={qrModal.url} download="ticket-qr.png" className="btn-ghost text-sm">
                <Download size={14} /> Download
              </a>
              <button onClick={() => setQrModal(null)} className="btn-primary text-sm">Schließen</button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket-Liste */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-100">Tickets</h2>
          <div className="flex gap-1">
            {['ALL', 'VALID', 'SCANNED', 'REFUNDED'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filter === f ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-100'
                }`}>
                {f === 'ALL' ? 'Alle' : f}
              </button>
            ))}
          </div>
        </div>

        {!activeEvent
          ? <Empty icon="🎫" message="Kein Event ausgewählt" />
          : filtered.length === 0
            ? <Empty icon="🎫" message="Keine Tickets gefunden" />
            : (
              <div className="space-y-2">
                {filtered.map(t => (
                  <div key={t.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-100 truncate">{t.holder_name || '(kein Name)'}</span>
                        <Badge label={t.status} />
                        <span className="text-xs text-slate-500">{t.category}</span>
                      </div>
                      <div className="text-sm text-slate-400 flex flex-wrap gap-x-4 gap-y-0.5">
                        {t.holder_email && <span>{t.holder_email}</span>}
                        <span>{t.price.toFixed(2)} €</span>
                        {t.scanned_at && <span>Scan: {fmtDate(t.scanned_at)} {t.scanned_by && `· ${t.scanned_by}`}</span>}
                        <span className="text-slate-600">{t.source}</span>
                      </div>
                    </div>
                    <a href={tickets.qrUrl(t.id)} target="_blank" rel="noreferrer"
                      className="btn-ghost text-xs py-1 px-2 shrink-0">
                      QR
                    </a>
                  </div>
                ))}
              </div>
            )
        }
      </section>
    </div>
  )
}
