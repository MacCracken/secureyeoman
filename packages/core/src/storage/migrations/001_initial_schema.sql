-- 001_initial_schema.sql
-- Full PostgreSQL schema for Friday, replacing 16 separate SQLite databases.

-- ─── Brain ────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS brain;

CREATE TABLE IF NOT EXISTS brain.memories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('episodic','semantic','procedural','preference')),
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}',
  importance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at BIGINT,
  expires_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON brain.memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON brain.memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_type_importance ON brain.memories(type, importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_expires ON brain.memories(expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS brain.knowledge (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  supersedes TEXT REFERENCES brain.knowledge(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON brain.knowledge(topic);

CREATE TABLE IF NOT EXISTS brain.skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  tools JSONB NOT NULL DEFAULT '[]',
  trigger_patterns JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS brain.meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ─── Spirit ───────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS spirit;

CREATE TABLE IF NOT EXISTS spirit.passions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  intensity DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS spirit.inspirations (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  impact DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS spirit.pains (
  id TEXT PRIMARY KEY,
  trigger_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS spirit.meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ─── Soul ─────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS soul;

CREATE TABLE IF NOT EXISTS soul.meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS soul.personalities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  traits JSONB NOT NULL DEFAULT '{}',
  sex TEXT NOT NULL DEFAULT 'unspecified',
  voice TEXT NOT NULL DEFAULT '',
  preferred_language TEXT NOT NULL DEFAULT '',
  default_model JSONB,
  include_archetypes BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT false,
  body JSONB NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS soul.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  relationship TEXT NOT NULL DEFAULT 'user',
  preferences JSONB NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS soul.skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  tools JSONB NOT NULL DEFAULT '[]',
  trigger_patterns JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ─── Auth ─────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.revoked_tokens (
  jti TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  revoked_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  role TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT,
  revoked_at BIGINT,
  last_used_at BIGINT
);

-- ─── Audit ────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.entries (
  id TEXT PRIMARY KEY,
  correlation_id TEXT,
  event TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id TEXT,
  task_id TEXT,
  metadata JSONB,
  timestamp BIGINT NOT NULL,
  integrity_version TEXT NOT NULL,
  integrity_signature TEXT NOT NULL,
  integrity_previous_hash TEXT NOT NULL,
  search_vector TSVECTOR
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit.entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_level ON audit.entries(level);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit.entries(event);
CREATE INDEX IF NOT EXISTS idx_audit_task_id ON audit.entries(task_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation_id ON audit.entries(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit.entries(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_search_vector ON audit.entries USING GIN(search_vector);

-- Trigger to auto-populate tsvector on insert/update
CREATE OR REPLACE FUNCTION audit.update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.event, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.message, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.metadata::text, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_search_vector ON audit.entries;
CREATE TRIGGER trg_audit_search_vector
  BEFORE INSERT OR UPDATE ON audit.entries
  FOR EACH ROW EXECUTE FUNCTION audit.update_search_vector();

-- ─── Chat ─────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS chat;

CREATE TABLE IF NOT EXISTS chat.conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  personality_id TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON chat.conversations(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  tokens_used INTEGER,
  attachments_json JSONB NOT NULL DEFAULT '[]',
  brain_context_json JSONB,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON chat.messages(conversation_id, created_at ASC);

-- ─── Task ─────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS task;

CREATE TABLE IF NOT EXISTS task.tasks (
  id TEXT PRIMARY KEY,
  correlation_id TEXT,
  parent_task_id TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json JSONB,
  resources_json JSONB,
  security_context_json JSONB NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 300000,
  created_at BIGINT NOT NULL,
  started_at BIGINT,
  completed_at BIGINT,
  duration_ms BIGINT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON task.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON task.tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON task.tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_correlation_id ON task.tasks(correlation_id);

-- ─── Integration ──────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS integration;

CREATE TABLE IF NOT EXISTS integration.integrations (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'disconnected',
  config JSONB NOT NULL DEFAULT '{}',
  connected_at BIGINT,
  last_message_at BIGINT,
  message_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS integration.messages (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integration.integrations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  direction TEXT NOT NULL,
  sender_id TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  chat_id TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]',
  reply_to_message_id TEXT,
  platform_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  timestamp BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_int_messages_integration ON integration.messages(integration_id);
CREATE INDEX IF NOT EXISTS idx_int_messages_timestamp ON integration.messages(timestamp);

-- ─── MCP ──────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS mcp;

CREATE TABLE IF NOT EXISTS mcp.servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  transport TEXT DEFAULT 'stdio',
  command TEXT,
  args JSONB DEFAULT '[]',
  url TEXT,
  env JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp.server_tools (
  server_id TEXT NOT NULL REFERENCES mcp.servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  input_schema JSONB DEFAULT '{}',
  PRIMARY KEY (server_id, name)
);

CREATE TABLE IF NOT EXISTS mcp.config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ─── Marketplace ──────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS marketplace;

CREATE TABLE IF NOT EXISTS marketplace.skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  version TEXT DEFAULT '1.0.0',
  author TEXT DEFAULT '',
  category TEXT DEFAULT 'general',
  tags JSONB DEFAULT '[]',
  download_count INTEGER DEFAULT 0,
  rating DOUBLE PRECISION DEFAULT 0,
  instructions TEXT DEFAULT '',
  tools JSONB DEFAULT '[]',
  installed BOOLEAN DEFAULT false,
  published_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ─── Dashboard ────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS dashboard;

CREATE TABLE IF NOT EXISTS dashboard.custom_dashboards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  widgets JSONB DEFAULT '[]',
  is_default BOOLEAN DEFAULT false,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ─── Workspace ────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS workspace;

CREATE TABLE IF NOT EXISTS workspace.workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  settings JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace.members (
  workspace_id TEXT NOT NULL REFERENCES workspace.workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

-- ─── Experiment ───────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS experiment;

CREATE TABLE IF NOT EXISTS experiment.experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  variants JSONB DEFAULT '[]',
  results JSONB DEFAULT '[]',
  started_at BIGINT,
  completed_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- ─── Comms ────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS comms;

CREATE TABLE IF NOT EXISTS comms.peers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL,
  signing_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]',
  last_seen_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS comms.message_log (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK(direction IN ('sent','received')),
  peer_agent_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  timestamp BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comms_message_peer ON comms.message_log(peer_agent_id);
CREATE INDEX IF NOT EXISTS idx_comms_message_time ON comms.message_log(timestamp DESC);

-- ─── Rotation ─────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS rotation;

CREATE TABLE IF NOT EXISTS rotation.secret_metadata (
  name TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  expires_at BIGINT,
  rotated_at BIGINT,
  rotation_interval_days INTEGER,
  auto_rotate BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'external',
  category TEXT NOT NULL DEFAULT 'encryption'
);

CREATE TABLE IF NOT EXISTS rotation.previous_values (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  stored_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

-- ─── RBAC ─────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS rbac;

CREATE TABLE IF NOT EXISTS rbac.role_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  permissions_json JSONB NOT NULL,
  inherit_from_json JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);

CREATE TABLE IF NOT EXISTS rbac.user_role_assignments (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at BIGINT NOT NULL,
  revoked_at BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_role
  ON rbac.user_role_assignments (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_role_user_id
  ON rbac.user_role_assignments (user_id);

CREATE INDEX IF NOT EXISTS idx_user_role_role_id
  ON rbac.user_role_assignments (role_id);
