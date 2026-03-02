-- 073_archetype_avatars.sql
-- Back-fill default avatar images and correct sex for seed (archetype) personalities.
-- Only updates rows that have not yet had a custom avatar uploaded (avatar_url IS NULL).
-- Safe to run multiple times — the WHERE clause makes it idempotent.

UPDATE soul.personalities
SET
  avatar_url   = '/avatars/friday.png',
  sex          = 'female',
  updated_at   = (extract(epoch from now()) * 1000)::bigint
WHERE is_archetype = true
  AND name        = 'FRIDAY'
  AND avatar_url  IS NULL;

UPDATE soul.personalities
SET
  avatar_url   = '/avatars/t_ron.png',
  updated_at   = (extract(epoch from now()) * 1000)::bigint
WHERE is_archetype = true
  AND name        = 'T.Ron'
  AND avatar_url  IS NULL;
