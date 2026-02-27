# ADR 142: Backup & Disaster Recovery API

**Date:** 2026-02-26
**Status:** Accepted
**Phase:** 61 — Enterprise Features

## Context

SaaS and enterprise deployments require operator-managed database backups and point-in-time recovery. The current system has no built-in backup capability.

## Decision

Introduce a `BackupManager` that orchestrates `pg_dump` / `pg_restore` and tracks metadata in `admin.backups`.

- **Trigger:** `POST /api/v1/admin/backups` returns immediately (status: `running`); `pg_dump` runs non-blocking via `setImmediate`.
- **Storage:** `admin.backups` table (migration 057) with status, size, file path, timestamps.
- **Download:** `GET /api/v1/admin/backups/:id/download` streams the `.pgdump` file directly.
- **Restore:** `POST /api/v1/admin/backups/:id/restore` requires `{ confirm: "RESTORE" }` body; blocks until `pg_restore` completes.
- **Security:** PGPASSWORD injected via safe env (whitelist of permitted env vars); all routes admin-only.
- **Dashboard:** Backup tab in Settings page with status badges, create/download/delete actions.

## Consequences

- Operators can trigger and download PostgreSQL custom-format backups via the dashboard.
- Restore is a destructive operation requiring explicit confirmation.
- File storage is local to `dataDir/backups/`; operators are responsible for off-site replication.
