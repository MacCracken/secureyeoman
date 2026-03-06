# ADR 029 — LLM Pre-Training from Scratch

**Status**: Accepted
**Date**: 2026-03-06
**Changelog**: [2026.3.6]

## Context

SecureYeoman's training pipeline supports distillation, fine-tuning (LoRA/QLoRA), DPO, RLHF, and evaluation. The `TrainingMethod` type already includes `'pretrain'` but no dedicated manager exists. Users with domain-specific corpora (legal, medical, internal docs) want to pre-train small models from scratch rather than fine-tuning general-purpose models.

## Decision

Implement a pre-training subsystem scoped to small models (≤3B parameters):

1. **Corpus loader**: Validates and ingests text corpora in 5 formats (plaintext, JSONL, CSV, Parquet, Markdown). Token estimation, document counting, and source registry.
2. **PretrainManager**: Job lifecycle (create/monitor/cancel/delete). Model size enforcement (≤3B hard cap, configurable max). Concurrent job limiting. Docker-based training execution (same pattern as FinetuneManager). Progress tracking with loss/perplexity metrics.
3. **5 model architectures**: GPT-2, LLaMA, Mistral, Phi, Mamba — covering the primary small-model families.
4. **Configurable hyperparameters**: Learning rate schedule (cosine/linear/constant/cosine_with_restarts), warmup steps, weight decay, gradient accumulation, checkpoint intervals.

## Consequences

- The 3B parameter cap is enforced at job creation. Larger models require different infrastructure (multi-node, distributed training) which is out of scope.
- Corpus loader validates format and structure but does not deduplicate or filter content — that's the dataset curator's responsibility.
- Docker execution follows the same shell-out pattern as FinetuneManager; no dockerode dependency.
- License-gated under `adaptive_learning` (enterprise tier).

## Files

| File | Purpose |
|------|---------|
| `packages/shared/src/types/pretrain.ts` | Zod schemas and TS types |
| `packages/core/src/storage/migrations/007_pretrain_jobs.sql` | PostgreSQL table |
| `packages/core/src/training/corpus-loader.ts` | Corpus validation and registry |
| `packages/core/src/training/pretrain-manager.ts` | Job lifecycle orchestration |
| `packages/core/src/training/pretrain-routes.ts` | 9 REST API endpoints |
| `packages/core/src/training/*.test.ts` | 46 tests across 3 files |
