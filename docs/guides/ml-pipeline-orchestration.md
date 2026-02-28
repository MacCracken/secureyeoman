# ML Pipeline Orchestration

SecureYeoman's workflow engine now supports end-to-end ML pipelines — from data curation through training, evaluation, human review, and model deployment — using the same DAG engine that powers all other workflows.

---

## Overview

Five new step types extend the workflow engine:

| Step Type | What it does |
|-----------|-------------|
| `data_curation` | Snapshot conversations to a JSONL dataset file |
| `training_job` | Wait for a distillation or finetune job to complete |
| `evaluation` | Run an eval set through a model, compute metrics |
| `conditional_deploy` | Deploy the model if a metric meets a threshold |
| `human_approval` | Pause for human review via the dashboard |

Three built-in templates are pre-seeded in the Workflows tab:
- **distill-and-eval** — curate → await distillation → evaluate → notify
- **finetune-and-deploy** — curate → LoRA finetune → evaluate → human approval → deploy
- **dpo-loop** — curate preference data → DPO distillation → evaluate win-rate → promote if > 55%

---

## Step Reference

### `data_curation`

Reads conversations from storage, applies filters, and writes a ShareGPT JSONL snapshot.

```json
{
  "id": "curate",
  "type": "data_curation",
  "name": "Curate Dataset",
  "config": {
    "outputDir": "{{input.outputDir}}",
    "personalityIds": ["p-abc123"],
    "minTurns": 2,
    "maxConversations": 2000
  },
  "dependsOn": [],
  "onError": "fail"
}
```

**Config options**:
- `outputDir` (required) — directory to write `dataset_<uuid>.jsonl`
- `personalityIds` — filter to specific personalities (omit for all)
- `minTurns` — minimum user-turn count per conversation (default: 1)
- `maxConversations` — cap on conversations to include (default: 5000)
- `fromTs` / `toTs` — millisecond timestamps for date range filter

**Output** (available as `{{steps.curate.output.*}}`):
```json
{
  "datasetId": "uuid",
  "path": "/tmp/secureyeoman-datasets/dataset_uuid.jsonl",
  "sampleCount": 150,
  "conversationCount": 40,
  "snapshotAt": 1709123456789
}
```

---

### `training_job`

Polls a pre-existing distillation or finetune job until it reaches a terminal state.

> **Note**: Distillation jobs must be started via the API before running the pipeline (they require a teacher LLM client). Finetune jobs are auto-started by this step if still `pending`.

```json
{
  "id": "train",
  "type": "training_job",
  "name": "LoRA Finetune",
  "config": {
    "jobType": "finetune",
    "jobId": "{{input.finetuneJobId}}",
    "timeoutMs": 14400000,
    "pollIntervalMs": 60000
  },
  "dependsOn": ["curate"],
  "onError": "fail"
}
```

**Config options**:
- `jobType` — `"distillation"` or `"finetune"` (default: `"finetune"`)
- `jobId` — ID of the pre-created job (template-resolved)
- `timeoutMs` — maximum wait in milliseconds (default: 3600000 = 1h)
- `pollIntervalMs` — poll frequency in milliseconds (default: 30000 = 30s)

**Output**:
```json
{
  "jobId": "...",
  "jobType": "finetune",
  "status": "complete",
  "adapterPath": "/tmp/secureyeoman-finetune/job-id/adapter",
  "experimentId": "..."
}
```

---

### `evaluation`

Runs a held-out eval set through a model endpoint and computes metrics.

```json
{
  "id": "eval",
  "type": "evaluation",
  "name": "Evaluate Model",
  "config": {
    "datasetPath": "{{steps.curate.output.path}}",
    "modelEndpoint": "http://ollama:11434/api/generate",
    "maxSamples": 200
  },
  "dependsOn": ["train"],
  "onError": "continue"
}
```

**Config options**:
- `datasetPath` — JSONL dataset (ShareGPT format). First `human` turn → prompt; first `gpt` turn → gold.
- `samples` — inline array of `{ prompt, gold }` objects (alternative to `datasetPath`)
- `modelEndpoint` — URL accepting `POST { prompt }` and returning `{ response }` or `{ text }`
- `maxSamples` — cap on samples to evaluate (default: 200)

**Output**:
```json
{
  "evalId": "uuid",
  "metrics": {
    "exact_match": 0.42,
    "char_similarity": 0.78,
    "sample_count": 200
  },
  "completedAt": 1709123456789
}
```

Metrics:
- `exact_match` — fraction of responses that exactly match the gold answer (case-insensitive)
- `char_similarity` — average character-level Jaccard similarity (0–1)

---

### `conditional_deploy`

Reads a metric from workflow context and deploys if it meets the threshold.

```json
{
  "id": "deploy",
  "type": "conditional_deploy",
  "name": "Deploy if Eval Passes",
  "config": {
    "metricPath": "steps.eval.output.metrics.char_similarity",
    "threshold": 0.7,
    "jobId": "{{input.finetuneJobId}}",
    "ollamaUrl": "http://ollama:11434",
    "personalityId": "{{input.personalityId}}",
    "modelVersion": "{{input.adapterName}}"
  },
  "dependsOn": ["approve"],
  "onError": "continue"
}
```

