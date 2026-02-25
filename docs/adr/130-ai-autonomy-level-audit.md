# ADR 130 — AI Autonomy Level Audit

**Status**: Accepted
**Date**: 2026-02-24
**Phase**: 49

---

## Context

Phase 48 delivered machine-readable organizational intent — structured goals, signals, authorized actions, hard boundaries, and trade-off profiles. This creates a rich governance layer for agent behaviour at runtime.

However, Phase 48 left one gap: there was no mechanism to classify *how autonomous* each skill and workflow is, to ensure that classification is intentional and documented, and to periodically review it. Without this:

- Operators had no formal record of which agents operate at high autonomy levels.
- There was no structured process for reviewing and confirming that each agent's effective autonomy level matches its intended design.
- Emergency stop procedures for high-autonomy agents were ad-hoc or absent.
- The escalation risk (a skill accidentally becoming more autonomous after a config change) was undetected.

The need for a formal autonomy classification framework is well established in the AI safety literature. Two frameworks were considered:

1. **Knight First Amendment Institute** (arXiv:2506.12469, 2025) — defines five levels of autonomy (L1 Operator through L5 Observer) based on the degree of human involvement in each action.
2. **Google DeepMind Intelligent AI Delegation** (arXiv:2602.11865, Feb 2026) — addresses task allocation, authority transfer, and accountability in mixed human-AI delegation networks.

Both frameworks were adopted: the Knight framework for the level taxonomy, the DeepMind framework for the Section C accountability checklist.

---

## Decision

### 1. Add `autonomyLevel` and `emergencyStopProcedure` to skills and workflows

Both the `SkillSchema` (shared types) and `WorkflowDefinitionSchema` gain two new optional fields:

- `autonomyLevel: AutonomyLevelSchema` — one of `'L1' | 'L2' | 'L3' | 'L4' | 'L5'`, defaulting to `'L1'` for skills and `'L2'` for workflows.
- `emergencyStopProcedure: string (optional)` — displayed in the Emergency Stop Registry for L4/L5 items.

These fields are governance documentation only. They do not affect runtime behaviour. The existing `automationLevel` field on personality body config (`full_manual | semi_auto | supervised_auto`) continues to control approval queue behaviour and is orthogonal.

### 2. Escalation warning on PUT skill/workflow

When a skill or workflow is saved with a higher `autonomyLevel` than its previous value, the API response includes a `warnings[]` array containing an escalation message. The dashboard intercepts this and shows a confirmation modal. The save is not blocked — the warning is a post-hoc governance prompt consistent with the Phase 44 credential warning pattern.

### 3. Audit run system

A new `autonomy_audit_runs` table stores structured audit runs. Each run contains a JSONB array of 16 checklist items across four sections:

| Section | Items | Topic |
|---------|-------|-------|
| A | 4 | Inventory |
| B | 4 | Level Assignment Review |
| C | 5 | Authority & Accountability (DeepMind lens) |
| D | 3 | Gap Remediation |

Each item has a status (`pending | pass | fail | deferred`) and a free-text note. Finalizing a run generates a Markdown report and a JSON summary, both persisted to the DB.

### 4. REST API

Seven new endpoints under `/api/v1/autonomy/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/overview` | All enabled skills + workflows grouped by level |
| GET | `/audits` | List all audit runs |
| POST | `/audits` | Create a new audit run |
| GET | `/audits/:id` | Get a single audit run |
| PUT | `/audits/:id/items/:itemId` | Update a checklist item |
| POST | `/audits/:id/finalize` | Generate and persist the report |
| POST | `/emergency-stop/:type/:id` | Disable a skill or workflow (admin only) |

### 5. Dashboard UI

Three panels added to the **Security → Autonomy** tab:

- **Overview Panel** — filterable table of all skills and workflows with level badges (L1=green through L5=red), emergency stop procedure text, and click-through to the editor.
- **Audit Wizard** — guided step-through of Sections A–D. Each item has pass/fail/deferred buttons + a note field. Step 5 finalizes and displays the rendered Markdown report.
- **Emergency Stop Registry** — filtered view of L5 items. Each row shows the stop procedure and a red "Emergency Stop" button (disabled unless `role === 'admin'`). Click triggers a confirmation modal.

---

## Consequences

### Positive

- Operators have a formal, auditable record of every agent's intended oversight level.
- The escalation warning catches accidental level increases at save time.
- The 16-item checklist provides a consistent quarterly review procedure compatible with AI governance frameworks.
- Emergency stop is one click away for admins, with a full audit trail.
- The governance layer is additive — existing skills and workflows default to L1/L2 and require no changes to continue functioning.

### Negative / Trade-offs

- **Post-save warning model**: The escalation warning appears after the save is committed, not before. This is consistent with the Phase 44 pattern but means the operator must save twice to revert an accidental escalation. A pre-save confirmation would require a two-phase API — deferred for simplicity.
- **Emergency stop is not a kill switch for in-flight runs**: Disabling a workflow sets `isEnabled: false` on the definition but does not cancel running executions. Operators must use the workflow cancellation mechanism separately for active runs.
- **Two columns per table**: DB migration adds `autonomy_level` and `emergency_stop_procedure` to both `soul.skills` and `workflow.definitions`. Both columns have safe defaults (`'L1'`, `'L2'`, and `NULL`), so the migration is non-destructive for existing deployments.
- **Self-reported classification**: The autonomy level is operator-declared, not automatically inferred from runtime behaviour. An operator could classify a de-facto L4 skill as L1. The audit checklist (Section B, item B4) explicitly prompts reviewers to verify the declared level matches observed behaviour.

---

## Alternatives Considered

### Block the save on escalation (pre-save confirmation)

Would require a two-phase API (`POST /validate` then `POST /apply`) or a confirmation token pattern. Adds complexity for a governance feature that does not affect runtime safety. Rejected in favour of the post-save warning consistent with Phase 44.

### Store autonomy level in `OrgIntent.context[]` only

Would avoid schema changes to skills and workflows. Rejected because the per-resource field enables the overview panel, escalation detection, and emergency stop registry — none of which are practical if the data lives in a freeform KV store.

### Use a numeric field (1–5) instead of enum

Enum strings (`'L1'`–`'L5'`) are self-documenting in API responses and DB queries. Rejected numeric approach.

---

## Related

- [ADR 128 — Machine Readable Organizational Intent](./128-machine-readable-organizational-intent.md)
- [ADR 127 — Skill Routing Quality](./127-skill-routing-quality.md)
- [AI Autonomy Audit Guide](../guides/ai-autonomy-audit.md)
- [Organizational Intent Guide](../guides/organizational-intent.md)
