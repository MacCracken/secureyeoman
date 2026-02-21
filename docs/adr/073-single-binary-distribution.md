# ADR 073: Single Binary Distribution via Bun compile

**Status:** Accepted  
**Date:** 2026-02-19  
**Phase:** 22

## Context

SecureYeoman currently requires Node.js 20, npm, and ~600 MB Docker images. A self-contained binary would dramatically simplify deployment, especially for:
- On-prem enterprise installs (no Node.js on PATH required)
- Edge / embedded deployments (SQLite tier)
- One-line install scripts
- Minimal Docker images (~80 MB)

## Decision

### Tiers
- **Tier 1** (needs PostgreSQL): `secureyeoman-linux-x64`, `secureyeoman-linux-arm64`, `secureyeoman-darwin-arm64`
- **Tier 2** (SQLite-only, no external deps): `secureyeoman-lite-linux-x64`, `secureyeoman-lite-linux-arm64`

### Build pipeline (`scripts/build-binary.sh`)
Uses `bun build --compile` with `--assets packages/dashboard/dist` to embed the SPA. Tier 2 builds set `SECUREYEOMAN_BUILD_TIER=lite` (for future conditional imports of pg vs bun:sqlite).

### MCP as subcommand
`packages/mcp/src/cli.ts` now exports `runMcpServer(argv)`. New `packages/core/src/cli/commands/mcp-server.ts` lazily imports and calls it, enabling `secureyeoman mcp-server` without a separate binary.

### Storage backend abstraction (`storage/backend.ts`)
`resolveBackend(config)` selects 'pg' when `DATABASE_URL` is set, 'sqlite' otherwise (in 'auto' mode). The `storage.backend` config key ('pg' | 'sqlite' | 'auto') overrides this.

### Docker
`Dockerfile` replaced with binary-based image from `debian:bookworm-slim` (~80 MB). `docker-compose.yml` updated: dashboard service removed (gateway serves SPA), MCP service uses `secureyeoman mcp-server` subcommand.

### Distribution
- GitHub Actions `release-binary.yml`: triggers on version tags, builds all targets, uploads to GitHub Release with SHA256 checksums.
- `install.sh`: detects OS/arch, downloads correct binary, sets executable, prints next steps.

## Consequences

### Positive
- Zero runtime dependencies for end users (Node.js, npm, Python not required).
- ~80 MB Docker image vs ~600 MB.
- `curl | bash` install in one line.
- SPA and MCP bundled in the same binary.

### Negative
- Native Node.js addons (`faiss-node`, `better-sqlite3`) require compilation at build time.
- Bun compile + cross-compilation adds CI complexity.
- SQLite Tier 2 requires replacing `better-sqlite3` with `bun:sqlite` (deferred to subsequent iteration).

### Risks
- `bun build --compile` is still evolving; complex dynamic imports may need workarounds.
- The `mcp-server` subcommand lazily imports `@secureyeoman/mcp` — must be bundled at compile time.

## Phase 25 Corrections (2026-02-20)

Four bugs found during the Phase 24/25 migration integrity audit of the binary path:

### Bug 1 — `manifest.ts`: Bun binary detection used `.startsWith` not `.includes`

In Bun 1.3.9 compiled standalone binaries, `import.meta.url` is a `file://` URL
(`file:///$bunfs/root/<binary-name>`), not a bare `/$bunfs/` path. The original
detection `import.meta.url.startsWith('/$bunfs/')` always evaluated to `false`,
so `fileURLToPath` resolved `$bunfs/root/<binary>` → `/$bunfs/root/` as `__dirname`,
and `readFileSync('/$bunfs/root/001_initial_schema.sql')` threw `ENOENT`.

**Fix:** Changed to `import.meta.url.includes('/$bunfs/')`, which matches both the
bare-path and `file://` URL representations.

### Bug 2 — `.dockerignore` missing `!dist/migrations/` exception

`dist/` was excluded globally; `!dist/secureyeoman-linux-x64` re-included the binary
but `dist/migrations/` was still excluded. `docker build` failed with:
`"/dist/migrations": not found`.

**Fix:** Added `!dist/migrations/` exception to `.dockerignore`.

### Bug 3 — pino transport worker threads fail in lean binary Docker image

`pino`'s transport API (including `pino/file`) spawns a `thread-stream` worker thread
that dynamically `require()`s modules at runtime. In the `debian:bookworm-slim` binary
image there are no `node_modules`, so the worker threw:
`ModuleNotFound resolving "node_modules/thread-stream/lib/worker.js"`.

**Fix:** JSON stdout now bypasses the pino transport layer entirely — `createTransport()`
returns `undefined` for `json` stdout, and `pino(options)` writes JSON to fd 1
synchronously with no worker threads. `pretty` stdout still uses the `pino-pretty`
transport (requires the package at runtime, suitable for dev).

