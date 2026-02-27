# ADR 144: Multi-Tenancy

**Date:** 2026-02-26
**Status:** Accepted
**Phase:** 61 — Enterprise Features

## Context

SaaS deployments require tenant isolation: each customer's data must be invisible to other tenants. The system must remain fully backward-compatible for single-tenant deployments.

## Decision

Implement multi-tenancy via `tenant_id TEXT NOT NULL DEFAULT 'default'` columns on user-data tables + PostgreSQL Row Level Security (RLS).

**Key design choices:**

1. **Pool-safe GUC pattern:** `SET LOCAL app.current_tenant = ?` is transaction-scoped — reverts automatically on commit/rollback. `withTenantContext(tenantId, fn)` in `PgBaseStorage` wraps fn in a transaction and sets the GUC.
2. **Admin bypass:** `bypassRls(fn)` uses `SET LOCAL row_security = off` for cross-tenant admin operations.
3. **Default tenant:** Migration 058 inserts a `'default'` tenant on `ON CONFLICT DO NOTHING`. Existing data retains `tenant_id = 'default'` with no disruption.
4. **Tenant registry:** `auth.tenants` table with `id`, `name`, `slug`, `plan`, `metadata`.
5. **API:** `GET/POST/PUT/DELETE /api/v1/admin/tenants` — admin-only CRUD.
6. **`TenantManager`:** Validates slug format (lowercase alphanumeric + hyphens), blocks deletion of `'default'` tenant, emits audit events.
7. **RLS policies:** Enable row-level security on all user-data tables with `USING (tenant_id = current_setting('app.current_tenant', true))`.

## Consequences

- Single-tenant deployments are unaffected: `app.current_tenant` GUC is only set inside `withTenantContext`; direct pool queries see all data.
- Tenant isolation is enforced at the database layer — not just the application layer.
- RLS verification is manual (documented in the roadmap checklist).
- Dashboard: Tenants tab in Settings (admin-only) for CRUD operations.
