-- Migration 019: Add source column to marketplace.skills
-- Tracks whether a skill is builtin (YEOMAN), community-contributed, or user-published

ALTER TABLE marketplace.skills
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'published';

-- Retag existing YEOMAN built-ins
UPDATE marketplace.skills SET source = 'builtin' WHERE author = 'YEOMAN';
