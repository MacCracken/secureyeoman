-- Migration 006: MCP Server Health Monitoring
-- Tracks health status for external MCP servers.

CREATE TABLE IF NOT EXISTS mcp.server_health (
  server_id           TEXT PRIMARY KEY REFERENCES mcp.servers(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
  latency_ms          INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_checked_at     BIGINT,
  last_success_at     BIGINT,
  last_error          TEXT
);
