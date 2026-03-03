# LLM Provider Improvements Guide

Phase 119 adds provider health tracking, reasoning effort control, cost budgets, and context overflow strategies.

## Reasoning Effort (OpenAI o-series)

OpenAI's o1/o3 models support a `reasoning_effort` parameter that controls how much compute the model uses for chain-of-thought reasoning.

### Per-Personality Configuration

In the Personality Editor → Brain → Reasoning Effort:

1. **Enable** the reasoning effort toggle
2. **Select effort level**: Low, Medium, or High
   - **Low**: Faster, cheaper, suitable for simple tasks
   - **Medium** (default): Balanced reasoning depth
   - **High**: Maximum reasoning, best for complex analysis

Reasoning effort only applies when the personality uses an OpenAI reasoning model (o1, o1-mini, o3, o3-mini). For other providers, the setting is ignored.

### API

```json
POST /api/v1/model/estimate-cost
{
  "task": "analyze security report",
  "context": "quarterly review"
}
```

The estimate-cost endpoint factors in the personality's reasoning effort setting.

## Provider Health Tracking

Each provider's reliability is tracked via a rolling window of the last 100 requests.

### Health Statuses

| Status | Error Rate | Indicator |
|--------|-----------|-----------|
| Healthy | < 5% | Green |
| Degraded | 5–20% | Amber |
| Unhealthy | ≥ 20% | Red |

### Dashboard

The Model Widget shows a colored health dot next to each provider name. Hover for details (error rate, p95 latency).

### API

```
GET /api/v1/model/health
```

Returns per-provider health metrics:

```json
{
  "openai": {
    "errorRate": 0.02,
    "p95LatencyMs": 450,
    "status": "healthy",
    "consecutiveFailures": 0,
    "totalRequests": 100
  }
}
```

## Cost Budgets

Per-personality daily and monthly cost limits prevent runaway AI spending.

### Configuration

In the Personality Editor → Brain → Cost Budget:

- **Daily limit (USD)**: Maximum spend per UTC day
- **Monthly limit (USD)**: Maximum spend per UTC month

Leave blank for no limit.

### Behavior

- At **80%** of either limit: an alert is emitted via the Alert Manager
- At **100%**: requests are blocked with HTTP 429 ("Cost budget exceeded")
- Budget check uses a 30-second cache to minimize database load
- If the budget checker is unavailable, requests proceed (graceful degradation)

## Context Overflow Strategy

Controls what happens when a conversation exceeds the model's context window.

### Options

| Strategy | Behavior |
|----------|----------|
| **Summarise** (default) | Compact oldest messages using the existing context compactor |
| **Truncate** | Drop oldest non-system messages until under 80% of the context limit |
| **Error** | Reject the request (413 for REST, SSE error for streaming) |

Configure in the Personality Editor → Brain → Context Overflow.

## New Models

Phase 119 adds:

- **OpenAI o3**: 200K context window, $10/$40 per 1M tokens
- **Gemini 2.0 Flash Lite**: 1M context window, $0.075/$0.30 per 1M tokens

## Local Model Refresh

The model discovery cache TTL was reduced from 10 minutes to 60 seconds. After pulling or deleting an Ollama model, the updated model list appears within one minute.
