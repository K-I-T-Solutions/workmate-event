import { useState, useEffect } from 'react'
import { events, transactions, reportPdfUrl, Event, DailyReport } from '../api/client'
import { StatCard, Spinner, Empty, Alert } from '../components/ui'
import { BarChart2, Download, FileText } from 'lucide-react'

function fmtEur(v: number) { return `${v.toFixed(2)} €` }

export default function Reporting() {
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [report, setReport] = useState<DailyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState('')
  const [showDSFinVK, setShowDSFinVK] = useState(false)

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const ev = list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      setLoading(false)
    })
  }, [])

  async function loadReport(evId: string) {
    setLoadingReport(true); setError(''); setReport(null)
    try {
      const r = await transactions.report(evId)
      setReport(r)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoadingReport(false)
    }
  }

  function downloadDSFinVK() {
    if (!report) return
    const blob = new Blob([report.dsfinvk_export], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dsfinvk-${report.event_id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Reporting</h1>
        <div className="flex gap-2">
          {activeEvent && (
            <button onClick={() => loadReport(activeEvent.id)} disabled={loadingReport}
              className="btn-primary text-sm">
              {loadingReport ? <Spinner size="sm" /> : <><BarChart2 size={14} /> Tagesabschluss</>}
            </button>
          )}
          {activeEvent && (
            <a href={reportPdfUrl(activeEvent.id)} target="_blank" rel="noreferrer"
              className="btn-ghost text-sm">
              <FileText size={14} /> Druckansicht
            </a>
          )}
        </div>
      </div>

      {/* Event-Auswahl */}
      {eventList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {eventList.map(ev => (
            <button key={ev.id}
              onClick={() => { setActiveEvent(ev); setReport(null) }}
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

      {!activeEvent && <Empty icon="📊" message="Kein Event ausgewählt" />}

      {!report && activeEvent && !loadingReport && (
        <div className="flex flex-col items-center py-12 gap-3 text-slate-500">
          <BarChart2 size={40} className="opacity-30" />
          <p className="text-sm">Tagesabschluss generieren, um den Bericht anzuzeigen</p>
        </div>
      )}

      {loadingReport && (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      )}

      {report && (
        <div className="space-y-6">
          {/* Header */}
          <div className="card">
            <p className="text-xs text-slate-500 mb-1">
              Erstellt: {new Date(report.generated_at).toLocaleString('de-DE')}
            </p>
            <h2 className="text-xl font-bold text-slate-100">{report.event_name}</h2>
          </div>

          {/* Umsatz-Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Gesamtumsatz" value={fmtEur(report.total_revenue)} color="text-amber-400" />
            <StatCard label="Bareinnahmen" value={fmtEur(report.cash_revenue)} color="text-emerald-400" />
            <StatCard label="Karteneinnahmen" value={fmtEur(report.card_revenue)} color="text-blue-400" />
            <StatCard label="Stornos" value={fmtEur(report.refunds)} color="text-red-400" />
            <StatCard label="Tickets verkauft" value={report.tickets_sold} color="text-slate-100" />
            <StatCard label="Tickets gescannt" value={report.tickets_scanned} color="text-slate-100" />
          </div>

          {/* Transaktionsliste */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Transaktionen ({report.transactions?.length ?? 0})
            </h2>
            {!report.transactions?.length
              ? <Empty icon="🧾" message="Keine Transaktionen" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-slate-500 uppercase border-b border-slate-800">
                        <th className="text-left py-2 pr-4">Zeit</th>
                        <th className="text-left py-2 pr-4">Betrag</th>
                        <th className="text-left py-2 pr-4">Zahlart</th>
                        <th className="text-left py-2 pr-4">Status</th>
                        <th className="text-left py-2">Kassierer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {report.transactions.map(tx => (
                        <tr key={tx.id} className="text-slate-300">
                          <td className="py-2 pr-4 text-slate-500 font-mono text-xs">
                            {new Date(tx.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className={`py-2 pr-4 font-semibold ${tx.status === 'REFUNDED' ? 'text-red-400' : 'text-slate-100'}`}>
                            {tx.status === 'REFUNDED' ? '–' : ''}{tx.amount.toFixed(2)} €
                          </td>
                          <td className="py-2 pr-4">{tx.payment_method}</td>
                          <td className="py-2 pr-4">{tx.status}</td>
                          <td className="py-2 text-slate-500">{tx.cashier_id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </section>

          {/* DSFinV-K Export */}
          <section className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">DSFinV-K Export</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowDSFinVK(v => !v)} className="btn-ghost text-xs">
                  {showDSFinVK ? 'Ausblenden' : 'Anzeigen'}
                </button>
                <button onClick={downloadDSFinVK} className="btn-ghost text-xs">
                  <Download size={13} /> JSON
                </button>
              </div>
            </div>
            {showDSFinVK && (
              <pre className="text-xs text-slate-400 bg-slate-950 rounded-lg p-4 overflow-x-auto max-h-96">
                {report.dsfinvk_export}
              </pre>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
