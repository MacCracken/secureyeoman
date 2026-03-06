# ADR 014: Agent Evaluation Harness (Phase 135)

## Status

Accepted

## Context

No competitor in the AI agent space offers a structured evaluation framework for agent behavior. As organizations move from prototyping to production, they need a way to verify that agents behave reliably, safely, and consistently across model changes, prompt updates, and skill modifications. Without structured evaluation, regressions go undetected until users encounter them.

The existing test suite (15,900+ tests) covers code correctness, but not agent behavior — the gap between "the code works" and "the agent does the right thing."

## Decisions

### Eval Scenario Schema

An `EvalScenario` defines a test case for agent behavior:

- **Input**: The prompt to send to the agent.
- **Conversation history**: Optional prior turns for multi-turn scenarios.
- **Expected tool calls**: Tool names (and optionally arguments) the agent should invoke. Can be ordered or unordered. Supports required vs optional expectations.
- **Forbidden tool calls**: Tool names that must NOT be invoked (safety assertions).
- **Output assertions**: Conditions on the agent's final output text — exact match, regex, semantic similarity (cosine via embeddings), contains, and not_contains.
- **Budget constraints**: Maximum token count and wall-clock time per scenario.
- **Configuration overrides**: Personality, skill set, and model can be overridden per scenario.

Scenarios are persisted in `eval.scenarios` with tenant isolation.

### Eval Suites

An `EvalSuite` groups scenarios into a named collection. Suites define:

- **Scenario ordering**: The list of scenario IDs to execute.
- **Concurrency**: How many scenarios to run in parallel (default: sequential).
- **Cost budget**: Maximum total USD spend for the suite run.

### Eval Engine

The `runScenario()` function is the core execution unit. It:

1. Sets up a timeout (AbortController) from `maxDurationMs`.
2. Calls the agent via `EvalAgentDeps.executePrompt()`, collecting tool calls via a callback.
3. Validates tool calls against expectations (ordered or unordered, with argument matching).
4. Checks for forbidden tool call violations.
5. Evaluates all output assertions.
6. Returns a `ScenarioRunResult` with pass/fail status, detailed assertion results, tool call records, token usage, cost, and timing.

The engine is pure logic with injected dependencies — it does not import the AI client directly, making it testable and decoupled.

### Eval Manager

The `EvalManager` orchestrates suite execution:

- Sequential or concurrent scenario execution (respecting `maxConcurrency`).
- Cost budget enforcement: once the cumulative cost exceeds the suite's `maxCostUsd`, remaining scenarios are marked `budget_exceeded` without execution.
- Run cancellation via `AbortController`.
- Result persistence via `EvalStore`.
- Retention-based cleanup of old run results.

### Storage

The `eval` schema (consolidated into `001_baseline.sql`) contains four tables:

- `eval.scenarios` — Scenario definitions (tenant-scoped).
- `eval.suites` — Suite definitions (tenant-scoped).
- `eval.suite_runs` — Aggregate suite run results.
- `eval.scenario_runs` — Per-scenario run results with full traces (tool calls, assertions, timing).

### REST API

12 endpoints under `/api/v1/eval/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/eval/scenarios` | List scenarios |
| GET | `/eval/scenarios/:id` | Get scenario |
| POST | `/eval/scenarios` | Create scenario |
| PUT | `/eval/scenarios/:id` | Update scenario |
| DELETE | `/eval/scenarios/:id` | Delete scenario |
| POST | `/eval/scenarios/:id/run` | Run single scenario |
| GET | `/eval/suites` | List suites |
| GET | `/eval/suites/:id` | Get suite |
| POST | `/eval/suites` | Create suite |
| DELETE | `/eval/suites/:id` | Delete suite |
| POST | `/eval/suites/:id/run` | Run suite |
| GET | `/eval/runs` | List run history |
| GET | `/eval/runs/:id` | Get run detail |

### MCP Tools

8 tools in the `eval` category, gated behind `exposeEval`:

- `eval_list_scenarios`, `eval_create_scenario`, `eval_run_scenario`
- `eval_list_suites`, `eval_create_suite`, `eval_run_suite`
- `eval_list_runs`, `eval_get_run`

### Configuration

`AgentEvalConfigSchema` added to the operations domain config:

- `enabled` (default false)
- `defaultTimeoutMs` (default 60s, max 5min)
- `maxConcurrency` (default 3, max 20)
- `defaultMaxCostUsd` (default null = unlimited)
- `storeTraces` (default true)
- `retentionDays` (default 90)

### Feature Gate

- Security policy: `allowAgentEval` (default false)
- MCP service config: `exposeEval` (default false)
- MCP personality features: `exposeEval` (default false)

### Dashboard

`AgentEvalWidget` component with:

- Suite selector dropdown with "Run Suite" button.
- Run history table (pass/fail badge, passed/failed/error counts, duration, tokens, cost, date).
- Drill-down into per-scenario results with assertion details, tool call errors, and forbidden violations.
- Canvas registry type: `'eval-results'`.

## Consequences

### Positive

- First-in-market structured agent evaluation framework — no competitor offers this.
- Enables regression testing for agent behavior across model changes, prompt updates, and skill modifications.
- Forbidden tool call assertions enable safety testing (e.g., "the agent must never call the delete tool when asked to read").
- Cost budget enforcement prevents runaway evaluation costs.
- Multi-turn conversation history support enables testing of complex interaction patterns.
- Full execution traces (tool calls, timing, tokens) enable debugging and compliance.
- Tenant-scoped storage enables per-team evaluation in multi-tenant deployments.

### Negative

- Eval scenarios require real LLM calls (by design — mocking would defeat the purpose). Cost scales with scenario count and model choice.
- Semantic assertions require an embedding provider to be configured.
- Non-deterministic LLM outputs may cause flaky eval results — users should design assertions with appropriate tolerance (regex/contains rather than exact match, reasonable semantic thresholds).
