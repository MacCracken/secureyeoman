# Job Completion Notifications

Get notified when workflows, distillation jobs, evaluations, or fine-tune jobs complete or fail.

## How It Works

Job completions are bridged into the existing alert pipeline as synthetic metric snapshots. When a job finishes, SecureYeoman builds a snapshot with the `jobs.<type>.<status>.<field>` namespace and evaluates it against all enabled alert rules. This means you configure job notifications the same way you configure threshold-based alerts — through alert rules.

## Metric Paths

| Path | Triggered When |
|---|---|
| `jobs.workflow.completed.durationMs` | Workflow succeeds (duration in ms) |
| `jobs.workflow.failed.error` | Workflow fails (value = 1) |
| `jobs.distillation.completed.samplesGenerated` | Distillation succeeds (sample count) |
| `jobs.distillation.failed.error` | Distillation fails |
| `jobs.evaluation.completed.exactMatch` | Evaluation completes (0.0–1.0) |
| `jobs.evaluation.completed.sampleCount` | Evaluation completes (number of samples) |
| `jobs.finetune.completed.durationMs` | Fine-tune succeeds (duration in ms) |
| `jobs.finetune.failed.error` | Fine-tune fails |

## Creating Rules

### Dashboard

1. Navigate to **Developer** > **Alerts** tab
2. Click **From template** to use a pre-built template, or **New rule** for custom rules
3. Set the metric path, operator, and threshold
4. Add one or more notification channels (Slack, PagerDuty, OpsGenie, webhook, or ntfy)
5. Save the rule

### API

```bash
# Alert on any workflow failure
curl -X POST https://localhost:18789/api/v1/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Workflow failure",
    "metricPath": "jobs.workflow.failed.error",
    "operator": "gt",
    "threshold": 0,
    "cooldownSeconds": 60,
    "enabled": true,
    "channels": [{
      "type": "ntfy",
      "url": "https://ntfy.sh/my-secureyeoman-alerts"
    }]
  }'
```

## Available Templates

| Template | Path | Condition |
|---|---|---|
| Workflow takes >5 min | `jobs.workflow.completed.durationMs` | > 300000 |
| Workflow failure | `jobs.workflow.failed.error` | > 0 |
| Distillation failure | `jobs.distillation.failed.error` | > 0 |
| Distillation low throughput | `jobs.distillation.completed.samplesGenerated` | < 50 |
| Evaluation low accuracy | `jobs.evaluation.completed.exactMatch` | < 0.5 |
| Fine-tune failure | `jobs.finetune.failed.error` | > 0 |
| High rate-limit hits | `security.rateLimitHitsTotal` | > 100 |

## ntfy Channel

[ntfy](https://ntfy.sh) is a lightweight push notification service. You can use the public instance or self-host.

### Setup

1. Pick a topic name (e.g., `my-secureyeoman-alerts`)
2. Subscribe on your phone or desktop: `ntfy subscribe my-secureyeoman-alerts`
3. Add an ntfy channel to your alert rule with URL `https://ntfy.sh/my-secureyeoman-alerts`
4. Optionally set an auth token for private topics

### Channel Configuration

| Field | Description |
|---|---|
| URL | Full topic URL, e.g. `https://ntfy.sh/my-topic` or `https://my-ntfy.example.com/alerts` |
| Auth token | Optional Bearer token for authenticated topics |

Notifications include the alert title, high priority, and a warning tag. The message body contains the rule name, metric value, and threshold.

## Cooldown

Alert rules have a configurable cooldown period (default: 300s). After firing, the rule won't fire again until the cooldown expires. For job failure alerts, consider a shorter cooldown (60s) so you're notified of each failure.
