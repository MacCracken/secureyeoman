-- 026_agent_profile_types.sql
-- Extensible sub-agent execution types: llm (existing), binary, mcp-bridge.

ALTER TABLE agents.profiles
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'llm',
  ADD COLUMN IF NOT EXISTS command TEXT,
  ADD COLUMN IF NOT EXISTS command_args JSONB,
  ADD COLUMN IF NOT EXISTS command_env JSONB,
  ADD COLUMN IF NOT EXISTS mcp_tool TEXT,
  ADD COLUMN IF NOT EXISTS mcp_tool_input TEXT;

-- Integrity constraints
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_agent_profile_type' AND conrelid = 'agents.profiles'::regclass
  ) THEN
    ALTER TABLE agents.profiles
      ADD CONSTRAINT chk_agent_profile_type
        CHECK (type IN ('llm', 'binary', 'mcp-bridge')),
      ADD CONSTRAINT chk_binary_requires_command
        CHECK (type != 'binary' OR command IS NOT NULL),
      ADD CONSTRAINT chk_mcp_bridge_requires_tool
        CHECK (type != 'mcp-bridge' OR mcp_tool IS NOT NULL);
  END IF;
END $$;
