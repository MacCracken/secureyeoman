# ADR 169: Codebase Refactor Audit — Shared Helpers, Benchmarks & Type Extraction

**Date**: 2026-03-01
**Status**: Accepted
**Deciders**: Engineering

---

## Context

A systematic audit of the `packages/core` and `packages/mcp` codebases was conducted to identify redundancies, performance opportunities, and structural improvements. The audit targeted:

1. **Duplicate code** — patterns repeated across multiple files
2. **Type placement** — types defined in `core` that belong in `shared`
3. **Performance** — expensive repeated operations without caching
4. **Benchmark coverage** — absence of microbenchmark infrastructure

---

## Decisions

### 1. Performance Benchmarks (NEW)

Created Vitest bench files:
- `packages/core/src/security/input-validator.bench.ts` — covers clean inputs (33–8 000 chars), injection/XSS/unicode attack vectors, and the size-limit fast-path. Key finding: 8 KB inputs are 13× slower than 33-char inputs; injection detection adds ~1.75× overhead at 8 KB.
- `packages/core/src/workflow/workflow-engine.bench.ts` — covers `topologicalSort` (5/20/50-node linear, 10/30-node diamond), `resolveTemplate` (no-var, shallow, deep, complex), and `evaluateCondition` (valid + malformed error path). Key finding: malformed conditions are 4.5× slower due to the `new Function` error path.

`bench` scripts added to `packages/core/package.json` and root `package.json`.

### 2. Shared OAuth Fetch Helper (HIGH)

**Problem**: `fetchGithub()` / `githubErrorMessage()` in `github-api-routes.ts` and `fetchGmail()` / `gmailErrorMessage()` in `gmail-routes.ts` were identical 401-retry + error-formatting patterns (≈80 lines duplicated).

**Decision**: Extracted `packages/core/src/integrations/oauth-fetch.ts` providing:
- `fetchWithOAuthRetry(url, opts, authHeaders, tokenId, accessToken, svc, buildRefreshHeaders?)` — shared 401-auto-refresh with optional per-provider header rebuilding.
- `createApiErrorFormatter(apiName, overrides?)` — factory that builds a `(status, body) => string` error-message function with per-status overrides.

Both GitHub and Gmail route files refactored to use these helpers.

### 3. WorkflowEngine Condition Compile Cache (HIGH)

**Problem**: `evaluateCondition()` called `new Function(expr)` on every evaluation, even for recurring identical expressions.

**Decision**: Added `private readonly _conditionCache = new Map<string, Function>()` to `WorkflowEngine`. Expressions are compiled once and reused. Cache is unbounded (condition expressions are developer-authored and stable in volume).

### 4. MCP `registerApiProxyTool` Factory (MEDIUM)

**Problem**: Each MCP tool registration in `github-api-tools.ts` (13 tools) and `gmail-tools.ts` (7 tools) repeated the same `server.registerTool` → `wrapToolHandler` → `JSON.stringify(result)` boilerplate (≈15 lines per tool).

**Decision**: Added `registerApiProxyTool<T>(server, client, def)` to `packages/mcp/src/tools/tool-utils.ts`. The factory accepts a `ApiProxyToolDef<T>` descriptor with `buildPath`, optional `buildQuery`/`buildBody`, and `method`. Tools with custom response handling (e.g., `github_sync_fork`) remain as manual implementations.

### 5. DocumentManager Constructor Normalisation (MEDIUM)

**Problem**: `DocumentManager` constructor accepted `brainManager` and `storage` as positional arguments separately from a `deps` object, inconsistent with the Manager+Deps pattern used by all other managers.

**Decision**: Added `brainManager` and `storage` to the `DocumentManagerDeps` interface. Constructor changed to `constructor(deps: DocumentManagerDeps)`. Four call sites updated.

### 6. WorkflowTemplates Step Builder Helpers (MEDIUM)

**Problem**: Each workflow step in `workflow-templates.ts` was 10–15 lines of repeated object literal with only 2–3 values varying.

**Decision**: Added five private builder functions (`agentStep`, `transformStep`, `resourceStep`, `webhookStep`, `swarmStep`) that accept a `StepBase` + type-specific arguments. Templates 1 (`research-report-pipeline`) and 2 (`code-review-webhook`) refactored.

### 7. Move Validation Types to Shared (MEDIUM)

**Problem**: `ValidationResult`, `ValidationWarning`, and `ValidationContext` were defined in `packages/core/src/security/input-validator.ts`. The MCP layer needs these types without importing from `core`.

**Decision**: Moved the three interfaces to `packages/shared/src/types/security.ts`. Added exports to `packages/shared/src/types/index.ts`. `input-validator.ts` now imports-and-re-exports from `@secureyeoman/shared`.

### 8. `presets.ts` Dynamic `mcpFeatures` Derivation (LOW)

**Problem**: `BASE_BODY.mcpFeatures` in `presets.ts` listed all 19 boolean feature flags by hand. Adding a new flag required updating two files (`soul.ts` + `presets.ts`).

**Decision**: Replace the hardcoded block with `McpFeaturesSchema.parse({})`. Since every field in `McpFeaturesSchema` carries `.default(false)`, parsing an empty object yields the correct all-false defaults. New flags are automatically included.

### 9. Generic `withRetry()` Utility (LOW)

**Problem**: `RetryManager.execute()` is AI-specific (checks `AIProviderError.recoverable`). Integration routes that want exponential backoff for HTTP calls had no suitable utility.

**Decision**: Added `withRetry<T>(fn, policy?)` to `retry-manager.ts`. Accepts an optional `shouldRetry` predicate; defaults to the network-error heuristic (ECONNRESET, 502/503, timeout). Shares the jittered-exponential-backoff math from `RetryManager.calculateDelay()`.

---

## Consequences

- **+1 shared file**: `oauth-fetch.ts` — removes ≈80 lines of duplication across integration routes.
- **+1 exported utility**: `withRetry()` — integration routes can now use typed retry without depending on the AI layer.
- **Benchmark infrastructure**: `vitest bench` covers the two highest-throughput hot paths. Future contributors can run `npm run bench` in `packages/core` to measure regressions.
- **Type accessibility**: MCP and shared tools can import `ValidationResult`/`ValidationWarning`/`ValidationContext` from `@secureyeoman/shared` without a circular dependency.
- **Maintenance reduction**: `presets.ts` no longer needs manual updates when new MCP feature flags are added to `McpFeaturesSchema`.

---

## Alternatives Considered

- **Shared package for `withRetry`**: Could be moved to `@secureyeoman/shared`. Deferred — `shared` has no dependencies on timers/async infrastructure and adding `withRetry` there would mix utility and domain types. `core/ai` is the correct home for now.
- **LRU cache for condition compile**: Unbounded `Map` chosen since workflow condition expressions are authored by operators and bounded in practice. An LRU can be swapped in if memory profiling shows growth.
