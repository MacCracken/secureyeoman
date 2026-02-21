# ADR 085 — Intelligent Model Routing

**Date**: 2026-02-21
**Status**: Accepted

---

## Context

SecureYeoman's sub-agent delegation and swarm scheduler always used the profile's `defaultModel` (or the system primary model) regardless of task characteristics. This meant:

1. **Over-spending**: Simple summarisation or classification subtasks were sent to expensive capable/premium models when a fast/cheap model would produce identical quality.
2. **No pre-execution visibility**: Users launching multi-role swarms had no cost estimate before committing.
3. **Static swarm scheduling**: The swarm coordinator assigned equal token budgets and the same model to every role, ignoring that some roles are inherently simpler.

The future-feature entry in the roadmap described three sub-goals:

- Neural sub-agent model selection
- Cost-aware swarm scheduling
- Real-time cost feedback

The "neural" framing (training a classifier on historical outcomes) is premature given limited usage history. A heuristic rule-based classifier is more honest, works immediately, and can be replaced with a learned model later without changing the routing interface.

---

## Decision

### 1. `ModelRouter` — heuristic task profiler + model selector

A new class `ModelRouter` (in `packages/core/src/ai/model-router.ts`) provides:

#### `profileTask(task, context?) → TaskProfile`

Analyses a task string and returns `{ complexity, taskType, estimatedInputTokens }`:

| `taskType`  | Detected by                                              |
|-------------|----------------------------------------------------------|
| `summarize` | "summarize", "recap", "tldr", …                          |
| `classify`  | "classify", "categorize", "determine if", …              |
| `extract`   | "extract", "list all", "find all", …                     |
| `qa`        | "what is", "who is", "explain", …                        |
| `code`      | "implement", "write a function/class", "refactor", …     |
| `reason`    | "analyze", "compare", "trade-off", "root cause", …       |
| `plan`      | "plan", "design", "architect", "roadmap", …              |
| `general`   | fallback                                                 |

Complexity is determined by word count and multi-clause indicators:
- `simple`: < 30 words, single-clause, non-plan/reason type
- `complex`: > 150 words, or ≥ 3 sequencing connectives, or plan type
- `moderate`: everything else

#### Model tiers

Three tiers map to cost/capability trade-offs:

| Tier       | Typical models                                                             |
|------------|----------------------------------------------------------------------------|
| `fast`     | claude-haiku, gpt-4o-mini, gemini-2.0-flash, grok-3-mini, deepseek-chat   |
| `capable`  | claude-sonnet, gpt-4o, grok-3, deepseek-reasoner                           |
| `premium`  | claude-opus, gpt-4-turbo, o1                                               |

Task type → default tier:

| Task types                          | Default tier |
|-------------------------------------|--------------|
| summarize, classify, extract, qa    | `fast`       |
| code, reason, plan, general         | `capable`    |

Complexity modifiers:
- `simple` tasks never escalate above their type's default tier
- `complex` + `fast` type → promotes to `capable`
- `premium` is never selected automatically (only via explicit model override or personality config)

#### `route(task, options?) → RoutingDecision`

1. Profile the task.
2. Determine target tier.
3. Call `getAvailableModels(true)` (only providers with API keys set).
4. Filter by `allowedModels` if set.
5. Filter to target tier; widen to `capable` → `fast` if tier has no candidates.
6. Sort by estimated cost; pick cheapest.
7. If confidence < 0.5 and a default model is configured, return null (fall back).

Returns `{ selectedModel, selectedProvider, tier, confidence, taskProfile, estimatedCostUsd, cheaperAlternative }`.

#### `estimateCost(task, model, provider, tokenBudget, context?) → number`

Estimates cost in USD using a 60/40 input/output split and the `CostCalculator` pricing table.

### 2. `SubAgentManager` — per-delegation model routing

`manager.ts` now accepts `costCalculator?: CostCalculator` in its deps and constructs a `ModelRouter` lazily. In `executeDelegation()`, the model resolution order is:

