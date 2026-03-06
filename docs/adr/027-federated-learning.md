# ADR 027 — Federated Learning

**Status**: Accepted
**Date**: 2026-03-06
**Changelog**: [2026.3.6]

## Context

SecureYeoman instances deployed across multiple organisations collect training signals (conversation outcomes, skill usage, personality feedback) that could improve shared models. However, raw data cannot leave an instance due to compliance and privacy requirements. Federated learning enables collaborative model improvement by exchanging model updates (gradients) rather than raw data, with differential privacy mechanisms to further protect individual contributions.

## Decision

Implement a federated learning subsystem with:

1. **Session-based orchestration** — A coordinator manages training sessions that group participants into multi-round training cycles. Sessions enforce concurrency limits, minimum participant thresholds, and maximum round counts.

2. **Differential privacy** — Three noise mechanisms (Gaussian, Laplacian, local DP/randomised response) with configurable epsilon/delta budgets. L2 gradient clipping limits per-update sensitivity. Budget tracking prevents over-exposure across rounds.

3. **Pluggable aggregation** — Six strategies (FedAvg, FedProx, FedSGD, weighted average, coordinate-wise median, trimmed mean) handle different trust and robustness requirements. Median and trimmed mean provide Byzantine resilience.

4. **Participant management** — Heartbeat-based liveness detection marks stale participants as disconnected. Participants register with dataset size metadata for weighted aggregation.

5. **Auto-aggregation** — When all expected updates arrive for a round, aggregation triggers automatically, reducing coordinator overhead.

## Consequences

- Privacy budget is finite; once exhausted, no further rounds can start until the session is reset or a new session is created.
- The FedProx proximal term is applied during local training (client-side), not at aggregation. The aggregation path is identical to FedAvg.
- Model updates currently carry checksums and metadata but not raw gradient tensors — actual gradient exchange requires a binary transport layer (future work).
- License-gated under `adaptive_learning` (enterprise tier).

## Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/federated-learning.ts` | Zod schemas and TS types |
| `packages/core/src/storage/migrations/006_federated_learning.sql` | PostgreSQL schema |
| `packages/core/src/training/federated/privacy-engine.ts` | DP mechanisms and budget tracking |
| `packages/core/src/training/federated/aggregator.ts` | 6 aggregation strategies |
| `packages/core/src/training/federated/federated-store.ts` | PostgreSQL persistence |
| `packages/core/src/training/federated/federated-manager.ts` | Session/round orchestration |
| `packages/core/src/training/federated/federated-routes.ts` | 16 REST API endpoints |
| `packages/core/src/training/federated/*.test.ts` | 74 tests across 5 files |
