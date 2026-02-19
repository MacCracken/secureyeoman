# ADR 065 — CLI Enhancements: Shell Completions, Config Validate, Plugin Management

**Date:** 2026-02-19
**Status:** Accepted
**Phase:** 20

---

## Context

Phase 20 identified three CLI usability gaps:

1. **No shell completions** — users must type command and subcommand names from memory.
2. **No explicit pre-startup validation** — `secureyeoman config` shows config info but does not provide a clear pass/fail check suitable for CI/CD.
3. **No CLI access to plugin management** — integration plugins (loaded via `INTEGRATION_PLUGIN_DIR`) can only be managed by manipulating files directly; there is no CLI surface for listing, inspecting, installing, or removing plugins.

---

## Decision

### Shell Completions (`secureyeoman completion <shell>`)

A new `completion` command prints a shell completion script to stdout for the requested shell. Supported shells: `bash`, `zsh`, `fish`.

**Rationale:**
- Completions are generated as static template strings with the full command/subcommand/flag map embedded. No runtime introspection of the router is required.
- Users source the output directly: `source <(secureyeoman completion bash)`. This is the standard pattern used by kubectl, helm, and other CLI tools.
- Static generation keeps the implementation dependency-free and eliminates any risk of completing sensitive flag values.

**Installation guidance** is printed in the `--help` output and in the script comments.

### Configuration Validation (`secureyeoman config validate`)

`validate` is added as a subcommand of the existing `config` command. It:

1. Loads and validates config structure (`loadConfig`)
2. Checks all required environment secrets (`validateSecrets`)
3. Reports each check individually with a ✓/✗ marker
4. Exits 0 if all checks pass, 1 if any fail
5. Supports `--json` for machine-readable output in CI pipelines

**Rationale:**
- Adding `validate` as a subcommand keeps the command surface cohesive (`secureyeoman config validate` reads naturally as "validate the config").
- The existing `secureyeoman config` (no subcommand) continues to show config summary info — backward compatible.
- `--json` output enables integration with CI health gates and deployment scripts.
- Secrets check is always included in `validate` (unlike the default command's opt-in `--check-secrets`), making it suitable as an unconditional pre-startup assertion.

### Plugin Management (`secureyeoman plugin <action>`)

A new `plugin` command provides four actions:

| Action | Description |
|--------|-------------|
| `list` | Scan plugin directory and show installed plugins |
| `info <platform>` | Show details for a specific plugin |
| `add <path>` | Validate and copy a plugin file to the plugin directory |
| `remove <platform>` | Delete a plugin file from the plugin directory |

Plugin directory is resolved from `--dir` flag or `INTEGRATION_PLUGIN_DIR` environment variable (matching the runtime convention in `secureyeoman.ts`).

**Rationale:**
- `add` validates that the plugin exports `platform` and `createIntegration` before copying, preventing broken plugins from being installed silently.
- `remove` deletes by inferred platform name (filename without extension) so users don't need to remember the exact filename.
- Both `add` and `remove` print a "restart required" reminder since plugins are loaded only at server startup.
- Directory-based plugins (subdirectory with `index.js`) are supported, consistent with `PluginLoader`.
- `--json` on `list` enables programmatic inspection.

---

## Alternatives Considered

### Dynamic completion generation via router introspection
The router's `getCommands()` could be called at runtime to enumerate commands. Rejected: it would require spawning a full process context just for completion, adds complexity, and the static approach is more reliable and auditable.

### Separate `config-validate` command
A standalone `secureyeoman config-validate` command was considered. Rejected: a subcommand under `config` is more discoverable and consistent with how `integration list/show/...` is structured.

### Plugin hot-reload
Adding a `plugin reload` action that signals a running server to re-scan plugins. Deferred: requires an inter-process communication mechanism (socket or API endpoint). The current scope only targets the common case of install-then-restart.

---

## Consequences

- Shell completions reduce typo errors and improve discoverability for new users.
- `config validate` can be used in Dockerfiles and CI as a pre-flight step: `secureyeoman config validate --json`.
- `plugin` CLI surface makes plugin management explicit and auditable without requiring direct filesystem access.
- The three roadmap items under Phase 20 "CLI Enhancements" are complete.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/cli/commands/completion.ts` | New — bash/zsh/fish completion scripts |
| `packages/core/src/cli/commands/completion.test.ts` | New — 7 tests |
| `packages/core/src/cli/commands/config.ts` | Add `validate` subcommand |
| `packages/core/src/cli/commands/config.test.ts` | Add 6 tests for `validate` subcommand |
| `packages/core/src/cli/commands/plugin.ts` | New — list/info/add/remove plugin actions |
| `packages/core/src/cli/commands/plugin.test.ts` | New — 20 tests |
| `packages/core/src/cli.ts` | Register `completionCommand`, `pluginCommand` |
