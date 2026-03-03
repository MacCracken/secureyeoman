-- Phase 111 — Departmental Risk Register
-- Adds departments, register entries, and department score snapshots to the risk schema.

-- ─── Departments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk.departments (
  id            text PRIMARY KEY,
  name          varchar(200) NOT NULL,
  description   text,
  mission       text,
  objectives    jsonb DEFAULT '[]'::jsonb,
  parent_id     text REFERENCES risk.departments(id) ON DELETE SET NULL,
  team_id       text,
  risk_appetite jsonb DEFAULT '{"security":50,"operational":50,"financial":50,"compliance":50,"reputational":50}'::jsonb,
  compliance_targets jsonb DEFAULT '[]'::jsonb,
  metadata      jsonb DEFAULT '{}'::jsonb,
  tenant_id     text,
  created_at    bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  updated_at    bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  UNIQUE (name, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_departments_parent_id ON risk.departments (parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id ON risk.departments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_team_id ON risk.departments (team_id);

-- ─── Register Entries ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk.register_entries (
  id              text PRIMARY KEY,
  department_id   text NOT NULL REFERENCES risk.departments(id) ON DELETE CASCADE,
  title           varchar(300) NOT NULL,
  description     text,
  category        varchar(50) NOT NULL CHECK (category IN (
    'security', 'operational', 'financial', 'compliance', 'reputational',
    'strategic', 'technology', 'third_party', 'environmental', 'other'
  )),
  severity        varchar(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  likelihood      int NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact          int NOT NULL CHECK (impact BETWEEN 1 AND 5),
  risk_score      int GENERATED ALWAYS AS (likelihood * impact) STORED,
  owner           varchar(200),
  mitigations     jsonb DEFAULT '[]'::jsonb,
  status          varchar(20) NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'in_progress', 'mitigated', 'accepted', 'closed', 'transferred'
  )),
  due_date        timestamptz,
  source          varchar(50) CHECK (source IN (
    'manual', 'assessment', 'scan', 'audit', 'incident', 'external_feed', 'workflow'
  )),
  source_ref      text,
  evidence_refs   jsonb DEFAULT '[]'::jsonb,
  tenant_id       text,
  created_by      text,
  created_at      bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  updated_at      bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  closed_at       bigint
);

CREATE INDEX IF NOT EXISTS idx_register_entries_department_id ON risk.register_entries (department_id);
CREATE INDEX IF NOT EXISTS idx_register_entries_status ON risk.register_entries (status);
CREATE INDEX IF NOT EXISTS idx_register_entries_category ON risk.register_entries (category);
CREATE INDEX IF NOT EXISTS idx_register_entries_risk_score ON risk.register_entries (risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_register_entries_due_date ON risk.register_entries (due_date);
CREATE INDEX IF NOT EXISTS idx_register_entries_tenant_id ON risk.register_entries (tenant_id);

-- ─── Department Scores ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS risk.department_scores (
  id               text PRIMARY KEY,
  department_id    text NOT NULL REFERENCES risk.departments(id) ON DELETE CASCADE,
  scored_at        timestamptz NOT NULL DEFAULT now(),
  overall_score    numeric(5,2),
  domain_scores    jsonb DEFAULT '{}'::jsonb,
  open_risks       int DEFAULT 0,
  overdue_risks    int DEFAULT 0,
  appetite_breaches jsonb DEFAULT '[]'::jsonb,
  assessment_id    text,
  tenant_id        text,
  created_at       bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

CREATE INDEX IF NOT EXISTS idx_department_scores_dept_scored ON risk.department_scores (department_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_department_scores_tenant_id ON risk.department_scores (tenant_id);

-- ─── ALTER existing tables ───────────────────────────────────────

ALTER TABLE risk.assessments ADD COLUMN IF NOT EXISTS department_id text REFERENCES risk.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_assessments_department_id ON risk.assessments (department_id);

ALTER TABLE risk.external_findings ADD COLUMN IF NOT EXISTS department_id text REFERENCES risk.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_external_findings_department_id ON risk.external_findings (department_id);
