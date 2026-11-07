// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { PlayerSnapshot } from '../../shared/types'
import { useGameSocket, type GameSocket } from './useGameSocket'

type Listener = (ev: unknown) => void

/** Minimal WebSocket stand-in driven by the test. */
class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  closeCalls: Array<[number | undefined, string | undefined]> = []
  private listeners = new Map<string, Listener[]>()

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }
  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  send(data: string): void {
    this.sent.push(data)
  }
  close(code?: number, reason?: string): void {
    this.closeCalls.push([code, reason])
    this.serverClose()
  }
  // --- test controls ---
  emit(type: string, ev: unknown = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(ev)
  }
  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open')
  }
  message(obj: unknown): void {
    this.emit('message', { data: JSON.stringify(obj) })
  }
  serverClose(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', {})
  }
  failToConnect(): void {
    this.emit('error', {})
    this.serverClose()
  }
  static get last(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1)
    if (!ws) throw new Error('no websocket created')
    return ws
  }
}

function snapshot(partial: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    type: 'snapshot',
    role: 'player',
    gameId: 'g',
    title: 't',
    pin: '0000',
    phase: 'lobby',
    serverNow: Date.now(),
    players: [],
    question: null,
    questionEndsAt: null,
    answerCounts: null,
    correctIndex: null,
    leaderboard: [],
    hasNextQuestion: true,
    me: null,
    ...partial,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as unknown as Response
}

describe('useGameSocket', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let scope = effectScope()
  let sock: GameSocket

  function create(extra: Partial<Parameters<typeof useGameSocket>[0]> = {}) {
    scope = effectScope()
    sock = scope.run(() =>
      useGameSocket({
        pin: '0000',
        role: 'player',
        playerId: 'p1',
        nickname: 'Alice',
        WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
        fetchImpl: fetchMock as unknown as typeof fetch,
        baseUrl: 'http://game.test',
        ...extra,
      }),
    )!
    return sock
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    FakeWebSocket.instances = []
    fetchMock = vi.fn(async () => jsonResponse(snapshot()))
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
  })

  it('connects with the right url, stores snapshots and measures the clock offset', () => {
    create()
    const ws = FakeWebSocket.last
    expect(ws.url).toBe('ws://game.test/ws/0000?role=player&playerId=p1&nickname=Alice')
    expect(sock.status.value).toBe('connecting')
    ws.open()
    expect(sock.status.value).toBe('connected')
    ws.message(snapshot({ phase: 'question', serverNow: Date.now() + 1500 }))
    expect(sock.snapshot.value?.phase).toBe('question')
    expect(sock.clockOffset.value).toBe(1500)
    expect(sock.serverNow()).toBe(Date.now() + 1500)
  })

  it('reconnects with exponential backoff after the socket drops', () => {
    create()
    FakeWebSocket.last.open()
    FakeWebSocket.last.serverClose()
    expect(sock.status.value).toBe('connecting')
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(499)
    expect(FakeWebSocket.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    FakeWebSocket.last.failToConnect() // failures = 1 → wait 500 ms
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(3)
    FakeWebSocket.last.failToConnect() // failures = 2 → wait 1000 ms
    vi.advanceTimersByTime(999)
    expect(FakeWebSocket.instances).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(FakeWebSocket.instances).toHaveLength(4)
  })

  it('reconnects immediately when the browser comes back online or the tab becomes visible', () => {
    create()
    FakeWebSocket.last.open()
    FakeWebSocket.last.serverClose()
    expect(FakeWebSocket.instances).toHaveLength(1)
    window.dispatchEvent(new Event('online'))
    expect(FakeWebSocket.instances).toHaveLength(2)
    FakeWebSocket.last.serverClose()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(FakeWebSocket.instances).toHaveLength(3)
  })

  it('pings every 20 s and drops a connection that stays silent for 10 s', () => {
    create()
    const ws = FakeWebSocket.last
    ws.open()
    vi.advanceTimersByTime(20_000)
    expect(ws.sent).toEqual(['{"type":"ping"}'])
    ws.message({ type: 'pong' })
    vi.advanceTimersByTime(20_000)
    expect(ws.sent).toHaveLength(2)
    // No pong this time.
    vi.advanceTimersByTime(10_000)
    expect(ws.closeCalls[0]?.[0]).toBe(4001)
    expect(sock.status.value).toBe('connecting')
    vi.advanceTimersByTime(500)
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it('falls back to HTTP polling after three failed attempts and answers via POST', async () => {
    create()
    FakeWebSocket.last.failToConnect()
    vi.advanceTimersByTime(500)
    FakeWebSocket.last.failToConnect()
    vi.advanceTimersByTime(1000)
    FakeWebSocket.last.failToConnect()
    expect(sock.status.value).toBe('polling')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://game.test/api/room/0000/snapshot?role=player&playerId=p1&nickname=Alice',
    )
    expect(sock.snapshot.value?.phase).toBe('lobby')

    fetchMock.mockResolvedValue(jsonResponse(snapshot({ phase: 'question' })))
    await vi.advanceTimersByTimeAsync(2000)
    expect(sock.snapshot.value?.phase).toBe('question')

    sock.send({ type: 'answer', questionIndex: 0, answerIndex: 2 })
    await vi.advanceTimersByTimeAsync(0)
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(post).toBeDefined()
    expect(String(post![0])).toBe('http://game.test/api/room/0000/answer?role=player&playerId=p1&nickname=Alice')
    expect(JSON.parse((post![1] as RequestInit).body as string)).toEqual({
      type: 'answer',
      questionIndex: 0,
      answerIndex: 2,
      playerId: 'p1',
    })
  })

  it('keeps retrying websockets while polling and switches back when one opens', async () => {
    create({ wsRetryMs: 5000 })
    for (let i = 0; i < 3; i++) {
      FakeWebSocket.last.failToConnect()
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(sock.status.value).toBe('polling')
    const before = FakeWebSocket.instances.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(FakeWebSocket.instances.length).toBe(before + 1)
    FakeWebSocket.last.open()
    expect(sock.status.value).toBe('connected')
    const calls = fetchMock.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('stops reconnecting after a fatal error such as a taken nickname', () => {
    create()
    const ws = FakeWebSocket.last
    ws.open()
    ws.message({ type: 'error', code: 'nickname_taken', message: 'taken' })
    ws.serverClose()
    expect(sock.error.value?.code).toBe('nickname_taken')
    expect(sock.status.value).toBe('offline')
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('sends host messages over the socket when connected', () => {
    create({ role: 'host', token: 'abc.def' })
    const ws = FakeWebSocket.last
    expect(ws.url).toBe('ws://game.test/ws/0000?role=host&token=abc.def')
    ws.open()
    sock.send({ type: 'start', phase: 'lobby' })
    expect(ws.sent).toEqual(['{"type":"start","phase":"lobby"}'])
  })

  it('disconnect closes the socket and stops all timers', () => {
    create()
    FakeWebSocket.last.open()
    sock.disconnect()
    expect(FakeWebSocket.last.closeCalls[0]?.[0]).toBe(1000)
    vi.advanceTimersByTime(60_000)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(sock.status.value).toBe('offline')
  })
})
