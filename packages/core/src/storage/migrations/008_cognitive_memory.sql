-- Phase 124: Cognitive Memory — ACT-R Activation & Hebbian Learning
--
-- Adds activation tracking to documents/skills, associative memory links,
-- and a SQL activation_score function for ACT-R base-level learning.
-- brain.memories already has access_count + last_accessed_at — no changes needed.

-- ── Document activation tracking ────────────────────────────────────
ALTER TABLE brain.documents
  ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed BIGINT,
  ADD COLUMN IF NOT EXISTS confidence REAL DEFAULT 1.0;

-- ── Skill activation tracking ───────────────────────────────────────
ALTER TABLE brain.skills
  ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_accessed BIGINT;

-- ── Hebbian associations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brain.associations (
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  weight      REAL DEFAULT 0.0,
  co_activation_count INTEGER DEFAULT 1,
  updated_at  BIGINT NOT NULL,
  PRIMARY KEY (source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_associations_source ON brain.associations (source_id);
CREATE INDEX IF NOT EXISTS idx_associations_target ON brain.associations (target_id);
CREATE INDEX IF NOT EXISTS idx_associations_weight ON brain.associations (weight DESC);

-- ── ACT-R activation score function ─────────────────────────────────
-- Base-level activation: B_i = ln(n+1) - 0.5 * ln(age_days / (n+1))
-- where n = access_count, age_days = days since last access.
-- Returns a real-valued score; higher = more activated.
CREATE OR REPLACE FUNCTION brain.activation_score(
  p_access_count INTEGER,
  p_last_accessed BIGINT,
  p_now_ms BIGINT
) RETURNS REAL AS $$
DECLARE
  n REAL;
  age_days REAL;
BEGIN
  n := GREATEST(p_access_count, 0)::REAL;
  age_days := GREATEST(
    (p_now_ms - COALESCE(p_last_accessed, p_now_ms)) / 86400000.0,
    0.1
  );
  RETURN LN(n + 1) - 0.5 * LN(age_days / (n + 1));
END;
$$ LANGUAGE plpgsql IMMUTABLE;
