-- Migration 029: Collaborative document state storage
-- Stores the encoded Y.Doc state for each docId so that collab sessions
-- survive server restarts and new clients can converge from a known base.

CREATE TABLE IF NOT EXISTS soul.collab_docs (
  doc_id     TEXT    PRIMARY KEY,
  state      BYTEA   NOT NULL,
  updated_at BIGINT  NOT NULL
);
