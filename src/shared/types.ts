// Types shared by the Worker (authority) and the Vue client.

export type Phase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'podium'

export type Role = 'player' | 'host'

export interface Question {
  text: string
  /** 2–4 answers, exactly one correct. */
  answers: string[]
  correctIndex: number
  timeLimitSec: number
}

export interface Game {
  id: string
  pin: string
  title: string
  questions: Question[]
}

/** Game metadata without questions, for the host's game picker. */
export interface GameSummary {
  id: string
  pin: string
  title: string
  questionCount: number
}

/** The current question as seen by clients (never carries correctIndex). */
export interface PublicQuestion {
  index: number
  total: number
  text: string
  answers: string[]
  timeLimitSec: number
}

export interface PlayerPublic {
  id: string
  nickname: string
  score: number
  connected: boolean
}

export interface LeaderboardEntry {
  id: string
  nickname: string
  score: number
  rank: number
  /** Points gained in the most recent question. */
  lastGain: number
}

export interface MyState {
  id: string
  nickname: string
  score: number
  rank: number
  /** Answer picked for the current question, null if none yet. */
  answerIndex: number | null
  /** Result of the current question, known once the phase passed `question`. */
  correct: boolean | null
  lastGain: number | null
}

interface SnapshotBase {
  type: 'snapshot'
  gameId: string
  title: string
  pin: string
  phase: Phase
  /** Server clock at the time of the snapshot, for client clock-offset correction. */
  serverNow: number
  players: PlayerPublic[]
  question: PublicQuestion | null
  questionEndsAt: number | null
  /** Per-answer counts, revealed after the question closes. */
  answerCounts: number[] | null
  /** Revealed after the question closes. */
  correctIndex: number | null
  /** Filled in leaderboard and podium phases. */
  leaderboard: LeaderboardEntry[]
  hasNextQuestion: boolean
}

export interface PlayerSnapshot extends SnapshotBase {
  role: 'player'
  me: MyState | null
}

export interface HostSnapshot extends SnapshotBase {
  role: 'host'
  answeredCount: number
}

export type Snapshot = PlayerSnapshot | HostSnapshot

export type ErrorCode = 'nickname_taken' | 'invalid_nickname' | 'not_allowed' | 'bad_message'

export interface ErrorMessage {
  type: 'error'
  code: ErrorCode
  message: string
}

export type ServerMessage = Snapshot | ErrorMessage | { type: 'pong' }

export type ClientMessage =
  | { type: 'answer'; questionIndex: number; answerIndex: number }
  /** Host: lobby → first question. `phase` is the phase the host believes it is in (idempotence). */
  | { type: 'start'; phase: Phase }
  /** Host: advance one step from the given phase/question (idempotence). */
  | { type: 'next'; phase: Phase; questionIndex: number }
  /** Host: back to an empty lobby. */
  | { type: 'reset' }
  | { type: 'ping' }

export interface ScoreRow {
  game_id: string
  session_id: string
  played_at: string
  nickname: string
  score: number
  rank: number
}
