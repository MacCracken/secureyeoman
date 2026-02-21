# ADR 090 — Agnostic QA Sub-Agent Team Integration

**Status**: Accepted
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

| Tool | Purpose | Needs Agnostic TODO P1 |
|------|---------|----------------------|
| `agnostic_health` | Reachability check | No |
| `agnostic_agents_status` | Per-agent live status | No |
| `agnostic_agents_queues` | RabbitMQ queue depths | No |
| `agnostic_dashboard` | Aggregate metrics | No |
| `agnostic_session_list` | Recent QA sessions | No |
| `agnostic_session_detail` | Full session results | No |
| `agnostic_generate_report` | Generate exec/security/perf report | No |
| `agnostic_submit_qa` | Submit a QA task to the full team | **Yes** |
| `agnostic_task_status` | Poll task completion | **Yes** |

`agnostic_submit_qa` and `agnostic_task_status` are wired and ready but return an actionable error pointing to `agnostic/TODO.md Priority 1` until `POST /api/tasks` and `GET /api/tasks/{id}` are implemented in Agnostic.

**Auth** — the bridge logs in via `POST /api/auth/login` on first use and caches the JWT in-process, refreshing before expiry. Once Agnostic implements API key auth (TODO Priority 2), `AGNOSTIC_API_KEY` will replace the username/password pair.

### Configuration

```env
# Lifecycle management
AGNOSTIC_PATH=/path/to/agnostic     # optional override

# MCP tool bridge
MCP_EXPOSE_AGNOSTIC_TOOLS=true
AGNOSTIC_URL=http://127.0.0.1:8000
AGNOSTIC_EMAIL=admin@example.com
AGNOSTIC_PASSWORD=your-password
```

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

## What Was NOT Decided

- Whether to merge Agnostic into the YEOMAN monorepo (kept separate — different language/stack)
- Auto-start Agnostic on `secureyeoman start` (opt-in; user runs `secureyeoman agnostic start`)
- A2A protocol integration between YEOMAN and Agnostic (possible future — use A2A for structured delegation rather than REST)
- Whether Agnostic's Redis should be shared with YEOMAN (currently separate; sharing via `AGNOSTIC_REDIS_URL` is a future option)

---

## Consequences

**Positive**
- YEOMAN agents can delegate the full QA pipeline (security, performance, regression, compliance) to a specialised team with a single `agnostic_submit_qa` tool call
- Container lifecycle is first-class — no manual directory switching
- The bridge works incrementally: read-only tools (status, sessions, reports) work today; task submission works as soon as Agnostic implements the REST endpoint
- Skills and tools remain independent — the ethical-whitehat-hacker skill works on any system; the Agnostic bridge is additive

**Negative / Trade-offs**
- Requires Agnostic to be running separately — adds operational complexity
- Python/Docker dependency chain is outside the YEOMAN TypeScript monorepo
- Task submission requires `agnostic/TODO.md Priority 1` before end-to-end automation works
- No automatic auth token refresh if the server restarts — token cache is in-process memory

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
