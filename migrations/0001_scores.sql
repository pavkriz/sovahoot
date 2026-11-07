-- One row per player per finished game session.
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  played_at TEXT NOT NULL,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_game_played ON scores (game_id, played_at DESC);
