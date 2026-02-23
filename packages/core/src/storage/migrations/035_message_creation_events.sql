-- 035_message_creation_events.sql
-- Persists AI creation events (skill/task/personality created) on assistant messages
-- so sparkle indicators survive conversation reload.

ALTER TABLE chat.messages
  ADD COLUMN IF NOT EXISTS creation_events_json JSONB DEFAULT NULL;
