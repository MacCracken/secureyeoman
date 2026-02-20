-- 028_heartbeat_log.sql
-- Per-check execution log for heartbeat audit trail.
-- Persists status, message, and duration after every executeCheck() call so operators
-- can audit past runs, diagnose recurring failures, and see last-result status in the dashboard.

CREATE SCHEMA IF NOT EXISTS proactive;

CREATE TABLE IF NOT EXISTS proactive.heartbeat_log (
  id            TEXT    PRIMARY KEY,
  check_name    TEXT    NOT NULL,
  personality_id TEXT,
  ran_at        BIGINT  NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('ok', 'warning', 'error')),
  message       TEXT    NOT NULL,
  duration_ms   INTEGER NOT NULL,
  error_detail  TEXT
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_log_check_name ON proactive.heartbeat_log (check_name);
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_ran_at     ON proactive.heartbeat_log (ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_heartbeat_log_status     ON proactive.heartbeat_log (status);
