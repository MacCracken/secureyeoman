-- 002_personality_scoping.sql
-- Add personality_id to brain and spirit tables for per-personality scoping.
-- Nullable so existing FRIDAY data can be retroactively scoped.

ALTER TABLE brain.memories ADD COLUMN IF NOT EXISTS personality_id TEXT;
ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS personality_id TEXT;
ALTER TABLE brain.skills ADD COLUMN IF NOT EXISTS personality_id TEXT;

ALTER TABLE spirit.passions ADD COLUMN IF NOT EXISTS personality_id TEXT;
ALTER TABLE spirit.inspirations ADD COLUMN IF NOT EXISTS personality_id TEXT;
ALTER TABLE spirit.pains ADD COLUMN IF NOT EXISTS personality_id TEXT;

CREATE INDEX IF NOT EXISTS idx_memories_personality ON brain.memories(personality_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_personality ON brain.knowledge(personality_id);
CREATE INDEX IF NOT EXISTS idx_brain_skills_personality ON brain.skills(personality_id);

CREATE INDEX IF NOT EXISTS idx_passions_personality ON spirit.passions(personality_id);
CREATE INDEX IF NOT EXISTS idx_inspirations_personality ON spirit.inspirations(personality_id);
CREATE INDEX IF NOT EXISTS idx_pains_personality ON spirit.pains(personality_id);
