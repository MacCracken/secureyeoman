-- Migration 032: Add trigger_patterns to marketplace.skills
-- Allows community skills to carry triggerPatterns from JSON → marketplace
-- catalog → installed brain skill, wiring the isSkillInContext() gate.
ALTER TABLE marketplace.skills ADD COLUMN IF NOT EXISTS trigger_patterns JSONB DEFAULT '[]';
