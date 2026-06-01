import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { NotFoundException } from '@zxing/library'
import { events, tickets, Event, Ticket } from '../api/client'
import { Badge, Spinner, Alert } from '../components/ui'
import { Camera, CameraOff } from 'lucide-react'

type ScanResult =
  | { ok: true;  ticket: Ticket; offline: boolean }
  | { ok: false; message: string }

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function Scanner() {
  const [params] = useSearchParams()
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [scanning, setScanning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<Array<{ qr: string; result: ScanResult; time: string }>>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const lastScan = useRef<string>('')
  const cooldownRef = useRef(false)

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const preselect = params.get('event')
      const ev = list.find(e => e.id === preselect) ?? list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      setLoading(false)
    })
  }, [params])

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
  }, [])

  const handleDecode = useCallback(async (qr: string) => {
    if (cooldownRef.current || qr === lastScan.current) return
    lastScan.current = qr
    cooldownRef.current = true
    setProcessing(true)

    try {
      const res = await tickets.scan(qr)
      const r: ScanResult = { ok: true, ticket: res.ticket, offline: res.offline_mode }
      setResult(r)
      setHistory(h => [{ qr, result: r, time: fmtTime(new Date().toISOString()) }, ...h.slice(0, 9)])
    } catch (e: unknown) {
      const msg = (e as Error).message
      const r: ScanResult = { ok: false, message: msg }
      setResult(r)
      setHistory(h => [{ qr, result: r, time: fmtTime(new Date().toISOString()) }, ...h.slice(0, 9)])
    } finally {
      setProcessing(false)
      setTimeout(() => {
        cooldownRef.current = false
        lastScan.current = ''
        setResult(null)
      }, 3000)
    }
  }, [])

  const startScanner = useCallback(async () => {
    if (!videoRef.current) return
    if (!navigator.mediaDevices || !window.isSecureContext) {
      setResult({ ok: false, message: 'Kamera benötigt HTTPS. Bitte https:// verwenden.' })
      return
    }
    const reader = new BrowserMultiFormatReader()
    setScanning(true)
    try {
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (res, err) => {
        if (res) handleDecode(res.getText())
        if (err && !(err instanceof NotFoundException)) console.error(err)
      })
      controlsRef.current = controls
    } catch (e: unknown) {
      const msg = (e as Error).message ?? String(e)
      setResult({ ok: false, message: `Kamera-Fehler: ${msg}` })
      setScanning(false)
    }
  }, [handleDecode])

  useEffect(() => () => { stopScanner() }, [stopScanner])

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">QR-Scanner</h1>
        {activeEvent && (
          <span className="text-xs text-emerald-400 font-semibold">{activeEvent.name}</span>
        )}
      </div>

      {/* Event-Auswahl */}
      {eventList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {eventList.map(ev => (
            <button key={ev.id}
              onClick={() => setActiveEvent(ev)}
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

      {/* Kamera */}
      <div className="card overflow-hidden p-0 relative bg-black aspect-square max-h-80">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          style={{ display: scanning ? 'block' : 'none' }}
          playsInline
          muted
        />
        {!scanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-500">
            <CameraOff size={48} />
            <p className="text-sm">Kamera inaktiv</p>
          </div>
        )}
        {scanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-[20%] border-2 border-blue-400 rounded-lg opacity-70" />
          </div>
        )}
        {processing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        )}
      </div>

      {/* Scan-Ergebnis */}
      {result && (
        <div className={`card border-2 transition-all ${result.ok ? 'border-emerald-500 bg-emerald-900/20' : 'border-red-500 bg-red-900/20'}`}>
          {result.ok ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-lg font-bold">✓ Gültig</span>
                <Badge label={result.ticket.status} />
                {result.offline && <span className="text-xs text-amber-400">(Offline)</span>}
              </div>
              <p className="text-slate-100 font-medium">{result.ticket.holder_name || '(kein Name)'}</p>
              <p className="text-slate-400 text-sm">{result.ticket.category} · {result.ticket.price.toFixed(2)} €</p>
            </div>
          ) : (
            <div>
              <span className="text-red-400 text-lg font-bold">✗ Ungültig</span>
              <p className="text-slate-300 text-sm mt-1">{result.message}</p>
            </div>
          )}
        </div>
      )}

      {/* Steuerung */}
      <div className="flex gap-3">
        {!scanning ? (
          <button onClick={startScanner} className="btn-primary flex-1 justify-center">
            <Camera size={16} /> Scanner starten
          </button>
        ) : (
          <button onClick={stopScanner} className="btn-danger flex-1 justify-center">
            <CameraOff size={16} /> Scanner stoppen
          </button>
        )}
      </div>

      {!activeEvent && (
        <Alert type="info" message="Kein Event ausgewählt. Bitte ein Event wählen." />
      )}

      {/* Scan-Verlauf */}
      {history.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">Letzte Scans</h2>
          <div className="space-y-1">
            {history.map((h, i) => (
              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                h.result.ok ? 'bg-emerald-900/20 text-emerald-300' : 'bg-red-900/20 text-red-300'
              }`}>
                <span className="font-mono">{h.time}</span>
                <span className="flex-1 truncate">
                  {h.result.ok ? (h.result.ticket.holder_name || h.qr) : h.result.message}
                </span>
                <span>{h.result.ok ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
