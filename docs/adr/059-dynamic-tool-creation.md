# ADR 059: Dynamic Tool Creation

**Status**: Accepted
**Phase**: 17
**Date**: 2026-02-18
**See also**: ADR 034 (sub-agent delegation), ADR 055 (agent swarms), ADR 057 (swarms policy), ADR 056 (per-personality model fallbacks)

---

## Context

The static tool registry limits agent extensibility. Agent Zero-style runtime tool registration enables open-ended capability expansion: agents can generate new tools on the fly (e.g. a purpose-built API wrapper, a domain-specific calculation helper, a data transformation pipeline), register them in the current session, and immediately use them without redeployment.

This is a significant security surface — dynamically generated code executing as a registered tool could exfiltrate data, consume excessive resources, or interact with the system in unintended ways. The control model therefore requires:

1. An explicit **global opt-in** (`allowDynamicTools`, off by default).
2. A **sandboxing sub-toggle** (`sandboxDynamicTools`, on by default when DTC is enabled) that isolates dynamically-created tools inside the same sandbox boundary already used for code execution.
3. **Per-personality granular control** (`CreationConfig.allowDynamicTools`), gated by the global policy ceiling.
4. A **CLI surface** (`secureyeoman policy`) for all DTC operations and per-personality control.

---

## Decision

### 1. Global Security Policy — `allowDynamicTools` and `sandboxDynamicTools`

Added two new fields to `SecurityConfigSchema` in `packages/shared/src/types/config.ts`:

```typescript
allowDynamicTools: z.boolean().default(false),
sandboxDynamicTools: z.boolean().default(true),
```

Both are propagated throughout the stack:
- `secureyeoman.ts`: `updateSecurityPolicy()` handles both flags; `loadSecurityPolicyFromDb()` includes both in the `policyKeys` allowlist
- `gateway/server.ts`: GET and PATCH `/api/v1/security/policy` include both flags
- `dashboard/api/client.ts`: `SecurityPolicy` interface and default fallback updated
- `SecuritySettings.tsx`: DTC card after Sub-Agent Delegation; sandbox sub-toggle visible only when DTC is enabled (mirrors the A2A/Swarms nesting pattern)

`sandboxDynamicTools` defaults to `true` — when DTC is first enabled the sandbox is active. This prevents accidental unsandboxed execution for operators who simply toggle DTC on.

### 2. Per-Personality Control — `allowDynamicTools` in `CreationConfig`

Added `allowDynamicTools: z.boolean().default(false)` to `CreationConfigSchema` in `packages/shared/src/types/soul.ts`.

In `PersonalityEditor.tsx`, the field appears as a standalone peer entry in the Resource Creation grid (NOT nested under subAgents — DTC is an independent capability, not a sub-agent delegation feature). It shows "(disabled by security policy)" when the global `allowDynamicTools` is false.

The "Enable All" toggle respects the policy gate: DTC is set to `false` when `dtcBlockedByPolicy`, otherwise follows the new value.

### 3. CLI — `secureyeoman policy`

New `policyCommand` in `packages/core/src/cli/commands/policy.ts`, registered in `cli.ts`. Provides:

- `secureyeoman policy get` — show all policy flags
- `secureyeoman policy set <flag> <true|false>` — update any flag
- `secureyeoman policy dynamic-tools get|enable|disable` — DTC shorthand
- `secureyeoman policy dynamic-tools sandbox enable|disable` — sandbox shorthand
- `secureyeoman policy dynamic-tools personality get|enable|disable [--personality-id ID]` — per-personality control

### 4. AI Model Default Persistence — Status

`setModelDefault()` and `clearModelDefault()` in `secureyeoman.ts` already fully persist via the `system_preferences` table. On `initialize()`, both keys are read back at lines 418–429 and `switchModel()` is called before the server accepts requests. No code changes were needed — this ADR documents the verified behaviour and a test in `SecuritySettings.test.tsx` confirms that `fetchModelDefault` is called on mount.

---

## Architecture

```
Security Policy DB (security.policy table)
  allowDynamicTools   → false (default)
  sandboxDynamicTools → true  (default)

Global kill switch → PersonalityEditor opt-in → Runtime execution (sandboxed)
```

Both flags use the same key-value persistence path as all other policy flags (`persistSecurityPolicyToDb` / `loadSecurityPolicyFromDb`). No schema migrations are needed.

---

## Consequences

- **Runtime extensibility with explicit opt-in**: DTC is off by default; operators must consciously enable it.
- **Sandbox boundary limits blast radius**: Dynamically-created tools run inside the same Landlock/seccomp sandbox as code execution when `sandboxDynamicTools` is true. Disabling sandboxing is an advanced operator choice surfaced prominently in the UI.
- **Off-by-default prevents accidental exposure**: New installations and upgrades are unaffected; DTC requires two deliberate actions (global toggle + optional per-personality toggle).
- **Test coverage**: 7 new tests in `SecuritySettings.test.tsx`, 8 new tests in `policy.test.ts`.
- **Backward-compatible**: All new fields default to safe values; existing personalities and configurations are unaffected.
