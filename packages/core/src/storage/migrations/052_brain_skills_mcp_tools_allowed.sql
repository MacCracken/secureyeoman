-- Phase: One Skill Schema — add mcp_tools_allowed to brain.skills
-- Migration 051 added this to marketplace.skills. This migration closes the
-- gap for brain.skills so mcpToolsAllowed survives the catalog → brain install
-- boundary. IF NOT EXISTS guards against fresh-DB double-apply from 051.

ALTER TABLE brain.skills
  ADD COLUMN IF NOT EXISTS mcp_tools_allowed JSONB NOT NULL DEFAULT '[]';
