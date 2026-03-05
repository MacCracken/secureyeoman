-- Migration 007: Multi-Region & High Availability (Phase 137)
-- Adds federation cross-cluster tables and backup replication tracking.

-- Federation schema (extends Phase 79 federation.peers)
-- If federation schema doesn't exist yet, create it
CREATE SCHEMA IF NOT EXISTS federation;

-- Cross-cluster peer tracking (may already exist from Phase 79, add columns if needed)
CREATE TABLE IF NOT EXISTS federation.peers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  shared_secret_hash TEXT NOT NULL,
  shared_secret_enc  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unknown',
  features      JSONB NOT NULL DEFAULT '{}',
  last_seen     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add cross-cluster columns if not present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'federation' AND table_name = 'peers' AND column_name = 'cluster_id') THEN
    ALTER TABLE federation.peers ADD COLUMN cluster_id TEXT;
    ALTER TABLE federation.peers ADD COLUMN region TEXT DEFAULT '';
    ALTER TABLE federation.peers ADD COLUMN agent_count INTEGER DEFAULT 0;
    ALTER TABLE federation.peers ADD COLUMN latency_ms INTEGER;
  END IF;
END $$;

-- Cross-cluster delegations
CREATE TABLE IF NOT EXISTS federation.delegations (
  id                  TEXT PRIMARY KEY,
  source_cluster_id   TEXT NOT NULL,
  target_cluster_id   TEXT NOT NULL,
  agent_id            TEXT NOT NULL,
  task_summary        TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'pending',
  metadata_only       BOOLEAN NOT NULL DEFAULT true,
  created_at          BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM now())::BIGINT * 1000,
  completed_at        BIGINT
);

CREATE INDEX IF NOT EXISTS idx_federation_delegations_source ON federation.delegations (source_cluster_id);
CREATE INDEX IF NOT EXISTS idx_federation_delegations_target ON federation.delegations (target_cluster_id);
CREATE INDEX IF NOT EXISTS idx_federation_delegations_status ON federation.delegations (status);

-- Federation sync log (may already exist from Phase 79)
CREATE TABLE IF NOT EXISTS federation.sync_log (
  id          TEXT PRIMARY KEY,
  peer_id     TEXT NOT NULL,
  type        TEXT NOT NULL,
  status      TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_federation_sync_log_peer ON federation.sync_log (peer_id);

-- Backup replication tracking
CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.backups (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  size_bytes      BIGINT,
  file_path       TEXT,
  error           TEXT,
  pg_dump_version TEXT,
  created_by      TEXT,
  created_at      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM now())::BIGINT * 1000,
  completed_at    BIGINT
);

CREATE TABLE IF NOT EXISTS admin.backup_replications (
  id              TEXT PRIMARY KEY,
  backup_id       TEXT NOT NULL REFERENCES admin.backups(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'local',
  remote_path     TEXT NOT NULL,
  size_bytes      BIGINT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM now())::BIGINT * 1000,
  completed_at    BIGINT,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_backup_replications_backup ON admin.backup_replications (backup_id);