**Config options**:
- `metricPath` — dot-path into workflow context (e.g. `steps.eval.output.metrics.char_similarity`)
- `threshold` — minimum value to trigger deployment
- `jobId` — finetune job ID (used to call `registerWithOllama`)
- `ollamaUrl` — Ollama base URL (default: `http://ollama:11434`)
- `personalityId` — for lineage tracking
- `modelVersion` — adapter name or version string for lineage

**Output**:
```json
{
  "deployed": true,
  "metricValue": 0.78,
  "threshold": 0.7,
  "modelVersion": "my-adapter-v1",
  "personalityId": "p-abc123"
}
```

---

### `human_approval`

Creates a pending approval request, sends the eval report, and blocks until the user approves or rejects via the dashboard.

```json
{
  "id": "approve",
  "type": "human_approval",
  "name": "Human Approval Gate",
  "config": {
    "timeoutMs": 86400000,
    "reportTemplate": "{\"jobId\":\"{{input.finetuneJobId}}\",\"metrics\":{{steps.eval.output.metrics}}}"
  },
  "dependsOn": ["eval"],
  "onError": "fail"
}
```

**Config options**:
- `timeoutMs` — maximum wait in milliseconds (default: 86400000 = 24h). On timeout the request is marked `timed_out` and the step fails.
- `reportTemplate` — Mustache template evaluated to JSON; the result is stored in `report` on the approval request.

**Approving/rejecting from the dashboard**:

Navigate to **Training → Approvals** or call the API directly:

```bash
# Approve
curl -X POST /api/v1/training/approvals/<id>/approve \
  -H "Authorization: Bearer <token>" \
  -d '{"reason": "metrics look good"}'

# Reject
curl -X POST /api/v1/training/approvals/<id>/reject \
  -d '{"reason": "char_similarity too low"}'
```

**Output** (on approval):
```json
{ "approved": true, "requestId": "..." }
```

On rejection or timeout the step throws, which aborts the workflow (or triggers `onError` handler).

---

## Pipeline Lineage

Every ML pipeline run records a lineage chain queryable via:

```bash
# List all pipeline runs
GET /api/v1/training/lineage

# Full chain for a specific run
GET /api/v1/training/lineage/<workflowRunId>
```

Response:
```json
{
  "id": "...",
  "workflowRunId": "run-abc",
  "workflowId": "wf-xyz",
  "dataset": {
    "datasetId": "ds-1",
    "path": "/tmp/...",
    "sampleCount": 150,
    "snapshotAt": 1709123456789
  },
  "trainingJob": {
    "jobId": "job-1",
    "jobType": "finetune",
    "jobStatus": "complete"
  },
  "evaluation": {
    "evalId": "eval-1",
    "metrics": { "char_similarity": 0.78, "exact_match": 0.42, "sample_count": 200 },
    "completedAt": 1709123456789
  },
  "deployment": {
    "modelVersion": "my-adapter-v1",
    "personalityId": "p-abc123",
    "deployedAt": 1709123456789
  },
  "createdAt": 1709123456789,
  "updatedAt": 1709123456789
}
```

This answers: **"which pipeline produced this model?"** and **"what dataset went into this run?"**

---

## Built-in Templates

Import from **Workflows → Templates**. All three require workflow inputs:

### distill-and-eval

```
Input: outputDir, personalityIds, distillationJobId, modelEndpoint, webhookUrl
Steps: curate → train (distillation) → eval → notify (webhook)
```

Start a distillation job first:
```bash
POST /api/v1/training/distillation/jobs
{ "name": "...", "teacherProvider": "anthropic", "teacherModel": "claude-opus-4-6", "outputPath": "/tmp/..." }

POST /api/v1/training/distillation/jobs/<id>/run
```

Then trigger the workflow with `distillationJobId = <id>`.

### finetune-and-deploy

```
Input: outputDir, personalityIds, finetuneJobId, evalDatasetPath, modelEndpoint, ollamaUrl, personalityId, adapterName
Steps: curate → finetune → eval → human_approval → conditional_deploy
```

Create a finetune job first (it auto-starts):
```bash
POST /api/v1/training/finetune/jobs
{ "name": "...", "baseModel": "llama3.2", "adapterName": "my-adapter", "datasetPath": "/tmp/..." }
```

### dpo-loop

```
Input: outputDir, personalityIds, dpoJobId, modelEndpoint, ollamaUrl, personalityId, adapterName, webhookUrl
Steps: curate → dpo distillation → eval (win-rate proxy) → promote if > 55% → notify
```

---

## API Reference

### Approval Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/training/approvals` | List all (add `?status=pending` or `?runId=`) |
| `GET` | `/api/v1/training/approvals/:id` | Get specific request |
| `POST` | `/api/v1/training/approvals/:id/approve` | Approve (body: `{ reason? }`) |
| `POST` | `/api/v1/training/approvals/:id/reject` | Reject (body: `{ reason? }`) |

### Pipeline Lineage

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/training/lineage` | List recent pipeline runs |
| `GET` | `/api/v1/training/lineage/:runId` | Lineage for a specific workflow run |
