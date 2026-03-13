# ADR 039: Agent Binary — Distribution Tier 2.5

**Status**: Accepted
**Date**: 2026-03-12

## Context

SecureYeoman has three distribution tiers:

| Tier | Binary | Database | Use Case |
|------|--------|----------|----------|
| 1 | `secureyeoman-*` | PostgreSQL | Full platform (SaaS, enterprise) |
| 2 | `secureyeoman-lite-*` | SQLite | Small deployments, single-user |
| 3 | `secureyeoman-edge-*` | Optional/in-memory | IoT, telemetry, A2A relay |

There is a gap between Tier 2 (full platform minus native addons) and Tier 3 (minimal A2A relay). When users want to run autonomous agents — personality-driven, tool-equipped, AI-routed — they must spin up a full SY instance with PostgreSQL, 57 route subsystems, 300–500 MB RAM, and 15–30s boot time. This is wasteful for a use case that only needs soul + AI + delegation.

The edge binary (Tier 3) is too stripped — no soul, no AI providers, no skills, no dynamic tools. It's a telemetry relay, not an agent.

An agent needs to be cattle, not pets: spin up 10 of them without 10 PostgreSQL instances.

## Decision

Introduce **Tier 2.5: Agent Binary** (`secureyeoman-agent-*`) — a streamlined runtime purpose-built for autonomous agent work.

### What It Includes

From the existing codebase, the agent binary bundles:

| Subsystem | Source | Why |
|-----------|--------|-----|
| Soul | `soul/` | Personality, skills, dynamic tools, approval workflows, prompt versioning |
| AI | `ai/` | Multi-provider routing, cost tracking, fallback chains, batch inference |
| Delegation | `delegation/` (subset) | A2A transport, sub-agent spawning, swarm participation |
| Auth | `auth/` (subset) | Token validation (delegate to parent SY), API key auth |
| Security | `security/` (subset) | RBAC enforcement, secrets manager |
| Storage | `storage/` | SQLite adapter (no PostgreSQL dependency) |
| Gateway | `gateway/` (subset) | ~15–20 endpoints (health, A2A, chat, soul, models, tools) |
| Config | `config/` | Full config loader with agent-specific defaults |

### What It Excludes

| Subsystem | Why |
|-----------|-----|
| Brain/RAG (Qdrant, FAISS) | Agents query parent SY's knowledge base via A2A |
| Training (finetune, distillation, federated) | Training is a platform concern, not agent-level |
| Analytics, Simulation, Chaos | Platform-level features |
| Dashboard | Agents are headless |
| Marketplace, Workspace, Backup | Platform management |
| SCIM, Break Glass, DLP, TEE | Enterprise compliance — belongs on the platform |
| Edge Fleet Management | Agents aren't fleet controllers |
| Supply Chain, Federation Control Plane | Platform-level |

### Architecture

```
┌─────────────────────────────────────────────┐
│              AgentRuntime                    │
│  (alternative to SecureYeoman / EdgeRuntime) │
├──────────┬──────────┬───────────────────────┤
│   Soul   │    AI    │    Delegation         │
│ personal │ provider │  A2A, sub-agents      │
│ skills   │ routing  │  swarm participation  │
│ tools    │ cost     │                       │
├──────────┴──────────┴───────────────────────┤
│          Slim Gateway (~15 routes)           │
├─────────────────────────────────────────────┤
│   SQLite   │   Auth (delegated)   │  RBAC   │
└─────────────────────────────────────────────┘
```

`AgentRuntime` follows the same pattern as `EdgeRuntime` — a stripped-down alternative to the `SecureYeoman` class with its own CLI entry point and bun build target.

### Build Target

Added to `scripts/build-binary.sh` as Tier 2.5:

```
Tier 2.5: secureyeoman-agent-linux-x64, arm64, darwin-arm64
```

Bun tree-shakes out brain, training, analytics, simulation, dashboard, marketplace, and all enterprise compliance subsystems.

### Resource Profile

| Metric | Full SY (Tier 1) | Agent (Tier 2.5) | Edge (Tier 3) |
|--------|-------------------|-------------------|----------------|
| Binary size | ~300 MB | ~80–120 MB | ~7 MB |
| Boot time | 15–30s | <5s | <3s |
| Memory | 300–500 MB | 100–200 MB | <100 MB |
| Database | PostgreSQL | SQLite | Optional |
| Endpoints | 57 subsystems | ~15–20 | 3 |
| AI providers | All 43+ | All 43+ | 1 (parent-proxied) |
| Personality | Full | Full | None |

### CLI

```sh
secureyeoman-agent start --port 8099 --parent-url https://sy.local:3000
secureyeoman-agent register --parent-url https://sy.local:3000 --token <reg-token>
secureyeoman-agent status
```

### Parent Relationship

Agents register with a parent SY instance for:
- **Auth delegation** — validate tokens against parent's auth service
- **Knowledge access** — RAG queries forwarded to parent's brain via A2A
- **Audit forwarding** — agent events batched to parent's audit chain
- **Fleet visibility** — parent tracks agent instances alongside edge nodes

Agents can also run standalone (no parent) with local-only auth and SQLite storage.

## Implementation Status (2026-03-13)

All phases complete:

| Phase | Scope | Status |
|-------|-------|--------|
| 15A | AgentRuntime, CLI, build target, SQLite storage | Complete |
| 15B | Parent auth delegation (LRU-cached token validation), knowledge delegation (RAG query forwarding), audit forwarding (batch 50/flush 5s) | Complete |
| 15C | `Dockerfile.agent`, docker-compose `sy-agent` service, `build-binary.sh --agent` flag | Complete |
| 15D | Dashboard agent fleet panel | Planned |
| 15E | Agent self-update & registration protocol | Planned |

Key implementation files:
- `src/agent/agent-runtime.ts` — main runtime (11-step boot, ~15 routes)
- `src/agent/parent-auth-delegate.ts` — token validation against parent SY (LRU cache, 500 entries, 5min TTL)
- `src/agent/knowledge-delegate.ts` — RAG query forwarding to parent's `/api/v1/brain/query`
- `src/agent/audit-forwarder.ts` — batched audit event forwarding (50 events / 5s flush)
- `src/agent/cli.ts` — CLI entry point
- `Dockerfile.agent` — Alpine-based, <120 MB image, tini PID 1
- `docker-compose.yml` — `sy-agent` service (profiles: agent, full, full-dev), 256M RAM limit

## Consequences

- New `AgentRuntime` class in `src/agent/agent-runtime.ts` (parallel to `EdgeRuntime`)
- New CLI entry point `src/agent/cli.ts` for bun build
- New build tier in `build-binary.sh`
- `SECUREYEOMAN_BUILD_TIER=agent` flag for conditional module initialization
- Agents can be deployed as container sidecars, systemd services, or standalone binaries
- Enables scaling agent count independently of platform instances

## Alternatives Considered

1. **Just deploy more full SY instances** — Rejected: PostgreSQL dependency per agent, 300+ MB RAM, 57 route subsystems with unnecessary attack surface, 15–30s boot
2. **Extend EdgeRuntime with soul/AI** — Rejected: edge binary is Go; soul/AI subsystems are TypeScript. Would require rewriting soul in Go or maintaining two soul implementations
3. **Use Tier 2 (lite) as-is** — Rejected: lite still loads all 57 route subsystems, all 12 domain modules, full gateway. It's a lighter _platform_, not an agent runtime

## Migration

- No changes to existing tiers
- No database migrations (agents use SQLite, schema subset applied at first boot)
- Existing A2A protocol unchanged — agents are A2A peers like edge nodes
