-- Migration 021: Remove Universal Script Assistant from built-ins
-- Moved to community-skills; will be re-seeded via sync as source='community'.
DELETE FROM marketplace.skills
  WHERE name = 'Universal Script Assistant' AND source = 'builtin';
