# ADR 001: System Architecture

**Status**: Accepted

## Context

SecureYeoman is a security-hardened autonomous agent platform designed for enterprise environments. As the system matured from a single-process agent into a distributed, multi-tenant platform with native clients, federation, and real-time infrastructure, a series of foundational architectural decisions shaped its design. This document consolidates those decisions into a single reference for the system as shipped.

The driving requirements were:

- **Security above convenience.** Every capability defaults to off. Permissions are explicitly granted, never assumed. Multiple security layers ensure no single point of failure. On error, the system defaults to the most restrictive state.
- **Full auditability.** Every operation produces a log entry. Audit logs are immutable and cryptographically signed.
- **Privacy and local-first operation.** User data never leaves the system unless the operator explicitly configures external delivery.
- **Extensibility without forking.** Plugin architecture, lifecycle hooks, and webhook emission allow deep customization of behavior.
- **Minimal operational burden.** A single binary, a Helm chart, and sensible defaults should get an operator from zero to production with minimal configuration.

These five principles — which the project calls the Yeoman Philosophy (Dependability, Security, Loyalty) — guided every decision documented below.

## Decisions

### 1. Core Architecture

#### Monorepo Structure

The system is organized as a monorepo with four packages:

| Package | Purpose |
|---------|---------|
| `core` | Agent engine, gateway, storage, security, AI client, all domain managers |
| `shared` | Zod configuration schemas and TypeScript types consumed by all packages |
| `mcp` | Model Context Protocol server exposing agent capabilities as tools |
| `dashboard` | React SPA for administration, monitoring, and interaction |

#### Cognitive Model: Soul, Spirit, Brain, Body, Heart

SecureYeoman models its agent identity using a layered cognitive hierarchy:

```
Soul --> Spirit --> Brain --> Body --> Heart
```

- **Soul** is the agent's editable personality: name, traits, voice, preferred language, and a composable set of learned skills. The Soul system assembles AI system prompts from personality configuration and active skills.
- **Spirit** encompasses the agent's archetypal identity and guiding principles.
- **Brain** is the knowledge and memory subsystem: vector semantic memory, episodic recall, knowledge base CRUD, and cognitive ranking (activation scoring, Hebbian learning, working memory, salience classification).
- **Body** is the physical vessel — the set of capabilities through which the agent acts (vision, limb movement, auditory, haptic, vocalization). Each capability is toggled per-personality and injected into the system prompt as enabled or disabled.
- **Heart** is extracted as a distinct subsystem within Body. It owns the vital-signs pulse: periodic self-checks (system health, memory status, log anomalies, self-reflection) with per-task scheduling and persistent execution logging.

This separation ensures that each layer can evolve independently. Heart logic does not interfere with Body capability expansion; Brain memory operations do not couple to Soul personality editing.

#### Heartbeat Scheduling and Execution

The HeartbeatManager runs a tick interval (default: 30 seconds) that evaluates which checks are due based on per-task intervals and last-run timestamps:

| Check | Default Interval |
|-------|-----------------|
| `system_health` | 5 minutes |
| `memory_status` | 10 minutes |
| `log_anomalies` | 5 minutes |
| `self_reflection` | 30 minutes |

Each check execution is timed and persisted to a `heartbeat_log` table with status (`ok`, `warning`, `error`), duration, and error detail. The dashboard surfaces health trends per check as expandable history panels with color-coded status badges. Log persistence failures are non-fatal — they are warned and never propagate to the heartbeat system itself.

A task management API allows runtime mutation of check intervals, enabled state, and configuration without restarting the agent.

#### Knowledge Base

The Brain's knowledge base supports full CRUD operations. Four base knowledge entries (self-identity, hierarchy, purpose, interaction) are protected as PRIMARY entries with additional delete safeguards. Content and confidence are editable from the dashboard. External brain sync status is surfaced in the personality editor.

#### Delegation and Orchestration

Three orchestration managers — SubAgentManager, SwarmManager, and WorkflowManager — initialize when any of the following conditions is true:

1. `delegation.enabled` is set in configuration
2. `allowSubAgents` is enabled in the security policy
3. `allowSwarms` is enabled in the security policy
4. `allowWorkflows` is enabled in the security policy

The security policy toggles serve as both bootstrap triggers and runtime gates. Enabling a toggle in the Security Settings UI ensures the underlying infrastructure starts on the next boot, and the AI cannot exercise capabilities that the policy blocks at runtime. A container restart is required after enabling orchestration features for the first time.

#### Naming Conventions

The codebase follows consistent conventions enforced by audit:

