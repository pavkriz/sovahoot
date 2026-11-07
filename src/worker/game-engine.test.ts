import { describe, expect, it } from 'vitest'
import { GameEngine, type EngineState } from './game-engine'
import { DEFAULT_AVATAR } from '../shared/avatars'
import type { Game } from '../shared/types'

const game: Game = {
  id: 'g',
  pin: '1111',
  title: 'Test',
  questions: [
    { text: 'Q1', answers: ['a', 'b', 'c', 'd'], correctIndex: 1, timeLimitSec: 20 },
    { text: 'Q2', answers: ['x', 'y'], correctIndex: 0, timeLimitSec: 10 },
  ],
}

const T0 = 1_000_000

function lobbyWithTwo() {
  const e = new GameEngine(game)
  e.join('p1', 'Alice')
  e.join('p2', 'Bob')
  return e
}

function started() {
  const e = lobbyWithTwo()
  e.start('session-1', T0)
  return e
}

describe('lobby & joining', () => {
  it('starts in lobby with no players', () => {
    const e = new GameEngine(game)
    expect(e.phase).toBe('lobby')
    expect(e.snapshotFor('host', null, T0).players).toEqual([])
  })

  it('adds a connected player', () => {
    const e = new GameEngine(game)
    expect(e.join('p1', '  Alice ')).toEqual({ ok: true })
    expect(e.snapshotFor('host', null, T0).players).toEqual([
      { id: 'p1', nickname: 'Alice', avatar: DEFAULT_AVATAR, score: 0, connected: true },
    ])
  })

  it('rejects a nickname already used by another player (case-insensitive)', () => {
    const e = new GameEngine(game)
    e.join('p1', 'Alice')
    expect(e.join('p2', 'alice')).toEqual({ ok: false, code: 'nickname_taken' })
    expect(e.snapshotFor('host', null, T0).players).toHaveLength(1)
  })

  it('rejects empty or too long nicknames', () => {
    const e = new GameEngine(game)
    expect(e.join('p1', '   ')).toEqual({ ok: false, code: 'invalid_nickname' })
    expect(e.join('p1', 'x'.repeat(21))).toEqual({ ok: false, code: 'invalid_nickname' })
  })

  it('rejoin with the same playerId keeps the original record and marks connected', () => {
    const e = started()
    e.setConnected('p1', false)
    expect(e.snapshotFor('host', null, T0).players[0]?.connected).toBe(false)
    expect(e.join('p1', 'SomethingElse')).toEqual({ ok: true })
    const p = e.snapshotFor('host', null, T0).players[0]
    expect(p).toMatchObject({ id: 'p1', nickname: 'Alice', connected: true })
  })

  it('late joiners are accepted mid-game', () => {
    const e = started()
    expect(e.join('p3', 'Carol')).toEqual({ ok: true })
    expect(e.snapshotFor('host', null, T0).players).toHaveLength(3)
  })

  it('stores a normalised avatar and exposes it in every read model', () => {
    const e = new GameEngine(game)
    e.join('p1', 'Alice', { character: '🦊', hat: '👑', glasses: null, color: '#118ab2' })
    e.join('p2', 'Bob', { character: '💣', hat: 'x', glasses: '👓', color: 'red' } as never)
    const host = e.snapshotFor('host', null, T0)
    expect(host.players[0]?.avatar).toEqual({ character: '🦊', hat: '👑', glasses: null, color: '#118ab2' })
    expect(host.players[1]?.avatar).toEqual({ ...DEFAULT_AVATAR, glasses: '👓' })
    expect(e.snapshotFor('player', 'p1', T0).me?.avatar.character).toBe('🦊')
    e.start('s', T0)
    e.closeQuestion(T0)
    expect(e.leaderboard()[0]?.avatar).toBeDefined()
  })

  it('hydrates older persisted players without an avatar', () => {
    const e = new GameEngine(game)
    e.join('p1', 'Alice')
    const state = JSON.parse(JSON.stringify(e.toState())) as { players: Array<Record<string, unknown>> }
    delete state.players[0]!.avatar
    const copy = GameEngine.fromState(game, state as unknown as EngineState)
    expect(copy.snapshotFor('host', null, T0).players[0]?.avatar).toEqual(DEFAULT_AVATAR)
  })

  it('disconnect does not remove the player', () => {
    const e = lobbyWithTwo()
    e.setConnected('p2', false)
    expect(e.snapshotFor('host', null, T0).players).toHaveLength(2)
  })
})

describe('start', () => {
  it('moves to the first question with a server-side deadline', () => {
    const e = lobbyWithTwo()
    expect(e.start('s1', T0)).toBe(true)
    expect(e.phase).toBe('question')
    expect(e.questionEndsAt).toBe(T0 + 20_000)
    const snap = e.snapshotFor('player', 'p1', T0)
    expect(snap.question).toEqual({ index: 0, total: 2, text: 'Q1', answers: ['a', 'b', 'c', 'd'], timeLimitSec: 20 })
  })

  it('is a no-op outside lobby', () => {
    const e = started()
    expect(e.start('s2', T0)).toBe(false)
    expect(e.sessionId).toBe('session-1')
  })
})

