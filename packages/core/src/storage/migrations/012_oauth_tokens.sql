-- OAuth Token Store
-- Persists OAuth2 tokens for all Google services (Gmail, Calendar, Drive)
-- so credentials survive process restarts and can be shared across integrations.

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id          TEXT    PRIMARY KEY,
  provider    TEXT    NOT NULL,           -- 'googlecalendar', 'googledrive', 'gmail', 'github', …
  email       TEXT    NOT NULL,           -- user email (used as lookup key per provider)
  user_id     TEXT    NOT NULL,           -- provider-side user ID (Google sub / GitHub id)
  access_token  TEXT  NOT NULL,           -- current access token
  refresh_token TEXT,                     -- refresh token (null for providers without offline access)
  scopes      TEXT    NOT NULL DEFAULT '', -- space-separated granted scopes
  expires_at  BIGINT,                     -- Unix ms; null = never expires
  created_at  BIGINT  NOT NULL,
  updated_at  BIGINT  NOT NULL,
  UNIQUE (provider, email)
);

CREATE INDEX IF NOT EXISTS oauth_tokens_provider_email ON oauth_tokens (provider, email);
