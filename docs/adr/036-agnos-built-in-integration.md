# ADR 036: AGNOS Built-in Integration

**Status**: Accepted
**Date**: 2026-03-10

## Context

SecureYeoman was promoted from a consumer project to a flagship built-in tool on the AGNOS agent runtime platform. An AGNOS-side recipe was created to register SecureYeoman as a first-class agent. The SY-side integration needed to be implemented to support agent registration, event pub/sub, audit forwarding, vector store bridging, and service discovery against the AGNOS runtime API (port 8090).

Previously, SY consumed AGNOS via MCP tools (`agnos_*`) gated behind `exposeAgnosTools`. This ADR covers the deeper lifecycle integration that makes SY a native AGNOS citizen rather than just an API consumer.

## Decision

### 1. HTTP Client

`AgnosClient` wraps the AGNOS runtime API at port 8090. It provides typed methods for service discovery (`GET /v1/discover`), agent registration and deregistration, heartbeat, MCP tool registration, audit event forwarding, event pub/sub, vector store operations, and sandbox profile retrieval. All methods use the existing `CircuitBreaker` for resilience.

### 2. Lifecycle Manager

`AgnosLifecycleManager` handles the full agent lifecycle on AGNOS:

- **Startup**: Batch-registers all SY agents (orchestrator, training, analytics, security, etc.) with AGNOS.
- **Heartbeat**: Sends a heartbeat every 30 seconds via an `unref()`'d interval so it does not prevent process exit.
- **Shutdown**: Best-effort deregistration of all registered agents. Failures are logged but do not block shutdown.

### 3. Extension Hooks

`registerAgnosHooks()` wires SY's internal event system to AGNOS:

- **Audit forwarding**: Buffers audit events and flushes to AGNOS in batches of 50 or every 5 seconds, whichever comes first.
- **Event publishing**: Publishes SY domain events (swarm lifecycle, task completion, agent state changes, errors) to AGNOS's event bus.
- **Event subscription**: Opens an SSE connection to AGNOS's `/events` stream and pipes received events into SY's extension system for downstream processing.

### 4. Bootstrap

`bootstrapAgnos()` is the single entry point called during SY startup:

1. Runs service discovery via `GET /v1/discover` to learn AGNOS capabilities.
2. Loads sandbox profiles from the AGNOS runtime.
3. Registers SY's MCP tools with AGNOS's tool registry.
4. Auto-sets `MCP_EXPOSE_AGNOS_TOOLS=true` when AGNOS is reachable.

The entire bootstrap is non-fatal. Partial failures return a result object indicating which steps succeeded. SY starts normally regardless of AGNOS availability.

### 5. Vector Store Bridge

`AgnosVectorStore` implements SY's `VectorStore` interface, delegating all embedding storage and similarity search operations to the AGNOS runtime's vector store API. The `'agnos'` backend is added to the vector store backend enum, allowing it to be selected via configuration alongside existing backends (pgvector, in-memory).

### 6. App Icon

An SVG icon was created at `assets/secureyeoman.svg` for use in the AGNOS marketplace listing and agent registry UI.

## Consequences

### Positive

- **Cross-agent observability**: SY's audit trail and domain events are visible to all AGNOS agents and the AGNOS dashboard.
- **Shared RAG**: The vector store bridge allows SY to participate in AGNOS's shared knowledge graph without duplicating embeddings.
- **Marketplace presence**: SY appears as a first-class tool in the AGNOS marketplace, discoverable by other agents.
- **Zero-config discovery**: When AGNOS is running, SY auto-discovers capabilities and registers itself without manual configuration.

### Negative

- **Runtime coupling**: While non-fatal, the integration adds a dependency on AGNOS availability for full functionality. Degraded mode loses audit forwarding and event pub/sub.
- **Event volume**: High-throughput SY deployments may generate significant event traffic to AGNOS. The batch/flush mechanism mitigates this but operators should monitor.

### Neutral

- All existing `agnos_*` MCP tools continue to work unchanged. The lifecycle integration is additive.
- The `AgnosClient` reuses SY's existing HTTP and circuit breaker infrastructure. No new networking dependencies.

## References

- AGNOS runtime API: port 8090, LLM gateway port 8088
- `packages/mcp/src/tools/agnos-tools.ts` — existing MCP tool integration (20 tools)
- `packages/core/src/resilience/circuit-breaker.ts` — CircuitBreaker used by AgnosClient
- ADR 034: Synapse Bridge Integration (similar pattern for external service integration)
