--
-- 004_optimistic_locking.sql — Add version column for optimistic locking on
-- personalities and skills tables (Phase: dashboard conflict detection).
--
-- Existing rows default to version 1. Every successful UPDATE increments the
-- version; the storage layer uses WHERE version = $expected to detect stale
-- writes and return 409 Conflict to the caller.
--

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'soul' AND table_name = 'personalities' AND column_name = 'version'
  ) THEN
    ALTER TABLE soul.personalities ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'soul' AND table_name = 'skills' AND column_name = 'version'
  ) THEN
    ALTER TABLE soul.skills ADD COLUMN version integer NOT NULL DEFAULT 1;
  END IF;
END $$;
