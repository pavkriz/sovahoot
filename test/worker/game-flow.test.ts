import { env, evictDurableObject, runDurableObjectAlarm } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_AVATAR, encodeAvatar } from '../../src/shared/avatars'
import type { HostSnapshot, PlayerSnapshot, ScoreRow } from '../../src/shared/types'
import { fetchWorker, hostPath, hostToken, playerPath, resetRoom, WsClient } from './helpers'

const PIN = '0000' // "Rychlý test": 2 questions, correct answers 0 and 1

function roomStub() {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(PIN))
}

beforeEach(() => resetRoom(PIN))

async function setup() {
  const token = await hostToken()
  const host = await WsClient.connect(hostPath(PIN, token))
  await host.until((s) => s.phase === 'lobby')
  const alice = await WsClient.connect(playerPath(PIN, 'p-alice', 'Alice'))
  const bob = await WsClient.connect(playerPath(PIN, 'p-bob', 'Bob'))
  await host.until((s) => s.players.length === 2)
  return { token, host, alice, bob }
}

describe('game flow over websockets', () => {
  it('plays a whole game: lobby → questions → podium, and stores scores in D1', async () => {
    const { host, alice, bob } = await setup()

    const lobby = (await alice.until((s) => s.players.length === 2)) as PlayerSnapshot
    expect(lobby.me).toMatchObject({ nickname: 'Alice', score: 0 })
    expect(lobby.phase).toBe('lobby')

    host.send({ type: 'start', phase: 'lobby' })
    const q1 = await alice.until((s) => s.phase === 'question')
    expect(q1.question).toMatchObject({ index: 0, total: 2 })
    expect(q1.correctIndex).toBeNull()
    expect(q1.questionEndsAt).toBeGreaterThan(q1.serverNow)
    expect(JSON.stringify(q1)).not.toContain('"correctIndex":0')

    alice.send({ type: 'answer', questionIndex: 0, answerIndex: 0 })
    const h1 = (await host.until((s) => s.role === 'host' && s.answeredCount === 1)) as HostSnapshot
    expect(h1.phase).toBe('question')

    // Bob never answers; the server-side alarm closes the question.
    expect(await runDurableObjectAlarm(roomStub())).toBe(true)
    const reveal = (await bob.until((s) => s.phase === 'reveal')) as PlayerSnapshot
    expect(reveal.correctIndex).toBe(0)
    expect(reveal.answerCounts).toEqual([1, 0])
    expect(reveal.me).toMatchObject({ correct: false, lastGain: 0, answerIndex: null })
    const aliceReveal = (await alice.until((s) => s.phase === 'reveal')) as PlayerSnapshot
    expect(aliceReveal.me?.correct).toBe(true)
    expect(aliceReveal.me?.lastGain).toBeGreaterThan(0)

    host.send({ type: 'next', phase: 'reveal', questionIndex: 0 })
    const lb = await host.until((s) => s.phase === 'leaderboard')
    expect(lb.leaderboard.map((e) => e.nickname)).toEqual(['Alice', 'Bob'])

    host.send({ type: 'next', phase: 'leaderboard', questionIndex: 0 })
    await bob.until((s) => s.phase === 'question' && s.question?.index === 1)

    // Everyone answers → the question closes without waiting for the alarm.
    alice.send({ type: 'answer', questionIndex: 1, answerIndex: 1 })
    bob.send({ type: 'answer', questionIndex: 1, answerIndex: 1 })
    await host.until((s) => s.phase === 'reveal' && s.question?.index === 1)

    host.send({ type: 'next', phase: 'reveal', questionIndex: 1 })
    await host.until((s) => s.phase === 'leaderboard' && s.question?.index === 1)
    host.send({ type: 'next', phase: 'leaderboard', questionIndex: 1 })
    const podium = await alice.until((s) => s.phase === 'podium')
    expect(podium.leaderboard[0]?.nickname).toBe('Alice')
    expect(podium.hasNextQuestion).toBe(false)

    const rows = (await env.DB.prepare('SELECT * FROM scores ORDER BY rank').all<ScoreRow>()).results
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ game_id: 'test', nickname: 'Alice', rank: 1 })
    expect(rows[1]).toMatchObject({ game_id: 'test', nickname: 'Bob', rank: 2 })
    expect(rows[0]?.session_id).toBe(rows[1]?.session_id)
    expect(rows[0]!.score).toBeGreaterThan(rows[1]!.score)

    const api = (await (await fetchWorker('/api/scores?game=test')).json()) as ScoreRow[]
    expect(api).toHaveLength(2)

    // Reset returns to an empty lobby for the next session.
    host.send({ type: 'reset' })
    const fresh = await host.until((s) => s.phase === 'lobby' && s.players.length === 0)
    expect(fresh.leaderboard).toEqual([])
    ;[host, alice, bob].forEach((c) => c.close())
  })

  it('keeps a disconnected player and restores them on reconnect with the same playerId', async () => {
    const { host, alice, bob } = await setup()
    host.send({ type: 'start', phase: 'lobby' })
    await alice.until((s) => s.phase === 'question')
    alice.send({ type: 'answer', questionIndex: 0, answerIndex: 0 })
    await host.until((s) => s.role === 'host' && s.answeredCount === 1)

    alice.close()
    const seen = await host.until((s) => s.players.some((p) => p.id === 'p-alice' && !p.connected))
    expect(seen.players).toHaveLength(2)

    // Reconnect mid-question with a different nickname: identity wins, nickname is kept.
    const alice2 = await WsClient.connect(playerPath(PIN, 'p-alice', 'Impostor'))
    const back = (await alice2.until((s) => s.phase === 'question')) as PlayerSnapshot
    expect(back.me).toMatchObject({ nickname: 'Alice', answerIndex: 0 })
    expect(back.questionEndsAt).toBeGreaterThan(back.serverNow)
    await host.until((s) => s.players.every((p) => p.connected))

    // The earlier answer still counts.
    await runDurableObjectAlarm(roomStub())
    const reveal = (await alice2.until((s) => s.phase === 'reveal')) as PlayerSnapshot
    expect(reveal.me?.score).toBeGreaterThan(0)
    ;[host, alice2, bob].forEach((c) => c.close())
  })

  it('carries the chosen avatar to everyone and sanitises invalid ones', async () => {
    const token = await hostToken()
    const host = await WsClient.connect(hostPath(PIN, token))
    await host.until((s) => s.phase === 'lobby')
    const fox = { character: '🦊', hat: '👑', glasses: null, color: '#118ab2' }
    const alice = await WsClient.connect(playerPath(PIN, 'p-alice', 'Alice', encodeAvatar(fox)))
    const bob = await WsClient.connect(playerPath(PIN, 'p-bob', 'Bob', '{"character":"💣","hat":"👑"}'))
    const lobby = await host.until((s) => s.players.length === 2)
    expect(lobby.players.find((p) => p.id === 'p-alice')?.avatar).toEqual(fox)
    expect(lobby.players.find((p) => p.id === 'p-bob')?.avatar).toEqual({ ...DEFAULT_AVATAR, hat: '👑' })
    const mine = (await alice.until((s) => s.players.length === 2)) as PlayerSnapshot
    expect(mine.me?.avatar).toEqual(fox)
    ;[host, alice, bob].forEach((c) => c.close())
  })

  it('lets the host skip the leaderboard and go straight to the next question or the podium', async () => {
    const { host, alice, bob } = await setup()
    host.send({ type: 'start', phase: 'lobby' })
    await alice.until((s) => s.phase === 'question')
    alice.send({ type: 'answer', questionIndex: 0, answerIndex: 0 })
    bob.send({ type: 'answer', questionIndex: 0, answerIndex: 1 })
    await host.until((s) => s.phase === 'reveal')

    host.send({ type: 'next', phase: 'reveal', questionIndex: 0, skipLeaderboard: true })
    const q2 = await bob.until((s) => s.phase === 'question' && s.question?.index === 1)
    expect(q2.questionEndsAt).toBeGreaterThan(q2.serverNow)

    alice.send({ type: 'answer', questionIndex: 1, answerIndex: 1 })
    bob.send({ type: 'answer', questionIndex: 1, answerIndex: 1 })
    await host.until((s) => s.phase === 'reveal' && s.question?.index === 1)
    host.send({ type: 'next', phase: 'reveal', questionIndex: 1, skipLeaderboard: true })
    const podium = await host.until((s) => s.phase === 'podium')
    expect(podium.leaderboard[0]?.avatar).toBeDefined()
    const rows = (await env.DB.prepare('SELECT nickname FROM scores ORDER BY rank').all<{ nickname: string }>()).results
    expect(rows.map((r) => r.nickname)).toEqual(['Alice', 'Bob'])
    ;[host, alice, bob].forEach((c) => c.close())
  })

  it('rejects a second player with the same nickname', async () => {
    const { host, alice, bob } = await setup()
    const dup = await WsClient.connect(playerPath(PIN, 'p-other', 'alice'))
    const err = await dup.untilError()
    expect(err.code).toBe('nickname_taken')
    await host.until((s) => s.players.length === 2)
    ;[host, alice, bob, dup].forEach((c) => c.close())
  })

  it('treats duplicated host commands as no-ops', async () => {
    const { host, alice, bob } = await setup()
    host.send({ type: 'start', phase: 'lobby' })
    host.send({ type: 'start', phase: 'lobby' })
    await host.until((s) => s.phase === 'question')
    await runDurableObjectAlarm(roomStub())
    await host.until((s) => s.phase === 'reveal')

    host.send({ type: 'next', phase: 'reveal', questionIndex: 0 })
    host.send({ type: 'next', phase: 'reveal', questionIndex: 0 })
    await host.until((s) => s.phase === 'leaderboard')
    // Give a wrongly-accepted second `next` time to show up, then assert it did not.
    await new Promise((r) => setTimeout(r, 200))
    expect(host.latest?.phase).toBe('leaderboard')
    expect(host.latest?.question?.index).toBe(0)
    ;[host, alice, bob].forEach((c) => c.close())
  })

  it('survives a Durable Object restart: state is reloaded from storage', async () => {
    const { host, alice, bob } = await setup()
    host.send({ type: 'start', phase: 'lobby' })
    await alice.until((s) => s.phase === 'question')
    alice.send({ type: 'answer', questionIndex: 0, answerIndex: 0 })
    await host.until((s) => s.role === 'host' && s.answeredCount === 1)

    // A fresh HTTP request after the in-memory instance is gone must see the same state.
    await evictDurableObject(roomStub(), { webSockets: 'close' })
    const res = await fetchWorker(`/api/room/${PIN}/snapshot?role=player&playerId=p-alice`)
    expect(res.status).toBe(200)
    const snap = (await res.json()) as PlayerSnapshot
    expect(snap.phase).toBe('question')
    expect(snap.players).toHaveLength(2)
    expect(snap.me).toMatchObject({ nickname: 'Alice', answerIndex: 0 })
    ;[host, alice, bob].forEach((c) => c.close())
  })
})

