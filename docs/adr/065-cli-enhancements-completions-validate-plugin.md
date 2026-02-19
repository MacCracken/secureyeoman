# ADR 065 — Phase 20 CLI Improvements: Completions, Validate, Plugin, Output

**Date:** 2026-02-19
**Status:** Accepted
**Phase:** 20

---

## Context

Phase 20 identified five CLI usability gaps across two roadmap items:

**CLI Enhancements:**
1. **No shell completions** — users must type command and subcommand names from memory.
2. **No explicit pre-startup validation** — `secureyeoman config` shows config info but does not provide a clear pass/fail check suitable for CI/CD.
3. **No CLI access to plugin management** — integration plugins (loaded via `INTEGRATION_PLUGIN_DIR`) can only be managed by manipulating files directly.

**Output Improvements:**
4. **No color output** — all status indicators (health OK/ERROR, checks pass/FAIL, validation results) are monochrome; no visual differentiation between success and failure states.
5. **Incomplete `--json` coverage** — four commands (`browser`, `memory`, `scraper`, `multimodal`) lack `--json` output, making them unusable in scripting contexts. Long-running operations (memory consolidation, image generation, audio transcription) provide no progress feedback.

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
3. Reports each check individually with a colored ✓/✗ marker
4. Exits 0 if all checks pass, 1 if any fail
5. Supports `--json` for machine-readable output in CI pipelines

**Rationale:**
- Adding `validate` as a subcommand keeps the command surface cohesive.
- The existing `secureyeoman config` (no subcommand) continues to show config summary info — backward compatible.
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
- `remove` deletes by inferred platform name so users don't need to remember the exact filename.
- Both `add` and `remove` print a "restart required" reminder since plugins are loaded only at server startup.

### Rich Output — Color Context and Spinner

**`colorContext(stream)`** in `utils.ts` returns color helper functions (`green`, `red`, `yellow`, `dim`, `bold`, `cyan`) bound to the given output stream. Colors are suppressed when:
- The stream is not a TTY (`(stream as NodeJS.WriteStream).isTTY` is falsy), or
- The `NO_COLOR` environment variable is set (respects the [NO_COLOR standard](https://no-color.org/))

Applied to: `health.ts` (Status OK/ERROR, check pass/FAIL), `status.ts` (Status, Sub-Agents, Policy labels), `config.ts` validate (✓/✗ marks, PASS/FAIL result line).

**`Spinner` class** in `utils.ts` provides a minimal progress indicator for long-running CLI operations:
- On TTY: animates braille frames (`⠋⠙⠹…`) via `setInterval`, overwriting the current line with `\r`
- On non-TTY: `start()` is silent; `stop()` prints a single `✓`/`✗` summary line — safe for pipes and CI logs

Applied to: `memory consolidate`, `memory reindex`, `multimodal speak`, `multimodal transcribe`, `multimodal generate`, `multimodal vision-analyze`.

### JSON Output (`--json`) — Remaining Commands

`--json` flag added to `browser`, `memory`, `scraper`, and `multimodal`. All subcommands in each command now support `--json`. This completes `--json` coverage across the entire CLI surface (all commands except `repl` and `init` which are interactive and do not produce machine-parseable output).

---

## Alternatives Considered

### Dynamic completion generation via router introspection
Rejected: requires spawning a full process context, adds complexity, and the static approach is more reliable.

### Third-party color library (chalk, kleur, etc.)
Rejected: the CLI has a zero-external-dependency policy. The ANSI code set needed (green, red, yellow, dim, bold, cyan) is small and stable enough to implement directly.

### Always-on colors (ignore TTY/NO_COLOR)
Rejected: breaks log aggregation pipelines, CI log renderers, and `grep`/`awk` post-processing. TTY detection is the correct approach.

### Streaming progress for long operations
The consolidate/reindex/multimodal operations are fire-and-forget API calls that return when the job is submitted, not when it completes. A spinner during the HTTP request flight is appropriate. Polling for completion status is out of scope.

### Separate `config-validate` command
Rejected: `config validate` as a subcommand is more discoverable and consistent with `integration list/show/...`.

### Plugin hot-reload
Deferred: requires an inter-process communication mechanism. Current scope targets install-then-restart.

---

## Consequences

- Shell completions reduce typo errors and improve discoverability.
- `config validate` is usable in Dockerfiles and CI: `secureyeoman config validate --json`.
- Color output makes health and validation results instantly scannable in terminal contexts, while staying fully compatible with CI and log aggregation (NO_COLOR / non-TTY).
- All CLI commands (except interactive `repl`/`init`) now support `--json` for scripting.
- Progress spinners on async operations give visual feedback without polluting piped output.
- All five Phase 20 roadmap items under CLI Enhancements and Output Improvements are complete.

---

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/cli/utils.ts` | Add `colorContext()` and `Spinner` class |
| `packages/core/src/cli/utils.test.ts` | Add 8 tests for colorContext and Spinner |
| `packages/core/src/cli/commands/health.ts` | Color OK/ERROR, pass/FAIL |
| `packages/core/src/cli/commands/status.ts` | Color OK/ERROR, Enabled/Disabled, Allowed/Restricted |
| `packages/core/src/cli/commands/config.ts` | Color ✓/✗ marks, PASS/FAIL; add `validate` subcommand |
| `packages/core/src/cli/commands/config.test.ts` | 6 new tests for validate subcommand |
| `packages/core/src/cli/commands/browser.ts` | Add `--json` to all subcommands |
| `packages/core/src/cli/commands/browser.test.ts` | 4 new `--json` tests |
| `packages/core/src/cli/commands/memory.ts` | Add `--json`; add Spinner to consolidate/reindex |
| `packages/core/src/cli/commands/memory.test.ts` | 6 new `--json` and spinner tests |
| `packages/core/src/cli/commands/scraper.ts` | Add `--json` to all subcommands |
| `packages/core/src/cli/commands/scraper.test.ts` | 4 new `--json` tests |
| `packages/core/src/cli/commands/multimodal.ts` | Add `--json`; add Spinner to vision/speak/transcribe/generate |
| `packages/core/src/cli/commands/multimodal.test.ts` | 5 new `--json` and spinner tests |
| `packages/core/src/cli/commands/completion.ts` | New — bash/zsh/fish completion scripts |
| `packages/core/src/cli/commands/completion.test.ts` | New — 7 tests |
| `packages/core/src/cli/commands/plugin.ts` | New — list/info/add/remove plugin actions |
| `packages/core/src/cli/commands/plugin.test.ts` | New — 20 tests |
| `packages/core/src/cli.ts` | Register `completionCommand`, `pluginCommand` |
