# Training Dataset Export Guide

Export your SecureYeoman conversation history, memories, and knowledge entries as structured datasets for fine-tuning local LLMs and embedding models.

---

## Overview

SecureYeoman accumulates rich conversational data as you interact with your AI personalities. The training export feature lets you turn that data into fine-tuning datasets compatible with:

- **LLaMA Factory** and **Unsloth** for chat model fine-tuning
- **sentence-transformers** for custom embedding models
- **Pre-training corpora** for continued pre-training or SimCSE contrastive training

The result is a closed local-AI loop: your own conversations train models that understand your domain, those models are served via Ollama, and Ollama is connected back as a provider in SecureYeoman.

---

## Prerequisites

1. **Enable training export** in Security settings:
   - Navigate to **Settings → Security → Policy Toggles**
   - Enable **Allow Training Export**
   - Without this, the Training tab is hidden and the API returns `403`

2. **Have conversations.** The export skips single-message conversations (fewer than 2 messages), so you need at least some back-and-forth history.

3. For local training you will need Python 3.10+, and optionally Ollama installed locally.

---

## Export Formats

### ShareGPT JSONL (recommended for chat fine-tuning)

Each line is a JSON object with a `conversations` array of `{ from, value }` turns. This is the most widely supported format for instruction-tuned chat models.

```jsonl
{"conversations":[{"from":"human","value":"What is the capital of France?"},{"from":"gpt","value":"The capital of France is Paris."}]}
{"conversations":[{"from":"human","value":"Summarise this document for me."},{"from":"gpt","value":"Sure. The document describes..."}]}
```

Compatible with: LLaMA Factory, Unsloth, axolotl.

### Instruction JSONL (Alpaca / SFT pairs)

Each line is a JSON object with `instruction`, `input`, and `output` fields. Useful when conversations map cleanly to a single instruction-response pair.

```jsonl
{"instruction":"Translate to French","input":"Hello, how are you?","output":"Bonjour, comment allez-vous ?"}
{"instruction":"Write a Python function","input":"that reverses a string","output":"def reverse(s):\n    return s[::-1]"}
```

Compatible with: Alpaca-style trainers, LLaMA Factory, Unsloth.

### Raw Text Corpus

Each line is a plain-text block of the full conversation, separated by blank lines between conversations. Useful for continued pre-training or SimCSE contrastive learning on raw text.

```
User: What is the capital of France?
Assistant: The capital of France is Paris.

User: Summarise this document for me.
Assistant: Sure. The document describes...
```

Compatible with: sentence-transformers (SimCSE), any pre-training pipeline that ingests plain text.

---

## Using the Dashboard

1. Open **Developers** in the sidebar.
2. Click the **Training** tab (only visible when `allowTrainingExport` is enabled).
3. The stats cards show how many conversations, memories, and knowledge entries are available.
4. Choose a **Format** (ShareGPT JSONL, Instruction JSONL, or Raw Text).
5. Optionally set a **Limit** (max 100,000 rows) and a **date range**.
6. Click **Download** — the browser will stream and save the file.

The Training tab also displays a Local Training Pipeline guide summarising the five-step loop described in the section below.

---

## Using the CLI

The `secureyeoman training export` command streams the dataset to stdout or writes it to a file.

### Flags

| Flag | Description | Default |
|---|---|---|
| `--format` | `sharegpt`, `alpaca`, or `raw` | `sharegpt` |
| `--out` | Output file path. Omit to stream to stdout | stdout |
| `--from` | Start timestamp (milliseconds since epoch) | none |
| `--to` | End timestamp (milliseconds since epoch) | none |
| `--personality-id` | Filter by personality UUID (repeatable) | all |
| `--limit` | Maximum number of conversations to export (max 100,000) | 10,000 |

### Examples

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

---

## Local Training Pipeline

The recommended five-step loop for training local models on your exported data.

### Step 1: Export Conversations

```bash
secureyeoman training export --format sharegpt --out ~/training/dataset.jsonl
```

Check how many lines you have:

```bash
wc -l ~/training/dataset.jsonl
```

A dataset of 1,000+ conversations is enough to meaningfully shift model behaviour on a domain-specific task.

### Step 2: Train an Embedding Model with sentence-transformers

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

- `BAAI/bge-small-en-v1.5` — compact, fast, strong retrieval
- `thenlper/gte-base` — good multilingual coverage
- `intfloat/e5-base-v2` — strong zero-shot retrieval

### Step 3: Fine-tune a Chat Model

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

### Step 4: Serve via Ollama

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

### Step 5: Connect Back to SecureYeoman

**Chat model:** In Settings → Models, set the provider to Ollama and select `my-finetuned-model` as the default model for the relevant personality.

**Embedding model:** In Settings → Brain → Vector Memory, set the API Provider to Ollama and set the Model field to `my-embedding-model`. See the [Ollama Embedding Provider Guide](./ollama-embeddings.md) for full configuration details.

Your conversations now improve the very models that power future conversations.

---

## Embedding Training Approaches

| Approach | Use Case | Loss Function | Base Model |
|---|---|---|---|
| Multiple Negatives Ranking | Dense retrieval, semantic search | `MultipleNegativesRankingLoss` | all-MiniLM-L6-v2, GTE, E5 |
| SimCSE (unsupervised) | Pre-training on raw corpus, no labels needed | `MultipleNegativesRankingLoss` with dropout augmentation | any BERT-style model |
| NLI fine-tuning | Entailment-aware similarity | `SoftmaxLoss` | roberta-base |
| PEFT / LoRA | Parameter-efficient chat model tuning | Cross-entropy (SFT) | LLaMA 3, Mistral, Gemma |

For most users, the Multiple Negatives Ranking approach in Step 2 is the best starting point — it requires no labelled data beyond the conversation pairs themselves.

---

## API Reference

### POST /api/v1/training/export

Streams a JSONL (or plain text) dataset. Requires `allowTrainingExport` to be enabled.

**Request body:**

```json
{
  "format": "sharegpt",
  "limit": 10000,
  "from": 1706745600000,
  "to": 1709424000000,
  "personalityIds": ["7f3a1c2d-..."]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `format` | `"sharegpt" \| "alpaca" \| "raw"` | No | Default: `sharegpt` |
| `limit` | `number` | No | Max 100,000. Default: 10,000 |
| `from` | `number` | No | Start timestamp in milliseconds |
| `to` | `number` | No | End timestamp in milliseconds |
| `personalityIds` | `string[]` | No | Filter by personality UUIDs |

**Response:** `200 OK` with `Content-Type: application/x-ndjson` (or `text/plain` for `raw`), streamed line by line.

**Error responses:**

| Status | Reason |
|---|---|
| `403 Forbidden` | `allowTrainingExport` is disabled |
| `400 Bad Request` | Invalid format or limit exceeds 100,000 |

### GET /api/v1/training/stats

Returns dataset size counts. Requires `allowTrainingExport` to be enabled.

**Response:**

```json
{
  "conversations": 1842,
  "memories": 9341,
  "knowledge": 523
}
```

| Field | Description |
|---|---|
| `conversations` | Total conversation threads in the database |
| `memories` | Total memory entries |
| `knowledge` | Total knowledge base entries |
