-- 025_sso_state.sql
-- Ephemeral PKCE state for SSO authorization flows (10-minute TTL).
-- Stored in PG (not in-memory) so state survives restarts.

CREATE TABLE IF NOT EXISTS auth.sso_state (
  state         TEXT PRIMARY KEY,
  provider_id   TEXT NOT NULL,
  redirect_uri  TEXT NOT NULL,
  code_verifier TEXT,
  workspace_id  TEXT,
  created_at    BIGINT NOT NULL,
  expires_at    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sso_state_expires ON auth.sso_state(expires_at);