- Route registration functions use `opts` as the parameter name for injected dependencies, with a co-located `<Domain>RoutesOptions` interface.
- CRUD verbs follow `create / get / list / update / delete`. Membership mutations use `add / remove`.
- A single `toErrorMessage(err: unknown): string` utility in `utils/errors.ts` replaces all duplicate error extraction helpers.
- Void-operation endpoints return `{ success: true }`. Resource endpoints return `{ "<resource>": data }` or `{ "<resources>": data[], "total"?: number }`.
- No single-letter variable names in production code.

### 2. Security

#### Security Maxims

1. **Deny by Default** — All permissions are explicitly granted, never assumed.
2. **Defense in Depth** — Multiple security layers, no single point of failure.
3. **Least Privilege** — Minimum permissions required for each operation.
4. **Fail Secure** — On error, default to the most restrictive state.
5. **Audit Everything** — If it happened, there is a log entry.

#### Security Features

- **RBAC** with role inheritance, conditions, and user-role assignments
- **Authentication** via JWT and API keys with per-key rate limiting
- **Encryption at rest** for secrets and sensitive configuration
- **Sandboxed execution** for agent-initiated commands
- **Rate limiting** at both the global and per-API-key level
- **Input validation** via Zod schemas on all API boundaries
- **Secret management** via system keyring integration (macOS Keychain, Linux Secret Service) with automatic rotation and expiry tracking
- **Cryptographic audit chain** with immutable, signed log entries

#### Security Policy Flags

Powerful capabilities are gated behind opt-in security policy flags that default to `false`:

| Flag | Capability |
|------|-----------|
| `allowSubAgents` | Sub-agent delegation |
| `allowSwarms` | Agent swarm orchestration |
| `allowWorkflows` | Workflow engine |
| `allowProactive` | Proactive assistance triggers |
| `allowExtensions` | Lifecycle extension hooks |
| `allowExecution` | Sandboxed command execution |
| `allowA2A` | Agent-to-agent protocol |

Changes to these flags are persisted to the database and audited in the cryptographic audit chain.

### 3. Lifecycle Extension Hooks

A dual extension system enables deep customization without modifying core code.

**TypeScript Plugin Modules** provide full access to internal APIs via typed hook signatures. Extension files are dropped into directories with a three-tier discovery order: built-in, user (`~/.secureyeoman/extensions/`), workspace. Same-named files in later directories override earlier ones. Numeric prefixes control execution order.

**EventEmitter and Webhook Emission** provide lightweight integration. Every hook point emits a typed event. External systems subscribe via in-process listeners or outbound webhook POST calls with HMAC-SHA256 signatures.

The system defines hook handlers across six categories:

- **Agent lifecycle**: `agent_init`, `agent_shutdown`
- **Message loop**: `message_loop_start`, `message_loop_end`, `prompt_assembly_before/after`
- **LLM calls**: `before_llm_call`, `after_llm_call`, `stream_chunk`, `stream_end`
- **Tool execution**: `tool_execute_before`, `tool_execute_after`
- **Memory operations**: `memory_save_before/after`, `memory_recall_before`
- **Security events**: `auth_success`, `auth_failure`, `rate_limit_hit`
- **Delegation**: `delegation_before/after`, `sub_agent_sealed`
- **Integration messages**: `message_received`, `message_sent`, `platform_connected`

Hooks follow three execution semantics: **transform** (return modified context, chained in order), **observe** (void return, executed in parallel), and **veto** (return null to cancel the operation). Extensions are sandboxed with configurable `maxExecutionTime` (default: 5 seconds) and a `failOpen` flag that determines whether extension errors block the pipeline.

### 4. Proactive Assistance

The ProactiveManager provides a trigger-and-suggestion engine that gives the agent initiative. Five trigger types are supported:

| Type | Description |
|------|-------------|
| `schedule` | Cron-based or interval-based time triggers |
| `event` | React to internal events emitted by extension hooks |
| `pattern` | Fire when the Brain detects a recurring behavioral pattern |
| `webhook` | External HTTP POST activates a trigger |
| `llm` | An LLM prompt is evaluated on a schedule; fires only on affirmative response |

When a trigger fires, the ProactiveManager composes a suggestion via the active personality and LLM, writes it to a suggestion queue, and pushes it to the dashboard via WebSocket. If `autoSend` is enabled, the suggestion is immediately delivered via configured integration channels. Suggestions expire after a configurable TTL (default: 24 hours).

Pattern learning periodically queries recent memories and uses an LLM to identify recurring behaviors. Detected patterns are surfaced in the dashboard with confidence scores and can be converted to triggers.

