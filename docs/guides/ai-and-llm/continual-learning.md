# Continual Learning Guide

This guide covers automated dataset refresh, drift detection and monitoring, and online model updates introduced in Phase 133.

## Overview

Continual learning keeps fine-tuned models current as user behavior evolves. The system has three components:

1. **Dataset Refresh** -- periodically harvests new training data from conversations
2. **Drift Detection** -- monitors model quality and alerts when performance degrades
3. **Online Updates** -- applies lightweight LoRA patches to correct drift

## Configuration

Add to your soul configuration:

```json
{
  "continualLearning": {
    "enabled": true,
    "refreshCron": "0 2 * * 0",
    "driftThreshold": 1.5,
    "replayRatio": 0.2,
    "minSamplesForUpdate": 200,
    "autoTrigger": false
  }
}
```

| Field               | Default         | Description                                           |
|---------------------|-----------------|-------------------------------------------------------|
| `enabled`           | `false`         | Enable the continual learning subsystem               |
| `refreshCron`       | `0 2 * * 0`    | Cron schedule for dataset refresh (default: Sunday 2AM)|
| `driftThreshold`    | `1.5`           | Standard deviations below baseline to trigger alert    |
| `replayRatio`       | `0.2`           | Fraction of original training data mixed into updates  |
| `minSamplesForUpdate`| `200`          | Minimum new samples before an update can run           |
| `autoTrigger`       | `false`         | Automatically start online update when drift detected  |

## Dataset Refresh

### How It Works

The `DatasetRefreshWorker` runs on the configured cron schedule:

1. Queries conversations created since the last refresh timestamp.
2. Applies curation rules: minimum quality score (default 0.5), token bounds, personality filter, tool-error exclusion.
3. Appends qualifying samples to the current versioned dataset in ShareGPT JSONL format.
4. Records the refresh run in `training.refresh_runs` with sample count and date range.

### Manual Refresh

Trigger a refresh outside the cron schedule:

```
POST /training/continual/refresh
{
  "personalityId": "default",
  "minQualityScore": 0.6,
  "maxSamples": 1000
}
```

### View Refresh History

```
GET /training/continual/refresh-runs?personalityId=default
```

Response:

```json
{
  "runs": [
    {
      "id": "run-001",
      "personalityId": "default",
      "samplesAdded": 347,
      "dateFrom": "2026-02-26T00:00:00Z",
      "dateTo": "2026-03-05T00:00:00Z",
      "datasetVersion": "v12",
      "createdAt": "2026-03-05T02:00:00Z"
    }
  ]
}
```

### Curation Tips

- Set `minQualityScore` to 0.6 or higher for alignment-critical models to exclude low-quality interactions.
- Use `personalityId` filters when running multiple personalities with different fine-tuned models.
- Review the `samplesAdded` trend over time; a declining count may indicate fewer qualifying conversations or over-restrictive filters.

## Drift Detection

### Baseline Establishment

After a training run completes, the drift detector automatically captures a baseline by computing mean and standard deviation of quality scores from conversations in a 30-day reference window following the training date.

### Monitoring

The detector runs a daily check (configurable) comparing the recent 7-day window against the baseline:

- **Primary signal**: Mean quality score drop exceeding `driftThreshold` standard deviations
- **Secondary signals**: Tool call success rate decline, average response latency increase

### Check Drift Status

```
GET /training/continual/drift?personalityId=default
```

Response:

```json
{
  "personalityId": "default",
  "baselineMean": 0.74,
  "baselineStdDev": 0.12,
  "recentMean": 0.61,
  "recentStdDev": 0.15,
  "driftDetected": true,
  "driftSeverity": 1.08,
  "toolSuccessRate": { "baseline": 0.89, "recent": 0.82 },
  "alerts": [
    {
      "type": "quality_drift",
      "message": "Quality score dropped 1.08 std devs below baseline",
      "createdAt": "2026-03-04T08:00:00Z"
    }
  ]
}
```

### Alert Integration

Drift alerts are emitted through the existing alert manager and appear in:

- Dashboard notifications
- CLI via `secureyeoman training drift-status`
- Webhook destinations (if configured)

## Online Updates

### Automatic Updates

When `autoTrigger` is `true` and drift is detected with at least `minSamplesForUpdate` new samples available, the system automatically initiates a LoRA update.

### Manual Update

```
POST /training/continual/update
{
  "personalityId": "default",
  "baseModel": "llama3.2:3b",
  "currentAdapter": "/adapters/my-sft-v3",
  "replayRatio": 0.2,
  "gradientAccumulationSteps": 8,
  "epochs": 1,
  "loraRank": 16
}
```

### How It Works

1. The new dataset (from recent refresh runs) is combined with a random sample from the original training data at the configured `replayRatio`.
2. A LoRA fine-tuning job is launched via the Docker sidecar with gradient accumulation to handle potentially small batch sizes.
3. If auto-eval is enabled (ADR 006), the new adapter is evaluated before deployment. If scores fall below thresholds, the update is blocked.
4. On success, the new adapter is registered with Ollama and deployed to the personality. The previous adapter is retained for rollback.

### Replay Buffer

The replay buffer prevents catastrophic forgetting by mixing old training data into each update:

- **0.1 (10%)**: Aggressive adaptation, higher forgetting risk. Use when the domain has shifted significantly.
- **0.2 (20%)**: Balanced default. Suitable for most deployments.
- **0.3+ (30%+)**: Conservative. Prioritizes stability over adaptation speed.

### CLI Usage

```bash
# Check drift status
secureyeoman training drift-status --personality default

# Trigger manual refresh
secureyeoman training refresh --personality default --min-quality 0.6

# Run online update
secureyeoman training online-update \
  --personality default \
  --base-model llama3.2:3b \
  --replay-ratio 0.2 \
  --epochs 1

# View refresh history
secureyeoman training refresh-runs --personality default
```

## Monitoring Recommendations

- Track the `training_drift_severity` Prometheus gauge to set up alerting in external monitoring systems.
- Review refresh run history weekly to ensure data collection is healthy.
- After each online update, compare eval scores against the previous adapter to confirm improvement.
- Keep `autoTrigger` disabled initially until you are confident in the drift detection thresholds for your workload.
