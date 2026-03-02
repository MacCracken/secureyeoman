-- Phase 99: Conversation Branching & Replay
-- Adds branch lineage to conversations, replay jobs, and replay results.

-- Add branch lineage to conversations
ALTER TABLE chat.conversations
  ADD COLUMN IF NOT EXISTS parent_conversation_id TEXT
    REFERENCES chat.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fork_message_index INTEGER,
  ADD COLUMN IF NOT EXISTS branch_label TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_parent
  ON chat.conversations(parent_conversation_id);

-- Replay jobs (async for batch + single replays)
CREATE TABLE IF NOT EXISTS chat.replay_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed')),
  source_conversation_ids TEXT[] NOT NULL,
  replay_model TEXT NOT NULL,
  replay_provider TEXT NOT NULL,
  replay_personality_id TEXT,
  total_conversations INT NOT NULL DEFAULT 0,
  completed_conversations INT NOT NULL DEFAULT 0,
  failed_conversations INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Per-conversation replay results with pairwise comparison
CREATE TABLE IF NOT EXISTS chat.replay_results (
  id TEXT PRIMARY KEY,
  replay_job_id TEXT NOT NULL REFERENCES chat.replay_jobs(id) ON DELETE CASCADE,
  source_conversation_id TEXT NOT NULL,
  replay_conversation_id TEXT NOT NULL
    REFERENCES chat.conversations(id) ON DELETE CASCADE,
  source_model TEXT,
  replay_model TEXT NOT NULL,
  source_quality_score REAL,
  replay_quality_score REAL,
  pairwise_winner TEXT CHECK (pairwise_winner IN ('source','replay','tie')),
  pairwise_reason TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_replay_results_job ON chat.replay_results(replay_job_id);
