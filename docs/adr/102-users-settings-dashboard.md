# ADR 102 — Users Settings Dashboard

**Date:** 2026-02-22
**Status:** Accepted
**Phase:** 39 — Users Settings Dashboard

---

## Context

ADR 070 (Workspace Management UI) introduced the backend infrastructure for multi-user support:
an `auth.users` table, a built-in `admin` singleton, REST endpoints under `/auth/users`, and
workspace member management. The dashboard had no UI surface for this capability — operators
could not create, inspect, or remove users without direct database access.

The Settings page already contained a **Roles** tab (RBAC management). Users and Roles are
closely related (roles are assigned to users), so the logical placement for a Users dashboard is
immediately before the Roles tab, giving operators a natural left-to-right workflow: create user
→ assign role.

---

## Decision

Add a **Users** tab to `Settings` (positioned between **Keys** and **Roles**) backed by four new
API client functions and a dedicated `UsersSettings` component.

### Tab order

```
General | Security | Keys | Users | Roles | Logs
```

### New API surface (`packages/dashboard/src/api/client.ts`)

```typescript
export interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isBuiltin?: boolean;   // true for the built-in admin singleton
  createdAt: number;
  lastLoginAt?: number;
}

fetchUsers()                                // GET  /auth/users
createUser({ email, displayName, password, isAdmin? })  // POST /auth/users
updateUser(id, { displayName?, isAdmin? })  // PUT  /auth/users/:id
deleteUser(id)                              // DELETE /auth/users/:id
```

All four functions follow the existing error-handling pattern (try/catch returning a safe
default for reads; propagating for writes so mutations can display errors).

### `UsersSettings` component

Rendered as a single card with three interactive zones:

1. **Header** — title + "Add User" button (hidden while create form is open)
2. **Create form** (inline, expandable) — email, display name, password, admin checkbox
3. **User list** — one row per user showing avatar icon, display name, email, join date, last
   login, Admin badge, built-in badge; row-level edit and delete actions

Inline edit form follows the same pattern as `RolesSettings` (ADR 039 inline-form pattern):
expand in-place, Save/Cancel buttons, no navigation.

Delete requires a two-step confirmation rendered inline beneath the row.

Built-in users (`isBuiltin: true`) show a `built-in` badge and have their delete button
suppressed, matching the Roles tab's treatment of built-in roles.

---

## Alternatives Considered

**Separate `/settings/users` route** — rejected; the Settings page already uses a tab model and
adding a new top-level route would be inconsistent. The tab approach requires zero routing
changes.

**Merge into the Roles tab** — rejected; Users and Roles are distinct concerns. Merging would
make the Roles tab unwieldy and violate single-responsibility.

**Modal dialogs for create/edit** — rejected in favour of the established inline-form pattern
(ADR 039) used throughout the codebase.

---

## Consequences

- Operators can create, rename, toggle admin status, and delete users entirely from the
  dashboard without database access.
- The built-in `admin` user cannot be deleted from the UI (suppressed delete button).
- The Users tab is visible to all dashboard users; access control enforcement remains on the
  backend (`/auth/users` endpoints require admin privileges).
- Role assignments (pairing a user ID with a role ID) continue to live in the adjacent
  **Roles** tab; the Users tab does not duplicate that functionality.

---

## Files Changed

- `packages/dashboard/src/api/client.ts` — `UserInfo` interface + 4 API functions
- `packages/dashboard/src/components/UsersSettings.tsx` — new component
- `packages/dashboard/src/components/UsersSettings.test.tsx` — 20 unit tests
- `packages/dashboard/src/components/SettingsPage.tsx` — `users` tab added before `roles`
- `packages/dashboard/src/components/SettingsPage.test.tsx` — 5 new tab tests + mock wiring
- `docs/adr/102-users-settings-dashboard.md` — this document
- `CHANGELOG.md` — Phase 39 entry
