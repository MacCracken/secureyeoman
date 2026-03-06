# ADR 013: LLM Lifecycle Advanced

**Status**: Accepted
**Date**: 2026-03-05
**Phases**: 131, 132, 133

## Context

The existing training pipeline (ADR 006) supports SFT via LoRA/QLoRA, preference annotation for DPO, and evaluation with LLM-as-Judge. However, it does not execute DPO or RLHF training directly, lacks automated hyperparameter search, does not optimize inference for cost and latency at scale, and cannot detect or respond to model quality drift over time. Phases 131–133 extend the training and evaluation platform with alignment fine-tuning, inference optimization, and continual learning capabilities.

## Decisions

### Phase 131: Advanced Training Methods

#### Training Method Selector

The `FinetuneManager.createJob()` method field is extended from `'sft'` to a union: `'sft' | 'dpo' | 'rlhf' | 'reward' | 'pretrain'`. Each method maps to a different training script inside the Docker sidecar container. The REST API and CLI accept the method parameter; MCP tools expose it as a string enum.

#### DPO Training

DPO jobs use TRL's `DPOTrainer` inside the existing Docker sidecar. The manager writes a DPO config file referencing the preference dataset (JSONL with `chosen`/`rejected` pairs), beta parameter (default 0.1), and LoRA settings. The container loads the base model, applies LoRA adapters, and trains against the preference loss. Output adapters are registered with Ollama on success, identical to the SFT flow.

#### RLHF Training

RLHF jobs use TRL's `PPOTrainer` with a separately trained reward model. A two-stage workflow is expected: first train a reward model (`method: 'reward'`) on preference data, then run PPO (`method: 'rlhf'`) referencing the reward adapter path. The PPO config includes KL penalty coefficient, mini-batch size, and PPO epochs. The reward model runs as a second process inside the same container.

#### Hyperparameter Search

A new `HyperparameterSearchManager` accepts a search space definition (parameter ranges or discrete sets) and a strategy (`'grid' | 'random'`). It expands the space into candidate configurations and launches child finetune jobs for each. Results are tracked in the experiment registry with a `search_id` foreign key. On completion, the best run is selected by lowest eval loss or highest judge score.

#### Multi-GPU Support

The Docker launch command accepts a `gpus` field that maps to `--gpus device=0,1,...`. The training scripts detect multiple GPUs via `torch.cuda.device_count()` and use `accelerate` for data-parallel training. The finetune job record stores the GPU count for reproducibility.

#### Checkpoint Management

A `training.checkpoints` table stores step number, training loss, validation loss, adapter path, and timestamp per job. The training script writes checkpoints at a configurable interval (default every 500 steps). The API exposes endpoints to list checkpoints, resume from a checkpoint, and promote a checkpoint to a final adapter. Interrupted jobs can be resumed by passing the checkpoint path to the container.

### Phase 132: Inference Optimization

#### Batch Inference

A `BatchInferenceWorker` processes arrays of prompts with configurable concurrency via `p-limit`. Each batch job tracks progress (completed/total/failed counts) and streams results to a JSONL output file. The worker respects provider rate limits and implements exponential backoff on 429 responses. Jobs are created via REST API and CLI, with progress queryable by job ID. Results are stored in the existing job storage with `type: 'batch-inference'`.

#### Semantic Cache

A vector-backed response cache uses pgvector to store prompt embeddings alongside cached responses. On each inference request, the cache computes the prompt embedding and searches for existing entries above a cosine similarity threshold (default 0.92). Cache hits return the stored response with a `x-cache: hit` header. Cache entries have a configurable TTL (default 24 hours) and are scoped per personality to prevent cross-contamination. A background worker prunes expired entries hourly.

Configuration lives in `InferenceCacheConfigSchema` with fields: `enabled`, `similarityThreshold`, `ttlSeconds`, `maxEntries`.

#### KV Cache Warming

