# ADR 005: Team Workspaces

## Status

Accepted

## Context

Organizations need to isolate SecureYeoman deployments per team while sharing infrastructure. A single instance should support multiple teams with distinct personalities, skills, and access control.

## Decision

Introduce workspace isolation with `WorkspaceManager` as the orchestrator:

1. **Workspace** — A named container for personality, skills, knowledge, and access rules
2. **WorkspaceManager** — CRUD for workspaces, member management, default workspace resolution
3. **Integration with existing systems** — Brain, Soul, Spirit all become workspace-scoped; tasks tagged with `workspaceId`

### Implementation

- SQLite tables: `workspaces` (id, name, ownerId, createdAt), `workspace_members` (workspaceId, userId, role)
- RBAC extended: workspace-level roles (workspace_admin, workspace_member, workspace_viewer)
- REST API: `/api/v1/workspaces/` for CRUD, `/api/v1/workspaces/:id/members` for membership
- Authentication middleware resolves active workspace from JWT claim or query parameter
- Dashboard: workspace switcher in header, workspace settings page

## Consequences

- Multi-tenancy support without deploying separate instances
- Workspace members inherit permissions from workspace role + global RBAC role (least privilege applies)
- Default workspace (id=1, "Personal") auto-created on first boot
- Workspace deletion requires cascading cleanup of personalities, memories, tasks
- SQLite foreign keys enforce referential integrity

---

## Phase 25 Corrections (2026-02-20)

A focused audit of the workspace system exposed six defects that were fixed during the Phase 25 bug hunt:

### 1. Missing ROUTE_PERMISSIONS entries
`PUT /api/v1/workspaces/:id`, `GET /api/v1/workspaces/:id/members`,
`PUT /api/v1/workspaces/:id/members/:userId`, `GET /api/v1/users`,
`POST /api/v1/users`, and `DELETE /api/v1/users/:id` were absent from
`ROUTE_PERMISSIONS`, causing them to fall to the admin-only default-deny path
instead of being accessible to `operator` and `viewer` as intended.

### 2. No workspace existence check before addMember
`POST /api/v1/workspaces/:id/members` called `addMember` without first verifying
the workspace existed, potentially creating orphaned member rows.

### 3. No role validation
The `role` body parameter accepted any string. Requests with `role: "superadmin"`
were silently stored. Both POST and PUT member routes now validate against
`WorkspaceRoleSchema` (`owner | admin | member | viewer`) and return 400 on
invalid input.

### 4. No workspace-scoped admin enforcement
Mutating operations (PUT workspace, POST/PUT/DELETE members) only checked the
global RBAC role. A global `operator` could modify any workspace even if they
were a plain `member` of it. A `requireWorkspaceAdmin()` helper now enforces
`owner` or `admin` workspace-level rank for all mutating routes; global `admin`
users bypass the check.

### 5. Last-admin protection missing
Removing the last `owner`/`admin` from a workspace left it with no privileged
member. The DELETE member handler now counts admin-rank members and returns 400
when removal would leave zero.

### 6. `updateMemberRole` returned wrong `joinedAt`
`WorkspaceStorage.updateMemberRole()` set `joinedAt: Date.now()` on the returned
object. Fixed by re-fetching the updated row via `getMember()`.

**Bonus**: `ensureDefaultWorkspace` now adds the bootstrap admin user with the
`owner` workspace role (was `admin`), correctly reflecting their creator status.
