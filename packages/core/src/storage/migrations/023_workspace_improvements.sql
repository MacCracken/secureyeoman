-- 023_workspace_improvements.sql
-- Workspace schema additions to support SSO binding and member display names.

ALTER TABLE workspace.workspaces
  ADD COLUMN IF NOT EXISTS identity_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS sso_domain TEXT;

ALTER TABLE workspace.members
  ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
