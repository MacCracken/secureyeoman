# ADR 034: Synapse Bridge Integration

**Status**: Accepted
**Date**: 2026-03-10

## Context

SecureYeoman's training subsystem (FinetuneManager, DistillationManager, PretrainManager) currently executes all model training and inference workloads locally via Docker containers. This limits scalability to a single node's GPU resources and couples the orchestrator to the compute backend. Operators with dedicated GPU infrastructure have no way to offload workloads to purpose-built model management systems.

Synapse is a Rust-based LLM controller that provides model management, inference serving, and distributed training capabilities. Integrating Synapse as an optional compute backend allows SecureYeoman to delegate resource-intensive workloads while retaining full orchestration control.

## Decision

### 1. Architecture: Orchestrator + Compute Backend

SecureYeoman acts as the orchestrator; Synapse acts as the compute backend. SY owns the workflow lifecycle (job creation, scheduling, progress tracking, result storage) while Synapse owns the compute lifecycle (model loading, GPU allocation, training execution, inference serving).

### 2. Communication Protocol

- **REST API** (port 8420): Synchronous command-response for model management, job submission, status queries, and health checks.
- **gRPC** (port 8421): Reserved for future bidirectional streaming (real-time training metrics, inference streaming). Not implemented in the initial integration.

### 3. Discovery & Connection

Synapse endpoint is resolved in priority order:

1. `SYNAPSE_API_URL` environment variable
2. `synapse.apiUrl` in SecureYeoman config
3. Well-known default: `http://localhost:8420`

### 4. Health & Degraded Mode

- **Heartbeat**: SY pings Synapse `/health` every 10 seconds.
- **Capability announcements**: On first successful heartbeat, Synapse reports its available models, GPU count, and supported training backends. SY caches this for routing decisions.
- **Degraded mode**: When Synapse is unreachable, SY falls back to local Docker execution for training jobs. Inference requests that require Synapse-hosted models return 503 with a descriptive error. The dashboard shows Synapse status as degraded.

### 5. Training Delegation

FinetuneManager, DistillationManager, and PretrainManager gain a `backend` option (`'local' | 'synapse'`). When set to `'synapse'`:

1. SY serializes the job spec (dataset reference, hyperparameters, base model) and POSTs to Synapse `/v1/jobs`.
2. Synapse returns a job ID. SY stores the mapping in `synapse.delegated_jobs`.
3. SY polls Synapse `/v1/jobs/:id` for progress updates, writing them to the existing training job tables.
4. On completion, Synapse reports the artifact location. SY registers the resulting model in its model registry.

### 6. Database Schema

A new `synapse` schema with three tables:

| Table | Purpose |
|-------|---------|
| `synapse.instances` | Registered Synapse endpoints with health state, capabilities, last heartbeat |
| `synapse.delegated_jobs` | Mapping between SY training job IDs and Synapse job IDs, with status sync |
| `synapse.registered_models` | Models available on Synapse instances, synced from capability announcements |

### 7. MCP Tools

Five tools registered in the MCP manifest:

| Tool | Description |
|------|-------------|
| `synapse_status` | Check Synapse connectivity and capabilities |
| `synapse_list_models` | List models available on connected Synapse instances |
| `synapse_pull_model` | Pull a model to a Synapse instance |
| `synapse_infer` | Run inference on a Synapse-hosted model |
| `synapse_submit_job` | Submit a training job to Synapse |

### 8. Licensing

Synapse integration is gated as an enterprise feature (`synapse` in `FEATURE_TIER_MAP`). Community and pro tiers cannot enable the integration even if a Synapse instance is reachable.

### 9. Docker Compose

Synapse is added to both the `dev` and `full-dev` compose profiles, using the `ghcr.io/maccracken/synapse:latest` image with GPU passthrough configuration.

## Consequences

### Positive
- **Scalable compute**: Training and inference workloads can be offloaded to dedicated GPU infrastructure without modifying SY's workflow logic.
- **Graceful degradation**: Local Docker fallback ensures SY remains functional when Synapse is unavailable.
- **Clean separation**: SY never directly manages GPU resources; Synapse handles all compute scheduling.
- **Observable**: All delegated jobs are tracked in SY's database with full audit trail.

### Negative
- **Network dependency**: Delegated jobs depend on Synapse availability during execution. Network partitions mid-training require Synapse-side checkpointing to avoid data loss.
- **Additional infrastructure**: Operators must deploy and maintain a Synapse instance to use this feature.
- **Schema growth**: Three new tables in a dedicated schema add migration complexity.

### Neutral
- Existing local training workflows are unchanged. The `backend` option defaults to `'local'`.
- Synapse's gRPC streaming port is reserved but not consumed, avoiding premature protocol coupling.

## References

- Synapse project: Rust-based LLM controller for model management, inference, and training
- ADR 029: LLM Pre-Training from Scratch (local training pipeline that Synapse can now augment)
- ADR 027: Federated Learning (complementary distributed training approach)
- `packages/core/src/licensing/license-manager.ts` — enterprise feature gating
