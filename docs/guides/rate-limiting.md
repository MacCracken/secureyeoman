# Rate Limiting

SecureYeoman includes a sliding-window rate limiter that protects all API endpoints and MCP tool calls from abuse. It operates in two modes: **in-memory** (default, single-instance) and **Redis-backed** (distributed, for multi-instance deployments).

---

## Default Rules

The following rules are active out of the box:

| Rule | Window | Max requests | Key type | Action |
|------|--------|-------------|----------|--------|
| `api_requests` | 60 s | 100 | per user | reject |
| `chat_requests` | 60 s | 30 | per user | reject |
| `task_creation` | 60 s | 20 | per user | reject |
| `expensive_operations` | 60 min | 10 | per user | reject |
| `auth_attempts` | 15 min | 5 | per IP | reject |
| `auth_refresh` | 60 s | 10 | per IP | reject |
| `auth_reset_password` | 60 min | 3 | per IP | reject |

When a limit is exceeded the API returns **429 Too Many Requests** with a `Retry-After` header indicating how many seconds until the window resets.

---

## Configuration

Rate limiting is configured under `security.rateLimiting` in your SecureYeoman config or via environment variables:

```yaml
security:
  rateLimiting:
    defaultWindowMs: 60000      # Default window (ms) for the catch-all rule
    defaultMaxRequests: 100     # Default limit for the catch-all rule
    authLoginMaxAttempts: 5     # Login attempts per window
    authLoginWindowMs: 900000   # Login window (15 min)
    redisUrl: ""                # If set, use Redis-backed limiter
    redisPrefix: "secureyeoman:rl"  # Key prefix in Redis
```

Environment variable equivalents:

```bash
RATE_LIMIT_DEFAULT_WINDOW_MS=60000
RATE_LIMIT_DEFAULT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX_ATTEMPTS=5
RATE_LIMIT_AUTH_WINDOW_MS=900000
REDIS_URL=redis://redis:6379
```

---

## In-Memory Mode (Default)

The in-memory `RateLimiter` uses sliding windows stored in a `Map`. Windows expire automatically via a background cleanup job (every 60 seconds). This mode is suitable for single-instance deployments.

**Limitation**: state is not shared across processes. If you run multiple core instances behind a load balancer, each instance tracks its own counters — use Redis mode to share limits across instances.

---

## Redis Mode (Distributed)

When `REDIS_URL` is set, the `RedisRateLimiter` is used instead. It stores sliding-window buckets in Redis sorted sets (`ZADD` + `ZCOUNT`) with atomic `MULTI/EXEC` pipelines, making limits accurate across any number of core instances.

```bash
# docker-compose.yml
environment:
  REDIS_URL: redis://redis:6379
  REDIS_PREFIX: secureyeoman:rl
```

Redis connection failures are logged but do not crash the service — requests fall through as allowed if Redis is unreachable.

---

## Key Types

| Key type | Scope |
|----------|-------|
| `ip` | Keyed by client IP address |
| `user` | Keyed by authenticated user ID |
| `api_key` | Keyed by API key identifier |
| `global` | Shared counter across all callers |

---

## Exceed Actions

| Action | Behaviour |
|--------|-----------|
| `reject` | Returns 429 with `Retry-After` header |
| `log_only` | Allows request but logs a warning — useful for monitoring before enforcing |
| `delay` | (Planned) Hold the request until the window resets |

---

## Response Headers

Allowed requests include standard rate-limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1709130000
```

Rejected requests add:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 37
```

---

## MCP Tool Rate Limiting

MCP tools use a separate middleware-layer rate limiter in the MCP service process. Each tool call is checked against a per-tool rule. The rate limiter middleware is injected via `ToolMiddleware.rateLimiter` and runs before input validation and audit logging.

When a tool call is rate-limited, the tool returns an `isError: true` response:

```json
{
  "content": [{ "type": "text", "text": "Rate limit exceeded for \"kb_search\". Retry after 2345ms." }],
  "isError": true
}
```

---

## Metrics

Rate limiter statistics are included in the system metrics snapshot:

```json
{
  "security": {
    "rateLimitHits": 12,
    "rateLimitChecks": 4832
  }
}
```

- `rateLimitHits` — cumulative count of rejected requests (monotonically increasing)
- `rateLimitChecks` — cumulative count of all rate-limit checks

These are visible in **Mission Control → Security Events** and exposed at `GET /api/v1/metrics`.

---

## Troubleshooting

### All requests returning 429

If legitimate requests are being blocked, check:
- Whether a proxy or load balancer is forwarding a shared IP (`X-Forwarded-For` not being passed through correctly)
- The `auth_attempts` window (15 min) — a burst of login failures from the same IP can block subsequent legitimate logins

### Rate limits not shared across instances

Ensure `REDIS_URL` is configured and the Redis instance is reachable from all core containers. Check core logs for `Failed to connect to Redis for rate limiting`.

### Relaxing limits for development

In `.env.dev`, set:
```bash
RATE_LIMIT_AUTH_MAX_ATTEMPTS=100
RATE_LIMIT_AUTH_WINDOW_MS=1000
```

This raises the auth limit to 100 attempts per second, preventing test suites from hitting the auth limiter.
