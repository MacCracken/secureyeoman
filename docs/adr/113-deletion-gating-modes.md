# ADR 113 — Deletion Gating Modes (Tri-State `deletionMode`)

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team
**See also:** ADR 111 (deletionProtected boolean, now superseded)

---

## Context

ADR 111 introduced a boolean `deletionProtected` flag on the `soul.personalities` table to block accidental deletion of key personalities. This was a safe first step, but Phase 38 Beta review identified that a boolean is too coarse for real-world use:

- Users want **confirmation dialogs** (protect without full block) — e.g., "I want to be asked before I accidentally delete."
- Security-conscious users want **hard blocks** (identical to the old `deletionProtected: true`).
- The default case needs to remain seamless — no friction for casual use.

Additionally, the old boolean was a separate DB column, decoupled from the `body` JSONB policy block where all other per-personality configuration lives.

---

## Decision

Replace `deletion_protected BOOLEAN` with a `deletionMode` enum stored in `body.resourcePolicy.deletionMode`.

### Modes

| Code value | UI label | Behaviour |
|---|---|---|
| `auto` | Auto | Deletion proceeds immediately with no confirmation. (Default) |
| `request` | Suggest | UI shows a confirmation dialog before deleting; AI-initiated deletion is blocked. |
| `manual` | Manual | Deletion is completely blocked at the backend; mode must be changed to proceed. |

### Schema change

Added `ResourcePolicySchema` to `packages/shared/src/types/soul.ts`:

```ts
export const ResourcePolicySchema = z.object({
  deletionMode: z.enum(['auto', 'request', 'manual']).default('auto'),
}).default({});
```

Added as an optional field on `BodyConfigSchema`:

```ts
resourcePolicy: ResourcePolicySchema.optional(),
```

Removed `deletionProtected: z.boolean().default(false)` from `PersonalitySchema`.

### Enforcement layers

1. **Manager** (`deletePersonality`): blocks `manual` mode; allows `request` (frontend enforces the dialog).
2. **AI Tool Executor** (`delete_personality`): blocks both `manual` and `request` — AI is never allowed to delete under either gated mode.
3. **Dashboard UI**: delete button shows locked message for `manual`; shows `ConfirmDialog` for `request`.

### Surface

The control is surfaced under **Body → Resources → Deletion** in `PersonalityEditor`.

### Migration

Migration 037 (`037_personality_deletion_mode.sql`):
- Rows with `deletion_protected = true` → `body.resourcePolicy.deletionMode = 'manual'`
- Drops the `deletion_protected` column

---

## Consequences

**Positive:**
- Three distinct UX behaviours instead of two.
- AI tool access respects human-in-the-loop requirements (gated modes).
- Deletion policy lives with other body/resource configuration in JSONB.
- No separate DB column to maintain.

**Negative:**
- Migration required (037).
- Clients that read `deletionProtected` directly from the API response must update.

---

## Alternatives Considered

- **Keep boolean + add `requestConfirmation`** — two flags creates confusion about which takes precedence.
- **Move to RBAC permissions** — overkill; deletion gating is per-personality, not per-role.

---

## Files Changed

| File | Change |
|---|---|
| `packages/shared/src/types/soul.ts` | Add `ResourcePolicySchema`; add `resourcePolicy` to `BodyConfigSchema`; remove `deletionProtected` |
| `packages/core/src/storage/migrations/037_personality_deletion_mode.sql` | Migration |
| `packages/core/src/storage/migrations/manifest.ts` | Register migration 037 |
| `packages/core/src/soul/storage.ts` | Remove `deletion_protected` from row type, INSERT, UPDATE, mapper |
| `packages/core/src/soul/manager.ts` | Update `deletePersonality()` for tri-state mode |
| `packages/core/src/soul/creation-tool-executor.ts` | Block AI deletion for `manual`/`request` modes |
| `packages/core/src/soul/creation-tools.ts` | Remove `deletionProtected` from tool schemas |
| `packages/core/src/soul/soul-routes.ts` | Remove `deletionProtected` from preset instantiation |
| `packages/core/src/soul/presets.ts` | Remove `deletionProtected: false` |
| `packages/dashboard/src/types.ts` | Update `Personality`/`PersonalityCreate` interfaces |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | Add Deletion subsection under Body → Resources |
