-- Migration 072: Marketplace Shareables (Phase 89)
-- Adds source + requires_json to workflow definitions and swarm templates,
-- and creates the junction table for skills on sub-agent profiles.

-- ── Workflow definitions ─────────────────────────────────────────────────────

ALTER TABLE workflow.definitions
  ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS requires_json JSONB DEFAULT NULL;

-- Mark existing builtins
UPDATE workflow.definitions SET source = 'builtin' WHERE created_by = 'system';

-- ── Swarm templates ───────────────────────────────────────────────────────────

ALTER TABLE agents.swarm_templates
  ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS requires_json JSONB DEFAULT NULL;

UPDATE agents.swarm_templates SET source = 'builtin' WHERE is_builtin = true;

-- ── Profile skills (skills attached to sub-agent profiles) ────────────────────

CREATE TABLE IF NOT EXISTS agents.profile_skills (
  profile_id   TEXT        NOT NULL REFERENCES agents.profiles(id) ON DELETE CASCADE,
  skill_id     TEXT        NOT NULL REFERENCES marketplace.skills(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (profile_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_skills_profile_id
  ON agents.profile_skills(profile_id);
