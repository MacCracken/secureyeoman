-- Migration 068: Teams (Phase 83)
-- Introduces the Team primitive: a coordinator LLM that dynamically assigns
-- members to tasks rather than requiring pre-wired delegation graphs.

CREATE TABLE IF NOT EXISTS agents.teams (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  description              TEXT,
  members                  JSONB NOT NULL DEFAULT '[]',
  coordinator_profile_name TEXT,
  is_builtin               BOOLEAN NOT NULL DEFAULT FALSE,
  created_at               BIGINT NOT NULL,
  updated_at               BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents.team_runs (
  id                    TEXT PRIMARY KEY,
  team_id               TEXT NOT NULL REFERENCES agents.teams(id) ON DELETE CASCADE,
  team_name             TEXT NOT NULL,
  task                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',
  result                TEXT,
  error                 TEXT,
  coordinator_reasoning TEXT,
  assigned_members      JSONB NOT NULL DEFAULT '[]',
  token_budget          INTEGER NOT NULL DEFAULT 100000,
  tokens_used           INTEGER NOT NULL DEFAULT 0,
  created_at            BIGINT NOT NULL,
  started_at            BIGINT,
  completed_at          BIGINT,
  initiated_by          TEXT
);

CREATE INDEX IF NOT EXISTS idx_team_runs_team_id   ON agents.team_runs(team_id);
CREATE INDEX IF NOT EXISTS idx_team_runs_status     ON agents.team_runs(status);
CREATE INDEX IF NOT EXISTS idx_team_runs_created_at ON agents.team_runs(created_at DESC);
