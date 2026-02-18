-- Ensure usage_records table exists (may have been created by UsageStorage.init())
CREATE TABLE IF NOT EXISTS usage_records (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT             NOT NULL,
  model         TEXT             NOT NULL,
  input_tokens  INTEGER          NOT NULL DEFAULT 0,
  output_tokens INTEGER          NOT NULL DEFAULT 0,
  cached_tokens INTEGER          NOT NULL DEFAULT 0,
  total_tokens  INTEGER          NOT NULL DEFAULT 0,
  cost_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
  recorded_at   BIGINT           NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_records_recorded_at_idx ON usage_records (recorded_at);

-- Add personality_id column for per-call personality attribution
ALTER TABLE usage_records ADD COLUMN IF NOT EXISTS personality_id TEXT;
CREATE INDEX IF NOT EXISTS usage_records_personality_idx ON usage_records (personality_id);
