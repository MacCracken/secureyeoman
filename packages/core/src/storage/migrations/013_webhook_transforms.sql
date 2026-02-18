-- Migration 013 — Webhook Transformation Rules
-- Stores per-integration (or global) JSONPath extraction rules
-- that reshape inbound webhook payloads before they are normalized.

CREATE TABLE IF NOT EXISTS webhook_transform_rules (
  id            TEXT    PRIMARY KEY,
  integration_id TEXT,                        -- NULL = applies to all webhook integrations
  name          TEXT    NOT NULL,
  match_event   TEXT,                          -- NULL = match all events; header-based filter
  priority      INTEGER NOT NULL DEFAULT 100,  -- lower number = applied first
  enabled       BOOLEAN NOT NULL DEFAULT true,
  extract_rules JSONB   NOT NULL DEFAULT '[]'::jsonb,  -- array of ExtractRule objects
  template      TEXT,                          -- optional {{field}} template for text output
  created_at    BIGINT  NOT NULL,
  updated_at    BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS webhook_transforms_integration
  ON webhook_transform_rules (integration_id);

CREATE INDEX IF NOT EXISTS webhook_transforms_priority
  ON webhook_transform_rules (priority, enabled);
