-- Migration 056: Per-user notification preferences
-- Phase 55 — Notifications & Integrations
--
-- Each row describes one external delivery channel for a given user.
-- Fan-out in NotificationManager will iterate all enabled rows and call
-- the appropriate IntegrationManager adapter.

CREATE TABLE IF NOT EXISTS auth.user_notification_prefs (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL CHECK (channel IN ('slack','telegram','discord','email')),
  integration_id    TEXT,          -- null → first running adapter of that platform
  chat_id           TEXT NOT NULL, -- Slack channel ID, Telegram chat ID, or email address
  enabled           BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start INT CHECK (quiet_hours_start BETWEEN 0 AND 23),
  quiet_hours_end   INT CHECK (quiet_hours_end   BETWEEN 0 AND 23),
  min_level         TEXT NOT NULL DEFAULT 'info'
                    CHECK (min_level IN ('info','warn','error','critical')),
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL,
  UNIQUE (user_id, channel, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user ON auth.user_notification_prefs(user_id);
