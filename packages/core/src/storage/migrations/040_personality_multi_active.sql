-- Migration 040: Multi-active personalities + default + archetype protection
--
-- is_active becomes non-exclusive (multiple personalities can be active simultaneously)
-- is_default is exclusive: the dashboard/new-chat default personality
-- is_archetype marks system-seeded personalities (deletion is blocked)

ALTER TABLE soul.personalities
  ADD COLUMN IF NOT EXISTS is_default   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archetype BOOLEAN NOT NULL DEFAULT false;

-- Whoever is currently active becomes the default
UPDATE soul.personalities SET is_default = true WHERE is_active = true;

COMMENT ON COLUMN soul.personalities.is_default IS
  'Exclusive: the personality used for new chat sessions and as the dashboard default.';
COMMENT ON COLUMN soul.personalities.is_archetype IS
  'System-seeded personality (preset). Deletion is blocked regardless of deletionMode.';
