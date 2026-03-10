-- 009_security_hardening.sql
-- Security hardening: encrypted OAuth tokens, persistent OAuth state,
-- 2FA DB persistence, hashed recovery codes.

-- ── 1. Encrypted OAuth tokens ──────────────────────────────────────────────
-- Add columns for encrypted token storage alongside the plaintext columns.
-- The migration runner will encrypt existing tokens in a subsequent step;
-- the plaintext columns are retained until verified, then NULLed by the app.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'oauth_tokens' AND column_name = 'access_token_enc'
  ) THEN
    ALTER TABLE oauth_tokens
      ADD COLUMN access_token_enc  bytea,
      ADD COLUMN refresh_token_enc bytea,
      ADD COLUMN token_enc_key_id  text;
  END IF;
END $$;

-- ── 2. Persistent OAuth state ──────────────────────────────────────────────
-- Replaces in-memory OAUTH_STATES, PENDING_GMAIL_TOKENS, PENDING_OAUTH_USERINFO maps.

CREATE TABLE IF NOT EXISTS auth.oauth_state (
  state         text PRIMARY KEY,
  provider      text NOT NULL,
  redirect_uri  text NOT NULL,
  code_verifier text,
  frontend_origin text,
  created_at    bigint NOT NULL,
  expires_at    bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON auth.oauth_state (expires_at);

CREATE TABLE IF NOT EXISTS auth.pending_oauth_tokens (
  connection_token text PRIMARY KEY,
  provider         text NOT NULL,
  access_token_enc bytea,
  refresh_token_enc bytea,
  email            text NOT NULL,
  user_info_name   text,
  token_enc_key_id text,
  created_at       bigint NOT NULL,
  expires_at       bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_oauth_expires ON auth.pending_oauth_tokens (expires_at);

-- ── 3. 2FA persistent state ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.two_factor (
  user_id             text PRIMARY KEY,
  secret_enc          bytea NOT NULL,
  enabled             boolean NOT NULL DEFAULT false,
  pending_secret_enc  bytea,
  enc_key_id          text,
  created_at          bigint NOT NULL,
  updated_at          bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.recovery_codes (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES auth.two_factor(user_id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  used_at     bigint,
  created_at  bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_codes_user ON auth.recovery_codes (user_id);
