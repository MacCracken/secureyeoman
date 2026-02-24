-- 039_message_thinking_tools.sql
-- Persist thinking content and tool-call trace on assistant messages
-- so both survive conversation reload.

ALTER TABLE chat.messages
  ADD COLUMN IF NOT EXISTS thinking_content TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tool_calls_json JSONB DEFAULT NULL;
