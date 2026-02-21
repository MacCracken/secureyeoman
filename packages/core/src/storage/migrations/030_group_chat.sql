-- Migration 030: Group Chat View support
-- Adds personality_id tracking to the messages table and a pins table
-- for the Group Chat View feature (ADR 086).

-- Track which personality handled each integration message
ALTER TABLE integration.messages ADD COLUMN IF NOT EXISTS personality_id TEXT;

-- Composite index for channel listing (integrationId + chatId grouping)
CREATE INDEX IF NOT EXISTS idx_messages_channel
  ON integration.messages (integration_id, chat_id, timestamp DESC);

-- Index for personality-scoped queries in Group Chat
CREATE INDEX IF NOT EXISTS idx_messages_personality
  ON integration.messages (personality_id, timestamp DESC)
  WHERE personality_id IS NOT NULL;

-- Pinned messages in a group chat channel
CREATE TABLE IF NOT EXISTS integration.group_chat_pins (
  id             TEXT    PRIMARY KEY,
  integration_id TEXT    NOT NULL REFERENCES integration.integrations(id) ON DELETE CASCADE,
  chat_id        TEXT    NOT NULL,
  message_id     TEXT    NOT NULL,
  pinned_by      TEXT    NOT NULL,  -- auth user id
  note           TEXT,
  created_at     BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_group_chat_pins_channel
  ON integration.group_chat_pins (integration_id, chat_id);
