# ADR 121 — Per-Personality Rate Limit Config + Dedicated Chat Rule

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

The existing rate limiter had rules for `api_requests` (100/min/user), `task_creation` (20/min/user), `expensive_operations` (10/hr/user), and `auth_attempts` (5/15min/IP) — but no dedicated rule for the chat endpoint. Chat requests are LLM API calls and are the most expensive operation in the system; they deserve their own budget.

Additionally, there was no mechanism for operators to set per-personality rate limits. A high-volume automation personality should be able to have a higher (or lower) chat request budget than the global default without touching server config.

## Decision

### 3a. Dedicated `chat_requests` rule

Added to `STATIC_RULES` in `rate-limiter.ts`:
```ts
{ name: 'chat_requests', windowMs: 60000, maxRequests: 30, keyType: 'user', onExceed: 'reject' }
```

Applied in both `/api/v1/chat` and `/api/v1/chat/stream` route handlers after personality resolution, using `request.authUser?.userId` as the rate limit key.

### 3b. Per-personality override — `ResourcePolicySchema`

Extended `ResourcePolicySchema` in `packages/shared/src/types/soul.ts`:

```ts
rateLimitConfig: z.object({
  chatRequestsPerMinute: z.number().int().min(1).max(1000).optional(),
  enabled: z.boolean().default(true),
}).optional()
```

**No DB migration required.** `ResourcePolicy` lives inside the `body` JSONB column of the `personalities` table.

### 3c. Enforcement in chat routes

When a personality is resolved and has `rateLimitConfig.chatRequestsPerMinute`, the handler:
1. Dynamically registers/updates a rule named `chat_personality_<id>` via `rateLimiter.addRule()`.
2. Checks it alongside the global `chat_requests` rule.
3. Returns 429 if either rule blocks the request.
4. `enabled: false` skips all rate limiting for that personality.
5. Both rejections are recorded to the audit chain as `rate_limit` events.

## Consequences

- Chat endpoints now have a lower, focused rate limit (30/min vs 100/min for `api_requests`).
- Operators can override per-personality without restarting the server.
- `enabled: false` provides an escape hatch for internal or trusted automation personalities.
- Per-personality rules are ephemeral (in-memory); they are re-registered on the next chat request if the server restarts. This is intentional — the source of truth is the personality `body.resourcePolicy.rateLimitConfig`.
