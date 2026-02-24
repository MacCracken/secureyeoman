-- Phase 48: Machine Readable Organizational Intent
-- Adds org_intents and intent_enforcement_log tables.

CREATE TABLE IF NOT EXISTS org_intents (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  api_version TEXT        NOT NULL DEFAULT 'v1',
  doc         JSONB       NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  BIGINT      NOT NULL,
  updated_at  BIGINT      NOT NULL
);

-- Only one intent may be active at a time.
-- This partial unique index enforces that constraint.
CREATE UNIQUE INDEX IF NOT EXISTS org_intents_one_active
  ON org_intents (is_active)
  WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS intent_enforcement_log (
  id               TEXT    PRIMARY KEY,
  event_type       TEXT    NOT NULL,
  item_id          TEXT,
  rule             TEXT    NOT NULL,
  rationale        TEXT,
  action_attempted TEXT,
  agent_id         TEXT,
  session_id       TEXT,
  personality_id   TEXT,
  metadata         JSONB,
  created_at       BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS intent_enforcement_log_event_type
  ON intent_enforcement_log (event_type);

CREATE INDEX IF NOT EXISTS intent_enforcement_log_agent_id
  ON intent_enforcement_log (agent_id);

CREATE INDEX IF NOT EXISTS intent_enforcement_log_created_at
  ON intent_enforcement_log (created_at DESC);
