# ADR 114 — Human-in-the-Loop Approval Workflow (Content Approval)

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team
**See also:** ADR 113 (Deletion Gating Modes), ADR 114 (this document)

---

## Context

Friday's suggestions (Phase 38/39 roadmap) identified a gap: the AI can perform mutations (create skills, create personalities, delete things) with no human review path. Three concerns were raised:

1. **Brand / quality control** — the AI might create content that doesn't align with project goals.
2. **Legal / strategic safety** — AI-initiated changes can have real downstream consequences.
3. **Emergency situations** — there's no kill-switch to freeze all AI-initiated mutations immediately.

ADR 113 already addressed deletion gating with a tri-state `deletionMode`. This ADR extends the `ResourcePolicySchema` with a broader automation level control and a global emergency stop.

---

## Decision

Extend `body.resourcePolicy` with two new fields:

### `automationLevel`

| Code | Label | Behaviour |
|---|---|---|
| `supervised_auto` (default) | Supervised Auto | All AI-initiated actions proceed immediately |
| `semi_auto` | Semi-Auto | Destructive AI actions (delete_*) are queued; creative actions proceed |
| `full_manual` | Full Manual | Every AI-initiated creation or deletion is queued for human approval |

### `emergencyStop`

Boolean (default `false`). When `true`, **all** AI-initiated mutations are immediately blocked regardless of `automationLevel`. Resets to `false` when explicitly unchecked by a human.

### Pending Approvals Queue

AI actions that require human approval are stored in `soul.pending_approvals` (migration 038). Each approval record contains:
- `personality_id` — the calling personality
- `tool_name` — which creation tool was invoked
- `tool_args` — the arguments (JSONB)
- `status` — `pending` | `approved` | `rejected`

The dashboard exposes a Review Queue badge + panel; operators can approve or reject pending actions via `POST /api/v1/soul/approvals/:id/approve` or `/reject`.

### Destructive Tools (for `semi_auto`)

`delete_skill`, `delete_personality`, `delete_custom_role`, `delete_experiment`, `delete_workflow`, `revoke_role`

---

## Enforcement

1. **creation-tool-executor.ts** — checks `emergencyStop` (block all) then `automationLevel` before any tool execution; creates `pending_approvals` record when queuing.
2. **ApprovalManager** — manages the CRUD for pending approvals.
3. **soul-routes.ts** — exposes REST endpoints for listing, approving, and rejecting approvals.
4. **PersonalityEditor** — surfaces `automationLevel` (radio group) and `emergencyStop` (checkbox) in Body → Resources.

---

## Consequences

**Positive:**
- Human-in-the-loop is now enforceable at the personality level without code changes.
- Emergency Stop gives immediate crisis control.
- Audit trail preserved: all queued actions have timestamps and resolution metadata.

**Negative:**
- Approved actions are not yet automatically re-executed (operators must re-trigger manually or via a future "execute approved" endpoint).
- No WebSocket push notification for new pending approvals (polling via count endpoint).

---

## Files Changed

| File | Change |
|---|---|
| `packages/shared/src/types/soul.ts` | Add `automationLevel` and `emergencyStop` to `ResourcePolicySchema` |
| `packages/core/src/storage/migrations/038_pending_approvals.sql` | New `soul.pending_approvals` table |
| `packages/core/src/storage/migrations/manifest.ts` | Register migration 038 |
| `packages/core/src/soul/approval-manager.ts` | New `ApprovalManager` class |
| `packages/core/src/soul/soul-routes.ts` | Approval CRUD endpoints; `approvalManager` option |
| `packages/core/src/soul/creation-tool-executor.ts` | Emergency stop + automation level gating at top of executor |
| `packages/core/src/secureyeoman.ts` | Import + init + expose `ApprovalManager` |
| `packages/core/src/gateway/server.ts` | Pass `approvalManager` to `registerSoulRoutes` |
| `packages/dashboard/src/types.ts` | Add `automationLevel`, `emergencyStop` to `resourcePolicy` type |
| `packages/dashboard/src/api/client.ts` | Add `fetchSoulApprovals`, `approveSoulAction`, `rejectSoulAction` |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | Add Automation Level and Emergency Stop sections in Body → Resources |
| `packages/core/src/soul/creation-tool-executor.test.ts` | Tests for emergency stop and automation level gating |
