# ADR 006: Training & Evaluation

**Status**: Accepted

## Context

SecureYeoman accumulates conversation history, memories, and knowledge entries that hold significant value for training custom language models. Operators need a complete training lifecycle: exporting structured datasets from conversational data, generating high-quality training pairs through distillation, fine-tuning models with parameter-efficient methods, evaluating model quality with both automated metrics and LLM-as-judge techniques, analyzing conversation patterns for quality signals, managing the full model lifecycle from experiment to deployment, and running controlled A/B tests to compare model performance.

This ADR consolidates the architectural decisions governing the training and evaluation platform.

## Decisions

### Dataset Export

**Streaming Export Pipeline.** A training dataset export subsystem provides a streaming HTTP API, CLI command, and dashboard interface. Three export formats are supported: ShareGPT JSONL (recommended for chat fine-tuning), Alpaca instruction JSONL (supervised fine-tuning pairs), and raw text corpus (pre-training and contrastive training). The HTTP endpoint streams JSONL line-by-line to avoid buffering large datasets in memory.

**Filtering and Safety.** Exports support filtering by date range, personality ID, and a configurable row limit (maximum 100,000). Single-message conversations are skipped as they do not provide valid training pairs. A security policy gate (`allowTrainingExport`, default false) must be explicitly enabled by an administrator, and when disabled, the training interface is hidden entirely.

**Statistics Endpoint.** A stats endpoint returns row counts for conversations, memories, and knowledge entries so operators can assess dataset size before committing to an export.

### Distillation

**Teacher-Student Distillation.** The `DistillationManager` generates high-quality training pairs by re-answering user prompts from conversation history with a powerful teacher model. Jobs are backed by persistent storage with progress tracking (updated every 10 samples). Output is written in ShareGPT or instruction JSONL format. The teacher client interface is minimal, allowing any configured AI provider to serve as the teacher.

**Priority-Weighted Sampling.** A conversation quality scoring system assigns a `quality_score` (0 to 1) per conversation based on outcome success, presence of correction phrases, and injection patterns. Three priority modes are available: failure-first (ascending score, prioritizing high-training-value failures), success-first (descending score), and uniform (no prioritization, default). A background scorer processes new conversations on a 5-minute interval.

**Curriculum Ordering.** When enabled, conversations are binned into four stages by message count and processed quota-first, starting with the simplest interactions (25% allocation for conversations with 4 or fewer messages) before progressing to more complex ones.

**Counterfactual Synthetic Data.** Failed conversations can be re-submitted to the teacher model with a recovery system prompt, generating synthetic training samples tagged as such in the JSONL metadata. A configurable cap limits the number of synthetic samples generated.

**Personality Distillation.** A `distillPersonality()` method extracts the full effective runtime configuration of a personality into a portable markdown document, including the complete system prompt, bound skills, memory summary, integration bindings (credentials redacted), strategy configuration, and MCP tool schemas. A diff operation compares the static export against the distilled runtime state to surface accumulated drift. Distilled documents can be partially re-imported for prompt engineering and testing workflows.

### Fine-Tuning

**Docker Sidecar Architecture.** The `FinetuneManager` orchestrates LoRA and QLoRA fine-tuning via a dedicated Docker container based on PyTorch with CUDA support, containing Unsloth, PEFT, TRL, and BitsAndBytes. The manager writes a configuration file to a per-job workspace, launches the container with GPU access, monitors completion via Docker wait, and records adapter paths on success or error messages on failure.

**Log Streaming and Ollama Registration.** Real-time training log output is streamed via Docker log following. On successful completion, the manager can register the fine-tuned model with Ollama by writing a Modelfile and running the create command, closing the loop from training to serving.

**Configuration.** Job creation accepts base model, adapter name, dataset path, LoRA rank and alpha, batch size, epochs, and VRAM budget parameters.

### Evaluation & LLM-as-Judge

**Factored Tool-Call Metrics.** The evaluation manager computes four metrics: tool name accuracy (fraction selecting the correct tool), tool argument match (per-argument precision), outcome correctness (sandbox-verified end-state match when available), and semantic similarity (cosine similarity via embeddings when enabled).

**Pointwise LLM-as-Judge Evaluation.** An LLM judge rates each response on a 1-5 scale across five dimensions: groundedness (factual accuracy), coherence (logical structure), relevance (addressing the question), fluency (grammatical correctness), and harmlessness (absence of harmful content). Scores are stored per-sample and aggregated into evaluation run summaries.

**Pairwise Comparison.** Two models are evaluated side-by-side on the same dataset with randomized presentation order to mitigate position bias. The judge returns a winner (model A, model B, or tie) with reasoning. Results are persisted for analysis.

