# ADR 012: Operations & Lifecycle

## Status

Accepted

## Context

This ADR consolidates operational decisions governing the CLI experience, audio pipeline, audit log export, and job completion notifications.

## Decisions

### CLI

**Shell Completions.** `secureyeoman completion <shell>` prints static completion scripts for bash, zsh, and fish. Full command/subcommand/flag map embedded. No runtime introspection required.

**Configuration Validation.** `secureyeoman config validate` provides pass/fail check: validates structure, checks required secrets, reports with colored markers, exits 0/1, supports `--json`.

**Plugin Management.** `secureyeoman plugin` with `list`, `info`, `add`, `remove` actions. Validates plugin exports (`platform`, `createIntegration`) on add. Restart required after changes.

**Rich Output.** `colorContext(stream)` respects NO_COLOR standard and TTY detection. Minimal braille spinner animation. All commands support `--json` for scripting.

### Audio

**Streaming TTS.** `POST /api/v1/multimodal/audio/speak/stream` returns raw binary audio, eliminating ~33% base64 inflation. `Content-Type` per format, `X-Duration-Ms` header. Original `/speak` preserved.

**Audio Validation.** `validateAudioBuffer()` before STT: universal 1,000-byte minimum, WAV-specific header parse (channels, sample rate, duration 2-30s, RMS/peak thresholds). Compressed formats receive size check only.

**Runtime Whisper Model Selection.** Priority chain: `WHISPER_MODEL` env var, `prefsStorage` key, config default. `PATCH /api/v1/multimodal/model` enables runtime changes.

### Audit Export

`POST /api/v1/audit/export` streams audit data via `reply.raw.write()` with no full-dataset buffering. Formats: JSONL, CSV, syslog RFC 5424. Filtering by date range, level, event, user, limit (cap: 1 million). `Content-Disposition: attachment` with appropriate MIME type.

### Notifications

**Job Completion Notifications.** `emitJobCompletion()` builds synthetic metric snapshots using `jobs.<type>.<status>.<field>` namespace and passes to `alertManager.evaluate()`. Reuses existing metric path resolution and comparison. Failed jobs include `error: 1` sentinel.

**ntfy Channel.** Fifth alert channel alongside Slack, PagerDuty, OpsGenie, webhook. Plain-text POST with `Title`, `Priority`, `Tags` headers. Optional Bearer authentication.

**Dashboard Templates.** Seven pre-built rule templates across Workflows, Training, and Security categories via "From template" dropdown.

### Responsible AI (Phase 130)

**Cohort Error Analysis.** `POST /api/v1/responsible-ai/cohort-analysis` slices eval run results by dimension (topic_category, user_role, time_of_day, personality_id, model_name, language, custom). Groups eval scores, computes per-cohort error rates (avg < 3.0 = error), sorts worst-first. Stored in `responsible_ai.cohort_analyses` with JSONB slices.

**Fairness Metrics.** `POST /api/v1/responsible-ai/fairness` computes demographic parity (max positive-rate difference), equalized odds (max TPR difference), and disparate impact ratio (min/max positive-rate). Threshold defaults to 0.8 (four-fifths rule). Stored in `responsible_ai.fairness_reports`.

**SHAP Token Attribution.** `POST /api/v1/responsible-ai/shap` computes leave-one-out perturbation-based attributions for each input token. Optionally uses AI client for scoring; falls back to length-based heuristic. Normalized to sum 1.0. Stored in `responsible_ai.shap_explanations`.

**Data Provenance.** Tracks every conversation's inclusion/exclusion in training datasets. Four statuses: included, filtered (with reason), synthetic, redacted. Batch insert for curation pipelines. `GET /provenance/user/:id` answers "was this user's data used in training?" `POST /provenance/redact/:id` marks records as redacted for GDPR right-to-erasure. Stored in `responsible_ai.provenance_entries`.

**Model Cards.** Auto-generated structured cards aligned with Hugging Face Model Card format and EU AI Act transparency requirements. Includes: intended use, limitations, ethical considerations, training data summary, evaluation results, fairness assessment, risk classification (minimal/limited/high/unacceptable). Markdown rendering via `GET /model-cards/:id/markdown`. Stored in `responsible_ai.model_cards`.

**RBAC.** `responsible_ai` resource added to PREFIX_RESOURCE_MAP. Operator: read+write. Auditor: read-only.

## Consequences

**Positive:**
- Shell completions and `--json` output enable scripting and CI/CD integration.
- Streaming audit export handles millions of entries without OOM.
- Job notifications reuse existing alert infrastructure with zero changes to evaluation loop.
- ntfy provides lightweight self-hosted push notifications.

**Negative:**
- Plugin hot-reload not supported; install-then-restart required.
- WAV-only structural audio validation; compressed format validation deferred.
- Two TTS endpoints exist; clients must choose based on needs.
