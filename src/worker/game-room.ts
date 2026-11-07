// One Durable Object per game PIN. Thin I/O shell around GameEngine:
// WebSockets (hibernation API), the question deadline alarm, persistence and the D1 write-out.

import { DurableObject } from 'cloudflare:workers'
import { decodeAvatar, type Avatar } from '../shared/avatars'
import { findGameByPin } from '../shared/games'
import type { ClientMessage, ErrorCode, Role, ServerMessage } from '../shared/types'
import { GameEngine, type EngineState } from './game-engine'
import { saveScores } from './scores'

interface Attachment {
  role: Role
  playerId: string | null
}

const STATE_KEY = 'state'
const PIN_KEY = 'pin'
const SAVED_SESSION_KEY = 'savedSession'

export class GameRoom extends DurableObject<Env> {
  private engine: GameEngine | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Heartbeats are answered by the runtime without waking a hibernated object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'))
    ctx.blockConcurrencyWhile(async () => {
      const pin = await ctx.storage.get<string>(PIN_KEY)
      if (pin) this.engine = await this.buildEngine(pin)
    })
  }

  private async buildEngine(pin: string): Promise<GameEngine> {
    const game = findGameByPin(pin)
    if (!game) throw new Error(`unknown pin ${pin}`)
    const state = await this.ctx.storage.get<EngineState>(STATE_KEY)
    return state ? GameEngine.fromState(game, state) : new GameEngine(game)
  }

  private async ensureEngine(pin: string): Promise<GameEngine> {
    if (!this.engine) {
      this.engine = await this.buildEngine(pin)
      await this.ctx.storage.put(PIN_KEY, pin)
    }
    return this.engine
  }

  // ---- HTTP entry (internal URLs built by the Worker) ----------------------

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const pin = url.searchParams.get('pin') ?? ''
    if (!findGameByPin(pin)) return json({ error: 'unknown pin' }, 404)
    const engine = await this.ensureEngine(pin)
    const role: Role = url.searchParams.get('role') === 'host' ? 'host' : 'player'
    const playerId = url.searchParams.get('playerId')
    const nickname = url.searchParams.get('nickname') ?? ''
    const avatar = decodeAvatar(url.searchParams.get('avatar'))

    switch (url.pathname) {
      case '/ws':
        return this.openWebSocket(request, engine, role, playerId, nickname, avatar)
      case '/snapshot': {
        if (role === 'player' && playerId) await this.joinOrReconnect(engine, playerId, nickname, avatar)
        return json(engine.snapshotFor(role, playerId, Date.now()))
      }
      case '/command': {
        // Host commands over plain HTTP (polling fallback). Auth was checked by the Worker.
        if (request.method !== 'POST' || role !== 'host') return json({ error: 'method' }, 405)
        const msg = (await request.json().catch(() => null)) as ClientMessage | null
        if (!msg || typeof msg !== 'object') return json({ error: 'bad body' }, 400)
        const ok = await this.applyHostCommand(engine, msg, Date.now())
        return json({ ok })
      }
      case '/answer': {
        if (request.method !== 'POST') return json({ error: 'method' }, 405)
        const body = (await request.json().catch(() => null)) as Partial<{
          playerId: string
          questionIndex: number
          answerIndex: number
        }> | null
        if (!body || typeof body.playerId !== 'string') return json({ error: 'bad body' }, 400)
        const ok = await this.mutate(() =>
          engine.answer(body.playerId!, Number(body.questionIndex), Number(body.answerIndex), Date.now()),
        )
        return json({ ok })
      }
      default:
        return json({ error: 'not found' }, 404)
    }
  }

  private async openWebSocket(
    request: Request,
    engine: GameEngine,
    role: Role,
    playerId: string | null,
    nickname: string,
    avatar: Avatar,
  ): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'expected websocket' }, 426)
    }
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    const attachment: Attachment = { role, playerId: role === 'player' ? playerId : null }
    this.ctx.acceptWebSocket(server, [role])
    server.serializeAttachment(attachment)

    if (role === 'player' && playerId) {
      const result = await this.joinOrReconnect(engine, playerId, nickname, avatar)
      if (!result.ok) {
        send(server, { type: 'error', code: result.code, message: errorText(result.code) })
        server.close(4000, result.code)
        return new Response(null, { status: 101, webSocket: client })
      }
    } else {
      send(server, engine.snapshotFor(role, null, Date.now()))
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  private async joinOrReconnect(engine: GameEngine, playerId: string, nickname: string, avatar: Avatar) {
    return this.mutateWith(() => {
      const result = engine.join(playerId, nickname, avatar)
      return { changed: result.ok, result }
    })
  }

  // ---- WebSocket events ----------------------------------------------------

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const engine = this.engine
    const attachment = ws.deserializeAttachment() as Attachment | null
    if (!engine || !attachment) return
    let msg: ClientMessage
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as ClientMessage
    } catch {
      send(ws, { type: 'error', code: 'bad_message', message: errorText('bad_message') })
      return
    }
    if (msg.type === 'ping') {
      send(ws, { type: 'pong' })
      return
    }
    const now = Date.now()
    if (attachment.role === 'player') {
      if (msg.type === 'answer' && attachment.playerId) {
        await this.mutate(() => engine.answer(attachment.playerId!, msg.questionIndex, msg.answerIndex, now))
      } else {
        send(ws, { type: 'error', code: 'not_allowed', message: errorText('not_allowed') })
      }
      return
    }
    const known = await this.applyHostCommand(engine, msg, now)
    if (known === null) send(ws, { type: 'error', code: 'bad_message', message: errorText('bad_message') })
  }

  /** Returns null for an unknown command, otherwise whether it changed anything. */
  private async applyHostCommand(engine: GameEngine, msg: ClientMessage, now: number): Promise<boolean | null> {
    switch (msg.type) {
      case 'start':
        return this.mutate(() => msg.phase === engine.phase && engine.start(crypto.randomUUID(), now))
      case 'next':
        return this.mutate(() => engine.next(msg.phase, msg.questionIndex, now, { skipLeaderboard: msg.skipLeaderboard === true }))
      case 'reset':
        return this.mutate(() => {
          engine.reset()
          return true
        })
      default:
        return null
    }
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    await this.handleGone(ws)
    try {
      ws.close(code, reason)
    } catch {
      // already closed
    }
    void wasClean
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleGone(ws)
  }

  private async handleGone(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as Attachment | null
    const engine = this.engine
    if (!engine || !attachment || attachment.role !== 'player' || !attachment.playerId) return
    const playerId = attachment.playerId
    // Another socket for the same player (e.g. a reconnect that raced the close) keeps them connected.
    const stillOpen = this.ctx
      .getWebSockets('player')
      .some((other) => other !== ws && (other.deserializeAttachment() as Attachment | null)?.playerId === playerId)
    if (stillOpen) return
    await this.mutate(() => engine.setConnected(playerId, false))
  }

  // ---- alarm: question deadline -------------------------------------------

  override async alarm(): Promise<void> {
    const engine = this.engine
    if (!engine) return
    await this.mutate(() => engine.closeQuestion(Date.now()))
  }

  // ---- mutation pipeline ---------------------------------------------------

  /** Runs `fn`; if it reports a change, persists, syncs the alarm, saves scores and broadcasts. */
  private async mutate(fn: () => boolean): Promise<boolean> {
    return this.mutateWith(() => {
      const changed = fn()
      return { changed, result: changed }
    })
  }

  private async mutateWith<T>(fn: () => { changed: boolean; result: T }): Promise<T> {
    const engine = this.engine
    if (!engine) throw new Error('engine not loaded')
    const before = engine.phase
    const { changed, result } = fn()
    if (!changed) return result
    await this.ctx.storage.put(STATE_KEY, engine.toState())
    await this.syncAlarm(engine)
    if (engine.phase === 'podium' && before !== 'podium') await this.saveScoresOnce(engine)
    this.broadcast(engine)
    return result
  }

  private async syncAlarm(engine: GameEngine): Promise<void> {
    if (engine.phase === 'question' && engine.questionEndsAt !== null) {
      await this.ctx.storage.setAlarm(engine.questionEndsAt)
    } else {
      await this.ctx.storage.deleteAlarm()
    }
  }

  private async saveScoresOnce(engine: GameEngine): Promise<void> {
    const sessionId = engine.sessionId
    if (!sessionId) return
    if ((await this.ctx.storage.get<string>(SAVED_SESSION_KEY)) === sessionId) return
    try {
      const playedAt = new Date(engine.startedAt ?? Date.now()).toISOString()
      await saveScores(this.env.DB, engine.game.id, sessionId, playedAt, engine.leaderboard())
      await this.ctx.storage.put(SAVED_SESSION_KEY, sessionId)
    } catch (err) {
      // Losing the history row must never break the game in progress.
      console.error('saving scores failed', err)
    }
  }

  private broadcast(engine: GameEngine): void {
    const now = Date.now()
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null
      if (!attachment) continue
      send(ws, engine.snapshotFor(attachment.role, attachment.playerId, now))
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // Socket already gone; the close handler will take care of the player state.
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

export function errorText(code: ErrorCode): string {
  switch (code) {
    case 'nickname_taken':
      return 'Tuhle přezdívku už někdo používá. Zvol si jinou.'
    case 'invalid_nickname':
      return 'Přezdívka musí mít 1 až 20 znaků.'
    case 'not_allowed':
      return 'Tuhle akci nemůžeš provést.'
    case 'bad_message':
      return 'Neplatná zpráva.'
  }
}
