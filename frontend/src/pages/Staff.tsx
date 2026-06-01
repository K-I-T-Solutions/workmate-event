import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { events, staff, Event, StaffAssignment } from '../api/client'
import { Badge, Spinner, Empty, SectionHeader, Alert } from '../components/ui'
import { useEventSocket } from '../hooks/useWebSocket'
import { Plus, X, LogIn, LogOut, Phone } from 'lucide-react'

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

const ROLES = ['EINLASS', 'KASSE', 'TECHNIKER', 'AUFBAU'] as const

const roleColors: Record<string, string> = {
  EINLASS:   'bg-emerald-900/40 text-emerald-400',
  KASSE:     'bg-blue-900/40 text-blue-400',
  TECHNIKER: 'bg-purple-900/40 text-purple-400',
  AUFBAU:    'bg-amber-900/40 text-amber-400',
}

export default function Staff() {
  const [params] = useSearchParams()
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [staffList, setStaffList] = useState<StaffAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<{
    name: string; role: StaffAssignment['role']; phone: string; agency: string
    hourly_rate: string; start_time: string; end_time: string; notes: string
  }>({ name: '', role: 'EINLASS', phone: '', agency: '', hourly_rate: '', start_time: '', end_time: '', notes: '' })

  async function loadStaff(evId: string) {
    const list = await staff.list(evId)
    setStaffList(list)
  }

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const pre = params.get('event')
      const ev = list.find(e => e.id === pre) ?? list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      if (ev) loadStaff(ev.id).finally(() => setLoading(false))
      else setLoading(false)
    })
  }, [params])

  useEventSocket({
    'staff.checkin': () => { if (activeEvent) loadStaff(activeEvent.id) },
  })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!activeEvent) return
    setSaving(true); setError('')
    try {
      await staff.add(activeEvent.id, {
        ...form,
        hourly_rate: parseFloat(form.hourly_rate) || 0,
        start_time: form.start_time || new Date().toISOString(),
        end_time: form.end_time || new Date().toISOString(),
      })
      await loadStaff(activeEvent.id)
      setShowForm(false)
      setForm({ name: '', role: 'EINLASS', phone: '', agency: '', hourly_rate: '', start_time: '', end_time: '', notes: '' })
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function toggleCheckin(s: StaffAssignment) {
    if (!activeEvent) return
    try {
      await staff.update(activeEvent.id, s.id, { checked_in: !s.checked_in })
      await loadStaff(activeEvent.id)
    } catch (e: unknown) { setError((e as Error).message) }
  }

  async function toggleCheckout(s: StaffAssignment) {
    if (!activeEvent) return
    try {
      await staff.update(activeEvent.id, s.id, { checked_out: !s.checked_out })
      await loadStaff(activeEvent.id)
    } catch (e: unknown) { setError((e as Error).message) }
  }

  async function handleRemove(s: StaffAssignment) {
    if (!activeEvent || !window.confirm(`${s.name} entfernen?`)) return
    try {
      await staff.remove(activeEvent.id, s.id)
      await loadStaff(activeEvent.id)
    } catch (e: unknown) { setError((e as Error).message) }
  }

  const byRole = ROLES.map(role => ({
    role,
    members: staffList.filter(s => s.role === role),
  })).filter(g => g.members.length > 0)

  const checkedIn  = staffList.filter(s => s.checked_in && !s.checked_out).length
  const checkedOut = staffList.filter(s => s.checked_out).length
  const total      = staffList.length

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Personal</h1>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary text-sm">
          <Plus size={14} /> Person hinzufügen
        </button>
      </div>

      {/* Event-Auswahl */}
      {eventList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {eventList.map(ev => (
            <button key={ev.id}
              onClick={() => { setActiveEvent(ev); loadStaff(ev.id) }}
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

      {error && <Alert type="error" message={error} />}

      {/* Summary */}
      {total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center">
            <div className="text-2xl font-bold text-slate-100">{total}</div>
            <div className="text-xs text-slate-400 mt-1">Gesamt</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-emerald-400">{checkedIn}</div>
            <div className="text-xs text-slate-400 mt-1">Anwesend</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-slate-500">{checkedOut}</div>
            <div className="text-xs text-slate-400 mt-1">Abgegangen</div>
          </div>
        </div>
      )}

      {/* Formular */}
      {showForm && (
        <form onSubmit={handleAdd} className="card space-y-3">
          <SectionHeader title="Person hinzufügen" action={
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
          } />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Name *</label>
              <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="label">Rolle</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as StaffAssignment['role'] }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select></div>
            <div><label className="label">Telefon</label>
              <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="label">Agentur</label>
              <input className="input" value={form.agency} onChange={e => setForm(f => ({ ...f, agency: e.target.value }))} /></div>
            <div><label className="label">Stundenlohn (€)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.hourly_rate}
                onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} /></div>
            <div><label className="label">Notizen</label>
              <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div><label className="label">Dienstbeginn</label>
              <input className="input" type="datetime-local" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} /></div>
            <div><label className="label">Dienstende</label>
              <input className="input" type="datetime-local" value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-sm">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? <Spinner size="sm" /> : 'Hinzufügen'}
            </button>
          </div>
        </form>
      )}

      {/* Personal nach Rollen */}
      {!activeEvent
        ? <Empty icon="👥" message="Kein Event ausgewählt" />
        : staffList.length === 0
          ? <Empty icon="👥" message="Noch kein Personal für dieses Event" />
          : (
            <div className="space-y-6">
              {byRole.map(({ role, members }) => (
                <section key={role}>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">{role} ({members.length})</h2>
                  <div className="space-y-2">
                    {members.map(s => (
                      <div key={s.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${roleColors[s.role]}`}>
                          {s.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-100">{s.name}</span>
                            {s.agency && <span className="text-xs text-slate-500">{s.agency}</span>}
                            {s.checked_in && !s.checked_out && (
                              <Badge label="ACTIVE" />
                            )}
                            {s.checked_out && <span className="text-xs text-slate-500">abgegangen</span>}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 mt-0.5">
                            {s.phone && <span className="flex items-center gap-1"><Phone size={10} />{s.phone}</span>}
                            {s.hourly_rate > 0 && <span>{s.hourly_rate.toFixed(2)} €/h</span>}
                            {s.checkin_at && <span>Ein: {fmtTime(s.checkin_at)}</span>}
                            {s.checkout_at && <span>Aus: {fmtTime(s.checkout_at)}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => toggleCheckin(s)}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                              s.checked_in ? 'bg-emerald-900/40 text-emerald-400' : 'text-slate-500 hover:text-emerald-400'
                            }`}>
                            <LogIn size={13} /> Einchecken
                          </button>
                          <button onClick={() => toggleCheckout(s)}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                              s.checked_out ? 'bg-slate-700 text-slate-300' : 'text-slate-500 hover:text-slate-300'
                            }`}>
                            <LogOut size={13} /> Auschecken
                          </button>
                          <button onClick={() => handleRemove(s)}
                            className="text-slate-600 hover:text-red-400 transition-colors">
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
      }
    </div>
  )
}
