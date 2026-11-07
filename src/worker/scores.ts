import type { LeaderboardEntry, ScoreRow } from '../shared/types'

export async function saveScores(
  db: D1Database,
  gameId: string,
  sessionId: string,
  playedAtIso: string,
  entries: LeaderboardEntry[],
): Promise<void> {
  if (entries.length === 0) return
  const stmt = db.prepare(
    'INSERT INTO scores (game_id, session_id, played_at, nickname, score, rank) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
  )
  await db.batch(entries.map((e) => stmt.bind(gameId, sessionId, playedAtIso, e.nickname, e.score, e.rank)))
}

export async function listScores(db: D1Database, gameId: string | null, limit = 500): Promise<ScoreRow[]> {
  const sql = gameId
    ? 'SELECT game_id, session_id, played_at, nickname, score, rank FROM scores WHERE game_id = ?1 ORDER BY played_at DESC, rank ASC LIMIT ?2'
    : 'SELECT game_id, session_id, played_at, nickname, score, rank FROM scores ORDER BY played_at DESC, rank ASC LIMIT ?1'
  const stmt = gameId ? db.prepare(sql).bind(gameId, limit) : db.prepare(sql).bind(limit)
  const { results } = await stmt.all<ScoreRow>()
  return results
}
