# Workflows

Workflows let you wire together agent tasks, swarms, webhooks, transforms, and ML pipeline operations into repeatable, DAG-based automation pipelines. A workflow is a directed acyclic graph (DAG) of **steps** connected by **edges**, with optional conditional branches and retry policies.

---

## Concepts

| Term | Description |
|------|-------------|
| **Definition** | The static blueprint: steps, edges, triggers, and settings |
| **Run** | A single execution of a definition with a specific input |
| **Step** | One node in the DAG — an agent call, swarm, webhook, transform, etc. |
| **Edge** | A directed dependency between two steps (`source → target`) |
| **Autonomy Level** | `L2` (human-on-the-loop, default) or `L3` (human-in-the-loop — requires approval gate) |

---

## Step Types

| Type | What it does |
|------|-------------|
| `agent` | Delegates a task to a sub-agent profile (e.g. `researcher`, `coder`) |
| `swarm` | Runs a swarm template against a task |
| `condition` | Evaluates a JavaScript expression; output is `true`/`false` |
| `transform` | Renders a Mustache-style output template from context |
| `resource` | Writes data to memory or knowledge base |
| `webhook` | Sends an HTTP request to an external URL |
| `subworkflow` | Executes another workflow definition inline |
| `tool` / `mcp` | (Reserved) Calls an MCP tool |
| `data_curation` | Snapshots conversation data for ML training (Phase 73) |
| `training_job` | Awaits a distillation or fine-tune job to complete (Phase 73) |
| `evaluation` | Runs an eval suite against a model endpoint (Phase 73) |
| `conditional_deploy` | Deploys a model if a metric threshold is met (Phase 73) |
| `human_approval` | Pauses the workflow until a human approves or rejects (Phase 73) |

---

## Built-in Templates

SecureYeoman ships 5 workflow definitions pre-seeded at startup.

### `research-report-pipeline`

Sequential: Researcher → Analyst → Format (transform) → Save to Memory.

**Required input**: `{ topic: string }`

### `code-review-webhook`

Runs the built-in `code-review` swarm, evaluates the result with a condition step, and POSTs a pass/fail notification to a webhook.

**Required input**: `{ code: string, prTitle: string, webhookUrl: string }`

### `parallel-intelligence-gather`

Three researcher agents run in parallel across three angles; an analyst synthesises the results into knowledge.

**Required input**: `{ topic: string }`

### `distill-and-eval` (ML Pipeline)

Curate dataset → await distillation job → evaluate → notify webhook.

**Required input**: `{ outputDir, personalityIds, distillationJobId, modelEndpoint, webhookUrl }`

### `finetune-and-deploy` (ML Pipeline — L3)

Curate → LoRA fine-tune → evaluate → human approval gate → conditional deploy to Ollama.

**Required input**: `{ outputDir, personalityIds, finetuneJobId, evalDatasetPath, modelEndpoint, ollamaUrl, personalityId, adapterName }`

### `dpo-loop` (ML Pipeline)

Curate preference data → DPO distillation → evaluate win-rate → promote if > 55%.

**Required input**: `{ outputDir, personalityIds, dpoJobId, modelEndpoint, ollamaUrl, personalityId, adapterName, webhookUrl }`

---

## Creating a Workflow

### Dashboard

1. Go to **Automation → Workflows**
2. Click **New Workflow**
3. Add steps using the visual builder (drag nodes onto the canvas)
4. Connect steps by drawing edges
5. Set retry policies and error handling per step
6. Click **Save**

### API

```bash
curl -X POST https://your-instance/api/v1/workflows \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "daily-briefing",
    "description": "Generates a daily briefing and posts it to Slack",
    "steps": [
      {
        "id": "gather",
        "type": "agent",
        "name": "Research",
        "config": {
          "profile": "researcher",
          "taskTemplate": "Summarise the key events of the past 24 hours on: {{input.topics}}"
        },
        "dependsOn": [],
        "onError": "fail"
      },
      {
        "id": "post",
        "type": "webhook",
        "name": "Post to Slack",
        "config": {
          "url": "{{input.slackWebhookUrl}}",
          "method": "POST",
          "bodyTemplate": "{\"text\": \"{{steps.gather.output}}\"}"
        },
        "dependsOn": ["gather"],
        "onError": "continue"
      }
    ],
    "edges": [
      { "source": "gather", "target": "post" }
    ],
    "triggers": [{ "type": "manual", "config": {} }],
    "isEnabled": true
  }'
```

Returns `{ definition }` (201).

---

## Template Variables (Mustache-style)

Steps can reference workflow input and previous step outputs using `{{...}}` syntax:

| Expression | Resolves to |
|-----------|-------------|
| `{{input.topic}}` | The `topic` field from the run's input object |
| `{{steps.researcher.output}}` | The full output of the step with id `researcher` |
| `{{steps.eval.output.metrics.char_similarity}}` | A nested field from a step's output |

---

## Error Handling

Each step has an `onError` policy:

| Policy | Behaviour |
|--------|-----------|
| `fail` | Abort the entire workflow run (default) |
| `continue` | Mark step as failed, continue to dependent steps |
| `skip` | Mark step as skipped, continue with `null` output |
| `fallback` | Mark step as failed, immediately execute `fallbackStepId` |