**Auto-Eval Deployment Gating.** When a fine-tuning job completes, an optional auto-eval callback runs pointwise evaluation against a configured dataset. If average groundedness or coherence falls below configurable thresholds, deployment is blocked and a notification is sent, reducing the risk of shipping degraded models.

**Versioned Evaluation Datasets.** Datasets are versioned via SHA-256 content hash, ensuring reproducible evaluation runs. Creating a dataset with identical samples returns the existing record.

### Conversation Analytics

**Sentiment Tracking.** Background LLM-based classification of assistant messages into positive, neutral, or negative with confidence scores, running on a 5-minute interval. Negative sentiment averages feed back into conversation quality scores for training priority.

**Engagement Metrics.** On-demand SQL queries compute average conversation length, follow-up rate, abandonment rate, and tool call success rate.

**Conversation Summarization.** Background LLM summaries for conversations exceeding a message threshold, running on a 10-minute interval.

**Entity Extraction.** Background LLM extraction of named entities (person, organization, technology) and key phrases, running on a 15-minute interval.

**Usage Anomaly Detection.** In-memory rate tracking detects message rate spikes, off-hours activity, and credential stuffing patterns, with persistent alert storage. The anomaly detector records each message in a fire-and-forget pattern from chat routes.

### Lifecycle Platform

**Preference Annotation for DPO.** A preference pair management system supports CRUD operations and JSONL export for Direct Preference Optimization training. Preference sources include manual annotation, side-by-side comparison, and multi-turn conversation extraction. A dedicated endpoint converts side-by-side winner ratings into preference pairs.

**Dataset Curation.** The dataset curator creates filtered, deduplicated snapshots from conversation data, joining conversation quality scores and applying token bounds, personality filters, date ranges, and tool-error exclusion rules.

**Experiment Registry.** A training run registry stores hyperparameters, appends loss curve data as JSONB, links evaluation metrics, and computes experiment diffs for comparison. The dashboard provides sortable tables, loss curve visualization, radar charts for evaluation dimensions, and diff views between experiments.

**Model Version Management.** Transactional deployment of models to personalities with Ollama alias creation, rollback support via stored previous model references, and version history tracking. One-click deploy and rollback operations are available through the dashboard.

**Live Training Observability.** An event emitter singleton receives throughput, agreement, loss, and reward events from the distillation manager, fine-tune manager, and training routes. An SSE endpoint forwards these events to connected browsers for real-time monitoring with rolling charts and KPI cards.

**Computer-Use Episode Management.** Storage for reinforcement learning state-action-reward tuples from desktop automation, with CRUD operations, per-skill breakdown, session statistics, and paginated JSONL export.

### A/B Testing

**Experiment Framework.** An experiment management system supports multiple variants (control plus treatments) with configurable traffic allocation and duration. Traffic routing uses deterministic hashing for consistent per-user assignment with sub-millisecond overhead.

**Model Shadow Routing.** A/B model tests inject model overrides into chat routes after request construction but before the LLM call, providing consistent per-conversation assignment. Quality score aggregation and winner evaluation enable data-driven model promotion decisions.

**Statistical Analysis.** Aggregated metrics (latency, cost, success rate) with statistical significance tests support data-driven model and configuration tuning. Sufficient task volume (100+ tasks per variant) is recommended for reliable results.

## Consequences

### Positive

- The closed local-AI training loop is fully supported: export conversations, train models, serve via Ollama, and connect back as a provider.
- Failure-first sampling reduces teacher-LLM API cost per quality improvement by focusing on high-value training examples.
- Factored tool-call metrics surface systematic tool-selection errors invisible to simple text similarity measures.
- LLM-as-judge evaluation provides structured quality signals across multiple dimensions with automated deployment gating.
- Full experiment lineage is queryable from hyperparameters through evaluation metrics to deployment.
- DPO fine-tuning is supported end-to-end from annotation through export to training.
- Model deployments are versioned with one-click rollback capability.
- Streaming export and live training observability handle arbitrarily large datasets and long-running jobs without memory pressure.
- Conversation analytics surface sentiment, engagement, and anomaly signals without external tools.

### Negative

- Distillation and LLM-as-judge evaluation incur real API costs proportional to dataset size.
- Fine-tuning requires NVIDIA GPU hardware with Docker CUDA support; jobs fail without GPU access.
- The conversation quality background scorer must run before priority sampling benefits take effect; unscored conversations default to a neutral 0.5 score.
- Judge model quality directly affects evaluation reliability; lower-quality judges produce less trustworthy ratings.
- In-memory anomaly detection state is lost on restart, though generated alerts are persisted.
- Character-level similarity serves as a proxy metric for basic evaluation; full BLEU/ROUGE scoring is available as an extension point but not included by default.
- Counterfactual data generation increases teacher-LLM cost and must be capped to control spend.
