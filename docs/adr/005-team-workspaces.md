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
