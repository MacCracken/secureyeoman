-- Migration 060: Training distillation jobs (Phase 64)
-- Stores model distillation job configuration and progress.

CREATE SCHEMA IF NOT EXISTS training;

CREATE TABLE IF NOT EXISTS training.distillation_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  teacher_provider TEXT NOT NULL,
  teacher_model TEXT NOT NULL,
  export_format TEXT NOT NULL DEFAULT 'sharegpt',
  max_samples INTEGER NOT NULL DEFAULT 500,
  personality_ids TEXT[] DEFAULT '{}',
  output_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  samples_generated INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS distillation_jobs_status_idx
  ON training.distillation_jobs (status);

CREATE INDEX IF NOT EXISTS distillation_jobs_created_at_idx
  ON training.distillation_jobs (created_at DESC);
