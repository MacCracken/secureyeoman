# Multi-Tenancy

SecureYeoman supports multi-tenancy at the database level (Phase 61). Each tenant is a named partition that isolates its data from other tenants via PostgreSQL Row-Level Security (RLS). A `default` tenant is always present and requires no configuration.

---

## Concepts

| Concept | Description |
|---------|-------------|
| **Tenant** | A named organisational partition with its own slug, plan label, and isolated data |
| **Slug** | A URL-safe identifier used to route requests to the correct tenant partition (`acme-corp`, `internal-qa`) |
| **Plan** | An arbitrary label (`free`, `pro`, `enterprise`) for your own billing or feature-gating logic |
| **`default` tenant** | The built-in tenant — cannot be deleted. All single-tenant deployments use this transparently |
| **RLS** | PostgreSQL Row-Level Security enforces tenant isolation at the storage layer |

---

## Prerequisites

- Admin JWT required for all tenant management operations
- PostgreSQL (the data store must support RLS — SQLite mode does not support multi-tenancy)
- Migration 058 applied (included automatically since Phase 61)

---

## Creating a Tenant

### Dashboard

1. Go to **Settings → Administration → Tenants**
2. Click **New Tenant**
3. Enter **Name** (display name) and **Slug** (URL-safe, lowercase alphanumeric + hyphens)
4. Optionally set a **Plan** label
5. Click **Create**

### API

```bash
curl -X POST https://your-instance/api/v1/admin/tenants \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "enterprise"
  }'
```

Response (201):
```json
{
  "tenant": {
    "id": "01959abc-...",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "enterprise",
    "createdAt": 1709123456789
  }
}
```

**Slug rules**: lowercase letters, digits, and hyphens; no leading or trailing hyphens; 1–63 characters. Invalid slugs return 400.

---

## Listing Tenants

```bash
curl -H "Authorization: Bearer <admin-jwt>" \
  "https://your-instance/api/v1/admin/tenants?limit=50&offset=0"
```

Returns `{ tenants: [...], total: N, limit: 50, offset: 0 }`.

---

## Updating a Tenant

You can update `name`, `plan`, or arbitrary `metadata`. The slug is immutable after creation.

```bash
curl -X PUT https://your-instance/api/v1/admin/tenants/<id> \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "plan": "pro", "metadata": { "salesforceid": "001XX000003GYn2" } }'
```

---

## Deleting a Tenant

```bash
curl -X DELETE -H "Authorization: Bearer <admin-jwt>" \
  https://your-instance/api/v1/admin/tenants/<id>
```

Returns 204 on success. Returns 400 if you attempt to delete the `default` tenant — it cannot be removed.

> **Warning**: Deleting a tenant cascades to all of its data (personalities, conversations, memories, audit logs, etc.) via the RLS partition. This is irreversible.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/tenants` | List tenants (supports `limit`, `offset`) |
| `POST` | `/api/v1/admin/tenants` | Create tenant |
| `GET` | `/api/v1/admin/tenants/:id` | Get tenant by ID |
| `PUT` | `/api/v1/admin/tenants/:id` | Update tenant (name, plan, metadata) |
| `DELETE` | `/api/v1/admin/tenants/:id` | Delete tenant (fails for `default`) |

---

## Data Isolation

Migration 058 adds `tenant_id TEXT NOT NULL DEFAULT 'default'` to 9 core tables and installs RLS policies:

- `soul.personalities`
- `chat.conversations` / `chat.messages`
- `brain.memories` / `brain.knowledge`
- `logging.audit_entries`
- `tasks.tasks`
- `auth.users`
- `auth.tokens`

Storage operations call `SET LOCAL app.tenant_id = '<slug>'` before queries. The `withTenantContext()` helper in `PgBaseStorage` wraps any query in the correct session variable. Admin operations bypass RLS via `bypassRls()` (Postgres superuser connection).

---

## Single-Tenant Deployments

In a standard single-instance deployment, the `default` tenant is used transparently — you do not need to manage tenants at all. Multi-tenancy only becomes relevant when you need to partition data between multiple organisations on a single SecureYeoman instance.

---

## Audit Trail

Tenant lifecycle events are written to the audit chain:

| Event | Level | When |
|-------|-------|------|
| `tenant_created` | info | New tenant created |
| `tenant_deleted` | warn | Tenant deleted |

View these in **Security → Audit Log** filtered by `event=tenant_created` or `event=tenant_deleted`.

---

## Security Considerations

- All tenant management routes require an admin-level JWT — RBAC rejects operator/viewer tokens
- Slugs are permanent — there is no rename operation. Choose slugs carefully
- The `metadata` field is arbitrary JSON — do not store sensitive credentials here (use **Secrets**)
- In a hosted environment, rotate admin JWTs per-tenant to prevent cross-tenant token misuse