describe('polling fallback over plain HTTP', () => {
  it('lets a player join, read snapshots and answer without websockets', async () => {
    const token = await hostToken()
    const host = await WsClient.connect(hostPath(PIN, token))
    await host.until((s) => s.phase === 'lobby')

    const join = await fetchWorker(`/api/room/${PIN}/snapshot?role=player&playerId=p-poll&nickname=Polly`)
    expect(join.status).toBe(200)
    const s0 = (await join.json()) as PlayerSnapshot
    expect(s0.phase).toBe('lobby')
    expect(s0.me?.nickname).toBe('Polly')
    await host.until((s) => s.players.some((p) => p.nickname === 'Polly'))

    host.send({ type: 'start', phase: 'lobby' })
    await host.until((s) => s.phase === 'question')

    const s1 = (await (await fetchWorker(`/api/room/${PIN}/snapshot?role=player&playerId=p-poll`)).json()) as PlayerSnapshot
    expect(s1.phase).toBe('question')
    expect(s1.correctIndex).toBeNull()

    const ans = await fetchWorker(`/api/room/${PIN}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: 'p-poll', questionIndex: 0, answerIndex: 0 }),
    })
    expect(ans.status).toBe(200)
    // Polly is the only connected player, so the question closes right away.
    const reveal = (await (await fetchWorker(`/api/room/${PIN}/snapshot?role=player&playerId=p-poll`)).json()) as PlayerSnapshot
    expect(reveal.phase).toBe('reveal')
    expect(reveal.me).toMatchObject({ correct: true })
    expect(reveal.me!.lastGain).toBeGreaterThan(0)

    const hostSnap = await fetchWorker(`/api/room/${PIN}/snapshot?role=host&token=${encodeURIComponent(token)}`)
    expect(hostSnap.status).toBe(200)
    expect(((await hostSnap.json()) as HostSnapshot).answeredCount).toBe(1)
    const forbidden = await fetchWorker(`/api/room/${PIN}/snapshot?role=host`)
    expect(forbidden.status).toBe(401)

    // Host commands work over HTTP too.
    const cmd = await fetchWorker(`/api/room/${PIN}/command?role=host&token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'next', phase: 'reveal', questionIndex: 0 }),
    })
    expect(cmd.status).toBe(200)
    await host.until((s) => s.phase === 'leaderboard')
    const noAuth = await fetchWorker(`/api/room/${PIN}/command?role=host`, { method: 'POST', body: '{}' })
    expect(noAuth.status).toBe(401)
    const notHost = await fetchWorker(`/api/room/${PIN}/command?role=player&playerId=p-poll`, { method: 'POST', body: '{}' })
    expect(notHost.status).toBe(403)
    host.close()
  })
})
