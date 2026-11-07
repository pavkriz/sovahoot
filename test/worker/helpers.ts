import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { expect } from 'vitest'
import type { ClientMessage, ServerMessage, Snapshot } from '../../src/shared/types'

const worker = exports.default

export const BASE = 'http://sovahoot.test'

/**
 * The Vitest plugin keeps Durable Object and D1 storage across tests, so every test
 * starts by wiping the room it uses and the scores table.
 */
export async function resetRoom(pin: string): Promise<void> {
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(pin))
  await evictDurableObject(stub, { webSockets: 'close' }).catch(() => undefined)
  await runInDurableObject(stub, async (_instance, state) => {
    await state.storage.deleteAll()
    await state.storage.deleteAlarm()
  })
  await evictDurableObject(stub, { webSockets: 'close' }).catch(() => undefined)
  await env.DB.exec('DELETE FROM scores')
}

export async function hostToken(password = 'test-secret'): Promise<string> {
  const res = await worker.fetch(`${BASE}/api/host/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { token: string }
  return body.token
}

export function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(`${BASE}${path}`, init)
}

/** A WebSocket client that queues every server message and lets tests await a matching snapshot. */
export class WsClient {
  readonly messages: ServerMessage[] = []
  private waiters: Array<() => void> = []
  closed = false

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (ev) => {
      this.messages.push(JSON.parse(String(ev.data)) as ServerMessage)
      const w = this.waiters
      this.waiters = []
      w.forEach((fn) => fn())
    })
    ws.addEventListener('close', () => {
      this.closed = true
      const w = this.waiters
      this.waiters = []
      w.forEach((fn) => fn())
    })
  }

  static async connect(path: string): Promise<WsClient> {
    const res = await worker.fetch(`${BASE}${path}`, { headers: { Upgrade: 'websocket' } })
    expect(res.status).toBe(101)
    const ws = res.webSocket
    if (!ws) throw new Error('no websocket on response')
    ws.accept()
    return new WsClient(ws)
  }

  static async connectExpecting(path: string, status: number): Promise<Response> {
    const res = await worker.fetch(`${BASE}${path}`, { headers: { Upgrade: 'websocket' } })
    expect(res.status).toBe(status)
    return res
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg))
  }

  get snapshots(): Snapshot[] {
    return this.messages.filter((m): m is Snapshot => m.type === 'snapshot')
  }

  get latest(): Snapshot | undefined {
    return this.snapshots.at(-1)
  }

  /** Resolves with the first snapshot (newest first) matching `pred`, waiting for new messages as needed. */
  async until(pred: (s: Snapshot) => boolean, timeoutMs = 3000): Promise<Snapshot> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const hit = [...this.snapshots].reverse().find(pred)
      if (hit) return hit
      if (this.closed) throw new Error('socket closed before condition was met')
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error(`timeout waiting for snapshot; last: ${JSON.stringify(this.latest)}`)
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, remaining)
        this.waiters.push(() => {
          clearTimeout(t)
          resolve()
        })
      })
    }
  }

  async untilError(timeoutMs = 3000): Promise<Extract<ServerMessage, { type: 'error' }>> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const err = this.messages.find((m) => m.type === 'error')
      if (err && err.type === 'error') return err
      if (Date.now() >= deadline) throw new Error('timeout waiting for error')
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 50)
        this.waiters.push(() => {
          clearTimeout(t)
          resolve()
        })
      })
    }
  }

  close(): void {
    this.ws.close(1000, 'test done')
  }
}

export function playerPath(pin: string, playerId: string, nickname: string, avatar?: string): string {
  const q = new URLSearchParams({ role: 'player', playerId, nickname })
  if (avatar) q.set('avatar', avatar)
  return `/ws/${pin}?${q}`
}

export function hostPath(pin: string, token: string): string {
  return `/ws/${pin}?role=host&token=${encodeURIComponent(token)}`
}