### Bug 4 — No env-var override for log format

There was no way to select JSON logging without a config file, making the Docker image
unusable without a YAML config override.

**Fix:** Added `SECUREYEOMAN_LOG_FORMAT` environment variable to `config/loader.ts`
(values: `json` | `pretty`). The `Dockerfile` now sets `ENV SECUREYEOMAN_LOG_FORMAT=json`.

## Phase 25 Corrections — Single Binary Smoke Test (2026-02-21)

Three additional bugs uncovered by the `scripts/smoke-test-binary.sh` smoke test:

### Bug 5 — `start.ts`: `--version` hardcoded as `v1.5.1`

`secureyeoman --version` and the startup banner both emitted the stale hardcoded
string `v1.5.1` regardless of the release version. The `getPackageVersion()` helper
in `server.ts` read `package.json` from a relative path that does not exist inside a
Bun-compiled binary (virtual FS `/$bunfs/`), silently returning `'0.0.0'` for every
`/health` response.

**Fix:** Added `packages/core/src/version.ts` (constant `VERSION = '2026.2.19'`).
`start.ts` and `server.ts` import this constant. `scripts/set-version.sh` now updates
the constant alongside `package.json` files. `getPackageVersion()` removed.

### Bug 6 — `build-binary.sh`: Tier 2 lite builds missing `--external` flags

The Tier 2 `bun build --compile` step did not pass `--external playwright`,
`--external playwright-core`, `--external electron`, or `--external chromium-bidi`.
`playwright-core` is a transitive dependency; Bun attempted to bundle it and failed
with `Could not resolve: "electron"`. Tier 1 already excluded these.

**Fix:** Added the same four `--external` flags to both Tier 2 build targets.

### Bug 7 — Smoke test: audit chain key conflict on repeated runs

Rerunning the smoke test against the same PostgreSQL database failed with
`Audit chain integrity compromised: last entry signature invalid` because the previous
run had left audit entries signed with a different dummy key.

**Fix:** `scripts/smoke-test-binary.sh` now creates a uniquely-named temporary
database (`sy_smoke_<pid>_<epoch>`) per binary test and drops it on exit, ensuring
a clean audit chain on every run.

### Smoke Test Verified (2026-02-21)

All six runnable checks pass on `x86_64 Linux` with Bun 1.3.9:

| Binary | `--version` | `config validate` | `health --json` |
|---|---|---|---|
| `secureyeoman-linux-x64` (Tier 1) | ✓ `v2026.2.19` | ✓ `valid=true` | ✓ `status=ok` |
| `secureyeoman-lite-linux-x64` (Tier 2) | ✓ `v2026.2.19` | ✓ `valid=true` | ✓ `status=ok` |
| `*-linux-arm64`, `*-darwin-arm64` | skipped (cross-arch/OS) | — | — |

## Files Changed
- `packages/mcp/src/cli.ts` — export runMcpServer()
- `packages/core/src/cli/commands/mcp-server.ts` — NEW
- `packages/core/src/cli.ts` — register mcp-server command
- `packages/core/src/storage/backend.ts` — NEW
- `packages/shared/src/types/config.ts` — StorageBackendConfigSchema, storage field in ConfigSchema
- `scripts/build-binary.sh` — NEW
- `Dockerfile` — binary-based image
- `docker-compose.yml` — remove dashboard service, mcp uses subcommand
- `.github/workflows/release-binary.yml` — NEW
- `install.sh` — NEW
- `package.json` — build:binary script
- *(Phase 25)* `packages/core/src/storage/migrations/manifest.ts` — `.startsWith` → `.includes` for Bun binary detection
- *(Phase 25)* `.dockerignore` — add `!dist/migrations/` exception
- *(Phase 25)* `packages/core/src/logging/logger.ts` — JSON stdout bypasses worker-thread transport
- *(Phase 25)* `packages/core/src/config/loader.ts` — `SECUREYEOMAN_LOG_FORMAT` env-var support
- *(Phase 25)* `Dockerfile` — `ENV SECUREYEOMAN_LOG_FORMAT=json`
- *(Phase 25)* `packages/core/src/version.ts` — NEW; `VERSION` constant for compiled binaries
- *(Phase 25)* `packages/core/src/cli/commands/start.ts` — import `VERSION`; remove hardcoded `v1.5.1`
- *(Phase 25)* `packages/core/src/gateway/server.ts` — import `VERSION`; remove `getPackageVersion()`
- *(Phase 25)* `scripts/set-version.sh` — also updates `version.ts` constant
- *(Phase 25)* `scripts/smoke-test-binary.sh` — NEW; end-to-end binary smoke test
- *(Phase 25)* `scripts/build-binary.sh` — Tier 2 builds now include `--external` playwright flags
- *(Phase 25)* `.github/workflows/release-binary.yml` — postgres service + smoke test step added
