# ADR 195: Security Hardening & Code Audit (Phase 121)

**Date:** 2026-03-03
**Status:** Accepted

## Context

A security audit of the codebase revealed several vulnerability categories: leaked credentials in environment files, shell injection vectors in terminal routes, arbitrary JS execution via `new Function()` in workflow conditions, missing global rate limiting, raw error messages leaking to clients, unbounded pagination, and no audit trail for RLS bypass.

## Decision

Addressed across four sub-phases:

### 121-A: Secrets & Credential Hygiene
- Sanitized `.env.dev` — replaced all real OAuth/API credentials with `CHANGE_ME_*` placeholders
- Deleted `.env.old.backup`, added `*.backup` to `.gitignore`
- Created `.githooks/pre-commit` secret scanner with regex patterns for common credential formats
- Added `"prepare": "git config core.hooksPath .githooks"` to root `package.json`
- Moved `packages/core/src/example.ts` to `packages/core/examples/example.ts`

### 121-B: Sandbox & Execution Hardening
- **Terminal routes:** Removed `override: true` flag that bypassed allowlist. Added comprehensive shell injection detection (`$()`, backticks, `&&`, `||`, `;`, `>`, `<`, `${}`) with safe pipe whitelist (`| grep`, `| head`, `| tail`, etc.)
- **Workflow conditions:** Replaced `new Function()` with `safe-eval.ts` — a recursive-descent parser supporting property access, comparisons, logical operators, and literals. Rejects function calls, assignments, `new`, `import`, `require`, template literals. Max 1000 chars.
- **Sandbox IPC:** Deferred `fn.toString()` + `new Function()` replacement to future phase (contained to internal IPC only)

### 121-C: HTTP Security & Rate Limiting
- **Global rate limiting hook:** `RateLimiter.createFastifyHook()` registered as `onRequest` — 100 req/min for general API, 10 req/min for terminal/workflow-execute, 5 req/min for auth endpoints. Skips health checks and WebSocket upgrades.
- **CSP:** Already had `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Added deferred comment for nonce-based CSP.
- **WebSocket auth:** Added `Sec-WebSocket-Protocol` subprotocol token support (`token.<jwt>`) as primary method, query param as deprecated fallback with warning log.

### 121-D: Data Boundaries & Error Sanitization
- **RLS bypass audit:** `bypassRls()` now logs `warn` with caller stack trace and class name on every invocation
- **Error sanitization:** `sendError()` returns "An internal error occurred" for status 500. Other status codes preserve their messages.
- **Pagination bounds:** Added `parsePagination()` utility (max 100 default, clamped). Applied to ~20 route files across brain, workflow, soul, training, marketplace, audit, notifications, risk-assessment, spirit, integrations, chat, mcp, execution.
- **License key persistence:** POST /api/v1/license/key now persists to `brain.meta` via `setMeta('license:key', key)`. On startup, loads from `brain.meta` if env var not set.

## Consequences

- No credential material in tracked files
- Pre-commit hook prevents accidental credential commits
- Terminal route injection surface reduced from ~0 protection to comprehensive metacharacter blocking
- Workflow conditions can no longer execute arbitrary JavaScript
- All API routes have rate limiting enforced at the gateway level
- Internal error details never leak to clients in production
- All paginated endpoints have bounded limits (max 100-1000 depending on route)
- RLS bypass operations are auditable via structured logs
- License keys survive container restarts via database persistence
