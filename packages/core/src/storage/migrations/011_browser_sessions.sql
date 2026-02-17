CREATE SCHEMA IF NOT EXISTS browser;

CREATE TABLE IF NOT EXISTS browser.sessions (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'active',
  url           TEXT,
  title         TEXT,
  viewport_w    INTEGER,
  viewport_h    INTEGER,
  screenshot    TEXT,
  tool_name     TEXT NOT NULL,
  duration_ms   INTEGER,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_browser_sessions_status ON browser.sessions(status);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_created ON browser.sessions(created_at DESC);
