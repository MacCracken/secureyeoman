-- Migration 049: Add routing quality fields to marketplace.skills
-- Aligns marketplace skill schema with the Phase 44 routing intent fields and Phase 49 autonomy level.
-- soul.skills already received these in migration 041.
-- brain.skills receives them in migration 050.

ALTER TABLE marketplace.skills
  ADD COLUMN IF NOT EXISTS use_when         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS do_not_use_when  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS success_criteria TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS routing          TEXT NOT NULL DEFAULT 'fuzzy',
  ADD COLUMN IF NOT EXISTS autonomy_level   TEXT NOT NULL DEFAULT 'L1';
