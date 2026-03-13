# ADR 034: Ecosystem Service Integrations (Synapse, AGNOS, Delta, Shruti)

**Status**: Accepted
**Date**: 2026-03-10 (consolidated 2026-03-13)

## Context

SecureYeoman integrates with several ecosystem services that extend its capabilities beyond a single node. Each service follows a consistent integration pattern:

- **HTTP client** wrapping the service's REST API, using SY's `CircuitBreaker` for resilience
- **Service discovery** via environment variables, config, or well-known defaults
- **MCP tools** gated behind per-service feature flags
- **Enterprise licensing** where applicable
- **Graceful degradation** — SY remains functional when any ecosystem service is unreachable

This ADR consolidates the integration decisions for all four ecosystem services: Synapse (compute backend), AGNOS (agent runtime), Delta (code forge), and Shruti (digital audio workstation).

---

## 1. Synapse — LLM Compute Backend

**Implementation status**: Fully implemented (2026-03-10)

### Architecture

SecureYeoman acts as the orchestrator; Synapse acts as the compute backend. SY owns the workflow lifecycle (job creation, scheduling, progress tracking, result storage) while Synapse owns the compute lifecycle (model loading, GPU allocation, training execution, inference serving).

### Communication Protocol

- **REST API** (port 8420): Synchronous command-response for model management, job submission, status queries, and health checks.
- **gRPC** (port 8421): Reserved for future bidirectional streaming (real-time training metrics, inference streaming). Not implemented in the initial integration.

### Discovery & Connection

Synapse endpoint is resolved in priority order:

1. `SYNAPSE_API_URL` environment variable
2. `synapse.apiUrl` in SecureYeoman config
3. Well-known default: `http://localhost:8420`

### Health & Degraded Mode

- **Heartbeat**: SY pings Synapse `/health` every 10 seconds.
- **Capability announcements**: On first successful heartbeat, Synapse reports its available models, GPU count, and supported training backends. SY caches this for routing decisions.
- **Degraded mode**: When Synapse is unreachable, SY falls back to local Docker execution for training jobs. Inference requests that require Synapse-hosted models return 503 with a descriptive error. The dashboard shows Synapse status as degraded.

### Training Delegation

FinetuneManager, DistillationManager, and PretrainManager gain a `backend` option (`'local' | 'synapse'`). When set to `'synapse'`:

1. SY serializes the job spec (dataset reference, hyperparameters, base model) and POSTs to Synapse `/v1/jobs`.
2. Synapse returns a job ID. SY stores the mapping in `synapse.delegated_jobs`.
3. SY polls Synapse `/v1/jobs/:id` for progress updates, writing them to the existing training job tables.
4. On completion, Synapse reports the artifact location. SY registers the resulting model in its model registry.

### Database Schema

A new `synapse` schema with three tables:

| Table | Purpose |
|-------|---------|
| `synapse.instances` | Registered Synapse endpoints with health state, capabilities, last heartbeat |
| `synapse.delegated_jobs` | Mapping between SY training job IDs and Synapse job IDs, with status sync |
| `synapse.registered_models` | Models available on Synapse instances, synced from capability announcements |

### MCP Tools (5 tools)

Gated by enterprise licensing (`synapse` in `FEATURE_TIER_MAP`):

| Tool | Description |
|------|-------------|
| `synapse_status` | Check Synapse connectivity and capabilities |
| `synapse_list_models` | List models available on connected Synapse instances |
| `synapse_pull_model` | Pull a model to a Synapse instance |
| `synapse_infer` | Run inference on a Synapse-hosted model |
| `synapse_submit_job` | Submit a training job to Synapse |

### Licensing

Synapse integration is gated as an enterprise feature (`synapse` in `FEATURE_TIER_MAP`). Community and pro tiers cannot enable the integration even if a Synapse instance is reachable.

### Docker Compose

Synapse is added to both the `dev` and `full-dev` compose profiles, using the `ghcr.io/maccracken/synapse:latest` image with GPU passthrough configuration.

---

## 2. AGNOS — Agent Runtime Platform

**Implementation status**: Fully implemented (2026-03-10)

### Context

SecureYeoman was promoted from a consumer project to a flagship built-in tool on the AGNOS agent runtime platform (port 8090, LLM gateway port 8088). Previously, SY consumed AGNOS via MCP tools (`agnos_*`, 20 tools) gated behind `exposeAgnosTools`. This section covers the deeper lifecycle integration that makes SY a native AGNOS citizen.

### HTTP Client

