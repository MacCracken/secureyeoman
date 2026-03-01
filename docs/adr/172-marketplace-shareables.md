# ADR 172 — Marketplace Shareables: Workflows, Swarm Templates & Profile Skills

**Date**: 2026-03-01
**Status**: Accepted
**Phase**: 89

---

## Context

The SecureYeoman skill marketplace enables installing AI skill definitions onto personalities. Workflows (automation pipelines) and swarm templates (multi-agent team configurations) are created per-instance with no way to share them — users manually copy JSON or rebuild from scratch.

Three related gaps exist:

1. **Workflow portability** — Workflows created on one instance can't be shared or installed on another. Community contributions must be imported manually.
2. **Swarm template portability** — Swarm templates can't be exported or listed in a community directory.
3. **Profile skills** — Sub-agent profiles (`agents.profiles`) have no skill attachment mechanism. Skills can only be installed on soul personalities, so swarm roles run without injected skill context.

---

## Decision

### 1. Shareable JSON format with `requires` manifest

Export format for both workflows and swarm templates includes a `requires` compatibility manifest:

```typescript
// Workflow
type WorkflowExport = {
  exportedAt: number;
  requires: { integrations?: string[]; tools?: string[] };
  workflow: WorkflowDefinition;
};

// Swarm template
type SwarmTemplateExport = {
  exportedAt: number;
  requires: { profileRoles?: string[] };
  template: SwarmTemplate;
};
```

The `requires` field is inferred on export (not manually authored):
- **Workflow**: integration keywords scanned from step config strings (gmail, github, slack, etc.); tool names from `step.config.toolName`.
- **Swarm template**: `profileRoles` inferred from `template.roles.map(r => r.profileName)`.

On import, a `CompatibilityCheckResult` is computed and returned alongside the created entity. Imports are **non-blocking** — they proceed even with gaps, which are surfaced to the user as warnings.

### 2. Community repo as two-tier source for workflows and swarms

The `secureyeoman-community-skills` repository gains `workflows/` and `swarms/` directories alongside the existing `skills/` directory. JSON Schema Draft-07 schemas are provided for both.

`syncFromCommunity()` in `MarketplaceManager` is extended to walk these directories, upserting into the database with `source='community'`. The `CommunitySyncResult` gains `workflowsAdded`, `workflowsUpdated`, `swarmsAdded`, `swarmsUpdated` counters.

### 3. `agents.profile_skills` junction table

A new `agents.profile_skills` table (migration `072_shareables.sql`) stores many-to-many profile ↔ skill relationships. Three methods added to `SwarmStorage`: `getProfileSkills()`, `addProfileSkill()`, `removeProfileSkill()`.

During swarm execution, `SwarmManager.runSequential()` calls `buildContextWithProfileSkills()` before delegating each role. This appends installed skill definitions to the role's context — mirroring the `SoulManager.buildSystemPrompt()` skill injection pattern.

### 4. Source column on existing tables

`workflow.definitions` and `agents.swarm_templates` gain a `source` column (`'user'`, `'builtin'`, `'community'`, `'imported'`). This enables filtering: the WorkflowsTab fetches `GET /api/v1/workflows?source=community`.

---

## Alternatives Considered

### A: Schema-less export (flat JSON dump)
Export the raw entity without a `requires` field. Simpler, but no compatibility signal at import time. Rejected — compatibility info is low cost to infer and high value for UX.

### B: Blocking import on compatibility gaps
Return 422 when required integrations aren't connected. Rejected — users often want to install first and configure later; a warning with 201 is more usable.

### C: Separate `profile-skills-storage.ts`
New storage file just for profile skills. Rejected — the three methods are simple JOIN/INSERT/DELETE against tables already managed by SwarmStorage. Adding them there avoids a new file and an additional dependency injection point.

### D: Skill injection via a new `SkillInjector` service
Abstract the injection into a shared service used by both `SoulManager` and `SwarmManager`. Rejected as over-engineering — the pattern is 10 lines in both cases; wait for a third consumer before abstracting.

---

## Consequences

### Positive
- Workflows and swarm templates can be shared as portable JSON files or contributed to the community repository.
- Compatibility gaps are surfaced before the user discovers them at runtime.
- Sub-agent profiles gain skills, enabling role-specific skill context in swarms.
- The community repo pattern (`skills/`, `workflows/`, `swarms/`) is consistent and extensible.

### Negative / Trade-offs
- The `requires.integrations` inference is keyword-based (not semantic), so it may miss integration dependencies embedded in custom expressions.
- Profile skills are injected into context (prompt) space, not enforced by tool allowlist. A skill's MCP tools must still be individually permitted.
- `source` column defaults to `'user'` for existing rows — accurate for created workflows, but builtin seeds must be updated via the migration UPDATE statements.

### Neutral
- The `source` filter on workflow/swarm list routes enables community/imported views; the existing `createdBy` field still distinguishes user-authored from seeded content.
- No breaking changes to existing API consumers — all new routes are additions.

---

## Implementation

| Artifact | Location |
|----------|----------|
| JSON Schemas | `secureyeoman-community-skills/schema/workflow.schema.json`, `swarm-template.schema.json` |
| Community content | `secureyeoman-community-skills/workflows/` (3 files), `swarms/` (2 files) |
| Migration | `packages/core/src/storage/migrations/072_shareables.sql` |
| Shared types | `packages/shared/src/types/shareables.ts` |
| Workflow export/import routes | `packages/core/src/workflow/workflow-routes.ts` |
| Swarm export/import routes | `packages/core/src/agents/swarm-routes.ts` |
| Profile skills routes | `packages/core/src/agents/profile-skills-routes.ts` |
| Storage methods | `packages/core/src/agents/swarm-storage.ts` |
| Skill injection | `packages/core/src/agents/swarm-manager.ts` |
| Community sync extension | `packages/core/src/marketplace/manager.ts` |
| Dashboard type tabs | `packages/dashboard/src/components/MarketplacePage.tsx` |
| WorkflowsTab | `packages/dashboard/src/components/marketplace/WorkflowsTab.tsx` |
| SwarmTemplatesTab | `packages/dashboard/src/components/marketplace/SwarmTemplatesTab.tsx` |
| Profile skills UI | `packages/dashboard/src/components/SubAgentsPage.tsx` |

Tests: 62 new tests across 6 new test files. All passing.
