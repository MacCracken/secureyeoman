# ADR 122 — Security Audit Logging Completeness

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

The audit chain was not recording several important security events:

- **Rate limit exceeded** on chat requests: no audit record, only a logger warn
- **Security policy changes** via `PATCH /api/v1/security/policy`: no audit record
- **Invalid API key** in `validateApiKey()`: `authFailuresTotal` counter was incremented but no audit chain record was written
- **Input validation failures** in chat and soul routes: not yet wired (routes themselves not yet validated)
- The `GET /api/v1/security/events` endpoint did not include `ai_request` or `ai_response` in its filter list

## Decision

### A. Rate limit events → audit chain

`chat-routes.ts` records `event: 'rate_limit'` to the audit chain when either the global `chat_requests` rule or a per-personality rule blocks a request. Includes `rule`, `endpoint`, and optionally `personalityId` in metadata.

### B. Policy change → audit chain

`server.ts` `PATCH /api/v1/security/policy` handler records `event: 'config_change'` after a successful policy update, with `changes: string[]` (the keys that were present in the request body) and `updatedBy: userId`.

### C. Invalid API key → audit chain

`auth.ts` `validateApiKey()`: before throwing `AuthError('Invalid API key', 401)`, increments `authFailuresTotal` (was already done for JWT failures, not API key) and calls `this.audit('auth_failure', 'Invalid API key presented', { reason: 'invalid_api_key' })`.

### D. Input validation failures → audit chain

`chat-routes.ts` and `soul-routes.ts` both record `event: 'injection_attempt'` when `InputValidator` blocks a request (wired in ADR 120).

### E. AI events in security feed

Added `'ai_request'` and `'ai_response'` to `SECURITY_EVENT_TYPES` in the `/api/v1/security/events` handler so they appear in the dashboard security feed when recorded by the AI client layer.

## Consequences

- The dashboard security feed now covers the full lifecycle: auth failures, rate limits, injection attempts, and config changes.
- All security events use the existing audit chain — no new storage, no new dependencies.
- `audit()` calls in chat/soul routes are `void`-fired (fire-and-forget) so they never delay the response path.
