-- Migration 037: Replace deletion_protected boolean with body.resourcePolicy.deletionMode tri-state
--
-- Personalities with deletion_protected=true are migrated to deletionMode='manual'.
-- All others default to 'auto' (held in the body JSONB default, no explicit write needed).

-- Migrate deletion_protected=true → body.resourcePolicy.deletionMode='manual'
UPDATE soul.personalities
SET body = jsonb_set(
  jsonb_set(
    COALESCE(body, '{}'),
    '{resourcePolicy}',
    COALESCE(body->'resourcePolicy', '{}')
  ),
  '{resourcePolicy,deletionMode}',
  '"manual"'
)
WHERE deletion_protected = true;

-- Drop deprecated column
ALTER TABLE soul.personalities DROP COLUMN IF EXISTS deletion_protected;
