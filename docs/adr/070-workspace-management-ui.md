# ADR 070: Workspace Admin UI & Multi-User Foundation

**Status:** Accepted  
**Date:** 2026-02-19  
**Phase:** 20a

## Context

SecureYeoman previously had a `workspace.workspaces` table and a basic `WorkspaceManager` with skeletal CRUD, but no:
- Multi-user identity model (`auth.users` table)
- `update()` / `listMembers()` on WorkspaceManager
- Default workspace creation on boot
- REST API completions for member management
- Dashboard UI for workspace administration

All of these were required before the SSO phase (ADR 071) since SSO provisions users into workspaces.

## Decision

1. **Migration 022:** Create `auth.users` table with email, display_name, hashed_password (NULL for SSO), is_admin. Seed the built-in `admin` singleton row.
2. **Migration 023:** Add `identity_provider_id` and `sso_domain` columns to `workspace.workspaces`; add `display_name` to `workspace.members`.
3. **AuthStorage:** Add `createUser`, `getUserById`, `getUserByEmail`, `listUsers`, `updateUser`, `deleteUser`.
4. **AuthService:** Add `createUserSession(userId, role)` for SSO token issuance. Add thin user management wrappers.
5. **WorkspaceManager/Storage:** Add `update()`, `listMembers()`, `getMember()`, `updateMemberRole()`, `ensureDefaultWorkspace()`.
6. **Boot:** Call `ensureDefaultWorkspace()` during initialization — creates "Default" workspace + adds admin as owner on fresh installs.
7. **workspace-routes.ts:** `PUT /workspaces/:id`, `GET /workspaces/:id/members`, `POST`, `PUT`, `DELETE` member endpoints, `GET/POST/DELETE /users`.

## Consequences

### Positive
- Multi-user foundation enables SSO provisioning and workspace-scoped access.
- Default workspace created automatically — zero manual setup on fresh install.
- Complete REST API for workspace/member/user management.

### Negative
- `auth.users` adds a new schema dependency; existing single-admin deployments must run migration 022 (non-destructive, additive only).

### Risks
- The admin singleton row (`id='admin'`) must always exist; `deleteUser` guards against deleting it.

## Files Changed
- `packages/core/src/storage/migrations/022_users.sql` — NEW
- `packages/core/src/storage/migrations/023_workspace_improvements.sql` — NEW
- `packages/shared/src/types/security.ts` — UserSchema, UserCreate, UserUpdate
- `packages/shared/src/types/index.ts` — export new types
- `packages/core/src/security/auth-storage.ts` — user CRUD methods
- `packages/core/src/security/auth.ts` — createUserSession, user wrappers
- `packages/core/src/workspace/storage.ts` — update, listMembers, getMember, updateMemberRole
- `packages/core/src/workspace/manager.ts` — update, listMembers, ensureDefaultWorkspace
- `packages/core/src/workspace/workspace-routes.ts` — complete REST API
- `packages/core/src/secureyeoman.ts` — call ensureDefaultWorkspace on boot
- `packages/core/src/gateway/server.ts` — pass authService to workspace routes