describe('answering & scoring', () => {
  it('awards 1000 for an instant correct answer, ~500 at the deadline, 0 when wrong', () => {
    const e = started()
    e.join('p3', 'Carol')
    expect(e.answer('p1', 0, 1, T0)).toBe(true)
    expect(e.answer('p2', 0, 1, T0 + 20_000)).toBe(true)
    expect(e.answer('p3', 0, 0, T0 + 1000)).toBe(true)
    e.closeQuestion(T0 + 20_000)
    const lb = e.snapshotFor('host', null, T0).leaderboard
    expect(lb.find((x) => x.id === 'p1')?.score).toBe(1000)
    expect(lb.find((x) => x.id === 'p2')?.score).toBe(500)
    expect(lb.find((x) => x.id === 'p3')?.score).toBe(0)
  })

  it('a faster correct answer scores more than a slower one', () => {
    const e = started()
    e.answer('p1', 0, 1, T0 + 2000)
    e.answer('p2', 0, 1, T0 + 8000)
    e.closeQuestion(T0 + 20_000)
    const lb = e.snapshotFor('host', null, T0).leaderboard
    const a = lb.find((x) => x.id === 'p1')!.score
    const b = lb.find((x) => x.id === 'p2')!.score
    expect(a).toBeGreaterThan(b)
    expect(a).toBe(950)
    expect(b).toBe(800)
  })

  it('accepts only one answer per player per question', () => {
    const e = started()
    expect(e.answer('p1', 0, 1, T0)).toBe(true)
    expect(e.answer('p1', 0, 0, T0 + 100)).toBe(false)
    expect(e.snapshotFor('player', 'p1', T0).me?.answerIndex).toBe(1)
  })

  it('ignores answers for a different question index or unknown player/answer', () => {
    const e = started()
    expect(e.answer('p1', 1, 1, T0)).toBe(false)
    expect(e.answer('ghost', 0, 1, T0)).toBe(false)
    expect(e.answer('p1', 0, 7, T0)).toBe(false)
    expect(e.answer('p1', 0, -1, T0)).toBe(false)
  })

  it('ignores answers outside the question phase', () => {
    const e = lobbyWithTwo()
    expect(e.answer('p1', 0, 1, T0)).toBe(false)
    e.start('s', T0)
    e.closeQuestion(T0 + 20_000)
    expect(e.answer('p1', 0, 1, T0 + 20_001)).toBe(false)
  })

  it('clamps answers that arrive slightly after the deadline to the minimum score', () => {
    const e = started()
    expect(e.answer('p1', 0, 1, T0 + 25_000)).toBe(true)
    e.closeQuestion(T0 + 25_000)
    expect(e.snapshotFor('host', null, T0).leaderboard[0]?.score).toBe(500)
  })

  it('closes the question automatically once everyone connected has answered', () => {
    const e = started()
    e.answer('p1', 0, 1, T0 + 1000)
    expect(e.phase).toBe('question')
    e.answer('p2', 0, 0, T0 + 2000)
    expect(e.phase).toBe('reveal')
  })

  it('does not wait for disconnected players when auto-closing', () => {
    const e = started()
    e.join('p3', 'Carol')
    e.setConnected('p3', false)
    e.answer('p1', 0, 1, T0 + 1000)
    e.answer('p2', 0, 1, T0 + 1000)
    expect(e.phase).toBe('reveal')
  })
})