All proactive behavior requires `allowProactive = true` in the security policy. When disabled, trigger scheduling is suspended and webhook endpoints return 403.

### 5. Real-Time Infrastructure

#### WebSocket Architecture

The gateway runs `@fastify/websocket` with channel-based RBAC subscriptions, broadcast, and ping/pong heartbeat (30-second interval, 60-second stale-client cleanup). The WebSocket client map is bounded by `gateway.maxWsClients` (default: 100) to prevent unbounded memory growth — when full, the client with the oldest `lastPong` timestamp is evicted.

#### Notification System

A three-layer notification architecture connects event sources to users:

1. **Persistence**: `NotificationStorage` writes alerts to PostgreSQL with type, title, body, level (info/warn/error/critical), source, and read status.
2. **Push**: `NotificationManager.notify()` persists the notification and broadcasts it immediately to WebSocket clients subscribed to the `notifications` channel.
3. **External delivery**: A two-tier dispatch model separates admin-configured heartbeat alerts from per-user preference fan-out.

Per-user notification preferences control which external platforms (Slack, Telegram, Discord, email) receive alerts, at what severity threshold, and during which quiet hours. Quiet-hours support overnight wrap-around. A retention cleanup job runs every 24 hours (configurable via `notifications.retentionDays`, default: 30).

#### MCP Content Negotiation

The MCP package implements the "Markdown for Agents" pattern:

- **Consumer side**: `safeFetch` sends `Accept: text/markdown` to negotiate native markdown responses from servers that support it, reducing token consumption by up to 80%. The `Content-Signal: ai-input=no` response header is respected by default (configurable via `MCP_RESPECT_CONTENT_SIGNAL`). Token count estimates are surfaced from `x-markdown-tokens` headers with a `Math.ceil(length/4)` fallback.
- **Producer side**: MCP resources at `yeoman://personalities/{id}/prompt` and `yeoman://skills/{id}` serve personality prompts and skill instructions as `text/markdown` with YAML front matter, enabling structured agent-to-agent discovery.

### 6. Deployment

#### Single Binary Distribution

The system compiles to a self-contained binary via `bun build --compile`, embedding the dashboard SPA and MCP server. Two tiers are produced:

| Tier | Targets | Database |
|------|---------|----------|
| Tier 1 | linux-x64, linux-arm64, darwin-arm64, windows-x64 | PostgreSQL required |
| Tier 2 (Lite) | linux-x64, linux-arm64, windows-x64 | SQLite only, no external dependencies |

The binary ships as an ~123 MB Docker image (based on `debian:bookworm-slim`) compared to ~600 MB for the Node.js-based image. The MCP server runs as a `secureyeoman mcp-server` subcommand within the same binary.

A storage backend abstraction (`resolveBackend(config)`) selects PostgreSQL when `DATABASE_URL` is set and SQLite otherwise (in `auto` mode), configurable via `storage.backend`.

JSON logging bypasses Pino's worker-thread transport layer to avoid dynamic module resolution failures in the compiled binary. The `SECUREYEOMAN_LOG_FORMAT` environment variable selects between `json` (production default), `pretty` (development), and `ecs` (Elastic Common Schema for Loki/Elasticsearch ingestion).

An `install.sh` script detects OS and architecture, downloads the correct binary, and sets it executable. GitHub Actions produce builds for all targets with SHA256 checksums on version tag pushes.

#### Kubernetes Deployment

A Helm chart packages the system as three independent deployments:

| Deployment | Purpose | Scaling |
|------------|---------|---------|
| `secureyeoman-core` | Gateway and agent engine (port 18789) | CPU-intensive, HPA-managed |
| `secureyeoman-mcp` | MCP server (port 3001) | Optional |
| `secureyeoman-dashboard` | Nginx serving the SPA with API proxy | Lightweight |

This separation enables independent scaling and deployment — the dashboard can be updated without restarting core.

PostgreSQL runs as a managed external service (RDS, Cloud SQL, Azure Database) rather than as a StatefulSet, avoiding the operational complexity of stateful workloads on Kubernetes. Database migrations run as a Helm pre-install/pre-upgrade Job hook (single pod, weight -5) with a PostgreSQL advisory lock (`pg_advisory_lock`) as a secondary safeguard against race conditions in multi-replica deployments.

Observability resources (ServiceMonitor, PrometheusRule, Grafana dashboard ConfigMap) are gated behind `.Values.monitoring.enabled` to avoid CRD errors on clusters without the Prometheus Operator. Pod annotations support legacy Prometheus scraping on clusters without the Operator.

