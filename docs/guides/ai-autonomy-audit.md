# AI Autonomy Level Audit Guide

Phase 49 introduces a formal governance layer for classifying every skill and workflow in a SecureYeoman deployment against a five-level autonomy framework. The audit ensures each agent operates at an explicitly chosen and documented oversight level — not by accident.

> **Framework source:** *"Levels of Autonomy for AI Agents"* — Knight First Amendment Institute (arXiv:2506.12469, 2025). Companion framing: *"Intelligent AI Delegation"* — Google DeepMind (arXiv:2602.11865, Feb 2026).

---

## The Five Autonomy Levels

Autonomy is defined as the extent to which an agent acts without user involvement. As the level rises, the human role shifts from active driver to passive monitor.

| Level | Human Role | Agent Behaviour | Control Mechanism |
|-------|------------|-----------------|-------------------|
| **L1** | **Operator** | Executes on direct command only | Human issues every instruction |
| **L2** | **Collaborator** | Shares planning and execution; fluid handoffs | Either party can steer |
| **L3** | **Consultant** | Agent leads; pauses for human expertise or preferences | Agent asks targeted questions |
| **L4** | **Approver** | Agent operates independently; surfaces high-risk decisions | Explicit approval gate |
| **L5** | **Observer** | Agent acts fully autonomously within constraints | Audit feed + hard boundaries + emergency stop |

### SecureYeoman Examples

| Level | Example in SecureYeoman |
|-------|-------------------------|
| L1 | MCP tool called explicitly by the user in chat |
| L2 | Sub-agent working alongside the user through a task breakdown |
| L3 | Deep-research skill that runs autonomously but checks in on ambiguous scope |
| L4 | Authorized-action engine with `autonomyVsConfirmation` set between 0.4 and 0.6 |
| L5 | Fully autonomous background agent bounded by Phase 48 hard boundaries |

---

## `autonomyLevel` vs `automationLevel`

These two fields coexist and serve different purposes:

| Field | Location | Purpose |
|-------|----------|---------|
| `autonomyLevel` | Skill / Workflow | **Documentation / governance** — the intended human oversight tier for audit purposes |
| `automationLevel` | Personality body config | **Runtime** — controls the approval queue behaviour (`full_manual`, `semi_auto`, `supervised_auto`) |

Both fields should be set deliberately. A skill can be `automationLevel: semi_auto` for runtime queuing and `autonomyLevel: L3` for governance classification — they are orthogonal.

---

## Setting Autonomy Levels

### Via the Dashboard

Open **Settings → Security → Autonomy** to see the overview panel. To edit a skill's autonomy level, navigate to **Personality → Skills**, select a skill, and choose a level from the **Autonomy Level** dropdown.

For L4 or L5 skills, the form exposes an **Emergency Stop Procedure** field — document exactly how the skill is disabled in an emergency.

### Via the API

```bash
# Update skill autonomy level
curl -X PUT http://localhost:18789/api/v1/soul/skills/<skill-id> \
  -H "Content-Type: application/json" \
  -d '{
    "autonomyLevel": "L3",
    "emergencyStopProcedure": "Navigate to Security → Autonomy → Emergency Stop Registry and click Stop."
  }'
```

If you raise the level (e.g. L2 → L4), the response includes a `warnings` array prompting you to confirm the change:

```json
{
  "skill": { ... },
  "warnings": [
    "Autonomy escalated from L2 to L4 — confirm this changes the human oversight level"
  ]
}
```

In the dashboard, this surfaces as a confirmation modal before saving.

---

## Running an Audit

### Via the Dashboard (Recommended)

1. Open **Security → Autonomy → Run Audit**.
2. Enter a name (e.g. *"Q1 2026 Autonomy Review"*) and click **Start Audit**.
3. Work through Sections A–D — mark each item **Pass**, **Fail**, or **Deferred** and add a note.
4. Click **Finalize & Generate Report** — the system produces a timestamped Markdown report and JSON summary.
5. Download or share the report link with your compliance team.

### Via the API

```bash
# 1. Create a run
curl -X POST http://localhost:18789/api/v1/autonomy/audits \
  -H "Content-Type: application/json" \
  -d '{ "name": "Q1 2026 Autonomy Review" }'

# 2. Update an item (A1 = first inventory item)
curl -X PUT http://localhost:18789/api/v1/autonomy/audits/<run-id>/items/A1 \
  -H "Content-Type: application/json" \
  -d '{ "status": "pass", "note": "All skills reviewed and classified" }'

# 3. Finalize
curl -X POST http://localhost:18789/api/v1/autonomy/audits/<run-id>/finalize
```