---

## Retry Policy

```json
{
  "retryPolicy": {
    "maxAttempts": 3,
    "backoffMs": 2000
  }
}
```

Each attempt waits `backoffMs × attemptNumber` before retrying.

---

## Triggering a Run

### Dashboard

Click **Run** on a workflow card and enter the input JSON.

### API

```bash
# Start a run
curl -X POST https://your-instance/api/v1/workflows/<id>/run \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "input": { "topic": "AI safety", "slackWebhookUrl": "https://hooks.slack.com/..." } }'

# Returns 202 with the run object
```

Poll for completion:

```bash
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/workflows/runs/<runId>
```

Run statuses: `pending` → `running` → `completed` | `failed`.

---

## Cancelling a Run

```bash
curl -X DELETE -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/workflows/runs/<runId>
```

---

## Autonomy Levels

| Level | Description | Human oversight |
|-------|-------------|-----------------|
| `L2` | Human-on-the-loop — workflow runs automatically | Reviewable after the fact |
| `L3` | Human-in-the-loop — requires a `human_approval` step | Blocked until a human approves |

Upgrading a workflow from L2 → L3 returns a `warnings` array in the `PUT` response to draw attention to the change.

---

## Human Approval Gate

A `human_approval` step pauses the workflow and creates a pending approval request:

```bash
# List pending approval requests
curl -H "Authorization: Bearer <jwt>" \
  https://your-instance/api/v1/training/approvals

# Approve
curl -X POST https://your-instance/api/v1/training/approvals/<requestId>/approve \
  -H "Authorization: Bearer <jwt>"

# Reject
curl -X POST https://your-instance/api/v1/training/approvals/<requestId>/reject \
  -H "Authorization: Bearer <jwt>"
```

If no decision is made within `timeoutMs` (default 24 hours), the workflow fails with a timeout error.

---

## Output Schema Validation

Each step can declare an `outputSchema` in its `config`. If the step's output does not conform, a `step_output_schema_violation` audit event is emitted (the workflow continues — schema violations are logged, not fatal by default).

```json
{
  "config": {
    "outputSchema": {
      "type": "object",
      "properties": {
        "summary": { "type": "string" },
        "score": { "type": "number" }
      },
      "required": ["summary"]
    }
  }
}
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/workflows` | List workflow definitions |
| `POST` | `/api/v1/workflows` | Create workflow definition |
| `GET` | `/api/v1/workflows/:id` | Get definition |
| `PUT` | `/api/v1/workflows/:id` | Update definition |
| `DELETE` | `/api/v1/workflows/:id` | Delete definition |
| `POST` | `/api/v1/workflows/:id/run` | Trigger a run |
| `GET` | `/api/v1/workflows/:id/runs` | List runs for a definition |
| `GET` | `/api/v1/workflows/runs/:runId` | Get run status + output |
| `DELETE` | `/api/v1/workflows/runs/:runId` | Cancel a running workflow |

---

## OR-Trigger Dependencies with `triggerMode: 'any'`

By default, a step waits for **all** of its `dependsOn` steps to complete (AND-trigger). Set `triggerMode: 'any'` to run the step after **any one** dependency completes:

```json
{
  "id": "process",
  "type": "agent",
  "dependsOn": ["fetch-primary", "fetch-fallback"],
  "triggerMode": "any",
  "config": {
    "profile": "analyst",
    "taskTemplate": "Analyze: {{steps.fetch-primary.output}}{{steps.fetch-fallback.output}}"
  }
}
```

**Behavior**:
- The step is placed in the execution tier immediately after its **earliest** completing dependency.
- If **all** upstream deps fail or are skipped, the `any`-step is also skipped (not run with empty inputs).
- `triggerMode: 'all'` is the default — no change to existing workflows.

---

## Strict Schema Enforcement with `outputSchemaMode: 'strict'`

Steps that declare `outputSchema` in their `config` can opt into strict enforcement:

```json
{
  "id": "classify",
  "type": "agent",
  "config": {
    "profile": "classifier",
    "taskTemplate": "Classify the input into a category",
    "outputSchema": {
      "type": "object",
      "required": ["category", "confidence"],
      "properties": {
        "category": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    },
    "outputSchemaMode": "strict"
  }
}
```

| Mode | Behavior on schema violation |
|------|------------------------------|
| `audit` (default) | Log warning + emit audit event; step continues |
| `strict` | Step **fails**; `onError` policy applies as normal |

`strict` + `onError: 'continue'` is a useful combination: the workflow continues but the schema violation is recorded as a step failure.

---

## Security Considerations

- Workflow definitions are stored as JSON — step `config` fields can contain secrets (webhook URLs, API keys). Use `{{input.secretVar}}` pattern to pass secrets at run time rather than baking them into the definition.
- `condition` steps use `new Function(...)` to evaluate JavaScript expressions. Expressions have access only to `steps` and `input` context objects — they cannot import modules or access the file system.
- `webhook` steps make outbound HTTP requests from the core container. In restrictive network environments, add a proxy or allowlist.
