# ADR 132 — Governance Hardening (Phase 50)

**Status:** Accepted
**Date:** 2026-02-25
**Phase:** 50

---

## Context

Phase 48 (ADR 128) established the machine-readable organizational intent system with `hardBoundaries[]`, `policies[]`, and `goals[]`. Phase 49 (ADR 130) added the AI Autonomy Level Audit. Both phases deferred several items:

- Hard boundaries had a `rego` field that was stored but never evaluated.
- Policy evaluation used a bare `fetch()` to a hardcoded OPA path rather than a proper client.
- The `activeWhen` field on goals used a simple `key=value AND key=value` parser, not the CEL syntax the field comment promised.
- The `mcp_tool` data source type for signals had no dispatch implementation.
- The dashboard had no policy visibility surface.

Phase 50 closes all of these deferred items.

---

## Decisions

### 1. OPA Sidecar Pattern

**Decision:** OPA runs as a Docker/k8s sidecar via `openpolicyagent/opa:latest`. Policies are uploaded as raw Rego source via `PUT /v1/policies/{id}`.

**Rejected:** `@open-policy-agent/opa-wasm` — requires Rego pre-compiled to `.wasm` at build time. Cannot evaluate user-defined policies stored as source text at runtime.

**Security note:** User-defined Rego can contain `http.send` and `net.lookup_ip_addr`, enabling SSRF and data exfiltration. The OPA service is started with a `capabilities.json` that explicitly allowlists safe built-ins, blocking both builtins and all network builtins.

**Naming convention:**
- Hard boundary policies: `boundary_{id}/allow`
- Soft policies: `policy_{id}/allow`

OPA `allow = false` → violated. `allow = true` → permitted.

### 2. OpaClient Module

A new `packages/core/src/intent/opa-client.ts` module wraps the OPA REST API:
- `OpaClient.fromEnv()` — returns client if `OPA_ADDR` env var is set, `null` otherwise.
- `uploadPolicy(id, rego)` — `PUT /v1/policies/{id}` with raw Rego text.
- `deletePolicy(id)` — `DELETE /v1/policies/{id}`, ignores 404.
- `evaluate(path, input)` — `POST /v1/data/{path}`, returns `boolean | null`.
- `isHealthy()` — `GET /health`.

All OPA operations are non-fatal: network errors / timeouts fall back to natural-language rule matching.

`IntentManager` accepts an `opaClient?` dep injection parameter (defaults to `OpaClient.fromEnv()`). Passing `null` explicitly disables OPA (used in tests).

### 3. Hard Boundary OPA Evaluation

`checkHardBoundaries()` now calls `_matchesBoundaryWithOpa()` which:
1. If `OPA_ADDR` is set and the boundary has a `rego` field → evaluate `boundary_{id}/allow`.
2. OPA returns `false` (deny) → boundary is violated.
3. OPA returns `null` (network error / unavailable) → fall back to substring matching.
4. No OPA or no `rego` field → substring matching only.

This matches the pattern already used by `checkPolicies()` / `_matchesPolicy()`.

### 4. Policy Upload on Intent Save

`IntentManager.syncPoliciesWithOpa(record)` is a new public method that:
- Iterates `hardBoundaries[]` and `policies[]` in the intent record.
- Uploads any entry with a `rego` field via `uploadPolicy()`.
- Is called by `POST /api/v1/intent` (create) and `PUT /api/v1/intent/:id` (update).
- Upload errors are logged to stderr and do not fail the HTTP request.

**Note:** Policy deletion from OPA when boundaries/policies are removed is not yet automatic. A future improvement would diff the previous state and call `deletePolicy()` for removed IDs. For now, OPA retains stale policies; they are harmless since they are only evaluated when a matching boundary/policy is present in the intent doc.

### 5. CEL Expression Evaluation

**Decision:** Implement a CEL subset evaluator (`packages/core/src/intent/cel-evaluator.ts`) without an external dependency.

**Rejected:** `cel-js` and similar packages — adds a runtime dependency for a feature with limited complexity requirements.

**Implemented subset:**
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `&&`, `||`, `!` (and keyword aliases `AND`, `OR`, `NOT`)
- Grouping: parentheses `()`
- Literals: string `"..."` / `'...'`, number `42`, boolean `true`/`false`
- Field access: `key` (context lookup) or `ctx.key`

**Format detection heuristic:** If the expression contains quotes, `==`, `!=`, `&&`, `||`, `!`, `(`, or bare `TRUE`/`FALSE` → parse as CEL. Otherwise → use the legacy `key=value AND key=value` evaluator for backward compatibility.

**Permissive fallback:** A malformed CEL expression logs to stderr and returns `true` (permissive) so a typo in `activeWhen` never silently blocks all goals.

### 6. MCP Tool Signal Dispatch

`_fetchSignalValue()` now handles `ds.type === 'mcp_tool'` by calling an optional `callMcpTool` callback injected via `IntentManagerDeps`. The callback receives the tool name (`ds.connection`) and an optional input object (including `schema` from `ds.schema` if present). Returns `number | null`.

If `callMcpTool` is not configured (default), `mcp_tool` sources return `null` value (signal unavailable). `secureyeoman.ts` can inject the callback once the MCP manager is available.

### 7. Dashboard Policies Tab

`IntentEditor.tsx` gains a **Policies** tab that reads `activeIntent?.policies[]` and renders:
- Blocking policies (red badge) separated from warning policies (yellow badge)
- Per-policy card: ID, rule, enforcement badge, OPA Rego badge (when `rego` field present), rationale
- Expandable Rego source view with monospace block
- Summary counts and explanation of `policy_block` / `policy_warn` enforcement log events

---

## Consequences

### Positive
- OPA sidecar provides a standards-based, battle-tested policy engine for governance enforcement.
- Hard boundaries gain Rego evaluation parity with soft policies.
- CEL expressions enable richer goal activation conditions (range checks, disjunctions, negation).
- MCP signal dispatch closes the `mcp_tool` data source stub.
- Policy visibility in the dashboard surfaces governance state to operators without requiring developer mode.

### Negative / Trade-offs
- OPA sidecar is optional (gated by `OPA_ADDR`). Without it, Rego fields are stored but never evaluated — operators need to run the `opa` Docker profile.
- Stale OPA policies accumulate when boundaries/policies are removed from intent docs (no active cleanup). Acceptable for now; harmless.
- The `callMcpTool` callback must be wired in `secureyeoman.ts` to enable MCP signal dispatch; it is a no-op until that wiring is added.
- CEL subset covers common use cases but lacks string builtins (`contains()`, `startsWith()`) — these can be added in a future pass.

---

## References

- ADR 128 — Machine Readable Organizational Intent (Phase 48)
- ADR 130 — AI Autonomy Level Audit (Phase 49)
- [OPA REST API documentation](https://www.openpolicyagent.org/docs/latest/rest-api/)
- [CEL specification](https://github.com/google/cel-spec)
