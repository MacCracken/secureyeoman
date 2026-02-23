# ADR 107: creationConfig Tool Injection

**Date**: 2026-02-22
**Status**: Accepted

---

## Context

### Bug

Personalities can have individual resource-creation abilities toggled on via the edit/create view (e.g. `creationConfig.skills = true`, `creationConfig.tasks = true`). These toggles are stored on `personality.body.creationConfig` and already surface in the system prompt via `composeBodyPrompt()` as text like:

```
### Creation Permissions
skills: allowed, tasks: allowed, personalities: denied, …
```

However, **no corresponding `Tool` definitions** were ever injected into the AI's tool list. The model could read that it had permission but had no structured function signatures to actually exercise that permission. This was a silent capability gap: the AI might hallucinate an API shape, produce malformed tool calls, or simply not attempt the operation at all.

The problem was context-agnostic — it affected dashboard chat, integration messages, heartbeat tasks, and any other path that called `SoulManager.getActiveTools()`.

---

## Decision

### New file: `packages/core/src/soul/creation-tools.ts`

Defines a `Tool` schema for every resource type controlled by `CreationConfig` and exports a single aggregator:

```ts
export function getCreationTools(config: CreationConfig, bodyEnabled: boolean): Tool[]
```

Rules:
- Returns `[]` when `bodyEnabled` is `false` — a disabled body has no creation capabilities regardless of individual toggles.
- Returns only tools whose corresponding toggle is `true` — no tool is injected for a `false` toggle.

Tool coverage by toggle:

| `creationConfig` key | Tools injected |
|---|---|
| `skills` | `create_skill`, `update_skill`, `delete_skill` |
| `tasks` | `create_task`, `update_task` |
| `personalities` | `create_personality`, `update_personality` |
| `subAgents` | `delegate_task`, `list_sub_agents`, `get_delegation_result` (from `agents/tools.ts`) |
| `customRoles` | `create_custom_role` |
| `roleAssignments` | `assign_role` |
| `experiments` | `create_experiment` |
| `allowA2A` | `a2a_connect`, `a2a_send` |
| `allowSwarms` | `create_swarm` (from `agents/tools.ts`) |
| `allowDynamicTools` | `register_dynamic_tool` |

Sub-agent and swarm tools are imported from `agents/tools.ts` to keep definitions canonical and avoid drift.

### Change to `SoulManager.getActiveTools()`

`getActiveTools(personalityId?)` is the single injection point used by every context that calls the AI with tools (chat routes, integration paths, etc.). It now:

1. Resolves the personality (by `personalityId` when provided, otherwise the active personality).
2. Gathers skill-based tools from Brain or Soul storage (unchanged).
3. Calls `getCreationTools(personality.body.creationConfig, personality.body.enabled)` and appends the result.

This ensures creation tools flow through **all** contexts without requiring changes in chat-routes, message-router, or any integration-specific handler.

---

## Consequences

### Positive
- Personality creation capabilities are now exercisable across all interaction contexts — dashboard chat, integrations, heartbeat, CLI, etc.
- Tool definitions match the existing REST API schemas (`POST /api/v1/soul/skills`, `POST /api/v1/tasks`, `POST /api/v1/experiments`, `POST /api/v1/auth/roles`, etc.).
- Zero new API endpoints required.

### Constraints / Notes
- `allowA2A` and `allowDynamicTools` are also gated by global security policy (`config.security.allowA2A`, `config.security.allowDynamicTools`). The tools are injected when the per-personality toggle is `true`, but execution-time enforcement by the global gate remains unchanged. The AI will see the tool schema even when the global gate is off; attempts to call these tools without global permission will fail gracefully at the API layer.
- This only provides tool *schemas* — a full execution loop (tool call → server-side handler → result → follow-up message) is required to close the feedback cycle. Single-turn chat routes do not yet implement this loop; the schemas ensure the AI model can generate correctly-structured tool calls when an agentic loop is present.
