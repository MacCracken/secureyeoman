# ADR 118 — `secureyeoman agents` CLI for Runtime Agent Feature Flag Control

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

Four agent capability flags exist in the security policy:

| Flag | API key | Default |
|---|---|---|
| Sub-agent delegation | `allowSubAgents` | `false` |
| A2A protocol | `allowA2A` | `false` |
| Swarm orchestration | `allowSwarms` | `false` |
| Binary agents | `allowBinaryAgents` | `false` |

All four default to `false` (disabled) for security. The existing `PATCH /api/v1/security/policy` endpoint can toggle them without a server restart, but only via raw HTTP — there was no CLI surface.

During Phase 38 manual review the agent/personality reported:
- "Sub-agent delegation is not enabled" — expected, but unrecoverable from the terminal without a raw `curl` command
- A2A and Swarm "not tested" — no easy way to enable them for a test session

---

## Decision

Add a `secureyeoman agents` CLI command that wraps the existing policy endpoint.

### Subcommands

| Subcommand | Description |
|---|---|
| `status` | Display all four feature flags with enabled/disabled indicators and descriptions |
| `enable <feature>` | Send `PATCH /api/v1/security/policy { allowXxx: true }` |
| `disable <feature>` | Send `PATCH /api/v1/security/policy { allowXxx: false }` |

### Features (accepted values)

`sub-agents` · `a2a` · `swarms` · `binary-agents`

### Options

`--url <url>` (default `http://127.0.0.1:3000`) · `--token <token>` · `--json` · `-h / --help`

### Runtime-only changes

Changes take effect immediately in the running process. They are **not** persisted to `secureyeoman.yaml`. To make a flag permanent, update the corresponding `security.allow*` field in the config file and restart the server. This is prominently noted in the command's help text and output.

### Rationale

- **Minimal surface** — reuses the existing `PATCH /api/v1/security/policy` endpoint; no new backend code
- **Security transparency** — the output always shows the runtime-only caveat so operators understand changes won't survive a restart
- **`--json` flag** — enables scripted workflows (e.g. `secureyeoman agents status --json | jq '.["sub-agents"]'`)
- **Follows CLI command pattern** — consistent with `mcp-quickbooks`, `integration`, `role` etc.; uses shared `apiCall`, `extractFlag`, `colorContext` utilities

---

## Files Changed

- `packages/core/src/cli/commands/agents.ts` — command implementation (new)
- `packages/core/src/cli/commands/agents.test.ts` — 11 tests covering all subcommands and error paths (new)
- `packages/core/src/cli.ts` — import and `router.register(agentsCommand)`

---

## Consequences

- Operators can inspect and toggle agent capability flags from the terminal in one command
- No new API endpoints required
- Changes remain runtime-only unless the operator also edits the YAML config; this is a deliberate and documented constraint
- `binary-agents` is exposed via this CLI, but remains disabled by default; enabling it allows the AI to spawn OS-level child processes and should only be done in controlled environments
