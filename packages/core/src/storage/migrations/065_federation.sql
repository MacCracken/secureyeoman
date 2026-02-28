-- Migration 065: Multi-Instance Federation schema
-- Phase 79

CREATE SCHEMA IF NOT EXISTS federation;

CREATE TABLE IF NOT EXISTS federation.peers (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  url                   TEXT NOT NULL UNIQUE,
  shared_secret_hash    TEXT NOT NULL,
  shared_secret_enc     TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'unknown'
                        CHECK (status IN ('online', 'offline', 'unknown')),
  features              JSONB NOT NULL DEFAULT '{"knowledge":true,"marketplace":true,"personalities":false}'::jsonb,
  last_seen             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS federation.sync_log (
  id          TEXT PRIMARY KEY,
  peer_id     TEXT NOT NULL REFERENCES federation.peers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL
              CHECK (type IN ('knowledge_search','skill_install','personality_import','health_check')),
  status      TEXT NOT NULL CHECK (status IN ('success','error')),
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_federation_sync_log_peer ON federation.sync_log (peer_id, created_at DESC);
