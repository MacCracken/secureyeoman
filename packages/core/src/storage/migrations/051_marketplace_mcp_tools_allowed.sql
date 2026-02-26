-- Phase: One Skill Schema — add mcp_tools_allowed to catalog + brain skills
-- mcpToolsAllowed is part of BaseSkillSchema and must survive the catalog → brain
-- install boundary. Phase 44 (041) added it to soul.skills but missed brain.skills
-- and marketplace.skills; this migration closes that gap.

ALTER TABLE marketplace.skills
  ADD COLUMN IF NOT EXISTS mcp_tools_allowed JSONB NOT NULL DEFAULT '[]';

ALTER TABLE brain.skills
  ADD COLUMN IF NOT EXISTS mcp_tools_allowed JSONB NOT NULL DEFAULT '[]';
