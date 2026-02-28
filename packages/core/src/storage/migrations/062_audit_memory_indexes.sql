-- 062: Indexes for audit log dashboard queries and brain memory recall hot paths
--
-- audit.entries: dashboard audit log queries filter + sort by timestamp (the epoch column);
--   the event+timestamp compound index supports per-event filtering in the security audit view.
--   NOTE: audit.entries uses "timestamp" (bigint epoch), not "created_at".
--
-- brain.memories: recall queries filter by personality_id and sort by recency; without an index
--   on (personality_id, created_at) these scan the full memories table on every chat turn.

CREATE INDEX IF NOT EXISTS idx_audit_entries_timestamp
  ON audit.entries ("timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_audit_entries_event_timestamp
  ON audit.entries (event, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_brain_memories_personality_created
  ON brain.memories (personality_id, created_at DESC);
