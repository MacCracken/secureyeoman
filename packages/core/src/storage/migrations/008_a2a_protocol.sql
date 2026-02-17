-- Migration 008: Agent-to-Agent Protocol (Phase 6.5)
-- Creates the a2a schema with peers, capabilities, and messages tables.

CREATE SCHEMA IF NOT EXISTS a2a;

-- Known peer agents
CREATE TABLE IF NOT EXISTS a2a.peers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL,
  public_key  TEXT NOT NULL DEFAULT '',
  trust_level TEXT NOT NULL DEFAULT 'untrusted'
              CHECK (trust_level IN ('untrusted', 'verified', 'trusted')),
  status      TEXT NOT NULL DEFAULT 'unknown'
              CHECK (status IN ('online', 'offline', 'unknown')),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_a2a_peers_status ON a2a.peers(status);
CREATE INDEX IF NOT EXISTS idx_a2a_peers_trust ON a2a.peers(trust_level);

-- Peer capabilities
CREATE TABLE IF NOT EXISTS a2a.capabilities (
  id          TEXT PRIMARY KEY,
  peer_id     TEXT NOT NULL REFERENCES a2a.peers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  version     TEXT NOT NULL DEFAULT '1.0'
);

CREATE INDEX IF NOT EXISTS idx_a2a_capabilities_peer ON a2a.capabilities(peer_id);
CREATE INDEX IF NOT EXISTS idx_a2a_capabilities_name ON a2a.capabilities(name);

-- A2A message log
CREATE TABLE IF NOT EXISTS a2a.messages (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  from_peer_id TEXT NOT NULL,
  to_peer_id   TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_a2a_messages_from ON a2a.messages(from_peer_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_to ON a2a.messages(to_peer_id);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_type ON a2a.messages(type);
CREATE INDEX IF NOT EXISTS idx_a2a_messages_timestamp ON a2a.messages(timestamp DESC);
