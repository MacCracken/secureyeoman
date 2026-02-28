-- 062: Indexes for audit log dashboard queries and brain memory recall hot paths
--
-- audit.entries: dashboard audit log queries filter + sort by created_at; the personality/event
--   compound index supports per-personality event filtering in the security audit view.
--
-- brain.memories: recall queries filter by personality_id and sort by recency; without an index
--   on (personality_id, created_at) these scans the full memories table on every chat turn.

CREATE INDEX IF NOT EXISTS idx_audit_entries_created_at
  ON audit.entries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entries_personality_event
  ON audit.entries (personality_id, event, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_memories_personality_created
  ON brain.memories (personality_id, created_at DESC);
