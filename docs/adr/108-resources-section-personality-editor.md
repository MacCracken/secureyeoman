# ADR 108: Resources Section in Personality Editor

**Date**: 2026-02-23
**Status**: Accepted
**See also**: ADR 057 (swarms policy & per-personality sub-agent settings), ADR 059 (dynamic tool creation), ADR 107 (creationConfig tool injection)

---

## Context

The Personality Editor's Body section contained a flat "Resource Creation" `CollapsibleSection` mixing two conceptually distinct capability categories:

1. **Resource creation** — abilities to create persistent entities: tasks, skills, experiments, personalities, custom roles, role assignments. These work immediately via always-available managers and require no system-level infrastructure toggle.

2. **Orchestration** — abilities that coordinate or extend the agent runtime: sub-agent delegation (+ A2A networks, agent swarms nested beneath it), workflow execution, and dynamic tool creation. These depend on system-level managers (`SubAgentManager`, `SwarmManager`, `WorkflowManager`) which are only initialized when the corresponding `delegation.enabled` / `a2a.enabled` flags are set in server config, and are gated by Security Settings policy toggles.

Mixing both in a single flat list created user confusion: turning on a toggle (e.g. Sub-Agent Delegation) appeared to grant the ability, but the underlying infrastructure might not be running. The UI gave no signal that orchestration capabilities have an extra dependency layer.

Additionally the section title ("Resource Creation") was misleading for orchestration items — creating a swarm or triggering a workflow is not "resource creation" in the same sense as creating a skill.

---

## Decision

The flat "Resource Creation" `CollapsibleSection` is replaced by a two-level structure:

```
Body - Endowments
└── Resources                          ← new parent section
    ├── [Enable all toggle]
    ├── Creation                       ← sub-section (was the entire section, formerly "Resource Creation")
    │   ├── New Tasks
    │   ├── New Skills
    │   ├── New Experiments
    │   ├── New Personalities
    │   ├── New Custom Roles
    │   └── Assign Roles
    └── Orchestration                  ← new sub-section
        ├── Sub-Agent Delegation
        │   ├── A2A Networks (nested)
        │   └── Agent Swarms (nested)
        ├── Workflows
        └── Dynamic Tool Creation
```

### Changes to `PersonalityEditor.tsx`

- `creationItems` array split into `resourceItems` (6 entries) and `orchestrationItems` (3 entries: subAgents, workflows, allowDynamicTools).
- `allCreationItems` combines both for the "Enable all" toggle calculation.
- `renderToggleRow` helper extracted to eliminate the duplicated toggle-row JSX across both sub-sections. The A2A/Swarms nested block lives inside `renderToggleRow` and only renders when `item.key === 'subAgents' && creationConfig.subAgents`.
- The Orchestration sub-section description surfaces the Security Settings dependency: *"Requires the corresponding toggle to be enabled in Settings > Security."*

### No backend changes

`CreationConfig` schema, `getCreationTools()`, `creation-tool-executor.ts`, and all API routes are unchanged. This is a UI-only reorganisation.

---

## Consequences

- **Clarity**: Users see at a glance that orchestration capabilities have a two-layer control (Security Settings system gate + per-personality opt-in).
- **No data migration**: `creationConfig` field names and types are unchanged; existing personality records are unaffected.
- **"Enable all" scope unchanged**: The toggle still covers all items in both sub-sections, respecting policy gates for blocked items.
- **Test coverage**: No new unit tests required — `creation-tools.ts` backend tests are unaffected. The UI restructuring is a presentational change covered by visual review.
