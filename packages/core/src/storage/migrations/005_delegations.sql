-- Migration 005: Sub-Agent Delegation (Phase 6.3)
-- Creates the agents schema with profiles, delegations, and delegation_messages tables.

CREATE SCHEMA IF NOT EXISTS agents;

-- Agent profiles define specialized personas for sub-agents
CREATE TABLE IF NOT EXISTS agents.profiles (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  max_token_budget INTEGER NOT NULL DEFAULT 50000,
  allowed_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_model TEXT,
  is_builtin    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Delegations track each sub-agent execution
CREATE TABLE IF NOT EXISTS agents.delegations (
  id                    TEXT PRIMARY KEY,
  parent_delegation_id  TEXT REFERENCES agents.delegations(id) ON DELETE SET NULL,
  profile_id            TEXT NOT NULL REFERENCES agents.profiles(id) ON DELETE RESTRICT,
  task                  TEXT NOT NULL,
  context               TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')),
  result                TEXT,
  error                 TEXT,
  depth                 INTEGER NOT NULL DEFAULT 0,
  max_depth             INTEGER NOT NULL DEFAULT 3,
  token_budget          INTEGER NOT NULL DEFAULT 50000,
  tokens_used_prompt    INTEGER NOT NULL DEFAULT 0,
  tokens_used_completion INTEGER NOT NULL DEFAULT 0,
  timeout_ms            INTEGER NOT NULL DEFAULT 300000,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  initiated_by          TEXT,
  correlation_id        TEXT
);

CREATE INDEX IF NOT EXISTS idx_delegations_status ON agents.delegations(status);
CREATE INDEX IF NOT EXISTS idx_delegations_parent ON agents.delegations(parent_delegation_id);
CREATE INDEX IF NOT EXISTS idx_delegations_profile ON agents.delegations(profile_id);
CREATE INDEX IF NOT EXISTS idx_delegations_created ON agents.delegations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_delegations_correlation ON agents.delegations(correlation_id) WHERE correlation_id IS NOT NULL;

-- Delegation messages store the sealed conversation for each delegation
CREATE TABLE IF NOT EXISTS agents.delegation_messages (
  id            TEXT PRIMARY KEY,
  delegation_id TEXT NOT NULL REFERENCES agents.delegations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content       TEXT,
  tool_calls    JSONB,
  tool_result   JSONB,
  token_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delegation_messages_delegation ON agents.delegation_messages(delegation_id, created_at);
