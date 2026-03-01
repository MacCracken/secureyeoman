# Adaptive Learning Pipeline Guide (Phase 92)

SecureYeoman's Phase 92 Adaptive Learning Pipeline adds four capabilities to the existing
distillation/fine-tuning system: priority-weighted sampling, factored tool-call evaluation,
counterfactual data generation, and a live training stream with dashboard observability.

---

## Priority-Weighted Distillation Sampling

### Configuration

When creating a distillation job via the API or dashboard, three new fields control sampling:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `priorityMode` | `'uniform' \| 'failure-first' \| 'success-first'` | `'uniform'` | Sampling order |
| `curriculumMode` | boolean | `false` | Stage-based ordering (simple → complex) |
| `counterfactualMode` | boolean | `false` | Generate synthetic recovery examples |
| `maxCounterfactualSamples` | number | `50` | Cap on synthetic samples per job |

### Failure-first mode

Conversations with lower quality scores (closer to 0.0) are sampled first. This ensures
the teacher LLM focuses on conversations where the system performed poorly.

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

### Curriculum mode

Conversations are processed in four stages:
1. **Stage 1** (≤4 messages, 25% of quota) — basic single-turn interactions
2. **Stage 2** (5–10 messages) — multi-turn dialogues
3. **Stage 3** (11–20 messages) — longer conversations
4. **Stage 4** (>20 messages) — complex multi-step interactions

Enable by setting `curriculumMode: true`.

### Counterfactual generation

When `counterfactualMode: true`, the job also re-submits the final user turn from failed
conversations to the teacher with a recovery prompt:

> "You are helping generate ideal training data. Given this conversation that ended poorly,
> provide the ideal assistant response for the final user turn."

Synthetic samples are tagged `"synthetic": true` in JSONL metadata.

---

## Conversation Quality Scoring

SecureYeoman automatically scores new conversations every 5 minutes using:

```
score = 0.5
      - 0.30  if pipeline outcome = failed
      - 0.15  per correction phrase found in user messages
                ("that's wrong", "try again", "no,", "incorrect", etc.)
      - 0.10 × (injection_score - 0.5)  when injection_score > 0.5
score = clamp(score, 0.0, 1.0)
```

**Lower score = higher training priority** in failure-first mode.

### Manual scoring trigger

```bash
POST /api/v1/training/quality/score
→ { "scored": 42 }
```

### View quality scores

```bash
GET /api/v1/training/quality?limit=100
→ { "conversations": [ { "conversationId", "qualityScore", "signalSource", "scoredAt" } ] }
```

---

## Factored Tool-Call Evaluation

### Extended metrics

Running `EvaluationManager.runEvaluation()` now returns:

| Metric | Description |
|--------|-------------|
| `exact_match` | Fraction of exact-string matches |
| `char_similarity` | Char-level Jaccard similarity (existing) |
| `tool_name_accuracy` | Fraction with correct tool selected |
| `tool_arg_match` | Average per-argument precision |
| `outcome_correctness` | Sandbox end-state match (optional) |
| `semantic_similarity` | Ollama embedding cosine similarity (optional) |

### Semantic similarity (optional)

Requires a running Ollama instance with `nomic-embed-text` model:

```typescript
const result = await evalManager.runEvaluation({
  samples,
  modelFn,
  semanticSimilarity: true,
  ollamaEmbedUrl: 'http://localhost:11434',
});
```

### Outcome correctness (optional)

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

## Live Training Stream

### SSE endpoint

Connect to `GET /api/v1/training/stream` to receive real-time events:

```typescript
const es = new EventSource('/api/v1/training/stream?token=...');
es.onmessage = (evt) => {
  const { type, value, ts } = JSON.parse(evt.data);
  // type: 'loss' | 'throughput' | 'agreement' | 'reward'
};
```

### Event types

| Type | Source | Description |
|------|--------|-------------|
| `loss` | FinetuneManager | Parsed from container log lines containing `loss:` |
| `throughput` | DistillationManager | Samples/min, emitted every 10 samples |
| `agreement` | DistillationManager | Average char-Jaccard vs gold, every 10 samples |
| `reward` | Training routes | Emitted on each computer-use episode record |

### Dashboard Live tab

The **Live** sub-tab in the Training section shows:
- Rolling loss chart (last 200 points)
- Reward trend chart
- Throughput KPI card (samples/min)
- Agreement rate KPI card
- Quality heatmap grid (red = needs training, green = well covered)

---

## Computer Use Episodes

The Tauri desktop client can record RL training episodes for computer-use skill automation.

### Recording an episode

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

### Listing episodes

```bash
GET /api/v1/training/computer-use/episodes?skillName=fill-form&limit=50
```

### Skill breakdown stats

```bash
GET /api/v1/training/computer-use/stats
→ {
    "skillBreakdown": [
      { "skillName": "click", "episodeCount": 42, "successRate": 0.88, "avgReward": 0.76 }
    ],
    "totals": { "totalEpisodes": 42, "avgReward": 0.76 }
  }
```

### Export for offline RL training

```bash
POST /api/v1/training/export
{ "format": "computer_use" }

→ JSONL stream, one episode per line:
{"format":"computer_use","id":"...","session_id":"...","skill_name":"...","state":{...},"action":{"type":"click","target":"#btn","value":""},"reward":1.0,"done":true,"created_at":"..."}
```

### Deleting an episode

```bash
DELETE /api/v1/training/computer-use/episodes/:id
```

---

## Dashboard

### Training → Distillation tab

The create-job form now includes:
- **Priority Mode** — dropdown (Uniform / Failure-first / Success-first)
- **Curriculum mode** — checkbox
- **Counterfactual mode** — checkbox + max samples input

### Training → Live tab

Real-time charts powered by recharts + SSE. Shows loss, reward, throughput, agreement,
and quality heatmap.

### Training → Computer Use tab

- Stat cards (total episodes, avg reward, skill count)
- Skill breakdown table
- Session replay viewer (filter by session ID, view ordered action list with reward chips)

### Fine-tune tab — Eval Radar

After running an evaluation, the `EvalResultRadarCard` displays a radar chart with four
axes: Tool Name Accuracy, Tool Args Match, Semantic Similarity, Char Similarity.

---

## Environment Variables

No new required env vars. The quality scorer runs automatically. Ollama semantic similarity
requires `ollamaEmbedUrl` to be passed in the API call (not a global env var).

Computer-use episode storage requires no additional configuration beyond existing Postgres.
