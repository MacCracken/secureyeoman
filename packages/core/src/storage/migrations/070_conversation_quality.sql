-- Migration 070: conversation quality scoring table (Phase 92)
--
-- Stores per-conversation quality scores used to weight distillation
-- sampling (failure-first / success-first / curriculum ordering).

CREATE TABLE IF NOT EXISTS training.conversation_quality (
  conversation_id TEXT PRIMARY KEY,
  quality_score   REAL        NOT NULL DEFAULT 0.5,
  signal_source   TEXT        NOT NULL DEFAULT 'auto',
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Low score = higher priority in failure-first mode
CREATE INDEX IF NOT EXISTS idx_conv_quality_score
  ON training.conversation_quality (quality_score ASC);
