// Connection to a game room. The server is the single source of truth; this composable only keeps
// the latest snapshot fresh: WebSocket with heartbeat + reconnect, falling back to HTTP polling.

import { onScopeDispose, ref, type Ref } from 'vue'
import type { ClientMessage, ErrorMessage, Role, ServerMessage, Snapshot } from '../../shared/types'

export type ConnectionStatus = 'connecting' | 'connected' | 'polling' | 'offline'

export interface GameSocketOptions {
  pin: string
  role: Role
  playerId?: string
  nickname?: string
  token?: string
  /** Heartbeat period; the server answers pings without waking the room. */
  pingIntervalMs?: number
  /** Silence after a ping that counts as a dead connection. */
  pongTimeoutMs?: number
  /** Consecutive failed WebSocket attempts before switching to polling. */
  maxWsFailures?: number
  pollIntervalMs?: number
  /** While polling, how often to try WebSockets again. */
  wsRetryMs?: number
  /** Overrides for tests. */
  WebSocketImpl?: typeof WebSocket
  fetchImpl?: typeof fetch
  baseUrl?: string
}

export interface GameSocket {
  snapshot: Ref<Snapshot | null>
  error: Ref<ErrorMessage | null>
  status: Ref<ConnectionStatus>
  /** serverNow - Date.now() measured on the last snapshot; use `serverNow()` for countdowns. */
  clockOffset: Ref<number>
  serverNow: () => number
  send: (msg: ClientMessage) => void
  connect: () => void
  disconnect: () => void
}

const FATAL_CODES = new Set<ErrorMessage['code']>(['nickname_taken', 'invalid_nickname'])

