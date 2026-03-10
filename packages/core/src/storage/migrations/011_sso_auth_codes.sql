-- 011_sso_auth_codes.sql
-- Short-lived SSO authorization codes for secure token delivery.

CREATE TABLE IF NOT EXISTS auth.sso_auth_codes (
  code        text PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_in  integer NOT NULL,
  created_at  bigint NOT NULL,
  expires_at  bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sso_auth_codes_expires ON auth.sso_auth_codes (expires_at);