`AgnosClient` wraps the AGNOS runtime API at port 8090. It provides typed methods for service discovery (`GET /v1/discover`), agent registration and deregistration, heartbeat, MCP tool registration, audit event forwarding, event pub/sub, vector store operations, and sandbox profile retrieval. All methods use the existing `CircuitBreaker` for resilience.

### Lifecycle Manager

`AgnosLifecycleManager` handles the full agent lifecycle on AGNOS:

- **Startup**: Batch-registers all SY agents (orchestrator, training, analytics, security, etc.) with AGNOS.
- **Heartbeat**: Sends a heartbeat every 30 seconds via an `unref()`'d interval so it does not prevent process exit.
- **Shutdown**: Best-effort deregistration of all registered agents. Failures are logged but do not block shutdown.

### Extension Hooks

`registerAgnosHooks()` wires SY's internal event system to AGNOS:

- **Audit forwarding**: Buffers audit events and flushes to AGNOS in batches of 50 or every 5 seconds, whichever comes first.
- **Event publishing**: Publishes SY domain events (swarm lifecycle, task completion, agent state changes, errors) to AGNOS's event bus.
- **Event subscription**: Opens an SSE connection to AGNOS's `/events` stream and pipes received events into SY's extension system for downstream processing.

### Bootstrap

`bootstrapAgnos()` is the single entry point called during SY startup:

1. Runs service discovery via `GET /v1/discover` to learn AGNOS capabilities.
2. Loads sandbox profiles from the AGNOS runtime.
3. Registers SY's MCP tools with AGNOS's tool registry.
4. Auto-sets `MCP_EXPOSE_AGNOS_TOOLS=true` when AGNOS is reachable.

The entire bootstrap is non-fatal. Partial failures return a result object indicating which steps succeeded. SY starts normally regardless of AGNOS availability.

### Vector Store Bridge

`AgnosVectorStore` implements SY's `VectorStore` interface, delegating all embedding storage and similarity search operations to the AGNOS runtime's vector store API. The `'agnos'` backend is added to the vector store backend enum, allowing it to be selected via configuration alongside existing backends (pgvector, in-memory).

### App Icon

An SVG icon was created at `assets/secureyeoman.svg` for use in the AGNOS marketplace listing and agent registry UI.

---

## 3. Delta — Code Forge

**Implementation status**: Fully implemented (2026-03-10); Docker Compose service and dashboard panel are planned follow-ups

### Context

Delta is a Rust-based self-hosted code forge for the AGNOS ecosystem, providing git hosting, pull requests, CI/CD pipelines, and artifact management. It serves as the fifth CI/CD webhook provider alongside GitHub, GitLab, Bitbucket, and Jenkins.

### CI/CD Webhook Provider

Delta is added as the fifth provider in `cicd-webhook-routes.ts`. Incoming webhooks are normalized to SY's internal event schema:

| Delta Event | SY Normalized Event |
|-------------|-------------------|
| `push` | `push` |
| `tag_create` | `tag_create` |
| `tag_delete` | `tag_delete` |
| `pull_request` | `pull_request` |

Webhook signature verification uses HMAC-SHA256 with the secret configured per-repository. The signature is read from the `X-Delta-Signature` header and the event type from `X-Delta-Event`.

### HTTP Client

`DeltaClient` provides 11 typed methods against the Delta REST API (default port 3000):

| Method | Endpoint |
|--------|----------|
| `listRepos` | `GET /api/v1/repos` |
| `getRepo` | `GET /api/v1/repos/:owner/:name` |
| `createRepo` | `POST /api/v1/repos` |
| `listPullRequests` | `GET /api/v1/repos/:owner/:name/pulls` |
| `getPullRequest` | `GET /api/v1/repos/:owner/:name/pulls/:number` |
| `createPullRequest` | `POST /api/v1/repos/:owner/:name/pulls` |
| `mergePullRequest` | `POST /api/v1/repos/:owner/:name/pulls/:number/merge` |
| `listPipelines` | `GET /api/v1/repos/:owner/:name/pipelines` |
| `triggerPipeline` | `POST /api/v1/repos/:owner/:name/pipelines` |
| `createStatus` | `POST /api/v1/repos/:owner/:name/statuses/:sha` |
| `health` | `GET /health` |

Authentication uses a bearer token from `DELTA_API_TOKEN`. The client uses SY's `CircuitBreaker` for resilience.

### MCP Tools (10 tools)

Gated behind `exposeDeltaTools` / `MCP_EXPOSE_DELTA_TOOLS`:

