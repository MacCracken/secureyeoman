# Development Roadmap

> Development phases and progress for F.R.I.D.A.Y.

---

## Development Phases

```
Phase 1          Phase 2          Phase 2.5        Phase 3          Phase 4          Phase 5          Phase 6
Foundation       Security         Infrastructure   Dashboard        Integrations     Production       Cognitive
   |                |                |                |                |                |                |
   v                v                v                v                v                v                v
[Core Agent] -> [RBAC/Crypto] -> [Brain/Comms] -> [React UI] -> [Platforms] -> [Hardening] -> [Intelligence]
   |                |                |                |                |                |                |
   +- Task Loop     +- Encryption    +- CLI           +- Metrics       +- Telegram      +- Load Testing  +- Vector Memory
   +- Logging       +- Sandbox       +- Brain/Soul    +- History       +- Discord       +- Security Test +- Consolidation
   +- Config        +- Validation    +- E2E Comms     +- Connections   +- Slack         +- Prometheus    +- History Compress
   +- Storage       +- Rate Limit    +- Fallbacks     +- Security      +- GitHub        +- Docs          +- Sub-Agents
   +- AI Providers  +- mTLS          +- Task Storage  +- Soul UI       +- Webhooks      +- Deployment    +- Hooks/Code Exec
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
| Phase 6.1a: Vector Memory | Planned |
| Phase 6.1b: Memory Consolidation | Planned |
| Phase 6.2: History Compression | Planned |
| Phase 6.3: Sub-Agent Delegation | Planned |
| Phase 6.4a: Lifecycle Hooks | Planned |
| Phase 6.4b: Code Execution | Planned |

---

## Phase 6: Cognitive Architecture

**Status**: Planned | **ADRs**: 031–036
**Inspired by**: Comparative analysis with [agent-zero](https://github.com/agent0ai/agent-zero) cognitive patterns

```
Phase 6.1           Phase 6.2           Phase 6.3           Phase 6.4
Memory              Context             Multi-Agent          Extensibility
Foundations         Intelligence        Architecture         & Execution
    |                   |                   |                   |
    v                   v                   v                   v
[Vector Memory] -> [History       ] -> [Sub-Agent   ] -> [Hooks      ]
[Consolidation]    [Compression   ]    [Delegation  ]    [Code Exec  ]
    |                   |                   |                   |
    +- Embeddings       +- 3-tier compress  +- Specialized      +- 24 lifecycle hooks
    +- FAISS/Qdrant     +- LLM summarize    |  profiles         +- TS plugins + events
    +- Semantic recall  +- Persistent DB    +- Context isolation +- Sandboxed runtimes
    +- LLM dedup        +- Token budgeting  +- RBAC inheritance  +- Approval flow
