-- Migration 009: Add full-text search indexes on brain.memories and brain.knowledge
--
-- These tables are queried via ILIKE patterns in queryMemories() and queryKnowledge(),
-- which causes full table scans.  GIN indexes on tsvector enable efficient FTS.

CREATE INDEX IF NOT EXISTS idx_memories_content_fts
  ON brain.memories USING gin(to_tsvector('english', content));

CREATE INDEX IF NOT EXISTS idx_knowledge_content_fts
  ON brain.knowledge USING gin(to_tsvector('english', content));
