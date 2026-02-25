-- 045: Performance indexes for hot query paths
--
-- soul.skills: the getEnabledSkills() path queries WHERE enabled = true AND status = 'active'
--   ORDER BY usage_count DESC on every chat request. Without an index this is a full table scan.
--
-- autonomy_audit_runs: queries frequently filter by status ('pending', 'in_progress').
--
-- intent_enforcement_log: admin queries group/filter by personality_id.

CREATE INDEX IF NOT EXISTS idx_soul_skills_active
  ON soul.skills (enabled, status, usage_count DESC)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_autonomy_audit_status
  ON autonomy_audit_runs (status);

CREATE INDEX IF NOT EXISTS idx_intent_log_personality
  ON intent_enforcement_log (personality_id);
