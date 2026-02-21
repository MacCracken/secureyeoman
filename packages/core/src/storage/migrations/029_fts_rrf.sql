-- 029_fts_rrf.sql
-- Hybrid full-text search (FTS) + pgvector with Reciprocal Rank Fusion.
--
-- Adds a `search_vec tsvector` column to brain.memories and brain.knowledge.
-- A GIN index enables efficient tsvector @@ to_tsquery lookups. Values are
-- populated lazily on first UPDATE or via an explicit backfill UPDATE; existing
-- rows with NULL search_vec degrade gracefully to pure vector search.
--
-- The tsvector is generated from `content` using the 'english' text-search
-- configuration. Stored rather than generated (GENERATED ALWAYS … STORED) for
-- maximum compatibility with older PostgreSQL versions.

ALTER TABLE brain.memories  ADD COLUMN IF NOT EXISTS search_vec tsvector;
ALTER TABLE brain.knowledge ADD COLUMN IF NOT EXISTS search_vec tsvector;

-- GIN indexes for fast FTS
CREATE INDEX IF NOT EXISTS idx_memories_fts  ON brain.memories  USING gin (search_vec);
CREATE INDEX IF NOT EXISTS idx_knowledge_fts ON brain.knowledge USING gin (search_vec);

-- Backfill existing rows
UPDATE brain.memories  SET search_vec = to_tsvector('english', content)
  WHERE search_vec IS NULL;

UPDATE brain.knowledge SET search_vec = to_tsvector('english', content || ' ' || topic)
  WHERE search_vec IS NULL;

-- Triggers to keep search_vec current on INSERT / UPDATE
CREATE OR REPLACE FUNCTION brain.update_memory_fts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vec := to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_memory_fts ON brain.memories;
CREATE TRIGGER trg_memory_fts
  BEFORE INSERT OR UPDATE OF content ON brain.memories
  FOR EACH ROW EXECUTE FUNCTION brain.update_memory_fts();

CREATE OR REPLACE FUNCTION brain.update_knowledge_fts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vec := to_tsvector('english', NEW.content || ' ' || NEW.topic);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_fts ON brain.knowledge;
CREATE TRIGGER trg_knowledge_fts
  BEFORE INSERT OR UPDATE OF content, topic ON brain.knowledge
  FOR EACH ROW EXECUTE FUNCTION brain.update_knowledge_fts();
