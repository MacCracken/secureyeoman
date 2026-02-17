-- Migration 006: Extension Lifecycle Hooks (Phase 6.4a)
-- Creates the extensions schema with extensions, hooks, and webhooks tables.

CREATE SCHEMA IF NOT EXISTS extensions;

-- Extensions registry
CREATE TABLE IF NOT EXISTS extensions.extensions (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  version    TEXT NOT NULL DEFAULT '1.0.0',
  manifest   JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extensions_name ON extensions.extensions(name);

-- Hook registrations
CREATE TABLE IF NOT EXISTS extensions.hooks (
  id           TEXT PRIMARY KEY,
  extension_id TEXT NOT NULL REFERENCES extensions.extensions(id) ON DELETE CASCADE,
  hook_point   TEXT NOT NULL,
  semantics    TEXT NOT NULL DEFAULT 'observe'
               CHECK (semantics IN ('observe', 'transform', 'veto')),
  priority     INTEGER NOT NULL DEFAULT 100,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hooks_extension ON extensions.hooks(extension_id);
CREATE INDEX IF NOT EXISTS idx_hooks_point ON extensions.hooks(hook_point);

-- Webhook configurations
CREATE TABLE IF NOT EXISTS extensions.webhooks (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  hook_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret      TEXT,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
