-- Phase XX: Per-personality date/time injection
-- Adds opt-in flag so the soul prompt receives current date/time on every request.

ALTER TABLE soul.personalities
  ADD COLUMN IF NOT EXISTS inject_date_time BOOLEAN DEFAULT false NOT NULL;