| Tool | Description |
|------|-------------|
| `delta_list_repos` | List repositories on a Delta instance |
| `delta_get_repo` | Get repository details |
| `delta_create_repo` | Create a new repository |
| `delta_list_prs` | List pull requests for a repository |
| `delta_get_pr` | Get pull request details |
| `delta_create_pr` | Create a pull request |
| `delta_merge_pr` | Merge a pull request |
| `delta_list_pipelines` | List CI/CD pipelines for a repository |
| `delta_trigger_pipeline` | Trigger a CI/CD pipeline run |
| `delta_create_status` | Create a commit status check |

### Configuration

| Variable | Purpose |
|----------|---------|
| `DELTA_URL` | Delta instance base URL (default: `http://localhost:3000`) |
| `DELTA_API_TOKEN` | Bearer token for API authentication |
| `MCP_EXPOSE_DELTA_TOOLS` | Enable Delta MCP tools (`true`/`false`) |

`MCP_SECRET_MAPPINGS` entries are added so that `DELTA_API_TOKEN` can be resolved from SY's secrets manager. Webhook secret: `DELTA_WEBHOOK_SECRET`.

---

## 4. Shruti — Digital Audio Workstation

**Implementation status**: Proposed (2026-03-12); SY-side client designed against proposed API, but Shruti HTTP server does not yet exist

### Context

Shruti is a Rust-native Digital Audio Workstation at MVP v1 maturity (2026.3.11-0) with:

- Real-time audio engine (cpal, lock-free graph, cross-platform)
- 6 DSP effects, 3 virtual instruments (subtractive synth, drum machine, sampler)
- Multi-track session management with SQLite persistence and full undo/redo
- Plugin hosting (VST3, CLAP, native Rust)
- GPU-accelerated UI (egui/eframe)
- **Agent API** (`shruti-ai` crate): 35+ structured JSON methods, 6 MCP tool definitions, voice intent parser
- 723 tests, 0 clippy warnings, 0 audit vulnerabilities

Shruti's AgentApi is currently in-process only (no HTTP server). SecureYeoman cannot call it without a network transport layer.

### Shruti HTTP API Wrapper (Shruti-side)

Shruti needs a lightweight HTTP server exposing its AgentApi over the network. This lives in the Shruti repo (not SY).

**Proposed**: `shruti serve --port 8050` subcommand that wraps `AgentApi` in an Actix-web or Axum server:

| Endpoint | Maps To |
|----------|---------|
| `GET /health` | Version, uptime, active session info |
| `POST /api/v1/session/{action}` | create, open, save, info |
| `POST /api/v1/tracks/{action}` | add, list, gain, pan, mute, solo, add_region |
| `POST /api/v1/transport/{action}` | play, stop, pause, seek, set_tempo |
| `POST /api/v1/export` | WAV/FLAC export with format options |
| `POST /api/v1/analysis/{type}` | spectrum, dynamics, auto_mix, composition |
| `POST /api/v1/mixer/{action}` | gain, pan, mute, solo, add_effect |
| `POST /api/v1/undo` | Undo last edit |
| `POST /api/v1/redo` | Redo last undo |
| `POST /api/v1/mcp/tool-call` | Direct MCP tool dispatch |

Auth: Bearer token (API key), validated locally or delegated to parent SY.

### SY Ecosystem Service Registration

Shruti is the 8th ecosystem service in `service-discovery.ts`:

```typescript
{
  id: 'shruti',
  displayName: 'Shruti DAW',
  description: 'Rust-native digital audio workstation with AI-assisted music production',
  urlEnv: 'SHRUTI_URL',
  defaultUrl: 'http://127.0.0.1:8050',
  healthPath: '/health',
  requiredSecrets: ['SHRUTI_API_KEY'],
  mcpConfigKey: 'exposeShrutiTools',
}
```

### SY Integration Client

`integrations/shruti/shruti-client.ts` — HTTP client wrapping Shruti's REST API:

| Method | Description |
|--------|-------------|
| `createSession(name, sampleRate, channels)` | Create a new audio session |
| `openSession(path)` | Open existing session |
| `saveSession()` | Persist session to disk |
| `sessionInfo()` | Current session metadata |
| `addTrack(name, type)` | Add audio/MIDI/bus/instrument track |
| `listTracks()` | List all tracks with state |
| `setTrackGain(trackIndex, gainDb)` | Set track volume |
| `setTrackPan(trackIndex, pan)` | Set stereo position |
| `muteTrack(trackIndex)` / `soloTrack(trackIndex)` | Mute/solo |
| `addRegion(trackIndex, filePath, position)` | Place audio on timeline |
| `transport(action)` | Play/stop/pause |
| `seek(position)` | Seek to frame/bar |
| `setTempo(bpm)` | Set session tempo |
| `exportAudio(path, format, bitDepth)` | Bounce session to file |
| `analyzeSpectrum(trackIndex, fftSize)` | FFT analysis |
| `analyzeDynamics(trackIndex)` | Peak/RMS/LUFS |
| `autoMixSuggest()` | AI mixing suggestions |
| `compositionSuggest()` | AI composition suggestions |
| `undo()` / `redo()` | Edit history navigation |