export function useGameSocket(opts: GameSocketOptions): GameSocket {
  const pingIntervalMs = opts.pingIntervalMs ?? 20_000
  const pongTimeoutMs = opts.pongTimeoutMs ?? 10_000
  const maxWsFailures = opts.maxWsFailures ?? 3
  const pollIntervalMs = opts.pollIntervalMs ?? 2_000
  const wsRetryMs = opts.wsRetryMs ?? 30_000
  const WS = opts.WebSocketImpl ?? WebSocket
  const doFetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  const base = opts.baseUrl ?? (typeof location !== 'undefined' ? location.origin : 'http://localhost')

  const snapshot = ref<Snapshot | null>(null)
  const error = ref<ErrorMessage | null>(null)
  const status = ref<ConnectionStatus>('connecting')
  const clockOffset = ref(0)

  let ws: WebSocket | null = null
  let failures = 0
  let stopped = false
  let fatal = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let pongTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let wsRetryTimer: ReturnType<typeof setInterval> | null = null

  function query(): URLSearchParams {
    const p = new URLSearchParams({ role: opts.role })
    if (opts.role === 'host') {
      if (opts.token) p.set('token', opts.token)
    } else {
      if (opts.playerId) p.set('playerId', opts.playerId)
      if (opts.nickname) p.set('nickname', opts.nickname)
    }
    return p
  }

  function wsUrl(): string {
    const u = new URL(`/ws/${opts.pin}`, base)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.search = query().toString()
    return u.toString()
  }

  function httpUrl(path: string): string {
    const u = new URL(`/api/room/${opts.pin}/${path}`, base)
    u.search = query().toString()
    return u.toString()
  }

  function handleMessage(msg: ServerMessage): void {
    if (msg.type === 'snapshot') {
      clockOffset.value = msg.serverNow - Date.now()
      snapshot.value = msg
    } else if (msg.type === 'error') {
      error.value = msg
      if (FATAL_CODES.has(msg.code)) fatal = true
    }
  }

  // ---- heartbeat -------------------------------------------------------------

  function armPongTimer(): void {
    clearPongTimer()
    pongTimer = setTimeout(() => {
      // Nothing heard back: the socket is half-open. Closing triggers the reconnect path.
      ws?.close(4001, 'heartbeat timeout')
    }, pongTimeoutMs)
  }

  function clearPongTimer(): void {
    if (pongTimer) clearTimeout(pongTimer)
    pongTimer = null
  }

  function startHeartbeat(): void {
    stopHeartbeat()
    pingTimer = setInterval(() => {
      if (ws?.readyState === WS.OPEN) {
        ws.send('{"type":"ping"}')
        if (!pongTimer) armPongTimer()
      }
    }, pingIntervalMs)
  }

  function stopHeartbeat(): void {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = null
    clearPongTimer()
  }

  // ---- websocket -------------------------------------------------------------

  function connect(): void {
    if (stopped || fatal) return
    if (ws && (ws.readyState === WS.CONNECTING || ws.readyState === WS.OPEN)) return
    clearReconnectTimer()
    if (status.value !== 'polling') status.value = 'connecting'

    const socket = new WS(wsUrl())
    ws = socket
    let opened = false

    socket.addEventListener('open', () => {
      opened = true
      failures = 0
      status.value = 'connected'
      stopPolling()
      startHeartbeat()
    })
    socket.addEventListener('message', (ev) => {
      clearPongTimer()
      try {
        handleMessage(JSON.parse(String((ev as MessageEvent).data)) as ServerMessage)
      } catch {
        // ignore malformed frames
      }
    })
    socket.addEventListener('close', () => {
      if (ws !== socket) return
      ws = null
      stopHeartbeat()
      if (stopped) return
      if (fatal) {
        status.value = 'offline'
        return
      }
      if (!opened) failures++
      if (status.value === 'polling') return // the periodic WS retry will try again
      if (failures >= maxWsFailures) {
        startPolling()
      } else {
        scheduleReconnect()
      }
    })
    socket.addEventListener('error', () => {
      // A close event always follows; nothing to do here.
    })
  }

  function scheduleReconnect(): void {
    clearReconnectTimer()
    status.value = 'connecting'
    const delay = Math.min(500 * 2 ** Math.max(0, failures - 1), 5_000)
    reconnectTimer = setTimeout(connect, delay)
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  /** Called on `online` / tab becoming visible: do not wait for the backoff. */
  function wakeUp(): void {
    if (stopped || fatal) return
    if (ws && ws.readyState === WS.OPEN) return
    failures = Math.min(failures, maxWsFailures - 1)
    connect()
  }

  // ---- polling fallback ------------------------------------------------------

  async function pollOnce(): Promise<void> {
    try {
      const res = await doFetch(httpUrl('snapshot'))
      if (!res.ok) {
        if (res.status === 401 || res.status === 404) {
          error.value = { type: 'error', code: 'not_allowed', message: 'Spojení s hrou bylo odmítnuto.' }
          fatal = true
          stopPolling()
          status.value = 'offline'
        }
        return
      }
      handleMessage((await res.json()) as ServerMessage)
      if (status.value === 'polling') status.value = 'polling'
    } catch {
      // network hiccup; next tick retries
    }
  }

  function startPolling(): void {
    if (pollTimer) return
    status.value = 'polling'
    void pollOnce()
    pollTimer = setInterval(() => void pollOnce(), pollIntervalMs)
    wsRetryTimer = setInterval(() => {
      if (!ws) connect()
    }, wsRetryMs)
  }

  function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer)
    if (wsRetryTimer) clearInterval(wsRetryTimer)
    pollTimer = null
    wsRetryTimer = null
  }

  // ---- public ----------------------------------------------------------------

  function send(msg: ClientMessage): void {
    if (ws && ws.readyState === WS.OPEN) {
      ws.send(JSON.stringify(msg))
      return
    }
    if (status.value !== 'polling') return
    const path = opts.role === 'host' ? 'command' : 'answer'
    const body = opts.role === 'host' ? msg : { ...msg, playerId: opts.playerId }
    void doFetch(httpUrl(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(() => pollOnce())
      .catch(() => undefined)
  }

  function disconnect(): void {
    stopped = true
    clearReconnectTimer()
    stopHeartbeat()
    stopPolling()
    removeListeners()
    const s = ws
    ws = null
    s?.close(1000, 'bye')
    status.value = 'offline'
  }

  function onVisibility(): void {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') wakeUp()
  }

  function addListeners(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('online', wakeUp)
    document.addEventListener('visibilitychange', onVisibility)
  }

  function removeListeners(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('online', wakeUp)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  addListeners()
  connect()
  onScopeDispose(disconnect)

  return {
    snapshot,
    error,
    status,
    clockOffset,
    serverNow: () => Date.now() + clockOffset.value,
    send,
    connect,
    disconnect,
  }
}
