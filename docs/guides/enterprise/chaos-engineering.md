# Chaos Engineering Toolkit

Test your workflow resilience by injecting controlled failures into system components.

## Overview

The Chaos Engineering Toolkit lets you define experiments that inject faults (latency, errors, timeouts, dependency failures, etc.) into specific system targets and observe how the system responds. Each experiment validates a steady-state hypothesis and produces recovery metrics.

## Configuration

Enable chaos engineering in your config:

```yaml
security:
  chaos:
    enabled: true
    maxConcurrentExperiments: 3
    maxExperimentDurationMs: 600000   # 10 minutes
    retainResults: 200
    safeMode: true          # limits fault injection to non-production targets and caps experiment duration
    allowedTargetTypes:
      - workflow_step
      - ai_provider
      - integration
      - circuit_breaker
```

## Fault Types

| Type | Description | Key Config |
|------|-------------|------------|
| `latency` | Adds artificial delay | `minMs`, `maxMs`, `distribution` (uniform/normal/exponential) |
| `error` | Returns an error response | `errorCode`, `errorMessage` |
| `timeout` | Simulates a timeout | `timeoutMs` |
| `resource_exhaustion` | Simulates resource pressure | `resource`, `pressure` (0-1), `durationMs` |
| `dependency_failure` | Simulates a dependency going down | `dependencyName`, `failureMode` (unavailable/partial/intermittent) |
| `data_corruption` | Simulates corrupted data | `corruptionType` (truncate/scramble/empty/invalid_encoding) |
| `circuit_breaker_trip` | Forces a circuit breaker open | `breakerName`, `holdOpenMs` |
| `rate_limit` | Applies artificial rate limiting | `maxRequestsPerSec` |

## Target Types

| Target | Description |
|--------|-------------|
| `workflow_step` | A specific step in a workflow |
| `ai_provider` | An AI model provider (OpenAI, Anthropic, etc.) |
| `integration` | An external integration (GitHub, Slack, etc.) |
| `brain_storage` | Brain/memory storage layer |
| `external_api` | Any external API dependency |
| `circuit_breaker` | A named circuit breaker |
| `message_router` | The message routing layer |

## Creating an Experiment

```bash
curl -X POST http://localhost:3000/api/v1/chaos/experiments \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "AI Provider Latency Test",
    "description": "Validate workflow handles slow AI responses",
    "steadyStateHypothesis": "Workflow completes within 30s even with 5s AI latency",
    "rollbackOnFailure": true,
    "durationMs": 60000,
    "rules": [
      {
        "id": "ai-latency",
        "name": "Inject 2-5s AI latency",
        "targetType": "ai_provider",
        "targetId": "openai-primary",
        "fault": {
          "type": "latency",
          "minMs": 2000,
          "maxMs": 5000,
          "distribution": "normal"
        },
        "probability": 0.8,
        "enabled": true
      }
    ]
  }'
```

## Running an Experiment

```bash
# Run immediately
curl -X POST http://localhost:3000/api/v1/chaos/experiments/{id}/run

# Schedule for later
curl -X POST http://localhost:3000/api/v1/chaos/experiments/{id}/schedule \
  -H 'Content-Type: application/json' \
  -d '{"scheduledAt": 1741305600000}'

# Abort a running experiment
curl -X POST http://localhost:3000/api/v1/chaos/experiments/{id}/abort
```

## Viewing Results

```bash
# Get experiment results
curl http://localhost:3000/api/v1/chaos/experiments/{id}/results

# Check system status
curl http://localhost:3000/api/v1/chaos/status
```

### Result Metrics

Each experiment result includes aggregate metrics:

- `totalFaultsInjected` — Number of faults that fired
- `faultsRecovered` — Number of faults the system recovered from
- `meanRecoveryTimeMs` — Average time to recover from a fault
- `circuitBreakersTripped` — Number of circuit breakers that opened

## Safety Controls

- **Disabled by default** — Set `chaos.enabled: true` to activate
- **Max concurrent experiments** — Prevents overloading the system
- **Max duration** — Experiments cannot run longer than the configured limit
- **Allowed target types** — Restrict which system components can be targeted
- **Rollback on failure** — Automatically stops experiment if a fault causes unrecoverable errors
- **Abort capability** — Any running experiment can be immediately aborted
- **License gated** — Requires `compliance_governance` license feature

## Example: Multi-Fault Resilience Test

```json
{
  "name": "Full Resilience Test",
  "description": "Test system behaviour under multiple simultaneous failures",
  "steadyStateHypothesis": "System degrades gracefully, no data loss",
  "rollbackOnFailure": true,
  "durationMs": 120000,
  "rules": [
    {
      "id": "ai-timeout",
      "name": "AI provider timeout",
      "targetType": "ai_provider",
      "targetId": "openai-primary",
      "fault": { "type": "timeout", "timeoutMs": 10000 },
      "probability": 0.5,
      "enabled": true
    },
    {
      "id": "redis-down",
      "name": "Cache dependency failure",
      "targetType": "integration",
      "targetId": "redis-cache",
      "fault": {
        "type": "dependency_failure",
        "dependencyName": "redis",
        "failureMode": "intermittent",
        "recoveryAfterMs": 5000
      },
      "probability": 0.3,
      "enabled": true
    },
    {
      "id": "circuit-trip",
      "name": "Trip the AI circuit breaker",
      "targetType": "circuit_breaker",
      "targetId": "ai-provider-breaker",
      "fault": {
        "type": "circuit_breaker_trip",
        "breakerName": "ai-provider",
        "holdOpenMs": 15000
      },
      "probability": 1.0,
      "enabled": true
    }
  ]
}
```
