-- 015_scim.sql — SCIM 2.0 Provisioning
-- Tier: enterprise

CREATE SCHEMA IF NOT EXISTS scim;

CREATE TABLE IF NOT EXISTS scim.users (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  user_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  roles TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS scim.groups (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  display_name TEXT NOT NULL UNIQUE,
  members TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scim_users_username ON scim.users(user_name);
CREATE INDEX IF NOT EXISTS idx_scim_users_external ON scim.users(external_id);
CREATE INDEX IF NOT EXISTS idx_scim_users_email ON scim.users(email);
CREATE INDEX IF NOT EXISTS idx_scim_users_active ON scim.users(active);
CREATE INDEX IF NOT EXISTS idx_scim_groups_external ON scim.groups(external_id);
CREATE INDEX IF NOT EXISTS idx_scim_groups_display ON scim.groups(display_name);