A `ModelWarmer` service pre-loads models into Ollama's KV cache by sending a minimal chat request (`num_predict: 1`) with `keep_alive` set to the desired duration. Warming is triggered on application startup for models listed in the active personality configurations and can be invoked manually via API. The warmer runs requests sequentially to avoid VRAM contention.

#### Speculative Decoding (Scaffold)

A `draftModel` field is added to `ModelConfig` to designate a smaller model for speculative decoding. Phase 132 does not implement the decoding logic; it only stores the configuration and validates that the draft model exists. Actual speculative decoding integration with Ollama or vLLM is deferred pending upstream support.

### Phase 133: Continual Learning

#### Dataset Refresh

A `DatasetRefreshWorker` runs on a configurable cron schedule (default weekly). It queries conversations created since the last refresh, applies the existing curation rules (token bounds, quality score threshold, tool-error exclusion), and appends qualifying samples to a versioned dataset. The worker records each refresh run with sample counts and date range in a `training.refresh_runs` table. Operators can configure minimum quality score, personality filter, and maximum samples per refresh.

#### Drift Detection

A `DriftDetector` establishes a baseline by computing the mean and standard deviation of quality scores from conversations in a reference window (default: the 30 days following the last training run). A periodic check (default daily) computes the same statistics over a sliding recent window (default 7 days). If the recent mean drops below the baseline mean minus a configurable threshold (default 1.5 standard deviations), a drift alert is emitted via the existing alert manager. The detector also tracks tool call success rate and average response latency as secondary drift signals.

Drift status is exposed via a REST endpoint and CLI command, returning current vs. baseline statistics and alert history.

#### Online Updates

When drift is detected or a dataset refresh produces sufficient new samples, an online update can be triggered automatically or manually. The update uses lightweight LoRA fine-tuning via the existing Docker sidecar with gradient accumulation (to handle small batch sizes) and a replay buffer that mixes new samples with a random subset of the original training data (default 20% replay ratio) to mitigate catastrophic forgetting.

The update produces a new adapter version. If auto-eval is enabled (ADR 006), the adapter is evaluated before deployment. The previous adapter is retained for rollback.

Configuration lives in `ContinualLearningConfigSchema` with fields: `enabled`, `refreshCron`, `driftThreshold`, `replayRatio`, `minSamplesForUpdate`, `autoTrigger`.

## Consequences

### Positive

- Alignment fine-tuning (DPO, RLHF) is available without leaving the platform.
- Automated hyperparameter search reduces manual experimentation and improves model quality.
- Checkpoint management enables resumable training and selection of optimal intermediate states.
- Multi-GPU support unlocks training of larger models that do not fit in single-GPU VRAM.
- Batch inference provides throughput-optimized processing for evaluation and bulk workloads.
- Semantic cache eliminates redundant LLM calls for similar queries, reducing cost and latency.
- KV cache warming removes cold-start latency for frequently used models.
- Automated dataset refresh ensures training data stays current without manual intervention.
- Drift detection provides early warning before model quality visibly degrades to users.
- Online LoRA updates are lightweight compared to full retraining, requiring minutes rather than hours.
- Replay buffer mitigates catastrophic forgetting, preserving performance on established tasks.

### Negative

- RLHF requires training a reward model first, adding complexity and compute cost.
- Hyperparameter search multiplies GPU hours by the number of candidates; operators must budget accordingly.
- Semantic cache requires embedding computation on every request, adding a few milliseconds of overhead even on cache misses.
- Cache similarity threshold tuning is domain-dependent; too low returns stale answers, too high misses valid matches.
- KV warming consumes VRAM for the duration of the keep_alive window, reducing capacity for other models.
- Automated retraining requires available GPU resources; updates fail silently if the Docker sidecar cannot start.
- Drift detection depends on quality score accuracy; if the scorer is miscalibrated, alerts may be noisy or absent.
- Checkpoint storage can be significant for large models (hundreds of MB per checkpoint).
