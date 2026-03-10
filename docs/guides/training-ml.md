# Training & ML Pipeline Guide

SecureYeoman provides a complete training and ML pipeline system: adaptive learning with priority-weighted sampling and evaluation, dataset export for local model fine-tuning, and workflow-based ML pipeline orchestration with lineage tracking.

---

## Table of Contents

- [Adaptive Learning Pipeline](#adaptive-learning-pipeline)
  - [Priority-Weighted Distillation Sampling](#priority-weighted-distillation-sampling)
  - [Conversation Quality Scoring](#conversation-quality-scoring)
  - [Factored Tool-Call Evaluation](#factored-tool-call-evaluation)
  - [Live Training Stream](#live-training-stream)
  - [Computer Use Episodes](#computer-use-episodes)
- [Dataset Export](#dataset-export)
  - [Prerequisites](#prerequisites)
  - [Export Formats](#export-formats)
  - [Using the Dashboard](#using-the-dashboard)
  - [Using the CLI](#using-the-cli)
  - [Local Training Pipeline](#local-training-pipeline)
  - [Embedding Training Approaches](#embedding-training-approaches)
- [ML Pipeline Orchestration](#ml-pipeline-orchestration)
  - [Step Reference](#step-reference)
  - [Pipeline Lineage](#pipeline-lineage)
  - [Built-in Templates](#built-in-templates)
- [Advanced Training](#advanced-training)
  - [DPO Training](#dpo-training)
  - [RLHF Training](#rlhf-training)
  - [Hyperparameter Search](#hyperparameter-search)
  - [Checkpoint Management](#checkpoint-management)
  - [Multi-GPU Setup](#multi-gpu-setup)
- [API Reference](#api-reference)

---

## Adaptive Learning Pipeline

SecureYeoman's adaptive learning pipeline adds four capabilities to the existing distillation/fine-tuning system: priority-weighted sampling, factored tool-call evaluation, counterfactual data generation, and a live training stream with dashboard observability.

### Priority-Weighted Distillation Sampling

#### Configuration

When creating a distillation job via the API or dashboard, three new fields control sampling:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `priorityMode` | `'uniform' \| 'failure-first' \| 'success-first'` | `'uniform'` | Sampling order |
| `curriculumMode` | boolean | `false` | Stage-based ordering (simple to complex) |
| `counterfactualMode` | boolean | `false` | Generate synthetic recovery examples |
| `maxCounterfactualSamples` | number | `50` | Cap on synthetic samples per job |

#### Failure-first mode

Conversations with lower quality scores (closer to 0.0) are sampled first. This ensures the teacher LLM focuses on conversations where the system performed poorly.

```bash
curl -X POST /api/v1/training/distillation/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "failure-first-run",
    "teacherProvider": "anthropic",
    "teacherModel": "claude-opus-4-6",
    "outputPath": "/data/distillation.jsonl",
    "priorityMode": "failure-first",
    "maxSamples": 1000
  }'
```

#### Curriculum mode

Conversations are processed in four stages:
1. **Stage 1** (4 messages or fewer, 25% of quota) -- basic single-turn interactions
2. **Stage 2** (5-10 messages) -- multi-turn dialogues
3. **Stage 3** (11-20 messages) -- longer conversations
4. **Stage 4** (>20 messages) -- complex multi-step interactions

Enable by setting `curriculumMode: true`.

#### Counterfactual generation

When `counterfactualMode: true`, the job also re-submits the final user turn from failed conversations to the teacher with a recovery prompt:

> "You are helping generate ideal training data. Given this conversation that ended poorly, provide the ideal assistant response for the final user turn."

Synthetic samples are tagged `"synthetic": true` in JSONL metadata.

---

### Conversation Quality Scoring

SecureYeoman automatically scores new conversations every 5 minutes using:

```
score = 0.5
      - 0.30  if pipeline outcome = failed
      - 0.15  per correction phrase found in user messages
                ("that's wrong", "try again", "no,", "incorrect", etc.)
      - 0.10 x (injection_score - 0.5)  when injection_score > 0.5
score = clamp(score, 0.0, 1.0)
```

**Lower score = higher training priority** in failure-first mode.

#### Manual scoring trigger

```bash
POST /api/v1/training/quality/score
# Response: { "scored": 42 }
```

#### View quality scores

```bash
GET /api/v1/training/quality?limit=100
# Response: { "conversations": [ { "conversationId", "qualityScore", "signalSource", "scoredAt" } ] }
```

---

### Factored Tool-Call Evaluation

#### Extended metrics

Running `EvaluationManager.runEvaluation()` now returns:

| Metric | Description |
|--------|-------------|
| `exact_match` | Fraction of exact-string matches |
| `char_similarity` | Char-level Jaccard similarity |
| `tool_name_accuracy` | Fraction with correct tool selected |
| `tool_arg_match` | Average per-argument precision |
| `outcome_correctness` | Sandbox end-state match (optional) |
| `semantic_similarity` | Ollama embedding cosine similarity (optional) |

#### Semantic similarity (optional)

Requires a running Ollama instance with `nomic-embed-text` model:

```typescript
const result = await evalManager.runEvaluation({
  samples,
  modelFn,
  semanticSimilarity: true,
  ollamaEmbedUrl: 'http://localhost:11434',
});
```

#### Outcome correctness (optional)

Provide a sandbox function that executes tool calls and returns a comparable result:

```typescript
const result = await evalManager.runEvaluation({
  samples,
  modelFn,
  sandboxFn: async (toolName, args) => {
    return executeTool(toolName, args);
  },
});
```

---

### Live Training Stream

#### SSE endpoint

Connect to `GET /api/v1/training/stream` to receive real-time events:

```typescript
const es = new EventSource('/api/v1/training/stream?token=...');
es.onmessage = (evt) => {
  const { type, value, ts } = JSON.parse(evt.data);
  // type: 'loss' | 'throughput' | 'agreement' | 'reward'
};
```

#### Event types

| Type | Source | Description |
|------|--------|-------------|
| `loss` | FinetuneManager | Parsed from container log lines containing `loss:` |
| `throughput` | DistillationManager | Samples/min, emitted every 10 samples |
| `agreement` | DistillationManager | Average char-Jaccard vs gold, every 10 samples |
| `reward` | Training routes | Emitted on each computer-use episode record |

#### Dashboard Live tab

The **Live** sub-tab in the Training section shows:
- Rolling loss chart (last 200 points)
- Reward trend chart
- Throughput KPI card (samples/min)
- Agreement rate KPI card
- Quality heatmap grid (red = needs training, green = well covered)

---

### Computer Use Episodes

The Tauri desktop client can record RL training episodes for computer-use skill automation.

#### Recording an episode

```bash
POST /api/v1/training/computer-use/episodes
Content-Type: application/json

{
  "sessionId": "session-abc",
  "skillName": "fill-form",
  "stateEncoding": { "url": "https://app.example.com/form", "fields": ["name", "email"] },
  "actionType": "click",
  "actionTarget": "#submit-btn",
  "actionValue": "",
  "reward": 1.0,
  "done": true
}
```

#### Listing episodes

```bash
GET /api/v1/training/computer-use/episodes?skillName=fill-form&limit=50
```

#### Skill breakdown stats

```bash
GET /api/v1/training/computer-use/stats
# Response:
# {
#   "skillBreakdown": [
#     { "skillName": "click", "episodeCount": 42, "successRate": 0.88, "avgReward": 0.76 }
#   ],
#   "totals": { "totalEpisodes": 42, "avgReward": 0.76 }
# }
```

#### Export for offline RL training

```bash
POST /api/v1/training/export
{ "format": "computer_use" }

# JSONL stream, one episode per line:
# {"format":"computer_use","id":"...","session_id":"...","skill_name":"...","state":{...},"action":{"type":"click","target":"#btn","value":""},"reward":1.0,"done":true,"created_at":"..."}
```

#### Deleting an episode

```bash
DELETE /api/v1/training/computer-use/episodes/:id
```

---

## Dataset Export

Export your SecureYeoman conversation history, memories, and knowledge entries as structured datasets for fine-tuning local LLMs and embedding models.

SecureYeoman accumulates rich conversational data as you interact with your AI personalities. The training export feature lets you turn that data into fine-tuning datasets compatible with:

- **LLaMA Factory** and **Unsloth** for chat model fine-tuning
- **sentence-transformers** for custom embedding models
- **Pre-training corpora** for continued pre-training or SimCSE contrastive training

The result is a closed local-AI loop: your own conversations train models that understand your domain, those models are served via Ollama, and Ollama is connected back as a provider in SecureYeoman.

### Prerequisites

1. **Enable training export** in Security settings:
   - Navigate to **Settings > Security > Policy Toggles**
   - Enable **Allow Training Export**
   - Without this, the Training tab is hidden and the API returns `403`

2. **Have conversations.** The export skips single-message conversations (fewer than 2 messages), so you need at least some back-and-forth history.

3. For local training you will need Python 3.10+, and optionally Ollama installed locally.

### Export Formats

#### ShareGPT JSONL (recommended for chat fine-tuning)

Each line is a JSON object with a `conversations` array of `{ from, value }` turns. This is the most widely supported format for instruction-tuned chat models.

```jsonl
{"conversations":[{"from":"human","value":"What is the capital of France?"},{"from":"gpt","value":"The capital of France is Paris."}]}
{"conversations":[{"from":"human","value":"Summarise this document for me."},{"from":"gpt","value":"Sure. The document describes..."}]}
```

Compatible with: LLaMA Factory, Unsloth, axolotl.

#### Instruction JSONL (Alpaca / SFT pairs)

Each line is a JSON object with `instruction`, `input`, and `output` fields. Useful when conversations map cleanly to a single instruction-response pair.

```jsonl
{"instruction":"Translate to French","input":"Hello, how are you?","output":"Bonjour, comment allez-vous ?"}
{"instruction":"Write a Python function","input":"that reverses a string","output":"def reverse(s):\n    return s[::-1]"}
```

Compatible with: Alpaca-style trainers, LLaMA Factory, Unsloth.

#### Raw Text Corpus

Each line is a plain-text block of the full conversation, separated by blank lines between conversations. Useful for continued pre-training or SimCSE contrastive learning on raw text.

```
User: What is the capital of France?
Assistant: The capital of France is Paris.

User: Summarise this document for me.
Assistant: Sure. The document describes...
```

Compatible with: sentence-transformers (SimCSE), any pre-training pipeline that ingests plain text.

### Using the Dashboard

1. Open **Developers** in the sidebar.
2. Click the **Training** tab (only visible when `allowTrainingExport` is enabled).
3. The stats cards show how many conversations, memories, and knowledge entries are available.
4. Choose a **Format** (ShareGPT JSONL, Instruction JSONL, or Raw Text).
5. Optionally set a **Limit** (max 100,000 rows) and a **date range**.
6. Click **Download** -- the browser will stream and save the file.

The Training tab also displays a Local Training Pipeline guide summarising the five-step loop described below.

#### Dashboard Training tabs

The create-job form includes:
- **Priority Mode** -- dropdown (Uniform / Failure-first / Success-first)
- **Curriculum mode** -- checkbox
- **Counterfactual mode** -- checkbox + max samples input

The **Computer Use** tab shows:
- Stat cards (total episodes, avg reward, skill count)
- Skill breakdown table
- Session replay viewer (filter by session ID, view ordered action list with reward chips)

The **Fine-tune** tab includes an **Eval Radar** card: after running an evaluation, the `EvalResultRadarCard` displays a radar chart with four axes: Tool Name Accuracy, Tool Args Match, Semantic Similarity, Char Similarity.

### Using the CLI

The `secureyeoman training export` command streams the dataset to stdout or writes it to a file.

#### Flags

| Flag | Description | Default |
|---|---|---|
| `--format` | `sharegpt`, `alpaca`, or `raw` | `sharegpt` |
| `--out` | Output file path. Omit to stream to stdout | stdout |
| `--from` | Start timestamp (milliseconds since epoch) | none |
| `--to` | End timestamp (milliseconds since epoch) | none |
| `--personality-id` | Filter by personality UUID (repeatable) | all |
| `--limit` | Maximum number of conversations to export (max 100,000) | 10,000 |

#### Examples

Export all conversations as ShareGPT JSONL to a file:

```bash
secureyeoman training export --format sharegpt --out dataset.jsonl
```

Export only conversations from a specific personality in the last 30 days:

```bash
THIRTY_DAYS_AGO=$(date -d '30 days ago' +%s%3N)
secureyeoman training export \
  --format sharegpt \
  --personality-id 7f3a1c2d-... \
  --from $THIRTY_DAYS_AGO \
  --out personality-dataset.jsonl
```

Stream directly into a Python training script:

```bash
secureyeoman training export --format raw | python train_embeddings.py
```

Export in Alpaca format with a limit:

```bash
secureyeoman training export --format alpaca --limit 5000 --out alpaca.jsonl
```

### Local Training Pipeline

The recommended five-step loop for training local models on your exported data.

#### Step 1: Export Conversations

```bash
secureyeoman training export --format sharegpt --out ~/training/dataset.jsonl
```

Check how many lines you have:

```bash
wc -l ~/training/dataset.jsonl
```

A dataset of 1,000+ conversations is enough to meaningfully shift model behaviour on a domain-specific task.

#### Step 2: Train an Embedding Model with sentence-transformers

Use your raw text or ShareGPT export to fine-tune a dense retrieval model. This improves vector memory recall for your specific domain.

```python
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader
import json

# Load conversation pairs from raw text or build from ShareGPT
examples = []
with open("dataset.jsonl") as f:
    for line in f:
        conv = json.loads(line)
        turns = conv["conversations"]
        for i in range(0, len(turns) - 1, 2):
            human = turns[i]["value"]
            assistant = turns[i + 1]["value"]
            examples.append(InputExample(texts=[human, assistant]))

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
loader = DataLoader(examples, batch_size=16, shuffle=True)
loss = losses.MultipleNegativesRankingLoss(model)

model.fit(
    train_objectives=[(loader, loss)],
    epochs=3,
    warmup_steps=100,
    output_path="./my-embedding-model",
)
```

Alternative base models worth trying:

- `BAAI/bge-small-en-v1.5` -- compact, fast, strong retrieval
- `thenlper/gte-base` -- good multilingual coverage
- `intfloat/e5-base-v2` -- strong zero-shot retrieval

#### Step 3: Fine-tune a Chat Model

**With Unsloth (faster, less VRAM):**

```python
from unsloth import FastLanguageModel
import json

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Llama-3.2-3B-Instruct",
    max_seq_length=2048,
    load_in_4bit=True,
)

# Apply LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "v_proj"],
    lora_alpha=16,
    lora_dropout=0,
)

# Load ShareGPT dataset
with open("dataset.jsonl") as f:
    dataset = [json.loads(l) for l in f]

# ... training loop using Unsloth's SFTTrainer wrapper
```

**With LLaMA Factory:**

```bash
# Convert dataset.jsonl to LLaMA Factory's expected location
cp dataset.jsonl ~/.llamafactory/data/my_dataset.jsonl

# Add to dataset_info.json, then run:
llamafactory-cli train \
  --model_name_or_path meta-llama/Llama-3.2-3B-Instruct \
  --dataset my_dataset \
  --template llama3 \
  --finetuning_type lora \
  --output_dir ./lora-output \
  --num_train_epochs 3
```

#### Step 4: Serve via Ollama

Create an Ollama Modelfile pointing at your fine-tuned weights or merged model:

```
# Modelfile
FROM ./merged-model-gguf/model.gguf
SYSTEM "You are a helpful assistant trained on domain-specific conversations."
PARAMETER temperature 0.7
PARAMETER num_ctx 4096
```

Register and run the model:

```bash
ollama create my-finetuned-model -f Modelfile
ollama run my-finetuned-model
```

For the embedding model, convert with `llama.cpp` and create a separate entry:

```bash
ollama create my-embedding-model -f EmbeddingModelfile
```

#### Step 5: Connect Back to SecureYeoman

**Chat model:** In Settings > Models, set the provider to Ollama and select `my-finetuned-model` as the default model for the relevant personality.

**Embedding model:** In Settings > Brain > Vector Memory, set the API Provider to Ollama and set the Model field to `my-embedding-model`. See the [Ollama Embedding Provider Guide](./ollama-embeddings.md) for full configuration details.

Your conversations now improve the very models that power future conversations.

### Embedding Training Approaches

| Approach | Use Case | Loss Function | Base Model |
|---|---|---|---|
| Multiple Negatives Ranking | Dense retrieval, semantic search | `MultipleNegativesRankingLoss` | all-MiniLM-L6-v2, GTE, E5 |
| SimCSE (unsupervised) | Pre-training on raw corpus, no labels needed | `MultipleNegativesRankingLoss` with dropout augmentation | any BERT-style model |
| NLI fine-tuning | Entailment-aware similarity | `SoftmaxLoss` | roberta-base |
| PEFT / LoRA | Parameter-efficient chat model tuning | Cross-entropy (SFT) | LLaMA 3, Mistral, Gemma |

For most users, the Multiple Negatives Ranking approach in Step 2 is the best starting point -- it requires no labelled data beyond the conversation pairs themselves.

---

## ML Pipeline Orchestration

SecureYeoman's workflow engine supports end-to-end ML pipelines -- from data curation through training, evaluation, human review, and model deployment -- using the same DAG engine that powers all other workflows.

Five step types extend the workflow engine:

| Step Type | What it does |
|-----------|-------------|
| `data_curation` | Snapshot conversations to a JSONL dataset file |
| `training_job` | Wait for a distillation or finetune job to complete |
| `evaluation` | Run an eval set through a model, compute metrics |
| `conditional_deploy` | Deploy the model if a metric meets a threshold |
| `human_approval` | Pause for human review via the dashboard |

Three built-in templates are pre-seeded in the Workflows tab:
- **distill-and-eval** -- curate, await distillation, evaluate, notify
- **finetune-and-deploy** -- curate, LoRA finetune, evaluate, human approval, deploy
- **dpo-loop** -- curate preference data, DPO distillation, evaluate win-rate, promote if > 55%

### Step Reference

#### `data_curation`

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
- `outputDir` (required) -- directory to write `dataset_<uuid>.jsonl`
- `personalityIds` -- filter to specific personalities (omit for all)
- `minTurns` -- minimum user-turn count per conversation (default: 1)
- `maxConversations` -- cap on conversations to include (default: 5000)
- `fromTs` / `toTs` -- millisecond timestamps for date range filter

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

#### `training_job`

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
- `jobType` -- `"distillation"` or `"finetune"` (default: `"finetune"`)
- `jobId` -- ID of the pre-created job (template-resolved)
- `timeoutMs` -- maximum wait in milliseconds (default: 3600000 = 1h)
- `pollIntervalMs` -- poll frequency in milliseconds (default: 30000 = 30s)

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

#### `evaluation`

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
- `datasetPath` -- JSONL dataset (ShareGPT format). First `human` turn is the prompt; first `gpt` turn is gold.
- `samples` -- inline array of `{ prompt, gold }` objects (alternative to `datasetPath`)
- `modelEndpoint` -- URL accepting `POST { prompt }` and returning `{ response }` or `{ text }`
- `maxSamples` -- cap on samples to evaluate (default: 200)

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

#### `conditional_deploy`

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
- `metricPath` -- dot-path into workflow context (e.g. `steps.eval.output.metrics.char_similarity`)
- `threshold` -- minimum value to trigger deployment
- `jobId` -- finetune job ID (used to call `registerWithOllama`)
- `ollamaUrl` -- Ollama base URL (default: `http://ollama:11434`)
- `personalityId` -- for lineage tracking
- `modelVersion` -- adapter name or version string for lineage

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

#### `human_approval`

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
- `timeoutMs` -- maximum wait in milliseconds (default: 86400000 = 24h). On timeout the request is marked `timed_out` and the step fails.
- `reportTemplate` -- Mustache template evaluated to JSON; the result is stored in `report` on the approval request.

**Approving/rejecting from the dashboard**:

Navigate to **Training > Approvals** or call the API directly:

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

### Pipeline Lineage

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

### Built-in Templates

Import from **Workflows > Templates**. All three require workflow inputs:

#### distill-and-eval

```
Input: outputDir, personalityIds, distillationJobId, modelEndpoint, webhookUrl
Steps: curate -> train (distillation) -> eval -> notify (webhook)
```

Start a distillation job first:
```bash
POST /api/v1/training/distillation/jobs
{ "name": "...", "teacherProvider": "anthropic", "teacherModel": "claude-opus-4-6", "outputPath": "/tmp/..." }

POST /api/v1/training/distillation/jobs/<id>/run
```

Then trigger the workflow with `distillationJobId = <id>`.

#### finetune-and-deploy

```
Input: outputDir, personalityIds, finetuneJobId, evalDatasetPath, modelEndpoint, ollamaUrl, personalityId, adapterName
Steps: curate -> finetune -> eval -> human_approval -> conditional_deploy
```

Create a finetune job first (it auto-starts):
```bash
POST /api/v1/training/finetune/jobs
{ "name": "...", "baseModel": "llama3.2", "adapterName": "my-adapter", "datasetPath": "/tmp/..." }
```

#### dpo-loop

```
Input: outputDir, personalityIds, dpoJobId, modelEndpoint, ollamaUrl, personalityId, adapterName, webhookUrl
Steps: curate -> dpo distillation -> eval (win-rate proxy) -> promote if > 55% -> notify
```

---

## Advanced Training

This section covers DPO/RLHF alignment training, hyperparameter search, checkpoint management, and multi-GPU setup for the Docker-based training sidecar (Phase 131).

**Prerequisites**: NVIDIA GPU with CUDA support and Docker GPU runtime configured, the training Docker sidecar image built (`secureyeoman-train:latest`), and a preference dataset exported (for DPO/RLHF) via the dataset curation API.

### DPO Training

Direct Preference Optimization trains a model to prefer chosen responses over rejected ones without a separate reward model. Export preference pairs first, then create a DPO job. For an automated DPO pipeline, see the [dpo-loop template](#dpo-loop) above.

#### 1. Prepare Preference Data

Export preference pairs via the API:

```
POST /training/preferences/export
{
  "format": "jsonl",
  "personalityId": "default"
}
```

Each line contains `prompt`, `chosen`, and `rejected` fields.

#### 2. Create DPO Job

```
POST /training/finetune
{
  "method": "dpo",
  "baseModel": "llama3.2:3b",
  "adapterName": "my-dpo-adapter",
  "datasetPath": "/data/preferences.jsonl",
  "dpoBeta": 0.1,
  "loraRank": 16,
  "loraAlpha": 32,
  "epochs": 3,
  "batchSize": 4
}
```

#### 3. Monitor

```
GET /training/finetune/{jobId}/logs
```

Logs stream in real-time. The dashboard Training tab shows loss curves via the [Live Training Stream](#live-training-stream).

### RLHF Training

RLHF requires two stages: first train a reward model on preference data, then run PPO against that reward model.

#### Stage 1: Train Reward Model

```
POST /training/finetune
{
  "method": "reward",
  "baseModel": "llama3.2:3b",
  "adapterName": "my-reward-model",
  "datasetPath": "/data/preferences.jsonl",
  "epochs": 2
}
```

#### Stage 2: Run PPO

```
POST /training/finetune
{
  "method": "rlhf",
  "baseModel": "llama3.2:3b",
  "adapterName": "my-rlhf-adapter",
  "datasetPath": "/data/prompts.jsonl",
  "rewardModelPath": "/adapters/my-reward-model",
  "ppoEpochs": 4,
  "klCoefficient": 0.02,
  "miniBatchSize": 8
}
```

### Hyperparameter Search

#### Define Search Space

```
POST /training/hyperparameter-search
{
  "strategy": "random",
  "maxTrials": 10,
  "baseJobConfig": {
    "method": "sft",
    "baseModel": "llama3.2:3b",
    "datasetPath": "/data/training.jsonl",
    "epochs": 3
  },
  "searchSpace": {
    "loraRank": [8, 16, 32, 64],
    "loraAlpha": [16, 32, 64],
    "learningRate": { "min": 1e-5, "max": 5e-4, "scale": "log" },
    "batchSize": [2, 4, 8]
  }
}
```

The `grid` strategy evaluates all combinations. The `random` strategy samples `maxTrials` configurations from the space.

#### View Results

```
GET /training/hyperparameter-search/{searchId}
```

Returns all child jobs with their eval metrics. The `bestJobId` field indicates the top performer.

### Checkpoint Management

#### Configuration

Checkpoints are enabled by default. Control the interval in the job config:

```json
{
  "checkpointSteps": 500,
  "maxCheckpoints": 5
}
```

When `maxCheckpoints` is reached, the oldest checkpoint (excluding the best by validation loss) is deleted.

#### List Checkpoints

```
GET /training/finetune/{jobId}/checkpoints
```

Returns an array of `{ step, trainLoss, valLoss, adapterPath, createdAt }`.

#### Resume from Checkpoint

```
POST /training/finetune
{
  "method": "sft",
  "baseModel": "llama3.2:3b",
  "resumeFromCheckpoint": "/checkpoints/job-abc/step-1500",
  "datasetPath": "/data/training.jsonl",
  "epochs": 5
}
```

#### Promote Checkpoint

Deploy an intermediate checkpoint as the final adapter:

```
POST /training/finetune/{jobId}/checkpoints/{step}/promote
```

This registers the checkpoint adapter with Ollama and updates the job record.

### Multi-GPU Setup

#### Configuration

Specify GPU devices in the job config:

```json
{
  "gpus": "0,1",
  "method": "sft",
  "baseModel": "llama3.2:7b",
  "datasetPath": "/data/training.jsonl"
}
```

The container launches with `--gpus device=0,1` and the training script uses `accelerate` for data-parallel distribution.

#### Verify GPU Availability

```
GET /training/gpu-status
```

Returns detected GPUs with memory usage, helping operators plan device allocation.

#### CLI Usage

```bash
secureyeoman train finetune \
  --method dpo \
  --base-model llama3.2:3b \
  --dataset /data/prefs.jsonl \
  --gpus 0,1 \
  --checkpoint-steps 250 \
  --dpo-beta 0.1
```

Use `secureyeoman train search --strategy random --max-trials 10 ...` for hyperparameter search from the command line.

---

## API Reference

### Training Export

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/training/export` | Stream a JSONL/text dataset (requires `allowTrainingExport`) |
| `GET` | `/api/v1/training/stats` | Dataset size counts (requires `allowTrainingExport`) |

**POST /api/v1/training/export** request body:

| Field | Type | Required | Description |
|---|---|---|---|
| `format` | `"sharegpt" \| "alpaca" \| "raw" \| "computer_use"` | No | Default: `sharegpt` |
| `limit` | `number` | No | Max 100,000. Default: 10,000 |
| `from` | `number` | No | Start timestamp in milliseconds |
| `to` | `number` | No | End timestamp in milliseconds |
| `personalityIds` | `string[]` | No | Filter by personality UUIDs |

**Response:** `200 OK` with `Content-Type: application/x-ndjson` (or `text/plain` for `raw`), streamed line by line.

**GET /api/v1/training/stats** response:

```json
{
  "conversations": 1842,
  "memories": 9341,
  "knowledge": 523
}
```

### Quality Scoring

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/training/quality/score` | Trigger manual quality scoring |
| `GET` | `/api/v1/training/quality` | List quality scores (add `?limit=`) |

### Live Stream

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/training/stream` | SSE stream of training events |

### Computer Use Episodes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/training/computer-use/episodes` | Record an episode |
| `GET` | `/api/v1/training/computer-use/episodes` | List episodes (add `?skillName=&limit=`) |
| `GET` | `/api/v1/training/computer-use/stats` | Skill breakdown stats |
| `DELETE` | `/api/v1/training/computer-use/episodes/:id` | Delete an episode |

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

---

## Environment Variables

No new required env vars. The quality scorer runs automatically. Ollama semantic similarity requires `ollamaEmbedUrl` to be passed in the API call (not a global env var).

Computer-use episode storage requires no additional configuration beyond existing Postgres.
