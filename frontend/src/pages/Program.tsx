import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { events, program, Event, EventProgram, ProgramItem } from '../api/client'
import { Spinner, Empty, SectionHeader, Alert } from '../components/ui'
import { Plus, X, GripVertical, QrCode, Download } from 'lucide-react'

function emptyItem(): ProgramItem {
  return { id: '', time: '', title: '', description: '', location: '', order: 0 }
}

export default function Program() {
  const [params] = useSearchParams()
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [prog, setProg] = useState<EventProgram | null>(null)
  const [items, setItems] = useState<ProgramItem[]>([emptyItem()])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showQR, setShowQR] = useState(false)

  async function loadProg(evId: string) {
    try {
      const p = await program.get(evId)
      setProg(p)
      setItems(p.items.length > 0 ? p.items : [emptyItem()])
    } catch {
      setProg(null)
      setItems([emptyItem()])
    }
  }

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const pre = params.get('event')
      const ev = list.find(e => e.id === pre) ?? list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      if (ev) loadProg(ev.id).finally(() => setLoading(false))
      else setLoading(false)
    })
  }, [params])

  function updateItem(idx: number, field: keyof ProgramItem, value: string | number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!activeEvent) return
    setSaving(true); setError(''); setSuccess('')
    try {
      const ordered = items
        .filter(it => it.title.trim())
        .map((it, i) => ({ ...it, order: i + 1 }))
      const p = await program.upsert(activeEvent.id, ordered)
      setProg(p)
      setItems(p.items.length > 0 ? p.items : [emptyItem()])
      setSuccess('Programm gespeichert.')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Programm</h1>
        {prog && (
          <button onClick={() => setShowQR(v => !v)} className="btn-ghost text-sm">
            <QrCode size={14} /> QR-Code
          </button>
        )}
      </div>

      {/* Event-Auswahl */}
      {eventList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {eventList.map(ev => (
            <button key={ev.id}
              onClick={() => { setActiveEvent(ev); loadProg(ev.id) }}
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
      {success && <Alert type="success" message={success} />}

      {/* QR-Code */}
      {showQR && activeEvent && (
        <div className="card flex flex-col sm:flex-row items-center gap-4">
          <img
            src={program.qrUrl(activeEvent.id)}
            alt="Programm QR"
            className="w-36 h-36 rounded bg-white p-1"
          />
          <div className="space-y-2 text-sm">
            <p className="text-slate-300 font-medium">Öffentliche Programmseite</p>
            {prog?.qr_code && (
              <p className="text-slate-500 font-mono text-xs break-all">{prog.qr_code}</p>
            )}
            <a
              href={program.qrUrl(activeEvent.id)}
              download={`programm-${activeEvent.id.slice(0, 8)}.png`}
              className="btn-ghost text-xs inline-flex">
              <Download size={13} /> PNG herunterladen
            </a>
          </div>
        </div>
      )}

      {!activeEvent
        ? <Empty icon="🎵" message="Kein Event ausgewählt" />
        : (
          <form onSubmit={handleSave} className="space-y-4">
            <SectionHeader title="Programmpunkte" action={
              <button type="button" onClick={addItem} className="btn-ghost text-sm">
                <Plus size={14} /> Punkt hinzufügen
              </button>
            } />

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="card flex gap-3 items-start">
                  <div className="text-slate-600 pt-2 shrink-0 cursor-grab">
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Uhrzeit</label>
                      <input className="input" placeholder="18:00" value={item.time}
                        onChange={e => updateItem(idx, 'time', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Titel *</label>
                      <input className="input" placeholder="Einlass" value={item.title}
                        onChange={e => updateItem(idx, 'title', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Ort</label>
                      <input className="input" placeholder="Hauptbühne" value={item.location}
                        onChange={e => updateItem(idx, 'location', e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Beschreibung</label>
                      <input className="input" value={item.description}
                        onChange={e => updateItem(idx, 'description', e.target.value)} />
                    </div>
                  </div>
                  <button type="button" onClick={() => removeItem(idx)}
                    className="text-slate-600 hover:text-red-400 transition-colors pt-2 shrink-0">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={addItem} className="btn-ghost text-sm">
                <Plus size={14} /> Punkt hinzufügen
              </button>
              <button type="submit" disabled={saving} className="btn-primary text-sm">
                {saving ? <Spinner size="sm" /> : 'Programm speichern'}
              </button>
            </div>
          </form>
        )
      }
    </div>
  )
}
