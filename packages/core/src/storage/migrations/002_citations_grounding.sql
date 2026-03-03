-- Phase 110: Inline Citations & Grounding
-- Adds source attribution, groundedness scoring, and citation feedback.

-- Document provenance scoring (8-dimension quality evaluation)
ALTER TABLE brain.documents ADD COLUMN IF NOT EXISTS source_quality JSONB;
ALTER TABLE brain.documents ADD COLUMN IF NOT EXISTS trust_score REAL DEFAULT 0.5;

-- Citation metadata on messages
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS citations_json JSONB;
ALTER TABLE chat.messages ADD COLUMN IF NOT EXISTS grounding_score REAL;

-- Index for low-grounding queries / analytics
CREATE INDEX IF NOT EXISTS idx_messages_grounding_score
  ON chat.messages (grounding_score ASC)
  WHERE grounding_score IS NOT NULL;

-- Citation relevance feedback
CREATE TABLE IF NOT EXISTS chat.citation_feedback (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
  citation_index INTEGER NOT NULL,
  source_id   TEXT NOT NULL,
  relevant    BOOLEAN NOT NULL,
  created_at  BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

CREATE INDEX IF NOT EXISTS idx_citation_feedback_message
  ON chat.citation_feedback (message_id);

CREATE INDEX IF NOT EXISTS idx_citation_feedback_source
  ON chat.citation_feedback (source_id);
