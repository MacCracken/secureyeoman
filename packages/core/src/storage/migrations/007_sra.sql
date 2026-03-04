-- 007_sra.sql — Phase 123: Security Reference Architecture
-- Three tables for SRA blueprints, assessments, and compliance mappings.

CREATE TABLE IF NOT EXISTS security.sra_blueprints (
  id            TEXT PRIMARY KEY,
  org_id        TEXT,
  name          TEXT NOT NULL,
  description   TEXT,
  provider      TEXT NOT NULL,
  framework     TEXT NOT NULL,
  controls      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft',
  is_builtin    BOOLEAN NOT NULL DEFAULT FALSE,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    TEXT,
  created_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_sra_blueprints_provider  ON security.sra_blueprints (provider);
CREATE INDEX IF NOT EXISTS idx_sra_blueprints_framework ON security.sra_blueprints (framework);
CREATE INDEX IF NOT EXISTS idx_sra_blueprints_status    ON security.sra_blueprints (status);
CREATE INDEX IF NOT EXISTS idx_sra_blueprints_org_id    ON security.sra_blueprints (org_id);

CREATE TABLE IF NOT EXISTS security.sra_assessments (
  id                          TEXT PRIMARY KEY,
  org_id                      TEXT,
  blueprint_id                TEXT NOT NULL REFERENCES security.sra_blueprints(id) ON DELETE CASCADE,
  name                        TEXT NOT NULL,
  infrastructure_description  TEXT,
  control_results             JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary                     JSONB,
  status                      TEXT NOT NULL DEFAULT 'in_progress',
  linked_risk_assessment_id   TEXT,
  created_by                  TEXT,
  created_at                  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at                  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_sra_assessments_blueprint_id ON security.sra_assessments (blueprint_id);
CREATE INDEX IF NOT EXISTS idx_sra_assessments_status       ON security.sra_assessments (status);
CREATE INDEX IF NOT EXISTS idx_sra_assessments_org_id       ON security.sra_assessments (org_id);

CREATE TABLE IF NOT EXISTS security.sra_compliance_mappings (
  domain        TEXT NOT NULL,
  framework     TEXT NOT NULL,
  control_id    TEXT NOT NULL,
  control_title TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  UNIQUE (domain, framework, control_id)
);
