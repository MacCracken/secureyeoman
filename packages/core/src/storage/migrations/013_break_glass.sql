-- 013_break_glass.sql
-- Break-glass emergency access (enterprise).
-- Provides a last-resort recovery path when normal auth is unavailable.

CREATE SCHEMA IF NOT EXISTS break_glass;

CREATE TABLE IF NOT EXISTS break_glass.recovery_keys (
  id          TEXT PRIMARY KEY,
  key_hash    TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  rotated_at  BIGINT
);

CREATE TABLE IF NOT EXISTS break_glass.sessions (
  id                TEXT PRIMARY KEY,
  recovery_key_id   TEXT NOT NULL REFERENCES break_glass.recovery_keys(id),
  created_at        BIGINT NOT NULL,
  expires_at        BIGINT NOT NULL,
  ip_address        TEXT,
  revoked_at        BIGINT
);

CREATE INDEX IF NOT EXISTS idx_break_glass_sessions_key ON break_glass.sessions (recovery_key_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_sessions_expires ON break_glass.sessions (expires_at);
