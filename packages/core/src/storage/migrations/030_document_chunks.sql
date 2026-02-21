-- 030_document_chunks.sql
-- Document chunk storage for content-chunked workspace indexing.
--
-- Large documents stored in brain.memories and brain.knowledge are now also
-- split into overlapping ~800-token chunks. Each chunk carries its own FTS
-- vector and (optionally) a pgvector embedding so hybrid RRF search operates
-- over fine-grained segments rather than entire documents.
--
-- source_table is either 'memories' or 'knowledge'.
-- chunk_index is 0-based within a document.

CREATE TABLE IF NOT EXISTS brain.document_chunks (
  id           TEXT    PRIMARY KEY,
  source_id    TEXT    NOT NULL,
  source_table TEXT    NOT NULL CHECK (source_table IN ('memories', 'knowledge')),
  chunk_index  INTEGER NOT NULL,
  content      TEXT    NOT NULL,
  search_vec   tsvector,
  created_at   BIGINT  NOT NULL
);

-- Add optional vector embedding column (guarded by pgvector availability)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    ALTER TABLE brain.document_chunks
      ADD COLUMN IF NOT EXISTS embedding vector(384);

    CREATE INDEX IF NOT EXISTS idx_chunks_embedding
      ON brain.document_chunks USING hnsw (embedding vector_cosine_ops);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_chunks_source   ON brain.document_chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_fts      ON brain.document_chunks USING gin (search_vec);
CREATE INDEX IF NOT EXISTS idx_chunks_source_table ON brain.document_chunks (source_table);

-- FTS trigger for chunks
CREATE OR REPLACE FUNCTION brain.update_chunk_fts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vec := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chunk_fts ON brain.document_chunks;
CREATE TRIGGER trg_chunk_fts
  BEFORE INSERT OR UPDATE OF content ON brain.document_chunks
  FOR EACH ROW EXECUTE FUNCTION brain.update_chunk_fts();
