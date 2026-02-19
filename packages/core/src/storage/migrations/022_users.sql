-- 022_users.sql
-- Multi-user foundation: auth.users table for local and SSO-provisioned accounts.
-- The admin singleton is migrated as an initial row so that api_keys.user_id FK
-- references continue to resolve without schema changes.

CREATE TABLE IF NOT EXISTS auth.users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  hashed_password TEXT,           -- NULL for SSO-only users
  is_admin     BOOLEAN NOT NULL DEFAULT false,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth.users(email);

-- Seed the built-in admin singleton so foreign keys work immediately.
-- hashed_password is NULL here; the real password is managed by AuthService
-- via SECUREYEOMAN_ADMIN_PASSWORD env var (never stored in the DB).
INSERT INTO auth.users (id, email, display_name, hashed_password, is_admin, created_at, updated_at)
VALUES ('admin', 'admin@localhost', 'Administrator', NULL, true, 0, 0)
ON CONFLICT DO NOTHING;
