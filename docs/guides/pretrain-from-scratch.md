# Pre-Training from Scratch Guide

Pre-train small language models (≤3B parameters) on custom corpora. Useful for domain-specific models (legal, medical, internal documentation) where general-purpose models lack coverage.

## Configuration

```yaml
ops:
  training:
    pretraining:
      enabled: true
      maxConcurrentJobs: 1
      maxModelParams: "3B"
      defaultImage: "ghcr.io/secureyeoman/pretrain-runner:latest"
      corpusDir: "/data/corpus"
      outputDir: "/data/models"
      maxCorpusSizeGb: 50
```

## Workflow

### 1. Prepare Corpus

Supported formats: plaintext, JSONL, CSV, Parquet, Markdown.

JSONL example (`corpus.jsonl`):
```json
{"text": "First document content here..."}
{"text": "Second document content here..."}
```

### 2. Validate Corpus

```bash
curl -X POST /api/v1/training/pretrain/corpus/validate \
  -d '{"path": "/data/corpus/wiki.jsonl", "format": "jsonl", "textField": "text"}'
```

Response includes token estimate, document count, and any validation errors.

### 3. Create Pre-Training Job

```bash
curl -X POST /api/v1/training/pretrain/jobs \
  -d '{
    "name": "Legal LLM v1",
    "architecture": "llama",
    "parameterCount": "125M",
    "vocabSize": 32000,
    "contextLength": 2048,
    "hiddenSize": 768,
    "numLayers": 12,
    "numHeads": 12,
    "intermediateSize": 3072,
    "corpusSourceIds": ["src-legal-corpus"],
    "totalTokens": 10000000,
    "batchSize": 32,
    "gradientAccumulationSteps": 4,
    "learningRate": 0.0003,
    "lrSchedule": "cosine",
    "warmupSteps": 1000,
    "maxSteps": 50000,
    "checkpointSteps": 5000
  }'
```

### 4. Monitor Progress

```bash
# List all jobs
curl /api/v1/training/pretrain/jobs

# Get job details
curl /api/v1/training/pretrain/jobs/{jobId}

# Filter by status
curl /api/v1/training/pretrain/jobs?status=training
```

### 5. Cancel or Delete

```bash
curl -X POST /api/v1/training/pretrain/jobs/{jobId}/cancel
curl -X DELETE /api/v1/training/pretrain/jobs/{jobId}
```

## Model Architectures

| Architecture | Description | Typical Size |
|-------------|-------------|--------------|
| `llama` | Meta LLaMA family | 125M–3B |
| `gpt2` | OpenAI GPT-2 | 125M–1.5B |
| `mistral` | Mistral AI | 125M–3B |
| `phi` | Microsoft Phi | 125M–2.7B |
| `mamba` | State-space model | 125M–2.8B |

## Learning Rate Schedules

- **cosine** (default): Cosine annealing from peak to near-zero
- **linear**: Linear decay from peak to zero
- **constant**: Fixed learning rate throughout
- **cosine_with_restarts**: Cosine with periodic warm restarts

## Job Status Lifecycle

`pending` → `validating` → `tokenizing` → `training` → `complete`

Jobs can transition to `failed` or `cancelled` from any active state.

## License

Pre-training requires an **enterprise** license (`adaptive_learning` feature).
