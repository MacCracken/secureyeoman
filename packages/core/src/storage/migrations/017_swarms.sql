-- Migration 017: Agent Swarms (Phase 17)
-- Creates tables for swarm templates, runs, and members.

CREATE TABLE IF NOT EXISTS agents.swarm_templates (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  description         TEXT NOT NULL DEFAULT '',
  strategy            TEXT NOT NULL CHECK (strategy IN ('sequential','parallel','dynamic')),
  roles               JSONB NOT NULL DEFAULT '[]',
  coordinator_profile TEXT,
  is_builtin          BOOLEAN NOT NULL DEFAULT false,
  created_at          BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);

CREATE TABLE IF NOT EXISTS agents.swarm_runs (
  id                     TEXT PRIMARY KEY,
  template_id            TEXT NOT NULL REFERENCES agents.swarm_templates(id),
  template_name          TEXT NOT NULL,
  task                   TEXT NOT NULL,
  context                TEXT,
  status                 TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','running','completed','failed','cancelled')),
  strategy               TEXT NOT NULL,
  result                 TEXT,
  error                  TEXT,
  token_budget           INTEGER NOT NULL DEFAULT 500000,
  tokens_used_prompt     INTEGER NOT NULL DEFAULT 0,
  tokens_used_completion INTEGER NOT NULL DEFAULT 0,
  created_at             BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  started_at             BIGINT,
  completed_at           BIGINT,
  initiated_by           TEXT
);

CREATE TABLE IF NOT EXISTS agents.swarm_members (
  id            TEXT PRIMARY KEY,
  swarm_run_id  TEXT NOT NULL REFERENCES agents.swarm_runs(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  profile_name  TEXT NOT NULL,
  delegation_id TEXT REFERENCES agents.delegations(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  result        TEXT,
  seq_order     INTEGER NOT NULL DEFAULT 0,
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  started_at    BIGINT,
  completed_at  BIGINT
);

CREATE INDEX IF NOT EXISTS idx_swarm_runs_status  ON agents.swarm_runs(status);
CREATE INDEX IF NOT EXISTS idx_swarm_runs_created ON agents.swarm_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swarm_members_run  ON agents.swarm_members(swarm_run_id);
CREATE INDEX IF NOT EXISTS idx_swarm_members_dlg  ON agents.swarm_members(delegation_id)
  WHERE delegation_id IS NOT NULL;
