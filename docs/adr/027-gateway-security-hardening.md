# ADR 027: Gateway Security Hardening — Headers, CORS, WebSocket AuthZ, Heartbeat

## Status

Accepted

## Date

2026-02-13

## Context

A security audit comparing SecureYeoman against OpenClaw identified several hardening gaps in the gateway server. SecureYeoman already has strong authentication (JWT + mTLS + API keys), RBAC, audit chain, encryption at rest, and input validation — but it was missing standard HTTP security headers, had a CORS wildcard bug, and WebSocket subscriptions bypassed RBAC entirely. These are P0/P1 fixes.

### Problems Identified

1. **No HTTP security headers** — Responses lacked standard headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`), leaving clients vulnerable to MIME-sniffing, clickjacking, and referrer leakage.

2. **CORS wildcard + credentials bug** — When `'*'` was in the CORS origins array, the server reflected the actual `Origin` header back while also setting `Access-Control-Allow-Credentials: true`. Per the Fetch spec, this effectively allows any origin to make credentialed requests — a security vulnerability.

3. **WebSocket auth was fire-and-forget** — Token validation on WebSocket connections used `void promise.catch()` instead of awaiting the result. A client could send messages before validation completed. The validated user's role was never stored or checked.

4. **No WebSocket channel authorization** — Any authenticated user could subscribe to any channel (`metrics`, `audit`, `tasks`, `security`), regardless of their RBAC role. A `viewer` could subscribe to `audit` and `security` channels that should be restricted to `admin`/`auditor`.

5. **No WebSocket heartbeat** — Dead connections (e.g., client crashed, network dropped) were never cleaned up, leading to resource leaks over time.

## Decision

### 1. HTTP Security Headers

Add an `onRequest` hook that sets security headers on every response:

- `X-Content-Type-Options: nosniff` — Prevents MIME-type sniffing
- `X-Frame-Options: DENY` — Prevents clickjacking via iframes
- `X-XSS-Protection: 0` — Disables legacy XSS auditor (CSP supersedes)
- `Referrer-Policy: strict-origin-when-cross-origin` — Limits referrer leakage
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — Disables browser APIs
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — Only when TLS is active

Headers are unconditional (not configurable). There is no legitimate reason to disable them on an API server.

**Why not CSP?** The gateway serves a REST API, not HTML. CSP is only meaningful for the dashboard (Vite dev server), which sets its own headers.

### 2. CORS Wildcard Fix

When `'*'` is in the origins list:
- Set `Access-Control-Allow-Origin: *`
- Do NOT set `Access-Control-Allow-Credentials`

When a specific origin matches:
- Reflect the origin in `Access-Control-Allow-Origin`
- Set `Access-Control-Allow-Credentials: true`
- Set `Vary: Origin` (important for caches)

### 3. WebSocket Channel Authorization

- Await token validation (replace fire-and-forget)
- Store `userId` and `role` on the `WebSocketClient` object
- Define a `CHANNEL_PERMISSIONS` map linking channels to RBAC resource:action pairs
- Check `rbac.checkPermission()` on each channel in a subscribe request; silently skip unauthorized channels

Channel permission map:
| Channel | Resource | Action |
|---------|----------|--------|
| `metrics` | `metrics` | `read` |
| `audit` | `audit` | `read` |
| `tasks` | `tasks` | `read` |
| `security` | `security_events` | `read` |

Channels not in the map are allowed for extensibility (same as REST's default-deny handled elsewhere).

### 4. WebSocket Heartbeat

- 30-second ping interval from server
- Track `lastPong` timestamp per client
- Terminate connections that haven't responded in 60 seconds
- Clean up interval on server stop

## Consequences

### Positive

- All HTTP responses carry industry-standard security headers
- CORS now follows the Fetch spec correctly — no more credentialed wildcard
- WebSocket connections enforce the same RBAC permissions as REST endpoints
- Dead WebSocket connections are automatically cleaned up
- No new configuration required — all changes are automatic

### Negative

- Clients using wildcard CORS with `credentials: 'include'` will stop working (this was already broken per spec, just not enforced)
- WebSocket clients with insufficient permissions will silently not receive channels they previously could subscribe to

### Neutral

- No schema or configuration changes needed
- Existing RBAC roles and permissions are reused as-is

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/gateway/server.ts` | Security headers hook, CORS fix, WS channel authz, WS heartbeat |
| `packages/core/src/gateway/server.test.ts` | 7 new tests for headers, CORS, WS authz |

## References

- [MDN: X-Content-Type-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options)
- [Fetch spec: CORS protocol and credentials](https://fetch.spec.whatwg.org/#http-access-control-allow-credentials)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
