-- Migration 054: Personality Avatar URL
-- Adds avatar_url column to soul.personalities for storing the path to the
-- personality's uploaded avatar image.

ALTER TABLE soul.personalities
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
