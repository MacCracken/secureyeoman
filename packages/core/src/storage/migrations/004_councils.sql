-- Council of AIs — deliberation engine tables
-- Phase 115

-- Council Templates
CREATE TABLE IF NOT EXISTS agents.council_templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL DEFAULT '',
  members       JSONB NOT NULL DEFAULT '[]',
  facilitator_profile TEXT NOT NULL,
  deliberation_strategy TEXT NOT NULL DEFAULT 'rounds',
  max_rounds    INT NOT NULL DEFAULT 3,
  voting_strategy TEXT NOT NULL DEFAULT 'facilitator_judgment',
  is_builtin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

-- Council Runs
CREATE TABLE IF NOT EXISTS agents.council_runs (
  id               TEXT PRIMARY KEY,
  template_id      TEXT NOT NULL REFERENCES agents.council_templates(id),
  template_name    TEXT NOT NULL,
  topic            TEXT NOT NULL,
  context          TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  deliberation_strategy TEXT NOT NULL,
  max_rounds       INT NOT NULL DEFAULT 3,
  completed_rounds INT NOT NULL DEFAULT 0,
  decision         TEXT,
  consensus        TEXT,
  dissents         JSONB,
  reasoning        TEXT,
  confidence       DOUBLE PRECISION,
  token_budget     INT NOT NULL DEFAULT 500000,
  tokens_used      INT NOT NULL DEFAULT 0,
  created_at       BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  started_at       BIGINT,
  completed_at     BIGINT,
  initiated_by     TEXT
);
CREATE INDEX IF NOT EXISTS idx_council_runs_status ON agents.council_runs(status);
CREATE INDEX IF NOT EXISTS idx_council_runs_created_at ON agents.council_runs(created_at DESC);

-- Council Positions (per-member, per-round)
CREATE TABLE IF NOT EXISTS agents.council_positions (
  id              TEXT PRIMARY KEY,
  council_run_id  TEXT NOT NULL REFERENCES agents.council_runs(id) ON DELETE CASCADE,
  member_role     TEXT NOT NULL,
  profile_name    TEXT NOT NULL,
  round           INT NOT NULL,
  position        TEXT NOT NULL,
  confidence      DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  key_points      JSONB NOT NULL DEFAULT '[]',
  agreements      JSONB NOT NULL DEFAULT '[]',
  disagreements   JSONB NOT NULL DEFAULT '[]',
  created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_council_positions_run_round
  ON agents.council_positions(council_run_id, round);
