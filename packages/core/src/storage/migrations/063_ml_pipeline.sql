-- Migration 063: ML Pipeline Orchestration (Phase 73)
-- Tables for pipeline lineage tracking and human approval requests.

-- Pipeline lineage: records the end-to-end chain per workflow run
-- dataset snapshot → training job → evaluation results → deployed model
CREATE TABLE IF NOT EXISTS training.pipeline_lineage (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  -- Dataset curation step
  dataset_id TEXT,
  dataset_path TEXT,
  dataset_sample_count INTEGER,
  dataset_filters JSONB,
  dataset_snapshotted_at TIMESTAMPTZ,
  -- Training job step
  training_job_id TEXT,
  training_job_type TEXT,   -- 'distillation' | 'finetune'
  training_job_status TEXT,
  -- Evaluation step
  eval_id TEXT,
  eval_metrics JSONB,
  eval_completed_at TIMESTAMPTZ,
  -- Deployment step
  deployed_model_version TEXT,
  deployed_personality_id TEXT,
  deployed_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_lineage_workflow_run_idx
  ON training.pipeline_lineage (workflow_run_id);

CREATE INDEX IF NOT EXISTS pipeline_lineage_training_job_idx
  ON training.pipeline_lineage (training_job_id)
  WHERE training_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pipeline_lineage_created_at_idx
  ON training.pipeline_lineage (created_at DESC);

-- Human approval requests: pauses a pipeline run pending user action
CREATE TABLE IF NOT EXISTS training.approval_requests (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'rejected' | 'timed_out'
  report JSONB,                              -- eval report or arbitrary context sent to user
  timeout_ms BIGINT NOT NULL DEFAULT 86400000,  -- 24h default
  decided_by TEXT,                           -- user id who approved/rejected
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS approval_requests_run_idx
  ON training.approval_requests (workflow_run_id);

CREATE INDEX IF NOT EXISTS approval_requests_status_idx
  ON training.approval_requests (status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS approval_requests_expires_at_idx
  ON training.approval_requests (expires_at)
  WHERE status = 'pending';
