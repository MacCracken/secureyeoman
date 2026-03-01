# ADR 168 — Soul Module Code Quality Improvements

**Date:** 2026-03-01
**Status:** Accepted
**Deciders:** Core team

---

## Context

A quality audit of `packages/core/src/soul/` identified four areas where the code contained technical debt: dead placeholder code, a module-level mutable global, a 460-line switch statement, and a hardcoded timeout constant.

---

## Decisions

### 1. Remove dead stubs in `skill-executor.ts`

`executeCodeAction` returned a fake success response (`{ message: 'Code execution placeholder', language }`) and `executeShellAction` always returned errors through two confusing code paths. Neither method was callable for real work.

**Resolution:** Both private methods removed. `executeAction` now dispatches only to `executeHttpAction`; code and shell action types fall through to the standard `'Action has no valid configuration'` error. HTTP-based actions remain fully functional.

**Why not implement them:** Sandboxed code/shell execution is a separate security subsystem tracked under a future ADR. A fake success is more harmful than a clear error.

### 2. Instance-level `colorIndex` in `collab.ts`

`let colorIndex = 0` was declared at module scope. All `CollabManager` instances shared a single counter, causing color collisions in test environments (multiple instances) and any production scenario using multiple managers (e.g., tests, hot-reload).

**Resolution:** `colorIndex` moved to a `private colorIndex = 0` instance field; `nextColor()` converted from a module-level function to a private method.

### 3. Handler map in `creation-tool-executor.ts`

The public `executeCreationTool` function contained a single `switch(toolCall.name)` statement spanning ~450 lines with 24 cases. Adding a new tool required locating the right position inside a monolithic block.

**Resolution:** Each case extracted into a typed handler in `TOOL_HANDLERS: Record<string, ToolHandler>`. The public function now performs gating logic, does a single map lookup (`TOOL_HANDLERS[toolCall.name]`), and falls through to the dynamic-tool registry check. Behaviour is identical; handlers are individually unit-testable.

### 4. Configurable `executionTimeoutMs` in `dynamic-tool-manager.ts`

`EXECUTION_TIMEOUT_MS = 10_000` was a module-level constant referenced in both `execute()` and `runWithTimeout()`. Operators with different latency profiles (e.g., embedded devices, long-running tools) could not adjust this without modifying source.

**Resolution:** `DynamicToolManagerDeps` gains an optional `executionTimeoutMs?: number` field. The constructor stores `deps.executionTimeoutMs ?? EXECUTION_TIMEOUT_MS` as `this.executionTimeoutMs` and uses it everywhere. The module constant becomes a well-documented default.

---

## Consequences

- **skill-executor.ts**: Code and shell action types now consistently return `'Action has no valid configuration'` instead of misleading placeholder output. Callers relying on the fake code-action success will receive an error.
- **collab.ts**: Multiple `CollabManager` instances (test isolation, hot-reload) each maintain an independent color counter.
- **creation-tool-executor.ts**: New creation tools added as a one-line entry in `TOOL_HANDLERS`. Existing behaviour unchanged; 91 tests confirm parity.
- **dynamic-tool-manager.ts**: Deployments with unusual timeout requirements can pass `executionTimeoutMs` to `DynamicToolManagerDeps`. The 10 s default is unchanged.

---

## Test coverage

| File | Tests before | Tests after | Net |
|------|-------------|-------------|-----|
| `skill-executor.test.ts` | 12 | 12 | 0 (stubs replaced with accurate assertions) |
| `collab.test.ts` | 17 | 19 | +2 (multi-instance isolation, color cycling) |
| `dynamic-tool-manager.test.ts` | 56 | 58 | +2 (custom timeout via deps, message verification) |
| `creation-tool-executor.test.ts` | 88 | 91 | +3 (handler map spot-check, unknown-tool fallthrough, list_dynamic_tools) |
