-- 016_tenant_quotas.sql — Per-Tenant Rate Limiting & Token Budgets
-- Tier: enterprise

CREATE SCHEMA IF NOT EXISTS quotas;

CREATE TABLE IF NOT EXISTS quotas.tenant_limits (
  tenant_id TEXT PRIMARY KEY,
  requests_per_minute INTEGER NOT NULL DEFAULT 60,
  requests_per_hour INTEGER NOT NULL DEFAULT 1000,
  tokens_per_day BIGINT NOT NULL DEFAULT 1000000,
  tokens_per_month BIGINT NOT NULL DEFAULT 30000000,
  max_concurrent_requests INTEGER NOT NULL DEFAULT 10,
  custom_limits JSONB DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS quotas.usage_counters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  counter_type TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  window_end BIGINT NOT NULL,
  current_value BIGINT NOT NULL DEFAULT 0,
  max_value BIGINT NOT NULL,
  UNIQUE(tenant_id, counter_type, window_start)
);

CREATE TABLE IF NOT EXISTS quotas.token_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  recorded_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quotas_usage_tenant ON quotas.usage_counters(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotas_usage_window ON quotas.usage_counters(window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_quotas_token_tenant ON quotas.token_usage(tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotas_token_model ON quotas.token_usage(model, recorded_at DESC);
