// Pure, deterministic game rules. No I/O, no timers: callers pass `now` (ms since epoch).
// The Durable Object wraps this class and persists `toState()` after every mutation.

import { normalizeAvatar, type Avatar } from '../shared/avatars'
import type {
  ErrorCode,
  Game,
  HostSnapshot,
  LeaderboardEntry,
  MyState,
  Phase,
  PlayerPublic,
  PlayerSnapshot,
  PublicQuestion,
  Question,
  Role,
  Snapshot,
} from '../shared/types'

export const MAX_NICKNAME_LENGTH = 20
export const MAX_POINTS = 1000

interface AnswerRecord {
  answerIndex: number
  correct: boolean
  gain: number
}

interface PlayerRecord {
  id: string
  nickname: string
  avatar: Avatar
  score: number
  connected: boolean
  /** Keyed by question index. */
  answers: Record<number, AnswerRecord>
}

export interface EngineState {
  phase: Phase
  /** -1 in lobby. */
  questionIndex: number
  questionStartedAt: number | null
  questionEndsAt: number | null
  sessionId: string | null
  startedAt: number | null
  players: PlayerRecord[]
}

export type JoinResult = { ok: true } | { ok: false; code: Extract<ErrorCode, 'nickname_taken' | 'invalid_nickname'> }

function emptyState(): EngineState {
  return {
    phase: 'lobby',
    questionIndex: -1,
    questionStartedAt: null,
    questionEndsAt: null,
    sessionId: null,
    startedAt: null,
    players: [],
  }
}

/** Kahoot-style: full points for an instant answer, half at the deadline, nothing when wrong. */
export function scoreFor(correct: boolean, elapsedMs: number, limitMs: number): number {
  if (!correct) return 0
  const ratio = Math.min(1, Math.max(0, elapsedMs / limitMs))
  return Math.round(MAX_POINTS * (1 - ratio / 2))
}

export class GameEngine {
  private s: EngineState

  constructor(
    readonly game: Game,
    state?: EngineState,
  ) {
    this.s = state ?? emptyState()
  }

  static fromState(game: Game, state: EngineState): GameEngine {
    // Older persisted rooms have players without an avatar.
    for (const p of state.players) p.avatar = normalizeAvatar(p.avatar)
    return new GameEngine(game, state)
  }

  toState(): EngineState {
    return JSON.parse(JSON.stringify(this.s)) as EngineState
  }

  get phase(): Phase {
    return this.s.phase
  }

  get questionIndex(): number {
    return this.s.questionIndex
  }

  get questionEndsAt(): number | null {
    return this.s.questionEndsAt
  }

  get sessionId(): string | null {
    return this.s.sessionId
  }

  get startedAt(): number | null {
    return this.s.startedAt
  }

  get currentQuestion(): Question | null {
    return this.game.questions[this.s.questionIndex] ?? null
  }

  get hasNextQuestion(): boolean {
    return this.s.questionIndex < this.game.questions.length - 1
  }

  // ---- players -------------------------------------------------------------

  join(playerId: string, rawNickname: string, avatar?: Avatar): JoinResult {
    const existing = this.find(playerId)
    if (existing) {
      // Reconnect: identity is the playerId, the nickname stays what it was.
      existing.connected = true
      return { ok: true }
    }
    const nickname = rawNickname.trim()
    if (nickname.length === 0 || nickname.length > MAX_NICKNAME_LENGTH) {
      return { ok: false, code: 'invalid_nickname' }
    }
    const lower = nickname.toLowerCase()
    if (this.s.players.some((p) => p.nickname.toLowerCase() === lower)) {
      return { ok: false, code: 'nickname_taken' }
    }
    this.s.players.push({ id: playerId, nickname, avatar: normalizeAvatar(avatar), score: 0, connected: true, answers: {} })
    return { ok: true }
  }

  /** Connection status only; a disconnected player keeps their seat and score. */
  setConnected(playerId: string, connected: boolean): boolean {
    const p = this.find(playerId)
    if (!p) return false
    p.connected = connected
    return true
  }

  // ---- host actions --------------------------------------------------------

  start(sessionId: string, now: number): boolean {
    if (this.s.phase !== 'lobby') return false
    this.s.sessionId = sessionId
    this.s.startedAt = now
    this.openQuestion(0, now)
    return true
  }

  /**
   * Advance one step. The expected phase/question guard makes replays and double-clicks harmless.
   * `skipLeaderboard` lets the host jump from `reveal` straight to the next question or the podium.
   */
  next(expectedPhase: Phase, expectedQuestionIndex: number, now: number, { skipLeaderboard = false } = {}): boolean {
    if (expectedPhase !== this.s.phase || expectedQuestionIndex !== this.s.questionIndex) return false
    switch (this.s.phase) {
      case 'question':
        return this.closeQuestion(now)
      case 'reveal':
        if (skipLeaderboard) {
          this.advanceFromLeaderboard(now)
        } else {
          this.s.phase = 'leaderboard'
        }
        return true
      case 'leaderboard':
        this.advanceFromLeaderboard(now)
        return true
      default:
        return false
    }
  }

