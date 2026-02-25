-- Phase 49: AI Autonomy Level Audit
-- Adds autonomy classification fields to skills and workflows.
-- Creates autonomy_audit_runs table for periodic review runs.

-- Skills: add autonomy classification (default L1 — human does)
ALTER TABLE soul.skills
  ADD COLUMN IF NOT EXISTS autonomy_level             VARCHAR(2) NOT NULL DEFAULT 'L1',
  ADD COLUMN IF NOT EXISTS emergency_stop_procedure   TEXT;

-- Workflows: add autonomy classification (default L2 — collaborative)
ALTER TABLE workflow.definitions
  ADD COLUMN IF NOT EXISTS autonomy_level             VARCHAR(2) NOT NULL DEFAULT 'L2',
  ADD COLUMN IF NOT EXISTS emergency_stop_procedure   TEXT;

-- Audit runs table: persisted so multiple operators can contribute to the same run
CREATE TABLE IF NOT EXISTS autonomy_audit_runs (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'in_progress',
  items            JSONB   NOT NULL DEFAULT '[]',
  report_markdown  TEXT,
  report_json      JSONB,
  created_by       TEXT,
  created_at       BIGINT  NOT NULL,
  completed_at     BIGINT
);

CREATE INDEX IF NOT EXISTS idx_autonomy_audit_runs_created_at
  ON autonomy_audit_runs (created_at DESC);
