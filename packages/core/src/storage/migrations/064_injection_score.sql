-- Migration 064: Add injection_score column to chat.messages
-- Stores the weighted injection risk score [0.0, 1.0] computed by InputValidator
-- on user-role messages. NULL for assistant messages and pre-migration rows.

ALTER TABLE chat.messages
  ADD COLUMN IF NOT EXISTS injection_score REAL;

COMMENT ON COLUMN chat.messages.injection_score IS
  'Weighted injection risk score [0.0, 1.0] from InputValidator. NULL for assistant messages.';
