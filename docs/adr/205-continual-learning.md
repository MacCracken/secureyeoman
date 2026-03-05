# ADR 205: Continual Learning (Phase 133)

## Status

Accepted

## Context

Fine-tuned models degrade over time as user patterns, terminology, and task distributions shift. Manual retraining is error-prone and infrequent. Operators need automated mechanisms to detect quality drift, refresh training datasets from recent conversations, and apply lightweight model updates without full retraining cycles.

## Decisions

### Dataset Refresh

A `DatasetRefreshWorker` runs on a configurable cron schedule (default weekly). It queries conversations created since the last refresh, applies the existing curation rules (token bounds, quality score threshold, tool-error exclusion), and appends qualifying samples to a versioned dataset. The worker records each refresh run with sample counts and date range in a `training.refresh_runs` table. Operators can configure minimum quality score, personality filter, and maximum samples per refresh.

### Drift Detection

A `DriftDetector` establishes a baseline by computing the mean and standard deviation of quality scores from conversations in a reference window (default: the 30 days following the last training run). A periodic check (default daily) computes the same statistics over a sliding recent window (default 7 days). If the recent mean drops below the baseline mean minus a configurable threshold (default 1.5 standard deviations), a drift alert is emitted via the existing alert manager. The detector also tracks tool call success rate and average response latency as secondary drift signals.

Drift status is exposed via a REST endpoint and CLI command, returning current vs. baseline statistics and alert history.

### Online Updates

When drift is detected or a dataset refresh produces sufficient new samples, an online update can be triggered automatically or manually. The update uses lightweight LoRA fine-tuning via the existing Docker sidecar with gradient accumulation (to handle small batch sizes) and a replay buffer that mixes new samples with a random subset of the original training data (default 20% replay ratio) to mitigate catastrophic forgetting.

The update produces a new adapter version. If auto-eval is enabled (ADR 006), the adapter is evaluated before deployment. The previous adapter is retained for rollback.

Configuration lives in `ContinualLearningConfigSchema` with fields: `enabled`, `refreshCron`, `driftThreshold`, `replayRatio`, `minSamplesForUpdate`, `autoTrigger`.

## Consequences

### Positive

- Automated dataset refresh ensures training data stays current without manual intervention.
- Drift detection provides early warning before model quality visibly degrades to users.
- Online LoRA updates are lightweight compared to full retraining, requiring minutes rather than hours.
- Replay buffer mitigates catastrophic forgetting, preserving performance on established tasks.

### Negative

- Automated retraining requires available GPU resources; updates fail silently if the Docker sidecar cannot start.
- Drift detection depends on quality score accuracy; if the scorer is miscalibrated, alerts may be noisy or absent.
- The replay ratio must be tuned per deployment; too high wastes capacity on old data, too low risks forgetting.
- Cron-scheduled refresh adds background database load proportional to conversation volume.
