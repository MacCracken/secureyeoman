-- Phase 44: Skill Routing Quality
-- Adds routing-intent fields and invocation telemetry to soul.skills.

ALTER TABLE soul.skills
  ADD COLUMN IF NOT EXISTS use_when           TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS do_not_use_when    TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS success_criteria   TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mcp_tools_allowed  JSONB   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS routing            TEXT    NOT NULL DEFAULT 'fuzzy',
  ADD COLUMN IF NOT EXISTS linked_workflow_id TEXT,
  ADD COLUMN IF NOT EXISTS invoked_count      INTEGER NOT NULL DEFAULT 0;
