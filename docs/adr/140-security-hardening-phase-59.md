# ADR 140 — Security Hardening (Phase 59)

**Date:** 2026-02-26
**Status:** Accepted
**Scope:** `packages/core`, `packages/dashboard`

---

## Context

A comprehensive security, stability, and performance review identified 10 actionable
issues to address before production readiness.  This ADR documents the decisions
made for each fix.

---

## Decisions

### 1. Terminal child-process environment sanitization

**Problem:** `terminal-routes.ts` spread all of `process.env` into child processes,
exposing every secret (DB passwords, API keys, OAuth tokens) to spawned shells.

**Decision:** Replace with an explicit `SAFE_ENV_KEYS` whitelist
(`PATH`, `HOME`, `USER`, `LOGNAME`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TERM`, `SHELL`,
`TMPDIR`, `TZ`, `XDG_RUNTIME_DIR`) and always override `PATH` with a hardcoded safe
value.  No application secrets can leak to child processes.

---

### 2. PostgreSQL SSL — incremental lockout approach

**Problem:** `pg-pool.ts` hard-coded `rejectUnauthorized: false`, making SSL
connections vulnerable to MITM attacks.

**Decision:** Default `rejectUnauthorized` to `true`.  Provide two opt-outs via
environment variables for legitimate non-production use:

| Env var | Default | Purpose |
|---------|---------|---------|
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` | Set to `"false"` to allow self-signed certs in dev |
| `DATABASE_CA` | — | PEM-encoded CA for private/corporate CAs |

A warning is logged when verification is disabled so it is never silently misconfigured.

Additionally, `initPoolFromConfig` now throws in `NODE_ENV=production` if the password
env var is missing, preventing silent fallback to the dev default.

---

### 3. Health-check endpoint split (live / ready / deep)

**Problem:** `/health` returned hardcoded `database: true` and `auditChain: true`
regardless of actual status.  No Kubernetes-compatible readiness/liveness split.

**Decision:** Three endpoints following Kubernetes probe conventions:

| Path | Purpose | Returns 503 if unhealthy? |
|------|---------|--------------------------|
| `GET /health/live` | Liveness — process alive | No (fast, no I/O) |
| `GET /health/ready` | Readiness — real DB ping + state | Yes |
| `GET /health/deep` | Deep diagnostics — all components | 207 partial |
| `GET /health` | Backward-compat alias for ready | Yes |

The ready probe performs an actual `SELECT 1` query so infrastructure can detect DB
connectivity loss and route traffic away.

---

### 4. Content-Security-Policy header

**Problem:** No CSP header was sent, leaving XSS attacks unmitigated at the transport
layer.

**Decision:** Add a strict CSP to all responses:
```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:;
media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'
```
`'unsafe-inline'` is required for the Vite-built React dashboard (inline event handlers
and CSS-in-JS).  External script sources are still blocked.

HSTS max-age bumped to 2 years (`63072000`) with `preload` to qualify for browser
preload lists.

---

### 5. Token refresh race condition

**Problem:** If `attemptTokenRefresh()` threw an unhandled exception,
`_isRefreshing` and `_refreshPromise` were never reset, permanently blocking all
future 401 recovery.

**Decision:** Use `.finally()` to clear both flags unconditionally:
```typescript
_refreshPromise = attemptTokenRefresh().finally(() => {
  _isRefreshing = false;
  _refreshPromise = null;
});
```
All concurrent callers still coalesce onto the same promise; the cleanup is
guaranteed regardless of success or failure.

---

### 6. WebSocket stale-client cleanup

**Finding:** Already implemented.  The existing `heartbeatInterval` pings every 30 s
and terminates + removes clients with `lastPong > 60 s`.  No change required.

---

### 7. Audit chain concurrent-write lock

**Problem:** `repair()` and `createSnapshot()` could read/write `this.lastHash`
concurrently with in-flight `record()` calls, producing an inconsistent hash-chain tip.

**Decision:**
- `repair()` is now serialized through the existing `_recordQueue` (same mechanism as
  `record()`), ensuring it runs after all pending writes and that new writes queue behind
  it.  The internal work is extracted to `_doRepair()`.
- `createSnapshot()` awaits the tail of `_recordQueue` before reading `this.lastHash`.

---

### 8. Audit list — single-query window function

**Problem:** `queryEntries` and `searchFullText` each fired two separate database
round-trips: one `COUNT(*)` and one `SELECT` page.

**Decision:** Merge into a single query using `COUNT(*) OVER() AS total_count`
(PostgreSQL window function).  Halves database round-trips on every audit list request
with no semantic change.

---

### 9. Dashboard API client — request timeouts

**Problem:** `fetch()` calls in `client.ts` had no timeout, allowing requests to hang
indefinitely on network issues or slow servers.

**Decision:** Add `signal: AbortSignal.timeout(ms)` to all three fetch sites:

| Site | Timeout |
|------|---------|
| Main request | 30 s |
| Retry after token refresh | 30 s |
| `attemptTokenRefresh()` | 10 s (faster fail) |

Caller-supplied `signal` is respected and takes precedence (`options.signal ?? ...`),
so React Query's abort controller still works.

---

### 10. Auth endpoint rate limiting — wired up

**Problem:** `rateLimiter` was injected into `registerAuthRoutes` but never called.
The `auth_attempts` rule existed but protected nothing.

**Decision:**
- Login: `auth_attempts` (5 per 15 min per IP) — already configured, now enforced.
- Refresh: new `auth_refresh` rule (10 per 60 s per IP).
- Reset-password: new `auth_reset_password` rule (3 per hour per IP).
- All blocked responses include `Retry-After` header.

---

## Alternatives Considered

- **HSTS preload**: bumped to 2 years to qualify for browser preload lists (previously
  1 year).  Sites must stay on HTTPS to avoid becoming unreachable after preloading.
- **Separate `repair()` lock**: a dedicated mutex was considered but the existing
  `_recordQueue` pattern is simpler and already proven.
- **PostgreSQL SSL via config schema**: adding `sslRejectUnauthorized` to the shared
  `DatabaseConfig` schema was considered but env-var override was preferred to avoid
  schema migration and keep secrets config out of YAML.
