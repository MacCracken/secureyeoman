# ADR 157: ML Pipeline Orchestration

**Date**: 2026-02-28
**Status**: Accepted
**Phase**: 73

---

## Context

SecureYeoman already has:
- A DAG-based workflow engine with topological sort and tier-parallel execution (9 step types)
- `DistillationManager` — teacher-LLM conversation distillation
- `FinetuneManager` — Docker-based LoRA/QLoRA training
- `ExperimentManager` — basic A/B traffic routing

Teams want reproducible ML pipelines (à la SageMaker Pipelines) without new infrastructure: curate data, train, evaluate, get human sign-off, and deploy — all trackable and queryable after the fact.

---

## Decision

Extend the existing workflow engine with 5 ML-specific step types and build three supporting managers. No new infrastructure required.

### Step Types Added

| Step Type | Purpose | Key Config |
|-----------|---------|------------|
| `data_curation` | Snapshot conversations to JSONL | `outputDir`, `personalityIds`, `minTurns`, `maxConversations` |
| `training_job` | Poll distillation/finetune job to completion | `jobType`, `jobId`, `timeoutMs`, `pollIntervalMs` |
| `evaluation` | Compute metrics (exact_match, char_similarity) | `datasetPath` or `samples`, `modelEndpoint`, `maxSamples` |
| `conditional_deploy` | Deploy if metric ≥ threshold | `metricPath`, `threshold`, `jobId`, `ollamaUrl` |
| `human_approval` | Gate on dashboard approval with timeout | `timeoutMs`, `reportTemplate` |

### Supporting Managers

- **`DataCurationManager`** — reads `ConversationStorage`, applies filters, writes JSONL snapshot
- **`EvaluationManager`** — stateless; calls a model endpoint for each sample, computes metrics
- **`ApprovalManager`** — PostgreSQL-backed; creates approval requests, polls for decisions
- **`PipelineLineageStorage`** — records dataset→job→eval→deployment chain per `workflowRunId`

### Lineage Schema (`training.pipeline_lineage`)

One record per workflow run. Columns are updated as each ML step completes:
- `dataset_id`, `dataset_path`, `dataset_sample_count`, `dataset_filters`, `dataset_snapshotted_at`
- `training_job_id`, `training_job_type`, `training_job_status`
- `eval_id`, `eval_metrics`, `eval_completed_at`
- `deployed_model_version`, `deployed_personality_id`, `deployed_at`

### Human Approval Schema (`training.approval_requests`)

- Status transitions: `pending` → `approved` | `rejected` | `timed_out`
- Expiry stored as DB column (`expires_at`) for index-based cleanup
- Dashboard polls `GET /api/v1/training/approvals?status=pending`

---

## Alternatives Considered

### Build a dedicated MLflow-style tracking server
Rejected — unnecessary dependency. Workflow engine already provides DAG execution and run storage. Lineage table is sufficient for v1.

### Block the workflow run thread while waiting for human approval
Rejected — instead, `ApprovalManager.waitForDecision()` polls the DB every 15 seconds. Workflow run stays in 'running' state. Timeout marks the request as `timed_out` and the step throws (fails or continues based on `onError` policy).

### Build a real BLEU/ROUGE evaluation pipeline
Deferred — `EvaluationManager` uses character-level Jaccard similarity as a proxy metric. This is fast, dependency-free, and good enough for relative comparison. Real BLEU can be added later by plugging in a custom `modelFn`.

### Store training_job step config in `data_curation` step
Rejected — kept steps orthogonal. The `data_curation` step just writes a file. The `training_job` step receives the path via template resolution (`{{steps.curate.output.path}}`).

---

## Consequences

**Positive**:
- No new infrastructure: existing workflow engine, PostgreSQL, and Ollama are sufficient
- Full lineage queryable: "which pipeline produced this model?" answered via `/api/v1/training/lineage/:runId`
- Human approval is non-blocking: pipeline stays alive while waiting; timeout auto-resolves
- Three starter templates lower the barrier to getting an ML pipeline running

**Negative**:
- `training_job` step for distillation only *polls* — it does not launch the job (distillation requires a teacher client injected by the route handler, not the engine). Users must start distillation via the API before triggering the pipeline.
- Evaluation is a proxy metric — exact_match and char_similarity are simple; real LLM-as-judge requires additional setup.
- `conditional_deploy` currently only registers with Ollama; updating a personality's active model requires a separate step or manual action.
