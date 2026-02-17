-- 003_vector_memory.sql
-- Add vector embedding support to brain tables for semantic search.
-- Requires pgvector extension. Skips gracefully if pgvector is not installed.

DO $$
BEGIN
  -- Only attempt to create the extension if it's available in the system
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;

    ALTER TABLE brain.memories ADD COLUMN IF NOT EXISTS embedding vector(384);
    ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS embedding vector(384);

    -- HNSW indexes for fast cosine similarity search
    CREATE INDEX IF NOT EXISTS idx_memories_embedding
      ON brain.memories USING hnsw (embedding vector_cosine_ops);

    CREATE INDEX IF NOT EXISTS idx_knowledge_embedding
      ON brain.knowledge USING hnsw (embedding vector_cosine_ops);

    RAISE NOTICE 'pgvector extension enabled and vector columns created';
  ELSE
    RAISE NOTICE 'pgvector extension not available — skipping vector memory columns. Install pgvector to enable semantic search.';
  END IF;
END
$$;
