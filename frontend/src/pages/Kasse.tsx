import { useState, useEffect } from 'react'
import { events, transactions, Event, Transaction } from '../api/client'
import { Badge, StatCard, Spinner, Empty, Alert } from '../components/ui'
import { useEventSocket } from '../hooks/useWebSocket'
import { CreditCard, Banknote, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'

function fmtDate(d: string) {
  return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Kasse() {
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [txList, setTxList] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    holder_name: '', holder_email: '',
    ticket_category: 'ABENDKASSE', price: '',
    amount: '', payment_method: 'CASH' as 'CASH' | 'CARD',
  })
  const [qrModal, setQrModal] = useState<{ url: string; checkoutUrl?: string } | null>(null)
  const [refunding, setRefunding] = useState<string | null>(null)

  async function loadTx(evId: string) {
    const list = await transactions.list(evId)
    setTxList(list)
  }

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const ev = list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      if (ev) loadTx(ev.id).finally(() => setLoading(false))
      else setLoading(false)
    })
  }, [])

  useEventSocket({
    'transaction.completed': () => { if (activeEvent) loadTx(activeEvent.id) },
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeEvent) return
    setProcessing(true); setError(''); setSuccess('')
    try {
      const price = parseFloat(form.price) || 0
      const amount = parseFloat(form.amount) || price
      const res = await transactions.create(activeEvent.id, {
        ticket_category: form.ticket_category,
        ticket_price: price,
        holder_name: form.holder_name,
        holder_email: form.holder_email,
        amount,
        payment_method: form.payment_method,
      })
      if (res.qr_image) {
        setQrModal({ url: res.qr_image, checkoutUrl: res.checkout_url })
      } else if (res.checkout_url) {
        setQrModal({ url: '', checkoutUrl: res.checkout_url })
      } else {
        setSuccess('Transaktion abgeschlossen.')
      }
      setShowForm(false)
      setForm({ holder_name: '', holder_email: '', ticket_category: 'ABENDKASSE', price: '', amount: '', payment_method: 'CASH' })
      await loadTx(activeEvent.id)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleRefund(txId: string) {
    if (!window.confirm('Transaktion wirklich stornieren?')) return
    setRefunding(txId)
    try {
      await transactions.refund(txId)
      if (activeEvent) await loadTx(activeEvent.id)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setRefunding(null)
    }
  }

  const totalToday = txList.filter(t => t.status === 'COMPLETED').reduce((s, t) => s + t.amount, 0)
  const cashToday   = txList.filter(t => t.status === 'COMPLETED' && t.payment_method === 'CASH').reduce((s, t) => s + t.amount, 0)
  const cardToday   = txList.filter(t => t.status === 'COMPLETED' && t.payment_method === 'CARD').reduce((s, t) => s + t.amount, 0)

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Kasse</h1>
        <button onClick={() => setShowForm(v => !v)} className="btn-primary text-sm">
          {showForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Verkauf
        </button>
      </div>

      {/* Event-Auswahl */}
      {eventList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {eventList.map(ev => (
            <button key={ev.id}
              onClick={() => { setActiveEvent(ev); loadTx(ev.id) }}
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Umsatz gesamt" value={`${totalToday.toFixed(2)} €`} color="text-amber-400" />
        <StatCard label="Bar" value={`${cashToday.toFixed(2)} €`} color="text-emerald-400" />
        <StatCard label="Karte" value={`${cardToday.toFixed(2)} €`} color="text-blue-400" />
      </div>

      {/* Verkaufsformular */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <h2 className="text-base font-semibold text-slate-100">Neuer Verkauf</h2>
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
              <label className="label">Ticket-Kategorie</label>
              <input className="input" value={form.ticket_category} onChange={e => setForm(f => ({ ...f, ticket_category: e.target.value }))} />
            </div>
            <div>
              <label className="label">Ticket-Preis (€)</label>
              <input className="input" type="number" step="0.01" min="0" required value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value, amount: e.target.value }))} />
            </div>
          </div>

          {/* Zahlungsart */}
          <div>
            <label className="label mb-2">Zahlungsart</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button"
                onClick={() => setForm(f => ({ ...f, payment_method: 'CASH' }))}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-colors ${
                  form.payment_method === 'CASH'
                    ? 'border-emerald-500 bg-emerald-900/30 text-emerald-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}>
                <Banknote size={20} /> Bar
              </button>
              <button type="button"
                onClick={() => setForm(f => ({ ...f, payment_method: 'CARD' }))}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-colors ${
                  form.payment_method === 'CARD'
                    ? 'border-blue-500 bg-blue-900/30 text-blue-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}>
                <CreditCard size={20} /> Karte
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-sm">Abbrechen</button>
            <button type="submit" disabled={processing || !activeEvent} className="btn-primary text-sm">
              {processing ? <Spinner size="sm" /> : `${form.payment_method === 'CASH' ? 'Bar kassieren' : 'Karte'} – ${parseFloat(form.price || '0').toFixed(2)} €`}
            </button>
          </div>
        </form>
      )}

      {/* QR / Checkout Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setQrModal(null)}>
          <div className="card max-w-sm w-full text-center space-y-4" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-slate-100">Ticket-QR-Code</p>
            {qrModal.url && <img src={qrModal.url} alt="QR" className="mx-auto w-48 h-48 rounded" />}
            {qrModal.checkoutUrl && (
              <a href={qrModal.checkoutUrl} target="_blank" rel="noreferrer"
                className="btn-primary w-full justify-center text-sm">
                SumUp Zahlung öffnen
              </a>
            )}
            <button onClick={() => setQrModal(null)} className="btn-ghost w-full justify-center text-sm">Schließen</button>
          </div>
        </div>
      )}

      {/* Transaktionsliste */}
      <section>
        <h2 className="text-lg font-semibold text-slate-100 mb-3">Transaktionen</h2>
        {!activeEvent
          ? <Empty icon="🧾" message="Kein Event ausgewählt" />
          : txList.length === 0
            ? <Empty icon="🧾" message="Noch keine Transaktionen" />
            : (
              <div className="space-y-2">
                {txList.map(tx => (
                  <div key={tx.id} className="card flex items-center gap-3">
                    <div className={`shrink-0 p-2 rounded-lg ${tx.payment_method === 'CASH' ? 'bg-emerald-900/40' : 'bg-blue-900/40'}`}>
                      {tx.payment_method === 'CASH'
                        ? <Banknote size={16} className="text-emerald-400" />
                        : <CreditCard size={16} className="text-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100">{tx.amount.toFixed(2)} €</span>
                        <Badge label={tx.status} />
                      </div>
                      <div className="text-xs text-slate-500">{fmtDate(tx.created_at)} · {tx.cashier_id}</div>
                    </div>
                    {tx.status === 'COMPLETED' && (
                      <button onClick={() => handleRefund(tx.id)}
                        disabled={refunding === tx.id}
                        className="btn-ghost text-xs py-1 px-2 text-amber-400 hover:text-amber-300 shrink-0">
                        {refunding === tx.id ? <Spinner size="sm" /> : <RotateCcw size={13} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
        }
      </section>
    </div>
  )
}