```

---

### Phase 6.1: Memory Foundations

#### 6.1a — Vector Memory with Semantic Embeddings — [ADR 031](../adr/031-vector-semantic-memory.md)

**Priority**: Highest | **Complexity**: High

Upgrade the Brain from keyword/category-based lookups to vector-based semantic similarity search.

**Decisions**:
- **Embedding providers**: Configurable — local-first (SentenceTransformers) or API-based (OpenAI, Gemini). Users choose one or both, following the MCP model of offering enterprise in-house capability
- **Vector backends**: FAISS (default, in-process) and Qdrant (distributed deployments). ChromaDB reserved as future option
- **Integration**: Extends existing BrainStorage — vector indexing alongside current SQLite, not replacing it
- **Retrieval**: Cosine similarity with configurable thresholds, metadata filtering via existing Brain query patterns

**Deliverables**:
- [ ] Embedding provider abstraction (local + API)
- [ ] FAISS vector store adapter
- [ ] Qdrant vector store adapter
- [ ] BrainStorage extension for vector-indexed memories and knowledge
- [ ] Migration path for existing Brain data
- [ ] Configuration in `secureyeoman.yaml` under `brain.vector`
- [ ] Dashboard UI for similarity search exploration

#### 6.1b — LLM-Powered Memory Consolidation — [ADR 032](../adr/032-memory-consolidation.md)

**Priority**: High | **Complexity**: Medium | **Depends on**: 6.1a

Prevent memory bloat through intelligent deduplication — an LLM analyzes similar memories and decides whether to merge, replace, update, or keep them separate.

**Decisions**:
- **Trigger model**: Hybrid — quick similarity check on every memory save (fast near-duplicate detection), plus scheduled deep consolidation for broader semantic merging
- **Schedule**: User-configurable interval via settings UI (default: daily)
- **Safety**: 0.9 similarity threshold for destructive REPLACE actions, race condition protection, 60s timeout per batch, fallback to direct insertion on failure
- **Actions**: MERGE, REPLACE, KEEP_SEPARATE, UPDATE, SKIP — decided by utility LLM call

**Deliverables**:
- [ ] ConsolidationManager with on-save quick check
- [ ] Scheduled deep consolidation job (configurable interval)
- [ ] LLM consolidation prompt templates
- [ ] Settings UI for schedule configuration
- [ ] Audit trail entries for all consolidation actions
- [ ] Metrics: consolidation runs, merges performed, memory count trends

---

### Phase 6.2: Context Intelligence

#### Progressive History Compression — [ADR 033](../adr/033-progressive-history-compression.md)

**Priority**: High | **Complexity**: Medium

Replace hard truncation with intelligent multi-tier history compression so the agent maintains coherent context across long and multi-session conversations.

**Decisions**:
- **Persistence**: Compressed history stored in SQLite, survives restarts — enables long-running multi-session conversations
- **Tiers**: Message → Topic → Bulk, with percentage-based token allocation (50% current topic, 30% historical topics, 20% bulk archives)
- **Compression escalation**: Large message truncation → LLM summarization → bulk merging (groups of 3) → oldest bulk removal
- **Scope**: Per-conversation, per-platform — integrates with existing ConversationManager

**Deliverables**:
- [ ] HistoryCompressor with 3-tier compression pipeline
- [ ] Token counting integration (reuse existing AI cost calculator)
- [ ] LLM summarization prompts for topic/bulk compression
- [ ] SQLite schema for persistent compressed history
- [ ] ConversationManager integration
- [ ] Configuration: tier allocation percentages, max tokens per tier
- [ ] Dashboard: conversation history viewer with compression indicators

---

### Phase 6.3: Multi-Agent Architecture

#### Sub-Agent Delegation System — [ADR 034](../adr/034-sub-agent-delegation.md)

**Priority**: Medium | **Complexity**: High

Enable the primary agent to spawn subordinate agents with specialized personas for focused subtask execution.

**Decisions**:
- **Profiles**: Specialized — sub-agents get distinct prompt profiles optimized for their task type (researcher, coder, analyst, etc.), not inheriting parent Soul
- **Context isolation**: Each sub-agent gets its own conversation context, sealed after completion to prevent bleed into parent
- **Hierarchy**: Configurable max depth (default: 3); sub-agents can delegate further
- **Resource control**: Sub-agents inherit parent's RBAC scope (cannot escalate), with per-agent token budgets

**Deliverables**:
- [ ] SubAgentManager: spawn, monitor, collect results
- [ ] Agent profile definitions (Markdown prompt files per profile)
- [ ] Default profiles: researcher, coder, analyst, summarizer
- [ ] Context isolation and sealing mechanism
- [ ] Token budget tracking per sub-agent
- [ ] RBAC inheritance and delegation rules
- [ ] Dashboard: sub-agent execution tree visualization
- [ ] MCP tools: `delegate_task`, `list_sub_agents`, `get_delegation_result`

---

### Phase 6.4: Extensibility & Execution

#### 6.4a — Lifecycle Extension Hooks — [ADR 035](../adr/035-lifecycle-extension-hooks.md)

**Priority**: Medium | **Complexity**: Medium

Expose 20+ lifecycle hooks that let users inject custom logic at key stages without modifying core code.

**Decisions**:
- **Dual system**: TypeScript plugin modules for deep customization + EventEmitter/webhook emission for lightweight integrations. Plugin authors can also emit custom events
- **Discovery**: Filesystem-based — `extensions/` directory with numeric prefix ordering (`_10_`, `_50_`)
- **Override**: User extensions in `~/.secureyeoman/extensions/` override built-in defaults with same filename

**Hook categories**:

| Phase | Hooks |
|-------|-------|
| Agent lifecycle | `agent_init`, `agent_shutdown` |
| Message loop | `message_loop_start`, `message_loop_end`, `prompt_assembly_before`, `prompt_assembly_after` |
| LLM calls | `before_llm_call`, `after_llm_call`, `stream_chunk`, `stream_end` |
| Tool execution | `tool_execute_before`, `tool_execute_after` |
| Memory | `memory_save_before`, `memory_save_after`, `memory_recall_before` |
| Sub-agent | `delegation_before`, `delegation_after`, `sub_agent_sealed` |
| Integration | `message_received`, `message_sent`, `platform_connected` |
| Security | `auth_success`, `auth_failure`, `rate_limit_hit` |

**Deliverables**:
- [ ] ExtensionManager with filesystem discovery and loading
- [ ] Hook registry with typed signatures per hook point
- [ ] EventEmitter integration for lightweight subscribers
- [ ] Webhook dispatch for external hook consumers
- [ ] User extension directory support with override semantics
- [ ] Documentation: hook catalog, extension authoring guide
- [ ] Example extensions: logging enhancer, custom memory filter, Slack notifier

#### 6.4b — Sandboxed Code Execution Tool — [ADR 036](../adr/036-sandboxed-code-execution.md)

**Priority**: Medium | **Complexity**: Medium

Let the agent write and execute code (Python, Node.js, shell) within the existing Landlock/seccomp sandbox to solve novel problems dynamically.

**Decisions**:
- **Sandbox**: Always enabled — leverages existing Landlock (Linux) and macOS sandbox infrastructure. Not optional
- **User opt-in**: The personality's ability to *create* code requires explicit enablement:
  - Config toggle: `security.codeExecution.enabled` in `secureyeoman.yaml` (admin-only)
  - Auto-approve toggle: `security.codeExecution.autoApprove` — if `false` (default), every execution requires per-execution user approval via dashboard prompt
  - If `autoApprove: true`, executions proceed without prompting (for trusted/automated environments)
- **Runtimes**: Python (child process), Node.js (isolated-vm), shell (sandboxed subprocess)
- **Persistent sessions**: Shell sessions survive across commands within a conversation
- **Limits**: Configurable max execution time (default 180s), max output size (default 1MB), memory limits via existing sandbox config

**Deliverables**:
- [ ] CodeExecutionTool with multi-runtime support
- [ ] Approval flow: dashboard prompt for per-execution approval when autoApprove is off
- [ ] Persistent session manager (session pool per conversation)
- [ ] Output streaming to dashboard via WebSocket
- [ ] Streaming secrets filter for code output (prevent API key leakage in stdout)
- [ ] MCP tools: `execute_code`, `list_sessions`, `kill_session`
- [ ] Configuration schema under `security.codeExecution`
- [ ] Audit trail entries for all code executions (input code + output captured)

---

### Phase 6 Dependency Graph

```
Phase 6.1                  Phase 6.2              Phase 6.3              Phase 6.4
┌──────────┐              ┌──────────┐           ┌──────────┐           ┌──────────┐
│6.1a Vector│──────┬──────│6.2 History│           │6.4a Hooks│           │          │
│  Memory   │      │      │ Compress  │           │          │           │          │
└──────────┘      │      └──────────┘           └──────────┘           │          │
                   │                                                     │          │
┌──────────┐      │      ┌──────────┐                                  │6.4b Code │
│6.1b Memory│◄─────┘      │6.3 Sub-  │                                  │  Exec    │
│  Consol.  │             │  Agents  │                                  │          │
└──────────┘             └──────────┘                                  └──────────┘

  6.1b depends on 6.1a — all others are independent but ordered by value
```

---

### Phase 6 Success Metrics

| Metric | Target |
|--------|--------|
| Memory recall relevance (semantic vs keyword) | 40% improvement in retrieval precision |
| Context coherence over 50+ message conversations | No critical context loss |
| Complex task completion (multi-step) | 30% improvement with sub-agent delegation |
| Extension adoption | 5+ community extensions within 3 months of hook release |
| Code execution task coverage | 25% of tasks benefit from dynamic code generation |

---

## Future Enhancements

- Distributed deployment (Kubernetes)
- ML-based anomaly detection
- Mobile app
- Browser automation agent (Playwright/Puppeteer with vision model)
- A2A protocol interoperability (after sub-agent delegation proves out)
- ChromaDB as additional vector backend option

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
