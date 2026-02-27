-- Migration 053: Risk Assessment & Reporting System
-- Phase 53 — Cross-domain risk assessment engine with external feeds

CREATE SCHEMA IF NOT EXISTS risk;

-- ── Risk Assessments ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk.assessments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  assessment_types JSONB NOT NULL DEFAULT '[]',
  window_days INTEGER NOT NULL DEFAULT 7,
  composite_score INTEGER,
  risk_level TEXT,
  domain_scores JSONB NOT NULL DEFAULT '{}',
  findings JSONB NOT NULL DEFAULT '[]',
  findings_count INTEGER NOT NULL DEFAULT 0,
  report_json JSONB,
  report_html TEXT,
  report_markdown TEXT,
  report_csv TEXT,
  options JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at BIGINT NOT NULL,
  completed_at BIGINT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_created_at ON risk.assessments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_status ON risk.assessments(status);

-- ── External Feeds ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk.external_feeds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}',
  last_ingested_at BIGINT,
  record_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ── External Findings ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk.external_findings (
  id TEXT PRIMARY KEY,
  feed_id TEXT REFERENCES risk.external_feeds(id) ON DELETE CASCADE,
  source_ref TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  affected_resource TEXT,
  recommendation TEXT,
  evidence JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  acknowledged_by TEXT,
  acknowledged_at BIGINT,
  resolved_at BIGINT,
  source_date BIGINT,
  imported_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ext_findings_feed_id ON risk.external_findings(feed_id);
CREATE INDEX IF NOT EXISTS idx_ext_findings_status ON risk.external_findings(status);
CREATE INDEX IF NOT EXISTS idx_ext_findings_severity ON risk.external_findings(severity);
CREATE INDEX IF NOT EXISTS idx_ext_findings_imported_at ON risk.external_findings(imported_at DESC);
