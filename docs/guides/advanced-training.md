# Advanced Training Guide

This guide covers DPO/RLHF alignment training, hyperparameter search, checkpoint management, and multi-GPU setup introduced in Phase 131.

## Prerequisites

- NVIDIA GPU with CUDA support and Docker GPU runtime configured
- Training Docker sidecar image built (`secureyeoman-train:latest`)
- Preference dataset exported (for DPO/RLHF) via the dataset curation API

## Training Methods

The `method` field on finetune job creation selects the training approach:

| Method     | Use Case                          | Dataset Format         |
|------------|-----------------------------------|------------------------|
| `sft`      | Supervised fine-tuning            | ShareGPT / Alpaca JSONL|
| `dpo`      | Direct preference optimization    | Preference pairs JSONL |
| `rlhf`     | Reinforcement learning from HF    | Preference pairs JSONL |
| `reward`   | Reward model training             | Preference pairs JSONL |
| `pretrain` | Continued pre-training            | Raw text corpus        |

## DPO Training

### 1. Prepare Preference Data

Export preference pairs via the API:

```
POST /training/preferences/export
{
  "format": "jsonl",
  "personalityId": "default"
}
```

Each line contains `prompt`, `chosen`, and `rejected` fields.

### 2. Create DPO Job

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

### 3. Monitor

```
GET /training/finetune/{jobId}/logs
```

Logs stream in real-time. The dashboard Training tab shows loss curves.

## RLHF Training

RLHF requires two stages:

### Stage 1: Train Reward Model

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

### Stage 2: Run PPO

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

## Hyperparameter Search

### Define Search Space

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

### View Results

```
GET /training/hyperparameter-search/{searchId}
```

Returns all child jobs with their eval metrics. The `bestJobId` field indicates the top performer.

## Checkpoint Management

### Configuration

Checkpoints are enabled by default. Control the interval in the job config:

```json
{
  "checkpointSteps": 500,
  "maxCheckpoints": 5
}
```

When `maxCheckpoints` is reached, the oldest checkpoint (excluding the best by validation loss) is deleted.

### List Checkpoints

```
GET /training/finetune/{jobId}/checkpoints
```

Returns an array of `{ step, trainLoss, valLoss, adapterPath, createdAt }`.

### Resume from Checkpoint

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

### Promote Checkpoint

Deploy an intermediate checkpoint as the final adapter:

```
POST /training/finetune/{jobId}/checkpoints/{step}/promote
```

This registers the checkpoint adapter with Ollama and updates the job record.

## Multi-GPU Setup

### Configuration

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

### Verify GPU Availability

```
GET /training/gpu-status
```

Returns detected GPUs with memory usage, helping operators plan device allocation.

### CLI Usage

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
