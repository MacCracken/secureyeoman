-- Add a monotonically-increasing sequence column to audit.entries so that
-- getLast() and iterate() can order by true insertion order.
--
-- Neither ORDER BY timestamp nor ORDER BY id (UUID v7) is reliable when
-- entries share the same millisecond: UUID v7 uses random sub-ms bits, and
-- equal timestamps have undefined heap order in Postgres.  A BIGSERIAL
-- column is the only way to guarantee iterate() and getLast() agree on the
-- exact insertion order the chain was built with.

-- Step 1: Add nullable column so existing rows don't fail the NOT NULL check.
ALTER TABLE audit.entries ADD COLUMN IF NOT EXISTS seq BIGINT;

-- Step 2: Dedicated sequence (separate from the column default so we can
--         advance it manually before wiring it up as the default).
CREATE SEQUENCE IF NOT EXISTS audit.entries_seq_seq;

-- Step 3: Back-fill existing rows in the best-available chain order
--         (timestamp ASC, id ASC as a tie-break).  For a fresh install this
--         is a no-op; for an existing install it preserves the expected order.
WITH ordered AS (
  SELECT id,
         row_number() OVER (ORDER BY timestamp ASC, id ASC) AS rn
  FROM audit.entries
  WHERE seq IS NULL
)
UPDATE audit.entries e
SET    seq = o.rn
FROM   ordered o
WHERE  e.id = o.id;

-- Step 4: Advance the sequence past the highest back-filled value so the
--         next INSERT gets seq = max + 1.
SELECT setval(
  'audit.entries_seq_seq',
  COALESCE((SELECT MAX(seq) FROM audit.entries), 0) + 1,
  false   -- "false" means the next nextval() call returns this value
);

-- Step 5: Wire up the default for all future INSERTs.
ALTER TABLE audit.entries
  ALTER COLUMN seq SET DEFAULT nextval('audit.entries_seq_seq');

-- Step 6: Now that every row has a value, tighten to NOT NULL.
ALTER TABLE audit.entries ALTER COLUMN seq SET NOT NULL;

-- Step 7: Index for fast ORDER BY seq queries.
CREATE INDEX IF NOT EXISTS idx_audit_seq ON audit.entries (seq);
