-- Migration 007: MCP Server Credential Management
-- Stores encrypted credentials for external MCP servers.

CREATE TABLE IF NOT EXISTS mcp.server_credentials (
  server_id       TEXT NOT NULL REFERENCES mcp.servers(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  PRIMARY KEY (server_id, key)
);
