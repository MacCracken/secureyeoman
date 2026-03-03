-- Phase 112: Multi-Account AI Provider Keys & Per-Account Cost Tracking
-- ADR 191

CREATE SCHEMA IF NOT EXISTS ai;

-- ─── Provider Accounts ─────────────────────────────────────────
CREATE TABLE ai.provider_accounts (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  label         TEXT NOT NULL,
  secret_name   TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  account_info  JSONB DEFAULT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'invalid', 'rate_limited', 'disabled')),
  last_validated_at TIMESTAMPTZ DEFAULT NULL,
  base_url      TEXT DEFAULT NULL,
  tenant_id     TEXT DEFAULT NULL,
  created_by    TEXT DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one default account per provider per tenant
CREATE UNIQUE INDEX idx_provider_accounts_default
  ON ai.provider_accounts (provider, tenant_id)
  WHERE is_default = true;

CREATE INDEX idx_provider_accounts_provider ON ai.provider_accounts (provider);

-- ─── Account Cost Records ──────────────────────────────────────
CREATE TABLE ai.account_cost_records (
  id              TEXT PRIMARY KEY,
  account_id      TEXT NOT NULL REFERENCES ai.provider_accounts(id) ON DELETE CASCADE,
  personality_id  TEXT DEFAULT NULL,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  total_tokens    INTEGER NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,
  request_id      TEXT DEFAULT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id       TEXT DEFAULT NULL
);

CREATE INDEX idx_account_cost_account_id ON ai.account_cost_records (account_id);
CREATE INDEX idx_account_cost_recorded_at ON ai.account_cost_records (recorded_at DESC);
CREATE INDEX idx_account_cost_personality ON ai.account_cost_records (personality_id)
  WHERE personality_id IS NOT NULL;
