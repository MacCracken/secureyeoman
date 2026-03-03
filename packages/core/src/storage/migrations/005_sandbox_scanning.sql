-- Phase 116: Sandbox Artifact Scanning & Externalization Gate
-- Stores scan history for all artifacts that pass through the externalization gate.

CREATE SCHEMA IF NOT EXISTS sandbox;

CREATE TABLE IF NOT EXISTS sandbox.scan_history (
  id UUID PRIMARY KEY,
  artifact_id UUID NOT NULL,
  artifact_type TEXT NOT NULL,
  source_context TEXT NOT NULL,
  personality_id UUID,
  user_id TEXT,
  verdict TEXT NOT NULL,
  finding_count INTEGER NOT NULL DEFAULT 0,
  worst_severity TEXT NOT NULL DEFAULT 'info',
  intent_score REAL,
  scan_duration_ms INTEGER NOT NULL DEFAULT 0,
  findings JSONB DEFAULT '[]',
  threat_assessment JSONB,
  tenant_id TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_scan_history_created_at ON sandbox.scan_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_verdict ON sandbox.scan_history (verdict);
CREATE INDEX IF NOT EXISTS idx_scan_history_personality ON sandbox.scan_history (personality_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_source ON sandbox.scan_history (source_context);
