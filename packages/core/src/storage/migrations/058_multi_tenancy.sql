-- Part 1: Tenant registry
CREATE TABLE IF NOT EXISTS auth.tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

INSERT INTO auth.tenants (id, name, slug, plan, created_at, updated_at)
VALUES (
  'default',
  'Default',
  'default',
  'enterprise',
  EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
)
ON CONFLICT DO NOTHING;

-- Part 2: Add tenant_id columns to user-data tables
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE auth.api_keys ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE audit.entries ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE brain.memories ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE soul.personalities ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE chat.conversations ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE task.tasks ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);
ALTER TABLE workspace.workspaces ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES auth.tenants(id);

-- Indexes for tenant_id lookup
CREATE INDEX IF NOT EXISTS idx_users_tenant ON auth.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_entries_tenant ON audit.entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brain_memories_tenant ON brain.memories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_brain_knowledge_tenant ON brain.knowledge(tenant_id);
CREATE INDEX IF NOT EXISTS idx_soul_personalities_tenant ON soul.personalities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_tenant ON chat.conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_task_tasks_tenant ON task.tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workspace_workspaces_tenant ON workspace.workspaces(tenant_id);
