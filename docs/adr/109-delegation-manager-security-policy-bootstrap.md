# ADR 109: Delegation Manager Bootstrap from Security Policy

**Date**: 2026-02-23
**Status**: Accepted
**See also**: ADR 034 (sub-agent delegation), ADR 055 (agent swarms & swarms policy), ADR 059 (dynamic tool creation), ADR 108 (Resources section in personality editor)

---

## Context

### The Gap

The orchestration managers (`SubAgentManager`, `SwarmManager`, `WorkflowManager`) are only initialized when `config.delegation.enabled = true` in the YAML/env config (Step 6.11 of `SecureYeoman.initialize()`). This flag defaults to `false` and has no corresponding environment variable in the config loader.

The Security Settings UI exposes `allowSubAgents`, `allowSwarms`, and `allowWorkflows` toggles that are persisted to the `security.policy` DB table and loaded back into `this.config.security` at Step 2.2 — **before** Step 6.11 runs. But enabling these toggles never caused the managers to initialize, because the Step 6.11 gate only checked `config.delegation.enabled`.

Result: operators who enabled Sub-Agent Delegation, Workflow Orchestration, or Agent Swarms through Security Settings expected these features to work, but the underlying managers remained `null`, producing "Manager not available" errors when the AI tried to exercise those capabilities.

### Why the Ordering Works

`loadSecurityPolicyFromDb()` (Step 2.2) writes persisted policy rows directly into `this.config.security` before any manager initialization. So by the time Step 6.11 is reached, `this.config.security.allowSubAgents`, `.allowSwarms`, and `.allowWorkflows` already reflect the DB state — they can be read safely without any additional DB query.

---

## Decision

The Step 6.11 guard condition is expanded from:

```typescript
if (this.config.delegation?.enabled) {
```

to:

```typescript
const delegationNeeded =
  this.config.delegation?.enabled ||
  this.config.security?.allowSubAgents ||
  this.config.security?.allowSwarms ||
  this.config.security?.allowWorkflows;
if (delegationNeeded) {
```

This means the full delegation chain (`SubAgentManager` → `SwarmManager` → `WorkflowManager`) initializes whenever **any** of these conditions is true:

1. `config.delegation.enabled` is set in YAML/env (existing behaviour, unchanged)
2. `allowSubAgents` is enabled in Security Settings
3. `allowSwarms` is enabled in Security Settings
4. `allowWorkflows` is enabled in Security Settings

The security policy toggles (`allowSubAgents`, `allowSwarms`, `allowWorkflows`) continue to act as runtime gates — the AI still cannot exercise capabilities that the policy blocks. Enabling them now additionally ensures the underlying infrastructure is running.

---

## Consequences

- **No YAML change required**: operators who use only the Security Settings UI to configure features no longer need to also set `delegation.enabled: true` in their config file.
- **Restart required**: toggling these policy flags persists to DB immediately but the managers only initialize at startup, so a container restart is required after enabling orchestration features for the first time.
- **Backward-compatible**: existing deployments with `delegation.enabled: true` in YAML are unaffected. Deployments with all security policy flags at their defaults (all `false`) continue to start with no delegation managers.
- **No new env vars added**: the config loader is unchanged; `config.delegation` remains the explicit opt-in for YAML-based configuration.
- **Dynamic Tools not included**: `allowDynamicTools` is intentionally excluded from the bootstrap condition — it requires a separate implementation and the dynamic tools manager does not yet exist.
