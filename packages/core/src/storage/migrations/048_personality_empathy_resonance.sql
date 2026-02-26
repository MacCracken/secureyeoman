-- Migration 048: Add empathy_resonance column to personalities
-- Controls how strongly the personality mirrors the user's emotional register.
ALTER TABLE soul.personalities
  ADD COLUMN IF NOT EXISTS empathy_resonance BOOLEAN NOT NULL DEFAULT FALSE;
