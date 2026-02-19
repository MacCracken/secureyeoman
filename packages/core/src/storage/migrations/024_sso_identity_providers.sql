-- 024_sso_identity_providers.sql
-- SSO/OIDC identity provider configuration and user-IDP mappings.

CREATE TABLE IF NOT EXISTS auth.identity_providers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('oidc', 'saml')),
  -- OIDC fields
  issuer_url    TEXT,           -- e.g. https://accounts.google.com
  client_id     TEXT,
  client_secret TEXT,           -- stored AES-256-GCM encrypted via keyring
  scopes        TEXT NOT NULL DEFAULT 'openid email profile',
  -- SAML fields (future)
  metadata_url  TEXT,
  entity_id     TEXT,
  acs_url       TEXT,
  -- Common
  enabled            BOOLEAN NOT NULL DEFAULT true,
  auto_provision     BOOLEAN NOT NULL DEFAULT true,
  default_role       TEXT    NOT NULL DEFAULT 'viewer',
  config             JSONB   NOT NULL DEFAULT '{}',
  created_at         BIGINT  NOT NULL,
  updated_at         BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_idp_type ON auth.identity_providers(type);

CREATE TABLE IF NOT EXISTS auth.identity_mappings (
  id                TEXT PRIMARY KEY,
  idp_id            TEXT NOT NULL REFERENCES auth.identity_providers(id) ON DELETE CASCADE,
  local_user_id     TEXT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_subject  TEXT NOT NULL,  -- IDP's 'sub' claim
  attributes        JSONB NOT NULL DEFAULT '{}',
  created_at        BIGINT NOT NULL,
  last_login_at     BIGINT,
  UNIQUE (idp_id, external_subject)
);

CREATE INDEX IF NOT EXISTS idx_auth_mappings_user ON auth.identity_mappings(local_user_id);