#### Anti-Bot and Proxy Integration

A provider-agnostic ProxyManager supports rotating proxies for web scraping operations. Two provider types are supported: HTTP-proxy (Bright Data) and API-rewrite (ScrapingBee, ScraperAPI). CAPTCHA detection uses heuristic response analysis. Retry logic follows exponential backoff with jitter. SSRF validation always applies to the original target URL, not the proxy URL. The feature is gated behind `MCP_PROXY_ENABLED` (default: false) for zero impact when disabled.

### 7. Performance

Four targeted optimizations reduce startup time and memory footprint:

1. **Migration fast-path**: A single `SELECT` of the latest recorded migration replaces N per-file round-trips on an up-to-date system, saving 300-700 ms at boot.
2. **Lazy AI client initialization**: Usage history loading is deferred from the startup critical path to a background task, removing 300-500 ms from boot. The shared promise ensures concurrent first calls serialize on the same load.
3. **Bounded WebSocket client map**: `gateway.maxWsClients` (default: 100) prevents unbounded memory growth. The oldest client by `lastPong` is evicted when the cap is reached.
4. **PostgreSQL pool size**: Default reduced from 20 to 10 connections, saving ~50-80 MB of PostgreSQL memory for typical single-user installs. Configurable via `database.poolSize`.

### 8. Observability and Telemetry

#### OpenTelemetry

`@opentelemetry/api` is a regular dependency (lightweight, always present). The SDK and OTLP exporter are dynamically imported only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. `getTracer()` returns a no-op tracer when the SDK is not initialized — callers never branch on tracing availability. A Fastify plugin wraps each HTTP request in an active span and injects an `X-Trace-Id` response header.

W3C `traceparent` headers are propagated on agent-to-agent calls. Auth hooks enrich request logs with `userId` and `role` for correlation.

#### Prometheus

Both `/metrics` (standard) and `/prom/metrics` (legacy) endpoints are exposed, unauthenticated, for Kubernetes scrape configs and Prometheus Operator ServiceMonitors.

#### Alert Rules Engine

An alert rules engine evaluates metric thresholds on a 5-second cycle. Rules define a metric path (dot-notation into the metrics snapshot), operator, threshold, channel config, and cooldown period. External channels include Slack webhook, PagerDuty Events API v2, OpsGenie, and generic webhook — all fire-and-forget. A test endpoint bypasses cooldown for on-demand validation.

#### Log Formats

Three log formats are supported via the `LOG_FORMAT` environment variable:
- `pretty` — human-readable, for development
- `json` — structured JSON, production default
- `ecs` — Elastic Common Schema fields (`@timestamp`, `log.level`, `trace.id`, `service.name`) for Loki and Elasticsearch ingestion

### 9. Multi-Tenancy

Tenant isolation is implemented via `tenant_id TEXT NOT NULL DEFAULT 'default'` columns on user-data tables combined with PostgreSQL Row Level Security (RLS).

- **Pool-safe GUC pattern**: `SET LOCAL app.current_tenant = ?` is transaction-scoped, reverting automatically on commit or rollback. `withTenantContext(tenantId, fn)` wraps operations in a transaction with the appropriate GUC.
- **Admin bypass**: `bypassRls(fn)` uses `SET LOCAL row_security = off` for cross-tenant admin operations.
- **Default tenant**: A `'default'` tenant is inserted on migration. Existing single-tenant data retains `tenant_id = 'default'` with no disruption.
- **RLS policies**: Row-level security is enabled on all user-data tables with `USING (tenant_id = current_setting('app.current_tenant', true))`.

Single-tenant deployments are unaffected: the `app.current_tenant` GUC is only set inside `withTenantContext`; direct pool queries see all data.

### 10. Multi-Instance Federation

Instances running in different environments share knowledge, marketplace skills, and personality configurations through a federation layer.

#### Peer Authentication

Each peer pair establishes a shared secret. The accepting instance stores a SHA-256 hash for inbound Bearer validation and an AES-256-GCM encrypted copy for outbound calls. Neither form is plaintext; a database leak does not expose usable credentials. All peer URLs pass through an SSRF guard that rejects loopback, private RFC-1918, and link-local ranges.

#### Federated Surfaces

- **Knowledge search**: Peers proxy knowledge queries to each other's federation endpoints.
- **Marketplace**: Read-only browse and install from a peer's skill catalog.
- **Personality bundles**: AES-256-GCM encrypted `.syi` files for air-gapped transport. Integration access is downgraded to `suggest` on import.

