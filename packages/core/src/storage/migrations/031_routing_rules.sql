-- Migration 031: Cross-Integration Routing Rules (ADR 087)
-- Rules evaluate inbound messages and trigger forwarding, personality
-- overrides, or webhook notifications based on configurable conditions.

CREATE TABLE IF NOT EXISTS routing_rules (
  id                         TEXT    PRIMARY KEY,

  -- Metadata
  name                       TEXT    NOT NULL,
  description                TEXT    NOT NULL DEFAULT '',
  enabled                    BOOLEAN NOT NULL DEFAULT true,
  priority                   INTEGER NOT NULL DEFAULT 100,

  -- Trigger conditions (all non-null conditions must match; NULL = wildcard)
  trigger_platforms          JSONB   NOT NULL DEFAULT '[]',  -- [] = all platforms
  trigger_integration_ids    JSONB   NOT NULL DEFAULT '[]',  -- [] = all integrations
  trigger_chat_id_pattern    TEXT,    -- regex, null = any chat
  trigger_sender_id_pattern  TEXT,    -- regex, null = any sender
  trigger_keyword_pattern    TEXT,    -- keyword or regex, null = any text
  trigger_direction          TEXT    NOT NULL DEFAULT 'inbound',

  -- Action
  action_type                TEXT    NOT NULL,
  -- 'forward'   → forward the message to another integration/chat
  -- 'reply'     → send a reply via a different integration
  -- 'personality' → override the active personality for this message thread
  -- 'notify'    → POST the message payload to a webhook URL
  action_target_integration_id TEXT,  -- for forward/reply actions
  action_target_chat_id        TEXT,  -- for forward action (target channel)
  action_personality_id        TEXT,  -- for personality action
  action_webhook_url           TEXT,  -- for notify action
  action_message_template      TEXT,  -- optional Mustache template: {{text}}, {{senderName}}, {{platform}}

  -- Stats
  match_count                INTEGER NOT NULL DEFAULT 0,
  last_matched_at            BIGINT,

  created_at                 BIGINT  NOT NULL,
  updated_at                 BIGINT  NOT NULL
);

-- Evaluation order index
CREATE INDEX IF NOT EXISTS idx_routing_rules_priority
  ON routing_rules (priority ASC, enabled DESC);
