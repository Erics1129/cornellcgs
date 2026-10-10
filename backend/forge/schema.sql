-- Only the Worker binding may write. No public database credentials exist.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, proof_hash TEXT NOT NULL,
  last_start INTEGER NOT NULL DEFAULT 0, last_submit INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
  seed INTEGER NOT NULL, version INTEGER NOT NULL, started INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS runs_expiry ON runs(started);
CREATE TABLE IF NOT EXISTS scores (
  player_id TEXT PRIMARY KEY REFERENCES players(id), name TEXT NOT NULL,
  value INTEGER NOT NULL CHECK(value >= 0), level INTEGER NOT NULL,
  knife TEXT, updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_ranking ON scores(value DESC, updated ASC, player_id ASC);