### MCP Tools (10 tools)

Gated by `exposeShrutiTools` / `MCP_EXPOSE_SHRUTI_TOOLS`:

| Tool | Description |
|------|-------------|
| `shruti_session_create` | Create a new audio session with name, sample rate, channels |
| `shruti_session_open` | Open an existing session by path |
| `shruti_track_add` | Add a track (audio, MIDI, bus, instrument) |
| `shruti_track_list` | List all tracks with gain, pan, mute, solo state |
| `shruti_region_add` | Place an audio file on a track at a timeline position |
| `shruti_transport` | Control playback (play, stop, pause, seek, set tempo) |
| `shruti_export` | Export/bounce session to WAV or FLAC |
| `shruti_analyze` | Run spectral or dynamics analysis on a track |
| `shruti_mix` | Set track gain, pan, mute, solo, or get auto-mix suggestions |
| `shruti_edit` | Undo, redo, split region, trim, fade, move |

### Capabilities Shruti Brings to SY Agents

| Capability | What It Enables |
|------------|-----------------|
| **Audio recording** | Agents can record audio input, create sessions, manage takes |
| **Multi-track editing** | Non-destructive timeline editing, region manipulation, undo/redo |
| **Mixing & mastering** | Gain staging, panning, effects (EQ, compression, reverb, delay, limiting) |
| **Spectral analysis** | FFT-based frequency analysis, peak detection, spectral centroid |
| **Dynamics analysis** | Peak, RMS, true peak, crest factor, LUFS (EBU R128), dynamic range |
| **AI-assisted mixing** | Auto-mix suggestions (gain staging, pan spread, EQ recommendations) |
| **AI-assisted composition** | Structure, instrumentation, and tempo suggestions |
| **Virtual instruments** | Polyphonic synth (23 params), drum machine (16 pads, step sequencer), sampler |
| **Plugin hosting** | Load VST3/CLAP plugins for additional effects and instruments |
| **Voice control** | Natural language commands (play, stop, mute track 2, set tempo 120) |
| **Export** | Bounce to WAV/FLAC at 16/24/32-bit, 44.1-192 kHz |

### Voice Integration with SY Voice Platform

Shruti's voice intent parser and SY's voice platform (Phase 146) can be bridged:

- SY's STT providers (faster-whisper, etc.) transcribe user speech
- Transcription forwarded to Shruti's `parse_voice_input()` for DAW-specific intents
- Results executed via AgentApi
- SY's TTS providers speak back confirmation ("Track 2 muted", "Tempo set to 120 BPM")

### Docker Compose

```yaml
shruti:
  image: ghcr.io/maccracken/shruti:latest
  profiles: [shruti, full-dev]
  ports:
    - "8050:8050"
  environment:
    SHRUTI_API_KEY: ${SHRUTI_API_KEY:-}
    SHRUTI_DATA_DIR: /data
  volumes:
    - shruti-data:/data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8050/health"]
    interval: 30s
    timeout: 5s
    retries: 3
```

---

## Consequences

### Positive

- **Scalable compute** (Synapse): Training and inference workloads can be offloaded to dedicated GPU infrastructure without modifying SY's workflow logic.
- **Graceful degradation** (all): Local fallback or non-fatal startup ensures SY remains functional when any ecosystem service is unavailable.
- **Cross-agent observability** (AGNOS): SY's audit trail and domain events are visible to all AGNOS agents and the AGNOS dashboard.
- **Shared RAG** (AGNOS): The vector store bridge allows SY to participate in AGNOS's shared knowledge graph without duplicating embeddings.
- **Marketplace presence** (AGNOS): SY appears as a first-class tool in the AGNOS marketplace, discoverable by other agents.
- **Zero-config discovery** (AGNOS): When AGNOS is running, SY auto-discovers capabilities and registers itself without manual configuration.
- **Self-hosted CI/CD** (Delta): Teams running Delta get full webhook ingestion and event normalization without leaving the AGNOS ecosystem.
- **AI-driven code management** (Delta): MCP tools allow agents to create repos, manage PRs, and trigger pipelines programmatically.
- **Consistent webhook model** (Delta): Delta events normalize to the same schema as GitHub/GitLab/Bitbucket, so downstream consumers work without modification.
- **Music production capabilities** (Shruti): Agents gain full audio recording, editing, mixing, analysis, and AI-assisted composition — a unique differentiator.

