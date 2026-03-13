# ADR 032: Caddy TLS Reverse Proxy & Supervisord Process Management

**Status**: Accepted
**Date**: 2026-03-08

## Context

SecureYeoman's Docker containers run four processes: the main Node.js application, the AGNOS LLM Gateway (Rust), the AGNOS Agent Runtime (Rust), and optionally a TLS termination proxy. Previously:

1. **TLS** was handled by Fastify directly via `TlsManager`, requiring certificate paths in the Node.js config and complicating container networking (Fastify needed HTTPS awareness).
2. **Process management** used shell-script background processes (`&`) in `entrypoint-combined.sh`, with no restart logic, no health monitoring, and no clean shutdown coordination.
3. **TLS configuration** used `SECUREYEOMAN_TLS_*` environment variables specific to this project, while sibling projects (Agnostic, AGNOS) used their own naming conventions.

The Agnostic QA platform had already adopted Caddy for TLS termination with unified `TLS_*` env vars. Aligning SecureYeoman to the same pattern simplifies the deployment triangle.

## Decision

### 1. Caddy Reverse Proxy for TLS

Replace direct Fastify TLS in Docker with an embedded Caddy reverse proxy. Caddy handles TLS termination; Fastify serves plain HTTP on `127.0.0.1:18789`.

Three modes controlled by environment variables:
- **Mode A (Provided Certs)**: `TLS_ENABLED=true` + `TLS_CERT_PATH` + `TLS_KEY_PATH` — Caddy uses the supplied PEM files.
- **Mode B (Auto ACME)**: `TLS_ENABLED=true` + `TLS_DOMAIN` (no cert paths) — Caddy auto-obtains certs from Let's Encrypt.
- **Mode C (HTTP Passthrough)**: `TLS_ENABLED` unset or `false` — Caddy is not started; Fastify serves HTTP directly.

A Caddyfile template (`docker/Caddyfile.template`) is processed via `envsubst` at container startup.

### 2. Supervisord Process Management

Replace shell background processes with supervisord (`docker/supervisord.conf`). Four managed programs:

| Program | Priority | Autostart | Autorestart |
|---------|----------|-----------|-------------|
| `caddy` | 10 | Conditional (via include override) | true |
| `llm_gateway` | 20 | true | true |
| `agent_runtime` | 30 | true | true |
| `secureyeoman` | 40 | true | true |

Caddy's autostart is toggled by writing an include override to `/tmp/supervisord-caddy.conf` from the entrypoint. The SecureYeoman process uses `autorestart=true` with `startretries=10` to handle the brief DNS resolution delay when the database container is starting.

### 3. Unified TLS Environment Variables

Standardized variables shared across all three projects:

| Variable | Description | Default |
|----------|-------------|---------|
| `TLS_ENABLED` | Enable Caddy TLS reverse proxy | `false` |
| `TLS_CERT_PATH` | Path to PEM certificate file | — |
| `TLS_KEY_PATH` | Path to PEM private key file | — |
| `TLS_DOMAIN` | Domain for cert/ACME | `localhost` |
| `TLS_PORT` | TLS listen port | `443` |

Legacy `SECUREYEOMAN_TLS_*` variables remain supported; unified `TLS_*` vars take precedence. The config loader (`config/loader.ts`) resolves `TLS_* ?? SECUREYEOMAN_TLS_*` for each field.

## Consequences

### Positive
- **Simpler Fastify** — application code no longer manages TLS certificates, SNI, or HTTPS listeners.
- **Auto-renewal** — Caddy's built-in ACME support eliminates manual cert rotation for public-facing deployments.
- **Reliable restarts** — supervisord monitors and restarts crashed processes with configurable retry policies.
- **Clean shutdown** — `SIGTERM` to supervisord gracefully stops all child processes.
- **Cross-project consistency** — identical TLS env vars across SecureYeoman, Agnostic, and AGNOS.

### Negative
- **Image size** — Caddy binary (~40 MB) and supervisord add to the Docker image.
- **Complexity** — one more layer (Caddy) between the client and Fastify; debugging requires checking both access logs.
- **Bare-metal gap** — direct Fastify TLS (`TlsManager`) is preserved but may drift if all development focus shifts to the Caddy path.

## Files Changed

- `docker/supervisord.conf` — new supervisord configuration
- `docker/Caddyfile.template` — new Caddy reverse proxy template
- `docker/entrypoint-combined.sh` — rewritten for supervisord + TLS env resolution
- `Dockerfile`, `Dockerfile.dev` — added supervisor, gettext-base, Caddy binary
- `docker-compose.yml` — port 443 mapping on sy-core and secureyeoman services
- `packages/core/src/config/loader.ts` — unified TLS env var resolution
- `packages/shared/src/types/config.ts` — added `domain` to TlsConfigSchema
- `docs/guides/security/tls-certificates.md` — comprehensive rewrite
