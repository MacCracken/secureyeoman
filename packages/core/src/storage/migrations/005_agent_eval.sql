-- Migration 005: Agent Evaluation Harness
-- Phase 135: Structured evaluation framework for agent behavior

CREATE SCHEMA IF NOT EXISTS eval;

-- ── Eval Scenarios ──────────────────────────────────────────────

CREATE TABLE eval.scenarios (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general',
  tags          JSONB NOT NULL DEFAULT '[]',
  input         TEXT NOT NULL,
  conversation_history JSONB NOT NULL DEFAULT '[]',
  expected_tool_calls  JSONB NOT NULL DEFAULT '[]',
  ordered_tool_calls   BOOLEAN NOT NULL DEFAULT FALSE,
  forbidden_tool_calls JSONB NOT NULL DEFAULT '[]',
  output_assertions    JSONB NOT NULL DEFAULT '[]',
  max_tokens    INTEGER,
  max_duration_ms INTEGER NOT NULL DEFAULT 60000,
  personality_id TEXT,
  skill_ids     JSONB NOT NULL DEFAULT '[]',
  model         TEXT,
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX idx_eval_scenarios_category ON eval.scenarios (category);
CREATE INDEX idx_eval_scenarios_tenant ON eval.scenarios (tenant_id);

-- ── Eval Suites ─────────────────────────────────────────────────

CREATE TABLE eval.suites (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  scenario_ids  JSONB NOT NULL DEFAULT '[]',
  max_cost_usd  DOUBLE PRECISION,
  concurrency   INTEGER NOT NULL DEFAULT 1,
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX idx_eval_suites_tenant ON eval.suites (tenant_id);

-- ── Suite Run Results ───────────────────────────────────────────

CREATE TABLE eval.suite_runs (
  id              TEXT PRIMARY KEY,
  suite_id        TEXT NOT NULL REFERENCES eval.suites(id) ON DELETE CASCADE,
  suite_name      TEXT NOT NULL,
  passed          BOOLEAN NOT NULL,
  total_scenarios INTEGER NOT NULL DEFAULT 0,
  passed_count    INTEGER NOT NULL DEFAULT 0,
  failed_count    INTEGER NOT NULL DEFAULT 0,
  error_count     INTEGER NOT NULL DEFAULT 0,
  total_duration_ms INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  total_cost_usd  DOUBLE PRECISION NOT NULL DEFAULT 0,
  started_at      BIGINT NOT NULL,
  completed_at    BIGINT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX idx_eval_suite_runs_suite ON eval.suite_runs (suite_id);
CREATE INDEX idx_eval_suite_runs_tenant ON eval.suite_runs (tenant_id);
CREATE INDEX idx_eval_suite_runs_started ON eval.suite_runs (started_at DESC);

-- ── Scenario Run Results ────────────────────────────────────────

CREATE TABLE eval.scenario_runs (
  id              TEXT PRIMARY KEY,
  suite_run_id    TEXT NOT NULL REFERENCES eval.suite_runs(id) ON DELETE CASCADE,
  scenario_id     TEXT NOT NULL,
  scenario_name   TEXT NOT NULL,
  passed          BOOLEAN NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'timeout', 'budget_exceeded')),
  output          TEXT NOT NULL DEFAULT '',
  assertion_results JSONB NOT NULL DEFAULT '[]',
  tool_calls      JSONB NOT NULL DEFAULT '[]',
  tool_call_errors JSONB NOT NULL DEFAULT '[]',
  forbidden_violations JSONB NOT NULL DEFAULT '[]',
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd        DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  model           TEXT,
  personality_id  TEXT,
  tenant_id       TEXT NOT NULL DEFAULT 'default',
  created_at      BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX idx_eval_scenario_runs_suite ON eval.scenario_runs (suite_run_id);
CREATE INDEX idx_eval_scenario_runs_scenario ON eval.scenario_runs (scenario_id);
CREATE INDEX idx_eval_scenario_runs_status ON eval.scenario_runs (status);
CREATE INDEX idx_eval_scenario_runs_tenant ON eval.scenario_runs (tenant_id);
