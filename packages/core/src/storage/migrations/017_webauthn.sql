-- 017_webauthn.sql — WebAuthn/FIDO2 Credentials
-- Tier: community

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  device_type TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[],
  display_name TEXT,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT
);

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  challenge TEXT NOT NULL UNIQUE,
  user_id TEXT,
  type TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webauthn_creds_user ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_creds_credid ON webauthn_credentials(credential_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_exp ON webauthn_challenges(expires_at);
