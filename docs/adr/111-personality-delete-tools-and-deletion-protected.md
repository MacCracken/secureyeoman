# ADR 111 — Personality Delete Tools and `deletionProtected` Flag

**Date**: 2026-02-23
**Status**: Accepted
**Deciders**: macro

---

## Context

After adding AI-driven resource creation tools (`create_personality`, `create_custom_role`, `create_experiment`, etc.) in ADR 107 and 110, the creation-only surface was asymmetric — the AI could create but could never destroy. This blocked capability-gating by personality: if a personality should be able to clean up what it (or another personality) created, it needs the corresponding delete/revoke operations.

Three additional concerns were identified during design:

1. **Self-deletion safety** — A personality invoking `delete_personality` on itself would put the system into an undefined state (the active personality no longer exists). This must be blocked at the executor layer, not just the UI.
2. **Deletion protection** — Certain personalities (e.g. the default FRIDAY preset, admin personalities) should be un-deletable via any path (UI, REST API, AI tool) until an operator explicitly clears the flag. This is distinct from edit-immutability, which will be handled by a future `locked` flag (see "Future Work").
3. **`locked` ≠ `deletionProtected`** — The team explicitly reserved `locked` for "cannot be edited" semantics (a future RBAC feature). Conflating the two now would require a later rename.

---

## Decision

### 1. Delete tools added to `creation-tools.ts`

| Tool | `creationConfig` toggle | Notes |
|---|---|---|
| `delete_personality` | `personalities` | Shares toggle with `create_personality` / `update_personality` |
| `delete_custom_role` | `customRoles` | Shares toggle with `create_custom_role` |
| `revoke_role` | `roleAssignments` | Shares toggle with `assign_role` |
| `delete_experiment` | `experiments` | Shares toggle with `create_experiment` |

Destructive operations share the same `creationConfig` toggle as their create counterparts. A personality that can create a resource implicitly needs to be able to remove it; granular create-vs-delete gating is deferred to a future RBAC story.

### 2. Self-deletion guard in the executor

`delete_personality` in `creation-tool-executor.ts` compares `args.id` against `context?.personalityId` before calling `soulManager.deletePersonality()`. When they match, it returns:

```json
{ "error": "A personality cannot delete itself. Ask another personality or an admin to perform this deletion.", "isError": true }
```

This guard is in the executor (not the manager) because the executor has access to the calling personality's context, whereas `SoulManager.deletePersonality()` is context-free.

### 3. `deletionProtected` flag

A `deletion_protected BOOLEAN NOT NULL DEFAULT false` column is added to `soul.personalities` (migration `036_personality_deletion_protected.sql`).

When `deletionProtected` is `true`, `SoulManager.deletePersonality()` throws:

```
This personality is protected from deletion. Disable "Protected from deletion" in its settings first.
```

The executor's outer `try/catch` converts this throw to `{ isError: true, output: { error: ... } }`. The soul routes' DELETE handler also calls `soulManager.deletePersonality()`, so the same guard applies to direct API calls.

The flag flows through the full stack:

```
migration 036
  → soul.personalities.deletion_protected (DB)
  → PersonalityRow.deletion_protected (storage interface)
  → rowToPersonality() → Personality.deletionProtected (domain type)
  → PersonalitySchema.deletionProtected (shared Zod schema)
  → PersonalityCreate / PersonalityUpdate (via schema derivation — no extra code)
  → SoulManager.deletePersonality() guard
  → creation-tool-executor.ts (outer catch)
  → Dashboard PersonalityEditor.tsx (UI toggle)
```

### 4. `locked` reserved for edit-immutability

`locked` is intentionally **not** introduced in this ADR. When it is implemented it will mean "this personality's fields cannot be edited (create/update calls are blocked)". Keeping the names distinct avoids confusion and allows independent rollout.

---

## Consequences

**Positive**
- The AI creation surface is now symmetric: every resource that can be created can also be deleted (subject to capability gates).
- Self-deletion is impossible at the executor layer — no UI or admin bypass needed for this specific guard.
- `deletionProtected` provides a durable, operator-controlled safeguard for mission-critical personalities.
- The Zod schema derivation means no manual maintenance of `PersonalityCreate` / `PersonalityUpdate` for the new field.

**Negative / Trade-offs**
- Create and delete share the same `creationConfig` toggle — a personality cannot create without also being able to delete. Granular gating requires a future RBAC extension.
- The self-deletion guard is in the executor, which means a direct `soulManager.deletePersonality(activePersonalityId)` call (e.g. a custom script) bypasses it. The `isActive` guard in the manager remains the last line of defence for the active personality.

---

## Alternatives Considered

**Separate `canDelete` toggle per resource type** — rejected as premature complexity; one toggle per resource family is sufficient for the current use cases.

**Self-deletion guard in `SoulManager`** — the manager has no concept of "which personality is currently calling". Injecting that context into the manager would couple it to the execution layer. The executor is the right boundary.

**`locked` flag now** — deferred. The user experience and RBAC model for edit-immutability are not yet designed. Adding the DB column and UI toggle now without the enforcement logic would be misleading.

---

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/storage/migrations/036_personality_deletion_protected.sql` | New migration: `deletion_protected BOOLEAN NOT NULL DEFAULT false` |
| `packages/core/src/storage/migrations/manifest.ts` | Added migration 036 |
| `packages/shared/src/types/soul.ts` | `PersonalitySchema.deletionProtected` (auto-flows to Create/Update) |
| `packages/core/src/soul/storage.ts` | `PersonalityRow.deletion_protected`, `rowToPersonality()`, INSERT `$13`, UPDATE `$11` |
| `packages/core/src/soul/manager.ts` | `deletePersonality()` checks `deletionProtected` before storage delete |
| `packages/core/src/soul/creation-tools.ts` | `delete_personality`, `delete_custom_role`, `revoke_role`, `delete_experiment` tools; `deletionProtected` param on create/update personality tools |
| `packages/core/src/soul/creation-tool-executor.ts` | Executor cases for all four new tools; self-deletion guard |
| `packages/core/src/ai/chat-routes.ts` | `delete_personality`, `delete_experiment`, `delete_custom_role`, `revoke_role` added to `CREATION_TOOL_LABELS`; `revoke_` verb in `toolAction()` |
| `packages/dashboard/src/types.ts` | `Personality.deletionProtected: boolean` |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | "Protected from deletion" checkbox toggle |
| `packages/core/src/soul/manager.test.ts` | `deletionProtected` fixture field; guard test; creation tool injection tests |
| `packages/core/src/soul/storage.test.ts` | `deletion_protected` fixture field; `deletionProtected` mapping tests |
| `packages/core/src/soul/creation-tool-executor.test.ts` | Tests for delete_personality, delete_custom_role, revoke_role, delete_experiment |

---

## Future Work

- **`locked` flag** — edit-immutability for personalities; blocked until RBAC model for "who can unlock" is designed.
- **Granular create/delete capability gates** — separate `canCreate` / `canDelete` toggles per resource type within `creationConfig`.
- **Bulk-delete protection** — `deletionProtected` currently only applies to single-personality delete; a bulk-reset or migration tool could bypass it.
