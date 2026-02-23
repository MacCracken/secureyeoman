-- Migration 038: Pending Approvals queue for human-in-the-loop AI action review
--
-- Stores AI-initiated tool calls that require human approval before execution.
-- Populated by creation-tool-executor when automationLevel is full_manual or semi_auto.

CREATE TABLE IF NOT EXISTS soul.pending_approvals (
  id          TEXT        PRIMARY KEY,
  personality_id TEXT     NOT NULL,
  tool_name   TEXT        NOT NULL,
  tool_args   JSONB       NOT NULL DEFAULT '{}',
  status      TEXT        NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  created_at  BIGINT      NOT NULL,
  resolved_at BIGINT,
  resolved_by TEXT        -- 'human' or user identifier
);

CREATE INDEX IF NOT EXISTS pending_approvals_personality_status
  ON soul.pending_approvals (personality_id, status);