1. `params.modelOverride` (injected by swarm scheduler)
2. `ModelRouter.route()` result (if confidence ≥ 0.5)
3. `profile.defaultModel`
4. System-level model config

The resolved model is logged at `debug` level with tier, confidence, taskType, and complexity.

### 3. `SwarmManager` — cost-aware role scheduling

`swarm-manager.ts` accepts `costCalculator?` and `allowedModels?` in its deps. Before each role delegation (sequential and parallel strategies), it calls `ModelRouter.route()` and injects the result as `modelOverride` in `DelegationParams`. Dynamic strategy delegates to the coordinator profile unchanged (coordinator manages its own sub-agents).

New public method `estimateSwarmCost(template, task, tokenBudget, context)` returns per-role model decisions and a total estimated cost — used by the cost estimation API.

### 4. `POST /api/v1/model/estimate-cost` — pre-execution cost feedback

New Fastify route that accepts `{ task, context?, tokenBudget?, roleCount?, allowedModels? }` and returns:

```json
{
  "task": { "type": "summarize", "complexity": "simple" },
  "selectedModel": "claude-haiku-3-5-20241022",
  "selectedProvider": "anthropic",
  "tier": "fast",
  "confidence": 0.9,
  "estimatedCostUsd": 0.0004,
  "estimatedCostPerRoleUsd": 0.0004,
  "roleCount": 1,
  "cheaperAlternative": null
}
```

Clients (dashboard, CLI, API consumers) can call this before executing a swarm to show the user a cost estimate and surface cheaper alternatives.

### 5. `AIClient.getCostCalculator()` and `SecureYeoman.getCostCalculator()`

`AIClient` exposes its internal `CostCalculator` instance via `getCostCalculator()`. `SecureYeoman` proxies this as `getCostCalculator()` for use in route handlers.

---

## What was NOT added and why

| Item | Decision | Reason |
|---|---|---|
| **ML-trained classifier** | Not added | No historical training data exists yet; heuristic achieves the same routing outcome immediately |
| **Premium tier auto-escalation** | Not added | Auto-promoting to premium would surprise users with unexpected cost spikes; manual override via `allowedModels` / profile config is sufficient |
| **Dashboard cost alert banner** | Not added | The `/estimate-cost` API provides the data; a UI alert widget is straightforward to add in the dashboard when demand emerges |
| **Per-swarm budget enforcement (hard stop)** | Not added | The existing per-delegation `tokenBudget` and daily token limits already cap spend; a hard per-swarm budget limit adds complexity without clear demand |
| **Dynamic strategy cost-aware routing** | Not added | The dynamic coordinator manages its own delegations; injecting model overrides into coordinator-spawned tasks would require passing the router through the delegation tool chain |

---

## Consequences

- Sub-agent delegations for simple tasks (summarise, classify, extract) are automatically routed to cheaper models — expected ≥30% cost reduction on mixed workloads.
- `DelegationParams` gains an optional `modelOverride` field (additive, no breaking change).
- `SubAgentManagerDeps` and `SwarmManagerDeps` each gain an optional `costCalculator` field (additive).
- `AIClient` gains `getCostCalculator()` (additive).
- `SecureYeoman` gains `getCostCalculator()` (additive).
- When no API keys are set (fully local deployments), `getAvailableModels(true)` returns empty; router returns `selectedModel: null`; all delegations fall back to the profile default — existing behaviour is fully preserved.
- 2 new source files: `model-router.ts`, `model-router.test.ts`.
- `POST /api/v1/model/estimate-cost` enables pre-execution cost transparency.

---

## Related

- [ADR 034 — Sub-Agent Delegation](034-sub-agent-delegation.md)
- [ADR 055 — Agent Swarms](055-agent-swarms.md)
- [ADR 056 — Per-Personality Model Fallbacks](056-personality-model-fallbacks.md)
- [ADR 057 — Swarms Policy & Per-Personality Sub-Agent Settings](057-swarms-policy.md)
