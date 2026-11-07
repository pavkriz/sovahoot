import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { fetchWorker, hostToken, resetRoom, WsClient } from './helpers'

beforeEach(() => resetRoom('0000'))

describe('HTTP API', () => {
  it('lists games without leaking correct answers', async () => {
    const res = await fetchWorker('/api/games')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('correctIndex')
    const games = JSON.parse(text) as Array<{ id: string; pin: string; title: string; questionCount: number }>
    expect(games.length).toBeGreaterThanOrEqual(2)
    expect(games.find((g) => g.pin === '0000')).toMatchObject({ id: 'test', questionCount: 2 })
  })

  it('logs the host in with the right password only', async () => {
    const bad = await fetchWorker('/api/host/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'nope' }),
    })
    expect(bad.status).toBe(401)
    const malformed = await fetchWorker('/api/host/login', { method: 'POST', body: 'not json' })
    expect(malformed.status).toBe(400)
    const token = await hostToken()
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/)
  })

  it('rejects websocket upgrades for unknown PINs, missing params and unauthenticated hosts', async () => {
    await WsClient.connectExpecting('/ws/9999?role=player&playerId=p1&nickname=A', 404)
    await WsClient.connectExpecting('/ws/0000?role=player&nickname=A', 400)
    await WsClient.connectExpecting('/ws/0000?role=host', 401)
    await WsClient.connectExpecting('/ws/0000?role=host&token=123.deadbeef', 401)
    const plain = await fetchWorker('/ws/0000?role=player&playerId=p1&nickname=A')
    expect(plain.status).toBe(426)
  })

  it('returns stored scores, newest session first', async () => {
    const empty = await fetchWorker('/api/scores?game=test')
    expect(empty.status).toBe(200)
    expect(await empty.json()).toEqual([])

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO scores (game_id, session_id, played_at, nickname, score, rank) VALUES ('test','s1','2026-01-01T10:00:00.000Z','Alice',1500,1)",
      ),
      env.DB.prepare(
        "INSERT INTO scores (game_id, session_id, played_at, nickname, score, rank) VALUES ('test','s2','2026-02-01T10:00:00.000Z','Bob',900,1)",
      ),
      env.DB.prepare(
        "INSERT INTO scores (game_id, session_id, played_at, nickname, score, rank) VALUES ('other','s3','2026-03-01T10:00:00.000Z','Zed',10,1)",
      ),
    ])
    const res = await fetchWorker('/api/scores?game=test')
    const rows = (await res.json()) as Array<{ session_id: string; nickname: string }>
    expect(rows.map((r) => r.nickname)).toEqual(['Bob', 'Alice'])

    const all = (await (await fetchWorker('/api/scores')).json()) as unknown[]
    expect(all).toHaveLength(3)
  })

  it('serves nothing else from the worker (SPA assets handle the rest)', async () => {
    const res = await fetchWorker('/api/nope')
    expect(res.status).toBe(404)
  })
})
