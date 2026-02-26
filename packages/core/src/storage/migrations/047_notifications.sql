-- Migration 047: Notifications
-- Persistent in-app notification model for Phase 51 Real-Time Infrastructure.
-- Stores server-generated alerts (heartbeat, security, task events) and
-- tracks per-notification read state server-side.

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'critical')),
  source      TEXT,
  metadata    JSONB,
  read_at     BIGINT,
  created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_read_at_idx    ON notifications (read_at) WHERE read_at IS NULL;
