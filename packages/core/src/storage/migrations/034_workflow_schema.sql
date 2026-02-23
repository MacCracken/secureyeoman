-- Migration 034: Workflow Engine Schema
-- DAG-based workflow orchestration tables.

CREATE SCHEMA IF NOT EXISTS workflow;

CREATE TABLE IF NOT EXISTS workflow.definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  steps_json    JSONB NOT NULL DEFAULT '[]',
  edges_json    JSONB NOT NULL DEFAULT '[]',
  triggers_json JSONB NOT NULL DEFAULT '[]',
  is_enabled    BOOLEAN NOT NULL DEFAULT true,
  version       INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT NOT NULL DEFAULT 'system',
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_def_name ON workflow.definitions(name);

CREATE TABLE IF NOT EXISTS workflow.runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflow.definitions(id),
  workflow_name TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  input_json    JSONB,
  output_json   JSONB,
  error         TEXT,
  triggered_by  TEXT NOT NULL DEFAULT 'manual',
  created_at    BIGINT NOT NULL,
  started_at    BIGINT,
  completed_at  BIGINT
);

CREATE INDEX IF NOT EXISTS idx_wf_runs_workflow ON workflow.runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_runs_status   ON workflow.runs(status);

CREATE TABLE IF NOT EXISTS workflow.step_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES workflow.runs(id) ON DELETE CASCADE,
  step_id      TEXT NOT NULL,
  step_name    TEXT NOT NULL,
  step_type    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  input_json   JSONB,
  output_json  JSONB,
  error        TEXT,
  started_at   BIGINT,
  completed_at BIGINT,
  duration_ms  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_wf_step_runs_run ON workflow.step_runs(run_id);
