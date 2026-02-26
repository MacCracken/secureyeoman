-- Migration 050: Add routing quality fields to brain.skills
-- brain.skills installs from the marketplace carry useWhen/doNotUseWhen/successCriteria/routing/autonomyLevel.
-- soul.skills received these in migration 041; marketplace.skills in migration 049.

ALTER TABLE brain.skills
  ADD COLUMN IF NOT EXISTS use_when         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS do_not_use_when  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS success_criteria TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS routing          TEXT NOT NULL DEFAULT 'fuzzy',
  ADD COLUMN IF NOT EXISTS autonomy_level   TEXT NOT NULL DEFAULT 'L1';
