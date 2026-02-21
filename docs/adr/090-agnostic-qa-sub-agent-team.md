# ADR 090 — Agnostic QA Sub-Agent Team Integration

**Status**: Accepted (amended 2026-02-21)
**Date**: 2026-02-21

---

## Context

YEOMAN agents are already capable of automated penetration testing (ADR 089), memory-augmented reasoning, and multi-agent delegation. A natural extension is to delegate **software quality assurance** to a specialised agent team rather than using a general-purpose LLM for QA tasks.

[Agnostic](https://github.com/MacCracken/agnostic) is a Python/CrewAI 6-agent QA platform in an adjacent repository. It provides:

- **QA Manager** — decomposes requirements, delegates to specialised agents
- **Senior QA** — self-healing selectors, model-based testing, edge-case analysis, AI test generation
- **Junior QA** — regression suites, Playwright UI tests, synthetic data generation, flaky test detection
- **QA Analyst** — cross-agent result synthesis, defect prediction, risk scoring, release readiness
- **Security & Compliance** — OWASP, GDPR, PCI DSS, SOC 2, ISO 27001, HIPAA
- **Performance & Resilience** — load testing, chaos engineering, P95/P99 latency profiling

YEOMAN needs two distinct things to use Agnostic effectively:

1. **Container lifecycle management** — users should not need to manually `cd ~/agnostic && docker compose up`. A YEOMAN CLI command should own the lifecycle.
2. **MCP tool bridge** — YEOMAN agents should be able to invoke Agnostic capabilities as MCP tool calls without leaving the YEOMAN context.

---

## Decision

### Layer 1 — Container Lifecycle (`secureyeoman agnostic`)

A new CLI command manages the Agnostic Docker Compose stack:

```
secureyeoman agnostic start    # docker compose up -d
secureyeoman agnostic stop     # docker compose down
secureyeoman agnostic status   # per-container state table
secureyeoman agnostic logs [agent] [--follow] [--tail N]
secureyeoman agnostic pull     # docker compose pull
```

**Path resolution** — the command finds the agnostic directory in priority order:
1. `--path <dir>` flag
2. `AGNOSTIC_PATH` env var
3. Auto-detect: `../agnostic` (sibling), `~/agnostic`, `~/Repos/agnostic`, `~/Projects/agnostic`

This means `secureyeoman agnostic start` just works in the common case where both repos are cloned side by side.

### Layer 2 — MCP Tool Bridge (`agnostic_*` tools)

Nine MCP tools bridge YEOMAN agents to the Agnostic REST API:

| Tool | Purpose | Status |
|------|---------|--------|
| `agnostic_health` | Reachability check | ✅ Fully functional |
| `agnostic_agents_status` | Per-agent live status | ✅ Fully functional |
| `agnostic_agents_queues` | RabbitMQ queue depths | ✅ Fully functional |
| `agnostic_dashboard` | Aggregate metrics | ✅ Fully functional |
| `agnostic_session_list` | Recent QA sessions | ✅ Fully functional |
| `agnostic_session_detail` | Full session results | ✅ Fully functional |
| `agnostic_generate_report` | Generate exec/security/perf report | ✅ Fully functional |
| `agnostic_submit_qa` | Submit a QA task to the full team | ✅ Fully functional (Agnostic P1–P3 implemented) |
| `agnostic_task_status` | Poll task completion | ✅ Fully functional (Agnostic P1 implemented) |

All nine tools are now end-to-end functional. `agnostic_submit_qa` supports `callback_url` + `callback_secret` for webhook delivery (no polling required), `business_goals`, `constraints`, and agent selection.

**Auth** — prefers `AGNOSTIC_API_KEY` (`X-API-Key` header; static or Redis-backed). Falls back to `POST /api/auth/login` JWT when only `AGNOSTIC_EMAIL` + `AGNOSTIC_PASSWORD` are set. Token is cached in-process and refreshed before expiry.

### Configuration

```env
# Lifecycle management
AGNOSTIC_PATH=/path/to/agnostic     # optional override

# MCP tool bridge
MCP_EXPOSE_AGNOSTIC_TOOLS=true
AGNOSTIC_URL=http://127.0.0.1:8000
AGNOSTIC_API_KEY=your-api-key       # preferred: static key auth
# AGNOSTIC_EMAIL=admin@example.com  # fallback: JWT auth
# AGNOSTIC_PASSWORD=your-password   # fallback: JWT auth
```

---

## Amendment — 2026-02-21: Agnostic Priorities 1–4 Implemented

After verifying the Agnostic REST API (`webgui/api.py`), Priorities 1–4 from `agnostic/TODO.md` are now fully implemented in Agnostic:

- **P1** — `POST /api/tasks` + `GET /api/tasks/{task_id}`: Redis-backed task state, fire-and-forget `asyncio.create_task`
- **P2** — `X-API-Key` auth: `AGNOSTIC_API_KEY` env var, `sha256(key)` storage, management endpoints
- **P3** — Webhook callbacks: `callback_url` + `callback_secret` on `TaskSubmitRequest`; HMAC-SHA256 signed POST on completion
- **P4** — Agent-specific endpoints: `POST /api/tasks/security`, `/performance`, `/regression`, `/full`

The YEOMAN MCP bridge has been updated accordingly:
- `getAuthHeaders()` replaces `getToken()`: returns `{ 'X-API-Key': key }` or `{ Authorization: 'Bearer ...' }` based on which credentials are configured
- `agnostic_submit_qa` now accepts `callback_url`, `callback_secret`, `business_goals`, `constraints`
- `AGNOSTIC_API_KEY` added to `McpServiceConfig` schema and config parser
- All "not yet implemented" TODO stubs removed — all nine tools are end-to-end functional

---

## The Agnostic TODO.md

A prioritised improvement list was written to `agnostic/TODO.md` covering:

- **P1** `POST /api/tasks` + `GET /api/tasks/{id}` — unlocks full task submission from YEOMAN
- **P2** API key auth — eliminates password in `.env`
- **P3** Webhook callbacks — eliminates polling
- **P4** Agent-specific task endpoints (`/api/tasks/security`, `/api/tasks/performance`, etc.)
- **P5** OpenAPI schema + TypeScript client generation
- **P6** Enhanced `/health` with per-agent heartbeat
- **P7** CORS headers for YEOMAN dashboard

---

## Amendment 2 — 2026-02-21: A2A Bridge + Auto-Start Toggle

### Auto-Start Toggle (`AGNOSTIC_AUTO_START=true`)

`secureyeoman start` now checks `AGNOSTIC_AUTO_START=true` at startup. When set, it resolves the Agnostic path (same priority order as the `agnostic` CLI command) and runs `docker compose up -d --remove-orphans` before printing the gateway banner.

**Behaviour:**
- Non-fatal: if compose fails or the path is not found, a warning is logged and the gateway starts regardless.
- Uses the exported `resolveAgnosticPath()` and `compose()` helpers from `agnostic.ts`.

**Configuration:**
```env
AGNOSTIC_AUTO_START=true          # enable auto-start
AGNOSTIC_PATH=/path/to/agnostic  # optional path override (same as agnostic CLI)
```

### A2A Protocol Bridge (`agnostic_delegate_a2a` MCP tool)

**YEOMAN side (shipped):**

1. **`agnostic_delegate_a2a` MCP tool** — constructs a structured `a2a:delegate` message and POSTs it to `{AGNOSTIC_URL}/api/v1/a2a/receive`. The message payload carries all QA task fields (`title`, `description`, `target_url`, `priority`, `agents`, `standards`). Returns `message_id` on success, or a 404 guidance message if Agnostic P8 is not yet implemented.

2. **`A2AManager.addTrustedLocalPeer()`** — registers a pre-configured local/internal service as an A2A peer without the SSRF guard. Sets `trustLevel: 'trusted'` and logs an audit event. Use only for services whose URL is read from trusted configuration.

3. **`POST /api/v1/a2a/peers/local`** — REST endpoint wrapping `addTrustedLocalPeer()`. Use to register Agnostic as a peer in YEOMAN's delegation tree at runtime.

**Agnostic side (pending — see `agnostic/TODO.md` P8):**

Agnostic needs to implement:
- `POST /api/v1/a2a/receive` — accept `A2AMessage` JSON, handle `a2a:delegate` type by routing the `payload` to the task queue. The YEOMAN `a2a:delegate` payload structure is:

```python
class A2ADelegatePayload(BaseModel):
    task_type: str          # always "qa" from YEOMAN
    title: str
    description: str
    target_url: str | None
    priority: str           # critical | high | medium | low
    agents: list[str]       # [] = all agents
    standards: list[str]    # ["OWASP", "GDPR", ...]
```

**Message format (from YEOMAN):**
```json
{
  "id": "<uuid>",
  "type": "a2a:delegate",
  "fromPeerId": "yeoman",
  "toPeerId": "agnostic",
  "payload": { "task_type": "qa", "title": "...", ... },
  "timestamp": 1708560000000
}
```

---

## What Was NOT Decided

- Whether to merge Agnostic into the YEOMAN monorepo (kept separate — different language/stack)
- Whether Agnostic's Redis should be shared with YEOMAN (currently separate; sharing via `AGNOSTIC_REDIS_URL` is a future option)

---

## Consequences

**Positive**
- YEOMAN agents can delegate the full QA pipeline (security, performance, regression, compliance) to a specialised team with a single `agnostic_submit_qa` tool call
- Container lifecycle is first-class — no manual directory switching
- The bridge is fully end-to-end: all nine tools work, including task submission (`agnostic_submit_qa`) and polling (`agnostic_task_status`)
- Skills and tools remain independent — the ethical-whitehat-hacker skill works on any system; the Agnostic bridge is additive

**Negative / Trade-offs**
- Requires Agnostic to be running separately — adds operational complexity
- Python/Docker dependency chain is outside the YEOMAN TypeScript monorepo
- No automatic auth token refresh if the server restarts — JWT token cache is in-process memory (mitigated by preferring `AGNOSTIC_API_KEY`)

---

## Alternatives Considered

| Option | Why Rejected / Deferred |
|--------|------------------------|
| Merge Agnostic into YEOMAN monorepo | Different language (Python); would require polyglot monorepo tooling |
| Rewrite Agnostic agents in TypeScript | High effort; CrewAI agent tooling has no TypeScript equivalent of equal maturity |
| A2A protocol between YEOMAN and Agnostic | Requires Agnostic to implement an A2A server; deferred to future phase |
| Shared Redis pub/sub without REST | More brittle than REST; harder to debug; REST is sufficient for the current use case |

---

## Related

- [ADR 004 — MCP Protocol](004-mcp-protocol.md)
- [ADR 089 — Kali Security Toolkit MCP](089-kali-security-toolkit-mcp.md)
- [ADR 056 — Sub-agent Delegation System](056-sub-agent-delegation-system.md)
- [`agnostic/TODO.md`](/home/macro/Repos/agnostic/TODO.md) — Agnostic REST API improvement backlog