### Negative

- **Network dependency** (Synapse): Delegated jobs depend on Synapse availability during execution. Network partitions mid-training require Synapse-side checkpointing to avoid data loss.
- **Additional infrastructure** (all): Operators must deploy and maintain each ecosystem service to use its features.
- **Schema growth** (Synapse): Three new tables in a dedicated schema add migration complexity.
- **Runtime coupling** (AGNOS): While non-fatal, the integration adds a dependency on AGNOS availability for full functionality. Degraded mode loses audit forwarding and event pub/sub.
- **Event volume** (AGNOS): High-throughput SY deployments may generate significant event traffic to AGNOS. The batch/flush mechanism mitigates this but operators should monitor.
- **Webhook surface area** (Delta): Each new provider adds surface area to the webhook normalization layer. Signature verification and event mapping must be maintained per-provider.
- **No streaming** (Delta): Delta's pipeline logs are fetched via polling. Real-time log streaming is deferred to a future integration.
- **External dependency** (Shruti): Shruti's HTTP server does not yet exist; the SY integration client is designed against a proposed API.

### Neutral

- Existing local training workflows are unchanged. The Synapse `backend` option defaults to `'local'`.
- Synapse's gRPC streaming port is reserved but not consumed, avoiding premature protocol coupling.
- All existing `agnos_*` MCP tools continue to work unchanged. The lifecycle integration is additive.
- The `AgnosClient` reuses SY's existing HTTP and circuit breaker infrastructure. No new networking dependencies.
- Existing CI/CD webhook consumers are unaffected. Delta is additive.
- The Docker-compose service definition and dashboard panel for Delta are planned as follow-up items.
- Shruti's `exposeShrutiTools` config field defaults to false; Docker compose profile `shruti` is opt-in.

## Alternatives Considered

### Shruti Integration Approach

1. **Embed Shruti as a Rust library via FFI/NAPI** — Rejected: adds native compilation complexity, breaks bun bundling, Shruti is designed as a standalone app.
2. **Use only Shruti's MCP tools without ecosystem integration** — Rejected: loses service discovery, health monitoring, secrets management, dashboard visibility.
3. **Wait for Shruti to build its own HTTP server first** — Partially adopted: the SY integration client is designed against the proposed API, but actual integration requires the Shruti HTTP server to exist.

## Implementation Status Summary

| Service | Status | Port | MCP Tools | License Gate |
|---------|--------|------|-----------|--------------|
| Synapse | Fully implemented | 8420 (REST), 8421 (gRPC reserved) | 5 `synapse_*` | Enterprise |
| AGNOS | Fully implemented | 8090 (runtime), 8088 (LLM gateway) | 20 `agnos_*` (pre-existing) | None |
| Delta | Fully implemented (Docker/dashboard pending) | 3000 (default) | 10 `delta_*` | None |
| Shruti | Proposed (awaiting Shruti HTTP server) | 8050 | 10 `shruti_*` (planned) | None |

## References

- Synapse project: Rust-based LLM controller for model management, inference, and training
- AGNOS runtime API: port 8090, LLM gateway port 8088
- Delta project: Rust-based self-hosted code forge for the AGNOS ecosystem
- Shruti project: Rust-native DAW with AI agent API (`shruti-ai` crate)
- `packages/core/src/integrations/delta/delta-client.ts` — Delta HTTP client
- `packages/core/src/integrations/agnos/` — AGNOS lifecycle, bootstrap, hooks
- `packages/core/src/licensing/license-manager.ts` — enterprise feature gating
- `packages/core/src/resilience/circuit-breaker.ts` — CircuitBreaker used by all ecosystem clients
- `packages/core/src/gateway/cicd-webhook-routes.ts` — webhook ingestion for all providers
- `packages/mcp/src/tools/manifest.ts` — MCP tool registration
- `packages/mcp/src/tools/agnos-tools.ts` — AGNOS MCP tools (20 tools)
- ADR 029: LLM Pre-Training from Scratch (local training pipeline that Synapse can augment)
- ADR 027: Federated Learning (complementary distributed training approach)
