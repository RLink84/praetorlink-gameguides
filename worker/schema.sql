-- Pawn board (D1). Only what players choose to post. No accounts, no emails, no IP addresses stored.
CREATE TABLE IF NOT EXISTS pawns (
  id TEXT PRIMARY KEY,               -- random id
  game TEXT NOT NULL DEFAULT 'dd2',
  pawn_id TEXT NOT NULL,             -- in-game Pawn ID
  name TEXT NOT NULL,
  level INTEGER NOT NULL,
  vocation TEXT NOT NULL,
  platform TEXT NOT NULL,            -- pc | playstation | xbox
  specialization TEXT,
  notes TEXT,                        -- gifts/rewards, play style
  delete_hash TEXT NOT NULL,         -- SHA-256 of the owner's delete code
  reports INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pawns_search ON pawns (game, platform, vocation, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS pawns_unique ON pawns (game, platform, pawn_id);
