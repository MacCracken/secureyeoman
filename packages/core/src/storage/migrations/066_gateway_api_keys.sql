-- Migration 066: Gateway API key extensions
-- Phase 80

ALTER TABLE auth.api_keys
  ADD COLUMN IF NOT EXISTS personality_id     TEXT,
  ADD COLUMN IF NOT EXISTS rate_limit_rpm     INTEGER,
  ADD COLUMN IF NOT EXISTS rate_limit_tpd     INTEGER,
  ADD COLUMN IF NOT EXISTS is_gateway_key     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS auth.api_key_usage (
  id              TEXT PRIMARY KEY,
  key_id          TEXT NOT NULL REFERENCES auth.api_keys(id) ON DELETE CASCADE,
  timestamp       BIGINT NOT NULL,
  tokens_used     INTEGER NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  personality_id  TEXT,
  status_code     INTEGER NOT NULL DEFAULT 200,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_ts ON auth.api_key_usage (key_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_ts     ON auth.api_key_usage (timestamp DESC);
