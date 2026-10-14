-- Only the Worker binding may write. No public database credentials exist.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,                        -- hex sha256 of the Google "sub"; never the sub, never email
  name TEXT NOT NULL DEFAULT '',              -- display name, cleaned, <= 60 chars
  picture TEXT NOT NULL DEFAULT '',           -- https://*.googleusercontent.com URL or ''
  created INTEGER NOT NULL,                   -- ms
  last_login INTEGER NOT NULL,                -- ms
  session_version INTEGER NOT NULL DEFAULT 1  -- bumped on logout/delete; tokens carry the version they were issued with
);
CREATE TABLE IF NOT EXISTS progress (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,  -- deleting the player deletes every record, even one written in the same instant
  game TEXT NOT NULL,                         -- record id, e.g. 'carrot:campaign'
  data TEXT NOT NULL DEFAULT '',              -- JSON text; '' = placeholder row (rate-limit bookkeeping only)
  updated INTEGER NOT NULL DEFAULT 0,         -- client's merged timestamp, ms, clamped to server now+60s
  version INTEGER NOT NULL DEFAULT 0,         -- increments on every stored write
  last_put INTEGER NOT NULL DEFAULT 0,        -- server ms of the last accepted PUT attempt (rate limit)
  PRIMARY KEY (player_id, game)
);
