-- 020_soul_skills_personality.sql
-- Add personality_id to soul.skills for per-personality skill scoping.
-- Mirrors the brain.skills.personality_id added in migration 002.
-- Nullable so existing skills continue to work as Global (personality_id = NULL).

ALTER TABLE soul.skills ADD COLUMN IF NOT EXISTS personality_id TEXT;

CREATE INDEX IF NOT EXISTS idx_soul_skills_personality ON soul.skills(personality_id);
