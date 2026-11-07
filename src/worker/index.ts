import { Hono } from 'hono'
import { findGameByPin, gameSummaries } from '../shared/games'
import { checkPassword, issueHostToken, verifyHostToken } from './auth'
import { listScores } from './scores'

export { GameRoom } from './game-room'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/games', (c) => c.json(gameSummaries()))

app.post('/api/host/login', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { password?: unknown } | null
  if (!body || typeof body.password !== 'string') return c.json({ error: 'Chybí heslo.' }, 400)
  if (!checkPassword(c.env.HOST_PASSWORD ?? '', body.password)) return c.json({ error: 'Špatné heslo.' }, 401)
  return c.json({ token: await issueHostToken(c.env.HOST_PASSWORD, Date.now()) })
})

app.get('/api/scores', async (c) => {
  const game = c.req.query('game') ?? null
  return c.json(await listScores(c.env.DB, game))
})

/** Validates pin/role/auth and returns the stub plus the query to forward, or an error response. */
async function roomFor(
  c: { req: { param: (k: string) => string | undefined; query: (k: string) => string | undefined }; env: Env },
  { needPlayerId = true } = {},
) {
  const pin = c.req.param('pin') ?? ''
  if (!findGameByPin(pin)) return { error: Response.json({ error: 'Hra s tímto PINem neexistuje.' }, { status: 404 }) }
  const role = c.req.query('role') === 'host' ? 'host' : 'player'
  const params = new URLSearchParams({ pin, role })
  if (role === 'host') {
    if (!(await verifyHostToken(c.env.HOST_PASSWORD ?? '', c.req.query('token'), Date.now()))) {
      return { error: Response.json({ error: 'Nepřihlášený moderátor.' }, { status: 401 }) }
    }
  } else {
    const playerId = c.req.query('playerId')
    if (!playerId && needPlayerId) return { error: Response.json({ error: 'Chybí playerId.' }, { status: 400 }) }
    if (playerId) params.set('playerId', playerId)
    params.set('nickname', c.req.query('nickname') ?? '')
    const avatar = c.req.query('avatar')
    if (avatar) params.set('avatar', avatar)
  }
  const stub = c.env.GAME_ROOM.get(c.env.GAME_ROOM.idFromName(pin))
  return { stub, params }
}

app.get('/ws/:pin', async (c) => {
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    return c.json({ error: 'Očekáván WebSocket upgrade.' }, 426)
  }
  const room = await roomFor(c)
  if ('error' in room) return room.error
  return room.stub.fetch(new Request(`http://room/ws?${room.params}`, c.req.raw))
})

app.get('/api/room/:pin/snapshot', async (c) => {
  const room = await roomFor(c)
  if ('error' in room) return room.error
  return room.stub.fetch(`http://room/snapshot?${room.params}`)
})

app.post('/api/room/:pin/answer', async (c) => {
  // The player id travels in the JSON body here; the room validates it.
  const room = await roomFor(c, { needPlayerId: false })
  if ('error' in room) return room.error
  return room.stub.fetch(new Request(`http://room/answer?${room.params}`, c.req.raw))
})

app.post('/api/room/:pin/command', async (c) => {
  if (c.req.query('role') !== 'host') return c.json({ error: 'Jen pro moderátora.' }, 403)
  const room = await roomFor(c)
  if ('error' in room) return room.error
  return room.stub.fetch(new Request(`http://room/command?${room.params}`, c.req.raw))
})

app.notFound((c) => c.json({ error: 'Nenalezeno.' }, 404))

export default app
