-- Payloads encrypt IP/network-location/context and verified wrong shared album
-- phrases. Successful, blocked, administrator, and reset inputs are never stored.
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  album TEXT NOT NULL,
  kind TEXT NOT NULL,
  identity TEXT NOT NULL,
  dedup_key TEXT UNIQUE,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_time ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_album_time ON audit_events(album, occurred_at DESC);

-- Album auth shares one identity across all protected albums. Admin and reset
-- use independent identities. A compare-and-set lease serializes verifications.
CREATE TABLE IF NOT EXISTS auth_state (
  identity TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  last_failure INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
