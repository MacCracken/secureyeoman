# ADR 146: Training Dataset Export

**Date:** 2026-02-27
**Status:** Accepted
**Phase:** 62 — Local-First AI

## Context

The system accumulates conversation history, memories, and knowledge entries that have value for training custom LLMs and embedding models. Users want to fine-tune models on their own conversational data to create more personalised AI experiences. The "local-first AI" roadmap requires exporting structured datasets compatible with modern fine-tuning frameworks (LLaMA Factory, Unsloth, sentence-transformers).

## Decision

Implement a training dataset export subsystem with a streaming HTTP API, a CLI command, and a dashboard UI in the Developer page.

**Key design choices:**

1. **Three export formats:** ShareGPT JSONL (recommended for chat fine-tuning), Alpaca instruction JSONL (SFT pairs), Raw text corpus (pre-training and SimCSE contrastive training).
2. **Streaming HTTP endpoint:** `POST /api/v1/training/export` uses `reply.raw.write()` to stream JSONL line-by-line, avoiding buffering large datasets in memory. Follows the same pattern as `audit-export-routes.ts`.
3. **Stats endpoint:** `GET /api/v1/training/stats` returns `{ conversations, memories, knowledge }` row counts so the UI can inform users how much data is available before exporting.
4. **Security policy gate:** `allowTrainingExport` (default `false`) — training export is disabled by default; an admin enables it via Security settings. When `false`, the Training tab is hidden from `DeveloperPage` entirely.
5. **CLI command:** `secureyeoman training export [--format] [--out] [--from] [--to] [--personality-id] [--limit]` streams the HTTP response to stdout or writes to a file, enabling piping directly into local training scripts.
6. **TrainingTab in DeveloperPage:** Shows stats cards (conversations, memories, knowledge row counts), a format selector with descriptions, a limit input, a download button, and a "Local Training Pipeline" guide covering the five-step loop: export → sentence-transformers → Unsloth/LLaMA Factory → Ollama → connect back as provider.
7. **Filtering:** By date range (`from`/`to` as millisecond timestamps), by `personalityId` (repeatable query param), and a `limit` cap of at most 100,000 rows to prevent runaway exports.
8. **Minimum conversation length:** Single-message conversations (fewer than 2 messages) are skipped during export, as they do not provide valid training pairs.

## Consequences

- Enables the closed local-AI training loop: export conversations → train models → serve via Ollama → connect back as a provider.
- Default-disabled policy (`allowTrainingExport: false`) prevents accidental data exposure in shared or public deployments.
- Streaming means arbitrarily large datasets can be exported without out-of-memory errors on the server.
- ShareGPT format is compatible with the widest range of fine-tuning frameworks (LLaMA Factory, Unsloth, axolotl).
- CLI streaming allows the output to be piped directly into local training scripts without intermediate files.
- Stats endpoint gives users visibility into dataset size before committing to a potentially long export.
