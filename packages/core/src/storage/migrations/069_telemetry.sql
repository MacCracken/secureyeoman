-- Migration 069: Telemetry — alert rules engine
--
-- Creates the telemetry schema and alert_rules table used by AlertManager
-- to evaluate MetricsSnapshot values against user-defined thresholds and
-- dispatch notifications to external channels (Slack, PagerDuty, OpsGenie, webhook).

CREATE SCHEMA IF NOT EXISTS telemetry;

CREATE TABLE IF NOT EXISTS telemetry.alert_rules (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  description      TEXT,
  metric_path      TEXT    NOT NULL,     -- dot-notation into MetricsSnapshot, e.g. "security.rateLimitHitsTotal"
  operator         TEXT    NOT NULL CHECK (operator IN ('gt','lt','gte','lte','eq')),
  threshold        REAL    NOT NULL,
  channels         JSONB   NOT NULL DEFAULT '[]',  -- [{type:'slack'|'pagerduty'|'opsgenie'|'webhook', url?:string, routingKey?:string}]
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  last_fired_at    BIGINT,
  created_at       BIGINT  NOT NULL,
  updated_at       BIGINT  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON telemetry.alert_rules (enabled);
