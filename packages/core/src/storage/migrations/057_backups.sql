CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.backups (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','completed','failed')),
  size_bytes BIGINT,
  file_path TEXT,
  error TEXT,
  pg_dump_version TEXT,
  created_by TEXT,
  created_at BIGINT NOT NULL,
  completed_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON admin.backups(created_at DESC);
