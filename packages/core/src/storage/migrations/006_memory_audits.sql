-- Phase 118: Memory Audits, Compression & Reorganization
-- Two tables for audit reporting and memory archival.

CREATE TABLE IF NOT EXISTS brain.audit_reports (
  id            UUID PRIMARY KEY,
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  personality_id TEXT,
  scope         TEXT NOT NULL CHECK (scope IN ('daily', 'weekly', 'monthly')),
  started_at    BIGINT NOT NULL,
  completed_at  BIGINT,
  pre_snapshot  JSONB,
  post_snapshot JSONB,
  compression_summary  JSONB,
  reorganization_summary JSONB,
  maintenance_summary  JSONB,
  status        TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'pending_approval')),
  approved_by   TEXT,
  approved_at   BIGINT,
  error         TEXT,
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_audit_reports_personality ON brain.audit_reports (personality_id);
CREATE INDEX IF NOT EXISTS idx_audit_reports_scope ON brain.audit_reports (scope, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_reports_status ON brain.audit_reports (status);

CREATE TABLE IF NOT EXISTS brain.memory_archive (
  id                UUID PRIMARY KEY,
  original_memory_id UUID NOT NULL,
  original_content  TEXT NOT NULL,
  original_importance REAL NOT NULL DEFAULT 0.5,
  original_context  JSONB DEFAULT '{}',
  transform_type    TEXT NOT NULL CHECK (transform_type IN ('compressed', 'merged', 'reorganized', 'promoted', 'demoted')),
  audit_report_id   UUID REFERENCES brain.audit_reports(id) ON DELETE SET NULL,
  archived_at       BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  tenant_id         TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX IF NOT EXISTS idx_memory_archive_original ON brain.memory_archive (original_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_archive_report ON brain.memory_archive (audit_report_id);
