# ADR 110: Resource Action Recording — Unified Persistence in Chat Routes

**Date**: 2026-02-23
**Status**: Accepted
**See also**: ADR 107 (creation-config tool injection), ADR 001 (dashboard chat)

---

## Context

### The Before State

After ADR 107 introduced the full agentic tool-execution loop in `chat-routes.ts`, creation tools (`create_skill`, `create_task`, `create_workflow`, etc.) were executed but their outcomes had two separate, inconsistently applied recording mechanisms:

1. **Sparkle cards** — `CreationEvent` objects collected during the loop and sent to the frontend as `creationEvents` in the chat response. These appeared as visual "chip" cards in the chat bubble, giving the user immediate feedback that a resource was created.

2. **Task history entries** — Records written to `taskStorage` so the action appeared in the Task History view in the dashboard.

The two mechanisms shared no common logic, which led to:

- **Workflow tools missing entirely** — `create_workflow`, `update_workflow`, `delete_workflow`, and `trigger_workflow` were absent from `CREATION_TOOL_LABELS`, so they produced neither a sparkle card nor a history entry.
- **Missing `await`** — `taskStorage.storeTask()` in `creation-tool-executor.ts` was called without `await`, making it a fire-and-forget write. On any meaningful I/O latency the DB write could be skipped entirely.
- **Split ownership** — `creation-tool-executor.ts` called `storeTask` for `create_task` (the fallback path), while `chat-routes.ts` called it for every other tool. This meant `create_task` and `update_task` had to be explicitly excluded in `chat-routes.ts` to avoid double-writing.
- **Hardcoded "created" verb** — sparkle cards always read "Skill created:", "Workflow created:", even when the tool performed an update or deletion.

### Symptom

After "probe your ability to create a skill, also attempt to delete it" the chat correctly showed "Skill created: Test Probe Skill" but the Task History view was empty. Workflow operations showed "Workflow created: delete_workflow" regardless of the actual operation.

---

## Decision

### `CreationEvent` gains an `action` field

```ts
export interface CreationEvent {
  tool: string;
  label: string;
  action: string;  // ← new
  name: string;
  id?: string;
}
```

### `toolAction()` derives the verb from the tool name prefix

```ts
const toolAction = (toolName: string): string => {
  if (toolName.startsWith('create_'))  return 'Created';
  if (toolName.startsWith('update_'))  return 'Updated';
  if (toolName.startsWith('delete_'))  return 'Deleted';
  if (toolName.startsWith('trigger_')) return 'Triggered';
  if (toolName.startsWith('assign_'))  return 'Assigned';
  if (toolName === 'a2a_connect')      return 'Connected';
  if (toolName === 'delegate_task')    return 'Delegated';
  return 'Created';
};
```

### `CREATION_TOOL_LABELS` is extended to cover workflow operations

```ts
create_workflow: 'Workflow',
update_workflow: 'Workflow',
delete_workflow: 'Workflow',
trigger_workflow: 'Workflow Run',
```

`trigger_workflow` uses `out.run` to extract the result item, and `item?.workflowName` as the name fallback (a `WorkflowRun` record carries `workflowName`, not `name`).

### A single unified recording block handles every recognised tool

After each tool call in the agentic loop, if `CREATION_TOOL_LABELS[toolCall.name]` exists and `result.isError` is false:

```
┌─ resolve label, action, name, id from result ──────────────────┐
│                                                                  │
│  sparkle card  →  push to creationEvents[]                       │
│  task history  →  taskStorage.storeTask(...)  [if available]     │
└──────────────────────────────────────────────────────────────────┘
```

Status for the history entry is derived from the result item rather than hardcoded:

```ts
const status =
  typeof item?.status === 'string' ? (item.status as any) : TaskStatus.COMPLETED;
```

This means a freshly created task shows up in history as `pending`, while all other resource actions (skills, workflows, personalities, roles, etc.) show as `completed`.

### `creation-tool-executor.ts` no longer owns storage

The `create_task` fallback path previously called `await taskStorage.storeTask(task)` before returning. This call is removed. The executor's contract is: **execute the operation and return the result**. Storage is always the caller's responsibility.

Consequences:
- The `taskStorage` variable is no longer needed in the `create_task` case; the guard `if (!taskStorage) return error` is removed.
- `create_task` and `update_task` are no longer special-cased in `chat-routes.ts`; the uniform recording path covers them.

---

## Consequences

### Positive
- All resource operations — skills, tasks, personalities, experiments, workflows, role assignments, A2A connections, delegations — appear in Task History through one code path.
- Sparkle card labels now reflect the actual operation: "Workflow Deleted: My Pipeline" rather than "Workflow created: delete_workflow".
- The executor is a pure execution layer with no storage side-effects.

### Trade-offs / Notes
- For `create_task` via `taskExecutor.submit()`: the executor task is stored internally by the task executor; the chat-routes recording creates a separate activity entry (with its own generated ID) in the history. These are distinct records — one is the runnable task, the other is an audit of the AI action that created it.
- For `create_task` without a `taskExecutor` (rare fallback): the task object is returned but not persisted by the executor. Chat-routes creates an audit record. The task itself exists only in memory and is not runnable without a task executor. This was always the case; the prior `storeTask` call in the executor created a phantom pending record that no executor would ever pick up.
- `update_task` result has no `name` field in its output (`{ updated: true, id }`); the history entry name falls back to the `name` argument if present in the tool call arguments.
