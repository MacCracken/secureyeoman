-- Migration 010: Multimodal I/O job tracking (Phase 7.3)

CREATE SCHEMA IF NOT EXISTS multimodal;

CREATE TABLE IF NOT EXISTS multimodal.jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input JSONB NOT NULL,
  output JSONB,
  error TEXT,
  duration_ms INTEGER,
  source_platform TEXT,
  source_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_type ON multimodal.jobs(type);
CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_status ON multimodal.jobs(status);
CREATE INDEX IF NOT EXISTS idx_multimodal_jobs_created ON multimodal.jobs(created_at DESC);
