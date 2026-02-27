# ADR 150: Model Distillation Pipeline

**Date:** 2026-02-27
**Status:** Accepted
**Phase:** 64 — AI Training Pipeline

## Context

To improve local model quality for domain-specific tasks, users need to generate high-quality
training pairs. Raw conversation exports from Phase 62 provide user turns but the assistant
responses are from varying models and quality levels. Distillation — re-answering user prompts with
a powerful "teacher" model — produces consistent, high-quality training data.

## Decision

Add `DistillationManager` backed by `training.distillation_jobs` (migration 060):

- **CRUD**: `createJob`, `listJobs`, `getJob`, `cancelJob`, `deleteJob`
- **Worker**: `runJob(jobId, conversationStorage, teacherClient)` — iterates conversation history,
  calls the teacher LLM for each user turn, writes JSONL output (ShareGPT or instruction format)
- Progress is persisted every 10 samples via `samples_generated` column

REST routes at `/api/v1/training/distillation/jobs` (CRUD: POST/GET/GET/:id/DELETE/:id).

Dashboard `TrainingTab` gains a **Distillation** sub-tab (alongside Export and Fine-tune) with:
- Job creation form (teacher provider/model, format, max samples, output path)
- Job list with progress bar and status chips

The teacher client interface is minimal (`chat(messages) → { content }`), making it easy to wire
any AIClient provider as the teacher.

## Consequences

- Running a distillation job incurs real API costs proportional to `maxSamples`.
- Output JSONL is written to the server filesystem; the user provides the output path.
- Jobs can be cancelled mid-run; progress up to that point is preserved on disk.