describe('phase transitions', () => {
  it('closeQuestion moves question → reveal and is otherwise a no-op', () => {
    const e = started()
    expect(e.closeQuestion(T0 + 20_000)).toBe(true)
    expect(e.phase).toBe('reveal')
    expect(e.closeQuestion(T0 + 20_000)).toBe(false)
  })

  it('next walks question → reveal → leaderboard → question → … → podium', () => {
    const e = started()
    expect(e.next('question', 0, T0 + 1000)).toBe(true)
    expect(e.phase).toBe('reveal')
    expect(e.next('reveal', 0, T0)).toBe(true)
    expect(e.phase).toBe('leaderboard')
    expect(e.next('leaderboard', 0, T0 + 30_000)).toBe(true)
    expect(e.phase).toBe('question')
    expect(e.questionIndex).toBe(1)
    expect(e.questionEndsAt).toBe(T0 + 30_000 + 10_000)
    e.next('question', 1, T0)
    e.next('reveal', 1, T0)
    expect(e.next('leaderboard', 1, T0)).toBe(true)
    expect(e.phase).toBe('podium')
    expect(e.next('podium', 1, T0)).toBe(false)
  })

  it('next is idempotent: a stale expected phase or question index is a no-op', () => {
    const e = started()
    e.next('question', 0, T0)
    expect(e.phase).toBe('reveal')
    // Replayed/double-clicked message from the question phase.
    expect(e.next('question', 0, T0)).toBe(false)
    expect(e.phase).toBe('reveal')
    expect(e.next('reveal', 1, T0)).toBe(false)
    expect(e.phase).toBe('reveal')
  })

  it('next with skipLeaderboard jumps from reveal straight to the next question', () => {
    const e = started()
    e.next('question', 0, T0)
    expect(e.next('reveal', 0, T0 + 5000, { skipLeaderboard: true })).toBe(true)
    expect(e.phase).toBe('question')
    expect(e.questionIndex).toBe(1)
    expect(e.questionEndsAt).toBe(T0 + 5000 + 10_000)
  })

  it('next with skipLeaderboard on the last question goes to the podium', () => {
    const e = started()
    e.next('question', 0, T0)
    e.next('reveal', 0, T0, { skipLeaderboard: true })
    e.next('question', 1, T0)
    expect(e.next('reveal', 1, T0, { skipLeaderboard: true })).toBe(true)
    expect(e.phase).toBe('podium')
  })

  it('skipLeaderboard changes nothing outside reveal and respects the idempotence guard', () => {
    const e = started()
    expect(e.next('reveal', 0, T0, { skipLeaderboard: true })).toBe(false)
    expect(e.phase).toBe('question')
    e.next('question', 0, T0)
    expect(e.next('reveal', 1, T0, { skipLeaderboard: true })).toBe(false)
    expect(e.phase).toBe('reveal')
    e.next('reveal', 0, T0)
    expect(e.phase).toBe('leaderboard')
    expect(e.next('leaderboard', 0, T0, { skipLeaderboard: true })).toBe(true)
    expect(e.phase).toBe('question')
  })

  it('reset clears players and returns to lobby', () => {
    const e = started()
    e.answer('p1', 0, 1, T0)
    e.reset()
    expect(e.phase).toBe('lobby')
    expect(e.sessionId).toBeNull()
    expect(e.snapshotFor('host', null, T0).players).toEqual([])
  })
})

describe('snapshots', () => {
  it('hides the correct answer and counts from everyone during the question', () => {
    const e = started()
    e.answer('p1', 0, 1, T0)
    const player = e.snapshotFor('player', 'p2', T0)
    expect(player.correctIndex).toBeNull()
    expect(player.answerCounts).toBeNull()
    expect(player.leaderboard).toEqual([])
    expect(JSON.stringify(player)).not.toContain('correctIndex":1')
    const host = e.snapshotFor('host', null, T0)
    expect(host.correctIndex).toBeNull()
    expect(host.role === 'host' && host.answeredCount).toBe(1)
  })

  it('reveals the correct answer and counts after the question closes', () => {
    const e = started()
    e.answer('p1', 0, 1, T0)
    e.answer('p2', 0, 3, T0)
    const host = e.snapshotFor('host', null, T0)
    expect(host.phase).toBe('reveal')
    expect(host.correctIndex).toBe(1)
    expect(host.answerCounts).toEqual([0, 1, 0, 1])
    const me = e.snapshotFor('player', 'p2', T0).me
    expect(me).toMatchObject({ answerIndex: 3, correct: false, lastGain: 0, rank: 2 })
  })

  it('exposes the leaderboard in leaderboard and podium phases, sorted by score', () => {
    const e = started()
    e.answer('p2', 0, 1, T0 + 1000)
    e.answer('p1', 0, 1, T0 + 5000)
    e.next('reveal', 0, T0)
    const lb = e.snapshotFor('player', 'p1', T0).leaderboard
    expect(lb.map((x) => x.id)).toEqual(['p2', 'p1'])
    expect(lb[0]).toMatchObject({ rank: 1, lastGain: 975 })
    expect(e.snapshotFor('host', null, T0).hasNextQuestion).toBe(true)
  })

  it('reports server time and the deadline for clock sync', () => {
    const e = started()
    const s = e.snapshotFor('player', 'p1', T0 + 1234)
    expect(s.serverNow).toBe(T0 + 1234)
    expect(s.questionEndsAt).toBe(T0 + 20_000)
  })

  it('returns me = null for an unknown player', () => {
    const e = started()
    expect(e.snapshotFor('player', 'nobody', T0).me).toBeNull()
  })
})

describe('persistence', () => {
  it('round-trips through toState/fromState', () => {
    const e = started()
    e.answer('p1', 0, 1, T0 + 3000)
    const copy = GameEngine.fromState(game, JSON.parse(JSON.stringify(e.toState())))
    expect(copy.snapshotFor('host', null, T0)).toEqual(e.snapshotFor('host', null, T0))
    expect(copy.snapshotFor('player', 'p1', T0)).toEqual(e.snapshotFor('player', 'p1', T0))
  })
})
