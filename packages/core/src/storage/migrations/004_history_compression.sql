-- 004_history_compression.sql
-- Progressive history compression tables for tiered conversation context.

CREATE SCHEMA IF NOT EXISTS chat;

CREATE TABLE IF NOT EXISTS chat.conversation_history (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('message', 'topic', 'bulk')),
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  sealed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_conv_history_conversation_tier_seq
  ON chat.conversation_history (conversation_id, tier, sequence);

CREATE INDEX IF NOT EXISTS idx_conv_history_conversation_id
  ON chat.conversation_history (conversation_id);
