-- Migration 067: Knowledge Base & RAG Platform
-- Phase 82

CREATE TABLE IF NOT EXISTS brain.documents (
  id              TEXT PRIMARY KEY,
  personality_id  TEXT REFERENCES soul.personalities(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  filename        TEXT,
  format          TEXT CHECK (format IN ('pdf','html','md','txt','url')),
  source_url      TEXT,
  visibility      TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','error')),
  chunk_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brain_documents_personality ON brain.documents (personality_id);
CREATE INDEX IF NOT EXISTS idx_brain_documents_visibility  ON brain.documents (visibility);
CREATE INDEX IF NOT EXISTS idx_brain_documents_status      ON brain.documents (status);

CREATE TABLE IF NOT EXISTS brain.knowledge_query_log (
  id              TEXT PRIMARY KEY,
  personality_id  TEXT,
  query_text      TEXT NOT NULL,
  results_count   INTEGER NOT NULL DEFAULT 0,
  top_score       REAL,
  queried_at      BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kql_personality  ON brain.knowledge_query_log (personality_id);
CREATE INDEX IF NOT EXISTS idx_kql_queried_at   ON brain.knowledge_query_log (queried_at DESC);
