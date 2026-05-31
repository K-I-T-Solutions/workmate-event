import { useEffect, useRef, useCallback } from 'react'

export interface WSMessage { type: string; payload: unknown }

export function useWebSocket(onMessage: (msg: WSMessage) => void) {
  const onMsgRef = useRef(onMessage)
  onMsgRef.current = onMessage

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}/ws`
    let timer: ReturnType<typeof setTimeout>

    function connect() {
      const ws = new WebSocket(url)
      ws.onmessage = (e) => {
        try { onMsgRef.current(JSON.parse(e.data) as WSMessage) } catch { /* ignore */ }
      }
      ws.onclose = () => { timer = setTimeout(connect, 3000) }
      return ws
    }

    const ws = connect()
    return () => { clearTimeout(timer); ws.close() }
  }, [])
}

export function useEventSocket(
  handlers: Partial<Record<string, (payload: unknown) => void>>
) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const handler = useCallback((msg: WSMessage) => {
    handlersRef.current[msg.type]?.(msg.payload)
  }, [])
  useWebSocket(handler)
}
