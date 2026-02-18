-- Migration 014 — Outbound Webhooks
-- Stores outbound webhook subscriptions.  When integration events occur
-- (message received, integration started/stopped, etc.) SecureYeoman
-- fires an HTTP POST to each matching, enabled webhook URL.

CREATE TABLE IF NOT EXISTS outbound_webhooks (
  id                   TEXT    PRIMARY KEY,
  name                 TEXT    NOT NULL,
  url                  TEXT    NOT NULL,
  secret               TEXT,                              -- optional HMAC-SHA256 signing secret
  events               JSONB   NOT NULL DEFAULT '[]'::jsonb, -- array of subscribed event strings
  enabled              BOOLEAN NOT NULL DEFAULT true,
  last_fired_at        BIGINT,                            -- Unix ms of last successful delivery
  last_status_code     INTEGER,                           -- HTTP status from last delivery attempt
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at           BIGINT  NOT NULL,
  updated_at           BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS outbound_webhooks_enabled
  ON outbound_webhooks (enabled);
