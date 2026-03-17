# ADR 042 — GPU-Aware Inference Routing

**Status**: Accepted
**Date**: 2026-03-17
**Context**: NVIDIA NemoClaw (GTC 2026) introduced compute-aware routing as a competitive feature. SecureYeoman needs equivalent capability to maintain parity in the privacy-first AI agent space.

## Decision

Implement a three-layer GPU-aware inference routing system:

1. **GPU Capability Probe** (`gpu-probe.ts`) — Hardware detection via `nvidia-smi`, `rocm-smi`, and sysfs/lspci. Returns structured GPU metadata with 30-second TTL cache.

2. **Local Model Registry** (`local-model-registry.ts`) — Runtime discovery of locally available models from Ollama, LM Studio, and LocalAI. Infers capabilities, VRAM requirements, and model families from naming heuristics. 60-second TTL cache.

3. **Privacy Router** (`privacy-router.ts`) — Decision engine that integrates DLP content classification with GPU availability and local model inventory. Four routing policies:
   - `auto` — Use local when capable; fall back to cloud
   - `local-preferred` — Prefer local; use cloud only when local can't handle it
   - `local-only` — Never send to cloud (may fail if no local GPU)
   - `cloud-only` — Always use cloud providers

### Privacy Enforcement

When DLP classifies content as `confidential` or `restricted`, or when PII is detected, the router forces local routing. If no local GPU/model is available, the request proceeds to cloud with a low confidence score (0.4), allowing the caller to warn the user about privacy implications.

### API Surface

- `GET /api/v1/system/gpu` — GPU probe results
- `GET /api/v1/system/local-models` — Local model inventory
- `POST /api/v1/ai/privacy-route` — Routing decision for content

### MCP Tools

- `gpu_status` — Query available GPU devices
- `local_models_list` — List locally available models with capability filtering
- `privacy_route_check` — Evaluate content for local vs cloud routing

### Chat Flow Integration

`AIClient.chat()` calls `evaluatePrivacyRouting()` before the primary provider attempt. When the privacy router returns `target: 'local'` with a recommended model, `AIClient` creates a temporary local provider and routes the request directly. On local failure, the normal fallback chain takes over.

### Per-Personality Policy

The `PersonalitySchema` includes a `routingPolicy` field (`auto | local-preferred | local-only | cloud-only`). This is injected into `AIClientDeps` at personality load time, allowing each personality to independently control routing behavior.

### WebSocket Telemetry

A 30-second GPU telemetry broadcast on the `gpu` WebSocket channel sends GPU probe results and local model summary to subscribed dashboard clients.

### Dashboard

`GpuStatusPanel` component shows GPU devices with VRAM bars, local models with capability badges, and a routing policy selector. Dashboard API client provides typed wrappers for the 3 endpoints.

### Integration Points

- **DLP Classification Engine** — Reuses existing `ClassificationEngine` for content sensitivity tagging
- **Model Router** — Privacy Router operates upstream of the existing `ModelRouter`; when it returns `target: 'local'`, the `ModelRouter` is bypassed and the recommended local model is used directly
- **AGNOS Edge** (optional) — Edge devices can expose GPU capabilities via MCP bridge; SY aggregates fleet GPU status for distributed inference routing. GPU routing works standalone without AGNOS

## Consequences

- **Positive**: SecureYeoman can route sensitive content exclusively to local models, matching NemoClaw's privacy router without requiring NVIDIA hardware or OpenClaw dependency
- **Positive**: Zero-cost inference for users with local GPUs (Ollama + NVIDIA/AMD)
- **Positive**: Automatic model discovery reduces configuration burden
- **Negative**: VRAM estimation is heuristic-based; actual requirements may vary by quantization level
- **Negative**: GPU probe adds ~50ms latency on first call (cached thereafter)
- **Mitigated**: All probes are async with timeouts; failures degrade gracefully to cloud routing

## Alternatives Considered

1. **NemoClaw integration** — Rejected. NemoClaw requires OpenClaw as base; introduces dependency on NVIDIA ecosystem. SY's approach is provider-agnostic.
2. **Static configuration only** — Rejected. Users shouldn't need to manually configure GPU capabilities; auto-detection is more reliable.
3. **Always-local for privacy** — Rejected. Not all users have GPUs; forcing local-only would break the system for cloud-only deployments.