Peer-incoming routes use a custom preHandler for Bearer token validation against the shared secret hash, bypassing the standard auth hook. A 60-second health cycle pings all peers and updates status and `last_seen` timestamps.

### 11. API Gateway Mode

The `/api/v1/gateway` endpoint serves as an authenticated chat proxy for external applications. API keys gain four additional properties:

- `personality_id` — binds the key to a specific personality
- `rate_limit_rpm` — requests per minute (sliding 60-second in-memory window)
- `rate_limit_tpd` — tokens per day (summed from usage records, resets at midnight UTC)
- `is_gateway_key` — marks the key as intended for gateway use

Usage is recorded per-request (tokens, latency, personality, status code) for analytics. Summary endpoints provide 24-hour aggregate statistics with p50/p95 percentiles and CSV export.

### 12. Backup and Disaster Recovery

A BackupManager orchestrates `pg_dump` and `pg_restore` with metadata tracking:

- **Backup**: `POST /api/v1/admin/backups` triggers a non-blocking `pg_dump` in custom format. Status, size, and file path are tracked in `admin.backups`.
- **Download**: `GET /api/v1/admin/backups/:id/download` streams the dump file.
- **Restore**: `POST /api/v1/admin/backups/:id/restore` requires explicit `{ confirm: "RESTORE" }` and blocks until completion.

All routes are admin-only. File storage is local to `dataDir/backups/`; operators are responsible for off-site replication.

### 13. Native Clients

#### Desktop: Tauri v2

The desktop shell uses Tauri v2 rather than Electron for its security model (Rust process isolation, explicit IPC allow-lists), minimal footprint (~5-15 MB binary, ~30-60 MB memory at idle), and use of OS-native WebView renderers. The shell loads the dashboard SPA directly from `packages/dashboard/dist`. The only enabled Tauri plugin is `tauri-plugin-shell` for opening external URLs. macOS, Windows, and Linux ship from the same codebase.

#### Mobile: Capacitor v6

The mobile shell uses Capacitor v6 rather than React Native for zero UI duplication — the existing dashboard SPA runs as-is inside a native WebView. Capacitor provides incremental native plugin access (push notifications, biometric auth, secure storage, haptics) without requiring a UI rewrite. Live-reload development works by pointing the WebView at the local Vite dev server.

## Consequences

### What these decisions enable

- **Zero-configuration single-user deployment**: Download the binary, point it at a PostgreSQL instance (or use SQLite Lite tier), and start. Sensible defaults mean no YAML editing is required for basic operation.
- **Enterprise-grade multi-tenant SaaS**: RLS-based tenant isolation, per-key rate limiting, API gateway mode, backup/restore, RBAC, and audit logging provide the primitives needed for hosted deployments.
- **Distributed deployment**: Federation allows knowledge sharing across air-gapped or geographically distributed instances without merging databases. The Helm chart supports production Kubernetes deployments with autoscaling, disruption budgets, and managed database connections.
- **Deep customization**: The lifecycle hook system, security policy flags, and extension directories allow operators and developers to modify agent behavior at every stage of the request lifecycle without forking the codebase.
- **Cross-platform native experience**: Desktop and mobile shells reuse the full dashboard SPA with native capabilities added incrementally, avoiding UI duplication.
- **Operational visibility**: OpenTelemetry tracing, Prometheus metrics, alert rules with external channel dispatch, three log formats, and persistent heartbeat execution logs provide comprehensive observability from development through production.

### Trade-offs accepted

- **Helm chart maintenance**: The chart must be kept in sync with application changes. Network policies may require tuning for specific cloud providers.
- **In-memory rate limiting**: API gateway RPM windows do not survive restarts or span multiple instances. This is acceptable for the initial release; distributed rate limiting (Redis-backed) is a future enhancement.
- **Dynamic OTel imports**: The OpenTelemetry SDK packages are dynamically imported and not bundled into the compiled binary. Operators who want tracing must ensure the packages are available at runtime.
- **Extension surface area**: The 24 hook points and their typed signatures become a compatibility contract. Extension bugs can affect core behavior, mitigated by `failOpen` and `maxExecutionTime` safeguards.
- **Proxy service costs**: Anti-bot proxy rotation requires external service subscriptions. CAPTCHA detection is heuristic-based and may miss novel patterns.
- **Shared secret rotation**: Federation peer secret rotation requires manual update on both instances. Automatic rotation is a future enhancement.
- **LLM token costs**: Proactive `llm`-type triggers and pattern learning incur token costs on a schedule. Operators must be aware of potential costs when enabling these features.
