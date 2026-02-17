-- 009_security_policy.sql
-- Persists security policy toggles set via the dashboard.

CREATE SCHEMA IF NOT EXISTS security;

CREATE TABLE IF NOT EXISTS security.policy (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
