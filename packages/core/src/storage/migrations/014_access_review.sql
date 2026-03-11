-- 014_access_review.sql — Access Review & Entitlement Reporting
-- Tier: enterprise

CREATE SCHEMA IF NOT EXISTS access_review;

CREATE TABLE IF NOT EXISTS access_review.campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reviewer_ids TEXT[] NOT NULL,
  scope TEXT,
  created_by TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  closed_at BIGINT,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_review.entitlements (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES access_review.campaigns(id),
  user_id TEXT NOT NULL,
  user_name TEXT,
  entitlement_type TEXT NOT NULL,
  entitlement_value TEXT NOT NULL,
  details JSONB,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_review.decisions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES access_review.campaigns(id),
  entitlement_id TEXT NOT NULL REFERENCES access_review.entitlements(id),
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  justification TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE(campaign_id, entitlement_id)
);

CREATE INDEX IF NOT EXISTS idx_ar_campaigns_status ON access_review.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ar_campaigns_created ON access_review.campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_entitlements_campaign ON access_review.entitlements(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ar_entitlements_user ON access_review.entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_ar_decisions_campaign ON access_review.decisions(campaign_id);