  private advanceFromLeaderboard(now: number): void {
    if (this.hasNextQuestion) {
      this.openQuestion(this.s.questionIndex + 1, now)
    } else {
      this.s.phase = 'podium'
    }
  }

  /** question → reveal. Called by `next`, by the alarm at the deadline, or when everyone answered. */
  closeQuestion(_now: number): boolean {
    if (this.s.phase !== 'question') return false
    this.s.phase = 'reveal'
    return true
  }

  reset(): void {
    this.s = emptyState()
  }

  // ---- player actions ------------------------------------------------------

  answer(playerId: string, questionIndex: number, answerIndex: number, now: number): boolean {
    if (this.s.phase !== 'question' || questionIndex !== this.s.questionIndex) return false
    const q = this.currentQuestion
    const p = this.find(playerId)
    if (!q || !p || this.s.questionStartedAt === null) return false
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= q.answers.length) return false
    if (p.answers[questionIndex]) return false

    const correct = answerIndex === q.correctIndex
    const gain = scoreFor(correct, now - this.s.questionStartedAt, q.timeLimitSec * 1000)
    p.answers[questionIndex] = { answerIndex, correct, gain }
    p.score += gain

    const connected = this.s.players.filter((x) => x.connected)
    if (connected.length > 0 && connected.every((x) => x.answers[questionIndex])) {
      this.closeQuestion(now)
    }
    return true
  }

  // ---- read models ---------------------------------------------------------

  leaderboard(): LeaderboardEntry[] {
    const qi = this.s.questionIndex
    return [...this.s.players]
      .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'cs'))
      .map((p, i) => ({
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        rank: i + 1,
        lastGain: p.answers[qi]?.gain ?? 0,
      }))
  }

  snapshotFor(role: 'player', playerId: string | null, now: number): PlayerSnapshot
  snapshotFor(role: 'host', playerId: string | null, now: number): HostSnapshot
  snapshotFor(role: Role, playerId: string | null, now: number): Snapshot
  snapshotFor(role: Role, playerId: string | null, now: number): Snapshot {
    const { phase, questionIndex } = this.s
    const q = this.currentQuestion
    const revealed = phase === 'reveal' || phase === 'leaderboard' || phase === 'podium'

    const question: PublicQuestion | null = q
      ? {
          index: questionIndex,
          total: this.game.questions.length,
          text: q.text,
          answers: q.answers,
          timeLimitSec: q.timeLimitSec,
          ...(q.image ? { image: q.image } : {}),
        }
      : null

    const players: PlayerPublic[] = this.s.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      connected: p.connected,
    }))

    const base = {
      type: 'snapshot' as const,
      gameId: this.game.id,
      title: this.game.title,
      pin: this.game.pin,
      phase,
      serverNow: now,
      players,
      question,
      questionEndsAt: phase === 'question' ? this.s.questionEndsAt : null,
      answerCounts: revealed && q ? this.answerCounts(q) : null,
      correctIndex: revealed && q ? q.correctIndex : null,
      leaderboard: revealed ? this.leaderboard() : [],
      hasNextQuestion: this.hasNextQuestion,
    }

    if (role === 'host') {
      const host: HostSnapshot = {
        ...base,
        role: 'host',
        answeredCount: this.s.players.filter((p) => p.answers[questionIndex]).length,
      }
      return host
    }

    const player: PlayerSnapshot = { ...base, role: 'player', me: playerId ? this.myState(playerId, revealed) : null }
    return player
  }

  // ---- internals -----------------------------------------------------------

  private openQuestion(index: number, now: number): void {
    const q = this.game.questions[index]
    if (!q) return
    this.s.phase = 'question'
    this.s.questionIndex = index
    this.s.questionStartedAt = now
    this.s.questionEndsAt = now + q.timeLimitSec * 1000
  }

  private answerCounts(q: Question): number[] {
    const counts = q.answers.map(() => 0)
    for (const p of this.s.players) {
      const a = p.answers[this.s.questionIndex]
      if (a) counts[a.answerIndex] = (counts[a.answerIndex] ?? 0) + 1
    }
    return counts
  }

  private myState(playerId: string, revealed: boolean): MyState | null {
    const p = this.find(playerId)
    if (!p) return null
    const a = p.answers[this.s.questionIndex]
    const rank = this.leaderboard().find((e) => e.id === playerId)?.rank ?? 0
    return {
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score,
      rank,
      answerIndex: a?.answerIndex ?? null,
      correct: revealed ? (a?.correct ?? false) : null,
      lastGain: revealed ? (a?.gain ?? 0) : null,
    }
  }

  private find(playerId: string): PlayerRecord | undefined {
    return this.s.players.find((p) => p.id === playerId)
  }
}
