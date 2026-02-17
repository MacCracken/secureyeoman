-- Migration 007: Sandboxed Code Execution (Phase 6.4b)
-- Creates the execution schema with sessions, history, and approvals tables.

CREATE SCHEMA IF NOT EXISTS execution;

-- Execution sessions
CREATE TABLE IF NOT EXISTS execution.sessions (
  id            TEXT PRIMARY KEY,
  runtime       TEXT NOT NULL CHECK (runtime IN ('node', 'python', 'shell')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'expired', 'terminated')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_sessions_status ON execution.sessions(status);

-- Execution history
CREATE TABLE IF NOT EXISTS execution.history (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES execution.sessions(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  exit_code  INTEGER NOT NULL DEFAULT 0,
  stdout     TEXT NOT NULL DEFAULT '',
  stderr     TEXT NOT NULL DEFAULT '',
  duration   INTEGER NOT NULL DEFAULT 0,
  truncated  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_history_session ON execution.history(session_id);
CREATE INDEX IF NOT EXISTS idx_exec_history_created ON execution.history(created_at DESC);

-- Execution approvals
CREATE TABLE IF NOT EXISTS execution.approvals (
  id           TEXT PRIMARY KEY,
  request_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exec_approvals_status ON execution.approvals(status);
