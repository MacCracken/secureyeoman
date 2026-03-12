-- 020: DB-persisted auto-generated secrets
-- Stores auto-generated cryptographic keys so they survive container restarts
-- without requiring environment variables. Only admin password remains env-based.

CREATE SCHEMA IF NOT EXISTS internal;

CREATE TABLE IF NOT EXISTS internal.auto_secrets (
    name  text PRIMARY KEY,
    value text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Restrict permissions: only the application role should read this table.
COMMENT ON TABLE internal.auto_secrets IS
  'Auto-generated cryptographic secrets persisted across restarts. Values are raw base64url-encoded keys.';