---

## Audit Checklist Reference

### Section A — Inventory

| ID | Check |
|----|-------|
| A1 | List every active skill and classify its autonomy level (L1–L5) |
| A2 | List every active workflow and identify all nodes where human approval is required vs. absent |
| A3 | List all background agents and confirm each has an associated hard boundary in `OrgIntent.hardBoundaries[]` |
| A4 | List all signal-triggered actions and confirm each maps to an `authorizedActions[]` entry with `conditions` set |

### Section B — Level Assignment Review

| ID | Check |
|----|-------|
| B1 | For each L3 item: confirm there is a documented `useWhen`/`doNotUseWhen` and a defined escalation path |
| B2 | For each L4 item: confirm the approval gate is reachable and `autonomyVsConfirmation` is deliberately set |
| B3 | For each L5 item: confirm a hard boundary and emergency stop path exist |
| B4 | Verify no item is *de facto* operating at a higher level than its documented classification |

### Section C — Authority & Accountability

| ID | Check |
|----|-------|
| C1 | **Task allocation** — each delegated task has a clear owner; no orphaned tasks |
| C2 | **Authority transfer** — escalation from L3→L4 or L4→L5 requires explicit configuration, not drift |
| C3 | **Accountability mechanisms** — every L4/L5 action produces an audit event surfaced in the Security Feed |
| C4 | **Intent communication** — the active `OrgIntent` document reflects current goals, authorized actions, and boundaries |
| C5 | **Trust calibration** — trade-off profiles reviewed with stakeholders who act as Approver or Observer |

### Section D — Gap Remediation

| ID | Check |
|----|-------|
| D1 | For items where current default level > desired level: add an approval gate, restrict `authorizedActions[]`, or lower `autonomyVsConfirmation` |
| D2 | For L5 items missing an emergency stop path: block promotion until the stop mechanism is implemented and tested |
| D3 | Document the agreed level for each item in `OrgIntent.context[]` as a stable org fact |

---

## Emergency Stop

The Emergency Stop Registry (Security → Autonomy → Emergency Stop) lists every L5 skill and workflow with its documented stop procedure.

**To execute an emergency stop:**

1. Open **Security → Autonomy** and scroll to **Emergency Stop Registry**.
2. Locate the skill or workflow to disable.
3. Click the red **Emergency Stop** button (requires `admin` role).
4. Confirm the action — the item is immediately disabled (`enabled: false` for skills, `isEnabled: false` for workflows).
5. An `autonomy_emergency_stop` audit event (severity: warning) is recorded in the Security Feed.

**Via the API (admin token required):**

```bash
curl -X POST http://localhost:18789/api/v1/autonomy/emergency-stop/skill/<skill-id>
```

> **Note:** Emergency stop disables the skill or workflow but does not cancel in-flight workflow runs. If a run is active, use the workflow cancellation mechanism separately.

---

## Escalation Warning Configuration

When any skill or workflow is saved with a higher `autonomyLevel` than its current value, the API response includes a `warnings` field. The dashboard intercepts this and shows a confirmation modal before the change is persisted.

This is intentional — the save *already happened* by the time the warning appears. If you cancel at the modal, the escalation is already in effect. To undo it, save the item again with the lower level.

Future versions may add a two-phase pre-save confirmation. For now, treat the warning as a post-hoc confirmation prompt.

---

## Quarterly Cadence Recommendation

| Deployment tier | Minimum audit frequency |
|-----------------|------------------------|
| L1–L2 only | Annual or on major capability changes |
| L3 present | Semi-annual |
| L4 present | Quarterly |
| L5 present | Quarterly + after every L5 skill or workflow change |

Run the audit before any production deployment that introduces new skills, MCP tools, or autonomous workflows.

---

## Related Documentation

- [Organizational Intent Guide](./organizational-intent.md)
- [Skill Routing Quality Guide](./skill-routing.md)
- [ADR 130: AI Autonomy Level Audit](../adr/130-ai-autonomy-level-audit.md)
- [Configuration Reference](../configuration.md)
