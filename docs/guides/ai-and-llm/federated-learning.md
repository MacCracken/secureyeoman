# Federated Learning Guide

Federated learning enables multiple SecureYeoman instances to collaboratively improve models without sharing raw data. Each participant trains locally and submits model updates (gradients), which are aggregated by a coordinator with differential privacy protections.

## Configuration

Add to your config under `ops.federatedLearning`:

```yaml
ops:
  federatedLearning:
    enabled: true
    maxConcurrentSessions: 3
    maxParticipantsPerSession: 50
    roundTimeoutMs: 300000      # 5 minutes
    heartbeatIntervalMs: 30000  # 30 seconds
    retainRounds: 500
    defaultPrivacy:
      enabled: true
      mechanism: gaussian        # gaussian | laplacian | local_dp
      epsilon: 1.0
      delta: 0.00001
      maxGradientNorm: 1.0
      privacyBudgetTotal: 10.0
```

## Workflow

### 1. Register Participants

Each instance registers as a participant:

```bash
curl -X POST /api/v1/federated/participants \
  -d '{"peerId": "instance-a", "name": "Region US-East", "datasetSize": 5000}'
```

### 2. Create a Training Session

```bash
curl -X POST /api/v1/federated/sessions \
  -d '{
    "name": "Q1 Model Improvement",
    "modelId": "intent-classifier-v3",
    "participantIds": ["fp-abc", "fp-def", "fp-ghi"],
    "minParticipants": 2,
    "maxRounds": 50,
    "aggregationStrategy": "fedavg",
    "privacy": { "enabled": true, "epsilon": 1.0, "delta": 1e-5 }
  }'
```

### 3. Run Training Rounds

Start a round (distributes current global model to participants):

```bash
curl -X POST /api/v1/federated/sessions/{sessionId}/rounds
```

Each participant trains locally and submits updates:

```bash
curl -X POST /api/v1/federated/rounds/{roundId}/updates \
  -d '{
    "participantId": "fp-abc",
    "gradientChecksum": "sha256:...",
    "datasetSizeSeen": 1200,
    "trainingLoss": 0.34,
    "validationLoss": 0.41,
    "metricsJson": {"accuracy": 0.89, "f1": 0.85},
    "privacyNoiseApplied": true
  }'
```

When all participants submit, aggregation runs automatically.

### 4. Monitor Progress

```bash
# List rounds for a session
curl /api/v1/federated/sessions/{sessionId}/rounds

# Get round details with aggregated metrics
curl /api/v1/federated/rounds/{roundId}

# View individual updates
curl /api/v1/federated/rounds/{roundId}/updates
```

## Aggregation Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `fedavg` | Weighted average by dataset size | Default, balanced participants |
| `fedprox` | FedAvg + proximal term (local training) | Heterogeneous data distributions |
| `fedsgd` | Equal-weight gradient average | Uniform participant importance |
| `weighted_avg` | Equal-weight value average | Simple baseline |
| `median` | Coordinate-wise median | Byzantine-robust (malicious participants) |
| `trimmed_mean` | Discard top/bottom 10%, then average | Outlier-resistant |

## Differential Privacy

Three noise mechanisms protect participant data:

- **Gaussian**: Adds calibrated Gaussian noise (most common, uses analytic mechanism for sigma computation)
- **Laplacian**: Adds Laplace-distributed noise (pure ε-DP)
- **Local DP**: Randomised response — each gradient value has probability `p = e^ε / (e^ε + 1)` of being truthful

Privacy budget is tracked per session. Each round consumes `epsilon` from the total budget. When exhausted, no further rounds can start.

## Session Lifecycle

Sessions support pause/resume/cancel:

```bash
curl -X POST /api/v1/federated/sessions/{id}/pause
curl -X POST /api/v1/federated/sessions/{id}/resume
curl -X POST /api/v1/federated/sessions/{id}/cancel
```

## Participant Health

Participants send periodic heartbeats. If a participant misses 3 consecutive heartbeat intervals, it is marked `disconnected`. Heartbeats auto-set status to `active`.

```bash
curl -X POST /api/v1/federated/participants/{id}/heartbeat
```

## License

Federated learning requires an **enterprise** license (`adaptive_learning` feature).
