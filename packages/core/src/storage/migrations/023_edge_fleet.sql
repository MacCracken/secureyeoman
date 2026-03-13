-- 023_edge_fleet.sql — Edge fleet management tables
-- Phase 14C: Edge node registry, deployments, OTA updates

DO $$ BEGIN
  CREATE SCHEMA IF NOT EXISTS edge;
EXCEPTION WHEN duplicate_schema THEN NULL;
END $$;

-- ── Edge Nodes ──────────────────────────────────────────────────────────────
-- Central registry of all edge nodes that have registered with this instance.
-- Superset of a2a.peers — tracks edge-specific hardware capabilities.

CREATE TABLE IF NOT EXISTS edge.nodes (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  peer_id             TEXT REFERENCES a2a.peers(id) ON DELETE SET NULL,
  node_id             TEXT NOT NULL,              -- stable hardware-derived ID
  hostname            TEXT NOT NULL,
  arch                TEXT NOT NULL DEFAULT 'x64',
  platform            TEXT NOT NULL DEFAULT 'linux',
  total_memory_mb     INT NOT NULL DEFAULT 0,
  cpu_cores           INT NOT NULL DEFAULT 0,
  has_gpu             BOOLEAN NOT NULL DEFAULT false,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  -- Bandwidth / networking (Phase 14B)
  bandwidth_mbps      INT,                        -- measured bandwidth to parent
  latency_ms          INT,                        -- measured latency to parent
  -- WireGuard mesh (Phase 14B)
  wireguard_pubkey    TEXT,                        -- WireGuard public key
  wireguard_endpoint  TEXT,                        -- WireGuard endpoint (host:port)
  wireguard_ip        TEXT,                        -- WireGuard tunnel IP
  -- OTA / version
  current_version     TEXT NOT NULL DEFAULT 'unknown',
  last_update_check   TIMESTAMPTZ,
  -- Status
  status              TEXT NOT NULL DEFAULT 'registered'
                      CHECK (status IN ('registered', 'online', 'offline', 'decommissioned')),
  last_heartbeat      TIMESTAMPTZ DEFAULT now(),
  registered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_nodes_node_id ON edge.nodes (node_id);
CREATE INDEX IF NOT EXISTS idx_edge_nodes_status ON edge.nodes (status);
CREATE INDEX IF NOT EXISTS idx_edge_nodes_peer_id ON edge.nodes (peer_id);
CREATE INDEX IF NOT EXISTS idx_edge_nodes_arch ON edge.nodes (arch);

-- ── Edge Deployments ────────────────────────────────────────────────────────
-- Track task/workload deployments to edge nodes.

CREATE TABLE IF NOT EXISTS edge.deployments (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  node_id             TEXT NOT NULL REFERENCES edge.nodes(id) ON DELETE CASCADE,
  task_type           TEXT NOT NULL,               -- 'inference', 'collection', 'monitoring', etc.
  config_json         JSONB NOT NULL DEFAULT '{}',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'deploying', 'running', 'stopped', 'failed')),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  stopped_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_edge_deployments_node ON edge.deployments (node_id);
CREATE INDEX IF NOT EXISTS idx_edge_deployments_status ON edge.deployments (status);

-- ── Edge OTA Updates ────────────────────────────────────────────────────────
-- Audit log of OTA update attempts and results.

CREATE TABLE IF NOT EXISTS edge.ota_updates (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  node_id             TEXT NOT NULL REFERENCES edge.nodes(id) ON DELETE CASCADE,
  from_version        TEXT NOT NULL,
  to_version          TEXT NOT NULL,
  sha256              TEXT,
  ed25519_signature   TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'downloading', 'verifying', 'applied', 'failed', 'rolled_back')),
  error_message       TEXT,
  initiated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_edge_ota_node ON edge.ota_updates (node_id);
