# ADR 128 — Machine Readable Organizational Intent

**Status**: Accepted
**Date**: 2026-02-24
**Phase**: 48

---

## Context

Agent guidance in SecureYeoman was previously embedded ad-hoc in personality system prompts, Slack messages, and onboarding wikis. This made it hard to version, audit, or reason about programmatically. Agents lacked a formal way to know:

- What the organization is trying to achieve right now
- What signals indicate success
- What actions they are explicitly authorized to take
- How to navigate trade-offs when decisions are ambiguous
- Where the hard limits are

## Decision

Introduce a structured, versioned `OrgIntent` document format with 8 top-level sections:

1. **`goals[]`** — active objectives with priority, success criteria, and `activeWhen` conditions
2. **`signals[]`** — live numeric indicators tied to data sources (HTTP, MCP, DB)
3. **`dataSources[]`** — registry of data source connections for signal evaluation
4. **`authorizedActions[]`** — explicit permission scope (distinct from capability-describing skills)
5. **`tradeoffProfiles[]`** — named stances for speed/thoroughness, cost/quality, autonomy/confirmation
6. **`hardBoundaries[]`** — inviolable constraints with `deny:` or `tool:` rule syntax
7. **`delegationFramework`** — org tenants → concrete decision boundaries per principle
8. **`context[]`** — flat KV store for stable org facts (orgName, industry, etc.)

### Schema

`OrgIntentDocSchema` defined using Zod in `packages/core/src/intent/schema.ts`. All sections optional for incremental adoption. Stored as JSONB in `org_intents` table; single-active constraint enforced by a partial unique index.

### Manager sub-systems

- **GoalResolver**: `activeWhen` evaluation using simple `key=value AND key=value` conjunction syntax — no CEL dependency, safe for Phase 48
- **SignalMonitor**: HTTP fetch to data source `connection` URL, caches with TTL equal to `signalRefreshIntervalMs`, background polling interval
- **TradeoffResolver**: finds `isDefault=true` profile, supports caller overrides
- **DelegationFrameworkResolver**: flattens tenant principles → boundaries for prompt injection
- **HardBoundaryEnforcer**: substring matching for `deny:` prefix, `tool:` prefix, or bare rules
- **AuthorizedActionChecker**: role + goal-applicability check
- **`composeSoulContext()`**: assembles 4 prompt blocks injected after the Available Skills section

### Hard boundary rule evaluation

Three rule patterns supported in Phase 48:
- `deny: <phrase>` — blocks if action description contains phrase (case-insensitive)
- `tool: <name>` — blocks if MCP tool name contains the suffix
- bare rule — substring match against action description

Full OPA/Rego evaluation is deferred to Phase 48.5.

### Prompt injection

When an active intent doc exists, `SoulManager.composeSoulPrompt()` appends four sections after `## Available Skills`:

```
## Organizational Goals
## Organizational Context
## Trade-off Profile
## Decision Boundaries
```

These are only injected when they have content (empty sections omitted).

### Signal refresh

Background `setInterval` runs at `signalRefreshIntervalMs` (default 5 min). The timer is `.unref()`'d so it doesn't prevent process exit. Signal values are cached in-process with the same TTL. HTTP-based data sources are supported in Phase 48; MCP-tool-dispatch sources are a future enhancement.

### Enforcement log

All violations and blocks are written to `intent_enforcement_log` (Postgres). The log is queryable via REST (`GET /api/v1/intent/enforcement-log`) with filters for `eventType`, `agentId`, and `since`.

## Alternatives Considered

### CEL expression evaluation for `activeWhen`

CEL (Common Expression Language) was considered for `activeWhen` to support richer conditions. Rejected for Phase 48 in favour of simple `key=value AND key=value` conjunctions — no external dependency, safe for initial adoption. CEL can be added in a future phase.

### OPA/Rego for hard boundaries

Full OPA evaluation was deferred to Phase 48.5. The `rego` field is stored on `HardBoundarySchema` for future use but not evaluated in Phase 48.

### Separate policies[] section for soft enforcement

A `policies[]` section with `warn` vs `block` modes is planned (Phase 48.5) but omitted from Phase 48 to keep the schema focused. Hard boundaries cover the safety-critical blocking case.

### File-based vs DB-first intent storage

Both are supported: `intent.filePath` config bootstraps from a YAML/JSON file, but the primary storage is PostgreSQL via `IntentStorage`. This allows dashboard CRUD and activation without file system access.

## Consequences

**Positive:**
- Organizational guidance is versioned, auditable, and machine-parseable
- Agents have live signal awareness — they know if they're moving the right direction
- Hard boundaries are enforced consistently across all agent sessions
- Trade-off profiles eliminate ambiguous escalations
- Enforcement log provides an audit trail for governance reviews

**Negative / risks:**
- Signal HTTP polling adds external network dependency at session start (mitigated by TTL caching and graceful null return)
- `activeWhen` expression language is simplistic — complex routing rules require upgrading to CEL (Phase 48.5)
- No OPA enforcement yet — hard boundaries rely on substring matching which can be fooled by paraphrasing

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/intent/schema.ts` | New — OrgIntentDocSchema |
| `packages/core/src/intent/storage.ts` | New — IntentStorage |
| `packages/core/src/intent/manager.ts` | New — IntentManager |
| `packages/core/src/intent/routes.ts` | New — REST routes |
| `packages/core/src/storage/migrations/042_org_intent.sql` | New |
| `packages/core/src/storage/migrations/manifest.ts` | Added 042 entry |
| `packages/shared/src/types/config.ts` | Added `allowOrgIntent`, `IntentFileConfigSchema`, `intent` in ConfigSchema |
| `packages/shared/src/types/mcp.ts` | Added `exposeOrgIntentTools` to McpServiceConfigSchema |
| `packages/core/src/secureyeoman.ts` | Step 2.07 init, getter, shutdown, wiring |
| `packages/core/src/soul/manager.ts` | `setIntentManager()`, prompt injection |
| `packages/mcp/src/tools/intent-tools.ts` | New — `intent_signal_read` tool |
| `packages/mcp/src/tools/index.ts` | Register intent tools |
| `packages/mcp/src/tools/manifest.ts` | Added `intent_signal_read` entry |
| `packages/dashboard/src/components/IntentEditor.tsx` | New |
| `packages/dashboard/src/components/SettingsPage.tsx` | Added Intent tab |
| `packages/dashboard/src/api/client.ts` | Added `allowOrgIntent`, Intent API functions |
| `docs/guides/organizational-intent.md` | New |
