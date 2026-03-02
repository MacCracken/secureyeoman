-- Migration 074: Conversation Analytics (Phase 96)
--
-- Creates the analytics schema with tables for sentiment tracking,
-- conversation summarization, entity extraction, key phrases,
-- and usage anomaly detection.

CREATE SCHEMA IF NOT EXISTS analytics;

-- Per-message sentiment classification
CREATE TABLE IF NOT EXISTS analytics.turn_sentiments (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id  TEXT        NOT NULL,
  message_id       TEXT        NOT NULL,
  personality_id   TEXT,
  sentiment        TEXT        NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  score            REAL        NOT NULL,
  analyzed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id)
);

CREATE INDEX IF NOT EXISTS idx_turn_sentiments_conversation
  ON analytics.turn_sentiments (conversation_id);
CREATE INDEX IF NOT EXISTS idx_turn_sentiments_personality_time
  ON analytics.turn_sentiments (personality_id, analyzed_at DESC);

-- Conversation-level summaries
CREATE TABLE IF NOT EXISTS analytics.conversation_summaries (
  conversation_id  TEXT        PRIMARY KEY,
  personality_id   TEXT,
  summary          TEXT        NOT NULL,
  message_count    INT         NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Extracted entities per conversation
CREATE TABLE IF NOT EXISTS analytics.conversation_entities (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id  TEXT        NOT NULL,
  personality_id   TEXT,
  entity_type      TEXT        NOT NULL,
  entity_value     TEXT        NOT NULL,
  mention_count    INT         NOT NULL DEFAULT 1,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_entities_conversation
  ON analytics.conversation_entities (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_entities_type_value
  ON analytics.conversation_entities (entity_type, entity_value);
CREATE INDEX IF NOT EXISTS idx_conv_entities_personality
  ON analytics.conversation_entities (personality_id);

-- Key phrases with windowed frequency
CREATE TABLE IF NOT EXISTS analytics.key_phrases (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  personality_id   TEXT        NOT NULL,
  phrase           TEXT        NOT NULL,
  frequency        INT         NOT NULL DEFAULT 1,
  window_start     TIMESTAMPTZ NOT NULL,
  window_end       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(personality_id, phrase, window_start)
);

CREATE INDEX IF NOT EXISTS idx_key_phrases_personality_freq
  ON analytics.key_phrases (personality_id, frequency DESC);

-- Usage anomaly alerts
CREATE TABLE IF NOT EXISTS analytics.usage_anomalies (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  anomaly_type     TEXT        NOT NULL,
  personality_id   TEXT,
  user_id          TEXT,
  severity         TEXT        NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details          JSONB       NOT NULL DEFAULT '{}',
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_anomalies_type_time
  ON analytics.usage_anomalies (anomaly_type, detected_at DESC);
