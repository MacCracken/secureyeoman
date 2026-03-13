# Responsible AI Guide

> Phase 130 — Cohort error analysis, fairness metrics, SHAP explainability, data provenance audit, and model card generation.

SecureYeoman's Responsible AI module provides enterprise governance, EU AI Act compliance, and transparency tooling for deployed AI models. Inspired by Azure Responsible AI Dashboard and Google Vertex AI Explainability.

---

## Features

### 1. Cohort-Based Error Analysis

Slice evaluation results by conversation metadata to identify systematic failures in specific subgroups.

**Supported dimensions:**
- `topic_category` — Error rates by topic
- `user_role` — Performance by user role
- `time_of_day` — Temporal patterns (morning/afternoon/evening/night)
- `personality_id` — Per-personality performance
- `model_name` — Cross-model comparison
- `language` — Multi-language performance
- `custom` — Any metadata key

**API:**
```bash
# Run cohort analysis on an eval run
POST /api/v1/responsible-ai/cohort-analysis
{
  "evalRunId": "run-123",
  "datasetId": "ds-456",
  "dimension": "model_name"
}

# Get results
GET /api/v1/responsible-ai/cohort-analysis/:id
GET /api/v1/responsible-ai/cohort-analysis?evalRunId=run-123
```

Slices are sorted by error rate descending — worst-performing cohorts appear first.

### 2. Fairness Metrics

Compute parity metrics for any evaluation dataset with demographic metadata.

**Metrics computed:**
- **Demographic Parity** — Max difference in positive rates across groups
- **Equalized Odds** — Max difference in true positive rates across groups
- **Disparate Impact Ratio** — Ratio of min to max positive rate (four-fifths rule)

**API:**
```bash
POST /api/v1/responsible-ai/fairness
{
  "evalRunId": "run-123",
  "datasetId": "ds-456",
  "protectedAttribute": "gender",
  "threshold": 0.8
}
```

The default threshold follows the **four-fifths rule** (0.8): if the selection rate for any protected group is less than 80% of the highest-rate group, the model fails the fairness check.

### 3. SHAP Token Attribution

Approximate Shapley values for input tokens using leave-one-out perturbation. Each token's attribution measures how much removing it changes the model's output quality.

**API:**
```bash
POST /api/v1/responsible-ai/shap
{
  "modelName": "claude-sonnet-4-6",
  "prompt": "Explain quantum computing",
  "response": "Quantum computing uses...",
  "dimension": "groundedness"
}
```

Returns normalized token attributions (sum to 1.0). Positive attribution = token improves the score; negative = token hurts it.

### 4. Data Provenance Audit

Track the lineage of every conversation included in (or excluded from) training datasets.

**Entry statuses:**
- `included` — Used in training
- `filtered` — Excluded with reason (e.g., `low_quality`, `duplicate`, `short_conversation`)
- `synthetic` — Synthetically generated data
- `redacted` — Removed via GDPR erasure request

**API:**
```bash
# Query provenance entries
GET /api/v1/responsible-ai/provenance?datasetId=ds-456&status=filtered

# Get summary for a dataset
GET /api/v1/responsible-ai/provenance/summary/ds-456

# Check if a user's data was used in training
GET /api/v1/responsible-ai/provenance/user/user-789

# GDPR right-to-erasure
POST /api/v1/responsible-ai/provenance/redact/user-789
```

### 5. Model Cards

Auto-generate structured model cards aligned with the Hugging Face Model Card format and EU AI Act transparency requirements.

**API:**
```bash
# Generate a model card
POST /api/v1/responsible-ai/model-cards
{
  "personalityId": "p-1",
  "modelName": "claude-sonnet-4-6",
  "intendedUse": "Customer support chatbot",
  "limitations": "May hallucinate product details",
  "riskClassification": "limited"
}

# Get as JSON
GET /api/v1/responsible-ai/model-cards/:id

# Get as Markdown (Hugging Face format)
GET /api/v1/responsible-ai/model-cards/:id/markdown

# Find by personality
GET /api/v1/responsible-ai/model-cards/by-personality/:personalityId
```

**EU AI Act Risk Classifications:**
- `minimal` — No restrictions
- `limited` — Transparency obligations (default)
- `high` — Conformity assessment required
- `unacceptable` — Prohibited

---

## Database Schema

All data stored in the `responsible_ai` PostgreSQL schema:

| Table | Purpose |
|-------|---------|
| `cohort_analyses` | Cohort error analysis results |
| `fairness_reports` | Fairness metric computations |
| `shap_explanations` | Token attribution results |
| `provenance_entries` | Data lineage records |
| `model_cards` | Model card documents |

---

## RBAC

- **Admin / Operator**: Full read/write access to all Responsible AI endpoints
- **Auditor**: Read-only access to all Responsible AI data
- Resource: `responsible_ai`, actions: `read`, `write`

---

## Related

- [ADR 012: Operations & Lifecycle](../adr/012-operations-and-lifecycle.md)
- [Training & ML Guide](./training-ml.md)
- [EU AI Act Overview](https://artificialintelligenceact.eu/)
