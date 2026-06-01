import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { events, stream, Event, StreamStatus, Scene } from '../api/client'
import { Spinner, Alert } from '../components/ui'
import { useEventSocket } from '../hooks/useWebSocket'
import { Radio, Play, Square, RefreshCw, Monitor } from 'lucide-react'

function fmtTimecode(tc: string) {
  return tc ? tc.replace(/\.\d+$/, '') : '00:00:00'
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

export default function Livestream() {
  const [params] = useSearchParams()
  const [eventList, setEventList] = useState<Event[]>([])
  const [activeEvent, setActiveEvent] = useState<Event | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [status, setStatus] = useState<StreamStatus | null>(null)
  const [scenes, setScenes] = useState<Scene[]>([])
  const [currentScene, setCurrentScene] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [error, setError] = useState('')

  const loadStatus = useCallback(async (evId: string) => {
    try {
      const res = await stream.status(evId)
      setConfigured(res.configured)
      setStatus(res.status)
    } catch {
      setConfigured(false)
      setStatus(null)
    }
  }, [])

  const loadScenes = useCallback(async (evId: string) => {
    try {
      const res = await stream.scenes(evId)
      if (res.configured === false) return
      setScenes(res.scenes ?? [])
      setCurrentScene(res.currentProgramSceneName ?? '')
    } catch { /* OBS nicht erreichbar */ }
  }, [])

  useEffect(() => {
    events.list().then(list => {
      setEventList(list)
      const pre = params.get('event')
      const ev = list.find(e => e.id === pre) ?? list.find(e => e.status === 'ACTIVE') ?? list[0] ?? null
      setActiveEvent(ev)
      if (ev) {
        Promise.all([loadStatus(ev.id), loadScenes(ev.id)]).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })
  }, [params, loadStatus, loadScenes])

  useEventSocket({
    'stream.status': (payload: unknown) => {
      const p = payload as { active: boolean }
      setStatus(prev => prev ? { ...prev, outputActive: p.active } : null)
    },
    'stream.scene': (payload: unknown) => {
      const p = payload as { scene: string }
      setCurrentScene(p.scene)
    },
  })

  async function handleRefresh() {
    if (!activeEvent) return
    setRefreshing(true)
    await Promise.all([loadStatus(activeEvent.id), loadScenes(activeEvent.id)])
    setRefreshing(false)
  }

  async function handleStartStop() {
    if (!activeEvent) return
    setActionPending(true); setError('')
    try {
      if (status?.outputActive) {
        await stream.stop(activeEvent.id)
        setStatus(prev => prev ? { ...prev, outputActive: false } : null)
      } else {
        await stream.start(activeEvent.id)
        setStatus(prev => prev ? { ...prev, outputActive: true } : { outputActive: true, outputReconnecting: false, outputTimecode: '00:00:00', outputDuration: 0, outputBytes: 0, outputSkippedFrames: 0, outputTotalFrames: 0 })
      }
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setActionPending(false)
    }
  }

  async function handleSceneChange(sceneName: string) {
    if (!activeEvent || sceneName === currentScene) return
    setError('')
    try {
      await stream.setScene(activeEvent.id, sceneName)
      setCurrentScene(sceneName)
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const isLive = status?.outputActive === true

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-100">Livestream</h1>
        <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost text-sm">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Aktualisieren
        </button>
      </div>

      {/* Event-Auswahl */}
      {eventList.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {eventList.map(ev => (
            <button key={ev.id}
              onClick={() => {
                setActiveEvent(ev)
                loadStatus(ev.id)
                loadScenes(ev.id)
              }}
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

      {/* OBS nicht konfiguriert */}
      {configured === false && (
        <div className="card flex flex-col items-center gap-3 py-10 text-slate-500">
          <Radio size={40} className="opacity-30" />
          <p className="text-sm">OBS WebSocket nicht konfiguriert</p>
          <p className="text-xs text-slate-600">In <code className="font-mono">event.yaml</code> unter <code className="font-mono">obs.url</code> eintragen</p>
        </div>
      )}

      {/* Stream Status */}
      {configured !== false && (
        <div className={`card border-2 transition-all ${isLive ? 'border-red-500 bg-red-900/10' : 'border-slate-700'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`} />
              <div>
                <p className={`font-bold text-lg ${isLive ? 'text-red-400' : 'text-slate-400'}`}>
                  {isLive ? '● LIVE' : '○ OFFLINE'}
                </p>
                {isLive && status && (
                  <p className="text-xs text-slate-500">
                    {fmtTimecode(status.outputTimecode)} · {fmtBytes(status.outputBytes)} übertragen
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleStartStop}
              disabled={actionPending || configured === null}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
                isLive
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}>
              {actionPending
                ? <Spinner size="sm" />
                : isLive ? <><Square size={14} /> Stoppen</> : <><Play size={14} /> Starten</>}
            </button>
          </div>

          {isLive && status && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-100">{fmtTimecode(status.outputTimecode)}</div>
                <div className="text-xs text-slate-500">Laufzeit</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-slate-100">{fmtBytes(status.outputBytes)}</div>
                <div className="text-xs text-slate-500">Übertragen</div>
              </div>
              <div className="text-center">
                <div className={`text-lg font-bold ${status.outputSkippedFrames > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
                  {status.outputSkippedFrames}
                </div>
                <div className="text-xs text-slate-500">Verlorene Frames</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Szenen */}
      {scenes.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2">
            <Monitor size={18} /> OBS-Szenen
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {scenes.map(sc => (
              <button
                key={sc.sceneName}
                onClick={() => handleSceneChange(sc.sceneName)}
                className={`py-3 px-4 rounded-lg text-sm font-medium border-2 transition-all text-left truncate ${
                  sc.sceneName === currentScene
                    ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-100'
                }`}>
                {sc.sceneName === currentScene && <span className="mr-1">▶</span>}
                {sc.sceneName}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Event Streaming-Info */}
      {activeEvent && (
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold text-slate-100">Event-Einstellungen</h2>
          <div className="flex items-center gap-3 text-slate-400">
            <span className="text-xs uppercase tracking-wider">Streaming:</span>
            <span className={activeEvent.stream_enabled ? 'text-emerald-400' : 'text-slate-500'}>
              {activeEvent.stream_enabled ? '✓ Aktiviert' : '✗ Deaktiviert'}
            </span>
          </div>
          {activeEvent.stream_platform && (
            <div className="flex items-center gap-3 text-slate-400">
              <span className="text-xs uppercase tracking-wider">Plattform:</span>
              <span className="text-slate-200">{activeEvent.stream_platform}</span>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
