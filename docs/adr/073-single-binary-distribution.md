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
