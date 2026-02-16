# Development Roadmap

> Development phases and progress for F.R.I.D.A.Y.

---

## Development Phases

```
Phase 1          Phase 2          Phase 2.5        Phase 3          Phase 4          Phase 5
Foundation       Security         Infrastructure   Dashboard        Integrations     Production
   |                |                |                |                |                |
   v                v                v                v                v                v
[Core Agent] -> [RBAC/Crypto] -> [Brain/Comms] -> [React UI] -> [Platforms] -> [Hardening]
   |                |                |                |                |                |
   +- Task Loop     +- Encryption    +- CLI           +- Metrics       +- Telegram      +- Load Testing
   +- Logging       +- Sandbox       +- Brain/Soul    +- History       +- Discord       +- Security Testing
   +- Config        +- Validation    +- E2E Comms     +- Connections   +- Slack         +- Prometheus
   +- Storage       +- Rate Limit    +- Fallbacks     +- Security      +- GitHub        +- Docs
   +- AI Providers  +- mTLS          +- Task Storage  +- Soul UI       +- Webhooks      +- Deployment
```

---

## Phase 1: Foundation

**Status**: Complete

- TypeScript project structure with strict mode, ESLint, Prettier, Vitest
- Configuration management (YAML + env vars + Zod validation)
- Base agent loop with task queue, event-driven architecture, graceful shutdown
- Multi-provider AI integration (Anthropic, OpenAI, Gemini, Ollama, LM Studio, LocalAI, OpenCode Zen)
- Structured logging with UUID v7, correlation IDs, SQLite WAL storage
- Cryptographic audit chain (HMAC-SHA256, integrity verification)
- Log query API with REST endpoint

---

## Phase 2: Security Layer

**Status**: Complete

### Authentication & Authorization
- RBAC with role definitions (Admin, Operator, Auditor, Viewer), inheritance, persistent storage
- JWT authentication with refresh token rotation, blacklisting
- API key authentication with rate limiting and revocation
- Gateway middleware for per-route RBAC enforcement

### Encryption & Secrets
- AES-256-GCM encryption at rest with scrypt KDF
- System keyring integration (macOS Keychain, Linux Secret Service)
- Secret rotation with dual-key JWT verification and grace periods

### Input Validation & Protection
- Input validation pipeline (size limits, encoding normalization, injection detection)
- Prompt injection defense (6 pattern families, blocking + warning modes)
- Rate limiting with sliding window counters (per-user, per-IP, per-API-key, global)

### Sandboxing
- Cross-platform sandbox abstraction (`Sandbox` interface, `SandboxManager`)
- Linux: V1 soft sandbox + V2 Landlock kernel enforcement via forked worker
- macOS: `sandbox-exec` profile generation with deny-default policy
- NoopSandbox fallback with warning

### Additional
- Soul system (personality, skills, onboarding, 18 REST endpoints)
- mTLS with client certificate authentication
- Redis-backed distributed rate limiting

---

## Phase 2.5: Core Infrastructure Gaps

**Status**: Complete

- CLI entry point (`--port`, `--host`, `--config`, `--log-level`, `--tls`)
- SQLite task storage with filtering, pagination, and metrics
- Security events query API
- Rate limit metrics integration
- Brain system (memory, knowledge, skills with decay and pruning)
- E2E encrypted inter-agent communication (X25519 + Ed25519 + AES-256-GCM)
- Model fallback chain on rate limits (429) / provider unavailability (502/503)

---

## Phase 3: Dashboard

**Status**: Complete

- React + Vite + TypeScript with URL routing (react-router-dom v7)
- TanStack Query for server-state management
- WebSocket client with auto-reconnection and channel subscriptions
- Overview page with stat cards (tasks, heartbeat, audit, memory), services status panel (core, Postgres, audit chain, MCP, uptime, version)
- MetricsGraph (ReactFlow with custom node types, live connection edges for health/database/MCP/security status, click-to-detail node expansion via System Details tab)
- TaskHistory with advanced filtering (status + type), live data
- SecurityEvents with severity-based styling, live data, heartbeat task viewer
- ConnectionManager with connect forms, start/stop/delete, error retry
- ResourceMonitor with CPU/Memory gauges, token/cost tracking, real history
- Soul/Personality UI (onboarding wizard, personality editor, skills manager)
- Login page with JWT auth, automatic token refresh on 401
- Coding IDE view (Monaco editor with personality-scoped AI chat sidebar)
- Voice interface (browser-native SpeechRecognition + speechSynthesis)
- Session timeout warning, ErrorBoundary, ConfirmDialog
- Responsive mobile layout, dark/light theme

---

## Phase 4: Integrations

**Status**: Complete

- Plugin architecture (`Integration` interface, `IntegrationManager`, `IntegrationStorage`, factory pattern)
- Message abstraction (`UnifiedMessage`, `MessageAttachment`, `PlatformAdapter`, `MessageRouter`)
- REST API routes for CRUD + start/stop + messages with RBAC
- Telegram, Discord, Slack, GitHub, Google Chat, CLI, Generic Webhook adapters
- Conversation management, auto-reconnect, per-platform rate limiting

---

## Phase 5: Production Hardening

**Status**: Complete

- Docker packaging (multi-stage Dockerfile, docker-compose, non-root user, healthcheck)
- CI/CD pipeline (lint, typecheck, test, build, security audit, docker build; Node 20+22 matrix)
- Load testing (k6 scripts: API endpoints, auth flow, WebSocket, task creation)
- Security testing (injection, JWT manipulation, rate limit bypass, RBAC, audit integrity)
- Chaos testing (database corruption, crash recovery, resource exhaustion)
- Prometheus metrics endpoint with Grafana dashboard and alert rules
- Log aggregation (append-only JSONL file writer, log rotation with gzip, Loki + Promtail)
- MCP service (`@friday/mcp`) — 22+ tools, 7 resources, 4 prompts
- Skill marketplace with cryptographic signature verification
- Team workspaces with workspace-scoped RBAC
- A/B testing framework, audit report generator, cost optimization

---

## Test Coverage

| Package | Tests | Files |
|---------|-------|-------|
| `@friday/core` | 1360+ | 76 |
| `@friday/mcp` | 219 | 27 |
| `@friday/dashboard` | 124 | 13 |
| Security + Chaos | ~76 | 8 |
| **Total** | **1700+** | **115+** |

All core modules maintain >80% coverage thresholds.

---

## Timeline Summary

| Milestone | Status |
|-----------|--------|
| Phase 1: Foundation | Complete |
| Phase 2: Security | Complete |
| Phase 2.5: Infrastructure | Complete |
| Phase 3: Dashboard | Complete |
| Phase 4: Integrations | Complete |
| Phase 5: Production | Complete |
| **2026.2.15 Release** | **Released 2026-02-15** |

---

## Future Enhancements

- Distributed deployment (Kubernetes)
- ML-based anomaly detection
- Mobile app

---

## Related Documentation

- [Architecture Overview](architecture.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: February 2026*
