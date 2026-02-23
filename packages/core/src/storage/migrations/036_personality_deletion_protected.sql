-- Migration 036: Add deletion_protected flag to personalities
--
-- Allows a personality to be marked as protected from deletion, preventing
-- both human operators and AI tool calls from accidentally removing it.
-- The flag is checked in SoulManager.deletePersonality() before any delete
-- is attempted, returning a clear error when protection is active.

ALTER TABLE soul.personalities
  ADD COLUMN IF NOT EXISTS deletion_protected BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN soul.personalities.deletion_protected IS
  'When true, deletion via any path (UI, API, AI tool) is blocked until the flag is cleared.';
