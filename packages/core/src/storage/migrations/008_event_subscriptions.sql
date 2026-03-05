-- 008_event_subscriptions.sql — Webhook/Event Subscription system
-- Stores event subscriptions and delivery records for outbound webhook notifications.

CREATE SCHEMA IF NOT EXISTS events;

CREATE TABLE events.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_types TEXT[] NOT NULL,
  webhook_url TEXT NOT NULL,
  secret TEXT,
  enabled BOOLEAN DEFAULT true,
  headers JSONB DEFAULT '{}',
  retry_policy JSONB DEFAULT '{"maxRetries": 3, "backoffMs": 1000}',
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at BIGINT,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE events.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES events.subscriptions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 4,
  last_attempt_at BIGINT,
  next_retry_at BIGINT,
  response_status INTEGER,
  response_body TEXT,
  error TEXT,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  tenant_id TEXT NOT NULL DEFAULT 'default'
);

CREATE INDEX idx_subscriptions_tenant ON events.subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_enabled ON events.subscriptions(enabled) WHERE enabled = true;
CREATE INDEX idx_deliveries_subscription ON events.deliveries(subscription_id);
CREATE INDEX idx_deliveries_status ON events.deliveries(status) WHERE status IN ('pending', 'retrying');
CREATE INDEX idx_deliveries_next_retry ON events.deliveries(next_retry_at) WHERE status = 'retrying';
