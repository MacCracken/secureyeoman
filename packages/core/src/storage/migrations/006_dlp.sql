-- Phase 136: Data Loss Prevention & Content Classification
CREATE SCHEMA IF NOT EXISTS dlp;

-- Content classification records
CREATE TABLE dlp.classifications (
  id text PRIMARY KEY,
  content_id text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('conversation','document','memory','knowledge','message')),
  classification_level text NOT NULL DEFAULT 'internal' CHECK (classification_level IN ('public','internal','confidential','restricted')),
  auto_level text CHECK (auto_level IN ('public','internal','confidential','restricted')),
  manual_override boolean DEFAULT false,
  overridden_by text,
  rules_triggered jsonb DEFAULT '[]',
  classified_at bigint NOT NULL,
  tenant_id text DEFAULT 'default' NOT NULL
);
CREATE INDEX idx_dlp_class_content ON dlp.classifications(content_id, content_type);
CREATE INDEX idx_dlp_class_level ON dlp.classifications(classification_level);
CREATE INDEX idx_dlp_class_tenant ON dlp.classifications(tenant_id);

-- DLP policies
CREATE TABLE dlp.policies (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  rules jsonb NOT NULL DEFAULT '[]',
  action text NOT NULL DEFAULT 'warn' CHECK (action IN ('block','warn','log')),
  classification_levels text[] NOT NULL DEFAULT '{confidential,restricted}',
  applies_to text[] NOT NULL DEFAULT '{email,slack,webhook,api}',
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  tenant_id text DEFAULT 'default' NOT NULL
);
CREATE INDEX idx_dlp_policies_tenant ON dlp.policies(tenant_id);

-- Egress log
CREATE TABLE dlp.egress_log (
  id text PRIMARY KEY,
  destination_type text NOT NULL,
  destination_id text,
  content_hash text NOT NULL,
  classification_level text,
  bytes_sent integer DEFAULT 0,
  policy_id text,
  action_taken text NOT NULL CHECK (action_taken IN ('allowed','blocked','warned')),
  scan_findings jsonb DEFAULT '[]',
  user_id text,
  personality_id text,
  created_at bigint NOT NULL,
  tenant_id text DEFAULT 'default' NOT NULL
);
CREATE INDEX idx_dlp_egress_created ON dlp.egress_log(created_at DESC);
CREATE INDEX idx_dlp_egress_dest ON dlp.egress_log(destination_type);
CREATE INDEX idx_dlp_egress_tenant ON dlp.egress_log(tenant_id);

-- Retention policies
CREATE TABLE dlp.retention_policies (
  id text PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('conversation','memory','document','knowledge','audit_log')),
  retention_days integer NOT NULL,
  classification_level text CHECK (classification_level IN ('public','internal','confidential','restricted')),
  enabled boolean DEFAULT true,
  last_purge_at bigint,
  created_at bigint NOT NULL,
  updated_at bigint NOT NULL,
  tenant_id text DEFAULT 'default' NOT NULL
);
CREATE INDEX idx_dlp_retention_tenant ON dlp.retention_policies(tenant_id);

-- Watermark registry
CREATE TABLE dlp.watermarks (
  id text PRIMARY KEY,
  content_id text NOT NULL,
  content_type text NOT NULL,
  watermark_data text NOT NULL,
  algorithm text NOT NULL DEFAULT 'unicode-steganography',
  created_at bigint NOT NULL,
  tenant_id text DEFAULT 'default' NOT NULL
);
CREATE INDEX idx_dlp_watermark_content ON dlp.watermarks(content_id);
