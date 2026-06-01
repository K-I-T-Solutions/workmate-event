import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { events, equipment, Event, Equipment as EqType, EventEquipment } from '../api/client'
import { Badge, Spinner, Empty, SectionHeader, Alert } from '../components/ui'
import { Plus, X, CheckCircle, Circle, AlertTriangle } from 'lucide-react'

export default function Equipment() {
  const [params] = useSearchParams()
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [inventory, setInventory] = useState<EqType[]>([])
  const [assignments, setAssignments] = useState<EventEquipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddEq, setShowAddEq] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [saving, setSaving] = useState(false)
  const [eqForm, setEqForm] = useState<{ name: string; category: EqType['category']; serial_number: string; notes: string }>(
    { name: '', category: 'OTHER', serial_number: '', notes: '' }
  )
  const [assignForm, setAssignForm] = useState({ equipment_id: '', quantity: '1' })
  const [tab, setTab] = useState<'event' | 'inventory'>('event')

  async function loadData(evId?: string) {
    const [inv, asgn] = await Promise.all([
      equipment.listAll(),
      evId ? equipment.listForEvent(evId) : Promise.resolve([] as EventEquipment[]),
    ])
    setInventory(inv)
    setAssignments(asgn)
  }

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const pre = params.get('event')
      const ev = list.find(e => e.id === pre) ?? list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      loadData(ev?.id).finally(() => setLoading(false))
    })
  }, [params])

  async function handleCreateEq(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await equipment.create(eqForm)
      await loadData(activeEvent?.id)
      setShowAddEq(false)
      setEqForm({ name: '', category: 'OTHER', serial_number: '', notes: '' })
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!activeEvent) return
    setSaving(true); setError('')
    try {
      await equipment.assign(activeEvent.id, {
        equipment_id: assignForm.equipment_id,
        quantity: parseInt(assignForm.quantity) || 1,
      })
      await loadData(activeEvent.id)
      setShowAssign(false)
      setAssignForm({ equipment_id: '', quantity: '1' })
    } catch (e: unknown) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  async function toggleCheckout(a: EventEquipment) {
    if (!activeEvent) return
    try {
      await equipment.updateAssignment(activeEvent.id, a.id, { checked_out: !a.checked_out })
      await loadData(activeEvent.id)
    } catch (e: unknown) { setError((e as Error).message) }
  }

  async function toggleCheckin(a: EventEquipment) {
    if (!activeEvent) return
    const condition = a.condition === 'DAMAGED' ? 'DAMAGED' : 'OK'
    try {
      await equipment.updateAssignment(activeEvent.id, a.id, { checked_in: !a.checked_in, condition })
      await loadData(activeEvent.id)
    } catch (e: unknown) { setError((e as Error).message) }
  }

  async function setDamaged(a: EventEquipment) {
    if (!activeEvent) return
    const newCond = a.condition === 'DAMAGED' ? 'OK' : 'DAMAGED'
    try {
      await equipment.updateAssignment(activeEvent.id, a.id, { condition: newCond })
      await loadData(activeEvent.id)
    } catch (e: unknown) { setError((e as Error).message) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const categoryColors: Record<string, string> = {
    NETWORK: 'text-blue-400', AUDIO: 'text-purple-400', DISPLAY: 'text-emerald-400',
    POWER: 'text-amber-400', OTHER: 'text-slate-400',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Equipment</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowAddEq(v => !v)} className="btn-ghost text-sm">
            <Plus size={14} /> Gerät anlegen
          </button>
          {activeEvent && (
            <button onClick={() => setShowAssign(v => !v)} className="btn-primary text-sm">
              <Plus size={14} /> Zuweisen
            </button>
          )}
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

      {error && <Alert type="error" message={error} />}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 pb-0">
        {(['event', 'inventory'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-100'
            }`}>
            {t === 'event' ? `Event (${assignments.length})` : `Bestand (${inventory.length})`}
          </button>
        ))}
      </div>

      {/* Gerät anlegen Formular */}
      {showAddEq && (
        <form onSubmit={handleCreateEq} className="card space-y-3">
          <SectionHeader title="Neues Gerät" action={
            <button type="button" onClick={() => setShowAddEq(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
          } />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Name *</label>
              <input className="input" required value={eqForm.name} onChange={e => setEqForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="label">Kategorie</label>
              <select className="input" value={eqForm.category} onChange={e => setEqForm(f => ({ ...f, category: e.target.value as EqType['category'] }))}>
                {(['NETWORK', 'AUDIO', 'DISPLAY', 'POWER', 'OTHER'] as EqType['category'][]).map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><label className="label">Seriennummer</label>
              <input className="input" value={eqForm.serial_number} onChange={e => setEqForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
            <div><label className="label">Notizen</label>
              <input className="input" value={eqForm.notes} onChange={e => setEqForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAddEq(false)} className="btn-ghost text-sm">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? <Spinner size="sm" /> : 'Anlegen'}
            </button>
          </div>
        </form>
      )}

      {/* Zuweisen Formular */}
      {showAssign && activeEvent && (
        <form onSubmit={handleAssign} className="card space-y-3">
          <SectionHeader title="Equipment zuweisen" action={
            <button type="button" onClick={() => setShowAssign(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
          } />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Gerät *</label>
              <select className="input" required value={assignForm.equipment_id}
                onChange={e => setAssignForm(f => ({ ...f, equipment_id: e.target.value }))}>
                <option value="">– wählen –</option>
                {inventory.map(eq => <option key={eq.id} value={eq.id}>{eq.name} ({eq.category})</option>)}
              </select></div>
            <div><label className="label">Anzahl</label>
              <input className="input" type="number" min="1" value={assignForm.quantity}
                onChange={e => setAssignForm(f => ({ ...f, quantity: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAssign(false)} className="btn-ghost text-sm">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? <Spinner size="sm" /> : 'Zuweisen'}
            </button>
          </div>
        </form>
      )}

      {/* Event-Equipment */}
      {tab === 'event' && (
        assignments.length === 0
          ? <Empty icon="📦" message="Kein Equipment für dieses Event" />
          : (
            <div className="space-y-2">
              {assignments.map(a => (
                <div key={a.id} className="card flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-semibold uppercase ${categoryColors[a.category ?? 'OTHER']}`}>{a.category}</span>
                      <span className="font-medium text-slate-100 truncate">{a.name}</span>
                      {a.serial_number && <span className="text-xs text-slate-500 font-mono">{a.serial_number}</span>}
                      <Badge label={a.equipment_status ?? 'AVAILABLE'} />
                    </div>
                    <div className="text-xs text-slate-500">Anzahl: {a.quantity}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setDamaged(a)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        a.condition === 'DAMAGED' ? 'bg-red-900/40 text-red-400' : 'text-slate-500 hover:text-amber-400'
                      }`}>
                      <AlertTriangle size={12} /> Defekt
                    </button>
                    <button onClick={() => toggleCheckout(a)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        a.checked_out ? 'bg-blue-900/40 text-blue-400' : 'text-slate-500 hover:text-blue-400'
                      }`}>
                      {a.checked_out ? <CheckCircle size={13} /> : <Circle size={13} />} Ausgabe
                    </button>
                    <button onClick={() => toggleCheckin(a)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        a.checked_in ? 'bg-emerald-900/40 text-emerald-400' : 'text-slate-500 hover:text-emerald-400'
                      }`}>
                      {a.checked_in ? <CheckCircle size={13} /> : <Circle size={13} />} Rückgabe
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {/* Inventar */}
      {tab === 'inventory' && (
        inventory.length === 0
          ? <Empty icon="📦" message="Kein Equipment im Bestand" />
          : (
            <div className="space-y-2">
              {inventory.map(eq => (
                <div key={eq.id} className="card flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold uppercase ${categoryColors[eq.category]}`}>{eq.category}</span>
                      <span className="font-medium text-slate-100 truncate">{eq.name}</span>
                      <Badge label={eq.status} />
                    </div>
                    {eq.serial_number && <div className="text-xs text-slate-500 font-mono">{eq.serial_number}</div>}
                    {eq.notes && <div className="text-xs text-slate-500">{eq.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  )
}
